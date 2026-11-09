const collections = new Set([
  '275d1a13-85bf-8165-9d83-000b4bd179f2', // Linguista
  'd0bd1a13-85bf-828d-80ac-87b58f88a85d', // Bullets
]);
const blockTags = { text: 'p', header: 'h2', sub_header: 'h3', sub_sub_header: 'h4', quote: 'blockquote', callout: 'blockquote', code: 'pre', equation: 'pre' };
const marks = { b: 'strong', i: 'em', c: 'code', s: 'del', _: 'u' };
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function httpsLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function richText(rows) {
  return (rows || []).map(([value, annotations = []]) => {
    let text = escape(value);
    for (const [kind, target] of annotations) {
      if (Object.hasOwn(marks, kind)) text = `<${marks[kind]}>${text}</${marks[kind]}>`;
      if (kind === 'a') {
        const href = httpsLink(target);
        if (href) text = `<a href="${escape(href)}">${text}</a>`;
      }
    }
    return text;
  }).join('');
}

function renderBlocks(records, parent, depth = 0) {
  if (depth >= 32) throw Error('文章块层级过深。');
  return (parent.content || []).map(id => {
    const block = records.get(id);
    if (!block || block.parent_id !== parent.id || ['page', 'collection_view', 'collection_view_page', 'transclusion_reference'].includes(block.type)) return '';
    const children = block.content?.length ? renderBlocks(records, block, depth + 1) : '';
    const props = block.properties || {};
    const text = richText(props.title);
    if (Object.hasOwn(blockTags, block.type)) {
      const tag = blockTags[block.type];
      return `<${tag}>${text}</${tag}>${children}`;
    }
    switch (block.type) {
      case 'divider': return '<hr>';
      case 'bulleted_list': return `<ul><li>${text}${children}</li></ul>`;
      case 'numbered_list': return `<ol><li>${text}${children}</li></ol>`;
      case 'toggle': return `<details open><summary>${text}</summary>${children}</details>`;
      case 'table': return `<table><tbody>${children}</tbody></table>`;
      case 'table_row': {
        const columns = parent.format?.table_block_column_order || Object.keys(props);
        return `<tr>${columns.map(column => `<td>${richText(props[column])}</td>`).join('')}</tr>`;
      }
      case 'image': {
        const caption = richText(props.caption);
        const href = httpsLink(props.source?.[0]?.[0]);
        return `<figure>${href ? `<img src="${escape(href)}" alt="">` : '<p>图片请在原站查看</p>'}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      }
      default: return `${text ? `<p>${text}</p>` : ''}${children}`;
    }
  }).join('');
}

// Notion's public site loads page blocks separately from its HTML shell.
// Use only anonymous reader records from the two published feed collections.
export async function readNotionArticle(url, read) {
  const id = url.pathname.slice(-32).toLowerCase().replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/, '$1-$2-$3-$4-$5');
  const endpoint = new URL('/api/v3/loadPageChunk', url).href;
  const records = new Map();
  let cursor = { stack: [] };
  for (let chunkNumber = 0; chunkNumber < 12; chunkNumber++) {
    const data = JSON.parse(await read(endpoint, 'application/json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: id, limit: 100, cursor, chunkNumber, verticalColumns: false }),
    }));
    for (const [key, record] of Object.entries(data.recordMap?.block || {})) {
      const payload = record.value?.value ? record.value : record;
      const value = payload.value;
      if (payload.role === 'reader' && value?.alive !== false && value?.id === key) records.set(key, value);
    }
    const root = records.get(id);
    if (root?.type !== 'page' || root.parent_table !== 'collection' || !collections.has(root.parent_id)) {
      throw Error('该页面没有公开阅读正文。');
    }
    if (!Array.isArray(data.cursor?.stack)) throw Error('Notion 正文响应无效。');
    if (!data.cursor.stack.length) return `<article data-notion-reader>${renderBlocks(records, root)}</article>`;
    cursor = data.cursor;
  }
  throw Error('Notion 文章超过分页上限。');
}
