const trigger = document.querySelector('#home-subscribe');
const dialog = document.querySelector('#home-subscriptions');
const status = dialog.querySelector('.subscription-status');
let copiedButton;

trigger.hidden = false;
trigger.addEventListener('click', () => {
  copiedButton?.removeAttribute('data-copied');
  copiedButton = null;
  status.textContent = '';
  status.classList.add('sr-only');
  dialog.showModal();
});
dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
dialog.addEventListener('keydown', event => {
  // Leave Escape to the native dialog and keep Home's global search shortcut out.
  if (event.key === 'Escape' || event.key === '/') event.stopPropagation();
});
dialog.addEventListener('click', async event => {
  if (event.target === dialog) {
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
    return;
  }
  const button = event.target.closest('.subscription-copy');
  if (!button) return;
  const row = button.closest('.subscription-feed');
  const link = row.querySelector('.subscription-url');
  try {
    await navigator.clipboard.writeText(link.getAttribute('href'));
    copiedButton?.removeAttribute('data-copied');
    copiedButton = button;
    button.setAttribute('data-copied', '');
    status.classList.add('sr-only');
    status.textContent = `已复制 ${row.querySelector('strong').textContent} 的 RSS 地址。`;
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(link);
    selection.removeAllRanges();
    selection.addRange(range);
    status.classList.remove('sr-only');
    status.textContent = '已选中地址，可以手动复制。';
  }
});
