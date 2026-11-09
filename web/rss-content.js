// Feeds become plain-text previews; article HTML is never inserted into the page.
const contentNS = 'http://purl.org/rss/1.0/modules/content/';
const dcNS = 'http://purl.org/dc/elements/1.1/';
export function safeUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function textOfHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = value;
  template.content.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
  return (template.content.textContent || '').replace(/\s+/g, ' ').replace(/阅读全文\s*[→↗]?\s*$/, '').trim();
}
export function parseFeed(xml, feed) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('订阅格式不受支持。');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('订阅格式有误，请稍后重试。');
  const atom = doc.documentElement.localName === 'feed';
  if (!atom && doc.documentElement.localName !== 'rss') throw Error('未找到 RSS 或 Atom 订阅。');
  const children = (node, name) => [...node.children].filter(child => child.localName === name);
  const text = (node, name) => children(node, name)[0]?.textContent?.trim() || '';
  function atomContent(node) {
    if (!node) return '';
    if (node.getAttribute('type') === 'xhtml') return [...node.children].map(child => child.innerHTML).join('');
    if (node.getAttribute('type') === 'html') return node.textContent || '';
    const p = document.createElement('p'); p.textContent = node.textContent || ''; return p.outerHTML;
  }
  const items = atom ? children(doc.documentElement, 'entry') : children(children(doc.documentElement, 'channel')[0] || doc.documentElement, 'item');
  const seen = new Set();
  return items.slice(0, 500).flatMap((item, index) => {
    const link = atom ? children(item, 'link').find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')?.getAttribute('href') : text(item, 'link');
    const url = safeUrl(link || '', feed.url);
    if (!url || !link) return [];
    const guid = text(item, atom ? 'id' : 'guid') || url;
    if (seen.has(guid)) return [];
    seen.add(guid);
    const summaryHtml = atom ? atomContent(children(item, 'summary')[0]) : text(item, 'description');
    const contentHtml = atom ? atomContent(children(item, 'content')[0]) : item.getElementsByTagNameNS(contentNS, 'encoded')[0]?.textContent || '';
    const plain = textOfHtml(summaryHtml || contentHtml);
    const published = text(item, atom ? 'published' : 'pubDate') || text(item, 'updated');
    const timestamp = Date.parse(published);
    return [{ id: `${feed.id}:${guid}`, title: text(item, 'title') || '无标题文章', url,
      author: atom ? children(item, 'author').map(author => text(author, 'name')).join('、') : text(item, 'author') || item.getElementsByTagNameNS(dcNS, 'creator')[0]?.textContent || '',
      categories: children(item, 'category').map(category => atom ? category.getAttribute('term') || '' : category.textContent || '').filter(Boolean),
      date: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '', updated: text(item, 'updated'), timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      summary: Array.from(plain).length > 320 ? Array.from(plain).slice(0, 319).join('') + '…' : plain, index }];
  }).sort((a, b) => b.timestamp - a.timestamp || a.index - b.index);
}
