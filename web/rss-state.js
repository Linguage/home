function articleUrl(value) {
  try {
    const url = new URL(value); url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid','gclid'].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort(); return url.href;
  } catch { return ''; }
}

// The latest payload replaces every field; reading identity stays stable.
export function mergeArticles(previous, incoming, limit = 300) {
  const records = new Map(), identities = new Map(), urls = new Map(), aliases = new Map();
  for (const item of [...previous, ...incoming]) {
    const url = articleUrl(item.url);
    const id = identities.get(item.id) || identities.get(item.sourceId) || (url && urls.get(url)) || item.id;
    aliases.set(item.id, id);
    identities.set(item.id, id);
    if (item.sourceId) identities.set(item.sourceId, id);
    if (url) urls.set(url, id);
    records.set(id, { ...item, id, sourceId: item.sourceId || item.id });
  }
  return { items: [...records.values()].sort((a,b) => b.timestamp - a.timestamp).slice(0, limit), aliases };
}

export function articleChanged(before, after) {
  return ['title','summary','url','author','date','updated'].some(key => before[key] !== after[key]) ||
    JSON.stringify(before.categories) !== JSON.stringify(after.categories);
}
