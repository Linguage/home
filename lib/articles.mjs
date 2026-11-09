import { readNotionArticle } from './notion-article.mjs';

const linguista = 'https://linguista.cn';
const bear = 'https://linguista.bearblog.dev';
const notion = 'https://linguista.notion.site';
export const articleSites = new Set(['home', 'alpaca', 'library', 'hinbox', 'science', 'bearblog', 'notion-linguista', 'notion-bullets']);
const articlePaths = [
  [linguista, /^\/newsletter\/(?:tech\/|hn\/)?[\p{L}\p{N}_-]+\/?$/u, true],
  [linguista, /^\/alpacanotes\/(?:notes|essays)(?:\/[\p{L}\p{N}_.~-]+)+\/?$/u, false],
  [linguista, /^\/library\/(?:persons|channels)(?:\/[\p{L}\p{N}_-]+){2}\/?$/u, true],
  [linguista, /^\/hinbox\/mail\/[\p{L}\p{N}_-]+\/?$/u, false],
  [linguista, /^\/sci-notes\/posts(?:\/[\p{L}\p{N}_-]+)+\/?$/u, true],
  [bear, /^\/[\p{L}\p{N}_-]+\/?$/u, true],
  [notion, /^\/[\p{L}\p{N}_-]*[a-f0-9]{32}\/?$/iu, false],
];

export function articleUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || /%2f|%5c/i.test(url.pathname)) return null;
    const path = decodeURIComponent(url.pathname);
    const rule = articlePaths.find(([origin, pattern]) => url.origin === origin && pattern.test(path));
    if (!rule || path.split('/').some(segment => segment === '.' || segment === '..')) return null;
    const lang = url.searchParams.get('lang');
    const tab = url.searchParams.get('tab');
    url.pathname = path.replace(/\/$/, '') + (rule[2] ? '/' : '');
    url.hash = '';
    url.search = '';
    if (path.startsWith('/library/')) {
      if (['zh', 'en', 'fr'].includes(lang)) url.searchParams.set('lang', lang);
      if (tab && /^[a-z0-9_-]{1,64}$/i.test(tab)) url.searchParams.set('tab', tab);
    }
    return url;
  } catch {
    return null;
  }
}

export function createArticleService({ fetcher = globalThis.fetch, maxBytes = 4 * 1024 * 1024, timeout = 18000 } = {}) {
  return {
    async get(url, { signal } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let bytes = 0;
      async function read(address, mime, options = {}) {
        const response = await fetcher(address, {
          ...options, headers: { Accept: mime, 'User-Agent': 'Linguista Reader (+https://linguista.cn/home/)', ...options.headers },
          credentials: 'omit', redirect: 'error', signal: requestSignal,
        });
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || type !== mime || Number(response.headers.get('content-length')) > maxBytes - bytes || !response.body) {
          await response.body?.cancel();
          throw Error('无法读取文章页面。');
        }
        const chunks = [];
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > maxBytes) {
            controller.abort();
            throw Error('文章超过读取上限。');
          }
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString('utf8');
      }
      try {
        const html = url.origin === notion ? await readNotionArticle(url, read) : await read(url.href, 'text/html');
        return { url: url.href, html };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
