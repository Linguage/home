// Apply the same local-time palette before paint and when a long-lived tab wakes.
(() => {
  const root = document.documentElement;
  const key = document.currentScript.dataset.preference || 'linguista-home-theme';
  const modes = ['auto', 'light', 'dusk', 'dark'];
  const names = { auto: '按时间', light: '米纸浅绛', dusk: '暮窗', dark: '夜灯' };
  const icons = {
    auto: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0ZM12 7v5l3 2',
    light: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    dusk: 'M3 16h18M5 20h14M7 15a5 5 0 0 1 10 0M12 3v3M4 8l2 2m12 0 2-2',
    dark: 'M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z',
  };
  const schedule = [
    { hour: 6, palette: 'light' },
    { hour: 14, palette: 'dusk' },
    { hour: 22, palette: 'dark' },
  ];
  let choice = 'auto', timer, button, symbol, hostControlled = false;
  function read() {
    try {
      const saved = localStorage.getItem(key);
      choice = modes.includes(saved) ? saved : 'auto';
    } catch { /* Storage can be disabled. */ }
  }
  function sync() {
    clearTimeout(timer);
    const now = new Date(), hour = now.getHours();
    let palette = choice;
    if (choice === 'auto') {
      const upcoming = schedule.find(slot => slot.hour > hour);
      const current = schedule.findLast(slot => slot.hour <= hour) || schedule.at(-1);
      palette = current.palette;
      const next = new Date(now);
      if (!upcoming) next.setDate(next.getDate() + 1);
      next.setHours((upcoming || schedule[0]).hour, 0, 0, 0);
      timer = setTimeout(sync, next - now);
    }
    const changed = root.dataset.palette !== palette;
    root.dataset.palette = palette;
    root.dataset.theme = palette === 'light' ? 'light' : 'dark';
    root.style.colorScheme = root.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--surface').trim();
    const scene = document.querySelector('.site-backdrop');
    if (scene) {
      const path = './assets/study-room.svg#' + palette;
      if (scene.getAttribute('src') !== path) scene.setAttribute('src', path);
    }
    if (button) {
      const next = modes[(modes.indexOf(choice) + 1) % modes.length];
      button.title = '当前：' + (choice === 'auto' ? '按时间 · ' : '') + names[palette] + '，切换到' + names[next];
      button.setAttribute('aria-label', button.title);
      symbol.setAttribute('d', icons[choice]);
    }
    if (changed) window.dispatchEvent(new Event('linguista-palette-change'));
  }
  read();
  sync();
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('#workbench-theme, #theme-button');
    if (button) {
      button.hidden = hostControlled;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('aria-hidden', 'true');
      symbol = document.createElementNS(svg.namespaceURI, 'path');
      symbol.setAttribute('fill', 'none');
      symbol.setAttribute('stroke', 'currentColor');
      symbol.setAttribute('stroke-width', '1.6');
      symbol.setAttribute('stroke-linecap', 'round');
      symbol.setAttribute('stroke-linejoin', 'round');
      svg.append(symbol);
      button.replaceChildren(svg);
      button.addEventListener('click', () => {
        choice = modes[(modes.indexOf(choice) + 1) % modes.length];
        try { localStorage.setItem(key, choice); } catch {}
        sync();
      });
    }
    sync();
  }, { once: true });
  window.addEventListener('linguista-theme-choice', event => {
    hostControlled = true;
    choice = modes.includes(event.detail) ? event.detail : 'auto';
    sync();
  });
  window.addEventListener('storage', event => {
    if (!hostControlled && (event.key === key || event.key === null)) { read(); sync(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('focus', sync);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', sync);
})();
