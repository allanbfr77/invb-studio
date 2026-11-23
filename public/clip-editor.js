/* Editor "Baixar corte" em tela cheia — organização igual à do original:
   configurações à esquerda · prévia com barra de ferramentas · drawer de painéis à direita · trilho de painéis.
   Tudo que está ativo é aplicado de verdade pelo ffmpeg do servidor (ver renderClip em server.js). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CSx = window.CaptionStyles, EP = window.EditorPresets;
  const FORMATS = [['orig', 'Atual', null, null], ['16:9', '16:9', 1920, 1080], ['9:16', '9:16', 1080, 1920], ['1:1', '1:1', 1080, 1080], ['4:5', '4:5', 1080, 1350]];
  const FORMAT_ICON = { orig: [22, 16], '16:9': [22, 13], '9:16': [13, 22], '1:1': [17, 17], '4:5': [15, 19] };
  const ICON = (p) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const RAIL = [['transcricao', 'Transcrição', true, '<path d="M4 6h16M4 12h16M4 18h10"/>'], ['templates', 'Templates', true, '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/>'], ['legendas', 'Legendas', true, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h10M14 10h3"/>'], ['midia', 'Mídia', true, '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'], ['texto', 'Texto', true, '<path d="M5 5h14M12 5v14M9 19h6"/>'], ['divisao', 'Divisão', false, '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>'], ['ganchos', 'Ganchos', true, '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>'], ['camadas', 'Camadas', true, '<path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5"/>']];
  const SAMPLE = ['Você', 'não', 'precisa', 'de', 'mais', 'tempo,'].map((t, i) => ({ t, s: i * 0.35, e: i * 0.35 + 0.35, seg: 0 }));
  const FAV = { get: (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch { return new Set(); } }, set: (k, s) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch { /* sem storage */ } } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rid = () => Math.random().toString(36).slice(2, 10);

  /* ----- legenda: HTML/CSS da prévia (equivale ao ASS do servidor) ----- */
  function capCss(style, eff, scale) {
    const ow = eff.ow * scale, sh = eff.shadow * scale;
    const css = [`color:${style.color}`, `font-family:'${eff.font}',Arial,sans-serif`, `font-weight:${style.bold ? 800 : 500}`, style.italic ? 'font-style:italic' : '', eff.upper ? 'text-transform:uppercase' : ''];
    if (style.box) css.push(`background:${style.box.color}${Math.round((1 - style.box.alpha) * 255).toString(16).padStart(2, '0')}`, 'padding:.08em .4em', 'border-radius:6px');
    else if (ow > 0) css.push(`-webkit-text-stroke:${(ow * 2).toFixed(1)}px ${style.outline}`, 'paint-order:stroke fill');
    if (sh > 0) css.push(`text-shadow:0 ${sh.toFixed(1)}px ${(sh * 1.5).toFixed(1)}px rgba(0,0,0,.65)`);
    if (style.glow) css.push(`filter:drop-shadow(0 0 ${(6 * Math.max(scale * 3, 0.6)).toFixed(1)}px ${style.hi})`);
    return css.filter(Boolean).join(';');
  }
  function capHTML(style, eff, scale, ws, active, progress) {
    const span = (w, i) => {
      if (style.mode === 'karaoke') return `<span style="background:linear-gradient(90deg,${style.hi} ${progress}%,${style.color} ${progress}%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:0">${w.t}</span>`;
      if (i !== active || style.mode === 'words1' || style.mode === 'block') return w.t;
      if (style.mode === 'boxhl') return `<span style="background:${style.hi};border-radius:.2em;padding:0 .18em;-webkit-text-stroke:0">${w.t}</span>`;
      return `<span style="color:${style.hi}">${w.t}</span>`;
    };
    return `<span style="${capCss(style, eff, scale)};display:inline-block;max-width:100%">${ws.map(span).join(' ')}</span>`;
  }

  function open(ctx) {
    const { upload, clip, api, toast, tm, esc, dl, onDone } = ctx;
    const isAud = upload.kind === 'aud';
    const dur = upload.duration || clip.end + 60;
    const st = {
      format: 'orig', bw: false, hq: false, removePauses: false, voice: 'off', speed: 1, sync: 0,
      cap: { on: false, style: 'Clássicos/Clássica', size: 16, pos: 'bottom', upper: null, pop: null, font: null, ow: null, shadow: null },
      start: clip.start, end: clip.end, title: clip.title || '', removed: [], edits: {}, lang: null, overlays: [], sel: null,
      panel: null, tab: 'estilos', cat: 'Todos', q: '', styleChosen: false, tplCat: 'Todos', tq: '', lib: null, templates: null,
      tools: { snap: true, xray: false, axes: false, ruler: false }, busy: false, hist: [], fut: [], anim: true, trMode: 'cut', trLarge: false, tick: 0, cutA: null,
    };
    const segs = ctx.segs || [];
    let words = [];
    const style = () => CSx.byName(st.cap.style);
    const eff = () => { const s = style(), c = st.cap; return { upper: c.upper === null ? s.upper : c.upper, ow: c.ow === null ? s.ow : c.ow, shadow: c.shadow === null ? s.shadow : c.shadow, font: c.font || s.font, pop: c.pop === null ? s.pop : c.pop }; };
    const fmtObj = () => FORMATS.find((x) => x[0] === st.format);
    const outSize = () => { const f = fmtObj(); return f[2] ? `${f[2]}×${f[3]}` : 'mesmo tamanho do vídeo'; };
    const D = () => st.end - st.start;
    // Duração do arquivo exportado: a do trecho dividida pela velocidade. É a que aparece na tela.
    // Tempo removido do corte dentro de [a, b], em segundos (trechos e palavras retirados; sobreposições contam uma vez só).
    const removedIn = (a, b) => { const rs = st.removed.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]); let tot = 0, end = -Infinity; for (const [x, y] of rs) { const s = Math.max(x, end); if (y > s) tot += y - s; end = Math.max(end, y); } return tot; };
    const outD = () => Math.max(0, D() - removedIn(st.start, st.end)) / (st.speed || 1);
    const spTxt = (x) => String(+(+x).toFixed(2)).replace('.', ',') + 'x';
    const segsIn = () => segs.filter((s) => s.end > st.start && s.t < st.end);

    /* ----- histórico (desfazer/refazer) ----- */
    const snap = () => JSON.stringify({ format: st.format, bw: st.bw, hq: st.hq, removePauses: st.removePauses, voice: st.voice, speed: st.speed, sync: st.sync, cap: st.cap, start: st.start, end: st.end, removed: st.removed, edits: st.edits, lang: st.lang, overlays: st.overlays, title: st.title });
    const restore = (j) => { Object.assign(st, JSON.parse(j)); wordsDirty = true; reloadAll(); };
    const commit = () => { st.hist.push(snap()); if (st.hist.length > 80) st.hist.shift(); st.fut = []; refreshBar(); };
    st.hist.push(snap()); // estado inicial (a interface ainda não existe, então sem refreshBar)
    const undo =() => { if (st.hist.length < 2) return; st.fut.push(st.hist.pop()); restore(st.hist[st.hist.length - 1]); };
    const redo = () => { if (!st.fut.length) return; const j = st.fut.pop(); st.hist.push(j); restore(j); };

    /* ----- estrutura ----- */
    const root = document.createElement('div'); root.className = 'dlx'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Baixar corte');
    root.innerHTML = `
      <header class="dlx-top"><div class="dlx-t"><h2>Baixar corte</h2><p class="dlx-q" id="dx-q"></p></div>
        <button class="dlx-chip" id="dx-chip"></button><button class="dlx-chip" id="dx-media"></button>
        <button class="ap-btn" id="dx-cancel" hidden>Cancelar</button>
        <div class="dlx-dlw"><button class="dlx-go" id="dx-go"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg><span id="dx-golab">Baixar</span><span style="opacity:.8">⌄</span></button></div>
        <button class="dlx-x" id="dx-close" aria-label="Fechar">✕</button></header>
      <div class="dlx-body" id="dx-body"><aside class="dlx-left" id="dx-left"></aside>
        <main class="dlx-mid">
          <div class="dlx-tools" id="dx-tools"></div>
          <div class="dlx-stage" id="dx-stage"><video id="dx-v" playsinline preload="metadata"></video><div class="dlx-cap" id="dx-cap"></div><div class="dlx-ovs" id="dx-ovs"></div><div class="dlx-guides" id="dx-guides"></div><button class="dlx-play" id="dx-play" aria-label="Reproduzir"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z"/></svg></button></div>
          <div class="dlx-prog"><span id="dx-t0">0:00</span><input type="range" id="dx-seek" min="0" max="1" step="0.05" value="0" aria-label="Posição"><span id="dx-t1"></span></div>
          <p class="dlx-note" id="dx-note"></p></main>
        <section class="dlx-drawer" id="dx-drawer" hidden></section>
        <nav class="dlx-rail" aria-label="Ferramentas">${RAIL.map((r) => `<button data-p="${r[0]}" ${r[2] ? '' : 'disabled title="Indisponível, como no original"'}>${ICON(r[3])}<span>${r[1]}</span></button>`).join('')}</nav></div>`;
    document.body.appendChild(root); document.body.style.overflow = 'hidden';
    const v = $('#dx-v', root), stage = $('#dx-stage', root), capEl = $('#dx-cap', root), ovsEl = $('#dx-ovs', root), guides = $('#dx-guides', root);
    if (isAud) { v.style.display = 'none'; stage.classList.add('aud'); stage.insertAdjacentHTML('afterbegin', '<div class="dlx-audio">🎧<small>Áudio</small></div>'); }
    v.src = `/api/uploads/${upload.id}/media`;
    /* Sincronia do áudio na prévia: com ajuste, o vídeo fica mudo e o som sai de um segundo player, adiantado ou atrasado. */
    const au = isAud ? null : new Audio(); if (au) au.preload = 'auto';
    const syncOn = () => !!au && Math.abs(st.sync) >= 0.005;
    const auSrc = `/api/uploads/${upload.id}/media?som=1`;
    let auOk = false, auTry = null; // auOk: o navegador já liberou o som do segundo player (o Safari só libera dentro de um clique)
    // Chamado dentro de cliques e teclas: é o único momento em que o Safari aceita iniciar um player de áudio novo.
    const unlockAudio = () => {
      if (!au || auOk || auTry || !syncOn()) return;
      if (!au.src) au.src = auSrc;
      auTry = au.play().then(() => { auOk = true; if (v.paused) au.pause(); syncAudio(true); }).catch(() => {}).finally(() => { auTry = null; });
    };
    const syncAudio = (force) => {
      if (!au) return;
      if (!syncOn()) { if (!au.paused) au.pause(); v.muted = false; return; }
      if (!au.src) au.src = auSrc;
      muteRule();
      if (!auOk) return;
      const want = Math.max(0, v.currentTime - st.sync), err = (au.currentTime || 0) - want;
      // Erro grande: pula para o ponto certo. Erro pequeno: acelera ou segura um pouco o som até encaixar, sem cortes.
      if ((force && Math.abs(err) > 0.05) || Math.abs(err) > 0.35) { if (!au.seeking) { try { au.currentTime = want; } catch { /* ainda carregando */ } } au.playbackRate = v.playbackRate; }
      else au.playbackRate = v.playbackRate * (Math.abs(err) < 0.02 ? 1 : err > 0 ? 0.93 : 1.07);
      if (v.paused || v.seeking) { if (!au.paused) au.pause(); } else if (au.paused) au.play().catch(() => { auOk = false; v.muted = false; });
      muteRule();
    };
    // O vídeo só fica mudo enquanto o segundo player está de fato tocando. Se ele travar, carregar ou for bloqueado, o som volta a sair do vídeo.
    const auLive = () => auOk && !au.paused && !au.seeking && au.readyState >= 3 && !au.error;
    const muteRule = () => { if (au) v.muted = syncOn() && (v.paused ? auOk : auLive()); };
    if (au) ['playing', 'waiting', 'stalled', 'pause', 'seeking', 'seeked', 'canplay', 'error', 'emptied'].forEach((ev) => au.addEventListener(ev, muteRule));
    ['play', 'pause', 'seeked', 'ratechange'].forEach((ev) => v.addEventListener(ev, () => syncAudio(ev !== 'ratechange')));
    ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'].forEach((ev) => root.addEventListener(ev, unlockAudio, true));
    v.addEventListener('timeupdate', () => syncAudio(false));
    const syLabel = (x) => { const ms = Math.round(x * 1000); return ms === 0 ? 'Sem ajuste' : (ms > 0 ? '+' : '−') + Math.abs(ms) + ' ms'; };

    /* ----- palavras ----- */
    const approx = (sg, text) => { const parts = text.split(/\s+/).filter(Boolean), tot = parts.reduce((a, x) => a + x.length, 0) || 1; let t0 = sg.t; return parts.map((x) => { const d = ((sg.end - sg.t) * x.length) / tot; const w = { t: x, s: t0, e: t0 + d, seg: sg.id }; t0 += d; return w; }); };
    const gone = (w) => st.removed.some(([a, b]) => (w.s + w.e) / 2 >= a && (w.s + w.e) / 2 <= b);
    let wordsDirty = true, relCache = [];
    const relWords = () => { // palavras do corte atual (tempo relativo), com edição/tradução e remoções
      if (!wordsDirty) return relCache; const out = [];
      for (const sg of segs) {
        if (sg.end <= st.start || sg.t >= st.end) continue;
        const ed = st.edits[sg.id];
        const ws = ed !== undefined ? approx(sg, ed) : (words.filter((w) => w.seg === sg.id).length ? words.filter((w) => w.seg === sg.id) : approx(sg, sg.text));
        for (const w of ws) if (w.t && w.e > st.start && w.s < st.end && !gone(w)) out.push({ t: w.t, s: Math.max(w.s, st.start) - st.start, e: Math.min(w.e, st.end) - st.start, seg: sg.id });
      }
      relCache = out; wordsDirty = false; return out;
    };
    api(`/uploads/${upload.id}/words?start=${Math.max(0, clip.start - 120).toFixed(2)}&end=${(clip.end + 120).toFixed(2)}&abs=1`).then((w) => { words = w; wordsDirty = true; paintCap(); if (st.panel === 'transcricao') drawDrawer(); })
      .catch(() => toast('O servidor está desatualizado: reinicie-o (node server.js) para usar todas as funções do editor.'));

    /* ----- prévia ----- */
    const ratio = () => { const f = fmtObj(); return f[2] ? f[2] / f[3] : (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9); };
    const layoutStage = () => {
      if (isAud) return; const r = ratio(), drawerW = st.panel ? 372 : 0, H = Math.min(window.innerHeight - 270, 560), W = Math.min(H * r, window.innerWidth - 283 - 83 - drawerW - 60);
      stage.style.width = Math.max(160, W) + 'px'; stage.style.height = Math.max(100, W / r) + 'px'; v.style.filter = st.bw ? 'grayscale(1)' : ''; paintCap(); renderOverlays();
    };
    const relT = () => Math.max(0, (v.currentTime || 0) - st.start);
    function paintCap() {
      if (isAud || !st.cap.on) { capEl.style.display = 'none'; return; }
      const t = relT(), S = style(), E = eff(), H = stage.clientHeight || 1, scale = H / 1080, ws = relWords(); let html = '';
      if (S.mode === 'block') {
        const by = new Map(); ws.forEach((w) => { if (!by.has(w.seg)) by.set(w.seg, []); by.get(w.seg).push(w); });
        const rng = [...by.values()].map((a) => [a[0].s, a[a.length - 1].e + 0.05, a]);
        const hit = rng.find((r) => r[0] <= t && t <= r[1]) || (v.paused ? rng.slice().sort((p, q) => Math.min(Math.abs(t - p[0]), Math.abs(t - p[1])) - Math.min(Math.abs(t - q[0]), Math.abs(t - q[1])))[0] : null);
        if (hit) html = capHTML(S, E, scale, [{ t: hit[2].map((w) => w.t).join(' ') }], -1, 0);
      } else {
        const chunks = CSx.chunkWords(ws, S).map((ch) => [ch[0].s, ch[ch.length - 1].e + 0.12, ch]);
        const hit = chunks.find((r) => t >= r[0] && t <= r[1]) || (v.paused ? chunks.slice().sort((p, q) => Math.min(Math.abs(t - p[0]), Math.abs(t - p[1])) - Math.min(Math.abs(t - q[0]), Math.abs(t - q[1])))[0] : null);
        if (hit) { const [a, b, ch] = hit; let act = 0; ch.forEach((w, i) => { if (w.s <= t) act = i; }); html = capHTML(S, E, scale, ch, act, clamp(((t - a) / Math.max(0.1, b - a)) * 100, 0, 100)); }
      }
      if (!html) { capEl.style.display = 'none'; return; }
      const fs = H * (st.cap.size / 288) * S.size, mv = st.format === '9:16' ? '14%' : '8%';
      capEl.style.cssText = `display:block;font-size:${fs}px;${st.cap.pos === 'top' ? 'top:7%;bottom:auto' : st.cap.pos === 'middle' ? 'top:50%;transform:translateY(-50%);bottom:auto' : 'bottom:' + mv}`;
      capEl.innerHTML = html;
    }
    const goStart = () => { v.currentTime = st.start; };
    v.addEventListener('loadedmetadata', () => { goStart(); layoutStage(); });
    const tickUI = () => { const t = relT(); $('#dx-seek', root).max = D().toFixed(2); $('#dx-seek', root).value = t; $('#dx-t0', root).textContent = tm(Math.max(0, t - removedIn(st.start, st.start + t)) / (st.speed || 1)); $('#dx-t1', root).textContent = tm(outD()); };
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= st.end - 0.05 && !v.paused) { v.pause(); goStart(); }
      if (v.currentTime < st.start - 0.3) goStart();
      // A prévia pula os trechos removidos (os marcados à mão; palavras soltas são curtas demais para pular com precisão).
      if (!v.paused) { const r = st.removed.find((x) => x[2] && v.currentTime >= x[0] && v.currentTime < x[1] - 0.05); if (r) v.currentTime = Math.min(r[1], st.end); }
      tickUI(); paintCap(); updateOvVisibility(); $('#dx-play', root).style.opacity = v.paused ? 1 : 0;
    });
    v.addEventListener('pause', () => ($('#dx-play', root).style.opacity = 1)); v.addEventListener('play', () => ($('#dx-play', root).style.opacity = 0));
    const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
    $('#dx-play', root).onclick = toggle;
    $('#dx-seek', root).oninput = (e) => { v.currentTime = st.start + +e.target.value; };
    window.addEventListener('resize', layoutStage);

    /* ----- overlays (texto/imagem) sobre o quadro ----- */
    const ovById = (id) => st.overlays.find((o) => o.id === id);
    const visibleAt = (o, t) => !o.hidden && (v.paused || ((o.start === null || t >= o.start) && (o.end === null || t <= o.end)));
    function renderOverlays() {
      const H = stage.clientHeight || 1, W = stage.clientWidth || 1;
      ovsEl.innerHTML = st.overlays.map((o) => {
        const sel = st.sel === o.id, pos = `left:${o.x * 100}%;top:${o.y * 100}%`;
        if (o.type === 'image') return `<div class="dlx-ov ${sel ? 'sel' : ''}" data-id="${o.id}" style="${pos};width:${o.w * 100}%;opacity:${st.tools.xray ? 0.35 : o.op};${o.hidden ? 'display:none' : ''}"><img src="/api/library/${o.imgId}/file" alt="" draggable="false"><i class="dlx-h" data-h="1"></i></div>`;
        const sty = [`font-size:${o.size * H}px`, `color:${o.color}`, `font-family:'${o.font}',Arial,sans-serif`, `font-weight:${o.bold ? 800 : 500}`, o.italic ? 'font-style:italic' : '', o.box ? `background:${o.box.color}${Math.round((1 - o.box.alpha) * 255).toString(16).padStart(2, '0')};padding:.15em .45em;border-radius:6px` : '', o.outline && !o.box ? `-webkit-text-stroke:${o.outline.w * 2 * (H / 1080)}px ${o.outline.color};paint-order:stroke fill` : ''].filter(Boolean).join(';');
        return `<div class="dlx-ov dlx-ovt ${sel ? 'sel' : ''}" data-id="${o.id}" style="${pos};${o.hidden ? 'display:none;' : ''}opacity:${st.tools.xray ? 0.35 : 1}"><span style="${sty}">${esc(o.upper ? o.text.toUpperCase() : o.text)}</span><i class="dlx-h" data-h="1"></i></div>`;
      }).join('');
      stage.classList.toggle('axes', st.tools.axes); stage.classList.toggle('ruler', st.tools.ruler);
      refreshBar(); updateOvVisibility();
    }
    function updateOvVisibility() { const t = relT(); $$('.dlx-ov', ovsEl).forEach((e) => { const o = ovById(e.dataset.id); if (o) e.style.display = visibleAt(o, t) ? '' : 'none'; }); }
    // arrastar / redimensionar
    let drag = null;
    ovsEl.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.dlx-ov'); if (!el) return; const o = ovById(el.dataset.id); st.sel = o.id; e.preventDefault(); e.stopPropagation();
      $$('.dlx-ov', ovsEl).forEach((x) => x.classList.toggle('sel', x === el));
      const r = stage.getBoundingClientRect(); drag = { o, el, resize: !!e.target.dataset.h, r, x0: e.clientX, y0: e.clientY, ox: o.x, oy: o.y, ow: o.w, os: o.size, moved: false };
      el.setPointerCapture(e.pointerId); if (st.panel === 'midia' || st.panel === 'texto' || st.panel === 'camadas') drawDrawer();
    });
    ovsEl.addEventListener('pointermove', (e) => {
      if (!drag) return; const { o, el, r } = drag, dx = (e.clientX - drag.x0) / r.width, dy = (e.clientY - drag.y0) / r.height; drag.moved = true; guides.innerHTML = '';
      if (drag.resize) { if (o.type === 'image') { o.w = clamp(drag.ow + dx * 2, 0.04, 1); el.style.width = o.w * 100 + '%'; } else { o.size = clamp(drag.os + dy * 0.6, 0.02, 0.3); const sp = $('span', el); if (sp) sp.style.fontSize = o.size * (stage.clientHeight || 1) + 'px'; } return; }
      let nx = clamp(drag.ox + dx, 0, 1), ny = clamp(drag.oy + dy, 0, 1); const gs = [];
      if (st.tools.snap) { for (const g of [0.5, 0.1, 0.9]) { if (Math.abs(nx - g) < 0.015) { nx = g; gs.push(['v', g]); } if (Math.abs(ny - g) < 0.015) { ny = g; gs.push(['h', g]); } } }
      o.x = nx; o.y = ny; el.style.left = nx * 100 + '%'; el.style.top = ny * 100 + '%';
      guides.innerHTML = gs.map(([k, g]) => `<i class="${k === 'v' ? 'gv' : 'gh'}" style="${k === 'v' ? 'left' : 'top'}:${g * 100}%"></i>`).join('');
    });
    const endDrag = () => { if (!drag) return; const m = drag.moved; drag = null; guides.innerHTML = ''; if (m) commit(); };
    ovsEl.addEventListener('pointerup', endDrag); ovsEl.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerdown', (e) => { if (e.target.closest('.dlx-ov') || e.target === $('#dx-play', root)) return; if (st.sel) { st.sel = null; renderOverlays(); if (['midia', 'texto', 'camadas'].includes(st.panel)) drawDrawer(); } toggle(); });
    const addOverlay = (o) => { st.overlays.push({ id: rid(), x: 0.5, y: 0.5, start: null, end: null, hidden: false, ...o }); st.sel = st.overlays[st.overlays.length - 1].id; commit(); renderOverlays(); drawDrawer(); };
    const delOverlay = (id) => { st.overlays = st.overlays.filter((o) => o.id !== id); if (st.sel === id) st.sel = null; commit(); renderOverlays(); drawDrawer(); };

    /* ----- barra de ferramentas da prévia ----- */
    const TB = [['undo', 'Desfazer', '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>'], ['redo', 'Refazer', '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3"/>'], ['snap', 'Ímã: encaixar nas guias', '<path d="M6 3v8a6 6 0 0012 0V3M6 7h4M14 7h4"/>'], ['xray', 'Raio-X: ver o que está embaixo (X)', '<circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/>'], ['axes', 'Eixos centrais', '<path d="M12 3v18M3 12h18"/>'], ['ruler', 'Régua', '<path d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"/>'], ['center', 'Centralizar no quadro', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>'], ['keys', 'Atalhos do teclado', '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>']];
    $('#dx-tools', root).innerHTML = TB.map((b) => `<button data-t="${b[0]}" aria-label="${b[1]}" title="${b[1]}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${b[2]}</svg></button>`).join('');
    function refreshBar() {
      const b = (k) => $(`[data-t="${k}"]`, root); if (!b('undo')) return;
      b('undo').disabled = st.hist.length < 2; b('redo').disabled = !st.fut.length;
      ['snap', 'xray', 'axes', 'ruler'].forEach((k) => b(k).classList.toggle('on', st.tools[k]));
      b('center').disabled = !st.sel;
      const n = st.overlays.filter((o) => o.type === 'image').length; $('#dx-media', root).textContent = `Mídia: ${n}`;
      $('#dx-chip', root).textContent = isAud ? 'só áudio' : st.cap.on ? 'com legendas' : 'sem legendas';
      $('#dx-q', root).textContent = `“${segsIn().map((s) => s.text).join(' ')}” · ${tm(outD())}${st.speed !== 1 ? ` em ${spTxt(st.speed)} (original: ${tm(D())})` : Math.abs(outD() - D()) >= 0.05 ? ` (original: ${tm(D())})` : ''}`;
    }
    const shortcuts = () => { const m = document.createElement('div'); m.className = 'modal-bg'; m.style.zIndex = 130; m.innerHTML = `<div class="modal"><h3>Atalhos do teclado</h3><p>Valem com o editor aberto.</p><table class="tbl"><tr><td><b>Espaço</b></td><td>Reproduzir / pausar</td></tr><tr><td><b>Ctrl+Z</b> · <b>Ctrl+Y</b></td><td>Desfazer · refazer</td></tr><tr><td><b>Setas</b></td><td>Mover o item selecionado (Shift = passo maior)</td></tr><tr><td><b>Delete</b></td><td>Excluir o item selecionado</td></tr><tr><td><b>X</b></td><td>Raio-X (ver o que está embaixo)</td></tr><tr><td><b>Esc</b></td><td>Desmarcar · fechar</td></tr></table><div class="ft"><button class="ap-btn pri" data-x>Fechar</button></div></div>`; document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); }; };
    $('#dx-tools', root).onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return; const k = b.dataset.t;
      if (k === 'undo') undo(); else if (k === 'redo') redo(); else if (k === 'keys') shortcuts();
      else if (k === 'center') { const o = ovById(st.sel); if (o) { o.x = 0.5; o.y = 0.5; commit(); renderOverlays(); } }
      else { st.tools[k] = !st.tools[k]; renderOverlays(); }
    };

    /* ----- painel esquerdo (sempre visível) ----- */
    // Momento com décimos (0:12,5), para digitar e conferir o ponto exato de um trecho.
    const tmx = (s) => { s = Math.max(0, Math.round((s || 0) * 10) / 10); const m = Math.floor(s / 60), x = s - m * 60; return m + ':' + (x < 10 ? '0' : '') + x.toFixed(1).replace('.', ','); };
    const parseTx = (t) => { t = String(t || '').trim().replace(/,/g, '.'); if (!t || !/^(\d+:){0,2}\d+(\.\d+)?$/.test(t)) return NaN; return t.split(':').reduce((a, n) => a * 60 + +n, 0); };
    const cutList = () => st.removed.filter((r) => r[2]).sort((p, q) => p[0] - q[0]);
    const durTxt = () => (Math.abs(outD() - D()) < 0.05 ? `Duração do corte: ${tm(D())}` : `Duração do corte: ${tm(outD())} (era ${tm(D())})`);
    const spLabel = (x) => String(+(+x).toFixed(2)).replace('.', ',') + 'x';
    const sw = (id, on) => `<button class="dlx-sw" role="switch" aria-checked="${on}" id="${id}"></button>`;
    function drawLeft() {
      const L = $('#dx-left', root);
      L.innerHTML = `${isAud ? '' : `<h4>Formato de saída</h4><div class="dlx-fmts">${FORMATS.map((f) => `<button class="dlx-fmt" data-f="${f[0]}" aria-pressed="${st.format === f[0]}"><i style="width:${FORMAT_ICON[f[0]][0]}px;height:${FORMAT_ICON[f[0]][1]}px"></i>${f[1]}</button>`).join('')}</div>
        <p class="dlx-sub"><b>${fmtObj()[1]}</b> · ${st.format === 'orig' ? 'Mantém o formato do vídeo' : 'Recorte central do vídeo'} · Saída ${outSize()}</p><hr>
        <h4>Aparência</h4>
        <div class="dlx-row"><div><b>Preto e branco</b><small>Deixa o vídeo em tons de cinza</small></div>${sw('dx-bw', st.bw)}</div>
        <div class="dlx-row"><div><b>Preservar qualidade</b><small>Arquivo maior e render mais lento. Ideal pra levar pro editor.</small></div>${sw('dx-hq', st.hq)}</div><hr>`}
        <h4>Áudio</h4><div class="dlx-row"${ctx.voiceAI ? '' : ' style="margin-bottom:8px"'}><div><b>Remover música</b><small>Usa IA para tirar a música e deixar só a voz. A exportação demora mais. Não aparece na prévia.</small></div><button class="dlx-sw" role="switch" aria-checked="${st.voice === 'ia'}" id="dx-mu"${ctx.voiceAI ? '' : ' disabled title="Precisa instalar a remoção de música neste computador"'}></button></div>
        ${ctx.voiceAI ? '' : '<p class="dlx-hint">Para liberar, rode uma vez o arquivo <code>install/instalar-voz-ia</code> e abra o app de novo.</p>'}
        <div class="dlx-row" style="margin-bottom:8px"><div><b><label for="dx-sp">Velocidade</label></b><small>Acelera ou desacelera o corte sem mudar o tom da voz. A prévia acompanha.</small><small id="dx-spd" class="dlx-spd">${durTxt()}</small></div><output id="dx-spv" for="dx-sp" class="dlx-spv">${spLabel(st.speed)}</output></div>
        <input type="range" id="dx-sp" class="dlx-sp" min="0.25" max="2" step="0.05" value="${st.speed}">
        <div class="dlx-spb">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => `<button data-sp="${x}" aria-pressed="${st.speed === x}">${spLabel(x)}</button>`).join('')}</div>
        ${isAud ? '' : `<div class="dlx-row" style="margin-bottom:8px"><div><b><label for="dx-sy">Sincronia do áudio</label></b><small>Se o som chega depois da boca, puxe para a esquerda (adianta o áudio). Se chega antes, puxe para a direita (atrasa). A prévia acompanha.</small></div><output id="dx-syv" for="dx-sy" class="dlx-spv">${syLabel(st.sync)}</output></div>
        <input type="range" id="dx-sy" class="dlx-sp" min="-2" max="2" step="0.01" value="${st.sync}">
        <div class="dlx-spb">${[[-0.1, '−100'], [-0.01, '−10'], [0, 'Zerar'], [0.01, '+10'], [0.1, '+100']].map((x) => `<button style="min-width:36px" title="${x[0] ? x[1] + ' milissegundos' : 'Voltar ao áudio original'}" data-sy="${x[0]}">${x[1]}</button>`).join('')}</div>`}
        <hr><h4>Remover trecho</h4><p class="dlx-hint" style="margin-bottom:10px">Pare o vídeo onde o trecho começa e marque o início. Depois pare onde ele termina e marque o fim. O trecho sai do corte e a prévia passa a pulá-lo.</p>
        <div class="dlx-spb" style="margin-bottom:10px"><button id="dx-ca" aria-pressed="${st.cutA !== null}">${st.cutA === null ? 'Marcar início' : 'Início: ' + tmx(st.cutA - st.start)}</button><button id="dx-cb" ${st.cutA === null ? 'disabled' : ''}>Marcar fim e remover</button></div>
        <p class="dlx-hint" style="margin-bottom:8px">Ou digite o momento exato, contado do começo do corte (ex.: <code>0:12,5</code>):</p>
        <div class="dlx-cutx"><label>Início<input id="dx-cxa" inputmode="decimal" autocomplete="off" placeholder="0:00,0" value="${st.cutA === null ? '' : tmx(st.cutA - st.start)}"></label><label>Fim<input id="dx-cxb" inputmode="decimal" autocomplete="off" placeholder="0:00,0"></label><button id="dx-cxg">Remover</button></div>
        ${cutList().length ? `<ul class="dlx-cuts">${cutList().map((r) => `<li><span>${tmx(r[0] - st.start)} → ${tmx(r[1] - st.start)} <small>(${(r[1] - r[0]).toFixed(1).replace('.', ',')} s)</small></span><button data-cx="${r[0]}" aria-label="Desfazer a remoção deste trecho" title="Devolver este trecho ao corte">✕</button></li>`).join('')}</ul>` : ''}`;
      $$('[data-f]', L).forEach((b) => b.onclick = () => { st.format = b.dataset.f; commit(); layoutStage(); drawLeft(); });
      const tg = (id, key) => { const e = $('#' + id, L); if (e) e.onclick = () => { st[key] = !st[key]; commit(); layoutStage(); drawLeft(); }; };
      tg('dx-bw', 'bw'); tg('dx-hq', 'hq');
      const mu = $('#dx-mu', L); if (mu && !mu.disabled) mu.onclick = () => { st.voice = st.voice === 'ia' ? 'off' : 'ia'; commit(); drawLeft(); };
      // Remover trecho: dois cliques (início e fim) na posição atual do vídeo. Os tempos são do vídeo original.
      const ca = $('#dx-ca', L), cb = $('#dx-cb', L);
      if (ca) ca.onclick = () => { st.cutA = st.cutA === null ? Math.max(st.start, Math.min(st.end, v.currentTime || st.start)) : null; drawLeft(); };
      const addCut = (a, b, how) => {
        const x = Math.max(st.start, Math.min(a, b)), y = Math.min(st.end, Math.max(a, b));
        if (y - x < 0.3) return toast('O trecho precisa ter pelo menos 0,3 segundo. ' + how);
        if (D() - removedIn(st.start, st.end) - (y - x) + removedIn(x, y) < 1) return toast('Assim não sobraria nada do corte.');
        st.removed.push([+x.toFixed(2), +y.toFixed(2), 1]); st.cutA = null; wordsDirty = true; commit(); paintCap(); drawLeft(); tickUI(); toast('Trecho removido do corte.');
      };
      if (cb) cb.onclick = () => addCut(st.cutA, v.currentTime, 'Avance o vídeo até o fim do trecho e marque de novo.');
      const xa = $('#dx-cxa', L), xb = $('#dx-cxb', L), xg = $('#dx-cxg', L);
      if (xg) {
        const go = () => {
          const a = parseTx(xa.value), b = parseTx(xb.value);
          if (!(a >= 0) || !(b >= 0)) return toast('Digite o início e o fim como minutos:segundos, por exemplo 0:12,5 e 0:18.');
          if (a > D() || b > D()) return toast('O corte tem ' + tmx(D()) + '. Digite momentos dentro dele.');
          addCut(st.start + a, st.start + b, 'Confira os dois momentos digitados.');
        };
        xg.onclick = go; [xa, xb].forEach((i) => { i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); }; });
        // mostrar o trecho digitado no player, para conferir antes de remover
        xa.onchange = () => { const a = parseTx(xa.value); if (a >= 0 && a <= D()) v.currentTime = st.start + a; }; xb.onchange = () => { const b = parseTx(xb.value); if (b >= 0 && b <= D()) v.currentTime = st.start + b; };
      }
      $$('[data-cx]', L).forEach((bt) => bt.onclick = () => { const i = st.removed.findIndex((r) => r[2] && String(r[0]) === bt.dataset.cx); if (i >= 0) { st.removed.splice(i, 1); wordsDirty = true; commit(); paintCap(); drawLeft(); tickUI(); } });
      // Velocidade: de 0,25x a 2x, em passos de 0,05. A prévia toca na mesma velocidade (o navegador mantém o tom da voz).
      const sp = $('#dx-sp', L), setSp = (x, redraw) => { st.speed = Math.max(0.25, Math.min(2, Math.round(x * 100) / 100)); v.playbackRate = st.speed; $('#dx-spv', L).textContent = spLabel(st.speed); $('#dx-spd', L).textContent = durTxt(); tickUI(); refreshBar(); if (redraw) { commit(); drawLeft(); } };
      const sy = $('#dx-sy', L), setSy = (x, save) => { st.sync = Math.max(-2, Math.min(2, Math.round(x * 100) / 100)); sy.value = st.sync; $('#dx-syv', L).textContent = syLabel(st.sync); syncAudio(true); if (save) commit(); };
      if (sy) { sy.oninput = () => setSy(+sy.value, false); sy.onchange = () => setSy(+sy.value, true); $$('[data-sy]', L).forEach((b) => b.onclick = () => setSy(+b.dataset.sy === 0 ? 0 : st.sync + +b.dataset.sy, true)); }
      if (sp) { sp.oninput = () => setSp(+sp.value, false); sp.onchange = () => setSp(+sp.value, true); $$('[data-sp]', L).forEach((b) => b.onclick = () => setSp(+b.dataset.sp, true)); v.playbackRate = st.speed; }
    }

    /* ----- drawer direito ----- */
    const propsEditor = (o) => {
      if (!o) return '';
      const timing = `<div class="dlx-row" style="margin-top:10px"><div><b>Todo o corte</b><small>Desligue para escolher quando aparece</small></div>${sw('pp-all', o.start === null && o.end === null)}</div>${o.start === null && o.end === null ? '' : `<div class="dlx-two"><label>Início (s)<input type="number" id="pp-s" min="0" step="0.1" value="${(o.start ?? 0).toFixed(1)}"></label><label>Fim (s)<input type="number" id="pp-e" min="0" step="0.1" value="${(o.end ?? D()).toFixed(1)}"></label></div>`}`;
      if (o.type === 'image') return `<div class="dlx-props"><h4>Imagem selecionada</h4><label>Largura <b>${Math.round(o.w * 100)}%</b></label><input type="range" id="pp-w" min="4" max="100" value="${Math.round(o.w * 100)}"><label>Opacidade <b>${Math.round(o.op * 100)}%</b></label><input type="range" id="pp-op" min="5" max="100" value="${Math.round(o.op * 100)}">${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
      return `<div class="dlx-props"><h4>Texto selecionado</h4><label>Conteúdo</label><textarea id="pp-text" rows="2" maxlength="200">${esc(o.text)}</textarea>
        <label>Fonte</label><select id="pp-font">${CSx.FONTS.map((f) => `<option ${f === o.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <label>Tamanho <b>${Math.round(o.size * 100)}</b></label><input type="range" id="pp-size" min="2" max="30" value="${Math.round(o.size * 100)}">
        <div class="dlx-two"><label>Cor<input type="color" id="pp-color" value="${o.color}"></label><label>Contorno<input type="color" id="pp-oc" value="${o.outline ? o.outline.color : '#000000'}"></label></div>
        <div class="dlx-chips" style="margin-top:8px"><button id="pp-bold" aria-pressed="${o.bold}">Negrito</button><button id="pp-ital" aria-pressed="${o.italic}">Itálico</button><button id="pp-up" aria-pressed="${o.upper}">MAIÚSCULAS</button><button id="pp-box" aria-pressed="${!!o.box}">Tarja</button></div>
        ${o.box ? `<div class="dlx-two"><label>Cor da tarja<input type="color" id="pp-bc" value="${o.box.color}"></label><label>Transparência<input type="range" id="pp-ba" min="0" max="90" value="${Math.round(o.box.alpha * 100)}"></label></div>` : ''}
        ${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
    };
    function bindProps(D2) {
      const o = ovById(st.sel); if (!o) return; const on = (id, ev, fn) => { const e = $('#' + id, D2); if (e) e.addEventListener(ev, fn); };
      const live = () => renderOverlays(), done = () => { commit(); drawDrawer(); };
      on('pp-text', 'input', (e) => { o.text = e.target.value || ' '; live(); }); on('pp-text', 'change', commit);
      on('pp-font', 'change', (e) => { o.font = e.target.value; commit(); live(); });
      on('pp-size', 'input', (e) => { o.size = +e.target.value / 100; live(); }); on('pp-size', 'change', done);
      on('pp-color', 'input', (e) => { o.color = e.target.value; live(); }); on('pp-color', 'change', commit);
      on('pp-oc', 'input', (e) => { o.outline = { color: e.target.value, w: 2 }; live(); }); on('pp-oc', 'change', commit);
      on('pp-bold', 'click', () => { o.bold = !o.bold; done(); live(); }); on('pp-ital', 'click', () => { o.italic = !o.italic; done(); live(); }); on('pp-up', 'click', () => { o.upper = !o.upper; done(); live(); });
      on('pp-box', 'click', () => { o.box = o.box ? null : { color: '#e11d48', alpha: 0 }; done(); live(); });
      on('pp-bc', 'input', (e) => { o.box.color = e.target.value; live(); }); on('pp-bc', 'change', commit);
      on('pp-ba', 'input', (e) => { o.box.alpha = +e.target.value / 100; live(); }); on('pp-ba', 'change', commit);
      on('pp-w', 'input', (e) => { o.w = +e.target.value / 100; live(); }); on('pp-w', 'change', done);
      on('pp-op', 'input', (e) => { o.op = +e.target.value / 100; live(); }); on('pp-op', 'change', done);
      on('pp-all', 'click', () => { if (o.start === null && o.end === null) { o.start = 0; o.end = Math.min(3, D()); } else { o.start = null; o.end = null; } done(); live(); });
      on('pp-s', 'change', (e) => { o.start = clamp(+e.target.value, 0, D()); if (o.end !== null && o.end <= o.start) o.end = Math.min(D(), o.start + 1); done(); live(); });
      on('pp-e', 'change', (e) => { o.end = clamp(+e.target.value, 0.1, D()); if (o.start !== null && o.start >= o.end) o.start = Math.max(0, o.end - 1); done(); live(); });
      on('pp-del', 'click', () => delOverlay(o.id));
    }
    const sampleCard = (S, tick) => {
      const E = { upper: S.upper, ow: S.ow, shadow: S.shadow, font: S.font, pop: S.pop };
      const chunks = CSx.chunkWords(SAMPLE, S), ci = S.mode === 'block' ? 0 : chunks.findIndex((c) => c.some((w) => w.t === 'precisa')), ch = chunks[Math.max(0, ci)];
      const act = S.mode === 'block' ? -1 : (tick % ch.length), ws = S.mode === 'block' ? [{ t: 'Você não precisa de mais tempo,' }] : ch;
      return `<span style="font-size:${14 * Math.min(S.size, 1.3)}px;line-height:1.15;text-align:center;display:block">${capHTML(S, E, 0.012, ws, act, S.mode === 'karaoke' ? ((tick % 5) + 1) * 20 : 55)}</span>`;
    };
    const tplHTML = (t) => `<span class="tp-bar" style="background:${t.bg}">${esc(t.text || t.name)}</span>`;
    const catChips = (cats, cur, total, attr) => `<div class="dlx-cats"><button class="dlx-cat" ${attr}="Todos" aria-checked="${cur === 'Todos'}">Todos <b>${total}</b></button>${cats.map((c) => `<button class="dlx-cat" ${attr}="${esc(c.id)}" aria-checked="${cur === c.id}">${esc(c.id)} <b>${c.count}</b></button>`).join('')}</div>`;
    let drawerScroll = 0;
    const panelsHTML = {
      transcricao: () => {
        const ex = `<div class="dlx-two"><label>Início<span class="hms"><input type="number" min="0" data-hms="s0" value="${Math.floor(st.start / 3600)}">:<input type="number" min="0" max="59" data-hms="s1" value="${Math.floor((st.start % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="s2" value="${Math.floor(st.start % 60)}"></span></label><label>Fim<span class="hms"><input type="number" min="0" data-hms="e0" value="${Math.floor(st.end / 3600)}">:<input type="number" min="0" max="59" data-hms="e1" value="${Math.floor((st.end % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="e2" value="${Math.floor(st.end % 60)}"></span></label></div>`;
        const lo = Math.max(0, clip.start - 60), hi = Math.min(dur, clip.end + 60);
        const ctxSegs = segs.filter((s) => s.end > st.start - 30 && s.t < st.end + 30);
        const body = ctxSegs.map((s) => { const ws = words.filter((w) => w.seg === s.id); const ed = st.edits[s.id] !== undefined; return `<div class="dlx-tseg"><div class="th"><b>${esc(s.who)}</b><span>${tm(s.t)}</span>${ed ? '<em>editado</em>' : ''}</div><p>${(ed ? approx(s, st.edits[s.id]) : (ws.length ? ws : approx(s, s.text))).map((w) => { const inn = w.e > st.start && w.s < st.end; return `<span class="w ${inn ? '' : 'out'} ${gone(w) ? 'rm' : ''}" data-ws="${w.s}" data-we="${w.e}" data-seg="${s.id}">${esc(w.t)}</span>`; }).join(' ')}</p></div>`; }).join('');
        return `<h3>Corte</h3><button class="dlx-link" id="tr-big">${st.trLarge ? 'Reduzir transcrição' : 'Ampliar transcrição'}</button>
          <label class="dlx-lab">Título do corte<input id="tr-title" placeholder="Título (opcional)" value="${esc(st.title)}" maxlength="120"></label>
          <label class="dlx-lab">Intervalo do corte <small>Duração: ${Math.round(D())}s</small></label>${ex}
          <div class="dlx-two"><input type="range" id="tr-rs" min="${lo.toFixed(1)}" max="${hi.toFixed(1)}" step="0.1" value="${st.start}" aria-label="Início"><input type="range" id="tr-re" min="${lo.toFixed(1)}" max="${hi.toFixed(1)}" step="0.1" value="${st.end}" aria-label="Fim"></div>
          <label class="dlx-lab">Idioma da transcrição<span class="dlx-ro">${esc(upload.language || 'Idioma detectado')}</span></label>
          <p class="dlx-sub" style="margin:6px 0 10px">Clique numa palavra pra ajustar onde o corte começa ou termina ou use o slider.</p>
          <div class="dlx-row"><div><b>Remover palavras</b><small>Clique nas palavras para cortá-las do vídeo</small></div>${sw('tr-rm', st.trMode === 'remove')}</div>
          <div class="dlx-row"><div><b>Editar texto</b><small>Clique numa fala para corrigir o texto da legenda</small></div>${sw('tr-ed', st.trMode === 'edit')}</div>
          <button class="ap-btn" id="tr-seg" style="width:100%;justify-content:center;margin-bottom:12px">Baixar segmento</button>
          <div class="dlx-tlist ${st.trLarge ? 'big' : ''}">${body || '<p class="dlx-sub">Sem texto neste trecho.</p>'}</div>`;
      },
      templates: () => {
        const mine = (st.templates || []).filter((t) => t.config), tf = FAV.get('invb.favTpl'), q = st.tq.trim().toLowerCase();
        const pr = EP.TEMPLATES.filter((t) => (st.tplCat === 'Todos' || t.cat === st.tplCat) && (!q || t.name.toLowerCase().includes(q)));
        const mineF = mine.filter((t) => !q || t.name.toLowerCase().includes(q));
        const card = (id, name, inner, own) => `<div class="dlx-card" data-tpl="${id}" ${own ? 'data-own="1"' : ''} role="button" tabindex="0"><button class="fav" data-fav="${id}" aria-label="${tf.has(id) ? 'Remover dos favoritos' : 'Marcar como favorito'}">${tf.has(id) ? '★' : '☆'}</button><div class="pv">${inner}</div><span>${esc(name)}</span></div>`;
        return `<p class="dlx-sub" style="margin-top:0">Aplique um visual salvo neste corte com um clique.</p><input class="dlx-search" id="tp-q" placeholder="Buscar template" value="${esc(st.tq)}">
          <h4>Meus templates</h4><div class="dlx-grid">${mineF.map((t) => card(t.id, t.name, `<span class="mini">${esc(t.config.style.split('/').pop())}</span>`, true)).join('') || '<p class="dlx-sub" style="grid-column:1/-1">Nenhum template seu ainda.</p>'}</div>
          <button class="ap-btn" id="tp-save" style="width:100%;justify-content:center;margin:10px 0 18px">Salvar o visual atual como template</button>
          <h4>Prontos</h4>${catChips(EP.TEMPLATE_CATS, st.tplCat, EP.TEMPLATES.length, 'data-tc')}
          <p class="dlx-sub">A moldura aparece nos formatos 9:16, 1:1 e 4:5. (Aqui o template aplica a legenda e uma faixa de título.)</p><div class="dlx-grid">${pr.map((t) => card(t.id, t.name, tplHTML(t))).join('') || '<p class="dlx-sub">Nenhum template encontrado.</p>'}</div>`;
      },
      legendas: () => {
        const e = eff(), tabs = [['estilos', 'Estilos'], ['fonte', 'Fonte'], ['efeitos', 'Efeitos'], ['traducao', 'Tradução']];
        let body = '';
        if (st.tab === 'estilos') {
          const fav = FAV.get('invb.favSty'), q = st.q.trim().toLowerCase();
          const list = CSx.STYLES.filter((s) => (st.cat === 'Todos' || s.cat === st.cat) && (!q || s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q)));
          body = `<div class="dlx-row" style="margin-bottom:8px"><div><b>Sempre animar os estilos</b></div>${sw('sty-anim', st.anim)}</div><input class="dlx-search" id="sty-q" placeholder="Buscar estilo, fonte ou efeito" value="${esc(st.q)}">${catChips(CSx.CATEGORIES, st.cat, CSx.STYLES.length, 'data-cat')}
            <div class="dlx-grid" id="sty-grid"><button class="dlx-card nosub" data-style="" aria-pressed="${!st.cap.on}"><div class="pv none">Sem legenda</div><span>Sem legenda</span></button>${list.map((s) => `<div class="dlx-card" role="button" tabindex="0" data-style="${esc(s.id)}" aria-pressed="${st.cap.on && st.cap.style === s.id}"><button class="fav" data-fav="${esc(s.id)}" aria-label="${fav.has(s.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}">${fav.has(s.id) ? '★' : '☆'}</button><div class="pv">${sampleCard(s, 0)}</div><span>${esc(s.name)}</span></div>`).join('')}</div>`;
        } else if (st.tab === 'fonte') body = `<p class="dlx-sub" style="margin-top:0">Fontes instaladas no servidor. “Padrão do estilo” usa a fonte do estilo escolhido.</p><div class="dlx-fonts"><button data-font="" aria-pressed="${st.cap.font === null}">Padrão do estilo</button>${CSx.FONTS.map((f) => `<button data-font="${esc(f)}" style="font-family:'${esc(f)}',sans-serif" aria-pressed="${st.cap.font === f}">${esc(f)}<small>Você não precisa de mais tempo</small></button>`).join('')}</div>`;
        else if (st.tab === 'efeitos') body = `<div class="dlx-fx"><label>Contorno <b id="v-ow">${e.ow}</b></label><input type="range" id="fx-ow" min="0" max="10" value="${e.ow}"><label>Sombra <b id="v-sh">${e.shadow}</b></label><input type="range" id="fx-sh" min="0" max="8" value="${e.shadow}"><label>Tamanho <b id="v-sz">${st.cap.size}</b></label><input type="range" id="fx-sz" min="10" max="32" value="${st.cap.size}">
          <div class="dlx-row" style="margin-top:14px"><div><b>Animação ao entrar</b><small>A palavra “pula” ao aparecer</small></div>${sw('fx-pop', e.pop)}</div><div class="dlx-row"><div><b>Maiúsculas</b></div>${sw('fx-up', e.upper)}</div>
          <h4>Posição</h4><div class="dlx-chips">${[['top', 'Topo'], ['middle', 'Meio'], ['bottom', 'Base']].map((p) => `<button data-pos="${p[0]}" aria-pressed="${st.cap.pos === p[0]}">${p[1]}</button>`).join('')}</div><button class="dlx-link" id="fx-reset" style="margin-top:12px">Restaurar o padrão do estilo</button></div>`;
        else body = `<p class="dlx-sub" style="margin-top:0">Traduz o texto da legenda deste corte. Usa um modelo de linguagem (precisa de GROQ_API_KEY no servidor) e a tradução vale para o arquivo final.</p><label class="dlx-lab">Traduzir para<select id="tr-lang"><option value="">Original</option>${EP.LANGS.map((l) => `<option ${st.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="ap-btn pri" id="tr-go" style="width:100%;justify-content:center;margin-top:12px">Traduzir legenda</button><p class="dlx-sub" id="tr-msg">${st.lang ? `Legenda traduzida para ${esc(st.lang)}.` : ''}</p>`;
        return `<div class="dlx-tabs" role="tablist">${tabs.map((t) => { const dis = t[0] !== 'estilos' && !st.styleChosen; return `<button role="tab" data-tab="${t[0]}" aria-selected="${st.tab === t[0]}" ${dis ? 'disabled title="Escolha um estilo primeiro"' : ''}>${t[1]}</button>`; }).join('')}</div>${body}`;
      },
      midia: () => {
        const imgs = st.overlays.filter((o) => o.type === 'image'), sel = ovById(st.sel);
        return `<h3>Mídia</h3><p class="dlx-sub" style="margin-top:0">Adicione imagens sobre o corte. Arraste para posicionar, redimensione e defina quando aparecem.</p><h4>Sua biblioteca</h4><p class="dlx-sub" style="margin:0 0 10px">PNG, JPEG ou WebP, até 8 MB. Só imagem parada.</p>
          <div class="dlx-lib">${(st.lib || []).map((l) => `<div class="li"><button data-add="${l.id}" title="${esc(l.name)}"><img src="/api/library/${l.id}/file" alt="${esc(l.name)}"></button><button class="x" data-lib-del="${l.id}" aria-label="Excluir da biblioteca">✕</button></div>`).join('') || (st.lib === null ? '<p class="dlx-sub">Carregando…</p>' : '<p class="dlx-sub" style="grid-column:1/-1">Biblioteca vazia.</p>')}</div>
          <button class="ap-btn pri" id="lib-up" style="width:100%;justify-content:center;margin:12px 0">Adicionar imagem</button><input type="file" id="lib-file" hidden accept="image/png,image/jpeg,image/webp">
          ${imgs.length ? `<h4>No quadro (${imgs.length})</h4>` : ''}${sel && sel.type === 'image' ? propsEditor(sel) : (imgs.length ? '<p class="dlx-sub">Clique numa imagem no quadro para editar.</p>' : '')}`;
      },
      texto: () => {
        const ts = st.overlays.filter((o) => o.type === 'text'), sel = ovById(st.sel);
        return `<h3>Texto</h3><p class="dlx-sub" style="margin-top:0">Adicione texto sobre o corte. Arraste para posicionar, redimensione e defina quando aparece.</p><button class="ap-btn pri" id="txt-add" style="width:100%;justify-content:center">Adicionar texto</button>
          ${ts.length ? `<div class="dlx-layers" style="margin-top:12px">${ts.map((o) => `<button class="lr ${st.sel === o.id ? 'on' : ''}" data-sel="${o.id}">T <span>${esc(o.text.slice(0, 28))}</span></button>`).join('')}</div>` : '<p class="dlx-sub" style="margin-top:12px">Nenhum texto ainda. Adicione um para mostrar no corte.</p>'}${sel && sel.type === 'text' ? propsEditor(sel) : ''}`;
      },
      ganchos: () => `<h3>Ganchos</h3><p class="dlx-sub" style="margin-top:0">Adicione um fundo ou um gancho de texto: ótimo para preencher a divisão ou aumentar a retenção.</p><h4>Ganchos de texto</h4><div class="dlx-hooks">${EP.HOOKS.map((h, i) => `<button data-hook="${i}" style="background:${EP.COLORS[i % EP.COLORS.length]}">${esc(h)}</button>`).join('')}</div>
        <h4>Formato</h4><div class="dlx-chips"><button data-hf="box" aria-pressed="${st.hookFmt !== 'plain'}">Com tarja</button><button data-hf="plain" aria-pressed="${st.hookFmt === 'plain'}">Só texto</button></div>
        <h4>Fundos</h4><p class="dlx-sub" style="margin-top:0">Os fundos preenchem a área da Divisão, que não está disponível (aparece desativada também no original).</p><div class="dlx-chips"><button disabled>Aleatório</button><button disabled>Ver mais</button></div>`,
      camadas: () => {
        const list = st.overlays.slice().reverse();
        return `<h3>Camadas</h3><p class="dlx-sub" style="margin-top:0">O topo da lista fica na frente. Arraste para mudar a ordem.</p>${list.length ? `<div class="dlx-layers" id="lay">${list.map((o) => `<div class="lr ${st.sel === o.id ? 'on' : ''}" draggable="true" data-lid="${o.id}"><button data-sel="${o.id}" class="nm">${o.type === 'image' ? '🖼' : 'T'} <span>${esc(o.type === 'image' ? ((st.lib || []).find((l) => l.id === o.imgId) || { name: 'Imagem' }).name : o.text.slice(0, 26))}</span></button><button data-eye="${o.id}" aria-label="${o.hidden ? 'Mostrar' : 'Ocultar'}">${o.hidden ? '🙈' : '👁'}</button><button data-rm="${o.id}" aria-label="Excluir">✕</button></div>`).join('')}</div>` : '<p class="dlx-sub">Nada no quadro ainda. Adicione um texto, uma imagem ou um gancho.</p>'}`;
      },
    };
    function drawDrawer() {
      const dr = $('#dx-drawer', root), keep = dr.scrollTop; $('#dx-body', root).classList.toggle('open', !!st.panel);
      $$('.dlx-rail button', root).forEach((b) => b.classList.toggle('on', b.dataset.p === st.panel));
      if (!st.panel) { dr.hidden = true; return; }
      dr.hidden = false; dr.innerHTML = `<div class="dlx-dr">${panelsHTML[st.panel]()}</div>`; dr.scrollTop = keep; bindDrawer(dr);
      if (st.panel === 'midia' && st.lib === null) loadLib();
      if (st.panel === 'templates' && st.templates === null) api('/templates').then((l) => { st.templates = l; if (st.panel === 'templates') drawDrawer(); }).catch(() => { st.templates = []; });
    }
    const loadLib = () => api('/library').then((l) => { st.lib = l; if (['midia', 'camadas'].includes(st.panel)) drawDrawer(); }).catch(() => { st.lib = []; });
    function applyTemplate(t) {
      st.cap = { ...st.cap, style: t.style, on: true }; st.styleChosen = true;
      st.overlays = st.overlays.filter((o) => !o.tpl);
      if (t.text) st.overlays.push({ id: rid(), tpl: true, type: 'text', text: t.text, x: 0.5, y: st.format === '16:9' ? 0.12 : 0.1, size: 0.05, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: true, box: { color: t.bg, alpha: 0 }, outline: null, start: null, end: null, hidden: false });
      wordsDirty = true; commit(); renderOverlays(); paintCap(); drawDrawer(); refreshBar();
    }
    function bindDrawer(dr) {
      const on = (id, ev, fn) => { const e = $('#' + id, dr); if (e) e.addEventListener(ev, fn); };
      const onAll = (sel, ev, fn) => $$(sel, dr).forEach((e) => e.addEventListener(ev, () => fn(e)));
      if (st.panel === 'transcricao') {
        on('tr-big', 'click', () => { st.trLarge = !st.trLarge; drawDrawer(); });
        on('tr-title', 'input', (e) => { st.title = e.target.value; }); on('tr-title', 'change', commit);
        const setIv = (a, b) => { a = clamp(a, 0, dur); b = clamp(b, 0, dur); if (b - a < 1) { if (a === st.start) b = a + 1; else a = b - 1; } st.start = Math.max(0, a); st.end = Math.min(dur, b); wordsDirty = true; goStart(); tickUI(); paintCap(); refreshBar(); };
        $$('[data-hms]', dr).forEach((i) => i.addEventListener('change', () => { const g = (k) => ['0', '1', '2'].map((n, x) => +$(`[data-hms="${k}${n}"]`, dr).value * [3600, 60, 1][x]).reduce((s, x) => s + x, 0); setIv(g('s'), g('e')); commit(); drawDrawer(); }));
        const rs = $('#tr-rs', dr), re = $('#tr-re', dr);
        if (rs) { rs.oninput = () => setIv(+rs.value, st.end); rs.onchange = () => { commit(); drawDrawer(); }; re.oninput = () => setIv(st.start, +re.value); re.onchange = () => { commit(); drawDrawer(); }; }
        on('tr-rm', 'click', () => { st.trMode = st.trMode === 'remove' ? 'cut' : 'remove'; drawDrawer(); }); on('tr-ed', 'click', () => { st.trMode = st.trMode === 'edit' ? 'cut' : 'edit'; drawDrawer(); });
        on('tr-seg', 'click', () => render(false, { raw: true }));
        onAll('.w', 'click', (w) => {
          const ws = +w.dataset.ws, we = +w.dataset.we, seg = +w.dataset.seg;
          if (st.trMode === 'remove') { const i = st.removed.findIndex(([a, b]) => Math.abs(a - ws) < 0.02 && Math.abs(b - we) < 0.02); if (i >= 0) st.removed.splice(i, 1); else st.removed.push([ws, we]); wordsDirty = true; commit(); paintCap(); drawDrawer(); }
          else if (st.trMode === 'edit') { const sg = segs.find((s) => s.id === seg); if (!sg) return; const cur = st.edits[seg] !== undefined ? st.edits[seg] : sg.text; const m = document.createElement('div'); m.className = 'modal-bg'; m.style.zIndex = 130; m.innerHTML = `<div class="modal"><h3>Editar texto da fala</h3><p>${tm(sg.t)} · ${esc(sg.who)}. Vale para a legenda deste corte.</p><textarea id="ed-t" rows="4" style="width:100%">${esc(cur)}</textarea><div class="ft"><button class="ap-btn" data-x>Cancelar</button><button class="ap-btn" data-orig>Restaurar original</button><button class="ap-btn pri" data-ok>Salvar</button></div></div>`; document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); }; $('[data-ok]', m).onclick = () => { const t = $('#ed-t', m).value.trim(); if (t) st.edits[seg] = t; wordsDirty = true; commit(); m.remove(); paintCap(); drawDrawer(); }; $('[data-orig]', m).onclick = () => { delete st.edits[seg]; wordsDirty = true; commit(); m.remove(); paintCap(); drawDrawer(); }; }
          else { const mid = (st.start + st.end) / 2; if (ws < mid) setIv(ws, st.end); else setIv(st.start, we); commit(); drawDrawer(); }
        });
      }
      if (st.panel === 'templates') {
        on('tp-q', 'input', (e) => { st.tq = e.target.value; const pos = e.target.selectionStart; drawDrawer(); const n = $('#tp-q', root); n.focus(); n.setSelectionRange(pos, pos); });
        onAll('[data-tc]', 'click', (b) => { st.tplCat = b.dataset.tc; drawDrawer(); });
        onAll('.dlx-card', 'click', (c) => { const id = c.dataset.tpl; const t = EP.TEMPLATES.find((x) => x.id === id) || (st.templates || []).find((x) => x.id === id); if (!t) return; if (t.config) { st.cap = { ...st.cap, ...t.config, on: true }; st.styleChosen = true; if (t.config.overlays) st.overlays = t.config.overlays.map((o) => ({ ...o, id: rid() })); wordsDirty = true; commit(); renderOverlays(); paintCap(); drawDrawer(); toast(`Template “${t.name}” aplicado.`); } else { applyTemplate(t); toast(`Template “${t.name}” aplicado.`); } });
        onAll('[data-fav]', 'click', (b) => { const ev = window.event; if (ev) ev.stopPropagation(); const s = FAV.get('invb.favTpl'); s.has(b.dataset.fav) ? s.delete(b.dataset.fav) : s.add(b.dataset.fav); FAV.set('invb.favTpl', s); drawDrawer(); });
        on('tp-save', 'click', () => { const name = prompt('Nome do template'); if (!name || !name.trim()) return; api('/templates', { json: { name: name.trim(), config: { ...st.cap, overlays: st.overlays.filter((o) => !o.hidden) } } }).then((t) => { (st.templates = st.templates || []).push(t); toast('Template salvo.'); drawDrawer(); }).catch((e) => toast(e.message)); });
      }
      if (st.panel === 'legendas') {
        onAll('[data-tab]', 'click', (b) => { if (b.disabled) return; st.tab = b.dataset.tab; drawDrawer(); });
        on('sty-anim', 'click', () => { st.anim = !st.anim; drawDrawer(); });
        on('sty-q', 'input', (e) => { st.q = e.target.value; const pos = e.target.selectionStart; drawDrawer(); const n = $('#sty-q', root); n.focus(); n.setSelectionRange(pos, pos); });
        onAll('[data-cat]', 'click', (b) => { st.cat = b.dataset.cat; drawDrawer(); });
        onAll('[data-style]', 'click', (c) => { const id = c.dataset.style; if (id === '') { st.cap.on = false; } else { st.cap.style = id; st.cap.on = true; st.styleChosen = true; } wordsDirty = true; commit(); refreshBar(); paintCap(); drawDrawer(); });
        onAll('[data-fav]', 'click', (b) => { const ev = window.event; if (ev) ev.stopPropagation(); const s = FAV.get('invb.favSty'); s.has(b.dataset.fav) ? s.delete(b.dataset.fav) : s.add(b.dataset.fav); FAV.set('invb.favSty', s); drawDrawer(); });
        onAll('[data-font]', 'click', (b) => { st.cap.font = b.dataset.font || null; commit(); paintCap(); drawDrawer(); });
        onAll('[data-pos]', 'click', (b) => { st.cap.pos = b.dataset.pos; commit(); paintCap(); drawDrawer(); });
        const rng = (id, key, out) => { const r = $('#' + id, dr); if (r) { r.oninput = () => { st.cap[key] = +r.value; $('#' + out, dr).textContent = r.value; paintCap(); }; r.onchange = commit; } };
        rng('fx-ow', 'ow', 'v-ow'); rng('fx-sh', 'shadow', 'v-sh'); rng('fx-sz', 'size', 'v-sz');
        on('fx-pop', 'click', () => { st.cap.pop = !eff().pop; commit(); paintCap(); drawDrawer(); }); on('fx-up', 'click', () => { st.cap.upper = !eff().upper; commit(); paintCap(); drawDrawer(); });
        on('fx-reset', 'click', () => { Object.assign(st.cap, { upper: null, pop: null, font: null, ow: null, shadow: null, size: 16 }); commit(); paintCap(); drawDrawer(); });
        on('tr-lang', 'change', (e) => { if (!e.target.value) { st.lang = null; st.edits = {}; wordsDirty = true; commit(); paintCap(); drawDrawer(); } });
        on('tr-go', 'click', async () => {
          const lang = $('#tr-lang', dr).value; if (!lang) return toast('Escolha o idioma.'); const msg = $('#tr-msg', dr), btn = $('#tr-go', dr); btn.disabled = true; msg.textContent = 'Traduzindo…';
          try { const r = await api('/translate', { json: { lang, texts: segs.filter((s) => s.end > st.start && s.t < st.end).map((s) => ({ id: s.id, text: s.text })) } }); st.edits = { ...st.edits, ...r.translations }; st.lang = lang; wordsDirty = true; commit(); paintCap(); msg.textContent = `Legenda traduzida para ${lang}.`; }
          catch (e) { msg.textContent = e.message; } btn.disabled = false;
        });
        if (st.tab === 'estilos') { // pré-visualizações animadas só dos cartões visíveis
          clearInterval(st.animT); if (st.anim) st.animT = setInterval(() => { st.tick++; const box = $('#dx-drawer', root); if (!box || st.panel !== 'legendas' || st.tab !== 'estilos') return clearInterval(st.animT); const br = box.getBoundingClientRect(); $$('#sty-grid [data-style]:not(.nosub)', box).forEach((c) => { const r = c.getBoundingClientRect(); if (r.bottom < br.top || r.top > br.bottom) return; const S = CSx.byName(c.dataset.style); $('.pv', c).innerHTML = sampleCard(S, st.tick); }); }, 750);
        }
      }
      if (st.panel === 'midia') {
        on('lib-up', 'click', () => $('#lib-file', dr).click());
        on('lib-file', 'change', async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 8 * 1048576) return toast('Máximo de 8 MB.'); const x = new XMLHttpRequest(); x.open('POST', '/api/library?name=' + encodeURIComponent(f.name)); x.setRequestHeader('x-invb', '1'); x.onload = () => { if (x.status === 201) { st.lib = null; loadLib(); toast('Imagem adicionada à biblioteca.'); } else { let m = 'Falha ao enviar a imagem.'; try { m = JSON.parse(x.responseText).error; } catch { /* */ } toast(m); } }; x.send(f); });
        onAll('[data-add]', 'click', (b) => addOverlay({ type: 'image', imgId: b.dataset.add, w: 0.3, op: 1 }));
        onAll('[data-lib-del]', 'click', (b) => { api('/library/' + b.dataset.libDel, { method: 'DELETE' }).then(() => { st.overlays = st.overlays.filter((o) => o.imgId !== b.dataset.libDel); st.lib = null; commit(); renderOverlays(); loadLib(); }).catch((e) => toast(e.message)); });
        bindProps(dr);
      }
      if (st.panel === 'texto') {
        on('txt-add', 'click', () => addOverlay({ type: 'text', text: 'Seu texto', size: 0.06, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: false, box: null, outline: { color: '#000000', w: 3 } }));
        onAll('[data-sel]', 'click', (b) => { st.sel = b.dataset.sel; renderOverlays(); drawDrawer(); });
        bindProps(dr);
      }
      if (st.panel === 'ganchos') {
        onAll('[data-hf]', 'click', (b) => { st.hookFmt = b.dataset.hf; drawDrawer(); });
        onAll('[data-hook]', 'click', (b) => { const i = +b.dataset.hook, plain = st.hookFmt === 'plain'; addOverlay({ type: 'text', text: EP.HOOKS[i], size: 0.065, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: false, y: 0.16, box: plain ? null : { color: EP.COLORS[i % EP.COLORS.length], alpha: 0 }, outline: plain ? { color: '#000000', w: 4 } : null, start: 0, end: Math.min(3, D()) }); toast('Gancho adicionado nos 3 primeiros segundos.'); });
      }
      if (st.panel === 'camadas') {
        if (st.lib === null) loadLib();
        onAll('[data-sel]', 'click', (b) => { st.sel = b.dataset.sel; renderOverlays(); drawDrawer(); });
        onAll('[data-eye]', 'click', (b) => { const o = ovById(b.dataset.eye); o.hidden = !o.hidden; commit(); renderOverlays(); drawDrawer(); });
        onAll('[data-rm]', 'click', (b) => delOverlay(b.dataset.rm));
        let from = null;
        $$('.lr[draggable]', dr).forEach((r) => { r.addEventListener('dragstart', () => { from = r.dataset.lid; }); r.addEventListener('dragover', (e) => e.preventDefault()); r.addEventListener('drop', (e) => { e.preventDefault(); const to = r.dataset.lid; if (!from || from === to) return; const a = st.overlays.findIndex((o) => o.id === from), b = st.overlays.findIndex((o) => o.id === to); const [it] = st.overlays.splice(a, 1); st.overlays.splice(b, 0, it); commit(); renderOverlays(); drawDrawer(); }); });
      }
    }
    $$('.dlx-rail button', root).forEach((b) => b.onclick = () => { if (b.disabled) return; clearInterval(st.animT); st.panel = st.panel === b.dataset.p ? null : b.dataset.p; drawDrawer(); layoutStage(); });
    $('#dx-media', root).onclick = () => { st.panel = 'midia'; drawDrawer(); layoutStage(); };
    $('#dx-chip', root).onclick = () => { if (isAud) return; st.cap.on = !st.cap.on; commit(); refreshBar(); paintCap(); if (st.panel === 'legendas') drawDrawer(); };
    function reloadAll() { drawLeft(); drawDrawer(); renderOverlays(); goStart(); layoutStage(); tickUI(); refreshBar(); }

    /* ----- baixar ----- */
    const base = (st.title || clip.title || 'corte').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'corte';
    const srt = () => { const f = (x) => { x = Math.max(0, x); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = Math.floor(x % 60), ms = Math.round((x % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; }; return segsIn().map((s, i) => `${i + 1}\n${f(Math.max(s.t, st.start) - st.start)} --> ${f(Math.min(s.end, st.end) - st.start)}\n${st.edits[s.id] !== undefined ? st.edits[s.id] : s.text}\n`).join('\n'); };
    const excerpt = () => segsIn().map((s) => (st.edits[s.id] !== undefined ? st.edits[s.id] : s.text)).join(' ');
    async function render(audio, o2 = {}) {
      if (st.busy) return; st.busy = true; const lab = $('#dx-golab', root), btn = $('#dx-go', root), cancel = $('#dx-cancel', root); btn.disabled = true; cancel.hidden = false; lab.textContent = 'Renderizando…';
      let cancelled = false; cancel.onclick = async () => { cancelled = true; try { await api(`/uploads/${upload.id}/clips/${clip.id}/render/cancel`, { json: {} }); } catch { /* ok */ } };
      try {
        const opts = o2.raw ? { format: 'orig', captions: { on: false }, start: st.start, end: st.end } : { format: st.format, bw: st.bw, hq: st.hq, removePauses: st.removePauses, voice: st.voice, speed: st.speed, audioShift: st.sync, audio, start: st.start, end: st.end, removed: st.removed, edits: st.edits, captions: { ...st.cap }, overlays: st.overlays.filter((o) => !o.hidden).map(({ tpl, hidden, ...o }) => o) };
        if (st.title && st.title !== clip.title) api(`/uploads/${upload.id}/clips/${clip.id}`, { method: 'PATCH', json: { title: st.title } }).catch(() => {});
        await api(`/uploads/${upload.id}/clips/${clip.id}/render`, { json: opts });
        for (let i = 0; i < 1200; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const list = await api(`/uploads/${upload.id}/clips`); const k = list.find((x) => x.id === clip.id);
          if (!k || !k.render || k.render.status === 'rendering') { if (i > 3) lab.textContent = 'Renderizando… (' + Math.round(i * 1.5) + 's)'; continue; }
          if (k.render.status === 'done' && o2.drive) { lab.textContent = 'Enviando ao Drive…'; cancel.hidden = true; if (onDone) onDone(list); try { await ctx.drive.send(k); if (onDone) onDone(list); } catch (e) { toast('O corte foi exportado, mas o envio ao Drive falhou: ' + e.message); } }
          else if (k.render.status === 'done') { const a = document.createElement('a'); a.href = `/api/uploads/${upload.id}/clips/${clip.id}/file`; a.click(); toast(k.render.captions === false && st.cap.on && !audio && !isAud ? 'Baixado, mas sem legenda (o servidor não conseguiu queimar a legenda).' : 'Corte baixado.'); if (onDone) onDone(list); }
          else if (k.render.status === 'cancelled' || cancelled) toast('Renderização cancelada.');
          else toast('Falha ao renderizar: ' + (k.render.error || 'erro desconhecido'));
          break;
        }
      } catch (e) { toast(e.message); }
      st.busy = false; btn.disabled = false; cancel.hidden = true; lab.textContent = 'Baixar';
    }
    $('#dx-go', root).onclick = (e) => {
      if (st.busy) return; $$('.menu').forEach((m) => m.remove());
      const r = e.currentTarget.getBoundingClientRect(), m = document.createElement('div'); m.className = 'menu'; m.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, r.right - 230)}px;z-index:140`;
      m.innerHTML = `${isAud ? '' : '<button data-a="v">Vídeo (MP4)</button>'}${!isAud && ctx.drive ? '<button data-a="d">Vídeo (MP4) → enviar para o Drive</button>' : ''}<button data-a="a">Só áudio (MP3)</button><button data-a="s">Legenda do corte (SRT)</button><button data-a="t">Texto do corte (TXT)</button>`;
      document.body.appendChild(m);
      $$('button', m).forEach((b) => b.onclick = () => { m.remove(); const a = b.dataset.a; if (a === 'v') render(false); else if (a === 'd') ctx.drive.token().then(() => render(false, { drive: true })).catch((e) => toast(e.message)); else if (a === 'a') render(true); else if (a === 's') dl(base + '.srt', srt()); else dl(base + '.txt', excerpt()); });
      setTimeout(() => document.addEventListener('click', function h(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', h); } }), 0);
    };
    const close = () => { v.pause(); if (au) { au.pause(); au.removeAttribute('src'); } clearInterval(st.animT); root.remove(); document.body.style.overflow = ''; window.removeEventListener('resize', layoutStage); document.removeEventListener('keydown', onKey); $$('.menu').forEach((m) => m.remove()); };
    const onKey = (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      const o = ovById(st.sel), step = e.shiftKey ? 0.02 : 0.005;
      if (e.key === 'Escape') { if ($('.menu') || $('.modal-bg')) return; if (st.sel) { st.sel = null; renderOverlays(); drawDrawer(); } else close(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === 'x' && !e.ctrlKey) { st.tools.xray = !st.tools.xray; renderOverlays(); }
      else if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (o && e.key === 'Delete') delOverlay(o.id);
      else if (o && e.key.startsWith('Arrow')) { e.preventDefault(); if (e.key === 'ArrowLeft') o.x = clamp(o.x - step, 0, 1); if (e.key === 'ArrowRight') o.x = clamp(o.x + step, 0, 1); if (e.key === 'ArrowUp') o.y = clamp(o.y - step, 0, 1); if (e.key === 'ArrowDown') o.y = clamp(o.y + step, 0, 1); renderOverlays(); clearTimeout(st.nudge); st.nudge = setTimeout(commit, 400); }
    };
    document.addEventListener('keydown', onKey); $('#dx-close', root).onclick = close;
    $('#dx-note', root).textContent = isAud ? 'O arquivo final é gerado com ffmpeg no servidor.' : 'Prévia aproximada (recorte central, fontes do navegador). O arquivo final é gerado com ffmpeg no servidor.';
    drawLeft(); drawDrawer(); refreshBar(); layoutStage(); tickUI();
  }
  window.ClipEditor = { open };
})();
