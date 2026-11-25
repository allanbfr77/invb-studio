/* INVB Studio — Base das telas: atalhos de DOM, ícones, estado, chamadas ao servidor, avisos, janelas, menus e o login do Google.
   As telas ficam em public/app/ e conversam pelo objeto window.INVB: cada arquivo pega dele o que os
   anteriores publicaram e publica o que os seguintes usam. A ordem de carga está no index.html. */
(function () {
  const INVB = (window.INVB = {});

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tm = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
  };
  const parseT = (v) => {
    v = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(v)) return +v;
    const p = v.split(':').map(Number);
    if (p.some(isNaN)) return NaN;
    return p.reduce((a, n) => a * 60 + n, 0);
  };
  const srtT = (s) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      x = Math.floor(s % 60),
      ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  // Mensagem longa fica mais tempo na tela (dá para ler), e um clique fecha.
  const toast = (m) => {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    t.onclick = () => t.classList.remove('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(
      () => t.classList.remove('show'),
      Math.max(3200, Math.min(15000, String(m || '').length * 70)),
    );
  };
  const dl = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
  };
  const fmtSize = (b) =>
    b >= 1073741824
      ? (b / 1073741824).toFixed(2).replace('.', ',') + ' GB'
      : (b / 1048576).toFixed(2).replace('.', ',') + ' MB';
  const fmtDate = (t) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const ic = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10H3z"/></svg>',
    // claquete: Editor avançado
    clap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10h18v10H3z"/><path d="M3 10l1.5-5 16-1L21 9"/><path d="M8 4.6l2 4.6M14 4.2l2 4.8"/></svg>',
    files:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14"/></svg>',
    up: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    vid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
    aud: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l4 4v14H6z"/></svg>',
    cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8 15M20 20L8 9"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h6a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v13a2 2 0 012-2h6z"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/></svg>',
    dia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="5"/><rect x="3" y="16" width="6" height="5"/><rect x="15" y="16" width="6" height="5"/><path d="M12 8v4M6 16v-4h12v4"/></svg>',
    dl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10 6a9 9 0 0111 6 9 9 0 01-3 4M6 8a9 9 0 00-3 4 9 9 0 0012 5"/></svg>',
    scissors:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8 15M20 20L8 9"/></svg>',
    heartS:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    pause:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    search:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    out: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>',
    trash:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  };
  const EC = {
    Determinação: '#a855f7',
    Confiança: '#3b82f6',
    Esperança: '#06b6d4',
    Humildade: '#f59e0b',
    Gratidão: '#10b981',
    Alegria: '#eab308',
    Tristeza: '#64748b',
    Medo: '#ef4444',
    Raiva: '#dc2626',
    Compaixão: '#ec4899',
    Neutra: '#94a3b8',
  };

  /* ---------- Estado e API ---------- */
  const S = {
    authed: null,
    status: null,
    uploads: [],
    cur: null,
    poll: null,
    media: null,
    mediaId: null,
    speed: 1,
    mode: 'video',
    rt: 0,
  };
  let go = (p) => {
    history.pushState({}, '', p);
    window.__render(p);
  };

  async function api(p, o = {}) {
    const h = { 'x-invb': '1' };
    if (o.json !== undefined) h['content-type'] = 'application/json';
    const r = await fetch('/api' + p, {
      method: o.method || (o.json !== undefined ? 'POST' : 'GET'),
      headers: h,
      credentials: 'same-origin',
      body: o.json !== undefined ? JSON.stringify(o.json) : undefined,
    });
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* sem corpo */
    }
    if (r.status === 401 && p !== '/login') {
      S.authed = false;
      const e = new Error('Sessão expirada');
      e.status = 401;
      throw e;
    }
    if (!r.ok) {
      const e = new Error((j && j.error) || `Erro ${r.status}`);
      e.status = r.status;
      e.data = j;
      throw e;
    }
    return j;
  }
  const guard =
    (fn) =>
    async (...a) => {
      try {
        return await fn(...a);
      } catch (e) {
        if (e.status === 401) go('/entrar');
        else toast(e.message);
      }
    };

  /* ---------- Dados derivados ---------- */
  const segsOf = (c) => {
    const em = {};
    ((c.analysis && c.analysis.emotions) || []).forEach((e) => (em[e.i] = e.emotion));
    return ((c.transcript && c.transcript.segments) || []).map((s) => ({
      id: s.id,
      t: s.start,
      end: s.end,
      who: s.speaker,
      text: s.text,
      emo: em[s.id] || null,
    }));
  };
  // Linhas curtas (até ~5 s) com o tempo de cada palavra; `seg` aponta para a fala de origem.
  const linesOf = (c) =>
    ((c.transcript && c.transcript.lines) || []).map((l, i) => ({
      i,
      seg: l.seg,
      t: l.start,
      end: l.end,
      who: l.speaker,
      text: l.text,
      words: l.words || [],
    }));
  const chaptersOf = (c) =>
    ((c.analysis && c.analysis.chapters) || []).map((ch) => ({
      ...ch,
      moments: (c.clips || [])
        .filter((k) => k.start >= ch.start && k.start < ch.end)
        .map((k) => ({ title: k.title, t: k.start })),
    }));
  const isDone = (m) => m.status === 'done';
  const statusLabel = (m) =>
    m.status === 'done'
      ? 'Concluído'
      : m.status === 'error'
        ? 'Erro'
        : `${m.stage || 'Processando'}${m.progress ? ' ' + m.progress + '%' : ''}`;
  const stClass = (m) => (m.status === 'done' ? '' : m.status === 'error' ? 'err' : 'proc');

  const modal = (title, body, onOk, okLabel = 'Salvar', desc = '') => {
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${title}</h3><p>${desc}</p>${body}<div class="ft"><button class="ap-btn" data-x>Cancelar</button><button class="ap-btn pri" data-ok>${okLabel}</button></div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.onclick = (e) => {
      if (e.target === m || e.target.dataset.x !== undefined) close();
    };
    $('[data-ok]', m).onclick = async () => {
      const r = await onOk(m);
      if (r !== false) close();
    };
    const f = $('input,textarea,select', m);
    if (f) f.focus();
    return m;
  };
  const popover = (anchor, html, bind) => {
    $$('.menu').forEach((x) => x.remove());
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = html;
    m.style.top = r.bottom + 6 + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - 240, r.right - 220)) + 'px';
    m.style.position = 'fixed';
    document.body.appendChild(m);
    if (bind) bind(m);
    // O menu precisa caber inteiro na tela: se não couber embaixo do botão (o player de baixo cobre essa faixa), abre para cima.
    const pb = document.querySelector('.pbar'),
      floor = (pb ? pb.getBoundingClientRect().top : innerHeight) - 10,
      h = m.offsetHeight,
      w = m.offsetWidth;
    let top = r.bottom + 6;
    if (top + h > floor) top = r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, floor - h);
    m.style.top = top + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    m.style.maxHeight = Math.max(140, floor - 16) + 'px';
    m.style.overflowY = 'auto';
    setTimeout(
      () =>
        document.addEventListener('click', function h(e) {
          if (!m.contains(e.target)) {
            m.remove();
            document.removeEventListener('click', h);
          }
        }),
      0,
    );
    return m;
  };

  /* ---------- Login do Google (token só em memória) ----------
     Importar um arquivo usa só leitura. Enviar cortes precisa do acesso completo ao Drive: o escopo restrito
     "drive.file" não deixa gravar numa pasta que outra pessoa criou e compartilhou. */
  const G_READ = 'https://www.googleapis.com/auth/drive.readonly',
    G_WRITE = 'https://www.googleapis.com/auth/drive';
  function googleToken(clientId, scope = G_READ, pick = false) {
    const load = () =>
      new Promise((ok, bad) => {
        if (window.google && google.accounts && google.accounts.oauth2) return ok();
        const sc = document.createElement('script');
        sc.src = 'https://accounts.google.com/gsi/client';
        sc.async = true;
        sc.onload = ok;
        sc.onerror = () => bad(new Error('Não foi possível carregar o login do Google.'));
        document.head.appendChild(sc);
      });
    return load().then(
      () =>
        new Promise((ok, bad) => {
          google.accounts.oauth2
            .initTokenClient({
              client_id: clientId,
              scope,
              callback: (t) =>
                t.access_token ? ok(t.access_token) : bad(new Error('Não foi possível entrar com o Google.')),
              error_callback: () =>
                bad(
                  new Error(
                    'Login cancelado ou bloqueado pelo navegador. Se o erro for origin_mismatch, adicione este endereço às origens autorizadas do cliente OAuth.',
                  ),
                ),
            })
            .requestAccessToken({ prompt: pick ? 'select_account' : '' });
        }),
    );
  }

  // As telas: cada arquivo acrescenta as suas (pages.clips, pages.transcription...).
  const pages = {};
  Object.assign(INVB, {
    S,
    $,
    api,
    go,
    guard,
    googleToken,
    esc,
    segsOf,
    tm,
    ic,
    $$,
    toast,
    statusLabel,
    isDone,
    fmtSize,
    fmtDate,
    pages,
    chaptersOf,
    stClass,
    popover,
    modal,
    linesOf,
    dl,
    parseT,
    srtT,
    G_WRITE,
    EC,
  });
})();
