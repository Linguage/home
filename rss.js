import { getFeed, listFeeds } from './feed-source.js';
import { parseFeed } from './rss-content.js';
import { mergeArticles, articleChanged } from './rss-state.js';

const root = document.documentElement;
const sidebar = document.querySelector('.sidebar'), feature = document.querySelector('.feature');
sidebar.append(document.querySelector('#rss-sidebar-template').content.cloneNode(true));
feature.append(document.querySelector('#rss-stage-template').content.cloneNode(true));
const $ = id => document.getElementById(id);
const dock = [...document.querySelectorAll('.dock [data-card-group]')];
const switches = [...document.querySelectorAll('[data-view]')];
const snapshots = new Map(), requests = new Map(), selected = new Map();
let feeds = [], activeSite = 'home', mode = 'home', activeArticle = null;
let readIds = new Set();
let readFilter = 'unread';
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function remember(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Reading remains available. */ } }
readIds = new Set(stored('linguista-rss-read', []));
activeSite = stored('linguista-rss-site', 'home');
if (!dock.some(button => button.dataset.cardGroup === activeSite || ['notion-linguista', 'notion-bullets'].includes(activeSite))) activeSite = 'home';

// Store only bounded, plain-text previews. No article HTML, credentials or images.
const database = new Promise(resolve => {
  if (!window.indexedDB) return resolve(null);
  let request;
  try { request = indexedDB.open('linguista-rss', 1); } catch { return resolve(null); }
  request.onupgradeneeded = () => request.result.createObjectStore('feeds', { keyPath: 'site' });
  request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  request.onerror = request.onblocked = () => resolve(null);
});
async function cacheRead(site) {
  const db = await database; if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction('feeds').objectStore('feeds').get(site);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cacheWrite(value) {
  const db = await database; if (!db) return;
  await new Promise(resolve => {
    try {
      const transaction = db.transaction('feeds', 'readwrite');
      transaction.objectStore('feeds').put(value);
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    } catch { resolve(); }
  });
}
function feedFor(id) { return feeds.find(feed => feed.id === id); }
function node(tag, className, text) {
  const element = document.createElement(tag); if (className) element.className = className;
  if (text !== undefined) element.textContent = text; return element;
}
function externalLink(title, url) {
  const link = node('a', '', title); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function dateLabel(value) {
  if (!value) return '日期未提供';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function syncLabel(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
function closeReader({ focus = true } = {}) {
  activeArticle = null; root.removeAttribute('data-rss-reading');
  $('rss-reader').hidden = true; $('rss-welcome').hidden = false;
  document.querySelectorAll('.rss-article-item').forEach(button => button.removeAttribute('aria-current'));
  if (focus) (document.querySelector('.rss-article-item[data-selected="true"]') || document.querySelector('.rss-article-item') || $('rss-filter-button')).focus({ preventScroll: true });
}
function openArticle(article, { focus = true, markRead = true, resetScroll = true } = {}) {
  const feed = feedFor(activeSite); if (!feed) return;
  activeArticle = article; selected.set(activeSite, article.id);
  if (markRead) {
    readIds.delete(article.id); readIds.add(article.id);
    readIds = new Set([...readIds].slice(-2000)); remember('linguista-rss-read', [...readIds]);
  }
  $('rss-reader-site').textContent = feed.title;
  $('rss-article-meta').textContent = [dateLabel(article.date), article.author].filter(Boolean).join(' · ');
  $('rss-article-title').textContent = article.title;
  $('rss-article-summary').textContent = article.summary || '暂无摘要。';
  $('rss-original').href = article.url;
  $('rss-article-categories').replaceChildren(...article.categories.slice(0, 6).map(category => node('span', '', category)));
  $('rss-reader').hidden = false; $('rss-welcome').hidden = true; root.dataset.rssReading = 'true';
  if (resetScroll) $('rss-reader').scrollTop = 0;
  renderList();
  if (focus) $('rss-article-title').focus({ preventScroll: true });
}
function renderList() {
  const feed = feedFor(activeSite); if (!feed) return;
  const snapshot = snapshots.get(activeSite);
  const query = $('rss-search').value.trim().toLocaleLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const all = snapshot?.items || [];
  const articles = all.filter(item => (readFilter === 'all' || readIds.has(item.id) === (readFilter === 'read')) && terms.every(term => `${item.title} ${item.summary} ${item.categories.join(' ')} ${item.author}`.toLocaleLowerCase().includes(term)));
  const list = $('rss-article-list');
  list.replaceChildren(...articles.map(article => {
    const li = node('li');
    const button = node('button', 'rss-article-item'); button.type = 'button';
    button.dataset.id = article.id; button.dataset.read = String(readIds.has(article.id));
    button.dataset.selected = String(selected.get(activeSite) === article.id);
    if (activeArticle?.id === article.id) button.setAttribute('aria-current', 'true');
    const meta = node('span', 'rss-item-meta'); meta.append(node('span', 'rss-unread'), node('span', '', dateLabel(article.date)));
    if (article.categories.length) meta.append(node('span', '', '· ' + article.categories[0]));
    button.append(meta, node('strong', 'rss-item-title', article.title));
    if (article.summary) button.append(node('span', 'rss-item-summary', article.summary));
    button.addEventListener('click', () => openArticle(article)); li.append(button); return li;
  }));
  list.hidden = articles.length === 0;
  const empty = $('rss-list-empty'); empty.hidden = articles.length > 0;
  $('rss-count').textContent = feed.url ? (query ? `${articles.length} / ${all.length} 篇` : `${articles.length} 篇文章`) : '知识库入口';
  $('rss-refresh').disabled = !feed.url || requests.has(activeSite);
  if (snapshot?.loading) $('rss-sync-status').textContent = all.length ? '正在同步…' : '正在读取订阅…';
  else if (snapshot?.error) $('rss-sync-status').textContent = all.length ? `同步未完成 · 显示 ${syncLabel(snapshot.checkedAt)} 的缓存` : '同步失败';
  else $('rss-sync-status').textContent = snapshot?.checkedAt ? `已同步 · ${syncLabel(snapshot.checkedAt)}` : feed.url ? '等待同步' : '尚未配置公开 RSS';
  empty.replaceChildren();
  if (!feed.url) {
    (feed.links || []).forEach(link => empty.append(externalLink(link.title + ' ↗', link.url)));
  } else if (query) empty.textContent = '没有匹配的文章。';
  else if (snapshot?.loading) empty.textContent = '正在读取…';
  else if (snapshot?.error) empty.textContent = '暂无可用缓存。';
  else empty.textContent = all.length ? (readFilter === 'unread' ? '暂无未读文章。' : readFilter === 'read' ? '暂无已读文章。' : '暂时没有文章。') : '暂时没有文章。';
}
async function loadFeed(site, { refresh = false } = {}) {
  const feed = feedFor(site); if (!feed?.url) return;
  if (requests.has(site)) return requests.get(site);
  const task = (async () => {
    let previous = snapshots.get(site);
    if (!previous?.items) previous = await cacheRead(site);
    snapshots.set(site, { ...previous, items: previous?.items || [], loading: true });
    if (activeSite === site && mode === 'rss') renderList();
    try {
      const response = await getFeed(feed, { refresh });
      if (!response.ok) throw Error('订阅暂时不可用。');
      const items = parseFeed(await response.text(), feed);
      // An item falling out of a bounded feed is not a deletion notice.
      const stale = response.headers.get('x-linguista-stale') === '1';
      const merged = mergeArticles(previous?.items || [], stale && previous?.items?.length ? [] : items);
      readIds = new Set([...readIds].map(id => merged.aliases.get(id) || id));
      remember('linguista-rss-read', [...readIds]);
      const snapshot = { site, items: merged.items,
        checkedAt: (stale && previous?.checkedAt) || Number(response.headers.get('x-linguista-checked-at')) || Date.now(), error: stale, loading: false };
      snapshots.set(site, snapshot);
      if (!stale) await cacheWrite(snapshot);
      if (mode === 'rss' && activeSite === site && activeArticle) {
        const updated = snapshot.items.find(item => item.id === (merged.aliases.get(activeArticle.id) || activeArticle.id));
        if (updated && (updated.id !== activeArticle.id || articleChanged(activeArticle, updated))) openArticle(updated, { focus: false, markRead: false, resetScroll: false });
      }
    } catch {
      snapshots.set(site, { ...previous, site, items: previous?.items || [], error: true, loading: false });
    } finally {
      requests.delete(site);
      if (activeSite === site && mode === 'rss') renderList();
    }
  })();
  requests.set(site, task); return task;
}
function selectSite(site) {
  if (site === 'notion') site = stored('linguista-notion-source', 'notion-linguista');
  if (!feedFor(site)) site = 'home';
  if (feedFor(site)?.group === 'notion') remember('linguista-notion-source', site);
  activeSite = site; remember('linguista-rss-site', site);
  root.dataset.rssSite = feedFor(site)?.group || site;
  const feed = feedFor(site); if (!feed) return;
  closeFilter(); closeReader({ focus: false }); $('rss-search').value = '';
  $('rss-site-title').textContent = feed.title; $('rss-site-description').textContent = feed.description;
  $('rss-site-title').href = feed.home;
  window.LinguistaHome?.setDock(feed.group || site);
  const sources = $('rss-sources');
  sources.hidden = feed.group !== 'notion';
  sources.replaceChildren(...(feed.group === 'notion' ? feedFor('notion').sources.map(id => {
    const button = node('button', '', feedFor(id).title); button.type = 'button';
    button.setAttribute('aria-pressed', String(id === site));
    button.addEventListener('click', () => selectSite(id)); return button;
  }) : []));
  renderList(); $('rss-article-list').scrollTop = 0;
  if (feed.url) void loadFeed(site);
}
async function setMode(next) {
  if (next === mode) return;
  mode = next; root.dataset.viewMode = mode;
  remember('linguista-view-mode', mode);
  switches.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  if (mode === 'home') {
    closeFilter(); closeReader({ focus: false }); window.LinguistaHome?.resume(); return;
  }
  window.LinguistaHome?.suspend();
  await ready;
  if (mode === 'rss') selectSite(activeSite);
}
const ready = listFeeds().then(response => {
  if (!response.ok) throw Error('订阅配置读取失败。'); return response.json();
}).then(value => { feeds = value; }).catch(() => {
  $('rss-list-empty').hidden = false; $('rss-list-empty').textContent = '订阅配置读取失败。';
});
root.dataset.viewMode = 'home';
switches.forEach(button => button.addEventListener('click', () => void setMode(button.dataset.view)));
document.querySelector('.view-switch').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? switches[0] : event.key === 'End' ? switches[1] : switches.find(button => button !== document.activeElement);
  next.focus(); void setMode(next.dataset.view);
});
document.addEventListener('click', event => {
  if (mode !== 'rss') return;
  const button = event.target.closest('.dock [data-card-group]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation(); selectSite(button.dataset.cardGroup);
}, { capture: true });
document.addEventListener('keydown', event => {
  if (mode !== 'rss') return;
  const typing = event.target.closest('input,textarea,[contenteditable]');
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault(); event.stopImmediatePropagation();
    closeReader({ focus: false }); $('rss-search').focus();
  } else if (event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!$('rss-filter-menu').hidden) { closeFilter(); $('rss-filter-button').focus(); }
    else if (activeArticle) closeReader(); else if ($('rss-search').value) { $('rss-search').value = ''; renderList(); }
  } else if (event.target.closest('.dock') && event.key === 'ArrowUp') {
    event.preventDefault(); event.stopImmediatePropagation(); document.querySelector('.rss-article-item')?.focus();
  } else if (event.target.closest('.feature') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) event.stopImmediatePropagation();
}, { capture: true });
$('rss-article-list').addEventListener('keydown', event => {
  const buttons = [...$('rss-article-list').querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement); if (index < 0) return;
  const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (!offset) return; event.preventDefault(); buttons[(index + offset + buttons.length) % buttons.length].focus();
});
$('rss-search').addEventListener('input', renderList);
$('rss-refresh').addEventListener('click', () => void loadFeed(activeSite, { refresh: true }));
$('rss-close').addEventListener('click', () => closeReader());
window.addEventListener('resize', () => { if (mode === 'rss') window.LinguistaHome?.setDock(feedFor(activeSite)?.group || activeSite); });
window.addEventListener('online', () => { if (mode === 'rss') void loadFeed(activeSite, { refresh: true }); });

function closeFilter() {
  $('rss-filter-menu').hidden = true;
  $('rss-filter-button').setAttribute('aria-expanded', 'false');
}
function openFilter() {
  $('rss-filter-menu').hidden = false;
  $('rss-filter-button').setAttribute('aria-expanded', 'true');
  $('rss-filter-menu').querySelector('[aria-checked="true"]').focus();
}
$('rss-filter-button').addEventListener('click', () => $('rss-filter-menu').hidden ? openFilter() : closeFilter());
$('rss-filter-button').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openFilter(); }
});
const filterOptions = [...document.querySelectorAll('[data-read-filter]')];
filterOptions.forEach(button => button.addEventListener('click', () => {
  readFilter = button.dataset.readFilter;
  $('rss-filter-label').textContent = button.textContent;
  filterOptions.forEach(option => option.setAttribute('aria-checked', String(option === button)));
  closeFilter(); renderList(); $('rss-article-list').scrollTop = 0; $('rss-filter-button').focus();
}));
$('rss-filter-menu').addEventListener('keydown', event => {
  if (event.key === 'Tab') { closeFilter(); $('rss-filter-button').focus(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = filterOptions.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? filterOptions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + filterOptions.length) % filterOptions.length;
  filterOptions[next].focus();
});
document.addEventListener('click', event => { if (!event.target.closest('#rss-filter')) closeFilter(); });
document.addEventListener('focusin', event => { if (!event.target.closest('#rss-filter')) closeFilter(); });

if (stored('linguista-view-mode', 'home') === 'rss') void setMode('rss');
