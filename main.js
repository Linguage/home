const root = document.documentElement;
root.classList.add('js');

// A single motion lifecycle prevents stale completions after rapid navigation.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motions = new Map();
function cancelMotion(element) {
  motions.get(element)?.cancel();
  motions.delete(element);
}
function move(element, frames, { duration = 260, complete } = {}) {
  cancelMotion(element);
  if (reducedMotion.matches) { complete?.(); return; }
  const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  motions.set(element, animation);
  animation.onfinish = () => {
    if (motions.get(element) !== animation) return;
    motions.delete(element);
    complete?.();
  };
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) [...motions.values()].forEach(animation => animation.finish());
});

// Lock to one axis only after intent is clear; vertical reading and pinch zoom stay native.
function trackDrag(surface, { axis, canStart, onMove, onEnd }) {
  let drag = null;
  let ignoreClick = false;
  function finish(cancelled) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (surface.hasPointerCapture(previous.id)) surface.releasePointerCapture(previous.id);
    if (previous.active) {
      ignoreClick = true;
      onEnd(previous.delta, cancelled);
    }
  }
  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { finish(true); return; }
    ignoreClick = false;
    if (event.button !== 0 || !canStart(event)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, delta: 0, active: false };
  });
  surface.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const delta = axis === 'x' ? dx : dy;
    const cross = axis === 'x' ? dy : dx;
    if (!drag.active) {
      if (Math.max(Math.abs(delta), Math.abs(cross)) < 8) return;
      if (Math.abs(delta) <= Math.abs(cross)) { finish(true); return; }
      drag.active = true;
      surface.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    drag.delta = delta;
    onMove(delta);
  });
  surface.addEventListener('pointerup', event => { if (drag?.id === event.pointerId) finish(false); });
  ['pointercancel', 'lostpointercapture'].forEach(type => surface.addEventListener(type, event => {
    // Touch starts with implicit capture on the child; transferring it is not cancellation.
    if (type === 'lostpointercapture' && event.target !== surface) return;
    if (drag?.id === event.pointerId) finish(true);
  }));
  surface.addEventListener('click', event => {
    if (!ignoreClick || event.detail === 0) return;
    ignoreClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('resize', () => finish(true));
}

// The dock chooses a shelf; the shelf chooses content for the main screen.
const panels = [...document.querySelectorAll('[data-panel]')];
const triggers = [...document.querySelectorAll('[data-open-panel]')];
const homeButton = document.querySelector('#home-button');
const dockButtons = [...document.querySelectorAll('[data-card-group]')];
const mobile = matchMedia('(max-width: 900px)');
const hoverPointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
let suppressFocusPreview = false;
const newsletterFold = document.querySelector('#newsletter-fold');
const newsletterToggle = document.querySelector('#newsletter-toggle');
const newsletterPages = document.querySelector('#newsletter-pages');
const newsletterBack = document.querySelector('#newsletter-back');
const newsletterIsOpen = () => newsletterFold.dataset.flipped === 'true';
const quickLinks = document.querySelector('.quick-links');
const quickLinksHome = document.createComment('Desktop module navigation');
quickLinks.before(quickLinksHome);
function placeModuleLinks() {
  const target = mobile.matches ? document.querySelector('#newsletter-pages') : quickLinksHome.parentElement;
  if (quickLinks.parentElement === target) return;
  const focus = quickLinks.contains(document.activeElement) ? document.activeElement : null;
  if (mobile.matches) target.append(quickLinks);
  else quickLinksHome.after(quickLinks);
  if (focus?.getClientRects().length) focus.focus({ preventScroll: true });
}
placeModuleLinks();
const shelf = document.querySelector('#card-shelf');
const shelfTrack = document.querySelector('#shelf-track');
const detail = document.querySelector('#content-detail');
const detailBody = document.querySelector('#detail-body');
let shelfGroup = null;
let contentGroup = 'home';
let selectedKey = '';
let currentPanel = null;
let syncPlayback = () => {};
let returnFocus = homeButton;
let shelfReturnFocus = homeButton;
const sites = {
  home: { title: 'Linguista', href: 'https://linguista.cn/', description: '所读 · 所思 · 所想' },
  alpaca: { title: 'AlpacaNotes', href: 'https://linguista.cn/alpacanotes/', description: '学习与思考' },
  library: { title: 'Library', href: 'https://linguista.cn/library/', description: '人物、图书与课程' },
  hinbox: { title: 'Hinbox', href: 'https://linguista.cn/hinbox/', description: '文章、笔记与访谈' },
  science: { title: "what's old", href: 'https://linguista.cn/sci-notes/', description: '科学技术笔记' },
};
const groupLabels = Object.fromEntries(Object.entries(sites).map(([key, site]) => [key, site.title]));
const textOf = (element, selector) => element.querySelector(selector)?.textContent.trim() || '';
const slideSources = [...document.querySelectorAll('[data-slide]')];
const featuredItems = slideSources.map((slide, index) => ({
  key: `featured-${index}`, slide: index, title: textOf(slide, 'h1, h2'),
  site: slide.dataset.site, shortTitle: slide.dataset.shortTitle,
  meta: textOf(slide, '.feature-category'), href: slide.querySelector('.read-button').href,
  image: slide.dataset.image,
  coverTitle: slide.dataset.coverTitle, coverSubtitle: slide.dataset.coverSubtitle,
  coverKicker: slide.dataset.coverKicker, imageStyle: slide.dataset.imageStyle,
}));
// Keep the source navigation language. Directories have their own text links below.
function moduleItems(group, entries) {
  return entries.map(({ id, icon, ...entry }) => ({
    key: `${group}-${id}`, ...entry, isModule: true, action: '进入栏目',
    image: `./assets/modules/${icon}.svg`, imageStyle: 'icon',
  }));
}
const cardGroups = {
  home: [
    { key: 'newsletter', title: 'Newsletter', meta: '精选阅读与个人思考', href: 'https://linguista.cn/newsletter/', action: '进入周刊', image: './assets/linguista/newsletter-geometric.svg', palette: ['#efe0bc', '#4d4930', '#c0a56c'], isModule: true },
    ...['workshop', 'bookmarks', 'about'].map((id, index) => ({
      key: id, panel: id, title: textOf(document.querySelector(`#${id}`), 'h2'), isModule: true,
      image: document.querySelector(`[data-open-panel="${id}"] img`).getAttribute('src'),
      palette: [['#5d735d', '#fff3d9', '#a2bc8e'], ['#b7cad4', '#28444b', '#6d94a7'], ['#6c4149', '#f9e7d8', '#c59494']][index],
    })),
  ],
  alpaca: moduleItems('alpaca', [
    { id: 'notes', title: 'Notes', href: 'https://linguista.cn/alpacanotes/notes/', meta: '文章、制作记录和日常笔记', icon: 'sticky-note', palette: ['#e0d2b4', '#51432d', '#a78c59'], motif: 'lines' },
    { id: 'topics', title: 'Topics', href: 'https://linguista.cn/alpacanotes/topics/', meta: '书单、赛事、工作流与项目记录', icon: 'layers', palette: ['#3d6865', '#f2ead8', '#9ec8bb'], motif: 'grid' },
    { id: 'prompts', title: 'Prompts', href: 'https://linguista.cn/alpacanotes/prompts/', meta: 'AI 绘画提示词与实验', icon: 'folder-open', palette: ['#65455c', '#fbebdd', '#c9a1bd'], motif: 'arch' },
  ]),
  library: moduleItems('library', [
    { id: 'persons', title: '人物文集', href: 'https://linguista.cn/library/#persons', meta: '按作者浏览文集', icon: 'users', palette: ['#294763', '#f4ead2', '#b9cfe0'], motif: 'arch' },
    { id: 'courses', title: '图书与课程', href: 'https://linguista.cn/library/#courses', meta: '图书与课程书架', icon: 'library', palette: ['#e2cf9f', '#5a4433', '#b48b54'], motif: 'lines' },
    { id: 'channels', title: '频道精选', href: 'https://linguista.cn/library/#channels', meta: '按频道浏览阅读内容', icon: 'radio', palette: ['#4d6653', '#f4efda', '#acc7a4'], motif: 'grid' },
  ]),
  hinbox: moduleItems('hinbox', [
    { id: 'notes', title: 'Notes', href: 'https://linguista.cn/hinbox/?label=Notes', meta: '阅读笔记', icon: 'eye', palette: ['#dae7dc', '#294e41', '#76a587'], motif: 'arch' },
    { id: 'essays', title: 'Essays', href: 'https://linguista.cn/hinbox/?label=Essays', meta: '思想、方法与个人判断', icon: 'book-open', palette: ['#503e58', '#f8ead9', '#b89bc4'], motif: 'lines' },
    { id: 'talks', title: 'Talks', href: 'https://linguista.cn/hinbox/?label=Talks', meta: '访谈、演讲与课堂整理', icon: 'video', palette: ['#844f3e', '#fff0dc', '#d6a476'], motif: 'diagonal' },
    { id: 'reports', title: 'Reports', href: 'https://linguista.cn/hinbox/?label=Reports', meta: '长文与研究笔记', icon: 'file-text', palette: ['#d8e1ed', '#294362', '#8da6c5'], motif: 'grid' },
  ]),
  science: moduleItems('science', [
    { id: 'reports', title: '调研', href: 'https://linguista.cn/sci-notes/category/调研报告/', meta: '长篇综述与调研报告', icon: 'file-text', palette: ['#c9d8e5', '#28465b', '#88a9c0'], motif: 'lines' },
    { id: 'dynamics', title: '动力系统', href: 'https://linguista.cn/sci-notes/category/动力系统/', meta: '动力系统的学习和实践', icon: 'chart-spline', palette: ['#325859', '#f3edd7', '#8fb6ae'], motif: 'arch' },
    { id: 'engineering', title: '工程设计', href: 'https://linguista.cn/sci-notes/category/工程设计/', meta: '工程设计的学习和实践', icon: 'ruler', palette: ['#d9bf92', '#4f3d2a', '#af8856'], motif: 'grid' },
    { id: 'algorithms', title: '算法理论', href: 'https://linguista.cn/sci-notes/category/算法理论/', meta: '算法理论的学习和实践', icon: 'workflow', palette: ['#534f76', '#f0e8fa', '#b5acd8'], motif: 'diagonal' },
    { id: 'status', title: '随手记', href: 'https://linguista.cn/sci-notes/status/', meta: '随手记录与更新', icon: 'messages', palette: ['#e0c4bd', '#653f42', '#bc8b87'], motif: 'lines' },
  ]),
};
// These links browse indexes or site information; they do not become content cards.
const shelfLinks = {
  hinbox: [
    { title: 'People', href: 'https://linguista.cn/hinbox/?label=People' },
    { title: 'Tags', href: 'https://linguista.cn/hinbox/?label=Tags' },
    { title: 'Media', href: 'https://linguista.cn/hinbox/?label=Media' },
  ],
  science: [
    { title: '文章', href: 'https://linguista.cn/sci-notes/archives/' },
    { title: '分类', href: 'https://linguista.cn/sci-notes/categories/' },
    { title: '关于', href: 'https://linguista.cn/sci-notes/about/' },
  ],
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}
// Same collection palettes and book-cover hierarchy as the main-site carousel.
const coverCollections = {
  library: { colors: [['#274c78', '#f4df9c'], ['#3c5550', '#f2e2bc'], ['#573e46', '#f8e5ce']] },
  alpaca: { colors: [['#52634b', '#f1e6c5'], ['#d4c6a0', '#3f4b36'], ['#b8d1bf', '#25483e']] },
  hinbox: { colors: [['#733d48', '#f6dfba'], ['#e6daca', '#6a3d3c'], ['#8a4437', '#fff0c3']] },
  science: { colors: [['#334751', '#d6e4d0'], ['#cfdddf', '#254554'], ['#e2b86b', '#442b27']] },
};
function coverDesign(item, group) {
  const source = item.cover || item;
  const hash = [...(source.href || item.key)].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const collection = coverCollections[group] || coverCollections.library;
  const [background, ink, accent = ink] = item.palette || collection.colors[hash % collection.colors.length];
  const transparentIcons = {
    './assets/linguista/hinbox.svg': './assets/linguista/dock-hinbox.svg',
    './assets/linguista/person-entry-face.svg': './assets/linguista/dock-library.svg',
    './assets/linguista/whats-old-favicon.svg': './assets/linguista/dock-whats-old.svg',
  };
  const image = source.image || item.coverImage;
  return { source, background, ink, accent, image: transparentIcons[image] || image };
}
function applyReadingCover(card, item, group) {
  const { source, background, ink, accent, image } = coverDesign(item, group);
  card.classList.add('reading-card');
  card.dataset.coverKind = item.isModule ? 'module' : 'article';
  card.dataset.motif = item.motif || '';
  card.style.setProperty('--cover-accent', accent);
  card.dataset.art = source.imageStyle === 'icon' ? 'icon' : 'photo';
  card.style.setProperty('--cover-bg', background);
  card.style.setProperty('--cover-ink', ink);
  card.style.setProperty('--reading-image', image ? `url("${image}")` : 'none');
}
featuredItems.forEach((item, index) => {
  const group = { AlpacaNotes: 'alpaca', Library: 'library', Hinbox: 'hinbox' }[item.site] || 'science';
  applyReadingCover(slideSources[index].querySelector('.feature-card'), item, group);
});
['workshop', 'bookmarks', 'about', 'science'].forEach(id => {
  const panel = document.querySelector(`#${id}`);
  const image = panel.querySelector('.panel-photo, .site-art img');
  applyReadingCover(panel, cardGroups.home.find(item => item.panel === id) || { key: id, image: image.getAttribute('src'), imageStyle: 'icon' }, id === 'science' ? 'science' : 'home');
});
function miniCover(item, group) {
  const { source, background, ink, accent, image: imageSource } = coverDesign(item, group);
  const cover = document.createElement('span');
  cover.className = `mini-book ${source.imageStyle === 'icon' ? 'mini-book-icon' : 'mini-book-photo'}`;
  cover.setAttribute('aria-hidden', 'true');
  cover.dataset.coverKind = item.isModule ? 'module' : 'article';
  cover.dataset.motif = item.motif || '';
  cover.style.setProperty('--cover-accent', accent);
  cover.style.setProperty('--cover-bg', background);
  cover.style.setProperty('--cover-ink', ink);
  cover.style.setProperty('--cover-invert', ink.startsWith('#f') || ink.startsWith('#d6') ? '1' : '0');
  if (imageSource) {
    if (item.isModule && source.imageStyle === 'icon') {
      const glyph = document.createElement('span');
      glyph.className = 'module-glyph';
      glyph.style.setProperty('--module-image', `url("${imageSource}")`);
      cover.append(glyph);
    } else {
      const image = document.createElement('img');
      image.className = 'mini-book-background'; image.src = imageSource; image.alt = ''; image.draggable = false;
      cover.append(image);
    }
  }
  const shade = document.createElement('span'); shade.className = 'mini-book-shade';
  const label = document.createElement('span'); label.className = 'mini-book-label'; label.textContent = source.site || groupLabels[group];
  const title = document.createElement('strong'); title.className = 'mini-book-title'; title.textContent = source.coverTitle || item.shortTitle || item.title;
  const subtitle = document.createElement('span'); subtitle.className = 'mini-book-subtitle'; subtitle.textContent = source.coverSubtitle || item.category || '';
  cover.append(shade);
  if (!item.isModule) cover.append(label);
  cover.append(title);
  if (!item.isModule && subtitle.textContent) cover.append(subtitle);
  return cover;
}
function closeNewsletter({ restoreFocus = false } = {}) {
  if (!newsletterIsOpen()) return;
  setNewsletterOpen(false, restoreFocus || newsletterPages.contains(document.activeElement));
}
function setNewsletterOpen(open, focus = false) {
  newsletterFold.dataset.flipped = String(open);
  newsletterToggle.setAttribute('aria-expanded', String(open));
  newsletterToggle.setAttribute('aria-hidden', String(open));
  newsletterToggle.inert = open;
  newsletterPages.setAttribute('aria-hidden', String(!open));
  newsletterPages.inert = !open;
  if (open && mobile.matches) {
    closeShelf({ restoreFocus: false });
    closePanel({ restoreFocus: false, immediate: true });
  }
  if (focus) (open ? newsletterBack : newsletterToggle).focus({ preventScroll: true });
  syncPlayback();
}
newsletterBack.hidden = false;
newsletterPages.inert = true;
newsletterPages.setAttribute('aria-hidden', 'true');
newsletterToggle.addEventListener('click', () => setNewsletterOpen(true, true));
newsletterBack.addEventListener('click', () => closeNewsletter({ restoreFocus: true }));
newsletterPages.addEventListener('click', event => {
  if (!event.target.closest('a, button') && !window.getSelection()?.toString()) closeNewsletter({ restoreFocus: true });
});
panels.forEach(panel => {
  panel.hidden = false;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  panel.querySelector('.panel-heading h2').tabIndex = -1;
  panel.querySelector('.panel-close').hidden = false;
});
const dockApps = document.querySelector('.dock-apps');
const dockIndicator = document.createElement('span');
dockIndicator.className = 'dock-indicator';
dockIndicator.setAttribute('aria-hidden', 'true');
dockApps.append(dockIndicator);
function updateDockIndicator() {
  const active = dockApps.querySelector('.dock-item.is-active');
  dockIndicator.style.opacity = active ? '1' : '0';
  if (active) dockIndicator.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - 24) / 2}px)`;
}
new ResizeObserver(updateDockIndicator).observe(dockApps);
dockButtons.forEach(button => {
  button.setAttribute('aria-controls', 'card-shelf');
  button.setAttribute('aria-expanded', 'false');
});
triggers.forEach(trigger => {
  trigger.setAttribute('aria-controls', trigger.dataset.openPanel);
  trigger.setAttribute('aria-expanded', 'false');
});
function updateNavigation() {
  dockButtons.forEach(button => {
    const group = button.dataset.cardGroup;
    button.setAttribute('aria-expanded', String(shelfGroup === group));
    button.classList.toggle('is-active', group === (shelfGroup || contentGroup));
    if (group === contentGroup) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  triggers.forEach(trigger => {
    const open = trigger.dataset.openPanel === currentPanel?.id;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('is-active', open);
  });
  shelfTrack.querySelectorAll('.mini-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cardKey === selectedKey)));
  updateDockIndicator();
}
function syncMainContent() {
  const feature = document.querySelector('.feature');
  feature.classList.toggle('has-detail', Boolean(currentPanel));
  slideSources.forEach(slide => {
    const hidden = Boolean(currentPanel) || !slide.classList.contains('is-active');
    slide.inert = hidden;
    slide.setAttribute('aria-hidden', String(hidden));
  });
  document.querySelector('.feature-bottom').inert = Boolean(currentPanel);
  syncPlayback();
}
function closePanel({ restoreFocus = true, immediate = false } = {}) {
  if (!currentPanel) return;
  const panel = currentPanel;
  const fallback = dockButtons.find(button => button.dataset.cardGroup === contentGroup) || homeButton;
  cancelMotion(panel);
  panel.style.removeProperty('transform');
  panel.removeAttribute('data-open');
  panel.setAttribute('data-closing', '');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  currentPanel = null;
  contentGroup = 'home';
  selectedKey = '';
  syncMainContent();
  updateNavigation();
  if (restoreFocus) {
    const target = returnFocus?.isConnected && returnFocus.getClientRects().length && !returnFocus.closest('[inert]') ? returnFocus : fallback;
    suppressFocusPreview = true;
    target.focus({ preventScroll: true });
    suppressFocusPreview = false;
  }
  const complete = () => panel.removeAttribute('data-closing');
  if (immediate) complete();
  else move(panel, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, complete });
}
function openPanel(id, trigger, { focus = true } = {}) {
  const panel = panels.find(item => item.id === id);
  if (!panel) return;
  if (mobile.matches) closeNewsletter();
  closePanel({ restoreFocus: false, immediate: true });
  returnFocus = mobile.matches && trigger?.closest('#newsletter-pages') ? newsletterToggle : trigger || homeButton;
  currentPanel = panel;
  document.querySelector('.feature').classList.add('is-browsing');
  cancelMotion(panel);
  panel.removeAttribute('data-closing');
  panel.style.removeProperty('transform');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('data-open', '');
  panel.scrollTop = 0;
  panel.querySelector('.panel-body').scrollTop = 0;
  syncMainContent();
  updateNavigation();
  move(panel, [{ opacity: 0 }, { opacity: 1 }]);
  if (focus) panel.querySelector('.panel-heading h2').focus({ preventScroll: true });
}
function updateShelfArrows() {
  const max = shelfTrack.scrollWidth - shelfTrack.clientWidth;
  const previous = document.querySelector('#shelf-previous');
  const next = document.querySelector('#shelf-next');
  previous.disabled = shelfTrack.scrollLeft <= 2;
  next.disabled = shelfTrack.scrollLeft >= max - 2;
  previous.hidden = next.hidden = max <= 2;
}
function closeShelf({ restoreFocus = true } = {}) {
  if (!shelfGroup) return;
  cancelMotion(shelf);
  shelfGroup = null;
  shelf.hidden = true;
  document.querySelector('#search-button').inert = false;
  document.querySelector('#search-button').removeAttribute('aria-hidden');
  document.querySelector('.feature').classList.remove('has-shelf');
  syncPlayback();
  updateNavigation();
  if (restoreFocus) shelfReturnFocus.focus({ preventScroll: true });
}
function openShelf(group, trigger = homeButton) {
  if (shelfGroup === group) { closeShelf(); return; }
  if (mobile.matches) {
    closeNewsletter();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  shelfGroup = group;
  syncPlayback();
  shelfReturnFocus = trigger;
  const siteLink = document.querySelector('#shelf-site');
  siteLink.textContent = sites[group].title;
  siteLink.href = sites[group].href;
  document.querySelector('#shelf-description').textContent = sites[group].description;
  const links = shelfLinks[group] || [];
  const indexNav = document.querySelector('#shelf-links');
  indexNav.replaceChildren(...links.map(item => {
    const link = document.createElement('a');
    link.href = item.href; link.textContent = item.title;
    return link;
  }));
  indexNav.hidden = links.length === 0;
  indexNav.setAttribute('aria-label', `${groupLabels[group]} 索引与导航`);
  shelfTrack.replaceChildren(...cardGroups[group].map(item => {
    const button = document.createElement('button');
    button.className = 'mini-card mini-card-cover';
    button.dataset.cardKey = item.key;
    button.setAttribute('aria-label', item.title);
    button.setAttribute('aria-controls', 'featured');
    button.append(miniCover(item, group));
    button.addEventListener('click', () => showItem(item, group, button));
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && hoverPointer.matches && !button.disabled) showItem(item, group, button, { focus: false });
    });
    button.addEventListener('focus', () => {
      if (!suppressFocusPreview && !mobile.matches && button.matches(':focus-visible')) showItem(item, group, button, { focus: false });
    });
    return button;
  }));
  shelfTrack.append(indexNav);
  shelf.hidden = false;
  document.querySelector('#search-button').inert = true;
  document.querySelector('#search-button').setAttribute('aria-hidden', 'true');
  document.querySelector('.feature').classList.add('has-shelf');
  shelfTrack.scrollLeft = 0;
  updateNavigation();
  updateShelfArrows();
  move(shelf, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }]);
  // Keep focus on the dock so repeated activation can fold the shelf.
}
function showItem(item, group, trigger, { focus = true } = {}) {
  document.querySelector('.feature').classList.add('is-browsing');
  // Hover keeps keyboard focus in place; revisiting a card preserves its form/scroll state.
  if (selectedKey === item.key && contentGroup === group) {
    if (focus) {
      if (mobile.matches) closeShelf({ restoreFocus: false });
      (currentPanel?.querySelector('.panel-heading h2') || slideSources[slideIndex].querySelector('h1, h2')).focus({ preventScroll: true });
    }
    return;
  }
  detailBody.replaceChildren();
  if (item.slide !== undefined) {
    closePanel({ restoreFocus: false, immediate: true });
    setSlide(item.slide, focus, focus);
    const title = slideSources[item.slide].querySelector('h1, h2');
    title.tabIndex = -1;
    if (focus) title.focus({ preventScroll: true });
  } else if (item.panel) {
    openPanel(item.panel, mobile.matches ? shelfReturnFocus : trigger, { focus });
  } else {
    document.querySelector('#detail-title').textContent = item.title;
    document.querySelector('#detail-category').textContent = groupLabels[group];
    applyReadingCover(detail, item, group);
    const copy = document.createElement('div'); copy.className = 'detail-copy';
    const meta = document.createElement('p'); meta.className = 'detail-meta'; meta.textContent = item.meta;
    const link = document.createElement('a'); link.className = 'read-button'; link.href = item.href;
    const label = document.createElement('span'); label.textContent = item.action;
    link.append(label, icon('i-arrow')); copy.append(meta);
    if (item.description) {
      const description = document.createElement('p'); description.className = 'detail-description'; description.textContent = item.description; copy.append(description);
    }
    copy.append(link); detailBody.append(copy);
    openPanel('content-detail', mobile.matches ? shelfReturnFocus : trigger, { focus });
  }
  contentGroup = group;
  selectedKey = item.key;
  // On phones, selection hands the available space back to the reading card.
  if (focus && mobile.matches) closeShelf({ restoreFocus: false });
  updateNavigation();
}
triggers.forEach(trigger => trigger.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  closeShelf({ restoreFocus: false });
  openPanel(trigger.dataset.openPanel, trigger);
}));
dockButtons.forEach(button => button.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openShelf(button.dataset.cardGroup, button);
  if (event.detail === 0 && shelfGroup) shelfTrack.querySelector('button')?.focus({ preventScroll: true });
}));
dockButtons.forEach(button => button.addEventListener('keydown', event => {
  if (event.key !== 'ArrowUp') return;
  event.preventDefault();
  if (shelfGroup !== button.dataset.cardGroup) openShelf(button.dataset.cardGroup, button);
  shelfTrack.querySelector('button')?.focus({ preventScroll: true });
}));
panels.forEach(panel => panel.querySelector('.panel-close').addEventListener('click', () => closePanel()));
document.querySelector('#shelf-close').addEventListener('click', () => closeShelf());
['previous', 'next'].forEach(direction => document.querySelector(`#shelf-${direction}`).addEventListener('click', () => {
  shelfTrack.scrollBy({ left: (direction === 'next' ? 1 : -1) * shelfTrack.clientWidth * .8, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}));
