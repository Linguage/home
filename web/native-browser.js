// Use only a main-approved desktop guest; no page scripts run in the workbench.
export function webUrl(value, origin) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.origin === origin) return null;
    return url.href;
  } catch { return null; }
}

export function pageSnapshot() {
  const content = document.querySelector('article, main, [role="main"]') || document.body;
  const text = (content?.innerText || '').trim();
  const selection = document.getSelection()?.toString().trim().slice(0, 1800) || '';
  return { title: document.title.slice(0, 250), text: text.slice(0, 12000), selection, partial: text.length > 12000 };
}

export function mountNativeBrowser({ host, bridge, url, origin, onChange, theme = 'light', createView = () => document.createElement('webview') }) {
  const initial = webUrl(url, origin);
  if (!initial) throw Error('无法打开该网页地址。');
  let navigationRevision = 0;
  let currentTheme = theme === 'dark' ? 'dark' : 'light', themeRevision = 0, themeCss;
  let disposed = false, reservation, released = false, view, unsubscribe, started = false, historyReady = false;
  const events = new AbortController();
  const state = { url: initial, loading: true, back: false, forward: false, error: '' };
  const update = changes => { if (!disposed) { Object.assign(state, changes); onChange({ ...state }); } };
  const release = () => {
    if (reservation && !released) { released = true; void Promise.resolve(bridge.release(reservation.lease)).catch(() => {}); }
  };
  const fail = () => update({ loading: false, error: '网页未能载入，请重试或在系统浏览器打开。' });
  async function applyTheme() {
    if (disposed || !started) return;
    const revision = ++themeRevision;
    try {
      // User-origin defaults theme browser-owned XML/text pages without replacing
      // an author's explicit page colors or changing the host's global theme.
      const key = await view.insertCSS(`:root { color-scheme: ${currentTheme} !important; } :root, body { background-color: Canvas; color: CanvasText; }`, { cssOrigin: 'user' });
      if (disposed || revision !== themeRevision) { await view.removeInsertedCSS(key); return; }
      const previous = themeCss; themeCss = key;
      if (previous) await view.removeInsertedCSS(previous);
    } catch { /* A navigation can destroy the old document during theme updates. */ }
  }
  function navigate(value) {
    const next = webUrl(value, origin);
    if (disposed || !view || !next) return;
    navigationRevision++;
    update({ url: next, loading: true, error: '' });
    try { void Promise.resolve(view.loadURL(next)).catch(fail); } catch { fail(); }
  }
  function observe(event) {
    if (disposed || event?.isMainFrame === false) return;
    try {
      // Electron's navigation event is authoritative for SPA history changes;
      // getURL() can still expose the previous document at this boundary.
      const current = webUrl(event?.url, origin) ?? (historyReady ? state.url : webUrl(view.getURL(), origin));
      if (!current) return;
      if (current !== state.url) navigationRevision++;
      if (!historyReady && event?.type === 'did-navigate') { view.clearHistory(); historyReady = true; }
      update({ url: current, loading: view.isLoading(), back: historyReady && view.canGoBack(), forward: historyReady && view.canGoForward() });
    } catch { /* The guest can disappear between its final event and release. */ }
  }
  const ready = (async () => {
    reservation = await bridge.acquire('session:linguista-web');
    if (disposed) { release(); return; }
    view = createView();
    view.setAttribute('name', reservation.lease);
    view.setAttribute('partition', reservation.partition);
    view.setAttribute('allowpopups', '');
    view.setAttribute('src', 'about:blank#' + reservation.lease);
    view.setAttribute('aria-label', '原站网页');
    view.addEventListener('dom-ready', () => {
      if (disposed) return;
      if (!started) { started = true; navigate(initial); } else { observe(); void applyTheme(); }
    }, { signal: events.signal });
    for (const name of ['did-navigate', 'did-navigate-in-page', 'did-stop-loading']) view.addEventListener(name, observe, { signal: events.signal });
    view.addEventListener('did-start-loading', () => update({ loading: true, error: '' }), { signal: events.signal });
    view.addEventListener('did-fail-load', event => { if (event.isMainFrame && event.errorCode !== -3) fail(); }, { signal: events.signal });
    unsubscribe = bridge.onOpenRequested(reservation.lease, navigate);
    host.append(view);
  })().catch(() => { view?.remove(); release(); fail(); });
  function move(direction) {
    if (disposed || !view || !historyReady) return;
    try { if (direction === 'back' ? view.canGoBack() : view.canGoForward()) view[direction === 'back' ? 'goBack' : 'goForward'](); } catch { fail(); }
  }
  return {
    ready, navigate,
    setTheme(value) { currentTheme = value === 'dark' ? 'dark' : 'light'; return applyTheme(); },
    async snapshot() {
      await ready;
      if (disposed || !view || !started) throw Error('请等待网页载入后重试。');
      const revision = navigationRevision, current = state.url;
      const data = await view.executeJavaScript('(' + pageSnapshot.toString() + ')()');
      if (disposed || revision !== navigationRevision) throw Error('网页已切换，请重新打开伴读。');
      if (!data || typeof data.text !== 'string' || !data.text.trim()) throw Error('当前网页没有可读取的正文。');
      return { ...data, url: current, source: 'web', edition: '网页正文' };
    },
    back: () => move('back'), forward: () => move('forward'),
    reload() { if (!disposed && view && started) { update({ loading: true, error: '' }); try { view.reload(); } catch { fail(); } } },
    dispose() { if (disposed) return; disposed = true; events.abort(); unsubscribe?.(); view?.remove(); release(); },
  };
}
