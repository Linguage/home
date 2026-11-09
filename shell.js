// Keep the local workbench in place while the browser opens a public article.
// This also covers links created later by Home's shelves and search results.
(() => {
  const origins = new Set(['https://linguista.cn', 'https://linguista.notion.site', 'https://app.notion.com', 'https://linguista.bearblog.dev']);
  function prepareLinks(container) {
    const links = [...container.querySelectorAll('a[href]')];
    if (container.matches?.('a[href]')) links.push(container);
    for (const link of links) {
      const url = new URL(link.href, location.href);
      if (!origins.has(url.origin) || url.username || url.password) continue;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title ||= '在浏览器中打开原站';
    }
  }
  prepareLinks(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') prepareLinks(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) prepareLinks(node);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
})();