shelfTrack.addEventListener('scroll', updateShelfArrows, { passive: true });
new ResizeObserver(updateShelfArrows).observe(shelfTrack);
shelfTrack.addEventListener('keydown', event => {
  const buttons = [...shelfTrack.querySelectorAll('button:not([hidden]), a')];
  const index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
  if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  if (next === undefined) return;
  event.preventDefault(); event.stopPropagation();
  buttons[next].focus({ preventScroll: true });
  buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
});
document.addEventListener('click', event => {
  if (shelfGroup && !event.target.closest('#card-shelf, .app-panel, .dock, #search-dialog')) closeShelf({ restoreFocus: false });
});
mobile.addEventListener('change', () => {
  placeModuleLinks();
  if (mobile.matches && (currentPanel || shelfGroup)) closeNewsletter();
  updateNavigation();
});
panels.forEach(panel => trackDrag(panel, {
  axis: 'y',
  canStart: event => mobile.matches && currentPanel === panel && !event.target.closest('button, a') && event.target.closest('.sheet-handle, .panel-heading'),
  onMove: delta => { cancelMotion(panel); panel.style.transform = `translateY(${Math.max(0, delta)}px)`; },
  onEnd: (delta, cancelled) => {
    if (currentPanel !== panel) return;
    if (!cancelled && delta > Math.min(96, panel.offsetHeight * .25)) { closePanel(); return; }
    const transform = panel.style.transform || 'none';
    panel.style.removeProperty('transform');
    move(panel, [{ transform }, { transform: 'none' }], { duration: 180 });
  },
}));

