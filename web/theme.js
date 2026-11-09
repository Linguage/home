(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'linguista-workbench-theme';
  let choice, host, button;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') choice = saved;
  } catch { /* Keep the current choice when storage is unavailable. */ }
  try {
    if (window.parent !== window && window.parent.document.body) {
      const parent = window.parent.document;
      if (parent.defaultView.getComputedStyle(parent.body).getPropertyValue('--dsw-alias-bg-base').trim()) host = parent;
    }
  } catch { /* Standalone and cross-origin pages follow the system. */ }

  function sync() {
    const dark = choice ? choice === 'dark' : host ? host.body.hasAttribute('data-ds-dark-theme') : media.matches;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = root.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).backgroundColor;
    if (button) {
      const label = dark ? '切换到浅色' : '切换到深色';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  sync();
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('#workbench-theme');
    button.addEventListener('click', () => {
      choice = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(storageKey, choice); } catch { /* Still apply the change for this session. */ }
      sync();
    });
    sync();
  }, { once: true });

  const observer = new MutationObserver(sync);
  if (host) observer.observe(host.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  media.addEventListener('change', sync);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    observer.disconnect(); media.removeEventListener('change', sync);
  }, { once: true });
})();
