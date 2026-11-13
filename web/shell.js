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
  let stoneButton;
  let query = '', scope = 'all';
  function reportLayout() {
    if (!connected) return;
    const bar = document.querySelector('.workbench-controls').getBoundingClientRect();
    const mobile = document.querySelector('.home-mobile-header')?.getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const top = Math.ceil(Math.max(bar.bottom + 8, mobile?.height ? mobile.bottom : 0));
    const bottom = Math.ceil(innerHeight - dock.top);
    document.documentElement.style.setProperty('--linguista-reader-top', top + 'px');
    // The browser replaces the reading area, not the subscription/site sidebar.
    const preview = ['#rss-reader', '.rss-stage', '.feature'].map(selector => document.querySelector(selector))
      .find(element => element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
    const rect = preview?.getBoundingClientRect();
    const padding = preview?.classList.contains('rss-stage') ? parseFloat(getComputedStyle(preview).paddingTop) : 0;
    send('layout', { top, bottom, reader: {
      left: rect ? Math.ceil(rect.left) : 0,
      right: rect ? Math.max(0, Math.ceil(innerWidth - rect.right)) : 0,
      top: Math.max(top, rect ? Math.ceil(rect.top + padding) : 0),
      bottom: Math.max(bottom, rect ? Math.ceil(innerHeight - rect.bottom) : 0),
    } });
  }
  function publishSearch() {
    if (!connected || !window.LinguistaRSS) return;
    const rss = window.LinguistaRSS;
    send('search-results', { query, scope, result: rss.search(query, scope === 'current' ? rss.state.site : null), feeds: rss.catalog, context: rss.state });
  }
  function createActions() {
    if (stoneButton) return;
    document.documentElement.dataset.pluginHost = 'true';
    const button = (label, icon, action) => {
      const element = document.createElement('button'); element.type = 'button'; element.className = 'linguista-host-action'; element.setAttribute('aria-label', label); element.title = label; element.innerHTML = icon;
      element.addEventListener('click', () => send(action, { reading: document.documentElement.hasAttribute('data-rss-reading') })); return element;
    };
    stoneButton = button('Rosetta · 搜索、订阅与伴读', '<img src="./assets/brand/home-logo.svg" alt="" width="32" height="32">', 'drawer-toggle');
    stoneButton.id = 'linguista-rosetta';
    document.querySelector('.workbench-controls').append(stoneButton);
    const layout = new ResizeObserver(reportLayout);
    for (const element of document.querySelectorAll('.workbench-controls,.home-mobile-header,.dock,.feature,.rss-stage,#rss-reader')) layout.observe(element);
    window.addEventListener('resize', reportLayout);
    new MutationObserver(() => { publishSearch(); reportLayout(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-view-mode', 'data-rss-site', 'data-rss-reading'] });
    publishSearch(); reportLayout();
  }
  function configure(value) {
    if (value && typeof value === 'object') preferences = value;
    createActions();
    const themeButton = document.querySelector('#workbench-theme');
    if (themeButton) themeButton.hidden = true;
    window.dispatchEvent(new CustomEvent('linguista-theme-choice', { detail: preferences.theme }));
    prepareLinks(document);
  }
  const send = (type, fields = {}) => window.parent.postMessage({ channel, type, ...fields }, location.origin === 'null' ? '*' : location.origin);
  if (window.parent !== window) {
    window.addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== channel) return;
      const message = event.data;
      if (message.type === 'connect') { connected = true; configure(message.settings); publishSearch(); reportLayout(); }
      if (!connected) return;
      if (message.type === 'state') stoneButton.setAttribute('aria-expanded', String(message.expanded));
      if (message.type === 'settings') configure(message.settings);
      if (message.type === 'focus-stone') stoneButton.focus({ preventScroll: true });
      if (message.type === 'search') {
        query = typeof message.query === 'string' ? message.query.slice(0, 500) : '';
        scope = message.scope === 'current' ? 'current' : 'all';
        publishSearch();
        if (message.sync) void window.LinguistaRSS?.syncSearch();
      }
      if (message.type === 'open-result') void window.LinguistaRSS?.openResult(message.site, message.id);
    });
    window.addEventListener('linguista-rss-update', publishSearch);
    document.addEventListener('keydown', event => {
      if (!connected) return;
      if (event.key === 'Escape') send('drawer-close');
      if (event.key === '/' && !event.target.closest('input,textarea,[contenteditable="true"]') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation(); send('search-open');
      }
    }, true);
    document.addEventListener('click', event => {
      if (connected && event.target.closest('[data-view],[data-card-group],#home-site-name')) send('navigate');
    }, true);
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