// The main site's 13 selections, with a draggable cursor and pausable autoplay.
const slides = [...document.querySelectorAll('[data-slide]')];
const feature = document.querySelector('.feature');
const positionControl = document.querySelector('#slide-position');
const previousSlide = document.querySelector('#previous-slide');
const nextSlide = document.querySelector('#next-slide');
let slideIndex = 0;
let autoDirection = 1;
let playbackTimer;
let pointerReading = hoverPointer.matches && feature.matches(':hover');
let carouselDragging = false;
syncPlayback = () => {
  clearTimeout(playbackTimer);
  const keyboardReading = feature.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
  if (reducedMotion.matches || document.hidden || pointerReading || keyboardReading || carouselDragging || currentPanel || shelfGroup || newsletterIsOpen() || document.querySelector('#search-dialog').open) return;
  playbackTimer = setTimeout(() => {
    if (slideIndex === slides.length - 1) autoDirection = -1;
    else if (slideIndex === 0) autoDirection = 1;
    setSlide(slideIndex + autoDirection, false, false);
  }, 7000);
};
function setSlide(index, announce = true, focus = true, instant = false) {
  const previousIndex = slideIndex;
  const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
  selectedKey = featuredItems[nextIndex].key;
  const moveReadingFocus = slides[slideIndex].contains(document.activeElement);
  slideIndex = nextIndex;
  slides.forEach((slide, position) => {
    const card = slide.querySelector('.feature-card');
    cancelMotion(card);
    card.style.removeProperty('transform');
    card.scrollTop = 0;
    const active = position === slideIndex;
    slide.classList.remove('is-leaving');
    slide.classList.toggle('is-active', active);
    slide.inert = !active;
    slide.setAttribute('aria-hidden', String(!active));
  });
  if (!instant && !reducedMotion.matches && slideIndex !== previousIndex) {
    const direction = index > previousIndex ? 1 : -1;
    const distance = feature.clientWidth;
    const previous = slides[previousIndex];
    previous.classList.add('is-leaving');
    move(previous.querySelector('.feature-card'), [{ transform: 'none' }, { transform: `translateX(${-direction * distance}px)` }], { duration: 480, complete: () => previous.classList.remove('is-leaving') });
    move(slides[slideIndex].querySelector('.feature-card'), [{ transform: `translateX(${direction * distance}px)` }, { transform: 'none' }], { duration: 480 });
  }
  positionControl.value = String(slideIndex);
  positionControl.setAttribute('aria-valuetext', `第 ${slideIndex + 1} 项，共 ${slides.length} 项：${featuredItems[slideIndex].title}`);
  previousSlide.disabled = slideIndex === 0;
  nextSlide.disabled = slideIndex === slides.length - 1;
  document.querySelector('#slide-number').textContent = String(slideIndex + 1).padStart(2, '0');
  if (focus && moveReadingFocus) slides[slideIndex].querySelector('.read-button').focus({ preventScroll: true });
  syncMainContent();
  updateNavigation();
  if (announce) document.querySelector('#slide-status').textContent = positionControl.getAttribute('aria-valuetext');
}
document.querySelector('.carousel-arrows').hidden = false;
document.querySelector('.feature-bottom').hidden = false;
previousSlide.addEventListener('click', () => setSlide(slideIndex - 1));
nextSlide.addEventListener('click', () => setSlide(slideIndex + 1));
positionControl.addEventListener('input', () => setSlide(Number(positionControl.value), true, false, true));
positionControl.addEventListener('pointerdown', () => { carouselDragging = true; syncPlayback(); });
positionControl.addEventListener('keydown', event => {
  const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 3, PageDown: -3 }[event.key];
  if (!step && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  setSlide(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : slideIndex + step, true, false, true);
});
feature.addEventListener('pointerenter', event => {
  if (event.pointerType !== 'mouse') return;
  pointerReading = true; syncPlayback();
});
feature.addEventListener('pointerleave', event => {
  if (event.pointerType !== 'mouse') return;
  pointerReading = false; syncPlayback();
});
feature.addEventListener('focusin', syncPlayback);
feature.addEventListener('focusout', () => queueMicrotask(syncPlayback));
document.addEventListener('visibilitychange', syncPlayback);
reducedMotion.addEventListener('change', syncPlayback);
['pointerup', 'pointercancel', 'blur'].forEach(type => window.addEventListener(type, () => {
  carouselDragging = false;
  syncPlayback();
}));
feature.addEventListener('keydown', event => {
  if (!currentPanel && !event.target.closest('#card-shelf, input, textarea') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    setSlide(slideIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
setSlide(0, false);

trackDrag(feature, {
  axis: 'x',
  canStart: event => {
    const allowed = !currentPanel && !shelfGroup && !newsletterIsOpen() && !event.target.closest('a, button, input') && (event.pointerType !== 'mouse' || event.target.closest('.feature-card'));
    if (allowed) { carouselDragging = true; syncPlayback(); }
    return allowed;
  },
  onMove: delta => {
    const card = slides[slideIndex].querySelector('.feature-card');
    cancelMotion(card);
    card.style.transform = `translateX(${Math.max(-42, Math.min(42, delta * .28))}px)`;
  },
  onEnd: (delta, cancelled) => {
    const card = slides[slideIndex].querySelector('.feature-card');
    const transform = card.style.transform || 'none';
    card.style.removeProperty('transform');
    if (!cancelled && Math.abs(delta) >= 60) setSlide(slideIndex + (delta < 0 ? 1 : -1));
    else move(card, [{ transform }, { transform: 'none' }], { duration: 180 });
  },
});
let wheelDistance = 0;
let lastWheelTime = 0;
feature.addEventListener('wheel', event => {
  if (currentPanel || shelfGroup || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.ctrlKey) return;
  event.preventDefault();
  if (event.timeStamp - lastWheelTime > 200) wheelDistance = 0;
  lastWheelTime = event.timeStamp;
  wheelDistance += event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? feature.clientWidth : 1);
  if (Math.abs(wheelDistance) >= 80) {
    setSlide(slideIndex + Math.sign(wheelDistance));
    wheelDistance = 0;
  }
}, { passive: false });

const themeButton = document.querySelector('#theme-button');
themeButton.hidden = false;
function updateThemeControl() {
  const dark = root.dataset.theme === 'dark';
  themeButton.setAttribute('aria-label', dark ? '切换为浅色主题' : '切换为深色主题');
  themeButton.title = dark ? '切换为浅色主题' : '切换为深色主题';
  themeButton.setAttribute('aria-pressed', String(!dark));
  document.querySelector('meta[name="theme-color"]').content = dark ? '#191c1d' : '#f3f2eb';
}
themeButton.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('linguista-home-theme', root.dataset.theme); } catch { /* Optional storage. */ }
  updateThemeControl();
});
updateThemeControl();

