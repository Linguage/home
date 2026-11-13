window.__ModuleLoader__.load({
  id: 'dsh-linguista',
  factory: require => {
    const React = require('react'), h = React.createElement;
    const buildQuery = '?v=2ee42889b96343bc';
    const readingChannel = 'dsh-linguista-reading', browserChannel = 'dsh-linguista-browser';
    const moduleAt = name => import(new URL('/linguista/' + name + buildQuery, window.location.href).href);
    let browserModule, readingModule;
    const loadBrowser = () => browserModule ??= moduleAt('native-browser.js');
    const loadReading = () => readingModule ??= moduleAt('reader-ai.js');
    const preferenceKey = 'linguista-plugin-settings-v1';
    let preferences = { aiEnabled: true, theme: 'auto', browser: 'plugin', sidebar: true };
    const preferenceListeners = new Set();
    const notifyPreferences = () => preferenceListeners.forEach(listener => listener());
    const subscribePreferences = listener => { preferenceListeners.add(listener); return () => preferenceListeners.delete(listener); };
    const preferenceSnapshot = () => preferences;
    let normalizer;
    const readPreferences = () => {
      try { preferences = normalizer(JSON.parse(localStorage.getItem(preferenceKey) || 'null'), localStorage.getItem('linguista-workbench-theme')); }
      catch { preferences = normalizer(null); }
      notifyPreferences();
    };
    function updatePreferences(fields) {
      preferences = { ...preferences, ...fields };
      let saved = true;
      try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { saved = false; }
      notifyPreferences(); return saved;
    }
    function usePreferences() {
      return React.useSyncExternalStore(subscribePreferences, preferenceSnapshot);
    }
    function Icon(props) {
      return h('img', { src: '/linguista/assets/linguista/linguista-logo.svg', alt: '', width: props?.size || 20, height: props?.size || 20, style: { display: 'block', objectFit: 'contain' } });
    }
    function Discussion({ renderFactorySlot }) {
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
        slots: { views: ({ renderSlot }) => renderSlot('conversation.session', { view: 'chat' }) },
      });
    }
    function UiIcon({ name }) {
      const paths = {
        settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
        auto: 'M4 4h16v12H4zM8 20h8m-4-4v4',
        light: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        dark: 'M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z',
        plugin: 'M3 4h18v16H3zM3 8h18M7 6h.01M10 6h.01',
        system: 'M3 4h18v13H3zM8 21h8m-4-4v4',
        reading: 'M12 5v15M12 5C8 2 5 3 3 4v15c3-2 6-2 9 1 3-3 6-3 9-1V4c-2-1-5-2-9 1Z',
      };
      return h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true }, h('path', { d: paths[name] }));
    }
    function Settings({ settings, active }) {
      const [saved, setSaved] = React.useState(true);
      const change = fields => setSaved(updatePreferences(fields));
      const toggle = (key, label, accessible) => h('label', { className: 'linguista-setting-row' }, h('span', null, label),
        h('input', { type: 'checkbox', role: 'switch', 'aria-label': accessible, checked: settings[key], onChange: event => change({ [key]: event.target.checked }) }));
      const choices = (key, label, accessible, options) => h('div', { className: 'linguista-setting-row' }, h('span', null, label),
        h('div', { className: 'linguista-capsule', role: 'radiogroup', 'aria-label': accessible }, options.map(([value, text, title], index) => h('button', {
          key: value, type: 'button', role: 'radio', 'aria-checked': settings[key] === value, 'aria-label': title, title,
          tabIndex: settings[key] === value ? 0 : -1, onClick: () => change({ [key]: value }),
          onKeyDown: event => {
            const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
            if (!offset && !['Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + offset + options.length) % options.length;
            change({ [key]: options[next][0] }); event.currentTarget.parentElement.children[next].focus();
          },
        }, h(UiIcon, { name: value }), h('span', null, text)))));
      return h('section', { className: 'linguista-settings linguista-drawer-pane', hidden: !active, role: 'tabpanel', 'aria-label': '设置' },
        choices('theme', '主题', '主题模式', [['auto', '自动', '跟随宿主 / 系统'], ['light', '浅色', '浅色'], ['dark', '深色', '深色']]),
        choices('browser', '网页打开', '网页默认打开方式', [['plugin', '内置', '插件内置浏览器'], ['system', '系统', '系统默认浏览器']]),
        toggle('aiEnabled', 'AI 伴读', '启用 AI 伴读'), toggle('sidebar', '聊天侧栏', '集成到 DSH 聊天侧栏'),
        !saved && h('p', { role: 'alert' }, '设置暂未保存，重新打开后可能恢复原值。'));
    }
    function Search({ active, data, send, open }) {
      const [query, setQuery] = React.useState(''), [scope, setScope] = React.useState('all');
      const input = React.useRef(null);
      React.useEffect(() => { if (active) { input.current?.focus(); send('search', { query, scope, sync: true }); } }, [active]);
      const change = (value, nextScope = scope) => { setQuery(value); setScope(nextScope); send('search', { query: value, scope: nextScope }); };
      const result = data?.query === query && data?.scope === scope ? data.result : null;
      return h('section', { className: 'linguista-search linguista-drawer-pane', hidden: !active, role: 'tabpanel', 'aria-label': '搜索' },
        h('div', { className: 'linguista-search-controls' },
          h('input', { ref: input, type: 'search', value: query, placeholder: '搜索文章标题与摘要…', 'aria-label': '搜索文章', onChange: event => change(event.target.value) }),
          h('select', { value: scope, 'aria-label': '搜索范围', onChange: event => change(query, event.target.value) }, h('option', { value: 'all' }, '所有订阅'), h('option', { value: 'current' }, '当前站点'))),
        h('p', { className: 'linguista-drawer-status', role: 'status' }, result ? `${result.total} 篇 · ${result.available}/${result.sources} 个订阅源` + (result.loading ? ' · 正在同步…' : result.failed ? ' · 部分同步失败，保留缓存' : '') : '正在检索…'),
        h('ol', { className: 'linguista-search-results' }, result?.items.map(({ feed, article }) => h('li', { key: feed.id + ':' + article.id },
          h('button', { type: 'button', onClick: () => open(feed.id, article.id) }, h('small', null, feed.title), h('strong', null, article.title), h('span', null, article.summary))))),
        result && !result.loading && !result.total && h('p', { className: 'linguista-drawer-status' }, '暂无匹配文章。'));
    }
    function Subscriptions({ active, feeds, open }) {
      const [copied, setCopied] = React.useState(''), [failed, setFailed] = React.useState('');
      React.useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 1800); return () => clearTimeout(timer); }, [copied]);
      async function copy(feed) {
        try { await navigator.clipboard.writeText(feed.url); setCopied(feed.id); setFailed(''); }
        catch { setFailed(feed.id); }
      }
      return h('section', { className: 'linguista-subscriptions linguista-drawer-pane', hidden: !active, role: 'tabpanel', 'aria-label': '订阅' },
        h('p', { className: 'linguista-drawer-status' }, feeds.length ? `${feeds.length} 路公开订阅` : '正在读取订阅…'),
        h('span', { className: 'linguista-visually-hidden', role: 'status' }, copied ? '已复制订阅地址' : ''),
        h('ul', null, feeds.map(feed => h('li', { key: feed.id },
          h('div', null, h('a', { href: feed.url, title: feed.url, target: '_blank', rel: 'noopener noreferrer', onClick: event => open(event, feed.url) }, feed.title),
            h('button', { type: 'button', title: copied === feed.id ? '已复制' : '复制订阅链接', onClick: () => void copy(feed), 'aria-label': '复制 ' + feed.title + ' 订阅链接' },
              h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true }, copied === feed.id ? h('path', { d: 'm5 12 4 4L19 6' }) : [h('rect', { key: 'front', x: 8, y: 8, width: 12, height: 12, rx: 2 }), h('path', { key: 'back', d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' })]))),
          h('small', { title: feed.description + ' · ' + new URL(feed.url).hostname }, feed.description, h('span', null, ' · ' + new URL(feed.url).hostname)),
          failed === feed.id && h('div', { className: 'linguista-copy-fallback' }, h('span', { role: 'alert' }, '复制失败，可选中地址手动复制'), h('input', { readOnly: true, value: feed.url, 'aria-label': feed.title + ' 订阅地址', onFocus: event => event.target.select() }))))));
    }
    function WebBrowser({ page, active, close, controls, onLocation, theme }) {
      const host = React.useRef(null), controller = React.useRef(null), address = React.useRef(page.url), fallback = React.useRef(null);
      const themeRef = React.useRef(theme); themeRef.current = theme;
      const [state, setState] = React.useState({ url: page.url, loading: true, back: false, forward: false, error: '' });
      const [revision, retry] = React.useState(0);
      const bridge = globalThis.dshDesktop?.protocolVersion === 1 ? globalThis.dshDesktop.browser : null;
      React.useEffect(() => { address.current = page.url; setState({ url: page.url, loading: true, back: false, forward: false, error: '' }); }, [page.url]);
      React.useEffect(() => {
        controls.current = {
          async snapshot() {
            if (bridge) {
              if (!controller.current) throw Error('请等待网页载入后重试。');
              return controller.current.snapshot();
            }
            try {
              const document = fallback.current.contentDocument;
              const text = (document.querySelector('article,main,[role="main"]') || document.body).innerText.trim();
              if (text) return { source: 'web', url: address.current, title: document.title || address.current, text: text.slice(0, 12000), partial: text.length > 12000, edition: '网页正文' };
            } catch { /* Cross-origin Web frames cannot supply page text. */ }
            return { source: 'web', url: address.current, title: address.current, edition: '仅网页地址', partial: true,
              text: '当前网页地址：' + address.current + '\n此 Web 宿主未读取网页正文，只能依据地址和用户提供的资料回答，不能声称已阅读页面。' };
          },
        };
        return () => { controls.current = null; };
      }, [bridge]);
      React.useEffect(() => {
        if (!active || !bridge) return;
        let disposed = false, instance;
        loadBrowser().then(({ mountNativeBrowser }) => {
          if (disposed) return;
          instance = mountNativeBrowser({ host: host.current, bridge, url: address.current, origin: window.location.origin, theme: themeRef.current,
            onChange: next => { address.current = next.url; setState(next); onLocation(next.url); } });
          controller.current = instance;
        }).catch(() => { if (!disposed) setState(previous => ({ ...previous, loading: false, error: '浏览器暂时不可用，请重试或在系统浏览器打开。' })); });
        return () => { disposed = true; instance?.dispose(); if (controller.current === instance) controller.current = null; };
      }, [active, bridge, page.url, revision]);
      React.useEffect(() => { controller.current?.setTheme(theme); }, [theme]);
      const button = (label, text, onClick, disabled = false) => h('button', { type: 'button', title: label, 'aria-label': label, onClick, disabled }, text);
      return h('section', { className: 'linguista-browser', 'aria-label': '原站网页浏览', hidden: !active },
        h('header', null, button('返回阅读', h(UiIcon, { name: 'reading' }), close), button('网页后退', '←', () => controller.current?.back(), !state.back),
          button('网页前进', '→', () => controller.current?.forward(), !state.forward),
          button('刷新网页', '⟳', () => bridge && controller.current ? controller.current.reload() : retry(value => value + 1)),
          h('span', { className: 'linguista-browser-address', title: state.url }, state.url),
          h('a', { href: state.url, target: '_blank', rel: 'noopener noreferrer', title: '在系统浏览器打开', 'aria-label': '在系统浏览器打开' }, h(UiIcon, { name: 'system' }))),
        state.loading && h('div', { className: 'linguista-browser-status', role: 'status' }, '正在加载网页…'),
        state.error && h('div', { className: 'linguista-browser-status', role: 'alert' }, state.error, button('重试网页', '重试', () => retry(value => value + 1))),
        h('div', { className: 'linguista-browser-page', ref: host, style: { colorScheme: theme } }, !bridge && active && h('iframe', { ref: fallback, key: page.url + revision, src: page.url, title: '原站网页', style: { colorScheme: theme },
          sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups', referrerPolicy: 'no-referrer', onLoad: () => setState(previous => ({ ...previous, loading: false })) })),
        !bridge && h('p', { className: 'linguista-browser-status' }, '部分原站限制内嵌显示，可在系统浏览器打开。'));
    }
    return {
      isPlugin: true, name: 'linguista', inject: ['slots', 'sessions', 'conversation'],
      apply(ctx) {
        ctx.effect(() => {
          let disposed = false;
          moduleAt('preferences.js').then(module => { if (!disposed) { normalizer = module.normalizePreferences; readPreferences(); } }).catch(() => {});
          const changed = event => { if (normalizer && event.key === preferenceKey) readPreferences(); };
          window.addEventListener('storage', changed);
          return () => { disposed = true; window.removeEventListener('storage', changed); };
        });
        const sessionIds = new Map(), pending = new Map();
        const starters = { overview: '这篇文章的要点是什么？', explain: '请解释我选中的这段话。', argument: '作者如何论证自己的结论？' };
        async function sessionId(url) {
          const existing = sessionIds.get(url);
          if (existing && !ctx.sessions.list.getSnapshot().ids.includes(existing)) await ctx.sessions.refresh();
          if (existing && ctx.sessions.list.getSnapshot().ids.includes(existing)) return existing;
          if (!pending.has(url)) pending.set(url, ctx.sessions.create().then(id => { sessionIds.set(url, id); return id; }).finally(() => pending.delete(url)));
          return pending.get(url);
        }
        function Panel({ SessionProvider, renderSlot, usePanelInfo, useTabInfo, sidebar = false }) {
          const frame = React.useRef(null), workspace = React.useRef(null), browserControls = React.useRef(null), lifetime = React.useRef(null), handle = React.useRef(null), preparing = React.useRef(null), generation = React.useRef(0);
          const settings = usePreferences(), settingsRef = React.useRef(settings); settingsRef.current = settings;
          const active = sidebar ? useTabInfo().tab.visible : usePanelInfo(info => info.activePanelId === 'linguista');
          const [webPage, setWebPage] = React.useState(null), [location, setLocation] = React.useState('');
          const [visible, setVisible] = React.useState(false), [reference, setReference] = React.useState(null), [source, setSource] = React.useState(null);
          const [commands, setCommands] = React.useState([]), [selection, setSelection] = React.useState(false), [loading, setLoading] = React.useState(false), [ready, setReady] = React.useState(false);
          const [error, setError] = React.useState(''), [narrow, setNarrow] = React.useState(false), [hostDark, setHostDark] = React.useState(false);
          const [tab, setTab] = React.useState('subscriptions'), [searchData, setSearchData] = React.useState(null), [bounds, setBounds] = React.useState({ top: 68, bottom: 60 });
          const latest = React.useRef(null), drawer = React.useRef(null);
          const send = (channel, type, fields = {}) => frame.current?.contentWindow?.postMessage({ channel, type, ...fields }, window.location.origin === 'null' ? '*' : window.location.origin);
          const sendReading = (type, fields) => send(readingChannel, type, fields);
          const closeWeb = () => { setWebPage(null); setLocation(''); };
          React.useEffect(() => {
            const controller = new AbortController(); lifetime.current = controller;
            const observer = new ResizeObserver(entries => setNarrow(entries[0].contentRect.width < 700));
            if (workspace.current) observer.observe(workspace.current);
            const sync = () => setHostDark(document.body.hasAttribute('data-ds-dark-theme') || (!getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim() && matchMedia('(prefers-color-scheme: dark)').matches));
            sync(); const themeObserver = new MutationObserver(sync); themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
            return () => { controller.abort(); preparing.current?.abort(); handle.current?.reference.release(); observer.disconnect(); themeObserver.disconnect(); };
          }, []);
          React.useEffect(() => {
            send(browserChannel, 'settings', { settings }); sendReading('connect', { global: true, enabled: settings.aiEnabled });
            if (!settings.aiEnabled && tab === 'ai') setTab('subscriptions');
          }, [settings, tab]);
          React.useEffect(() => { send(browserChannel, 'state', { ready, expanded: visible, loading }); }, [ready, visible, loading, settings]);
          async function openContext(payload) {
            if (!settingsRef.current.aiEnabled || lifetime.current?.signal.aborted) return;
            const request = ++generation.current;
            preparing.current?.abort(); preparing.current = new AbortController();
            const signal = AbortSignal.any([lifetime.current.signal, preparing.current.signal]);
            let acquired;
            setVisible(true); setTab('ai'); setError(''); setLoading(true);
            try {
              const { readingContext } = await loadReading();
              const context = readingContext(payload), id = await sessionId(context.url);
              if (signal.aborted || request !== generation.current) return;
              if (handle.current?.sessionId !== id) {
                acquired = ctx.sessions.retain(id, { source: 'linguista-reading', signal: lifetime.current.signal }); await acquired.ready;
                if (signal.aborted || request !== generation.current) return;
                handle.current?.reference.release(); handle.current = { sessionId: id, reference: acquired }; acquired = undefined;
              }
              const response = await fetch('/linguista/api/reading-context', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Linguista-Reader': 'local' }, body: JSON.stringify({ id, context }), signal });
              if (!response.ok) throw Error('暂时无法附加阅读资料，请重试。');
              if (signal.aborted || request !== generation.current) return;
              setReference(handle.current.reference); setSource(context); setSelection(Boolean(context.selection));
              const prompt = starters[context.task], binding = handle.current.reference.binding, input = ctx.conversation.input.for(binding.ctx), draft = input.state.getSnapshot(), initial = handle.current.initialDraft;
              const replace = initial && draft.draftRev === initial.draftRev && draft.draft === initial.draft && !draft.attachmentIds.length && !draft.occurrences.length;
              if (prompt || replace) {
                const result = ctx.conversation.input.requestDraftInitialization(binding, { prompt, whenDraftExists: replace ? 'replace' : 'keep' });
                if (result === 'blocked') throw Error('草稿暂时无法编辑，请重试。');
                handle.current.initialDraft = result === 'applied' && prompt ? input.state.getSnapshot() : undefined;
              }
            } catch (problem) { if (!signal.aborted && request === generation.current) setError(problem.message || '暂时无法打开伴读。'); }
            finally { acquired?.release(); if (!signal.aborted && request === generation.current) setLoading(false); }
          }
          async function ask(task = 'chat') {
            if (!settings.aiEnabled) return;
            if (!webPage) { sendReading('prepare', { task }); return; }
            if (visible && narrow && source?.source === 'web' && source.url === location.split('#')[0]) { await openContext({ ...source, task }); return; }
            setError(''); setLoading(true);
            try { const context = await browserControls.current?.snapshot(); if (!context) throw Error('请等待网页载入后重试。'); await openContext({ ...context, task }); }
            catch (problem) { setVisible(true); setTab('ai'); setError(problem.message || '暂时无法读取网页。'); }
            finally { setLoading(false); }
          }
          function closeDrawer() { setVisible(false); send(browserChannel, 'focus-stone'); }
          function openSearch() { setVisible(true); setTab('search'); }
          function toggleDrawer(reading) {
            if (visible) { closeDrawer(); return; }
            if (settings.aiEnabled && (webPage || reading)) { void ask(); return; }
            setTab('subscriptions'); setVisible(true);
          }
          function openLink(event, url) {
            if (settings.browser !== 'plugin' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault(); setWebPage({ url }); setLocation(url); setVisible(false);
          }
          latest.current = { toggleDrawer, openSearch, closeWeb, closeDrawer, ask };
          React.useEffect(() => {
            const report = () => sendReading('tray', { width: visible ? drawer.current?.getBoundingClientRect().width || 0 : 0 });
            if (visible) drawer.current?.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
            report(); const observer = new ResizeObserver(report); if (drawer.current) observer.observe(drawer.current);
            return () => observer.disconnect();
          }, [visible, narrow]);
          React.useEffect(() => {
            const receive = async event => {
              if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
              if (event.data?.channel === browserChannel) {
                if (event.data.type === 'ready') send(browserChannel, 'connect', { settings: settingsRef.current });
                if (event.data.type === 'settings-open') { setTab('settings'); setVisible(true); }
                if (event.data.type === 'drawer-toggle') latest.current.toggleDrawer(event.data.reading);
                if (event.data.type === 'drawer-close') latest.current.closeDrawer();
                if (event.data.type === 'search-open') latest.current.openSearch();
                if (event.data.type === 'navigate') { latest.current.closeWeb(); setVisible(false); }
                if (event.data.type === 'search-results') setSearchData(event.data);
                if (event.data.type === 'layout' && Number.isFinite(event.data.top) && Number.isFinite(event.data.bottom)) {
                  const reader = event.data.reader;
                  setBounds({ top: Math.max(0, event.data.top), bottom: Math.max(0, event.data.bottom),
                    reader: reader && ['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(reader[key]) && reader[key] >= 0) ? reader : undefined });
                }
                if (event.data.type === 'open' && settingsRef.current.browser === 'plugin') {
                  try { const url = new URL(event.data.url); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.origin !== window.location.origin) { setWebPage({ url: url.href }); setLocation(url.href); } } catch {}
                }
                return;
              }
              if (event.data?.channel !== readingChannel) return;
              if (event.data.type === 'ready') { const { skills } = await loadReading(); if (!lifetime.current.signal.aborted) { setCommands(skills); setReady(true); sendReading('connect', { global: true, enabled: settingsRef.current.aiEnabled }); } }
              if (event.data.type === 'selection') setSelection(event.data.available === true);
              if (event.data.type === 'reset') { generation.current++; preparing.current?.abort(); setSource(null); setReference(null); setSelection(false); setLoading(false); }
              if (event.data.type === 'open') await openContext(event.data.payload);
            };
            window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
          }, []);
          const stale = webPage ? source?.url !== location.split('#')[0] : source?.source === 'web';
          const theme = settings.theme === 'auto' ? hostDark ? 'dark' : 'light' : settings.theme;
          return h('div', { ref: workspace, className: 'linguista-workspace', 'data-theme': theme, 'data-drawer-open': visible || undefined,
            style: { '--linguista-tray-top': bounds.top + 'px', '--linguista-tray-bottom': bounds.bottom + 'px',
              '--linguista-browser-left': (bounds.reader?.left ?? 0) + 'px', '--linguista-browser-right': (bounds.reader?.right ?? 0) + 'px',
              '--linguista-browser-top': (bounds.reader?.top ?? bounds.top) + 'px', '--linguista-browser-bottom': (bounds.reader?.bottom ?? bounds.bottom) + 'px' } },
            h('link', { rel: 'stylesheet', href: '/linguista/discussion.css' + buildQuery }),
            h('div', { className: 'linguista-content' },
              h('div', { className: 'linguista-reading-surface' },
                h('iframe', { ref: frame, src: '/linguista/' + buildQuery, title: sidebar ? 'Linguista Home 侧栏' : 'Linguista 阅读工作台' })),
              webPage && h(WebBrowser, { page: webPage, active: active && !(visible && narrow), close: closeWeb, controls: browserControls, onLocation: setLocation, theme }),
              h('aside', { ref: drawer, className: 'linguista-drawer', 'aria-label': 'Rosetta 阅读侧栏', 'data-open': visible || undefined, inert: !visible, 'aria-hidden': !visible,
                onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); } } },
                h('header', null, h('nav', { role: 'tablist', 'aria-label': '阅读侧栏功能' },
                  [['search', '搜索'], ['subscriptions', '订阅'], ['ai', '伴读'], ['settings', '设置']].map(([key, label]) => h('button', { key, type: 'button', role: 'tab', 'aria-selected': tab === key, 'aria-label': label, title: key === 'settings' ? label : undefined,
                    disabled: key === 'ai' && !settings.aiEnabled, onClick: () => { setTab(key); if (key === 'ai' && (!source || stale)) void ask(); } }, key === 'settings' ? h(UiIcon, { name: 'settings' }) : label))),
                  h('button', { type: 'button', className: 'linguista-drawer-close', 'aria-label': '关闭阅读侧栏', onClick: closeDrawer }, '×')),
                h(Search, { active: visible && tab === 'search', data: searchData, send: (type, fields) => send(browserChannel, type, fields),
                  open: (site, id) => { closeWeb(); setVisible(false); send(browserChannel, 'open-result', { site, id }); } }),
                h(Subscriptions, { active: tab === 'subscriptions', feeds: searchData?.feeds || [], open: openLink }),
                h(Settings, { settings, active: tab === 'settings' }),
                h('section', { className: 'linguista-discussion linguista-drawer-pane', hidden: tab !== 'ai', role: 'tabpanel', 'aria-label': '伴读' },
                  source && h('p', { className: 'linguista-discussion-source' }, h('a', { href: source.url, title: source.title, target: '_blank', rel: 'noopener noreferrer', onClick: event => openLink(event, source.url) }, source.title), h('span', null, source.edition)),
                  h('nav', { 'aria-label': '阅读技能' }, commands.map(skill => h('button', { key: skill.task, type: 'button', title: skill.description,
                    disabled: loading || (skill.task === 'explain' && !selection), onClick: () => { void ask(skill.task); } }, skill.label))),
                  loading && h('p', { className: 'linguista-drawer-status', role: 'status' }, '正在准备阅读资料…'),
                  error && h('p', { className: 'linguista-drawer-status', role: 'alert' }, error),
                  (!source || stale) && !loading && h('p', { className: 'linguista-drawer-status' }, '阅读内容已变化。', h('button', { type: 'button', onClick: () => { void ask(); } }, '使用当前页面')),
                  reference && !stale && h('div', { className: 'linguista-discussion-session' }, h(SessionProvider, { session: reference }, renderSlot(sidebar ? 'linguista.sidebar.discussion' : 'linguista.discussion')))))));
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'linguista', order: 68, label: () => 'Linguista' }, Icon));
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: 'linguista', children: { 'linguista.discussion': { kind: 'single', scope: 'session' } } }, Panel);
          yield ctx.slots.register({ name: 'linguista.discussion' }, Discussion);
        });
        ctx.inject(['sidebarRight', 'sidebarRightTabs'], sidebar => {
          const id = 'dsh-linguista.sidebar';
          sidebar.effect(() => {
            let disposeType, enabled;
            const sync = () => {
              if (enabled === preferences.sidebar) return;
              enabled = preferences.sidebar;
              if (!enabled) for (const tab of sidebar.sidebarRight.openTabs.getSnapshot()) if (tab.kind === 'linguista') sidebar.sidebarRight.closeIn(tab.sessionId, tab.tabId);
              disposeType?.();
              disposeType = sidebar.sidebarRightTabs.register({ id, kind: 'linguista', keepMounted: true, title: () => 'Linguista',
                guide: enabled ? [{ id: 'home', order: 68, title: () => 'Linguista', icon: Icon }] : [] });
            };
            sync(); const unsubscribe = subscribePreferences(sync); return () => { unsubscribe(); disposeType?.(); };
          });
          function OpenSidebar() {
            const settings = usePreferences();
            return settings.sidebar ? h('button', { type: 'button', title: '在侧栏打开 Linguista', 'aria-label': '在侧栏打开 Linguista', className: 'linguista-open-sidebar', onClick: () => sidebar.sidebarRight.openTab('linguista') }, h(Icon, { size: 20 })) : null;
          }
          sidebar.slots.inject('sidebar.right.pane.tab', function* () {
            yield sidebar.slots.register({ name: 'sidebar.right.pane.tab', key: id, children: { 'linguista.sidebar.discussion': { kind: 'single', scope: 'session' } } }, function SidebarPanel(props) {
              const settings = usePreferences(), info = props.useTabInfo();
              React.useEffect(() => { if (!settings.sidebar) info.tab.actions.close(); }, [settings.sidebar, info.tab.actions]);
              return settings.sidebar ? h(Panel, { ...props, useTabInfo: () => info, sidebar: true }) : null;
            });
            yield sidebar.slots.register({ name: 'linguista.sidebar.discussion' }, Discussion);
          });
          sidebar.slots.inject('conversation.session.header.actions', () => sidebar.slots.register({ name: 'conversation.session.header.actions', id: 'linguista-sidebar', order: 68 }, OpenSidebar));
        });
      },
    };
  },
});
