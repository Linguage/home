import { readFileSync } from 'node:fs';

export const feeds = Object.freeze(JSON.parse(readFileSync(new URL('./rss-feeds.json', import.meta.url), 'utf8')));
const MAX_BYTES = 4 * 1024 * 1024;

// The client selects a bundled site ID, never an arbitrary network address.
export function createFeedService({ fetcher = globalThis.fetch, now = Date.now, maxBytes = MAX_BYTES, timeout = 15000 } = {}) {
  const cache = new Map(), pending = new Map();
  async function download(feed, previous, refresh) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let url = new URL(feed.url);
      const headers = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'Linguista-DSH/0.2 (+https://linguista.cn/)' };
      if (!refresh && previous?.etag) headers['If-None-Match'] = previous.etag;
      if (!refresh && previous?.modified) headers['If-Modified-Since'] = previous.modified;
      if (refresh) { headers['Cache-Control'] = 'no-cache'; headers.Pragma = 'no-cache'; }
      let response;
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (url.protocol !== 'https:' || url.origin !== new URL(feed.url).origin || url.username || url.password)
          throw Error('订阅跳转到了未配置的站点。');
        response = await fetcher(url.href, { headers, cache: refresh ? 'reload' : 'default', redirect: 'manual', signal: controller.signal, credentials: 'omit' });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 3) throw Error('订阅跳转次数过多。');
        url = new URL(location, url);
      }
      if (response.status === 304 && previous) return { ...previous, checkedAt: now(), stale: false };
      if (!response.ok) { await response.body?.cancel(); throw Error(`订阅暂时无法读取（${response.status}）。`); }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel(); throw Error('订阅文件超过读取上限。');
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) { controller.abort(); throw Error('订阅文件超过读取上限。'); }
        chunks.push(Buffer.from(chunk));
      }
      const xml = Buffer.concat(chunks).toString('utf8');
      if (!/<(?:rss|feed)(?:\s|>)/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('站点没有返回可识别的订阅。');
      return { xml, checkedAt: now(), stale: false, etag: response.headers.get('etag'), modified: response.headers.get('last-modified') };
    } finally { clearTimeout(timer); }
  }
  return {
    async get(id, { refresh = false } = {}) {
      const feed = feeds.find(item => item.id === id && item.url);
      if (!feed) return null;
      const previous = cache.get(id);
      if (!refresh && previous && now() - previous.checkedAt < 5 * 60 * 1000) return previous;
      if (pending.has(id)) return pending.get(id);
      const task = download(feed, previous?.mirrored ? undefined : previous, refresh)
        .catch(async error => {
          if (!feed.webSnapshot || (previous && !previous.mirrored)) throw error;
          const url = new URL(feed.webSnapshot, 'https://linguista.cn/home/').href;
          const snapshot = await download({ ...feed, url }, previous, refresh);
          return { ...snapshot, mirrored: true };
        })
        .then(value => { cache.set(id, value); return value; })
        .catch(error => {
          if (previous) return { ...previous, stale: true, error: '同步未完成，正在显示上次内容。' };
          throw error;
        }).finally(() => pending.delete(id));
      pending.set(id, task);
      return task;
    },
  };
}
