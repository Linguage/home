window.__ModuleLoader__.load({
  id: 'dsh-linguista',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    const buildQuery = '?v=414988e48c2b1acb';
    const readingChannel = 'dsh-linguista-reading';
    function Icon(props) {
      return h('img', { src: '/linguista/assets/linguista/rosetta-icon.svg',
        alt: '', width: props?.size || 20, height: props?.size || 20,
        style: { display: 'block', objectFit: 'contain' } });
    }
    function ChatView({ renderSlot }) {
      return renderSlot('conversation.session', { view: 'chat' });
    }
    function Discussion({ renderFactorySlot }) {
      return renderFactorySlot('conversation.content', {
        variant: 'embedded', phase: 'active', hero: false,
      }, { slots: { views: ChatView } });
    }
    return {
      isPlugin: true, name: 'linguista', inject: ['slots', 'sessions', 'conversation'],
      apply(ctx) {
        const sessionIds = new Map();
        const pending = new Map();
        const starters = { overview: '这篇文章的要点是什么？', explain: '请解释我选中的这段话。', argument: '作者如何论证自己的结论？' };
        let contract;
        const loadContract = () => contract ??= import(new URL('/linguista/reader-ai.js' + buildQuery, window.location.href).href);
        async function sessionId(url) {
          const existing = sessionIds.get(url);
          if (existing && !ctx.sessions.list.getSnapshot().ids.includes(existing)) await ctx.sessions.refresh();
          if (existing && ctx.sessions.list.getSnapshot().ids.includes(existing)) return existing;
          if (!pending.has(url)) pending.set(url, ctx.sessions.create().then(id => {
            sessionIds.set(url, id);
            return id;
          }).finally(() => pending.delete(url)));
          return pending.get(url);
        }

        function Panel({ SessionProvider, renderSlot }) {
          const frame = React.useRef(null);
          const tray = React.useRef(null);
          const [visible, setVisible] = React.useState(false);
          const [reference, setReference] = React.useState(null);
          const [source, setSource] = React.useState(null);
          const [commands, setCommands] = React.useState([]);
          const [selection, setSelection] = React.useState(false);
          const [loading, setLoading] = React.useState(false);
          const [error, setError] = React.useState('');
          const [trayStyle, setTrayStyle] = React.useState({});
          const send = (type, fields = {}) => {
            const origin = window.location.origin;
            frame.current?.contentWindow?.postMessage({ channel: readingChannel, type, ...fields }, origin === 'null' ? '*' : origin);
          };
          React.useEffect(() => {
            const update = () => { void send('tray', { width: visible ? tray.current?.offsetWidth : 0 }); };
            update();
            const observer = new ResizeObserver(update);
            if (tray.current) observer.observe(tray.current);
            return () => observer.disconnect();
          }, [visible]);
          React.useEffect(() => {
            const controller = new AbortController();
            const { signal } = controller;
            let handle;
            let preparing;
            let generation = 0;
            async function receive(event) {
              if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin || event.data?.channel !== readingChannel) return;
              const { type, payload } = event.data;
              if (type === 'layout') {
                const { top, bottom, palette, theme } = event.data;
                const height = frame.current.clientHeight;
                if (!Number.isFinite(top) || !Number.isFinite(bottom) || top < 0 || bottom < 0 || top + bottom >= height) return;
                const style = { '--linguista-tray-top': `${top}px`, '--linguista-tray-bottom': `${bottom}px`, colorScheme: theme === 'light' ? 'light' : 'dark' };
                for (const key of ['surface', 'surface-raised', 'ink', 'muted', 'line', 'accent-soft']) {
                  const color = palette?.[key];
                  if (typeof color === 'string' && CSS.supports('color', color)) style[`--linguista-reader-${key}`] = color;
                }
                setTrayStyle(style);
                return;
              }
              if (type === 'reset') {
                generation++;
                preparing?.abort();
                setVisible(false); setSelection(false); setLoading(false); setError('');
                setSource(null);
                setReference(null); handle?.reference.release(); handle = undefined;
                return;
              }
              if (type === 'selection') { setSelection(event.data.available === true); return; }
              if (type !== 'ready' && type !== 'open') return;
              const request = ++generation;
              preparing?.abort();
              preparing = new AbortController();
              const prepareSignal = AbortSignal.any([signal, preparing.signal]);
              let acquired;
              try {
                const { skills, readingContext } = await loadContract();
                if (signal.aborted || request !== generation) return;
                if (type === 'ready') { setCommands(skills); send('connect'); return; }
                setVisible(true); setError(''); setLoading(true);
                if (typeof readingContext !== 'function') throw Error('伴读组件版本不匹配，请重新打开 Linguista。');
                const context = readingContext(payload);
                const id = await sessionId(context.url);
                if (signal.aborted || request !== generation) return;
                if (handle?.sessionId !== id) {
                  acquired = ctx.sessions.retain(id, { source: 'linguista-reading', signal });
                  await acquired.ready;
                  if (signal.aborted || request !== generation) return;
                  handle?.reference.release();
                  handle = { sessionId: id, reference: acquired };
                  acquired = undefined;
                }
                const response = await fetch('/linguista/api/reading-context', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Linguista-Reader': 'local' },
                  body: JSON.stringify({ id, context }), signal: prepareSignal,
                });
                if (!response.ok) throw Error('暂时无法附加阅读资料，请重试。');
                if (prepareSignal.aborted || request !== generation) return;
                setReference(handle.reference);
                setSource({ url: context.url, title: context.title, edition: context.edition,
                  selection: Boolean(context.selection), task: context.task });
                const prompt = starters[context.task];
                const binding = handle.reference.binding;
                const input = ctx.conversation.input.for(binding.ctx);
                const draft = input.state.getSnapshot();
                const initial = handle.initialDraft;
                const replace = initial && draft.draftRev === initial.draftRev && draft.draft === initial.draft &&
                  !draft.attachmentIds.length && !draft.occurrences.length;
                if (prompt || replace) {
                  const result = ctx.conversation.input.requestDraftInitialization(binding, { prompt, whenDraftExists: replace ? 'replace' : 'keep' });
                  if (result === 'blocked') throw Error('草稿暂时无法编辑，请重试。');
                  handle.initialDraft = result === 'applied' && prompt ? input.state.getSnapshot() : undefined;
                }
              } catch (problem) {
                if (!signal.aborted && request === generation) setError(problem.message || '暂时无法打开伴读。');
              } finally {
                acquired?.release();
                if (!signal.aborted && request === generation) setLoading(false);
              }
            }
            window.addEventListener('message', receive);
            return () => { window.removeEventListener('message', receive); controller.abort(); handle?.reference.release(); };
          }, []);

          return h('div', { className: 'linguista-workspace' },
            h('link', { rel: 'stylesheet', href: '/linguista/discussion.css' + buildQuery }),
            h('iframe', { ref: frame, src: '/linguista/' + buildQuery, title: 'Linguista 阅读工作台' }),
            h('aside', { ref: tray, className: 'linguista-discussion', 'aria-label': 'Linguista AI 伴读',
              'aria-hidden': !visible, 'data-open': visible ? '' : undefined, inert: !visible, style: trayStyle },
              h('header', null,
                h('div', null, h('h2', null, 'AI 伴读'), source && h('p', null,
                  h('a', { href: source.url, title: source.title, target: '_blank', rel: 'noopener noreferrer' }, source.title),
                  h('span', { className: 'linguista-discussion-source' }, source.selection ? `${source.edition} · 选段` : source.edition))),
                h('button', { type: 'button', 'aria-label': '关闭 AI 伴读', onClick: () => { setVisible(false); void send('focus-reader'); } }, '×')),
              h('nav', { 'aria-label': '阅读技能' }, commands.map(skill => h('button', {
                key: skill.task, type: 'button', title: skill.description,
                'aria-pressed': source?.task === skill.task,
                disabled: loading || (skill.task === 'explain' && !selection),
                onPointerDown: event => { if (skill.task === 'explain') event.preventDefault(); },
                onClick: () => { void send('prepare', { task: skill.task }); },
              }, skill.label))),
              loading && h('p', { className: 'linguista-discussion-status', role: 'status' }, '正在准备对话…'),
              error && h('p', { className: 'linguista-discussion-status', role: 'alert' }, error),
              reference && h('div', { className: 'linguista-discussion-session' },
                h(SessionProvider, { session: reference }, renderSlot('linguista.discussion')))));
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'linguista', order: 68,
          label: () => 'Linguista',
        }, Icon));
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: 'linguista',
            children: { 'linguista.discussion': { kind: 'single', scope: 'session' } },
          }, Panel);
          yield ctx.slots.register({ name: 'linguista.discussion' }, Discussion);
        });
      },
    };
  },
});