const searchButton = document.querySelector('#search-button');
let searchReturnFocus = searchButton;
const searchDialog = document.querySelector('#search-dialog');
const input = document.querySelector('#search-input');
const list = document.querySelector('#search-results');
const searchStatus = document.querySelector('#search-status');
const entries = [...document.querySelectorAll('[data-search]')].map(link => ({
  terms: link.dataset.search.toLocaleLowerCase(), title: link.dataset.searchTitle, href: link.href,
}));
Object.entries(cardGroups).forEach(([group, items]) => items.filter(item => item.href).forEach(item => {
  entries.push({ terms: `${groupLabels[group]} ${item.title} ${item.meta}`.toLocaleLowerCase(), title: `${groupLabels[group]} · ${item.title}`, href: item.href });
}));
Object.entries(shelfLinks).forEach(([group, links]) => links.forEach(item => {
  entries.push({ terms: `${groupLabels[group]} ${item.title}`.toLocaleLowerCase(), title: `${groupLabels[group]} · ${item.title}`, href: item.href });
}));
const uniqueEntries = [...new Map(entries.map(entry => [entry.href, entry])).values()];
function renderResults() {
  const query = input.value.trim().toLocaleLowerCase();
  const matches = uniqueEntries.filter(entry => query.split(/\s+/).every(term => entry.terms.includes(term)));
  searchStatus.textContent = query ? (matches.length ? `找到 ${matches.length} 个入口` : '没有找到，试试「周刊」「数学」或「笔记」。') : '栏目与选读文章';
  list.replaceChildren(...matches.map(entry => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = entry.href;
    const title = document.createElement('span');
    title.textContent = entry.title;
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    link.append(title, arrow);
    li.append(link);
    return li;
  }));
}
function openSearch(trigger = searchButton) {
  if (searchDialog.open) return;
  searchReturnFocus = trigger;
  closeShelf({ restoreFocus: false });
  input.value = '';
  renderResults();
  searchDialog.showModal();
  syncPlayback();
  input.focus();
}
searchButton.hidden = false;
searchButton.addEventListener('click', () => openSearch(searchButton));
document.querySelector('#close-search').addEventListener('click', () => searchDialog.close());
searchDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    // Search inputs otherwise consume the first Escape to clear their value.
    event.preventDefault();
    event.stopPropagation();
    searchDialog.close();
  }
}, { capture: true });
searchDialog.addEventListener('click', event => {
  const rect = searchDialog.getBoundingClientRect();
  if (event.target === searchDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) searchDialog.close();
});
searchDialog.addEventListener('close', () => {
  const target = searchReturnFocus.getClientRects().length && !searchReturnFocus.closest('[inert]') ? searchReturnFocus : searchButton;
  target.focus({ preventScroll: true });
  syncPlayback();
});
input.addEventListener('input', renderResults);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !searchDialog.open) {
    event.preventDefault();
    if (shelfGroup) closeShelf();
    else if (currentPanel) closePanel();
    else closeNewsletter({ restoreFocus: true });
  }
  const typing = event.target.closest('input, textarea, [contenteditable="true"]');
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    openSearch();
  }
});
function readHash() {
  const id = location.hash.slice(1);
  const group = id === 'featured' ? 'home' : id;
  const trigger = dockButtons.find(button => button.dataset.cardGroup === group);
  if (cardGroups[group]) {
    if (shelfGroup !== group) openShelf(group, trigger);
  } else if (triggers.some(button => button.dataset.openPanel === id)) {
    closeShelf({ restoreFocus: false });
    openPanel(id, triggers.find(button => button.dataset.openPanel === id));
  }
}
window.addEventListener('hashchange', readHash);
readHash();
