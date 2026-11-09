export function listFeeds() {
  return fetch('./api/feeds', { cache: 'no-store' });
}

export function getFeed(feed, { refresh }) {
  const query = refresh ? '?refresh=1' : '';
  return fetch(`./api/feed/${encodeURIComponent(feed.id)}${query}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(feed.webSnapshot ? 32000 : 22000),
  });
}

const recentArticles = new Map();

export async function getArticle(article, { signal }) {
  const cached = recentArticles.get(article.url);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) return extractArticle(cached.html, new URL(cached.url));
  const params = new URLSearchParams({ url: article.url });
  const response = await fetch(`./api/article?${params}`, {
    cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(22000)]),
  });
  if (!response.ok) throw Error('正文暂时无法读取。');
  const { html, url } = await response.json();
  const result = extractArticle(html, new URL(url));
  if (html.length <= 300000) {
    recentArticles.delete(article.url);
    recentArticles.set(article.url, { html, url, time: Date.now() });
    if (recentArticles.size > 6) recentArticles.delete(recentArticles.keys().next().value);
  }
  return result;
}

function extractArticle(html, url) {
  // A template is inert. Only freshly constructed reading elements reach the live page.
  const template = document.createElement('template');
  template.innerHTML = html;
  const page = template.content;
  let source, label = '正文';
  if (url.pathname.startsWith('/library/')) {
    const tab = url.searchParams.get('tab');
    const lang = url.searchParams.get('lang');
    const panels = [...page.querySelectorAll('.reader-article .reader-content[data-variant-panel]')];
    const hasTabs = panels.some(panel => panel.hasAttribute('data-variant-tab'));
    const matches = panels.filter(panel =>
      (!tab || !hasTabs || panel.dataset.variantTab === tab) &&
      (!lang || panel.classList.contains(`reader-prose--${lang}`)));
    source = matches.find(panel => panel.classList.contains('reader-content--active')) ?? matches[0];
    label = url.pathname.startsWith('/library/channels/') ? '频道概要' : '译文正文';
  } else if (url.pathname.startsWith('/newsletter/')) {
    source = page.querySelector('#reading-content');
  } else if (url.pathname.startsWith('/alpacanotes/')) {
    source = page.querySelector('[data-iv-body]');
  } else if (url.pathname.startsWith('/hinbox/')) {
    source = page.querySelector('.app-main .md-theme-magazine.prose');
  } else if (url.hostname === 'linguista.bearblog.dev') {
    source = page.querySelector('main');
    const time = source?.querySelector('time');
    source?.querySelector(':scope > h1')?.remove();
    if (time?.parentElement?.tagName === 'P' && time.parentElement.textContent.trim() === time.textContent.trim()) time.parentElement.remove();
    else time?.remove();
  } else if (url.hostname === 'linguista.notion.site') {
    source = page.querySelector('[data-notion-reader]');
  } else {
    source = page.querySelector('article.entry .entry__body');
  }
  if (!source) throw Error('找不到该版本的正文。');
  const body = document.createDocumentFragment();
  for (const child of source.childNodes) copyReadingNode(child, body, url);
  if (!body.textContent.trim()) throw Error('找不到可读的正文。');
  return { body, label };
}

const readingTags = new Set('a abbr b blockquote br caption cite code dd del details dfn div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i kbd li mark ol p pre q s samp small span strong sub summary sup table tbody td th thead tfoot tr u ul var'.split(' '));
const ignoredTags = new Set('audio button canvas embed footer form iframe input link meta nav noscript object script select style template textarea video'.split(' '));
const mathNamespace = 'http://www.w3.org/1998/Math/MathML';
const mathTags = new Set('math semantics maction merror mfrac mi mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none'.split(' '));

function copyMath(source, parent) {
  if (source.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(source.data)); return; }
  if (source.namespaceURI !== mathNamespace || !mathTags.has(source.localName)) return;
  const element = document.createElementNS(mathNamespace, source.localName);
  for (const attribute of ['display', 'mathvariant', 'stretchy', 'fence', 'separator', 'accent', 'accentunder', 'columnalign', 'rowalign', 'width', 'height', 'depth']) {
    const value = source.getAttribute(attribute);
    if (value && /^[a-z0-9.\s%+-]{1,64}$/i.test(value)) element.setAttribute(attribute, value);
  }
  for (const child of source.childNodes) copyMath(child, element);
  parent.append(element);
}

function copyReadingNode(source, parent, base) {
  if (source.nodeType === Node.TEXT_NODE) {
    parent.append(document.createTextNode(source.data));
    return;
  }
  if (source.namespaceURI === mathNamespace) { copyMath(source, parent); return; }
  if (source.namespaceURI !== 'http://www.w3.org/1999/xhtml' || source.hidden || source.hasAttribute('data-iv-ignore') || ignoredTags.has(source.localName)) return;
  const tag = source.localName;
  if (source.classList.contains('katex')) {
    const formula = source.querySelector('math');
    if (formula) { copyMath(formula, parent); return; }
    const tex = source.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex) {
      const math = document.createElement('code');
      math.textContent = tex;
      parent.append(math);
      return;
    }
  }
  if (tag === 'img') {
    const link = readingLink(source.getAttribute('src'), base);
    if (link) {
      const fallback = document.createElement('a');
      setLink(fallback, link);
      fallback.textContent = source.alt ? `查看插图：${source.alt}` : '查看插图';
      if (new URL(link).origin !== base.origin) { parent.append(fallback); return; }
      const image = document.createElement('img');
      image.alt = source.alt;
      image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.crossOrigin = 'anonymous';
      image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
      image.src = link;
      parent.append(image);
    }
    return;
  }
  const element = readingTags.has(tag) ? document.createElement(tag) : parent;
  if (tag === 'details' && source.open) element.open = true;
  if (tag === 'a') {
    const url = readingLink(source.getAttribute('href'), base);
    if (url) setLink(element, url);
  }
  for (const attribute of ['colspan', 'rowspan', 'start']) {
    const value = source.getAttribute(attribute);
    if (element !== parent && /^\d{1,3}$/.test(value || '')) element.setAttribute(attribute, value);
  }
  for (const child of source.childNodes) copyReadingNode(child, element, base);
  if (element !== parent) parent.append(element);
}

function readingLink(href, base) {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function setLink(link, url) {
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}
