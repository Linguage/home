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
  if (reducedMotion.matches || root.hasAttribute('data-navigation-drag')) { complete?.(); return; }
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
function trackDrag(surface, { axis, canStart, onMove, onEnd, onTap }) {
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
    } else if (!cancelled) onTap?.();
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
  surface.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    if (drag.active) {
      drag.delta = axis === 'x' ? event.clientX - drag.x : event.clientY - drag.y;
      onMove(drag.delta);
    }
    finish(false);
  });
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
  return () => finish(true);
}

// The dock chooses a shelf; the shelf chooses content for the main screen.
const panels = [...document.querySelectorAll('[data-panel]')];
const triggers = [...document.querySelectorAll('[data-open-panel]')];
const homeButton = document.querySelector('#home-button');
const dockButtons = [...document.querySelectorAll('[data-card-group]')];
const mobile = matchMedia('(max-width: 900px)');
const hoverPointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
let suppressFocusPreview = false;
const shelf = document.querySelector('#card-shelf');
const shelfTrack = document.querySelector('#shelf-track');
const detail = document.querySelector('#content-detail');
const detailBody = document.querySelector('#detail-body');
const detailMedia = document.createElement('div'); detailMedia.className = 'link-preview-media'; detailMedia.setAttribute('aria-hidden', 'true');
const detailImage = document.createElement('img'); detailImage.alt = ''; detailMedia.append(detailImage); detail.prepend(detailMedia);
let shelfGroup = null;
let contentGroup = 'home';
let selectedKey = '';
let currentPanel = null;
let syncPlayback = () => {};
let returnFocus = homeButton;
let shelfReturnFocus = homeButton;
// sync:sites:start
const sites = {
  "home": {
    "title": "Linguista",
    "href": "https://linguista.cn/",
    "description": "所读 · 所思 · 所想"
  },
  "alpaca": {
    "title": "AlpacaNotes",
    "href": "https://linguista.cn/alpacanotes/",
    "description": "我的博客，不定期更新，记录我的学习与思考。"
  },
  "library": {
    "title": "Library",
    "href": "https://linguista.cn/library/",
    "description": "按人物、频道和课程整理值得连续阅读的内容。"
  },
  "hinbox": {
    "title": "Hinbox",
    "href": "https://linguista.cn/hinbox/",
    "description": "用收件箱整理文章、研究笔记、访谈和演讲。"
  },
  "science": {
    "title": "what's old",
    "href": "https://linguista.cn/sci-notes/",
    "description": "记录我在科学技术领域的学习和实践。"
  }
};
// sync:sites:end
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
// sync:modules:start
const cardGroups = {
  home: [
  {
    "key": "newsletter",
    "title": "Newsletter",
    "meta": "按期阅读，也可以回到原文。",
    "href": "https://linguista.cn/newsletter/",
    "description": "按期阅读，也可以回到原文。",
    "action": "进入Newsletter",
    "image": "./assets/modules/home-newsletter.svg",
    "imageStyle": "icon",
    "palette": [
      "#efe0bc",
      "#4d4930",
      "#c0a56c"
    ],
    "isModule": true
  },
  {
    "key": "workshop",
    "title": "Workshop",
    "meta": "浏览原创项目的用途、实现方式与技术更新，并进入公开仓库。",
    "href": "https://linguista.cn/workshop/",
    "description": "浏览原创项目的用途、实现方式与技术更新，并进入公开仓库。",
    "action": "进入工坊",
    "image": "./assets/modules/home-workshop.svg",
    "imageStyle": "icon",
    "palette": [
      "#5d735d",
      "#fff3d9",
      "#a2bc8e"
    ],
    "isModule": true
  },
  {
    "key": "bookmarks",
    "title": "Bookmarks",
    "meta": "精心整理的阅读清单与个人知识库，涵盖技术探索与设计美学的珍贵碎片。",
    "href": "https://linguista.cn/bookmarks",
    "description": "精心整理的阅读清单与个人知识库，涵盖技术探索与设计美学的珍贵碎片。",
    "action": "浏览收藏",
    "image": "./assets/modules/home-bookmarks.svg",
    "imageStyle": "icon",
    "palette": [
      "#b7cad4",
      "#28444b",
      "#6d94a7"
    ],
    "isModule": true
  },
  {
    "key": "about",
    "title": "About",
    "meta": "分享个人的所读、所思与所想。通过跨学科的视角，观察数字时代的极简主义与结构化表达。致力于知识边界的无缝对接。",
    "href": "https://linguista.cn/about",
    "description": "分享个人的所读、所思与所想。通过跨学科的视角，观察数字时代的极简主义与结构化表达。致力于知识边界的无缝对接。",
    "action": "了解本站",
    "image": "./assets/modules/home-about.svg",
    "imageStyle": "icon",
    "palette": [
      "#6c4149",
      "#f9e7d8",
      "#c59494"
    ],
    "isModule": true
  }
],
  alpaca: moduleItems('alpaca', [
  {
    "id": "notes",
    "title": "Writes",
    "href": "https://linguista.cn/alpacanotes/notes",
    "meta": "Essay 与 Notes：文章、评论和日常笔记。",
    "icon": "alpaca-notes",
    "palette": [
      "#e0d2b4",
      "#51432d",
      "#a78c59"
    ],
    "motif": "lines",
    "shortMeta": "文章与随笔"
  },
  {
    "id": "readings",
    "title": "Reads",
    "href": "https://linguista.cn/alpacanotes/readings",
    "meta": "阅读近况、已读归档与书评。",
    "icon": "alpaca-readings",
    "palette": [
      "#c9d8e5",
      "#28465b",
      "#88a9c0"
    ],
    "motif": "lines",
    "shortMeta": "阅读近况与书评"
  },
  {
    "id": "topics",
    "title": "Topics",
    "href": "https://linguista.cn/alpacanotes/topics",
    "meta": "赛事、工作流与项目记录的专题目录。",
    "icon": "alpaca-topics",
    "palette": [
      "#3d6865",
      "#f2ead8",
      "#9ec8bb"
    ],
    "motif": "grid",
    "shortMeta": "专题与项目"
  },
  {
    "id": "prompts",
    "title": "Prompts",
    "href": "https://linguista.cn/alpacanotes/prompts",
    "meta": "A collection of AI art prompts and experiments.",
    "icon": "alpaca-prompts",
    "palette": [
      "#65455c",
      "#fbebdd",
      "#c9a1bd"
    ],
    "motif": "arch",
    "shortMeta": "AI 绘画提示词"
  }
]),
  library: moduleItems('library', [
  {
    "id": "persons",
    "title": "人物文集",
    "href": "https://linguista.cn/library/#persons",
    "meta": "按作者浏览文集",
    "icon": "library-persons",
    "palette": [
      "#294763",
      "#f4ead2",
      "#b9cfe0"
    ],
    "motif": "arch",
    "shortMeta": "作者文集"
  },
  {
    "id": "courses",
    "title": "图书与课程",
    "href": "https://linguista.cn/library/#courses",
    "meta": "图书与课程书架",
    "icon": "library-courses",
    "palette": [
      "#e2cf9f",
      "#5a4433",
      "#b48b54"
    ],
    "motif": "lines",
    "shortMeta": "图书与课程"
  },
  {
    "id": "channels",
    "title": "频道精选",
    "href": "https://linguista.cn/library/#channels",
    "meta": "按频道浏览阅读内容",
    "icon": "library-channels",
    "palette": [
      "#4d6653",
      "#f4efda",
      "#acc7a4"
    ],
    "motif": "grid",
    "shortMeta": "频道文章"
  }
]),
  hinbox: moduleItems('hinbox', [
  {
    "id": "essays",
    "title": "Essays",
    "href": "https://linguista.cn/hinbox/?label=Essays",
    "meta": "Essays 收录偏思想、方法与个人判断的文章。这里的内容不追求新闻速度，更关注一个观点如何被组织、一个问题如何被拆开，以及技术、学习、写作和社会之间的长线关系。",
    "icon": "hinbox-essays",
    "palette": [
      "#503e58",
      "#f8ead9",
      "#b89bc4"
    ],
    "motif": "lines",
    "shortMeta": "思想与方法"
  },
  {
    "id": "talks",
    "title": "Talks",
    "href": "https://linguista.cn/hinbox/?label=Talks",
    "meta": "Talks 收录访谈、演讲、课堂与长视频整理。这里保留视频入口，也把核心脉络整理成可阅读文本，方便在人物、主题和时间之间回看思想如何被说出来。",
    "icon": "hinbox-talks",
    "palette": [
      "#844f3e",
      "#fff0dc",
      "#d6a476"
    ],
    "motif": "diagonal",
    "shortMeta": "访谈与演讲"
  },
  {
    "id": "reports",
    "title": "Reports",
    "href": "https://linguista.cn/hinbox/?label=Reports",
    "meta": "Reports 收录围绕人工智能、计算系统、科学研究与技术社会影响的长文和研究笔记。这里的条目通常来自论文、机构博客、工程报告或高密度技术评论，更适合做主题追踪、概念索引和后续精读。",
    "icon": "hinbox-reports",
    "palette": [
      "#d8e1ed",
      "#294362",
      "#8da6c5"
    ],
    "motif": "grid",
    "shortMeta": "长文与研究"
  }
]),
  science: moduleItems('science', [
  {
    "id": "reports",
    "title": "调研",
    "href": "https://linguista.cn/sci-notes/articles/?category=%E8%B0%83%E7%A0%94%E6%8A%A5%E5%91%8A",
    "meta": "长篇综述与调研报告",
    "icon": "science-reports",
    "palette": [
      "#c9d8e5",
      "#28465b",
      "#88a9c0"
    ],
    "motif": "lines",
    "shortMeta": "综述与报告"
  },
  {
    "id": "dynamics",
    "title": "动力系统",
    "href": "https://linguista.cn/sci-notes/articles/?category=%E5%8A%A8%E5%8A%9B%E7%B3%BB%E7%BB%9F",
    "meta": "动力系统的学习和实践",
    "icon": "science-dynamics",
    "palette": [
      "#325859",
      "#f3edd7",
      "#8fb6ae"
    ],
    "motif": "arch",
    "shortMeta": "学习与实践"
  },
  {
    "id": "engineering",
    "title": "工程设计",
    "href": "https://linguista.cn/sci-notes/articles/?category=%E5%B7%A5%E7%A8%8B%E8%AE%BE%E8%AE%A1",
    "meta": "工程设计的学习和实践",
    "icon": "science-engineering",
    "palette": [
      "#d9bf92",
      "#4f3d2a",
      "#af8856"
    ],
    "motif": "grid",
    "shortMeta": "学习与实践"
  },
  {
    "id": "algorithms",
    "title": "算法理论",
    "href": "https://linguista.cn/sci-notes/articles/?category=%E7%AE%97%E6%B3%95%E7%90%86%E8%AE%BA",
    "meta": "算法理论的学习和实践",
    "icon": "science-algorithms",
    "palette": [
      "#534f76",
      "#f0e8fa",
      "#b5acd8"
    ],
    "motif": "diagonal",
    "shortMeta": "学习与实践"
  },
  {
    "id": "status",
    "title": "随手记",
    "href": "https://linguista.cn/sci-notes/status/",
    "meta": "随手记录与更新",
    "icon": "science-status",
    "palette": [
      "#e0c4bd",
      "#653f42",
      "#bc8b87"
    ],
    "motif": "lines",
    "shortMeta": "日常记录"
  }
]),
};
const shelfLinks = {};
// sync:modules:end

