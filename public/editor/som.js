/* INVB Studio — editor do corte: a gaveta Som. Efeitos sonoros (whoosh, batida, boom, pop, subida, clique), gerados no
   próprio Studio, e música de fundo (do Freesound ou enviada pela equipe) que abaixa sozinha quando o pregador fala.
   "Som automático" põe os efeitos onde já há impacto, cartela, efeito ou imagem de apoio. O Claude sugere a música.
   A mistura de verdade é feita na exportação (lib/render.js); a prévia aqui toca os sons por cima do vídeo.
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, $$, clamp, rid } = window.ClipEditorParts.base;
  // os tipos (o som de cada um vem do Freesound, em domínio público; a equipe pode trocar em "Trocar")
  const SFX = [
    ['whoosh', 'Whoosh', 'passagem rápida, na entrada de uma palavra ou imagem'],
    ['boom', 'Boom', 'impacto de cinema, numa cartela ou frase forte'],
    ['batida', 'Batida', 'grave curto, numa ênfase'],
    ['subida', 'Subida', 'cresce até o momento forte'],
    ['reverso', 'Reverso', 'prato ao contrário, puxa para o próximo momento'],
    ['pop', 'Pop', 'leve, para texto pequeno'],
    ['clique', 'Clique', 'seco, para cortes rápidos'],
    ['sino', 'Sino', 'reverência, um momento sagrado'],
    ['coracao', 'Coração', 'batimento, tensão ou emoção'],
    ['coral', 'Coral (ahh)', 'vozes, glória, céu'],
    ['vento', 'Vento', 'passagem suave, Espírito'],
    ['trovao', 'Trovão', 'peso, juízo, trevas'],
  ];
  const MOODS = [
    ['Piano calmo', 'soft piano ambient'],
    ['Esperança', 'uplifting inspirational piano'],
    ['Épico', 'epic cinematic orchestral'],
    ['Reflexivo', 'ambient pad meditation'],
    ['Adoração', 'worship ambient pad'],
  ];
  const names = {}; // nomes dos sons buscados no Freesound (tipo "fs123")
  const label = (k) => (SFX.find((s) => s[0] === k) || [k, names[k] || 'Som'])[1];

  window.ClipEditorParts.som = function (shared) {
    const { st, v, esc, commit, toast, api, upload, clip, D, tm } = shared;
    const drawDrawer = (...a) => shared.drawDrawer(...a);
    if (!Array.isArray(st.sfx)) st.sfx = [];
    for (const s of st.sfx) if (s.name && /^fs/.test(s.type)) names[s.type] = s.name;
    if (st.music === undefined) st.music = null;
    const ui = { q: '', items: null, busy: false, ai: null, aiBusy: false, used: null, using: null, playing: null };
    ui.opts = null; // { type, items, chosen } ao trocar o som de um tipo
    ui.sq = ''; // busca de efeito
    ui.sres = null;
    const bust = {}; // força a prévia a recarregar o som trocado
    const sfxUrl = (k) => `/api/sfx/${k}/file${bust[k] ? '?v=' + bust[k] : ''}`;
    const musUrl = (id) => `/api/music/${id}/file`;

    /* ----- prévia: os efeitos no instante deles e a música por baixo ----- */
    const cache = {};
    // efeitos tocando agora: param todos quando o vídeo pausa, volta ou termina (antes continuavam soando)
    const playing = new Set();
    const playSfx = (k, vol) => {
      const a = new Audio(sfxUrl(k));
      a.volume = clamp(vol ?? 0.8, 0, 1);
      playing.add(a);
      a.onended = () => playing.delete(a);
      a.play().catch(() => playing.delete(a));
    };
    const stopSfx = () => {
      for (const a of playing) {
        a.pause();
        a.src = '';
      }
      playing.clear();
    };
    const music = new Audio();
    music.loop = true;
    let lastT = null;
    const speaking = (t) => (shared.relWords ? shared.relWords() : []).some((w) => t >= w.s - 0.15 && t <= w.e + 0.25);
    function tick() {
      const t = shared.relT ? shared.relT() : 0;
      if (!v.paused && lastT !== null && t > lastT && t - lastT < 0.5)
        for (const s of st.sfx) if (s.at > lastT && s.at <= t) playSfx(s.type, s.vol);
      lastT = v.paused ? null : t;
      const m = st.music;
      if (!m) {
        if (!music.paused) music.pause();
        return;
      }
      const src = musUrl(m.mediaId);
      if (!music.src.endsWith(src)) music.src = src;
      // a exportação abaixa a música só quando ele fala; a prévia faz o mesmo de forma simples
      music.volume = clamp(m.vol * (m.duck && speaking(t) ? 0.35 : 1), 0, 1);
      if (v.paused) {
        if (!music.paused) music.pause();
        return;
      }
      const want = (m.from || 0) + t;
      if (music.duration && Math.abs(music.currentTime - (want % music.duration)) > 0.4)
        music.currentTime = want % music.duration;
      if (music.paused) music.play().catch(() => {});
    }
    const prev = shared.applyFx || (() => {});
    shared.applyFx = () => {
      prev();
      tick();
    };
    v.addEventListener('pause', () => {
      music.pause();
      stopSfx();
    });
    v.addEventListener('seeking', stopSfx);
    v.addEventListener('ended', stopSfx);

    /* ----- ações ----- */
    const refresh = () => {
      commit();
      drawDrawer();
    };
    const addSfx = (type, at, vol = 0.8, auto = false) =>
      st.sfx.push({ id: rid(), type, at: +clamp(at, 0, D()).toFixed(2), vol, auto });
    // efeitos onde a edição já tem algo acontecendo
    function auto(silent) {
      st.sfx = st.sfx.filter((s) => !s.auto);
      const seen = new Set();
      const put = (type, at, vol) => {
        const k = Math.round(at * 10);
        if (seen.has(k) || at < 0) return;
        seen.add(k);
        addSfx(type, at, vol, true);
      };
      const groups = new Map();
      for (const o of st.overlays)
        if (o.grp && !o.hidden) groups.set(o.grp, Math.min(groups.get(o.grp) ?? 1e9, o.start ?? 0));
      const cards = new Set((st.fx || []).filter((f) => f.type === 'card' && f.grp).map((f) => f.grp));
      for (const [g, at] of groups)
        put(cards.has(g) ? 'boom' : 'whoosh', Math.max(0, at - (cards.has(g) ? 0 : 0.12)), cards.has(g) ? 0.9 : 0.55);
      for (const f of st.fx || []) {
        if (f.grp) continue;
        if (f.type === 'card') put('boom', f.start, 0.9);
        if (f.type === 'zoom' || f.type === 'shake') put('batida', f.start, 0.8);
        if (f.type === 'flash') put('clique', f.start, 0.8);
        if (f.type === 'bw') put('subida', Math.max(0, f.start - 1.5), 0.5);
        if (f.type === 'reveal') put('reverso', Math.max(0, f.start - 0.8), 0.6);
        if (f.type === 'glow') put('coral', f.start, 0.45);
        if (f.type === 'pulse') put('coracao', f.start, 0.7);
        if (f.type === 'dim') put('trovao', f.start, 0.45);
        if (f.type === 'warm') put('sino', f.start, 0.5);
        if (f.type === 'pull' || f.type === 'push') put('vento', f.start, 0.4);
      }
      for (const b of st.broll || []) put('whoosh', Math.max(0, b.start - 0.15), 0.55);
      st.sfx.sort((a, b) => a.at - b.at);
      const n = st.sfx.filter((s) => s.auto).length;
      refresh();
      if (silent) return n;
      toast(
        n
          ? `${n} efeito${n === 1 ? '' : 's'} sonoro${n === 1 ? '' : 's'} nos momentos do Impacto e do Apoio. Dê o play para ouvir.`
          : 'Ainda não há impacto, cartela, efeito ou imagem de apoio no corte para pôr som.',
      );
    }
    async function search(q) {
      ui.q = q;
      ui.busy = true;
      drawDrawer();
      try {
        ui.items = (await api('/music/search?q=' + encodeURIComponent(q))).items;
      } catch (e) {
        toast(e.message);
      }
      ui.busy = false;
      drawDrawer();
    }
    async function suggest() {
      const ws = shared.relWords ? shared.relWords() : [];
      if (ws.length < 4) return toast('Este corte não tem fala suficiente na transcrição para a IA sugerir.');
      ui.aiBusy = true;
      drawDrawer();
      try {
        const r = await api(`/uploads/${upload.id}/clips/${clip.id}/ai/music`, { json: { words: ws.map((w) => w.t) } });
        ui.ai = r;
        ui.q = r.query;
        ui.items = r.items;
        if (r.error) toast(r.error);
      } catch (e) {
        toast(e.message);
      }
      ui.aiBusy = false;
      drawDrawer();
    }
    const setMusic = (it) => {
      st.music = {
        mediaId: it.id,
        vol: st.music ? st.music.vol : 0.2,
        duck: st.music ? st.music.duck : true,
        from: 0,
        name: it.name,
        by: it.by,
        license: it.license,
        page: it.page,
      };
      ui.used = null;
      refresh();
    };
    async function useFs(it) {
      ui.using = it.freesoundId;
      drawDrawer();
      try {
        setMusic(await api('/music/freesound', { json: { id: it.freesoundId } }));
        toast('Música de fundo escolhida. Dê o play para ouvir com a voz.');
      } catch (e) {
        toast(e.message);
      }
      ui.using = null;
      drawDrawer();
    }
    let preview = null;
    const listen = (url, key) => {
      if (preview) preview.pause();
      if (ui.playing === key) {
        ui.playing = null;
        return drawDrawer();
      }
      preview = new Audio(url);
      preview.volume = 0.8;
      preview.play().catch(() => {});
      preview.onended = () => {
        ui.playing = null;
        drawDrawer();
      };
      ui.playing = key;
      drawDrawer();
    };

    /* ----- a gaveta ----- */
    function html() {
      const ctx = shared.ctx || {};
      const m = st.music;
      void ctx;
      const credit = m && /BY/.test(m.license || '') ? `Música: “${m.name}” por ${m.by} (Freesound, CC BY)` : '';
      return `<h3>Som</h3><p class="dlx-sub" style="margin-top:0">Efeitos nos momentos fortes e uma música baixinha por baixo da voz. Os efeitos são feitos no próprio Studio.</p>
        <button class="ap-btn pri imp-ai" id="som-auto">⚡ Som automático no Impacto e no Apoio</button>
        <p class="dlx-sub">Whoosh nas palavras de impacto e imagens, boom nas cartelas, batida no zoom e na tremida, subida antes do P&amp;B.</p>
        <h4>Efeitos</h4>
        <p class="dlx-sub" style="margin-top:0">▶ ouve; + põe no ponto onde o vídeo está (${tm(shared.relT ? shared.relT() : 0)}).</p>
        <div class="som-fx">${SFX.map(([k, l, tip]) => `<div title="${tip}" class="${ui.opts && ui.opts.type === k ? 'on' : ''}"><button data-hear="${k}" aria-label="Ouvir ${l}">▶</button><span>${l}</span>${ctx.musicSearch ? `<button data-swap="${k}" aria-label="Trocar o som de ${l}" title="Trocar o som">⇄</button>` : ''}<button data-addfx="${k}" aria-label="Adicionar ${l}">+</button></div>`).join('')}</div>
        ${
          ui.opts
            ? `<div class="som-opts"><b>Trocar o som de “${label(ui.opts.type)}”</b>${ui.opts.items ? (ui.opts.items.length ? `<div class="som-list">${ui.opts.items.map((it, i) => `<div class="som-it"><button data-ohear="${i}" aria-label="Ouvir">${ui.playing === 'o' + i ? '❚❚' : '▶'}</button><div><b>${esc(it.name)}</b><small>${esc(it.by)} · ${it.dur}s</small></div><button class="ap-btn ${ui.opts.chosen === it.id ? 'pri' : ''}" data-ouse="${i}">${ui.opts.chosen === it.id ? 'Em uso' : 'Usar'}</button></div>`).join('')}</div>` : '<p class="dlx-sub">Nada encontrado.</p>') : '<p class="dlx-sub">Buscando…</p>'}<p class="dlx-sub" style="margin:0">Vale para a equipe toda, em todos os cortes.</p></div>`
            : ''
        }
        ${
          ctx.musicSearch
            ? `<div class="apo-q" style="margin-top:10px"><input id="som-sq" type="search" placeholder="Buscar outro efeito: aplausos, passos, porta…" value="${esc(ui.sq)}"><button class="ap-btn" id="som-sgo">Buscar</button></div>${ui.sres ? (ui.sres.length ? `<div class="som-list">${ui.sres.map((it, i) => `<div class="som-it"><button data-shear="${i}" aria-label="Ouvir">${ui.playing === 's' + i ? '❚❚' : '▶'}</button><div><b>${esc(it.name)}</b><small>${esc(it.by)} · ${it.dur}s</small></div><button class="ap-btn" data-sadd="${i}">+ Pôr aqui</button></div>`).join('')}</div>` : '<p class="dlx-sub">Nada encontrado. Tente em inglês.</p>') : ''}`
            : '<p class="dlx-sub">Com a chave do Freesound, os efeitos são gravações de verdade (e dá para trocar e buscar outros).</p>'
        }
        ${
          st.sfx.length
            ? `<div class="imp-fxl">${st.sfx
                .map(
                  (s) =>
                    `<div class="som-row"><button class="nm" data-go="${s.at}">${label(s.type)}${s.auto ? ' <small>auto</small>' : ''}</button><input type="number" step="0.1" min="0" data-sat="${s.id}" value="${s.at.toFixed(1)}" aria-label="Tempo (s)"><input type="range" min="0" max="150" data-svol="${s.id}" value="${Math.round(s.vol * 100)}" aria-label="Volume"><button data-rms="${s.id}" aria-label="Excluir">✕</button></div>`,
                )
                .join('')}</div>`
            : ''
        }
        <h4>Música de fundo</h4>
        ${
          m
            ? `<div class="som-cur"><b>${esc(m.name || 'Música')}</b><small>${esc([m.by, m.license].filter(Boolean).join(' · '))}</small>
              <label>Volume <b>${Math.round(m.vol * 100)}%</b></label><input type="range" id="som-vol" min="0" max="100" value="${Math.round(m.vol * 100)}">
              <div class="dlx-row"><div><b>Abaixar quando ele fala</b><small>A música some por baixo da voz e volta nas pausas</small></div>${shared.sw('som-duck', m.duck)}</div>
              <label>Começar a música em (s)</label><input type="number" id="som-from" min="0" step="1" value="${Math.round(m.from || 0)}">
              ${credit ? `<p class="som-credit">Ponha na descrição do vídeo: <span id="som-cred">${esc(credit)}</span> <button class="ap-btn" id="som-copy">Copiar</button></p>` : ''}
              <button class="ap-btn" id="som-rm" style="margin-top:8px">Tirar a música</button></div>`
            : '<p class="dlx-sub" style="margin-top:0">Nenhuma música no corte.</p>'
        }
        ${
          ctx.musicSearch
            ? `${ctx.ai ? `<button class="ap-btn imp-ai" id="som-ai" ${ui.aiBusy ? 'disabled' : ''}>${ui.aiBusy ? 'O Claude está ouvindo a fala…' : '✨ O Claude escolhe a música'}</button>` : ''}
              ${ui.ai ? `<p class="imp-note"><b>${esc(ui.ai.label)}</b> · ${esc(ui.ai.why)}</p>` : ''}
              <div class="dlx-chips" style="margin:8px 0">${MOODS.map(([l, q]) => `<button data-mood="${esc(q)}" aria-pressed="${ui.q === q}">${l}</button>`).join('')}</div>
              <div class="apo-q"><input id="som-q" type="search" placeholder="ex.: piano, cinematic, worship" value="${esc(ui.q)}"><button class="ap-btn" id="som-go" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Buscar'}</button></div>
              ${
                ui.items
                  ? ui.items.length
                    ? `<div class="som-list">${ui.items
                        .map(
                          (it, i) =>
                            `<div class="som-it"><button data-listen="${i}" aria-label="Ouvir">${ui.playing === 'r' + i ? '❚❚' : '▶'}</button><div><b>${esc(it.name)}</b><small>${esc(it.by)} · ${Math.floor(it.dur / 60)}:${String(it.dur % 60).padStart(2, '0')} · ${esc(it.license)}</small></div><button class="ap-btn" data-use="${i}" ${ui.using === it.freesoundId ? 'disabled' : ''}>${ui.using === it.freesoundId ? '…' : 'Usar'}</button></div>`,
                        )
                        .join('')}</div>`
                    : '<p class="dlx-sub">Nada encontrado. Tente outra palavra, em inglês.</p>'
                  : ''
              }`
            : '<p class="dlx-sub">Para buscar músicas grátis, ponha a chave do Freesound (FREESOUND_API_KEY) no <code>install/equipe.env</code>.</p>'
        }
        <label class="ap-btn som-up">Enviar música do computador<input type="file" id="som-file" accept="audio/*" hidden></label>
        ${
          ui.used && ui.used.length
            ? `<h4>Usadas antes</h4><div class="som-list">${ui.used
                .map(
                  (it, i) =>
                    `<div class="som-it"><button data-hearu="${i}" aria-label="Ouvir">${ui.playing === 'u' + i ? '❚❚' : '▶'}</button><div><b>${esc(it.name)}</b><small>${esc([it.by, it.license].filter(Boolean).join(' · '))}</small></div><button class="ap-btn" data-useu="${i}">Usar</button></div>`,
                )
                .join('')}</div>`
            : ''
        }
        <p class="apo-cred">Músicas do <a href="https://freesound.org" target="_blank" rel="noopener">Freesound</a> com licença livre (CC0 ou CC BY: nesta, cite o autor).</p>`;
    }
    function bind(dr) {
      if (ui.used === null) {
        ui.used = [];
        api('/music')
          .then((l) => {
            ui.used = l.slice(-8).reverse();
            if (st.panel === 'som') drawDrawer();
          })
          .catch(() => {});
      }
      const on = (sel, fn) => $$(sel, dr).forEach((b) => b.addEventListener('click', () => fn(b)));
      const one = (id, ev, fn) => {
        const e = $('#' + id, dr);
        if (e) e.addEventListener(ev, fn);
      };
      one('som-auto', 'click', auto);
      on('[data-hear]', (b) => playSfx(b.dataset.hear, 0.8));
      on('[data-swap]', async (b) => {
        const k = b.dataset.swap;
        if (ui.opts && ui.opts.type === k) {
          ui.opts = null;
          return drawDrawer();
        }
        ui.opts = { type: k, items: null, chosen: null };
        drawDrawer();
        try {
          const r = await api(`/sfx/${k}/options`);
          if (ui.opts && ui.opts.type === k) Object.assign(ui.opts, r);
        } catch (e) {
          toast(e.message);
          ui.opts = null;
        }
        drawDrawer();
      });
      on('[data-ohear]', (b) => listen(ui.opts.items[+b.dataset.ohear].preview, 'o' + b.dataset.ohear));
      on('[data-ouse]', async (b) => {
        const it = ui.opts.items[+b.dataset.ouse];
        try {
          await api(`/sfx/${ui.opts.type}/choose`, { json: { id: it.id } });
          ui.opts.chosen = it.id;
          bust[ui.opts.type] = Date.now();
          toast(`“${label(ui.opts.type)}” agora usa “${it.name}”, em todos os cortes.`);
        } catch (e) {
          toast(e.message);
        }
        drawDrawer();
      });
      const sq = $('#som-sq', dr);
      const sfxSearch = async () => {
        if (!ui.sq.trim()) return;
        try {
          ui.sres = (await api('/sfx/search?q=' + encodeURIComponent(ui.sq))).items;
        } catch (e) {
          toast(e.message);
        }
        drawDrawer();
      };
      if (sq) {
        sq.addEventListener('input', (e) => (ui.sq = e.target.value));
        sq.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') sfxSearch();
          e.stopPropagation();
        });
      }
      const sgo = $('#som-sgo', dr);
      if (sgo) sgo.onclick = sfxSearch;
      on('[data-shear]', (b) => listen(ui.sres[+b.dataset.shear].preview, 's' + b.dataset.shear));
      on('[data-sadd]', async (b) => {
        const it = ui.sres[+b.dataset.sadd];
        try {
          const r = await api('/sfx/fs', { json: { id: it.id } });
          names[r.type] = it.name.slice(0, 24);
          addSfx(r.type, shared.relT ? shared.relT() : 0);
          st.sfx[st.sfx.length - 1].name = names[r.type];
          st.sfx.sort((a, c) => a.at - c.at);
          refresh();
          playSfx(r.type, 0.8);
        } catch (e) {
          toast(e.message);
        }
      });
      on('[data-addfx]', (b) => {
        const t = shared.relT ? shared.relT() : 0;
        addSfx(b.dataset.addfx, t);
        st.sfx.sort((a, c) => a.at - c.at);
        refresh();
        playSfx(b.dataset.addfx, 0.8);
      });
      on('[data-go]', (b) => {
        v.currentTime = st.start + Math.max(0, +b.dataset.go - 0.5);
      });
      on('[data-rms]', (b) => {
        st.sfx = st.sfx.filter((s) => s.id !== b.dataset.rms);
        refresh();
      });
      $$('[data-sat]', dr).forEach((i) =>
        i.addEventListener('change', () => {
          const s = st.sfx.find((x) => x.id === i.dataset.sat);
          if (s) s.at = +clamp(+i.value || 0, 0, D()).toFixed(2);
          st.sfx.sort((a, c) => a.at - c.at);
          refresh();
        }),
      );
      $$('[data-svol]', dr).forEach((i) =>
        i.addEventListener('change', () => {
          const s = st.sfx.find((x) => x.id === i.dataset.svol);
          if (s) s.vol = +i.value / 100;
          commit();
          if (s) playSfx(s.type, s.vol);
        }),
      );
      one('som-vol', 'input', (e) => {
        st.music.vol = +e.target.value / 100;
        const b = e.target.previousElementSibling && e.target.previousElementSibling.querySelector('b');
        if (b) b.textContent = e.target.value + '%';
        shared.applyFx();
      });
      one('som-vol', 'change', commit);
      one('som-duck', 'click', () => {
        st.music.duck = !st.music.duck;
        refresh();
      });
      one('som-from', 'change', (e) => {
        st.music.from = Math.max(0, Math.round(+e.target.value || 0));
        refresh();
      });
      one('som-rm', 'click', () => {
        st.music = null;
        refresh();
        shared.applyFx();
      });
      one('som-copy', 'click', async () => {
        const t = $('#som-cred', dr).textContent;
        try {
          await navigator.clipboard.writeText(t);
          toast('Crédito copiado.');
        } catch {
          toast(t);
        }
      });
      one('som-ai', 'click', suggest);
      on('[data-mood]', (b) => search(b.dataset.mood));
      const q = $('#som-q', dr);
      if (q) {
        q.addEventListener('input', (e) => (ui.q = e.target.value));
        q.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') search(ui.q);
          e.stopPropagation();
        });
      }
      one('som-go', 'click', () => search(ui.q));
      on('[data-listen]', (b) => listen(ui.items[+b.dataset.listen].preview, 'r' + b.dataset.listen));
      on('[data-use]', (b) => useFs(ui.items[+b.dataset.use]));
      on('[data-hearu]', (b) => listen(musUrl(ui.used[+b.dataset.hearu].id), 'u' + b.dataset.hearu));
      on('[data-useu]', (b) => setMusic(ui.used[+b.dataset.useu]));
      one('som-file', 'change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 40 * 1024 * 1024) return toast('Música grande demais (até 40 MB).');
        try {
          const r = await fetch('/api/music?name=' + encodeURIComponent(f.name.replace(/\.[^.]+$/, '')), {
            method: 'POST',
            headers: { 'x-invb': '1' },
            body: f,
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Não consegui enviar a música.');
          setMusic(j);
          toast('Música de fundo enviada e escolhida.');
        } catch (err) {
          toast(err.message);
        }
      });
    }
    // usados pelo "Sugerir tudo" da gaveta Impacto
    shared.somAuto = (silent) => auto(silent);
    shared.somMusicAuto = async () => {
      const ws = shared.relWords ? shared.relWords() : [];
      if (ws.length < 4) return null;
      const r = await api(`/uploads/${upload.id}/clips/${clip.id}/ai/music`, { json: { words: ws.map((w) => w.t) } });
      ui.ai = r;
      ui.q = r.query;
      ui.items = r.items;
      const first = (r.items || [])[0];
      if (!first) return null;
      const it = await api('/music/freesound', { json: { id: first.freesoundId } });
      setMusic(it);
      return it.name;
    };
    shared.panels = { ...(shared.panels || {}), som: { html, bind } };
  };
})();
