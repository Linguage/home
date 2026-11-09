import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createFeedService, feeds } from './feeds.mjs';
import { articleSites, articleUrl, createArticleService } from './articles.mjs';

export const PREFIX = '/linguista/';
export const capabilities = Object.freeze({ schemaVersion: 1, mode: 'home-and-rss',
  content: { source: 'public-rss-and-home-snapshot', search: 'home-entries-and-feed-previews', sync: true, fullText: true, articleSites: [...articleSites] },
  ai: { enabled: false } });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon' };

export function createHandler(directory, { feedService = createFeedService(), articleService = createArticleService(), reading } = {}) {
  const root = resolve(directory);
  return async (req, res) => {
    const send = (status, text) => {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? '' : text);
    };
    if (reading && req.method === 'POST' && req.url === PREFIX + 'api/reading-context') {
      const origin = req.headers.origin;
      const permittedOrigin = !origin || origin === 'dsh-app://app' ||
        ['http://', 'https://'].some(protocol => origin === protocol + req.headers.host);
      if (!permittedOrigin || req.headers['sec-fetch-site'] === 'cross-site' || req.headers['x-linguista-reader'] !== 'local') return send(403, '请从阅读器打开 AI 伴读。');
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          bytes += chunk.length;
          if (bytes > 64 * 1024) { req.resume(); return send(413, '阅读资料过长。'); }
          chunks.push(chunk);
        }
        const { id, context } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        reading.bind(id, context);
        res.writeHead(204, { 'cache-control': 'no-store' });
        return res.end();
      } catch { return send(400, '无法设置伴读资料。'); }
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD'); return send(405, '仅支持读取。');
    }
    let pathname;
    try { pathname = decodeURIComponent((req.url || '').split('?')[0]); }
    catch { return send(400, '无效地址。'); }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return send(400, '无效地址。');
    if (pathname === '/linguista') {
      res.writeHead(308, { location: PREFIX }); return res.end();
    }
    if (!pathname.startsWith(PREFIX)) return send(404, '没有找到该内容。');
    const relative = pathname.slice(PREFIX.length) || 'index.html';
    if (relative === 'api/capabilities') {
      res.writeHead(200, { 'content-type': types['.json'], 'cache-control': 'no-store' });
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify(reading
        ? { ...capabilities, ai: { enabled: true, mode: 'native-discussion' } } : capabilities));
    }
    if (relative === 'api/feeds') {
      res.writeHead(200, { 'content-type': types['.json'], 'cache-control': 'no-store' });
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify(feeds.map(feed => ({
        ...feed, inAppArticle: articleSites.has(feed.id),
      }))));
    }
    if (relative === 'api/article') {
      const input = new URL(req.url, 'http://localhost').searchParams.get('url');
      const url = articleUrl(input);
      if (!url) return send(404, '该地址未开放插件内阅读。');
      const headers = { 'content-type': types['.json'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
      const request = new AbortController();
      const onClose = () => request.abort();
      res.once?.('close', onClose);
      try {
        const article = await articleService.get(url, { signal: request.signal });
        if (request.signal.aborted) return;
        res.writeHead(200, headers);
        return res.end(JSON.stringify(article));
      } catch {
        if (!request.signal.aborted) return send(502, '正文暂时无法读取。');
      } finally {
        res.removeListener?.('close', onClose);
      }
    }
    if (relative.startsWith('api/feed/')) {
      const id = relative.slice('api/feed/'.length);
      if (!feeds.some(feed => feed.id === id && feed.url)) return send(404, '该模块未配置订阅。');
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' }); return res.end();
      }
      try {
        const refresh = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1';
        const feed = await feedService.get(id, { refresh });
        res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'x-linguista-checked-at': String(feed.checkedAt), 'x-linguista-stale': feed.stale ? '1' : '0',
          'x-linguista-snapshot': feed.mirrored ? '1' : '0' });
        return res.end(feed.xml);
      } catch { return send(502, '订阅暂时无法同步，请稍后重试。'); }
    }
    if (relative.split('/').some(part => part.startsWith('.'))) return send(404, '没有找到该内容。');
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) return send(404, '没有找到该内容。');
    try {
      const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(file)]);
      if (!actualFile.startsWith(actualRoot + sep) || !(await stat(actualFile)).isFile()) return send(404, '没有找到该内容。');
      const data = await readFile(actualFile);
      const etag = '"' + createHash('sha256').update(data).digest('hex') + '"';
      const headers = { 'content-type': types[extname(file)] || 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'cache-control': 'no-cache', etag };
      if (extname(file) === '.html') headers['content-security-policy'] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://linguista.cn https://linguista.bearblog.dev https://linguista.notion.site; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
      res.writeHead(200, { ...headers, 'content-length': data.length });
      res.end(req.method === 'HEAD' ? '' : data);
    } catch (error) {
      send(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500,
        ['ENOENT', 'ENOTDIR'].includes(error.code) ? '没有找到该内容。' : '读取失败。');
    }
  };
}
