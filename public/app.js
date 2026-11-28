/* INVB Studio — roteamento no cliente: qual endereço abre qual tela (as telas ficam em public/app/).
   Só existem o login e a área logada; qualquer outro endereço abre o login. */
(function () {
  const INVB = window.INVB;
  const {
    S,
    go,
    api,
    $,
    pages,
    isDone,
    guard,
    statusLabel,
    segsOf,
    linesOf,
    $$,
    esc,
    parkMedia,
    shell,
    goneBanner,
    mountMedia,
    bindPlayer,
    bindUploads,
    login,
    procView,
    waitView,
    bindUpload,
    reanalyze,
    refreshList,
    bindTranscription,
    bindClips,
    bindChapters,
    bindEmotions,
    bindDiagrams,
  } = INVB;

  /* ---------- Roteamento ---------- */
  function parse(path) {
    const s = path.replace(/\/+$/, '').split('/').filter(Boolean);
    if (s[0] === 'entrar' || s[0] === 'cadastro') return { v: 'login' };
    if (s[0] !== 'app') return null;
    if (!s[1]) return { v: 'home' };
    if (s[1] === 'gastos' && !s[2]) return { v: 'gastos' };
    if (s[1] === 'uploads') {
      if (!s[2]) return { v: 'uploads' };
      if (s[2] === 'new') return { v: 'uploadsNew' };
      return { v: s[3] || 'overview', id: s[2] };
    }
    return { v: 'notfound' };
  }
  const binds = {
    uploads: bindUploads,
    transcription: bindTranscription,
    clips: bindClips,
    chapters: bindChapters,
    emotions: bindEmotions,
    diagrams: bindDiagrams,
    gastos: (...a) => INVB.bindGastos(...a),
  };
  const needsDone = new Set(['transcription', 'clips', 'chapters', 'emotions', 'diagrams', 'overview']);

  window.AppArea = {
    match: (p) => !!parse(p),
    async render(path, root) {
      const tok = ++S.rt;
      clearInterval(S.poll);
      parkMedia();
      const r = parse(path);
      document.body.classList.add('in-app');
      if (r.v === 'login') {
        if (path.startsWith('/cadastro')) return go('/entrar');
        if (S.authed !== true) {
          try {
            await api('/me');
            S.authed = true;
          } catch {
            /* não logado */
          }
        }
        if (S.authed === true) return go('/app'); // já logado: pula o login
        document.body.classList.remove('in-app');
        root.innerHTML = login();
        $('#lgf').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api('/login', { json: { password: $('#pw').value } });
            S.authed = true;
            go('/app');
          } catch (er) {
            $('#lgerr').textContent = er.message;
          }
        };
        return;
      }
      try {
        if (S.authed !== true) {
          await api('/me');
          S.authed = true;
        }
        S.status = await api('/status').catch(() => S.status);
        const p = path.replace(/\/+$/, '') || '/app';
        if (['home', 'uploads'].includes(r.v)) S.uploads = await api('/uploads');
        if (r.id) {
          S.cur = await api('/uploads/' + r.id);
          if (S.media && S.mediaId !== r.id) {
            S.media.pause();
            S.media.remove();
            S.media = null;
            S.mediaId = null;
          }
        }
        if (tok !== S.rt) return;
        if (r.v === 'notfound' || !pages[r.v]) {
          root.innerHTML = shell(
            p,
            `<div class="empty"><h3>Página não encontrada</h3><a class="ap-btn pri" href="/app">Ir para o início</a></div>`,
          );
        } else if (r.id && needsDone.has(r.v) && !isDone(S.cur)) {
          const waiting = S.cur.status === 'waiting';
          root.innerHTML = shell(p, waiting ? waitView(S.cur) : procView(S.cur), r.id);
          const now = $('#now');
          if (now)
            now.onclick = guard(async () => {
              await api(`/uploads/${r.id}/retry`, { json: { now: true } });
              go(p);
            });
          const retry = $('#retry');
          if (retry)
            retry.onclick = guard(async () => {
              await api(`/uploads/${r.id}/retry`, { json: {} });
              go(p);
            });
          if (S.cur.status !== 'error')
            S.poll = setInterval(async () => {
              try {
                const m = await api('/uploads/' + r.id);
                if (isDone(m) || m.status === 'error' || (m.status === 'waiting') !== waiting) {
                  clearInterval(S.poll);
                  go(p);
                } else {
                  const a = $('#procmsg'),
                    b = $('#procbar');
                  if (a) a.textContent = statusLabel(m);
                  if (b) b.style.width = Math.max(3, m.progress || 0) + '%';
                }
              } catch {
                /* */
              }
            }, 2000);
        } else {
          if (r.id) {
            S.segs = segsOf(S.cur);
            S.lines = linesOf(S.cur);
          }
          root.innerHTML = shell(p, pages[r.v](S.cur), r.id);
          if (r.id) goneBanner();
          if (['home', 'uploadsNew'].includes(r.v)) bindUpload(root);
          if (binds[r.v]) binds[r.v]();
          if (r.id) {
            mountMedia();
            bindPlayer();
          }
          const ra = $('#reana');
          if (ra) ra.onclick = () => reanalyze(ra);
          $$('[data-reana]').forEach((b) => (b.onclick = () => reanalyze(b)));
          // polling da lista/início enquanto algo processa
          if (['uploads', 'home'].includes(r.v) && S.uploads.some((u) => ['queued', 'processing'].includes(u.status)))
            S.poll = setInterval(
              () =>
                refreshList()
                  .then(() => {
                    if (!S.uploads.some((u) => ['queued', 'processing'].includes(u.status))) clearInterval(S.poll);
                  })
                  .catch(() => {}),
              2000,
            );
        }
      } catch (e) {
        if (e.status === 401 || S.authed === false) {
          S.authed = false;
          return go('/entrar');
        }
        root.innerHTML = shell(
          '/app',
          `<div class="empty"><h3>${e.status === 404 ? 'Pregação não encontrada' : 'Erro'}</h3><p>${esc(e.message)}</p><a class="ap-btn pri" href="/app/uploads">Todas as pregações</a></div>`,
        );
      }
      const b = $('#ap-burger');
      if (b) b.onclick = () => $('#ap-side').classList.toggle('open');
      const out = $('#ap-out');
      if (out)
        out.onclick = async () => {
          await api('/logout', { json: {} }).catch(() => {});
          S.authed = false;
          if (S.media) {
            S.media.pause();
            S.media.remove();
            S.media = null;
          }
          go('/entrar');
        };
    },
  };
  /* ---------- Navegação: cliques em links e o botão voltar ---------- */
  function render(path, keep) {
    if (!(window.AppArea && AppArea.match(path))) {
      path = '/entrar';
      if (location.pathname !== path) history.replaceState({}, '', path);
    }
    document.title = 'INVB Studio · Nova Vida Botafogo';
    AppArea.render(path.replace(/\/+$/, '') || '/', document.getElementById('app'));
    if (!keep) scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || e.metaKey || e.ctrlKey || a.target) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href === location.pathname) {
      scrollTo(0, 0);
      return;
    }
    history.pushState({}, '', href);
    render(href);
  });
  addEventListener('popstate', () => render(location.pathname));
  window.__render = (p) => render(p);
  render(location.pathname);
})();