const extraModules = {"notion":{"title":"Notion","href":"https://linguista.notion.site/linguista-hub","description":"Linguista 与 Bullets 知识库。","items":[{"id":"linguista","title":"Linguista","href":"https://linguista.notion.site/linguista-hub","meta":"Linguista 知识库","icon":"notion-linguista","palette":["#e0d2b4","#51432d","#a78c59"],"motif":"lines"},{"id":"bullets","title":"Bullets","href":"https://app.notion.com/p/40cd1a1385bf80fda58de79dc91cc648","meta":"Bullets 知识库","icon":"notion-bullets","palette":["#3d6865","#f2ead8","#9ec8bb"],"motif":"grid"}]},"bearblog":{"title":"bearblog","href":"https://linguista.bearblog.dev/","description":"日常内容更新。","items":[{"id":"blog","title":"bearblog","href":"https://linguista.bearblog.dev/","meta":"Linguista 的 bearblog","icon":"bearblog-blog","palette":["#e0d2b4","#51432d","#a78c59"],"motif":"lines"}]}};
for (const [group, source] of Object.entries(extraModules)) {
  sites[group] = {title: source.title, href: source.href, description: source.description};
  groupLabels[group] = source.title;
  cardGroups[group] = moduleItems(group, source.items).map(item => ({...item, action: group === 'notion' ? '打开知识库' : '打开博客'}));
  shelfLinks[group] = [];
}


