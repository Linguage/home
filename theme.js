// Follow only DSH's light/dark mode; all colors remain Home's original colors.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let host;
  try {
    if (window.parent !== window && window.parent.document.body) {
      const parent = window.parent.document;
      if (parent.defaultView.getComputedStyle(parent.body).getPropertyValue('--dsw-alias-bg-base').trim()) host = parent;
    }
  } catch { /* Standalone and cross-origin previews follow the system palette. */ }
  function sync() {
    const dark = host ? host.body.hasAttribute('data-ds-dark-theme') : media.matches;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).backgroundColor;
  }
  sync();
  const observer = new MutationObserver(sync);
  if (host) observer.observe(host.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  media.addEventListener('change', sync);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    observer.disconnect(); media.removeEventListener('change', sync);
  }, { once: true });
})();
