export const channel = 'dsh-linguista-reading';
export const skills = [
  { task: 'overview', name: 'linguista-overview', label: '提炼要点', description: '从当前文章提炼主旨、关键依据和可回查的段落。' },
  { task: 'explain', name: 'linguista-explain', label: '解释选段', description: '用文章上下文解释用户选中的段落和术语。' },
  { task: 'argument', name: 'linguista-argument', label: '拆解论证', description: '梳理文章的主张、证据、假设及结论的适用范围。' },
];
const contextLimit = 12000;
const selectionLimit = 1800;
const origins = new Set(['https://linguista.cn', 'https://linguista.bearblog.dev', 'https://linguista.notion.site']);
const clean = (text, limit) => typeof text === 'string' ? text.replaceAll('\0', '').trim().slice(0, limit) : '';

export function readingContext(payload) {
  if (typeof payload?.url !== 'string' || payload.url.length > 2048) throw Error('无效的文章地址。');
  const url = new URL(payload?.url);
  if (url.protocol !== 'https:' || !origins.has(url.origin) || url.username || url.password) throw Error('无效的文章地址。');
  url.hash = '';
  const skill = skills.find(item => item.task === payload.task);
  if (!skill && payload.task !== 'chat') throw Error('未知的阅读技能。');
  const title = clean(payload.title, 250);
  const excerpt = clean(payload.selection, selectionLimit);
  const article = clean(payload.text, contextLimit);
  if (!title || !article) throw Error('请先打开有内容的文章。');
  if (skill?.task === 'explain' && !excerpt) throw Error('请先在文章中选中要解释的文字。');
  return { url: url.href, title, edition: clean(payload.edition, 40), task: payload.task,
    selection: excerpt, text: article, partial: payload.partial === true || payload.text.length > contextLimit };
}

export function connectReadingAI({ snapshot }) {
  if (window.parent === window) return null;
  const origin = location.origin;
  const open = document.getElementById('rss-ask-ai');
  const explain = document.getElementById('rss-ask-selection');
  const body = document.getElementById('rss-article-body');
  const summary = document.getElementById('rss-article-summary');
  const reader = document.getElementById('rss-reader');
  const readerBar = reader.querySelector('.rss-reader-top');
  const topBar = document.querySelector('.workbench-controls');
  const dock = document.querySelector('.dock');
  const root = document.documentElement;
  let ready = false;
  let selection = '';
  let lastSelection = false;
  let trayWidth = 0;
  const send = (type, fields) => window.parent.postMessage({ channel, type, ...fields }, origin === 'null' ? '*' : origin);

  function fitArticle() {
    const alongside = trayWidth > 0 && reader.clientWidth - trayWidth >= 320;
    root.toggleAttribute('data-reader-companion', alongside);
    if (alongside) root.style.setProperty('--reader-companion-width', `${trayWidth}px`);
    else root.style.removeProperty('--reader-companion-width');
  }

  function reportLayout() {
    if (!ready || reader.hidden) return;
    const colors = getComputedStyle(root);
    send('layout', {
      top: Math.ceil(Math.max(readerBar.getBoundingClientRect().bottom, topBar.getBoundingClientRect().bottom)),
      bottom: Math.ceil(Math.max(0, innerHeight - dock.getBoundingClientRect().top)),
      palette: Object.fromEntries(['surface', 'surface-raised', 'ink', 'muted', 'line', 'accent-soft'].map(name => [name, colors.getPropertyValue(`--${name}`).trim()])),
      theme: root.dataset.theme === 'light' ? 'light' : 'dark',
    });
    fitArticle();
  }

  const layoutObserver = new ResizeObserver(reportLayout);
  for (const element of [reader, readerBar, topBar, dock]) layoutObserver.observe(element);
  new MutationObserver(reportLayout).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', reportLayout);

  function clearSelection() {
    selection = '';
    explain.hidden = true;
    if (lastSelection) { lastSelection = false; send('selection', { available: false }); }
  }

  function updateSelection() {
    const range = document.getSelection();
    const content = body.hidden ? summary : body;
    selection = range?.anchorNode && content.contains(range.anchorNode) && content.contains(range.focusNode)
      ? clean(range.toString(), selectionLimit) : '';
    explain.hidden = !ready || !selection;
    if (ready && Boolean(selection) !== lastSelection) {
      lastSelection = Boolean(selection);
      send('selection', { available: lastSelection });
    }
  }

  function request(task) {
    const article = snapshot();
    if (!ready || !article) return;
    reportLayout();
    const fullText = (body.hidden ? summary : body).innerText.trim();
    const selectedAt = task === 'explain' && selection ? fullText.indexOf(selection) : -1;
    const start = selectedAt < 0 ? 0 : Math.max(0, selectedAt - 1600);
    const end = selectedAt < 0 ? contextLimit : selectedAt + selection.length + 1600;
    send('open', { payload: { ...article, task, selection, text: fullText.slice(start, end), partial: body.hidden || start > 0 || end < fullText.length } });
  }

  document.addEventListener('selectionchange', updateSelection);
  // Keep the selected text when a pointer activates the adjacent toolbar button.
  explain.addEventListener('pointerdown', event => event.preventDefault());
  explain.addEventListener('click', () => request('explain'));
  open.addEventListener('click', () => request('chat'));
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin || event.data?.channel !== channel) return;
    if (event.data.type === 'connect') { ready = true; open.hidden = false; updateSelection(); reportLayout(); }
    if (event.data.type === 'tray') {
      trayWidth = Number.isFinite(event.data.width) ? Math.max(0, event.data.width) : 0;
      fitArticle();
    }
    if (event.data.type === 'prepare' && skills.some(skill => skill.task === event.data.task)) request(event.data.task);
    if (event.data.type === 'focus-reader' && !document.getElementById('rss-reader').hidden) open.focus({ preventScroll: true });
  });
  send('ready');
  return {
    clearSelection,
    reset() {
      clearSelection();
      trayWidth = 0;
      fitArticle();
      if (ready) send('reset');
    },
  };
}
