(() => {
  const root = document.documentElement;
  window.LinguistaSiteUI = {
    init({ sites, cardGroups, shelfLinks, miniCover, showItem, clear, collapseShelf, update }) {
      const sidebar = document.querySelector('.sidebar');
      const section = document.createElement('section'); section.className = 'site-sidebar'; section.id = 'site-sidebar'; section.hidden = true;
      const art = document.createElement('div'); art.className = 'identity-art';
      const modules = document.createElement('nav'); modules.className = 'site-modules quick-links';
      const heading = document.createElement('a'); heading.className = 'site-sidebar-name sidebar-footer'; heading.target = '_blank'; heading.rel = 'noopener noreferrer';
      const footer = document.createElement('div'); footer.className = 'site-sidebar-footer';
      const pagination = document.createElement('nav'); pagination.className = 'site-pagination'; pagination.setAttribute('aria-label', '模块分页');
      const previous = document.createElement('button'), next = document.createElement('button');
      for (const [button, label, direction] of [[previous, '上一页模块', 'previous'], [next, '下一页模块', 'next']]) {
        button.type = 'button'; button.className = 'site-page-button'; button.dataset.direction = direction; button.setAttribute('aria-label', label); button.setAttribute('aria-controls', 'site-modules');
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'; pagination.append(button);
      }
      const pageStatus = document.createElement('span'); pageStatus.className = 'sr-only'; pageStatus.setAttribute('aria-live', 'polite');
      modules.id = 'site-modules'; let modulePage = 0;
      const setModulePage = page => {
        const links = [...modules.children], total = Math.max(1, Math.ceil(links.length / 4)); modulePage = Math.max(0, Math.min(total - 1, page));
        links.forEach((link, index) => { link.hidden = Math.floor(index / 4) !== modulePage; });
        pagination.hidden = total <= 1; previous.disabled = modulePage === 0; next.disabled = modulePage === total - 1;
        pageStatus.textContent = `模块第 ${modulePage + 1} 页，共 ${total} 页`;
      };
      previous.addEventListener('click', () => setModulePage(modulePage - 1)); next.addEventListener('click', () => setModulePage(modulePage + 1));
      modules.addEventListener('keydown', event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); setModulePage(modulePage + (event.key === 'ArrowRight' ? 1 : -1)); modules.querySelector('a:not([hidden])')?.focus(); });
      footer.append(heading, pagination, pageStatus); section.append(art, modules, footer); sidebar.append(section);
      const original = [...sidebar.children].filter(child => child !== section);
      const identities = new Map();
      const compact = matchMedia('(max-width: 900px)');
      const feature = document.querySelector('.feature');
      const syncStage = () => {
        const isHome = root.dataset.homeSite === 'home';
        const parent = compact.matches && !isHome ? feature : section;
        if (art.parentElement !== parent) parent.prepend(art);
        original.filter(child => !child.classList.contains('rss-sidebar')).forEach(child => {
          const visible = child.classList.contains('newsletter') && compact.matches || isHome;
          child.hidden = !visible; child.inert = !visible;
        });
        section.hidden = compact.matches || isHome;
        art.hidden = isHome;
        art.inert = root.dataset.viewMode === 'rss' || (compact.matches && feature.classList.contains('has-detail'));
      };
      this.syncStage = syncStage;
      compact.addEventListener('change', () => { collapseShelf(); syncStage(); update(); });
      new MutationObserver(syncStage).observe(root, { attributes: true, attributeFilter: ['data-view-mode', 'data-rss-site'] });
      const pictures = { hinbox: 'hinbox.svg', science: 'whats-old.svg', notion: 'notion.svg', bearblog: 'bearblog.svg' };
      const select = group => {
        if (!sites[group]) group = 'home';
        clear(); root.dataset.homeSite = group;
        const isHome = group === 'home';

        if (!isHome) {
          let identity = identities.get(group);
          if (!identity) {
            identity = document.createElement('div'); identity.className = 'site-identity'; identity.dataset.site = group;
            if (group === 'alpaca' || group === 'library') {
              const widget = document.createElement('div'); widget.className = group === 'alpaca' ? 'alpaca-demo' : 'library-demo';
              identity.append(widget); window.LinguistaWidgets[group](widget, 0, cardGroups[group]);
            } else {
              const image = document.createElement('img'); image.src = './assets/identities/' + pictures[group]; image.alt = sites[group].title; identity.append(image);
            }
            art.append(identity); identities.set(group, identity);
          }
          identities.forEach((value, key) => { value.hidden = key !== group; value.inert = key !== group; });
          heading.textContent = sites[group].title; heading.href = sites[group].href;
          modules.setAttribute('aria-label', sites[group].title + ' 栏目');
          modules.replaceChildren(...cardGroups[group].map(item => {
            const link = document.createElement('a'); link.className = 'site-module'; link.href = item.href;
            link.dataset.cardKey = item.key; link.setAttribute('aria-label', item.title); link.setAttribute('aria-controls', 'content-detail');
            const mark = document.createElement('span'); mark.className = 'site-module-icon'; mark.style.setProperty('--module-image', `url("${item.image}")`); mark.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('span'); copy.className = 'site-module-copy';
            const title = document.createElement('span'); title.className = 'site-module-title'; title.textContent = item.title; copy.append(title);
            if (item.meta) { const meta = document.createElement('small'); meta.textContent = item.shortMeta || item.meta; copy.append(meta); }
            link.append(mark, copy);
            link.addEventListener('click', event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); showItem(item, group, link);
            }); return link;
          }));
          setModulePage(0);
        }
        syncStage(); update();
      };
      this.select = select;
      this.focus = () => modules.querySelector('a:not([hidden])')?.focus();
      root.dataset.homeSite = 'home'; syncStage();
    }
  };
})();
