/* INVB Studio — área logada. Conversa com a API local (server.js): login, uploads, transcrição,
   análise, cortes e roteiros são reais. Ver README para o que depende de IA/ferramentas. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tm = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
  const parseT = (v) => { v = String(v).trim(); if (/^\d+(\.\d+)?$/.test(v)) return +v; const p = v.split(':').map(Number); if (p.some(isNaN)) return NaN; return p.reduce((a, n) => a * 60 + n, 0); };
  const srtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
  // Mensagem longa fica mais tempo na tela (dá para ler), e um clique fecha.
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); t.onclick = () => t.classList.remove('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), Math.max(3200, Math.min(15000, String(m || '').length * 70))); };
  const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800); };
  const fmtSize = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(2).replace('.', ',') + ' GB' : (b / 1048576).toFixed(2).replace('.', ',') + ' MB';
  const fmtDate = (t) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const ic = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v10H3z"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
    up: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    vid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
    aud: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l4 4v14H6z"/></svg>',
    cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8 15M20 20L8 9"/></svg>',
    tpl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h6a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v13a2 2 0 012-2h6z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/></svg>',
    script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    dia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="5"/><rect x="3" y="16" width="6" height="5"/><rect x="15" y="16" width="6" height="5"/><path d="M12 8v4M6 16v-4h12v4"/></svg>',
    dl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10 6a9 9 0 0111 6 9 9 0 01-3 4M6 8a9 9 0 00-3 4 9 9 0 0012 5"/></svg>',
    scissors: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8 15M20 20L8 9"/></svg>',
    heartS: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    out: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  };
  const EC = { Determinação: '#a855f7', Confiança: '#3b82f6', Esperança: '#06b6d4', Humildade: '#f59e0b', Gratidão: '#10b981', Alegria: '#eab308', Tristeza: '#64748b', Medo: '#ef4444', Raiva: '#dc2626', Compaixão: '#ec4899', Neutra: '#94a3b8' };

  /* ---------- Estado e API ---------- */
  const S = { authed: null, status: null, uploads: [], cur: null, projects: [], templates: [], images: [], poll: null, media: null, mediaId: null, speed: 1, mode: 'video', rt: 0 };
  let go = (p) => { history.pushState({}, '', p); window.__render(p); };

  async function api(p, o = {}) {
    const h = { 'x-invb': '1' };
    if (o.json !== undefined) h['content-type'] = 'application/json';
    const r = await fetch('/api' + p, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: h, credentials: 'same-origin', body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
    let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
    if (r.status === 401 && p !== '/login') { S.authed = false; const e = new Error('Sessão expirada'); e.status = 401; throw e; }
    if (!r.ok) { const e = new Error((j && j.error) || `Erro ${r.status}`); e.status = r.status; e.data = j; throw e; }
    return j;
  }
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.status === 401) go('/entrar'); else toast(e.message); } };

  /* ---------- Dados derivados ---------- */
  const segsOf = (c) => { const em = {}; ((c.analysis && c.analysis.emotions) || []).forEach((e) => em[e.i] = e.emotion); return ((c.transcript && c.transcript.segments) || []).map((s) => ({ id: s.id, t: s.start, end: s.end, who: s.speaker, text: s.text, emo: em[s.id] || null })); };
  // Linhas curtas (até ~5 s) com o tempo de cada palavra; `seg` aponta para a fala de origem.
  const linesOf = (c) => ((c.transcript && c.transcript.lines) || []).map((l, i) => ({ i, seg: l.seg, t: l.start, end: l.end, who: l.speaker, text: l.text, words: l.words || [] }));
  const chaptersOf = (c) => ((c.analysis && c.analysis.chapters) || []).map((ch) => ({ ...ch, moments: (c.clips || []).filter((k) => k.start >= ch.start && k.start < ch.end).map((k) => ({ title: k.title, t: k.start })) }));
  const isDone = (m) => m.status === 'done';
  const statusLabel = (m) => m.status === 'done' ? 'Concluído' : m.status === 'error' ? 'Erro' : `${m.stage || 'Processando'}${m.progress ? ' ' + m.progress + '%' : ''}`;
  const stClass = (m) => m.status === 'done' ? '' : m.status === 'error' ? 'err' : 'proc';

  /* ---------- Mídia / player (elemento real) ---------- */
  function ensureMedia() {
    const id = S.cur.id; if (S.media && S.mediaId === id) return S.media;
    if (S.media) { S.media.pause(); S.media.remove(); }
    const el = document.createElement(S.cur.kind === 'vid' ? 'video' : 'audio');
    el.preload = 'metadata'; if (S.cur.kind === 'vid') el.poster = `/api/uploads/${id}/thumb`; el.src = `/api/uploads/${id}/media`; el.playsInline = true; el.playbackRate = S.speed;
    ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => el.addEventListener(ev, paintPlayer));
    S.media = el; S.mediaId = id; return el;
  }
  // Aviso quando a pregação saiu do computador (fica salvo só o link) e botão para baixar de novo.
  function goneBanner() {
    const c = S.cur, card = $('#ap-card'); if (!c || !card) return;
    // O vídeo veio num formato que este navegador não toca: o app prepara uma cópia e avisa quando ficar pronta.
    if (c.preview === 'making' && !c.originalGone && !c.refetching) {
      const n = document.createElement('div'); n.className = 'ap-demo gone'; n.setAttribute('role', 'status');
      n.textContent = 'Preparando o vídeo para tocar neste navegador… A transcrição e os cortes já podem ser usados; o vídeo aparece sozinho quando ficar pronto.';
      card.prepend(n); clearInterval(S.poll);
      S.poll = setInterval(async () => { try { const m = await api('/uploads/' + c.id); if (m.preview !== 'making') { clearInterval(S.poll); if (S.media) { S.media.remove(); S.media = null; S.mediaId = null; } go(location.pathname); } } catch { /* tenta de novo */ } }, 4000);
      return;
    }
    if (!(c.originalGone || c.refetching)) return;
    const d = document.createElement('div'); d.className = 'ap-demo gone'; d.setAttribute('role', 'status');
    const wait = () => { clearInterval(S.poll); S.poll = setInterval(async () => { try { const m = await api('/uploads/' + c.id); if (!m.refetching) { clearInterval(S.poll); if (S.media) { S.media.remove(); S.media = null; S.mediaId = null; } go(location.pathname); } } catch { /* tenta de novo */ } }, 2500); };
    let starting = false;
    const start = guard(async () => {
      if (starting) return; starting = true; const btn = $('#refetch', d); if (btn) { btn.disabled = true; btn.textContent = 'Iniciando…'; }
      try { await begin(); } catch (e) { starting = false; paint(); throw e; }
    });
    const begin = async () => {
      const run = (t) => api(`/uploads/${c.id}/refetch`, { json: t ? { token: t } : {} });
      try { await run(); } catch (e) { if (!(e.data && e.data.needsLogin) || !(S.status && S.status.driveClientId)) throw e; await run(await googleToken(S.status.driveClientId)); } // arquivo privado do Drive: entra com o Google e repete
      c.refetching = true; c.refetchError = null; paint(); wait();
    };
    const paint = () => {
      d.innerHTML = c.refetching ? 'Baixando a pregação de novo… Pode levar alguns minutos. A transcrição e os cortes continuam disponíveis.'
        : c.canRefetch ? `<span>A pregação saiu deste computador para liberar espaço. A transcrição e os cortes continuam aqui; para assistir ou exportar um corte novo, baixe de novo.${c.refetchError ? `<br><b>${esc(c.refetchError)}</b>` : ''}</span><button class="ap-btn" id="refetch">Baixar de novo</button>`
        : 'O arquivo original não está mais neste computador e não há link salvo para baixá-lo de novo.';
      const b = $('#refetch', d); if (b) b.onclick = start;
    };
    paint(); card.prepend(d); if (c.refetching) wait();
  }
  const parkMedia = () => { if (S.media) { S.media.hidden = true; document.body.appendChild(S.media); } };
  function mountMedia() {
    const el = ensureMedia(); const slot = $('.vid-slot');
    if (slot && S.cur.kind === 'vid') { slot.innerHTML = ''; el.hidden = false; el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;border-radius:inherit'; slot.appendChild(el); } else { el.hidden = true; document.body.appendChild(el); }
  }
  const seek = (t) => { const el = ensureMedia(); el.currentTime = t; paintPlayer(); };
  const waveBins = (c) => { const n = 90, bins = new Array(n).fill(0), d = c.duration || 1; segsOf(c).forEach((s) => { const w = s.text.split(/\s+/).length, a = Math.floor((s.t / d) * n), b = Math.max(a, Math.min(n - 1, Math.floor((s.end / d) * n))); for (let i = a; i <= b; i++) bins[i] += w / (b - a + 1); }); const mx = Math.max(...bins, 1); return bins.map((v) => 12 + 88 * (v / mx)); };
  function player() {
    return `<div class="pbar"><div class="wave2" id="wave">${waveBins(S.cur).map((h) => `<i style="height:${h}%"></i>`).join('')}</div>
      <div class="pctl">${S.cur.kind === 'vid' ? `<div class="tg2"><button data-media="audio" class="${S.mode === 'audio' ? 'on' : ''}">Áudio</button><button data-media="video" class="${S.mode === 'video' ? 'on' : ''}">Vídeo</button></div>` : '<span></span>'}
      <div class="mid"><span class="tm" id="ptm">00:00 / ${tm(S.cur.duration)}</span><button id="pb" aria-label="Voltar 10 segundos">⏪</button><button class="play" id="pp" aria-label="Reproduzir">${ic.play}</button><button id="pf" aria-label="Avançar 10 segundos">⏩</button></div>
      <button id="psp" class="ap-btn" style="height:28px">${S.speed}x</button></div></div>`;
  }
  // Durante a reprodução, a linha falada fica no topo da transcrição, logo abaixo da busca.
  // Se a pessoa rolou a página por conta própria nos últimos segundos, não puxamos a tela de volta.
  function followLine(i) {
    const el = S.media, card = $('#ap-card'), ln = i >= 0 && document.querySelector(`.ln[data-l="${i}"]`);
    if (!el || el.paused || !card || !ln || Date.now() - (S.userScrollAt || 0) < 4000) return;
    // O cabeçalho preso fica um pouco abaixo da borda do cartão (o recuo interno); a linha tem que parar logo abaixo dele.
    const head = $('.tr-head'), cr = card.getBoundingClientRect(), pad = parseFloat(getComputedStyle(card).paddingTop) || 0;
    const hr = head ? head.getBoundingClientRect() : null, inset = hr ? Math.min(pad, Math.max(0, hr.top - cr.top)) : 0;
    const top = ln.getBoundingClientRect().top - cr.top + card.scrollTop - inset - (head ? head.offsetHeight : 0) - 6;
    card.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function paintPlayer() {
    const w = $('#wave'); if (!w || !S.media) return; const el = S.media, dur = S.cur.duration || el.duration || 1, t = el.currentTime || 0;
    const k = Math.floor((t / dur) * w.children.length); [...w.children].forEach((e, i) => e.classList.toggle('p', i < k));
    $('#ptm').textContent = `${tm(t)} / ${tm(dur)}`; $('#pp').innerHTML = el.paused ? ic.play : ic.pause;
    let act = -1; (S.segs || []).forEach((s, i) => { if (s.t <= t) act = i; });
    $$('.seg:not(.ln)').forEach((e) => e.classList.toggle('act', +e.dataset.i === act && !el.paused));
    let actL = -1; (S.lines || []).forEach((s, i) => { if (s.t <= t) actL = i; });
    $$('.ln').forEach((e) => e.classList.toggle('act', +e.dataset.l === actL && !el.paused));
    if (actL !== S.followL) { S.followL = actL; followLine(actL); }
  }
  function bindPlayer() {
    if (!$('#wave')) return; const el = ensureMedia();
    $('#pp').onclick = () => (el.paused ? el.play().catch(() => toast('Não foi possível reproduzir este arquivo no navegador.')) : el.pause());
    $('#pb').onclick = () => seek(Math.max(0, el.currentTime - 10)); $('#pf').onclick = () => seek(el.currentTime + 10);
    $('#psp').onclick = (e) => { S.speed = S.speed === 1 ? 1.5 : S.speed === 1.5 ? 2 : 1; el.playbackRate = S.speed; e.target.textContent = S.speed + 'x'; };
    $('#wave').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * (S.cur.duration || el.duration || 0)); };
    $$('[data-media]').forEach((b) => b.onclick = () => { S.mode = b.dataset.media; $$('[data-media]').forEach((x) => x.classList.toggle('on', x === b)); $$('.vid-slot').forEach((v) => v.style.display = S.mode === 'audio' ? 'none' : ''); });
    paintPlayer();
  }

  /* ---------- Shell ---------- */
  const link = (href, ico, label, path) => `<a class="ap-link ${path === href || (href !== '/app' && path.startsWith(href + '/') && !/uploads\/[^/]+/.test(href)) ? 'on' : ''}" href="${href}">${ico}${label}</a>`;
  function shell(path, inner, uid) {
    const up = uid ? `/app/uploads/${uid}` : null, st = S.status;
    const nav = up
      ? `<a class="ap-link" href="/app/uploads">${ic.back}Voltar aos Envios</a>${link(up + '/overview', ic.files, 'Resumo', path)}${link(up + '/transcription', ic.doc, 'Transcrição', path)}
         <div class="ap-sec">Cortes</div>${link(up + '/clips', ic.cut, 'Cortes', path)}${link(up + '/templates', ic.tpl, 'Templates', path)}${link(up + '/library', ic.img, 'Biblioteca', path)}
         <div class="ap-sec">Narrativa</div>${link(up + '/chapters', ic.book, 'Capítulos', path)}${link(up + '/emotions', ic.heart, 'Emoções', path)}${link(up + '/scripts', ic.script, 'Roteiros', path)}${link(up + '/diagrams', ic.dia, 'Diagramas', path)}`
      : `${link('/app', ic.home, 'Início', path)}${link('/app/uploads', ic.files, 'Arquivos', path)}${link('/app/projects', ic.folder, 'Projetos', path)}`;
    return `<div class="ap">
      <div class="ap-top"><a href="/app"><b>INVB Studio</b></a><button id="ap-burger" aria-label="Abrir menu">☰</button></div>
      <aside class="ap-side" id="ap-side"><div class="ap-ws" style="cursor:default"><i>IS</i><span>INVB Studio</span></div>${nav}<div class="ap-grow"></div>
        ${st ? `<p class="ap-plan" style="line-height:1.4">Transcrição: ${esc(st.provider_name || 'API')} (${esc(st.model)})<br>IA: ${st.llm ? esc(st.llmModel) : 'desligada'}</p>` : ''}
        <div class="ap-foot"><button class="ap-btn" id="ap-out" style="flex:1;justify-content:center">${ic.out} Sair</button></div></aside>
      <div class="ap-main"><div class="ap-card" id="ap-card">${inner}</div>${uid && S.cur && isDone(S.cur) ? player() : ''}</div></div>`;
  }

  const modal = (title, body, onOk, okLabel = 'Salvar', desc = '') => {
    const m = document.createElement('div'); m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${title}</h3><p>${desc}</p>${body}<div class="ft"><button class="ap-btn" data-x>Cancelar</button><button class="ap-btn pri" data-ok>${okLabel}</button></div></div>`;
    document.body.appendChild(m); const close = () => m.remove();
    m.onclick = (e) => { if (e.target === m || e.target.dataset.x !== undefined) close(); };
    $('[data-ok]', m).onclick = async () => { const r = await onOk(m); if (r !== false) close(); };
    const f = $('input,textarea,select', m); if (f) f.focus(); return m;
  };
  const popover = (anchor, html, bind) => {
    $$('.menu').forEach((x) => x.remove()); const r = anchor.getBoundingClientRect();
    const m = document.createElement('div'); m.className = 'menu'; m.innerHTML = html; m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - 240, r.right - 220)) + 'px'; m.style.position = 'fixed';
    document.body.appendChild(m); if (bind) bind(m);
    setTimeout(() => document.addEventListener('click', function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', h); } }), 0); return m;
  };

  /* ---------- Login do Google (token só em memória) ----------
     Importar um arquivo usa só leitura. Enviar cortes precisa do acesso completo ao Drive: o escopo restrito
     "drive.file" não deixa gravar numa pasta que outra pessoa criou e compartilhou. */
  const G_READ = 'https://www.googleapis.com/auth/drive.readonly', G_WRITE = 'https://www.googleapis.com/auth/drive';
  function googleToken(clientId, scope = G_READ) {
    const load = () => new Promise((ok, bad) => { if (window.google && google.accounts && google.accounts.oauth2) return ok(); const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = ok; sc.onerror = () => bad(new Error('Não foi possível carregar o login do Google.')); document.head.appendChild(sc); });
    return load().then(() => new Promise((ok, bad) => { google.accounts.oauth2.initTokenClient({ client_id: clientId, scope, callback: (t) => (t.access_token ? ok(t.access_token) : bad(new Error('Não foi possível entrar com o Google.'))), error_callback: () => bad(new Error('Login cancelado ou bloqueado pelo navegador. Se o erro for origin_mismatch, adicione este endereço às origens autorizadas do cliente OAuth.')) }).requestAccessToken({ prompt: '' }); }));
  }

  /* ---------- Envio (real) ---------- */
  const OKEXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|mov|avi|mkv|webm|m4v)$/i;
  function sendFile(file, root) {
    if (!OKEXT.test(file.name)) return toast('Formato não suportado. Use MP3, WAV, M4A, MP4, MOV, MKV…');
    const bar = $('#upbar', root), lab = $('#uplab', root); if (bar) bar.parentElement.hidden = false;
    const x = new XMLHttpRequest(); x.open('POST', '/api/uploads?name=' + encodeURIComponent(file.name)); x.setRequestHeader('x-invb', '1');
    x.upload.onprogress = (e) => { if (e.lengthComputable && bar) { bar.style.width = (e.loaded / e.total) * 100 + '%'; lab.textContent = `Enviando ${fmtSize(e.loaded)} de ${fmtSize(e.total)}…`; } };
    x.onload = () => { if (x.status === 201) { toast('Envio concluído. Processando…'); go('/app/uploads'); } else { let m = 'Falha no envio.'; try { m = JSON.parse(x.responseText).error; } catch { /* */ } if (x.status === 401) return go('/entrar'); toast(m); if (bar) bar.parentElement.hidden = true; } };
    x.onerror = () => toast('Falha de conexão com o servidor.');
    x.send(file);
  }
  const uploadBox = () => `<div class="ap-tabs full" role="tablist"><button role="tab" aria-selected="true" data-ut="file">${ic.up.replace('22', '15')}Enviar arquivo</button><button role="tab" aria-selected="false" data-ut="yt">▶ YouTube</button><button role="tab" aria-selected="false" data-ut="drive">${ic.folder.replace('<svg', '<svg width="15" height="15"')}Google Drive</button></div><div id="ut-body"></div>`;
  function bindUpload(root) {
    const body = $('#ut-body', root); if (!body) return;
    const showFile = () => { body.innerHTML = `<div class="ap-drop" id="drop"><div class="ci">${ic.up}</div><b>Arraste seu arquivo aqui</b><small>ou clique para selecionar</small><p class="fm">Recomendamos formato .MP3 para melhor velocidade de processamento e compatibilidade<br>Áudio: MP3, WAV, M4A, AAC, OGG, OPUS, WEBM • Vídeo: MP4, MOV, AVI, MKV</p><button class="ap-btn pri lg" id="pick">Enviar Arquivo</button><input type="file" id="file" hidden accept="audio/*,video/*,.mkv,.mov"><div hidden style="max-width:420px;margin:18px auto 0"><div class="bigbar"><i id="upbar" style="width:0"></i></div><small id="uplab" class="sub2"></small></div></div>`;
      const f = $('#file', body), pick = () => f.click(), d = $('#drop', body);
      $('#pick', body).onclick = (e) => { e.stopPropagation(); pick(); }; d.onclick = (e) => { if (!e.target.closest('[hidden]')) pick(); };
      f.onchange = () => f.files[0] && sendFile(f.files[0], body);
      d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over'); d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); e.dataTransfer.files[0] && sendFile(e.dataTransfer.files[0], body); };
    };
    const showYt = () => { body.innerHTML = `<div class="ap-yt"><b style="font-size:16px">Cole o link do YouTube</b><br><span class="sub2">Vídeo, Shorts ou live com replay disponível. Exige yt-dlp instalado no servidor.</span><br><input id="yt" placeholder="https://www.youtube.com/watch?v=..." aria-label="Link do YouTube"><br><button class="ap-btn pri lg" id="ytgo">Importar link</button></div>`;
      $('#ytgo', body).onclick = guard(async () => { await api('/uploads/youtube', { json: { url: $('#yt', body).value.trim() } }); go('/app/uploads'); }); };
    const showDrive = () => {
      const cid = S.status && S.status.driveClientId;
      body.innerHTML = `<div class="ap-yt"><b style="font-size:16px">Cole o link de um arquivo do Google Drive</b><br><span class="sub2">Vídeo ou áudio. Arquivos com “qualquer pessoa com o link” baixam direto; os privados pedem login com o Google.</span><br><input id="dr" placeholder="https://drive.google.com/file/d/..." aria-label="Link do Google Drive"><br><button class="ap-btn pri lg" id="drgo">Importar link</button><p class="sub2" id="drmsg" style="margin-top:12px;color:#c0262d"></p><button class="ap-btn" id="drlogin" hidden>Entrar com o Google e tentar de novo</button></div>`;
      const send = async (token) => { const msg = $('#drmsg', body); msg.textContent = ''; try { await api('/uploads/drive', { json: { url: $('#dr', body).value.trim(), token } }); toast('Download do Drive iniciado.'); go('/app/uploads'); } catch (e) { if (e.status === 401) return go('/entrar'); msg.textContent = e.message; if (e.data && e.data.needsLogin && cid) $('#drlogin', body).hidden = false; } };
      $('#drgo', body).onclick = () => send();
      $('#drlogin', body).onclick = async () => { try { const t = await googleToken(cid); await send(t); } catch (e) { $('#drmsg', body).textContent = e.message; } };
    };
    $$('[data-ut]', root).forEach((b) => b.onclick = () => { $$('[data-ut]', root).forEach((x) => x.setAttribute('aria-selected', x === b)); b.dataset.ut === 'yt' ? showYt() : b.dataset.ut === 'drive' ? showDrive() : showFile(); });
    showFile();
  }

  /* ---------- Páginas ---------- */
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const upCard = (u) => `<a class="ap-up" href="/app/uploads/${u.id}/overview"><div class="th"><i>${u.kind === 'aud' ? ic.aud : ic.vid}</i>${u.kind === 'vid' && u.status === 'done' ? `<img src="/api/uploads/${u.id}/thumb" alt="" loading="lazy" onerror="this.remove()">` : ''}${u.duration ? `<em>${tm(u.duration)}</em>` : ''}</div><b>${esc(u.name)}</b><small>${fmtDate(u.createdAt).split(',')[0]} · ${fmtSize(u.size)}</small></a>`;
  const aiOn = () => !!(S.status && S.status.ai);
  const aiFailNote = (c) => { const n = String((c.analysis && c.analysis.note) || ''), m = /^A IA não conseguiu analisar esta pregação \((.*?)\)\./.exec(n); return m ? m[1] : ''; };
  const note = (c) => !(c.analysis && c.analysis.mode === 'heuristic') ? '' : aiOn()
    ? `<div class="ap-demo gone" role="status"><span>${aiFailNote(c) ? 'A IA não conseguiu analisar esta pregação: ' + esc(aiFailNote(c)) + '.' : 'Esta pregação foi analisada sem IA, antes de a chave estar ligada neste computador.'} Capítulos, emoções e cortes podem ser refeitos com ${esc(S.status.aiName || 'a IA')}.</span><button class="ap-btn" data-reana>Refazer com IA</button></div>`
    : '<div class="ap-demo" style="background:#f3f2ff;border-color:#d5d2ff;color:#3b2fc0">Análise local simples, sem IA: capítulos por pausas e cortes por ritmo de fala. Com uma chave do Claude ou da OpenAI neste computador, capítulos, emoções e cortes passam a vir da IA.</div>';
  // Refaz a análise e espera o resultado (capítulos e emoções pela IA; os cortes automáticos são trocados; os manuais ficam).
  const reanalyze = guard(async (btn) => {
    const id = S.cur.id, before = JSON.stringify([S.cur.analysis && S.cur.analysis.mode, S.cur.aiCutsAt || 0, (S.cur.analysis && S.cur.analysis.note) || '']);
    if (btn) { btn.disabled = true; btn.textContent = 'Analisando…'; }
    await api(`/uploads/${id}/reanalyze`, { json: {} });
    for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 3000)); const m = await api('/uploads/' + id); if (JSON.stringify([m.analysis && m.analysis.mode, m.aiCutsAt || 0, (m.analysis && m.analysis.note) || '']) !== before) { toast('Análise refeita.'); return go(location.pathname); } }
    if (btn) { btn.disabled = false; btn.textContent = 'Refazer com IA'; } toast('A análise está demorando. Recarregue a página em instantes.');
  });
  const procView = (c) => `<div class="empty" id="proc"><div class="ci">${c.status === 'error' ? '⚠️' : '⏳'}</div><h3>${c.status === 'error' ? 'Não foi possível processar' : 'Processando…'}</h3><p id="procmsg">${c.status === 'error' ? esc(c.error || 'Erro desconhecido.') : esc(statusLabel(c))}</p>${c.status === 'error' ? `<button class="ap-btn pri" id="retry">Tentar de novo</button> ` : `<div class="bigbar" style="max-width:320px;margin:10px auto"><i id="procbar" style="width:${c.progress || 3}%"></i></div>`}<a class="ap-btn" href="/app/uploads">Voltar aos Envios</a></div>`;

  const pages = {
    home: () => `<h1>${greeting()}</h1><p class="sub2">Envie um arquivo e deixe o resto com a gente.</p><div style="height:20px"></div>${uploadBox()}
      <div class="ap-h2"><h2>Últimos envios</h2><a href="/app/uploads">Ver mais ›</a></div>${S.uploads.length ? `<div class="ap-cards">${S.uploads.slice(0, 4).map(upCard).join('')}</div>` : '<p class="sub2">Nenhum envio ainda.</p>'}`,
    uploads: () => `<div class="ap-head"><div><h1>Arquivos</h1><p class="sub2">Gerencie e acompanhe o status dos seus arquivos.</p></div><a class="ap-btn pri" href="/app/uploads/new">${ic.up.replace('22', '14')}Enviar Arquivo</a></div>
      <div class="ap-tools"><label class="ap-search">${ic.search}<input id="fq" placeholder="Buscar arquivos por nome..."></label><span class="ap-sp"></span><button class="ap-btn" id="fsort">⇅ Data: Mais recentes ⌄</button><button class="ap-btn" id="ffil">Filtros</button></div>
      <p class="sub2" id="fcnt" style="margin-bottom:10px"></p><div id="flist"></div>`,
    uploadsNew: () => `<div style="max-width:720px;margin:30px auto"><div class="ap-head"><h1 style="font-size:24px">Enviar Arquivo</h1></div>${uploadBox()}<p class="sub2" style="text-align:center">Seus arquivos ficam no seu computador (pasta <code>data/</code>) e não são enviados a terceiros${S.status && (S.status.provider === 'openai' || S.status.llm) ? ', exceto o texto/áudio enviado à API de IA configurada' : ''}.</p></div>`,
    projects: () => `<div class="ap-head"><div><h1>Projetos</h1><p class="sub2">Organize seus arquivos em projetos.</p></div>${S.projects.length ? '<button class="ap-btn pri" id="newproj">Novo Projeto</button>' : ''}</div>
      ${S.projects.length ? `<div class="ap-cards">${S.projects.map((p) => `<div class="tpl"><div style="aspect-ratio:3/2;background:#f4f4f6;border-radius:10px;display:grid;place-items:center">${ic.folder.replace('<svg', '<svg width="28" height="28"')}</div><b style="margin-top:8px">${esc(p.name)}</b><small style="color:var(--muted)">${S.uploads.filter((u) => u.projectId === p.id).length} arquivos</small><button class="ap-btn" data-addp="${p.id}">Adicionar arquivo</button><button class="ap-btn" data-delp="${p.id}">Excluir</button></div>`).join('')}</div>`
        : `<div class="empty"><div class="ci">${ic.folder}</div><h3>Nenhum projeto encontrado</h3><p>Crie seu primeiro projeto para organizar seus envios.</p><button class="ap-btn pri" id="newproj">Novo Projeto</button></div>`}`,
    overview: (c) => {
      const segs = segsOf(c), spk = new Set(segs.map((s) => s.who)).size, ch = chaptersOf(c), emo = (c.analysis.emotions || []).length;
      const cards = [['transcription', ic.doc, 'Transcrição', 'Seu áudio foi transcrito automaticamente, com segmentação por trecho.', `Palavras transcritas: ${c.words || 0}`], ['chapters', ic.book, 'Capítulos', 'O conteúdo foi dividido em capítulos para facilitar a navegação.', `Capítulos: ${ch.length}`], ['emotions', ic.heart, 'Emoções', emo ? 'Tom emocional das falas mais marcantes.' : aiOn() ? 'Ainda não analisado com a IA.' : 'Marcado pela IA (Claude ou OpenAI).', emo ? `${emo} falas marcadas` : aiOn() ? 'Refaça a análise' : 'Sem IA'], ['clips', ic.cut, 'Cortes', 'Trechos sugeridos, com nota.', `${(c.clips || []).length} cortes`], ['scripts', ic.script, 'Roteiros', 'Roteiros que apontam para as falas exatas do arquivo.', `${(c.scripts || []).length} criados`]];
      return `${note(c)}<div class="ov"><div class="vid vid-slot"><div class="pl">▶</div></div><div><span class="eyebrow" style="font-size:10px">Resumo</span><h1 style="font-size:24px;margin-top:4px">${esc(c.name)}</h1><div class="metachips"><span class="metachip">${c.kind === 'aud' ? 'Áudio' : 'Vídeo'} enviado</span><span class="metachip">${tm(c.duration)}</span><span class="metachip">${esc(c.language || '—')}</span><span class="metachip">${fmtDate(c.createdAt)}</span></div>
        <p style="margin:12px 0">Transcrevemos <b>${c.words || 0}</b> palavras, divididas em <b>${ch.length}</b> capítulos.</p><a class="ap-btn" href="/app/uploads/${c.id}/transcription">Abrir transcrição</a> <a class="ap-btn" href="/app/uploads/${c.id}/clips">Ver cortes</a> <button class="ap-btn" id="reana">Refazer análise</button></div></div>
        <div class="kpis">${[['Duração do áudio', tm(c.duration)], ['Palavras transcritas', String(c.words || 0)], ['Segmentos de fala', String(segs.length)], ['Falantes identificados', String(spk)], ['Momentos-chave', String((c.clips || []).length)]].map((k) => `<div><small>${k[0]}</small><b>${k[1]}</b></div>`).join('')}</div>
        <h2 style="font-size:17px;margin-bottom:4px">O que está pronto</h2><p class="sub2" style="margin-bottom:14px">Toque numa análise para abrir.</p><div class="rdy">${cards.map((k) => `<a href="/app/uploads/${c.id}/${k[0]}"><div class="ib">${k[1]}</div><b>${k[2]}</b><p>${k[3]}</p><p style="margin-top:8px;font-size:11px">${k[4]}</p></a>`).join('')}</div>`;
    },
    transcription: (c) => `<h1>Transcrição</h1><p class="sub2">Áudio transcrito em linhas curtas, cada uma com o seu tempo. Clique em uma palavra para ir ao segundo exato dela${c.analysis.emotions && c.analysis.emotions.length ? ' e análise emocional' : ''}. A separação de falantes não é automática: todas as falas começam como “Pessoa 1” e você pode renomear.</p><div style="height:16px"></div>
      <div class="tr2"><div><div class="tr-head"><div class="ap-tools"><label class="ap-search" style="max-width:none">${ic.search}<input id="tq" placeholder="Buscar na transcrição..."></label></div>
      <div class="ap-tools"><span class="ap-sp"></span><button class="ap-btn pri" id="tclaude">Copiar para o Claude</button><button class="ap-btn" id="tcut" hidden>Criar corte da seleção</button><button class="ap-btn" id="tsel">Selecionar</button><button class="ap-btn" id="tdl">${ic.dl} Baixar ⌄</button><button class="ap-btn" id="tfil">Filtros</button></div></div>
      <div class="segs" id="segs"></div><div class="stat3"><h4>Resumo Estatístico</h4><div class="g"><div><b>${(c.clips || []).length}</b><small>Momentos-chave</small></div><div><b>${tm(c.duration)}</b><small>Duração total</small></div><div><b>${c.words || 0}</b><small>Palavras</small></div></div></div></div>
      <div class="rpanel">${c.kind === 'vid' ? '<div class="vid vid-slot"></div>' : ''}<div class="dlp"><b style="color:var(--fg)">Baixar</b><button class="ap-btn" data-d="orig">Baixar arquivo original</button><div class="g2">${['TXT', 'SRT', 'VTT'].map((f) => `<button class="ap-btn" data-d="${f}">${f}</button>`).join('')}</div></div></div></div>`,
    clips: (c) => `${S.status && S.status.ai && c.aiCutsError ? `<div class="ap-demo gone" role="status"><span>A IA não conseguiu sugerir os cortes automáticos desta pregação: ${esc(c.aiCutsError)}</span><button class="ap-btn" id="ai-retry">Tentar de novo com IA</button></div>` : S.status && S.status.ai && c.aiCuts ? '' : note(c)}<div class="ap-head"><div><h1>Cortes</h1><p class="sub2">Cortes do seu ${c.kind === 'aud' ? 'áudio' : 'vídeo'} prontos para postar.</p></div><div class="ap-tools" style="margin:0">${S.status && S.status.ai ? '<button class="ap-btn" id="cl-ai" title="O Claude lê a transcrição e cria os cortes">✨ Sugerir cortes com IA</button>' : ''}<button class="ap-btn" id="cl-paste">Colar minutagens</button><button class="ap-btn pri" id="cl-new">+ Novo corte</button></div></div>
      <div class="ap-tabs" id="cl-tabs"><button role="tab" aria-selected="true" data-m="0">Automáticos</button><button role="tab" aria-selected="false" data-m="1">Manuais</button></div>
      <div class="ap-tools"><label class="ap-search">${ic.search}<input id="cq" placeholder="Buscar nos cortes"></label><span class="ap-sp"></span><button class="ap-btn" id="csort">⇅ Maior impacto ⌄</button><button class="ap-btn" id="cfil">Filtros</button></div><p class="sub2" id="ccnt" style="margin-bottom:12px"></p><div class="cuts" id="cuts"></div>`,
    templates: () => `<div class="ap-demo" style="background:#f3f2ff;border-color:#d5d2ff;color:#3b2fc0">Prévia: os templates ainda <b>não são aplicados</b> na renderização dos cortes.</div><div class="ap-head"><div><h1>Templates</h1><p class="sub2">Salve um visual inteiro uma vez e aplique em qualquer corte com um clique.</p></div><button class="ap-btn pri" id="tp-new">+ Novo template</button></div><div class="ap-tabs" id="tp-tabs"><button role="tab" aria-selected="true" data-k="0">Meus templates</button><button role="tab" aria-selected="false" data-k="1">Prontos</button></div><div id="tp-body"></div>`,
    library: () => `<div class="ap-demo" style="background:#f3f2ff;border-color:#d5d2ff;color:#3b2fc0">Prévia: as imagens ficam só nesta aba do navegador e ainda <b>não entram</b> nos cortes renderizados.</div><div class="ap-head"><div><h1>Biblioteca</h1><p class="sub2">Suas imagens e fontes, prontas para usar em qualquer corte.</p></div><button class="ap-btn pri" id="lb-up">${ic.img.replace('<svg', '<svg width="14" height="14"')} Enviar imagem</button><input type="file" id="lb-f" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml"></div><div class="ap-tabs" id="lb-tabs"><button role="tab" aria-selected="true" data-k="0">Mídias</button><button role="tab" aria-selected="false" data-k="1">Fontes</button></div><div id="lb-body"></div>`,
    chapters: (c) => `${note(c)}<div class="ap-head"><div><h1>Capítulos</h1><p class="sub2">Navegue pelo conteúdo do áudio por temas e tópicos.</p></div><button class="ap-btn" id="ch-exp">Exportar timestamps ⌄</button></div>
      <p class="sub2" style="margin-bottom:12px">${chaptersOf(c).length} capítulos</p><div id="chps">${chaptersOf(c).map((k, i) => `<div class="chp ${i === 0 ? 'open' : ''}" data-i="${i}" style="cursor:pointer"><div class="n">${i + 1}</div><div style="flex:1"><h3>${esc(k.title)}</h3><p>${esc(k.summary)}</p><div class="mt"><span>⏱ ${tm(k.start)}</span><span>${tm(k.end - k.start)} de duração</span>${k.moments.length ? `<span>${k.moments.length} momentos</span>` : ''}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${(k.tags || []).map((t) => `<span class="tag2">${esc(t)}</span>`).join('')}</div></div><button class="ap-ic" data-dlc="${i}" aria-label="Baixar">${ic.dl}</button></div><div class="moms" ${i === 0 ? '' : 'hidden'}><div class="mom" data-t="${k.start}"><span>${tm(k.start)}</span>Ir para o início do capítulo</div>${k.moments.map((m) => `<div class="mom" data-t="${m.t}"><span>${tm(m.t)}</span>${esc(m.title)}</div>`).join('')}</div>`).join('')}</div>`,
    emotions: (c) => (c.analysis.emotions || []).length ? `<div class="ap-head"><div><h1>Emoções</h1><p class="sub2">Análise emocional da transcrição.</p></div><button class="ap-btn" id="em-ord">⇅ Ordem no vídeo ⌄</button></div><label class="ap-search" style="max-width:none">${ic.search}<input id="eq" placeholder="Buscar na transcrição..."></label><div class="chiprow" id="echips"></div><div class="emo" id="emo"></div>`
      : `<h1>Emoções</h1><div class="empty"><div class="ci">${ic.heart}</div><h3>${aiOn() ? 'Emoções ainda não analisadas' : 'Emoções precisam de IA'}</h3><p>${aiOn() ? `Esta pregação foi analisada antes de a IA estar ligada. Refaça a análise para o ${esc(S.status.aiName || 'modelo')} marcar o tom emocional das falas.` : 'O tom emocional das falas é marcado pela IA. Para ativar, coloque uma chave do Claude ou da OpenAI no arquivo <code>install/pessoal.env</code> e abra o app de novo.'}</p>${aiOn() ? '<button class="ap-btn pri" data-reana>Refazer análise com IA</button>' : `<a class="ap-btn" href="/app/uploads/${c.id}/overview">Ir ao Resumo</a>`}</div>`,
    scripts: (c) => `<div class="ap-head"><div><h1>Roteiros</h1><p class="sub2">Cada roteiro aponta para as falas exatas do seu arquivo, pronto pro editor.</p></div>${(c.scripts || []).length ? '<button class="ap-btn pri" id="sc-new">+ Novo roteiro</button>' : ''}</div><div id="sc-body"></div>`,
    diagrams: (c) => `<h1>Diagramas</h1><p class="sub2">Sua transcrição em mapa mental, fluxo e linha do tempo, montados a partir dos capítulos. Clique em qualquer ponto para abrir o trecho no player.</p><div style="height:16px"></div><div id="dg-body"></div>`,
  };

  /* ---------- binds ---------- */
  function bindUploads() {
    let q = '', sort = 'recent', stF = '';
    const draw = () => {
      let l = S.uploads.filter((u) => u.name.toLowerCase().includes(q) && (!stF || (stF === 'done' ? u.status === 'done' : stF === 'err' ? u.status === 'error' : ['queued', 'processing'].includes(u.status))));
      if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name)); if (sort === 'old') l = [...l].sort((a, b) => a.createdAt - b.createdAt);
      $('#fcnt').textContent = `${l.length} arquivo${l.length === 1 ? '' : 's'}`;
      $('#flist').innerHTML = l.map((u) => `<div class="ap-row" data-up="${u.id}"><span style="color:var(--primary)">${u.kind === 'aud' ? ic.aud.replace('20', '16') : ic.vid.replace('20', '16')}</span><a class="nm" href="/app/uploads/${u.id}/overview"><b>${esc(u.name)}</b><small>Enviado em ${fmtDate(u.createdAt)} • ${fmtSize(u.size)}</small></a><span class="st ${stClass(u)}">${esc(statusLabel(u))}</span><button class="ap-ic" data-opt="${u.id}" aria-label="Opções do upload">⋮</button></div>`).join('') || '<div class="empty"><p>Nenhum arquivo encontrado.</p></div>';
      $$('[data-opt]').forEach((b) => b.onclick = (e) => { e.preventDefault(); const id = b.dataset.opt, u = S.uploads.find((z) => z.id === id);
        popover(b, `<button data-a="open">Abrir</button><button data-a="ren">Renomear</button>${u.status === 'error' ? '<button data-a="retry">Tentar de novo</button>' : ''}${u.status === 'done' && !u.originalGone && (u.source === 'youtube' || u.source === 'drive') && u.url ? '<button data-a="free">Liberar espaço</button>' : ''}<button data-a="del" style="color:#c0262d">Excluir</button>`, (m) => $$('button', m).forEach((x) => x.onclick = () => { m.remove(); const a = x.dataset.a;
          if (a === 'free') return modal('Liberar espaço', '', guard(async () => { await api(`/uploads/${id}/free`, { json: {} }); u.originalGone = true; toast('Pregação apagada deste computador. O link continua salvo.'); }), 'Apagar o vídeo', `Apaga só o vídeo de “${esc(u.name)}” deste computador. A transcrição, a minutagem e os cortes prontos ficam. Para usar o vídeo de novo, o app baixa pelo link.`);
          if (a === 'open') go(`/app/uploads/${id}/overview`);
          if (a === 'ren') modal('Renomear arquivo', `<label>Nome</label><input id="rn" value="${esc(u.name)}">`, guard(async (mm) => { const v = $('#rn', mm).value.trim(); if (!v) return false; await api('/uploads/' + id, { method: 'PATCH', json: { name: v } }); u.name = v; draw(); }));
          if (a === 'retry') guard(async () => { await api(`/uploads/${id}/retry`, { method: 'POST', json: {} }); await refreshList(); })();
          if (a === 'del') modal('Excluir envio', '', guard(async () => { await api('/uploads/' + id, { method: 'DELETE' }); S.uploads = S.uploads.filter((z) => z.id !== id); draw(); toast('Envio excluído do disco.'); }), 'Excluir', `Isso apaga “${esc(u.name)}”, a transcrição e os cortes gerados. Não dá para desfazer.`); })); });
    };
    S.redraw = draw;
    $('#fq').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#fsort').onclick = (e) => popover(e.currentTarget, [['recent', 'Data: Mais recentes'], ['old', 'Data: Mais antigos'], ['name', 'Nome (A–Z)']].map((o) => `<button data-s="${o[0]}">${o[1]}</button>`).join(''), (m) => $$('button', m).forEach((b) => b.onclick = () => { sort = b.dataset.s; $('#fsort').textContent = `⇅ ${b.textContent} ⌄`; m.remove(); draw(); }));
    $('#ffil').onclick = (e) => popover(e.currentTarget, `<label>Status <select id="fs"><option value="">Todos</option><option value="done" ${stF === 'done' ? 'selected' : ''}>Concluído</option><option value="proc" ${stF === 'proc' ? 'selected' : ''}>Processando</option><option value="err" ${stF === 'err' ? 'selected' : ''}>Com erro</option></select></label><div class="act"><button class="ap-btn pri" id="fok">Aplicar</button></div>`, (m) => { $('#fok', m).onclick = () => { stF = $('#fs', m).value; m.remove(); draw(); }; });
    draw();
  }
  async function refreshList() { S.uploads = await api('/uploads'); if (S.redraw) S.redraw(); }
  function bindProjects() {
    const b = $('#newproj'); if (b) b.onclick = () => modal('Novo Projeto', '<label>Nome do projeto</label><input id="pn" placeholder="Ex.: Entrevistas de outubro">', guard(async (m) => { const v = $('#pn', m).value.trim(); if (!v) return false; await api('/projects', { json: { name: v } }); go('/app/projects'); }), 'Criar projeto');
    $$('[data-delp]').forEach((x) => x.onclick = () => modal('Excluir projeto', '', guard(async () => { await api('/projects/' + x.dataset.delp, { method: 'DELETE' }); go('/app/projects'); }), 'Excluir', 'Os arquivos do projeto não são apagados.'));
    $$('[data-addp]').forEach((x) => x.onclick = () => modal('Adicionar arquivo', `<label>Arquivo</label><select id="ap">${S.uploads.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>`, guard(async (m) => { const id = $('#ap', m).value; if (!id) return false; await api('/uploads/' + id, { method: 'PATCH', json: { projectId: x.dataset.addp } }); go('/app/projects'); }), 'Adicionar'));
  }
  function bindTranscription() {
    const c = S.cur; let q = '', sel = false, spk = '', chk = new Set();
    let claudeTxt = ''; const loadClaude = () => api(`/uploads/${c.id}/claude`).then((r) => { claudeTxt = r.text; }).catch(() => {});
    { const card = $('#ap-card'), mark = () => { S.userScrollAt = Date.now(); }; S.userScrollAt = 0; S.followL = -2; if (card) ['wheel', 'touchmove'].forEach((ev) => card.addEventListener(ev, mark, { passive: true })); }
    const reload = async () => { S.cur = await api('/uploads/' + c.id); S.segs = segsOf(S.cur); S.lines = linesOf(S.cur); draw(); await loadClaude(); };
    const linesTxt = (list) => TranscriptUtils.linesToText(list, tm);
    const draw = () => {
      const l = TranscriptUtils.matchLines(S.lines, q, spk);
      $('#segs').innerHTML = l.map((s, k) => { const first = !l[k - 1] || l[k - 1].seg !== s.seg; return `<div class="seg ln${first ? ' first' : ''}" data-l="${s.i}">${sel ? `<input type="checkbox" data-c="${s.i}" ${chk.has(s.i) ? 'checked' : ''}>` : ''}<span class="tcp">${tm(s.t)}</span><div style="flex:1">${first ? `<span class="sp" data-who="${s.seg}">${esc(s.who)}</span>` : ''}<p>${s.words.length ? s.words.map((w) => `<span class="w" data-s="${w.s}">${esc(w.t)}</span>`).join(' ') : esc(s.text)}</p></div>${first ? `<button class="ap-ic" data-ed="${s.seg}" aria-label="Editar texto da fala" style="width:26px;height:26px">${ic.edit}</button>` : '<span style="width:26px"></span>'}</div>`; }).join('') || '<p class="sub2" style="padding:20px">Nada encontrado.</p>';
      $$('.ln').forEach((e) => e.onclick = (ev) => { if (ev.target.closest('[data-who],[data-c],[data-ed]')) return; const w = ev.target.closest('[data-s]'); S.userScrollAt = 0; S.followL = -2; seek(w ? +w.dataset.s : S.lines[+e.dataset.l].t); });
      $$('[data-who]').forEach((e) => e.onclick = () => { const old = S.segs[+e.dataset.who].who; modal('Renomear falante', `<label>Novo nome para “${esc(old)}”</label><input id="nn" value="${esc(old)}">`, guard(async (m) => { const v = $('#nn', m).value.trim(); if (!v) return false; await api(`/uploads/${c.id}/speakers`, { method: 'PATCH', json: { from: old, to: v } }); await reload(); }), 'Salvar', 'O nome vale para todas as falas dessa pessoa.'); });
      $$('[data-ed]').forEach((e) => e.onclick = () => { const s = S.segs[+e.dataset.ed]; modal('Editar fala', `<label>Texto</label><textarea id="et" rows="5">${esc(s.text)}</textarea><label>Falante</label><input id="es" value="${esc(s.who)}">`, guard(async (m) => { const t = $('#et', m).value.trim(); if (!t) return false; const w = $('#es', m).value.trim() || s.who; await api(`/uploads/${c.id}/segments/${s.id}`, { method: 'PATCH', json: { text: t, speaker: w } }); await reload(); }), 'Salvar', `${tm(s.t)} — a correção vale para a exportação. A fala corrigida passa a aparecer em uma linha só.`); });
      $$('[data-c]').forEach((x) => x.onchange = () => x.checked ? chk.add(+x.dataset.c) : chk.delete(+x.dataset.c));
      paintPlayer();
    };
    $('#tq').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#tsel').onclick = () => { if (sel && chk.size) { const t = linesTxt(S.lines.filter((s) => chk.has(s.i))); navigator.clipboard?.writeText(t).then(() => toast('Linhas copiadas.')).catch(() => dl('selecao.txt', t)); } sel = !sel; $('#tsel').textContent = sel ? 'Copiar e concluir' : 'Selecionar'; $('#tcut').hidden = !sel; if (!sel) chk.clear(); draw(); };
    // Corte direto da transcrição: da primeira à última linha marcada (os tempos podem ser ajustados antes de criar).
    $('#tcut').onclick = () => { const pick = S.lines.filter((s) => chk.has(s.i)); if (!pick.length) return toast('Marque as linhas do trecho primeiro.');
      modal('Novo corte', `<label>Título</label><input id="nt" placeholder="Ex.: O amor de Deus"><label>Início (mm:ss)</label><input id="ns" value="${tm(pick[0].t)}"><label>Fim (mm:ss)</label><input id="ne" value="${tm(Math.ceil(pick[pick.length - 1].end))}">`, guard(async (m) => { const s = parseT($('#ns', m).value), e = parseT($('#ne', m).value); if (!(e - s >= 3)) { toast('O corte precisa ter ao menos 3s.'); return false; } await api(`/uploads/${c.id}/clips`, { json: { title: $('#nt', m).value.trim() || 'Corte manual', start: s, end: e } }); toast('Corte criado. Ele está na página Cortes.'); sel = false; chk.clear(); $('#tsel').textContent = 'Selecionar'; $('#tcut').hidden = true; draw(); }), 'Criar corte', 'Do começo da primeira linha marcada ao fim da última.'); };
    // O texto é buscado ao abrir a página para que a cópia aconteça no próprio clique (o navegador exige isso).
    loadClaude();
    $('#tclaude').onclick = () => { if (!claudeTxt) return toast('A transcrição ainda está carregando. Tente de novo em instantes.'); const ok = () => toast('Transcrição copiada. Cole no Claude e peça os cortes.'); if (navigator.clipboard) navigator.clipboard.writeText(claudeTxt).then(ok).catch(() => dl(base + '-para-o-claude.txt', claudeTxt)); else dl(base + '-para-o-claude.txt', claudeTxt); };
    $('#tfil').onclick = (e) => popover(e.currentTarget, `<label>Falante <select id="sf"><option value="">Todos</option>${[...new Set(S.segs.map((s) => s.who))].map((w) => `<option ${w === spk ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label><div class="act"><button class="ap-btn" id="x1">Limpar</button><button class="ap-btn pri" id="x2">Aplicar</button></div>`, (m) => { $('#x1', m).onclick = () => { spk = ''; m.remove(); draw(); }; $('#x2', m).onclick = () => { spk = $('#sf', m).value; m.remove(); draw(); }; });
    const base = c.name.replace(/\.[^.]+$/, '');
    const vtt = (t) => t.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2');
    const srt = () => S.segs.map((s, i) => `${i + 1}\n${srtT(s.t)} --> ${srtT(s.end)}\n${s.text}\n`).join('\n');
    const exp = (f) => { if (f === 'TXT') dl(base + '.txt', linesTxt(S.lines)); else if (f === 'SRT') dl(base + '.srt', srt()); else if (f === 'VTT') dl(base + '.vtt', 'WEBVTT\n\n' + vtt(srt())); else if (f === 'orig') { if (S.cur.originalGone) return toast(S.cur.canRefetch ? 'A pregação saiu deste computador. Use “Baixar de novo” no aviso do topo da página.' : 'O arquivo original não está mais neste computador.'); const a = document.createElement('a'); a.href = `/api/uploads/${c.id}/media?orig=1`; a.download = c.name; a.click(); } };
    $('#tdl').onclick = (e) => popover(e.currentTarget, ['TXT', 'SRT', 'VTT'].map((f) => `<button>${f}</button>`).join(''), (m) => $$('button', m).forEach((b) => b.onclick = () => { m.remove(); exp(b.textContent); }));
    $$('[data-d]').forEach((b) => b.onclick = () => exp(b.dataset.d));
    draw();
  }
  function bindClips() {
    const c = S.cur; let clips = c.clips || []; let mode = 0, q = '', sort = 'score', f = { show: '', dl: '', type: '', imp: '', dur: '', emo: '' };
    const dur = (k) => k.end - k.start;
    const fil = () => clips.filter((k) => k.manual === (mode === 1) && (!q || k.title.toLowerCase().includes(q)) && (!f.show || (f.show === 'fav' ? k.fav : !k.hid)) && (!f.dl || (f.dl === 'sim' ? k.downloaded : !k.downloaded)) && (!f.type || k.type === f.type) && (!f.imp || k.score >= +f.imp) && (!f.dur || (f.dur === 'c' ? dur(k) < 30 : f.dur === 'm' ? dur(k) >= 30 && dur(k) < 60 : dur(k) >= 60)) && (!f.emo || k.emotion === f.emo));
    const mediaTag = (k) => { const src = `/api/uploads/${c.id}/media#t=${k.start.toFixed(2)},${k.end.toFixed(2)}`; return c.kind === 'vid' ? `<video class="vid" controls preload="metadata" src="${src}" style="width:100%;aspect-ratio:16/9;background:#000"></video>` : `<audio controls preload="metadata" src="${src}" style="width:100%"></audio>`; };
    const pollRender = guard(async (id) => { for (let i = 0; i < 600; i++) { await new Promise((r) => setTimeout(r, 1500)); const l = await api(`/uploads/${c.id}/clips`); clips = l; const k = l.find((x) => x.id === id); if (!k || !k.render || k.render.status !== 'rendering') { draw(); if (k && k.render && k.render.status === 'done') { toast('Corte pronto. Baixando…'); fileDl(k); } else if (k && k.render) toast('Falha ao renderizar: ' + (k.render.error || '')); return; } } });
    const fileDl = (k) => { const a = document.createElement('a'); a.href = `/api/uploads/${c.id}/clips/${k.id}/file`; a.click(); setTimeout(async () => { clips = await api(`/uploads/${c.id}/clips`); draw(); }, 800); };
    const draw = () => {
      const l = fil().sort((a, b) => sort === 'score' ? b.score - a.score : sort === 'low' ? a.score - b.score : a.start - b.start);
      $('#ccnt').textContent = `${l.length} cortes`;
      $('#cuts').innerHTML = l.map((k) => `<div class="cut ${k.hid ? 'hid' : ''}" data-c="${k.id}">${mediaTag(k)}
        <div class="sc">${k.score ? `<span class="chipx">⚡ ${k.score}</span>` : ''}<span class="chipx ok">${k.render && k.render.status === 'rendering' ? '⏳ Renderizando' : k.downloaded ? '✓ Baixado' : k.render && k.render.status === 'done' ? 'Pronto' : 'Novo'}</span><button class="tlink" data-a="ed" title="Ajustar título e tempos" aria-label="Ajustar título e tempos do corte">${tm(k.start)} → ${tm(k.end)} · ${Math.round(dur(k))}s${k.render && k.render.status === 'done' && k.render.speed && k.render.speed !== 1 ? ` · exportado em ${String(k.render.speed).replace('.', ',')}x: ${Math.round(k.render.seconds)}s` : ''} ${ic.edit}</button></div><h4>${esc(k.title)}</h4><p class="ds">${esc(k.description)}</p>
        <div class="tg" style="display:flex;gap:6px;flex-wrap:wrap">${[k.type, k.emotion, ...(k.tags || [])].filter(Boolean).map((t, i) => `<span class="tag2 ${'abc'[i % 3]}">${esc(t)}</span>`).join('')}</div>
        ${driveOn && k.driveError && !k.drive ? `<div class="drv-err" role="alert">Envio ao Drive falhou: ${esc(k.driveError.msg)}</div>` : ''}<div class="bt"><button class="ap-btn pri" data-a="dl">Baixar corte</button>${driveBtn(k)}${S.status && S.status.ai ? `<button class="ap-btn ${k.post ? 'has' : ''}" data-a="post" title="Título, descrição e hashtags para publicar">✨ ${k.post ? 'Texto' : 'Gerar texto'}</button>` : ''}<button class="ap-btn" data-a="open" aria-label="Abrir o editor do corte" title="Abrir o editor do corte">${ic.scissors}</button><button class="ap-btn ${k.fav ? 'on' : ''}" data-a="fav" aria-label="Favoritar">${ic.heartS}</button><button class="ap-btn" data-a="hid" aria-label="${k.hid ? 'Mostrar' : 'Ocultar'}">${ic.eye}</button></div></div>`).join('') || '<div class="empty" style="grid-column:1/-1"><h3>Nenhum corte aqui</h3><p>Ajuste os filtros ou crie um novo corte.</p></div>';
      $$('.cut video,.cut audio').forEach((m) => m.addEventListener('play', () => { if (S.media) S.media.pause(); $$('.cut video,.cut audio').forEach((o) => { if (o !== m) o.pause(); }); }));
      $$('.cut').forEach((el) => { const k = clips.find((x) => x.id === el.dataset.c); $$('[data-a]', el).forEach((b) => b.onclick = guard(async () => {
        const a = b.dataset.a;
        if (a === 'fav') { await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { fav: !k.fav } }); k.fav = !k.fav; draw(); }
        else if (a === 'hid') { await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { hid: !k.hid } }); k.hid = !k.hid; draw(); }
        else if (a === 'post') { if (!k.post) { b.disabled = true; b.textContent = 'Escrevendo…'; try { k.post = (await api(`/uploads/${c.id}/clips/${k.id}/ai/post`, { json: {} })).post; } finally { draw(); } } if (k.post) postModal(k); }
        else if (a === 'drive') { b.disabled = true; b.textContent = 'Enviando…'; try { await sendDrive(k); delete k.driveError; } catch (e) { k.driveError = { msg: e.message }; throw e; } finally { draw(); } }
        else if (a === 'dl') { // baixa direto: exporta sem legenda, no formato do vídeo, e salva o arquivo
          if (k.render && k.render.status === 'rendering') return toast('Este corte já está sendo exportado.');
          if (k.render && k.render.status === 'done') return fileDl(k);
          await api(`/uploads/${c.id}/clips/${k.id}/render`, { json: { captions: false } });
          k.render = { status: 'rendering' }; draw(); toast('Exportando o corte… O download começa quando terminar.'); pollRender(k.id);
        } else if (a === 'open') { // tesoura: abre o editor (formato, legenda, textos, ajustes finos)
          if (k.render && k.render.status === 'rendering') return toast('Este corte já está sendo exportado.');
          ClipEditor.open({ upload: c, clip: k, segs: S.segs, api, toast, tm, esc, dl, drive: driveOn ? { token: driveToken, send: sendDrive } : null, voiceAI: !!(S.status && S.status.voiceAI), onDone: (list) => { clips = list; draw(); } });
        } else if (a === 'ed') modal('Editar corte', `<label>Título</label><input id="et" value="${esc(k.title)}"><label>Início (mm:ss)</label><input id="es" value="${tm(k.start)}"><label>Fim (mm:ss)</label><input id="ee" value="${tm(k.end)}">${k.manual ? '<label style="margin-top:14px"><a id="edel" style="color:#c0262d;cursor:pointer">Excluir este corte</a></label>' : ''}`, guard(async (m) => { const s = parseT($('#es', m).value), e = parseT($('#ee', m).value); if (!(e - s >= 3)) { toast('O corte precisa ter ao menos 3s.'); return false; } const r = await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { title: $('#et', m).value, start: s, end: e } }); Object.assign(k, r); draw(); }), 'Salvar', 'Alterar o tempo descarta a renderização anterior.');
        const dd = $('#edel'); if (dd) dd.onclick = guard(async () => { await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'DELETE' }); clips = clips.filter((x) => x.id !== k.id); document.querySelector('.modal-bg')?.remove(); draw(); });
      })); });
    };
    $$('#cl-tabs button').forEach((b) => b.onclick = () => { mode = +b.dataset.m; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); draw(); });
    $('#cq').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#csort').onclick = (e) => popover(e.currentTarget, [['score', 'Maior impacto'], ['low', 'Menor impacto'], ['time', 'Ordem no vídeo']].map((o) => `<button data-s="${o[0]}">${o[1]}</button>`).join(''), (m) => $$('button', m).forEach((b) => b.onclick = () => { sort = b.dataset.s; $('#csort').textContent = `⇅ ${b.textContent} ⌄`; m.remove(); draw(); }));
    const types = [...new Set(clips.map((k) => k.type).filter(Boolean))], emos = [...new Set(clips.map((k) => k.emotion).filter(Boolean))];
    $('#cfil').onclick = (e) => popover(e.currentTarget, [['show', 'Mostrar', [['', 'Todos'], ['vis', 'Visíveis'], ['fav', 'Favoritos']]], ['dl', 'Baixados', [['', 'Todos'], ['sim', 'Sim'], ['nao', 'Não']]], ['type', 'Tipo de corte', [['', 'Todos os tipos'], ...types.map((x) => [x, x])]], ['imp', 'Impacto', [['', 'Qualquer impacto'], ['80', '80+'], ['70', '70+']]], ['dur', 'Duração', [['', 'Qualquer duração'], ['c', 'Até 30s'], ['m', '30–59s'], ['l', '1min+']]], ...(emos.length ? [['emo', 'Emoção', [['', 'Todas as emoções'], ...emos.map((x) => [x, x])]]] : [])].map((r) => `<label>${r[1]}<select data-f="${r[0]}">${r[2].map((o) => `<option value="${o[0]}" ${f[r[0]] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`).join('') + `<div class="act"><button class="ap-btn" id="fx">Limpar</button><button class="ap-btn pri" id="fy">Ver resultados</button></div>`, (m) => { $('#fx', m).onclick = () => { f = { show: '', dl: '', type: '', imp: '', dur: '', emo: '' }; m.remove(); draw(); }; $('#fy', m).onclick = () => { $$('select', m).forEach((s) => f[s.dataset.f] = s.value); m.remove(); draw(); }; });
    // Envio ao Drive: só aparece com a pasta da equipe configurada e o corte já exportado.
    const driveOn = !!(S.status && S.status.driveCuts);
    const driveBtn = (k) => !driveOn || !(k.render && k.render.status === 'done') ? '' : k.drive && /^https:\/\//.test(k.drive.link || '') ? `<a class="ap-btn" href="${esc(k.drive.link)}" target="_blank" rel="noopener">✓ No Drive</a>` : '<button class="ap-btn" data-a="drive">Enviar para o Drive</button>';
    const sendDrive = async (k) => {
      const post = (t) => api(`/uploads/${c.id}/clips/${k.id}/drive`, { json: { token: t } });
      const fresh = async () => { const t = await googleToken(S.status.driveClientId, G_WRITE); S.gtok = { t, exp: Date.now() + 45 * 60000 }; return t; };
      let r;
      try { r = await post(S.gtok && S.gtok.exp > Date.now() ? S.gtok.t : await fresh()); }
      catch (e) { if (!(e.data && e.data.needsLogin)) throw e; S.gtok = null; r = await post(await fresh()); } // token vencido: pede o login de novo, uma vez
      k.drive = r.drive; toast('Corte enviado para a pasta da equipe.');
    };
    // Login do Google feito no próprio clique (o navegador bloqueia a janela se ela abrir depois de uma espera longa).
    const driveToken = async () => { if (!(S.gtok && S.gtok.exp > Date.now())) S.gtok = { t: await googleToken(S.status.driveClientId, G_WRITE), exp: Date.now() + 45 * 60000 }; return S.gtok.t; };
    // Texto de publicação do corte (título, descrição e hashtags): dá para ajustar, copiar, usar o título no corte ou pedir outro.
    const postModal = (k) => {
      const m = modal('Texto para publicar', `<label for="po-t">Título</label><input id="po-t" value="${esc(k.post.title)}"><label for="po-d">Descrição</label><textarea id="po-d" rows="5">${esc(k.post.description)}</textarea><label for="po-h">Hashtags</label><textarea id="po-h" rows="2">${esc((k.post.hashtags || []).join(' '))}</textarea><div class="po-x"><button class="ap-btn" id="po-use">Usar como título do corte</button><button class="ap-btn" id="po-new">Gerar de novo</button></div>`, guard(async (mm) => {
        const cur = read(mm); k.post = (await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { post: cur } })).post;
        const all = [cur.title, cur.description, cur.hashtags].filter(Boolean).join('\n\n');
        if (navigator.clipboard) await navigator.clipboard.writeText(all).then(() => toast('Texto copiado.')).catch(() => dl('texto-do-corte.txt', all)); else dl('texto-do-corte.txt', all);
        draw();
      }), 'Copiar tudo', `${tm(k.start)} → ${tm(k.end)} · escrito pela IA a partir da transcrição deste trecho. Revise antes de publicar.`);
      const read = (mm) => ({ title: $('#po-t', mm).value.trim(), description: $('#po-d', mm).value.trim(), hashtags: $('#po-h', mm).value.trim() });
      $('#po-use', m).onclick = guard(async () => { const t = $('#po-t', m).value.trim(); if (!t) return; await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { title: t } }); k.title = t; draw(); toast('Título do corte atualizado.'); });
      $('#po-new', m).onclick = guard(async (e) => { const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Escrevendo…'; try { k.post = (await api(`/uploads/${c.id}/clips/${k.id}/ai/post`, { json: {} })).post; $('#po-t', m).value = k.post.title; $('#po-d', m).value = k.post.description; $('#po-h', m).value = (k.post.hashtags || []).join(' '); draw(); } finally { btn.disabled = false; btn.textContent = 'Gerar de novo'; } });
    };
    // A IA falhou nos cortes automáticos: pede de novo e espera o resultado (os cortes criados à mão não são tocados).
    if ($('#ai-retry')) $('#ai-retry').onclick = guard(async (e) => {
      const btn = e.currentTarget, before = c.aiCutsAt || 0; btn.disabled = true; btn.textContent = 'Analisando a pregação…';
      await api(`/uploads/${c.id}/reanalyze`, { json: {} });
      for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 3000)); const m = await api('/uploads/' + c.id); if ((m.aiCutsAt || 0) !== before) return go(location.pathname); }
      btn.disabled = false; btn.textContent = 'Tentar de novo com IA'; toast('A análise está demorando. Recarregue a página em instantes.');
    });
    // Só existe para quem tem a chave do Claude na configuração pessoal.
    if ($('#cl-ai')) $('#cl-ai').onclick = guard(async (e) => {
      const btn = e.currentTarget, label = btn.textContent; btn.disabled = true; btn.textContent = 'Analisando a pregação…';
      try {
        const r = await api(`/uploads/${c.id}/ai/cuts`, { json: { count: 4 } });
        if (r.created.length) { clips.push(...r.created); mode = 0; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 0)); draw(); }
        toast(!r.created.length ? 'A IA não encontrou outros trechos fortes para sugerir.' : r.created.length === 1 ? '1 corte sugerido pela IA.' : `${r.created.length} cortes sugeridos pela IA.`);
      } finally { btn.disabled = false; btn.textContent = label; }
    });
    $('#cl-paste').onclick = () => modal('Colar minutagens', `<label for="cutlist">Uma minutagem por linha</label><textarea id="cutlist" rows="7" placeholder="12:40 - 14:05 O amor de Deus&#10;31:10 - 32:20 O bom pastor"></textarea><div class="cut-rej" hidden></div>`, guard(async (m) => {
      const text = $('#cutlist', m).value; if (!text.trim()) return false;
      const r = await api(`/uploads/${c.id}/clips/bulk`, { json: { text } });
      if (r.created.length) { clips.push(...r.created); mode = 1; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 1)); draw(); }
      const adj = r.adjusted || [];
      toast(!r.created.length ? 'Nenhuma linha virou corte.' : (r.created.length === 1 ? '1 corte criado.' : `${r.created.length} cortes criados.`) + (adj.length ? (r.created.length === 1 ? ' O fim foi ajustado para o fim do vídeo.' : adj.length === 1 ? ' Um deles teve o fim ajustado para o fim do vídeo.' : ` ${adj.length} tiveram o fim ajustado para o fim do vídeo.`) : ''));
      if (!r.rejected.length) return;
      // Ficam no campo só as linhas recusadas, para corrigir e tentar de novo sem duplicar os cortes já criados.
      $('#cutlist', m).value = r.rejected.map((x) => x.line).join('\n');
      const box = $('.cut-rej', m); box.hidden = false; box.innerHTML = `<b>${r.rejected.length === 1 ? '1 linha não virou corte' : r.rejected.length + ' linhas não viraram corte'}:</b><ul>${r.rejected.map((x) => `<li>${esc(x.line)} — ${esc(x.reason)}</li>`).join('')}</ul>`;
      return false;
    }), 'Criar cortes', 'Cole a lista que o Claude sugeriu. Aceita mm:ss e h:mm:ss, com ou sem título.');
    $('#cl-new').onclick = () => modal('Novo corte', `<label>Título</label><input id="nt" placeholder="Ex.: Minha melhor frase"><label>Início (mm:ss)</label><input id="ns" value="00:00"><label>Fim (mm:ss)</label><input id="ne" value="${tm(Math.min(30, c.duration))}">`, guard(async (m) => { const s = parseT($('#ns', m).value), e = parseT($('#ne', m).value); if (!(e - s >= 3)) { toast('O corte precisa ter ao menos 3s.'); return false; } const k = await api(`/uploads/${c.id}/clips`, { json: { title: $('#nt', m).value.trim() || 'Corte manual', start: s, end: e } }); clips.push(k); mode = 1; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 1)); draw(); }), 'Criar corte', 'Informe o intervalo exato do trecho.');
    draw();
  }
  function bindTemplates() {
    let k = 0;
    const draw = () => { const b = $('#tp-body');
      if (k === 0) b.innerHTML = S.templates.length ? `<div class="tpls">${S.templates.map((t) => `<div class="tpl"><div class="pv" style="${esc(t.css)}">${esc(t.name)}</div><b>${esc(t.name)}</b><button class="ap-btn" data-rm="${t.id}">Remover</button></div>`).join('')}</div>` : `<div class="empty"><h3>Nenhum template ainda</h3><p>Crie um para guardar um estilo de legenda.</p></div>`;
      else b.innerHTML = `<div class="tpls">${D.estilos.map((e) => `<div class="tpl"><div class="pv" style="${e[1]}">Exemplo de legenda</div><b>${e[0]}</b></div>`).join('')}</div>`;
      $$('[data-rm]', b).forEach((x) => x.onclick = guard(async () => { await api('/templates/' + x.dataset.rm, { method: 'DELETE' }); S.templates = S.templates.filter((t) => t.id !== x.dataset.rm); draw(); })); };
    $$('#tp-tabs button').forEach((b) => b.onclick = () => { k = +b.dataset.k; $$('#tp-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); draw(); });
    $('#tp-new').onclick = () => modal('Novo template', `<label>Nome</label><input id="tn" placeholder="Meu template"><label>Estilo de legenda</label><select id="ts">${D.estilos.map((e, i) => `<option value="${i}">${e[0]}</option>`).join('')}</select>`, guard(async (m) => { const n = $('#tn', m).value.trim() || 'Template'; const t = await api('/templates', { json: { name: n, css: D.estilos[+$('#ts', m).value][1] } }); S.templates.push(t); k = 0; $$('#tp-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.k === 0)); draw(); }), 'Salvar template');
    draw();
  }
  function bindLibrary() {
    let k = 0;
    const draw = () => { const b = $('#lb-body');
      if (k === 0) b.innerHTML = `<p class="sub2" style="margin-bottom:12px">Imagens que você coloca sobre um corte: logos, selos, adesivos.<br><small>PNG, JPEG, WebP ou SVG, até 8 MB.</small></p>` + (S.images.length ? `<div class="tpls">${S.images.map((s) => `<div class="tpl"><img src="${s.url}" alt="" style="width:100%;border-radius:10px;aspect-ratio:1;object-fit:contain;background:#f4f4f6"><b style="font-size:12px;margin-top:6px">${esc(s.name)}</b></div>`).join('')}</div>` : `<div class="empty"><h3>Nenhuma imagem</h3></div>`);
      else b.innerHTML = `<div class="fonts">${['Montserrat', 'Poppins', 'Inter', 'Oswald', 'Bebas Neue', 'Playfair Display', 'Roboto Slab', 'Archivo Black'].map((f) => `<div style="font-family:'${f}',var(--sans)">${f}<small>Fonte de exemplo</small></div>`).join('')}</div>`; };
    $$('#lb-tabs button').forEach((b) => b.onclick = () => { k = +b.dataset.k; $$('#lb-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); draw(); });
    $('#lb-up').onclick = () => $('#lb-f').click();
    $('#lb-f').onchange = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 8 * 1048576) return toast('Máximo de 8 MB.'); S.images.push({ name: f.name, url: URL.createObjectURL(f) }); k = 0; $$('#lb-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.k === 0)); draw(); };
    draw();
  }
  function bindChapters() {
    const CH = chaptersOf(S.cur);
    $$('.chp').forEach((el) => el.onclick = (e) => { if (e.target.closest('[data-dlc]')) return; const open = el.classList.toggle('open'); el.nextElementSibling.hidden = !open; });
    $$('.mom').forEach((m) => m.onclick = () => { seek(+m.dataset.t); toast(`Player em ${tm(+m.dataset.t)}`); });
    $$('[data-dlc]').forEach((b) => b.onclick = () => { const k = CH[+b.dataset.dlc]; dl(`capitulo-${+b.dataset.dlc + 1}.txt`, `${tm(k.start)} ${k.title}\n\n${k.summary}`); });
    $('#ch-exp').onclick = (e) => popover(e.currentTarget, '<button data-e="yt">Copiar formato YouTube</button><button data-e="txt">Baixar TXT</button>', (m) => $$('button', m).forEach((b) => b.onclick = () => { m.remove(); const t = CH.map((k, i) => `${i === 0 ? '00:00' : tm(k.start)} ${k.title}`).join('\n'); if (b.dataset.e === 'yt') navigator.clipboard?.writeText(t).then(() => toast('Capítulos copiados.')).catch(() => dl('capitulos.txt', t)); else dl('capitulos.txt', t); }));
  }
  function bindEmotions() {
    if (!$('#emo')) return; let q = '', em = '', ord = 'video';
    const present = [...new Set(S.segs.map((s) => s.emo).filter(Boolean))];
    const draw = () => {
      $('#echips').innerHTML = `<button class="ech" data-e="" aria-pressed="${em === ''}">Todas <b>${S.segs.filter((s) => s.emo).length}</b></button>` + present.map((e) => `<button class="ech" data-e="${e}" aria-pressed="${em === e}"><i style="background:${EC[e] || '#999'}"></i>${e} <b>${S.segs.filter((s) => s.emo === e).length}</b></button>`).join('');
      let l = S.segs.filter((s) => s.emo && (!em || s.emo === em) && (!q || s.text.toLowerCase().includes(q))); if (ord === 'emo') l = [...l].sort((a, b) => a.emo.localeCompare(b.emo));
      $('#emo').innerHTML = l.map((s) => `<div class="emc"><div class="h"><span>👤 ${esc(s.who)}</span><span class="pl" data-t="${s.t}">▶ ${tm(s.t)}</span><span><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${EC[s.emo] || '#999'};margin-right:5px"></i>${s.emo}</span></div><p>${esc(s.text)}</p></div>`).join('');
      $$('[data-e]').forEach((b) => b.onclick = () => { em = b.dataset.e; draw(); }); $$('#emo [data-t]').forEach((b) => b.onclick = () => { seek(+b.dataset.t); });
    };
    $('#eq').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#em-ord').onclick = (e) => popover(e.currentTarget, '<button data-o="video">Ordem no vídeo</button><button data-o="emo">Por emoção</button>', (m) => $$('button', m).forEach((b) => b.onclick = () => { ord = b.dataset.o; $('#em-ord').textContent = `⇅ ${b.textContent} ⌄`; m.remove(); draw(); }));
    draw();
  }
  function bindScripts() {
    const c = S.cur; let list = c.scripts || [];
    const draw = () => { $('#sc-body').innerHTML = list.length ? list.map((s, i) => `<div class="ap-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>Versão ${i + 1} · ${s.mins} min · ${fmtDate(s.createdAt)}</b><span><button class="ap-btn" data-sd="${s.id}">${ic.dl} Baixar</button> <button class="ap-btn" data-sx="${s.id}">Excluir</button></span></div><p class="sub2" style="margin-top:6px"><i>${esc(s.brief || 'Sem instruções')}</i> · método: seleção dos cortes de maior nota (sem IA generativa)</p><div style="margin-top:8px;font-size:13px">${s.items.map((l) => `<div class="mom" data-t="${l.start}"><span>${tm(l.start)}</span>${esc(l.text || l.title)}</div>`).join('') || '<p class="sub2">Nenhum trecho selecionado.</p>'}</div></div>`).join('') : `<div class="empty"><div class="ci">${ic.script}</div><h3>Nenhum roteiro criado</h3><p>Você ainda não criou nenhum roteiro para este arquivo.</p><button class="ap-btn pri" id="sc-first">+ Criar primeiro roteiro</button></div>`;
      const mk = () => modal('Novo roteiro', '<label>Duração esperada (minutos)</label><input id="sm" type="number" min="1" max="60" value="3"><label>Anotação (opcional)</label><textarea id="sb" rows="3" placeholder="Ex.: foco nas falas sobre o tema X"></textarea>', guard(async (m) => { const s = await api(`/uploads/${c.id}/scripts`, { json: { mins: +$('#sm', m).value || 3, brief: $('#sb', m).value.trim() } }); list.push(s); draw(); }), 'Gerar roteiro', 'Monta uma sequência cronológica com os cortes de maior nota até chegar na duração pedida.');
      const f = $('#sc-first'); if (f) f.onclick = mk; const n = $('#sc-new'); if (n) n.onclick = mk;
      $$('[data-sd]').forEach((b) => b.onclick = () => { const s = list.find((x) => x.id === b.dataset.sd); dl('roteiro.txt', s.items.map((l) => `[${tm(l.start)}–${tm(l.end)}] ${l.text || l.title}`).join('\n\n')); });
      $$('[data-sx]').forEach((b) => b.onclick = guard(async () => { await api(`/uploads/${c.id}/scripts/${b.dataset.sx}`, { method: 'DELETE' }); list = list.filter((x) => x.id !== b.dataset.sx); draw(); }));
      $$('#sc-body .mom').forEach((m) => m.onclick = () => seek(+m.dataset.t));
    };
    draw();
  }
  function bindDiagrams() {
    const CH = chaptersOf(S.cur).map((k) => [k.title, k.start]), DUR = S.cur.duration || 1;
    const short = (s, n) => (s.length > n ? s.slice(0, n - 2) + '…' : s);
    const svgMind = () => { const W = 760, H = 360, cx = W / 2, cy = H / 2, n = Math.max(CH.length, 1); const nodes = CH.map((c, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: cx + Math.cos(a) * 250, y: cy + Math.sin(a) * 120, c }; });
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}">${nodes.map((o) => `<line x1="${cx}" y1="${cy}" x2="${o.x}" y2="${o.y}" stroke="#cfcaff" stroke-width="2"/>`).join('')}<rect x="${cx - 70}" y="${cy - 20}" width="140" height="40" rx="12" fill="#4f46e5"/><text x="${cx}" y="${cy + 5}" fill="#fff" text-anchor="middle">${esc(short(S.cur.name.replace(/\.[^.]+$/, ''), 16))}</text>${nodes.map((o) => `<g data-t="${o.c[1]}" style="cursor:pointer"><rect x="${o.x - 95}" y="${o.y - 20}" width="190" height="40" rx="10" fill="#fff" stroke="#8b5cf6"/><text x="${o.x}" y="${o.y + 4}" text-anchor="middle">${esc(short(o.c[0], 28))}</text></g>`).join('')}</svg>`; };
    const svgFlow = () => `<svg viewBox="0 0 220 ${CH.length * 80}" width="260">${CH.map((c, i) => `${i ? `<path d="M110 ${i * 80 - 20}v20" stroke="#8b5cf6" stroke-width="2"/>` : ''}<g data-t="${c[1]}" style="cursor:pointer"><rect x="10" y="${i * 80 + 6}" width="200" height="48" rx="10" fill="#fff" stroke="#4f46e5"/><text x="110" y="${i * 80 + 34}" text-anchor="middle">${esc(short(c[0], 26))}</text></g>`).join('')}</svg>`;
    const svgTime = () => `<svg viewBox="0 0 760 150" width="760"><line x1="30" y1="75" x2="730" y2="75" stroke="#cfcaff" stroke-width="3"/>${CH.map((c, i) => { const x = 30 + (c[1] / DUR) * 700, up = i % 2 === 0; return `<g data-t="${c[1]}" style="cursor:pointer"><circle cx="${x}" cy="75" r="8" fill="#4f46e5"/><text x="${x}" y="${up ? 52 : 108}" text-anchor="middle">${tm(c[1])}</text><text x="${x}" y="${up ? 36 : 126}" text-anchor="middle">${esc(short(c[0], 16))}</text></g>`; }).join('')}</svg>`;
    const show = (k) => { $('#dg-body').innerHTML = `<div class="ap-tabs" id="dg-tabs">${['Mapa mental', 'Fluxo', 'Linha do tempo'].map((t, i) => `<button role="tab" aria-selected="${i === k}" data-k="${i}">${t}</button>`).join('')}</div><div class="dia">${[svgMind, svgFlow, svgTime][k]()}</div><p class="sub2" style="margin-top:8px">Montado localmente a partir dos capítulos (sem IA).</p>`;
      $$('#dg-tabs button').forEach((b) => b.onclick = () => show(+b.dataset.k)); $$('.dia [data-t]').forEach((g) => g.onclick = () => { seek(+g.dataset.t); toast(`Player em ${tm(+g.dataset.t)}`); }); };
    if (!CH.length) $('#dg-body').innerHTML = '<div class="empty"><h3>Sem capítulos para desenhar</h3></div>'; else show(0);
  }

  /* ---------- Login ---------- */
  const login = () => `<div class="lg"><div class="l"><form class="lgc" id="lgf"><h1>Bem-vindo de volta</h1><p class="sub2" style="text-align:center">Entre para ver seus áudios e transcrições.</p>
    <input id="pw" type="password" placeholder="Senha de acesso" autocomplete="current-password" aria-label="Senha de acesso" autofocus><button class="ap-btn pri" type="submit">Entrar</button><p class="sub2" id="lgerr" style="text-align:center;margin-top:10px;font-size:12.5px;color:#c0262d;min-height:18px"></p>
</form></div>
    <div class="r"><div><img src="/logo.svg" width="56" alt="" style="margin-bottom:18px"><h2>Horas de edição em minutos. Seus roteiros, capítulos e cortes estão te esperando.</h2><span class="pill2">Transcrição</span><span class="pill2">Capítulos</span><span class="pill2">Cortes</span><span class="pill2">Roteiros</span></div></div></div>`;

  /* ---------- Roteamento ---------- */
  function parse(path) {
    const s = path.replace(/\/+$/, '').split('/').filter(Boolean);
    if (s[0] === 'entrar' || s[0] === 'cadastro') return { v: 'login' };
    if (s[0] !== 'app') return null;
    if (!s[1]) return { v: 'home' };
    if (s[1] === 'uploads') { if (!s[2]) return { v: 'uploads' }; if (s[2] === 'new') return { v: 'uploadsNew' }; return { v: s[3] || 'overview', id: s[2] }; }
    if (s[1] === 'projects') return { v: 'projects' };
    return { v: 'notfound' };
  }
  const binds = { uploads: bindUploads, projects: bindProjects, transcription: bindTranscription, clips: bindClips, templates: bindTemplates, library: bindLibrary, chapters: bindChapters, emotions: bindEmotions, scripts: bindScripts, diagrams: bindDiagrams };
  const needsDone = new Set(['transcription', 'clips', 'chapters', 'emotions', 'scripts', 'diagrams', 'templates', 'library', 'overview']);

  window.AppArea = {
    match: (p) => !!parse(p),
    async render(path, root) {
      const tok = ++S.rt; clearInterval(S.poll); parkMedia();
      const r = parse(path); document.body.classList.add('in-app');
      if (r.v === 'login') {
        if (path.startsWith('/cadastro')) return go('/entrar');
        if (S.authed !== true) { try { await api('/me'); S.authed = true; } catch { /* não logado */ } }
        if (S.authed === true) return go('/app'); // já logado: pula o login
        document.body.classList.remove('in-app'); root.innerHTML = login();
        $('#lgf').onsubmit = async (e) => { e.preventDefault(); try { await api('/login', { json: { password: $('#pw').value } }); S.authed = true; go('/app'); } catch (er) { $('#lgerr').textContent = er.message; } };
        return;
      }
      try {
        if (S.authed !== true) { await api('/me'); S.authed = true; }
        S.status = await api('/status').catch(() => S.status);
        const p = path.replace(/\/+$/, '') || '/app';
        if (['home', 'uploads', 'projects'].includes(r.v)) S.uploads = await api('/uploads');
        if (r.v === 'projects') S.projects = await api('/projects');
        if (r.v === 'templates') S.templates = await api('/templates');
        if (r.id) { S.cur = await api('/uploads/' + r.id); if (S.media && S.mediaId !== r.id) { S.media.pause(); S.media.remove(); S.media = null; S.mediaId = null; } }
        if (tok !== S.rt) return;
        if (r.v === 'notfound' || !(pages[r.v])) { root.innerHTML = shell(p, `<div class="empty"><h3>Página não encontrada</h3><a class="ap-btn pri" href="/app">Ir para o início</a></div>`); }
        else if (r.id && needsDone.has(r.v) && !isDone(S.cur)) {
          root.innerHTML = shell(p, procView(S.cur), r.id);
          const retry = $('#retry'); if (retry) retry.onclick = guard(async () => { await api(`/uploads/${r.id}/retry`, { json: {} }); go(p); });
          if (S.cur.status !== 'error') S.poll = setInterval(async () => { try { const m = await api('/uploads/' + r.id); if (isDone(m) || m.status === 'error') { clearInterval(S.poll); go(p); } else { const a = $('#procmsg'), b = $('#procbar'); if (a) a.textContent = statusLabel(m); if (b) b.style.width = Math.max(3, m.progress || 0) + '%'; } } catch { /* */ } }, 2000);
        } else {
          if (r.id) { S.segs = segsOf(S.cur); S.lines = linesOf(S.cur); }
          root.innerHTML = shell(p, pages[r.v](S.cur), r.id);
          if (r.id) goneBanner();
          if (['home', 'uploadsNew'].includes(r.v)) bindUpload(root);
          if (binds[r.v]) binds[r.v]();
          if (r.id) { mountMedia(); bindPlayer(); }
          const ra = $('#reana'); if (ra) ra.onclick = () => reanalyze(ra);
          $$('[data-reana]').forEach((b) => b.onclick = () => reanalyze(b));
          // polling da lista/início enquanto algo processa
          if (['uploads', 'home'].includes(r.v) && S.uploads.some((u) => ['queued', 'processing'].includes(u.status))) S.poll = setInterval(() => refreshList().then(() => { if (!S.uploads.some((u) => ['queued', 'processing'].includes(u.status))) clearInterval(S.poll); }).catch(() => {}), 2000);
        }
      } catch (e) {
        if (e.status === 401 || S.authed === false) { S.authed = false; return go('/entrar'); }
        root.innerHTML = shell('/app', `<div class="empty"><h3>${e.status === 404 ? 'Envio não encontrado' : 'Erro'}</h3><p>${esc(e.message)}</p><a class="ap-btn pri" href="/app/uploads">Voltar aos Envios</a></div>`);
      }
      const b = $('#ap-burger'); if (b) b.onclick = () => $('#ap-side').classList.toggle('open');
      const out = $('#ap-out'); if (out) out.onclick = async () => { await api('/logout', { json: {} }).catch(() => {}); S.authed = false; if (S.media) { S.media.pause(); S.media.remove(); S.media = null; } go('/entrar'); };
    },
  };
})();
