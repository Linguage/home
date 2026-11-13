(() => {
const trigger = document.querySelector('#home-subscribe');
const drawer = document.querySelector('#home-subscriptions');
const status = drawer.querySelector('.subscription-status');
const tabs = [...drawer.querySelectorAll('[role="tab"]')];
const root = document.documentElement;
let copiedButton, copiedTimer;

function selectTab(tab, focus = false) {
  tabs.forEach(button => {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
  if (focus) tab.focus({ preventScroll: true });
}
function openDrawer(tab = tabs[1]) {
  drawer.inert = false;
  drawer.setAttribute('data-open', '');
  trigger.setAttribute('aria-expanded', 'true');
  selectTab(tab);
}
function closeDrawer({ focus = true } = {}) {
  drawer.inert = true;
  drawer.removeAttribute('data-open');
  trigger.setAttribute('aria-expanded', 'false');
  root.removeAttribute('data-home-search');
  document.querySelector('#search-button').setAttribute('aria-expanded', 'false');
  const url = new URL(location.href);
  if (url.searchParams.has('subscribe')) {
    url.searchParams.delete('subscribe'); history.replaceState(history.state, '', url);
  }
  if (focus) trigger.focus({ preventScroll: true });
}
function layout() {
  const bar = document.querySelector('.workbench-controls').getBoundingClientRect();
  const header = document.querySelector('.home-mobile-header').getBoundingClientRect();
  const dock = document.querySelector('.dock').getBoundingClientRect();
  root.style.setProperty('--home-drawer-top', Math.ceil(Math.max(bar.bottom + 8, header.height ? header.bottom : 0)) + 'px');
  root.style.setProperty('--home-drawer-bottom', Math.ceil(innerHeight - dock.top) + 'px');
}
trigger.hidden = false;
trigger.addEventListener('click', () => {
  if (drawer.hasAttribute('data-open')) closeDrawer();
  else { openDrawer(); tabs[1].focus({ preventScroll: true }); }
});
tabs.forEach(tab => tab.addEventListener('click', () => {
  selectTab(tab);
  if (tab === tabs[0]) document.querySelector('#search-input').focus({ preventScroll: true });
}));
drawer.querySelector('[role="tablist"]').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = tabs.indexOf(document.activeElement);
  selectTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length], true);
});
drawer.querySelector('.subscription-heading .icon-button').addEventListener('click', () => closeDrawer());
window.addEventListener('linguista-search-open', () => openDrawer(tabs[0]));
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !drawer.hasAttribute('data-open') || document.querySelector('dialog[open]')) return;
  event.preventDefault(); event.stopImmediatePropagation(); closeDrawer();
}, true);
document.addEventListener('click', event => {
  if (!drawer.hasAttribute('data-open') || drawer.contains(event.target) || trigger.contains(event.target)) return;
  closeDrawer({ focus: false });
});
drawer.querySelector('#home-drawer-search').addEventListener('click', event => {
  if (event.target.closest('#search-results a')) closeDrawer({ focus: false });
});
drawer.addEventListener('click', async event => {
  const button = event.target.closest('.subscription-copy');
  if (!button) return;
  const row = button.closest('.subscription-feed');
  const link = row.querySelector('.subscription-url');
  try {
    await navigator.clipboard.writeText(link.href);
    clearTimeout(copiedTimer); copiedButton?.removeAttribute('data-copied');
    copiedButton = button; button.setAttribute('data-copied', '');
    copiedTimer = setTimeout(() => button.removeAttribute('data-copied'), 1800);
    status.classList.add('sr-only');
    status.textContent = `已复制 ${link.textContent} 的 RSS 地址。`;
  } catch {
    const range = document.createRange(); range.selectNodeContents(link);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    status.classList.remove('sr-only');
    status.textContent = `请手动复制：${link.href}`;
  }
});
const observer = new ResizeObserver(layout);
for (const element of document.querySelectorAll('.workbench-controls,.home-mobile-header,.dock')) observer.observe(element);
window.addEventListener('resize', layout); layout();
if (new URLSearchParams(location.search).get('subscribe') === '1') openDrawer();

})();
