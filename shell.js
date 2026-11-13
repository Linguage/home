// Keep the local workbench in place while the browser opens a public article.
// This also covers links created later by Home's shelves and search results.
(() => {
  const origins = new Set(['https://linguista.cn', 'https://linguista.notion.site', 'https://app.notion.com', 'https://linguista.bearblog.dev']);
  function prepareLinks(container) {
    const links = [...container.querySelectorAll('a[href]')];
    if (container.matches?.('a[href]')) links.push(container);
    for (const link of links) {
      const url = new URL(link.href, location.href);
      if (!origins.has(url.origin) || url.username || url.password) continue;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (!link.title || ['在浏览器中打开原站', '在插件中打开网页'].includes(link.title)) link.title = connected && preferences.browser === 'plugin' ? '在插件中打开网页' : '在浏览器中打开原站';
    }
  }
  const channel = 'dsh-linguista-browser';
  let connected = false;
  let preferences = { browser: 'plugin', theme: 'auto' };
  let aiButton, settingsButton;
  const brain = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6C5 3 9 1 11 3c3-2 6 0 6 2 4 0 6 4 4 7 2 3 0 6-3 6l1 3h-3l-2-3H8c-3 1-6-1-5-4-3-2-2-6 1-7 0-1 1-1 2-1ZM7 6c2-1 4 0 4 2M4 10c3-1 5 0 5 3m4-8c-1 3 1 5 3 5m-4 5c2-2 4-1 5 0m1-7c2 1 2 3 0 4"/></svg>';
  function placeActions() {
    const parent = matchMedia('(max-width:900px)').matches ? document.querySelector('.home-search .search-field') : document.querySelector('.workbench-controls');
    if (parent && aiButton && settingsButton && settingsButton.parentElement !== parent) parent.append(aiButton, settingsButton);
  }
  function createActions() {
    if (aiButton) return;
    document.documentElement.dataset.pluginHost = 'true';
    const button = (label, icon, action) => {
      const element = document.createElement('button'); element.type = 'button'; element.className = 'linguista-host-action'; element.setAttribute('aria-label', label); element.title = label; element.innerHTML = icon;
      element.addEventListener('click', () => send(action)); return element;
    };
    aiButton = button('AI 伴读', brain, 'ai-open');
    settingsButton = button('设置', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6m8 4v6"/></svg>', 'settings-open');
    placeActions(); window.addEventListener('resize', placeActions);
  }
  function configure(value) {
    if (value && typeof value === 'object') preferences = value;
    createActions(); aiButton.hidden = preferences.aiEnabled === false;
    const themeButton = document.querySelector('#workbench-theme');
    if (themeButton) themeButton.hidden = true;
    window.dispatchEvent(new CustomEvent('linguista-theme-choice', { detail: preferences.theme }));
    prepareLinks(document);
  }
  const send = (type, fields = {}) => window.parent.postMessage({ channel, type, ...fields }, location.origin === 'null' ? '*' : location.origin);
  if (window.parent !== window) {
    window.addEventListener('message', event => {
      if (event.source === window.parent && event.origin === location.origin && event.data?.channel === channel && event.data.type === 'connect') { connected = true; configure(event.data.settings); }
      if (connected && event.source === window.parent && event.origin === location.origin && event.data?.channel === channel && event.data.type === 'state') { aiButton.disabled = !event.data.ready || event.data.loading; aiButton.setAttribute('aria-expanded', String(event.data.expanded)); }
      if (connected && event.source === window.parent && event.origin === location.origin && event.data?.channel === channel && event.data.type === 'settings') configure(event.data.settings);
    });
    document.addEventListener('click', event => {
      if (!connected || preferences.browser !== 'plugin' || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download')) return;
      const url = new URL(link.href, location.href);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.origin === location.origin) return;
      event.preventDefault();
      send('open', { url: url.href });
    });
    send('ready');
  }
  prepareLinks(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') prepareLinks(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) prepareLinks(node);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