// Reuse the geometric originals identified in the archived Hugo homepage.
cardGroups.home.forEach(item => { item.image = `./assets/module-covers/home-${item.key}-art.svg`; });

function moduleArtwork(item, group) {
  if (group === 'alpaca' || group === 'bearblog') return `./assets/module-covers/${item.key}-art.svg`;
  return item.image;
}

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
    './assets/linguista/labs-icon.svg': './assets/linguista/workshop-mark.svg',
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
  card.dataset.material = item.isModule ? ({ home:'newspaper', alpaca:'notebook', library:'book', hinbox:'postcard', science:'journal' }[group] || group) : '';
  card.style.setProperty('--module-cover', item.isModule && group !== 'notion' ? `url("./assets/module-covers/${card.dataset.material}.svg")` : 'none');
  card.style.setProperty('--module-cover-landscape', item.isModule && group !== 'notion' ? `url("./assets/module-covers/${card.dataset.material}-landscape.svg")` : 'none');
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
      const glyph = document.createElement('img');
      glyph.className = 'module-glyph';
      glyph.src = imageSource;
      glyph.alt = '';
      glyph.draggable = false;
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
panels.forEach(panel => {
  panel.hidden = false;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  panel.querySelector('.panel-heading h2').tabIndex = -1;
  const close = panel.querySelector('.panel-close');
  if (close) close.hidden = false;
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
  if (root.dataset.viewMode === 'rss' && window.LinguistaHome) {window.LinguistaHome.setDock(root.dataset.rssSite || 'home'); return;}

  dockButtons.forEach(button => {
    const group = button.dataset.cardGroup;
    button.setAttribute('aria-controls', mobile.matches ? 'card-shelf' : group === 'home' ? 'home-modules' : 'site-sidebar');
    button.setAttribute('aria-expanded', String(mobile.matches ? shelfGroup === group : root.dataset.homeSite === group));
    button.classList.toggle('is-active', group === (root.dataset.homeSite || shelfGroup || contentGroup));
    if (group === (root.dataset.homeSite || contentGroup)) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  triggers.forEach(trigger => {
    const open = trigger.dataset.openPanel === currentPanel?.id;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('is-active', open);
  });
  document.querySelectorAll('#shelf-track .mini-card, .site-modules .site-module').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cardKey === selectedKey)));
  updateDockIndicator();
}
function syncMainContent() {
  const feature = document.querySelector('.feature');
  feature.classList.toggle('has-detail', Boolean(currentPanel));
  window.LinguistaSiteUI?.syncStage?.();
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
  closePanel({ restoreFocus: false, immediate: true });
  returnFocus = trigger || homeButton;
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
function reserveShelfSpace() {
  const stage = document.querySelector('.feature');
  if (shelf.hidden || mobile.matches) { stage.style.removeProperty('--shelf-clearance'); return; }
  const style = getComputedStyle(shelf);
  const clearance = shelf.offsetHeight + (parseFloat(style.bottom) || 0) + 10;
  stage.style.setProperty('--shelf-clearance', `${Math.max(0, clearance)}px`);
}
const shelfLayout = new ResizeObserver(reserveShelfSpace);
shelfLayout.observe(shelf);
shelfLayout.observe(document.querySelector('.feature'));
window.addEventListener('resize', reserveShelfSpace);

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
  document.querySelector('.feature').classList.remove('has-shelf');
  syncPlayback();
  updateNavigation();
  if (restoreFocus) shelfReturnFocus.focus({ preventScroll: true });
}
function openShelf(group, trigger = homeButton, { selectSite = true } = {}) {
  if (shelfGroup === group) return;
  if (selectSite && window.LinguistaSiteUI?.select) {
    window.LinguistaSiteUI.select(group);
    if (!mobile.matches) return;
  }
  shelfGroup = group;
  syncPlayback();
  shelfReturnFocus = trigger;
  const siteLink = document.querySelector('#shelf-site');
  siteLink.textContent = sites[group].title;
  siteLink.href = sites[group].href;
  shelf.setAttribute('data-module-icons', '');
  document.querySelector('#shelf-close').hidden = true;
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
    button.setAttribute('aria-controls', 'content-detail');
    button.title = item.title;
    button.append(miniCover(item, group));
    button.addEventListener('click', () => showItem(item, group, button));
    button.addEventListener('pointerenter', event => {
      if (!mobile.matches && event.pointerType === 'mouse' && hoverPointer.matches && !button.disabled) showItem(item, group, button, { focus: false });
    });
    button.addEventListener('focus', () => {
      if (!suppressFocusPreview && !mobile.matches && button.matches(':focus-visible')) showItem(item, group, button, { focus: false });
    });
    return button;
  }));
  shelfTrack.append(indexNav);
  shelf.hidden = false;
  document.querySelector('.feature').classList.add('has-shelf');
  reserveShelfSpace();
  shelfTrack.scrollLeft = 0;
  updateNavigation();
  updateShelfArrows();
  move(shelf, mobile.matches ? [{ opacity: 0 }, { opacity: 1 }] :
    [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }]);
  // Every selected site's modules remain pinned.
}
function restoreSiteShelf() {
  const group = root.dataset.homeSite;
  if (mobile.matches && root.dataset.viewMode !== 'rss' && group) {
    openShelf(group, dockButtons.find(button => button.dataset.cardGroup === group), { selectSite: false });
  }
}
function showItem(item, group, trigger, { focus = true } = {}) {
  document.querySelector('.feature').classList.add('is-browsing');
  // Hover keeps keyboard focus in place; revisiting a card preserves its form/scroll state.
  if (selectedKey === item.key && contentGroup === group) {
    if (focus) {
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
    detailImage.src = moduleArtwork(item, group);
    const copy = document.createElement('div'); copy.className = 'detail-copy';
    const meta = document.createElement('p'); meta.className = 'detail-meta'; meta.textContent = item.meta;
    const link = document.createElement('a'); link.className = 'read-button'; link.href = item.href;
    const label = document.createElement('span'); label.textContent = item.action;
    link.append(label); copy.append(meta);
    if (item.description && item.description !== item.meta) {
      const description = document.createElement('p'); description.className = 'detail-description'; description.textContent = item.description; copy.append(description);
    }
    copy.append(link); detailBody.append(copy);
    openPanel('content-detail', trigger, { focus });
  }
  contentGroup = group;
  selectedKey = item.key;
  // Keep the mobile module row and its selection marker available.
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
  if (!mobile.matches) window.LinguistaSiteUI?.focus();
  else shelfTrack.querySelector('button')?.focus({ preventScroll: true });
}));
panels.forEach(panel => panel.querySelector('.panel-close')?.addEventListener('click', () => closePanel()));

