export function listFeeds() {
  return fetch('./rss-feeds.json', { cache: 'no-cache' });
}

export async function getFeed(feed, { refresh }) {
  const response = await fetch(feed.webSnapshot ? new URL(feed.webSnapshot, import.meta.url) : feed.url, {
    cache: refresh ? 'reload' : 'no-cache',
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return response;

  const maxBytes = 4 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('订阅文件超过读取上限。');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error('订阅文件超过读取上限。');
    }
    chunks.push(value);
  }
  return new Response(new Blob(chunks), {
    headers: feed.webSnapshot ? { 'x-linguista-snapshot': '1' } : undefined,
  });
}