// Only a tap on empty space dismisses a module. Drags, scrolling, and controls
// keep their own behavior, including drags that finish outside the card.
let outsideTap = null;
const outsideModule = target => target instanceof Element &&
  !target.closest('.app-panel, #card-shelf, .dock, .sidebar, .workbench-controls, .home-mobile-header, a, button, input, select, textarea, dialog, [role="dialog"]');
document.addEventListener('pointerdown', event => {
  outsideTap = event.isPrimary && event.button === 0 && currentPanel === detail && outsideModule(event.target)
    ? { id:event.pointerId, x:event.clientX, y:event.clientY, panel:currentPanel } : null;
}, { capture:true });
document.addEventListener('pointermove', event => {
  if (outsideTap && (event.pointerId !== outsideTap.id || Math.hypot(event.clientX-outsideTap.x,event.clientY-outsideTap.y) > 8)) outsideTap = null;
}, { capture:true, passive:true });
document.addEventListener('pointercancel', () => { outsideTap = null; }, { capture:true });
document.addEventListener('click', event => {
  const tap = outsideTap; outsideTap = null;
  if (tap && currentPanel === tap.panel && detail.dataset.coverKind === 'module' &&
      outsideModule(event.target) && !root.hasAttribute('data-navigation-drag')) closePanel();
});
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
mobile.addEventListener('change', () => {
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

// Workshop software, with a draggable cursor and pausable autoplay.
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
  if (root.dataset.viewMode === 'rss' || reducedMotion.matches || document.hidden || pointerReading || document.querySelector('dialog[open]') || (mobile.matches && (root.dataset.homeSite && root.dataset.homeSite !== 'home' || root.dataset.homeCover === 'newsletter')) || keyboardReading || carouselDragging || currentPanel || root.hasAttribute('data-home-search')) return;
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
positionControl.max = String(slides.length - 1);
let positionDrag = null;
function scrubPosition(clientX) {
  const box = positionControl.getBoundingClientRect(), inset = Math.min(17, box.width / 4);
  const fraction = Math.max(0, Math.min(1, (clientX - box.left - inset) / Math.max(1, box.width - inset * 2)));
  const next = Math.round(fraction * (slides.length - 1));
  if (next !== slideIndex) setSlide(next, true, false, true);
}
function finishPositionDrag(cancelled, event) {
  if (!positionDrag) return;
  const previous = positionDrag; positionDrag = null;
  if (cancelled) setSlide(previous.index, false, false, true);
  else if (event) scrubPosition(event.clientX);
  if (positionControl.hasPointerCapture(previous.id)) positionControl.releasePointerCapture(previous.id);
  carouselDragging = false; syncPlayback();
}
positionControl.addEventListener('pointerdown', event => {
  if (!event.isPrimary) { finishPositionDrag(true); return; }
  if (event.button !== 0 || root.dataset.viewMode === 'rss' || currentPanel) return;
  event.preventDefault();
  positionDrag = { id:event.pointerId, index:slideIndex };
  carouselDragging = true; syncPlayback();
  positionControl.setPointerCapture(event.pointerId);
  positionControl.focus({ preventScroll:true });
  scrubPosition(event.clientX);
});
positionControl.addEventListener('pointermove', event => {
  if (positionDrag?.id !== event.pointerId) return;
  event.preventDefault(); scrubPosition(event.clientX);
});
positionControl.addEventListener('pointerup', event => {
  if (positionDrag?.id === event.pointerId) finishPositionDrag(false, event);
});
for (const type of ['pointercancel','lostpointercapture']) positionControl.addEventListener(type, event => {
  if (positionDrag?.id === event.pointerId) finishPositionDrag(true);
});
window.addEventListener('blur', () => finishPositionDrag(true));
window.addEventListener('resize', () => finishPositionDrag(true));

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
  if (!currentPanel && !event.target.closest('#card-shelf, .sidebar, .identity-art, input, textarea') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    setSlide(slideIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
setSlide(0, false);

trackDrag(feature, {
  axis: 'x',
  canStart: event => {
    const allowed = root.dataset.viewMode !== 'rss' && !currentPanel && !feature.classList.contains('has-site-cover') && !event.target.closest('a, button, input, .card-shelf') && (event.pointerType !== 'mouse' || event.target.closest('.feature-card'));
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
  if (root.dataset.viewMode === 'rss' || currentPanel || feature.classList.contains('has-site-cover') || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.ctrlKey) return;
  event.preventDefault();
  if (event.timeStamp - lastWheelTime > 200) wheelDistance = 0;
  lastWheelTime = event.timeStamp;
  wheelDistance += event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? feature.clientWidth : 1);
  if (Math.abs(wheelDistance) >= 80) {
    setSlide(slideIndex + Math.sign(wheelDistance));
    wheelDistance = 0;
  }
}, { passive: false });

const searchButton = document.querySelector('#search-button');
let searchReturnFocus = searchButton;
const searchDialog = document.querySelector('#search-dialog');
const input = document.querySelector('#search-input');
const list = document.querySelector('#search-results');
const searchStatus = document.querySelector('#search-status');
const searchMatches = searchDialog.querySelector('.search-matches');
const channels = document.querySelector('.newsletter-channels');
const searchQueries = { home: '', rss: '' };
let searchMode = 'home';

function renderResults() {
  searchMatches.hidden = root.dataset.viewMode === 'rss' || !root.hasAttribute('data-home-search') || !input.value.trim();
  if (searchMatches.hidden) { searchStatus.textContent = ''; list.replaceChildren(); return; }
  const result = window.LinguistaRSS?.search(input.value);
  if (!result) { searchStatus.textContent = '正在读取订阅…'; list.replaceChildren(); return; }
  const { items, total, loading, failed, available, sources } = result;
  searchStatus.textContent = `${total} 篇匹配 · ${available}/${sources} 个订阅源` + (loading ? ' · 正在同步…' : failed ? ` · ${failed} 个来源同步失败，保留已有缓存` : '');
  if (total > items.length) searchStatus.textContent += ` · 显示前 ${items.length} 篇`;
  if (!items.length && !loading) searchStatus.textContent += total ? '' : ' · 暂无匹配内容';
  list.replaceChildren(...items.map(({ article, feed }) => {
    const li = document.createElement('li'), link = document.createElement('a'); link.href = article.url;
    const copy = document.createElement('span');
    const source = document.createElement('small'); source.className = 'rss-global-source';
    source.textContent = feed.title + (article.date ? ' · ' + new Date(article.date).toLocaleDateString('zh-CN') : '');
    const title = document.createElement('strong'); title.className = 'rss-global-title'; title.textContent = article.title;
    const summary = document.createElement('span'); summary.className = 'rss-global-summary'; summary.textContent = article.summary;
    copy.append(source, title, summary); link.append(copy); li.append(link);
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); closeSearch({ restoreFocus: false }); void window.LinguistaRSS.openResult(feed.id, article.id);
    }); return li;
  }));
}
function syncSearchLayout() {
  const host = mobile.matches ? document.querySelector('.home-mobile-header') : document.querySelector('.workbench-controls');
  if (host && searchDialog.parentElement !== host) {
    if (mobile.matches) host.append(searchDialog); else host.prepend(searchDialog);
  }
  searchButton.hidden = true;
  searchDialog.hidden = false;
  channels.hidden = false;
}
function syncSearchMode() {
  const next = root.dataset.viewMode === 'rss' ? 'rss' : 'home';
  if (next !== searchMode) {
    searchQueries[searchMode] = input.value;
    searchMode = next;
    input.value = searchQueries[next];
    root.removeAttribute('data-home-search');
    searchButton.setAttribute('aria-expanded', 'false');
  }
  const label = next === 'rss' ? '搜索 ' + (document.querySelector('#rss-site-title')?.textContent || '当前站点') + ' 的文章' : '搜索各站内容';
  input.placeholder = label + '…';
  input.setAttribute('aria-label', label);
  searchDialog.setAttribute('aria-label', label);
  searchDialog.dataset.searchMode = next;
  searchDialog.toggleAttribute('data-has-query', !!input.value);
  renderResults();
  syncSearchLayout();
}
function closeSearch({ restoreFocus = true } = {}) {
  if (root.dataset.viewMode === 'rss') {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (restoreFocus) input.focus({ preventScroll: true });
    return;
  }
  if (!root.hasAttribute('data-home-search')) return;
  root.removeAttribute('data-home-search');
  searchButton.setAttribute('aria-expanded', 'false');
  input.value = ''; searchQueries.home = '';
  searchDialog.removeAttribute('data-has-query');
  renderResults();
  syncSearchLayout();
  if (restoreFocus) {
    const target = mobile.matches ? document.querySelector('#home-site-name') : document.querySelector('[data-view="home"]');
    (target || searchButton).focus({ preventScroll: true });
  }
  syncPlayback();
}
function openSearch(trigger = searchButton) {
  if (root.hasAttribute('data-home-search')) { input.focus({ preventScroll: true }); return; }
  searchReturnFocus = trigger;
  if (root.dataset.viewMode === 'rss') { input.focus({ preventScroll: true }); return; }
  root.setAttribute('data-home-search', '');
  searchButton.setAttribute('aria-expanded', 'true');
  syncSearchLayout();
  renderResults();
  void window.LinguistaRSS?.syncSearch();
  syncPlayback();
  input.focus({ preventScroll: true });
}
window.addEventListener('linguista-rss-update', () => { if (root.hasAttribute('data-home-search')) renderResults(); });
mobile.addEventListener('change', () => { if (root.dataset.viewMode !== 'rss') closeSearch({ restoreFocus: false }); syncSearchLayout(); });
syncSearchMode();
searchButton.addEventListener('click', () => root.hasAttribute('data-home-search') ? closeSearch() : openSearch(searchButton));
input.addEventListener('focus', () => openSearch(input));
document.querySelector('#close-search').addEventListener('click', () => closeSearch());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !root.hasAttribute('data-home-search') || document.querySelector('dialog[open]')) return;
  event.preventDefault(); event.stopImmediatePropagation(); closeSearch();
}, { capture: true });
input.addEventListener('input', () => {
  searchQueries[searchMode] = input.value;
  searchDialog.toggleAttribute('data-has-query', !!input.value);
  if (searchMode === 'rss') window.LinguistaRSS?.filter();
  else { openSearch(input); renderResults(); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !root.hasAttribute('data-home-search')) {
    event.preventDefault();
    if (currentPanel) closePanel();

  }
  const typing = event.target.closest('input, textarea, [contenteditable="true"]');
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault(); openSearch();
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
window.LinguistaSiteUI?.init({ sites, cardGroups, shelfLinks, miniCover, showItem,
  collapseShelf() { closeShelf({ restoreFocus: false }); },
  restoreShelf: restoreSiteShelf,
  showCover() { closePanel({ restoreFocus: false, immediate: true }); },
  clear() { closeSearch({ restoreFocus: false }); closeShelf({ restoreFocus: false }); closePanel({ restoreFocus: false, immediate: true }); },
  update() { updateNavigation(); syncPlayback(); }
});
window.addEventListener('hashchange', readHash);
readHash();
import('./project-launcher.js').then(({initProjectLauncher}) => initProjectLauncher(href => {
  const item=featuredItems.find(item=>item.href===href);
  if(!item)return;
  document.querySelector('[data-view="home"]')?.click();
  window.LinguistaSiteUI?.select('home');
  root.dataset.homeCover='workshop';
  window.LinguistaSiteUI?.syncStage();
  closeSearch({restoreFocus:false});
  showItem(item,'home',document.querySelector('#project-launcher'));
}, syncPlayback));


// A drag anywhere on a rail moves the current selection by the same distance.
// Content follows the glass while held; cancellation restores the original view.
function captureHomeNavigation() {
  const group = root.dataset.homeSite || 'home', cover = root.dataset.homeCover;
  const item = cardGroups[contentGroup]?.find(item => item.key === selectedKey);
  return () => {
    openShelf(group, dockButtons.find(button => button.dataset.cardGroup === group));
    if (cover) root.dataset.homeCover = cover;
    else root.removeAttribute('data-home-cover');
    if (item) showItem(item, group, shelfTrack.querySelector(`[data-card-key="${item.key}"]`), { focus: false });
    else closePanel({ restoreFocus: false, immediate: true });
    syncMainContent();
  };
}
function bindMobileSwipe({ surface, track = surface, host, items, current, activate, snapshot, cover, label }) {
  const glass = document.createElement('span');
  glass.className = 'swipe-glass'; glass.hidden = true; glass.setAttribute('aria-hidden', 'true');
  host.append(glass);
  let gesture = null, blockClickUntil = 0;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const paint = (x, width, height, y) => {
    glass.style.width = width + 'px'; glass.style.height = height + 'px';
    glass.style.transform = `translate3d(${x}px,${y}px,0)`;
  };
  const cancel = trackDrag(surface, {
    axis: 'x',
    canStart(event) {
      blockClickUntil = 0;
      if (!mobile.matches || document.querySelector('dialog[open]') || event.target.closest('.shelf-heading')) return false;
      const entries = items(); if (!entries.length) return false;
      const index = current(entries);
      const rail = track.getBoundingClientRect(), frame = host.getBoundingClientRect();
      const anchor = entries[Math.max(0, index)].getBoundingClientRect();
      const boxes = entries.map(entry => entry.getBoundingClientRect());
      const centers = boxes.map(box => box.left + box.width / 2);
      // The leading stop connects a site's cover to its module previews.
      const pitch = centers.length > 1 ? centers[1] - centers[0] : anchor.width + 8;
      const origin = index < 0 && cover ? centers[0] - pitch : centers[Math.max(0, index)];
      cancelMotion(glass); glass.hidden = true;
      gesture = {
        entries, index, next:index, rail, frame, centers, origin, pitch, scroll:track.scrollLeft,
        restore:snapshot(), started:performance.now(),
        tapped:entries.find(entry => entry.contains(event.target)),
        width: Math.min(80, anchor.width + 14), height: Math.min(rail.height - 6, anchor.height + 6),
        state: [root.dataset.viewMode, root.dataset.homeSite, root.dataset.rssSite].join('|'),
      };
      return true;
    },
    onTap() {
      const g = gesture; gesture = null;
      if (!g?.tapped || performance.now() - g.started > 500) return;
      // Complete a touch tap on pointer release; keyboard/mouse clicks keep their native path.
      blockClickUntil = performance.now() + 600;
      activate(g.tapped);
      swipeStatus.textContent = label + '：' + (g.tapped.getAttribute('aria-label') || g.tapped.textContent.trim());
    },
    onMove(delta) {
      if (!gesture) return;
      const g = gesture, position = g.origin + delta;
      let next = 0, nearest = Infinity;
      g.centers.forEach((center, index) => {
        const distance = Math.abs(position - center);
        if (distance < nearest) { nearest = distance; next = index; }
      });
      if (cover && position < g.centers[0] - g.pitch / 2) next = -1;
      root.setAttribute('data-navigation-drag', '');
      surface.classList.add('is-swiping');
      if (next !== g.next) {
        g.next = next;
        if (next < 0) cover();
        else {
          const target = g.entries[next];
          activate(target);
          // Reveal overflowing modules without scrolling the page or moving the drag origin.
          const box = target.getBoundingClientRect();
          const shift = box.left < g.rail.left + 4 ? box.left - g.rail.left - 4
            : box.right > g.rail.right - 4 ? box.right - g.rail.right + 4 : 0;
          if (shift && track.scrollWidth > track.clientWidth) track.scrollLeft += shift;
        }
        g.state = [root.dataset.viewMode, root.dataset.homeSite, root.dataset.rssSite].join('|');
      }
      const low = g.centers[0] - (cover ? g.pitch : 0), high = g.centers.at(-1);
      const bounded = clamp(position, low, high);
      const edge = position !== bounded;
      const stretch = reducedMotion.matches ? 0 : Math.min(24, Math.abs(delta) * .18);
      const width = g.width + stretch, height = g.height - stretch * .08;
      const center = bounded + (position - bounded) * .18 - (track.scrollLeft - g.scroll);
      const x = clamp(center - width / 2, g.rail.left + 2, g.rail.right - width - 2) - g.frame.left;
      const y = g.rail.top - g.frame.top + (g.rail.height - height) / 2;
      glass.hidden = false;
      glass.dataset.edge = String(edge);
      glass.style.setProperty('--swipe-light-x', delta < 0 ? '24%' : '76%');
      paint(x, width, height, y);
    },
    onEnd(delta, cancelled) {
      const g = gesture; gesture = null;
      surface.classList.remove('is-swiping');
      if (!g) return;
      // Capture before RSS's document handler, so a swipe cannot become a stray tap.
      blockClickUntil = performance.now() + 600;
      const sameView = g.state === [root.dataset.viewMode, root.dataset.homeSite, root.dataset.rssSite].join('|');
      if (cancelled && sameView) { g.restore(); track.scrollLeft = g.scroll; }
      root.removeAttribute('data-navigation-drag');
      const index = cancelled ? g.index : g.next;
      const target = g.entries[Math.max(0, index)];
      swipeStatus.textContent = label + '：' + (index < 0 ? '站点封面' : target.getAttribute('aria-label') || target.textContent.trim());
      if (glass.hidden) return;
      const box = target.getBoundingClientRect(), frame = host.getBoundingClientRect();
      const width = Math.min(80, box.width + 14), height = Math.min(g.rail.height - 6, box.height + 6);
      const x = clamp(box.left + box.width / 2 - width / 2, g.rail.left + 2, g.rail.right - width - 2) - frame.left;
      const y = g.rail.top - frame.top + (g.rail.height - height) / 2;
      move(glass, [
        { transform: glass.style.transform, width: glass.style.width, height: glass.style.height, opacity: .95 },
        { transform: `translate3d(${x}px,${y}px,0)`, width: width + 'px', height: height + 'px', opacity: 0 }
      ], { duration: cancelled ? 140 : 280, complete() { glass.hidden = true; } });
    },
  });
  surface.addEventListener('dragstart', event => { if (mobile.matches) event.preventDefault(); });
  document.addEventListener('click', event => {
    if (event.detail === 0 || performance.now() > blockClickUntil || !surface.contains(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation(); blockClickUntil = 0;
  }, { capture: true });
  new MutationObserver(() => {
    if (gesture && gesture.state !== [root.dataset.viewMode, root.dataset.homeSite, root.dataset.rssSite].join('|')) cancel();
  }).observe(root, { attributes: true, attributeFilter: ['data-view-mode', 'data-home-site', 'data-rss-site'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
}
const swipeStatus = document.createElement('p');
swipeStatus.className = 'sr-only'; swipeStatus.setAttribute('role', 'status'); swipeStatus.setAttribute('aria-live', 'polite'); swipeStatus.setAttribute('aria-atomic', 'true');
document.body.append(swipeStatus);
bindMobileSwipe({
  surface: document.querySelector('.dock'), track:dockApps, host: document.querySelector('.dock'), label: '站点',
  items: () => dockButtons,
  current: entries => entries.findIndex(button => button.classList.contains('is-active')),
  snapshot() {
    if (root.dataset.viewMode !== 'rss') return captureHomeNavigation();
    const site = root.dataset.rssSite;
    return () => window.LinguistaRSS?.selectSite(site);
  },
  activate(button) {
    if (root.dataset.viewMode === 'rss') window.LinguistaRSS?.selectSite(button.dataset.cardGroup);
    else openShelf(button.dataset.cardGroup, button);
  },
});
bindMobileSwipe({
  surface: shelf, track:shelfTrack, host: shelf, label: '模块',
  items: () => root.dataset.viewMode !== 'rss' ? [...shelfTrack.querySelectorAll('.mini-card')] : [],
  current: entries => entries.findIndex(button => button.getAttribute('aria-pressed') === 'true'),
  snapshot: captureHomeNavigation,
  cover() { closePanel({ restoreFocus: false, immediate: true }); },
  activate(button) {
    const item = cardGroups[shelfGroup]?.find(item => item.key === button.dataset.cardKey);
    if (item) showItem(item, shelfGroup, button, { focus: false });
  },
});

window.LinguistaHome = {
  syncSearchMode,
  suspend() {
    closeShelf({restoreFocus: false}); closePanel({restoreFocus: false, immediate: true});
    clearTimeout(playbackTimer);
  },
  resume() {dockButtons.forEach(button => button.setAttribute('aria-controls', 'card-shelf')); restoreSiteShelf(); updateNavigation(); syncPlayback();},
  setDock(id) {
    dockButtons.forEach(button => {
      const active = button.dataset.cardGroup === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'rss-article-list');
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    updateDockIndicator();
  },
};
