/* Editor "Baixar corte" em tela cheia — organização igual à do original:
   configurações à esquerda · prévia com barra de ferramentas · drawer de painéis à direita · trilho de painéis.
   Tudo que está ativo é aplicado de verdade pelo ffmpeg do servidor (ver renderClip em server.js). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CSx = window.CaptionStyles,
    EP = window.EditorPresets;
  const FORMATS = [
    ['orig', 'Original', null, null],
    ['16:9', '16:9', 1920, 1080],
    ['9:16', '9:16', 1080, 1920],
    ['1:1', '1:1', 1080, 1080],
    ['4:5', '4:5', 1080, 1350],
  ];
  const FORMAT_ICON = { orig: [22, 16], '16:9': [22, 13], '9:16': [13, 22], '1:1': [17, 17], '4:5': [15, 19] };
  const ICON = (p) =>
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const RAIL = [
    ['transcricao', 'Transcrição', true, '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    [
      'templates',
      'Templates',
      true,
      '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/>',
    ],
    [
      'legendas',
      'Legendas',
      true,
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h10M14 10h3"/>',
    ],
    [
      'midia',
      'Mídia',
      true,
      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    ],
    ['texto', 'Texto', true, '<path d="M5 5h14M12 5v14M9 19h6"/>'],
    [
      'arte',
      'Arte',
      true,
      '<path d="M12 3a9 9 0 100 18c1.7 0 2-1.2 1.4-2.2-.6-1-.1-2.3 1.2-2.3H17a4 4 0 004-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    ],
    ['ganchos', 'Ganchos', true, '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>'],
    ['impacto', 'Impacto', true, '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
    [
      'apoio',
      'Apoio',
      true,
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    ],
    ['som', 'Som', true, '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
    ['camadas', 'Camadas', true, '<path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5"/>'],
  ];
  const SAMPLE = ['Você', 'não', 'precisa', 'de', 'mais', 'tempo,'].map((t, i) => ({
    t,
    s: i * 0.35,
    e: i * 0.35 + 0.35,
    seg: 0,
  }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rid = () => Math.random().toString(36).slice(2, 10);

  /* ----- legenda: HTML/CSS da prévia (equivale ao ASS do servidor) ----- */
  function capCss(style, eff, scale) {
    const ow = eff.ow * scale,
      sh = eff.shadow * scale;
    const css = [
      `color:${style.color}`,
      `font-family:'${eff.font}',Arial,sans-serif`,
      'font-weight:normal', // o peso vem da fonte (cada fonte do app é um arquivo com o seu peso)
      style.italic ? 'font-style:italic' : '',
      eff.upper ? 'text-transform:uppercase' : '',
    ];
    if (style.box)
      css.push(
        `background:${style.box.color}${Math.round((1 - style.box.alpha) * 255)
          .toString(16)
          .padStart(2, '0')}`,
        'padding:.08em .4em',
        'border-radius:6px',
      );
    else if (ow > 0)
      css.push(
        `-webkit-text-stroke:${(ow * 2).toFixed(1)}px ${style.glow ? style.hi : style.outline}`,
        'paint-order:stroke fill',
      );
    if (sh > 0) css.push(`text-shadow:0 ${sh.toFixed(1)}px ${(sh * 1.5).toFixed(1)}px rgba(0,0,0,.65)`);
    if (style.glow) css.push(`filter:drop-shadow(0 0 ${(6 * Math.max(scale * 3, 0.6)).toFixed(1)}px ${style.hi})`);
    return css.filter(Boolean).join(';');
  }
  function capHTML(style, eff, scale, ws, active, progress) {
    // a mesma lógica do servidor (lib/render.js, buildAss): destaque, palavras-chave, "cresce" e "surgindo"
    const kw = style.kw && style.mode !== 'karaoke';
    const span = (w, i) => {
      if (style.mode === 'karaoke')
        return `<span style="background:linear-gradient(90deg,${style.hi} ${progress}%,${style.color} ${progress}%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:0">${w.t}</span>`;
      if (style.mode === 'reveal' && i > active) return `<span style="visibility:hidden">${w.t}</span>`;
      const isAct = i === active && !['block', 'plain'].includes(style.mode);
      let css = '';
      if (isAct && style.mode === 'boxhl')
        css = `background:${style.hi};border-radius:.2em;padding:0 .18em;-webkit-text-stroke:0`;
      else if (isAct && style.mode === 'highlight') css = `color:${style.hi}`;
      else if (kw && CSx.isKeyword(w.t)) css = `color:${style.kc}`;
      if (isAct && style.grow) css += (css ? ';' : '') + 'font-size:1.18em';
      return css ? `<span style="${css}">${w.t}</span>` : w.t;
    };
    return `<span style="${capCss(style, eff, scale)};display:inline-block;max-width:100%">${ws.map(span).join(' ')}</span>`;
  }

  // O editor tem quatro arquivos: este (estado, estrutura, salvar e exportar), preview.js (prévia, linha do tempo e
  // imagens sobre o vídeo), left.js (painel da esquerda) e drawers.js (gavetas da direita). As partes dividem o objeto "shared".
  const Parts = (window.ClipEditorParts = {
    base: { $, $$, CSx, capHTML, clamp, rid, FORMATS, FORMAT_ICON, SAMPLE, EP },
  });

  function open(ctx) {
    const shared = {}; // o que as partes dividem entre si
    // funções das outras partes, chamadas pelo objeto comum na hora do uso
    const refreshBar = (...a) => shared.refreshBar(...a);
    const drawDrawer = (...a) => shared.drawDrawer(...a);
    const layoutStage = (...a) => shared.layoutStage(...a);
    const paintCap = (...a) => shared.paintCap(...a);
    const drawLeft = (...a) => shared.drawLeft(...a);
    const renderOverlays = (...a) => shared.renderOverlays(...a);
    const goStart = (...a) => shared.goStart(...a);
    const tickUI = (...a) => shared.tickUI(...a);
    const loadTrim = (...a) => shared.loadTrim(...a);
    const closeSyTest = (...a) => shared.closeSyTest(...a);
    const drawTrim = (...a) => shared.drawTrim(...a);
    const ovById = (...a) => shared.ovById(...a);
    const toggle = (...a) => shared.toggle(...a);
    const delOverlay = (...a) => shared.delOverlay(...a);

    const { upload, clip, api, toast, tm, esc, dl, onDone } = ctx;
    const isAud = upload.kind === 'aud';
    const dur = upload.duration || clip.end + 60;
    const st = {
      format: 'orig',
      crop: { x: 0.5, y: 0.5 }, // enquadramento quando o formato recorta o vídeo
      bw: false,
      hq: false,
      removePauses: false,
      voice: 'off',
      speed: 1,
      sync: 0,
      cap: {
        on: false,
        style: CSx.DEFAULT_ID,
        size: 16,
        pos: 'bottom',
        margin: null, // distância da borda em % da altura; vazio = a do formato
        words: null,
      },
      start: clip.start,
      end: clip.end,
      title: clip.title || '',
      removed: [],
      edits: {},
      lang: null,
      overlays: [],
      look: 'none', // cor do vídeo inteiro (gaveta Impacto)
      fx: [], // efeitos num trecho: P&B, zoom, tremida, flash, cartela (gaveta Impacto)
      broll: [], // imagens de apoio do Pexels (gaveta Apoio)
      sfx: [], // efeitos sonoros (gaveta Som)
      music: null, // música de fundo (gaveta Som)
      sel: null,
      panel: null,
      tab: 'estilos',
      cat: 'Todos',
      q: '',
      styleChosen: false,
      tplCat: 'Todos',
      tq: '',
      lib: null,
      templates: null,
      tools: { snap: true, xray: false, guides: false },
      busy: false,
      hist: [],
      fut: [],
      anim: true,
      trMode: 'cut',
      trLarge: false,
      tick: 0,
      cutA: null,
      open: { fmt: true },
    };
    // Edição salva antes neste corte: o editor reabre do jeito que ficou.
    const SAVED = [
      'format',
      'crop',
      'bw',
      'hq',
      'voice',
      'speed',
      'sync',
      'cap',
      'start',
      'end',
      'removed',
      'edits',
      'lang',
      'overlays',
      'look',
      'fx',
      'broll',
      'sfx',
      'music',
      'title',
    ];
    if (clip.editor && typeof clip.editor === 'object') {
      for (const k of SAVED)
        if (clip.editor[k] !== undefined && clip.editor[k] !== null) st[k] = JSON.parse(JSON.stringify(clip.editor[k]));
      st.cap = {
        ...{
          on: false,
          style: CSx.DEFAULT_ID,
          size: 16,
          pos: 'bottom',
          margin: null,
        },
        ...st.cap,
      };
      if (!(st.end > st.start)) {
        st.start = clip.start;
        st.end = clip.end;
      }
      if (clip.editor.cap && clip.editor.cap.style) st.styleChosen = true;
      st.title = clip.title || st.title;
    }
    // corte ainda sem edição começa no formato padrão da equipe (marcado no painel Formato)
    st.prefs = ctx.prefs || { format: null };
    if (!clip.editor && st.prefs.format && !isAud) st.format = st.prefs.format;
    // estilos de legenda salvos neste computador; corte ainda sem edição começa com o estilo marcado como padrão
    st.myStyles = ctx.capStyles || { styles: [], defaultId: null };
    if (!clip.editor && st.myStyles.defaultId) {
      const it = st.myStyles.styles.find((x) => x.id === st.myStyles.defaultId);
      if (it) st.cap = CSx.fromSaved(it, false);
    }
    const segs = ctx.segs || [];
    shared.words = [];
    // o estilo que vale: o escolhido com as mudanças de "Personalizar" por cima (o mesmo cálculo da exportação)
    const style = () => CSx.resolve(st.cap);
    const eff = style;
    const fmtObj = () => FORMATS.find((x) => x[0] === st.format);
    const outSize = () => {
      const f = fmtObj();
      return f[2] ? `${f[2]}×${f[3]}` : 'mesmo tamanho do vídeo';
    };
    const D = () => st.end - st.start;
    // Duração do arquivo exportado: a do trecho dividida pela velocidade. É a que aparece na tela.
    // Tempo removido do corte dentro de [a, b], em segundos (trechos e palavras retirados; sobreposições contam uma vez só).
    const removedIn = (a, b) => {
      const rs = st.removed
        .map(([x, y]) => [Math.max(x, a), Math.min(y, b)])
        .filter(([x, y]) => y > x)
        .sort((p, q) => p[0] - q[0]);
      let tot = 0,
        end = -Infinity;
      for (const [x, y] of rs) {
        const s = Math.max(x, end);
        if (y > s) tot += y - s;
        end = Math.max(end, y);
      }
      return tot;
    };
    const outD = () => Math.max(0, D() - removedIn(st.start, st.end)) / (st.speed || 1);
    const spTxt = (x) => String(+(+x).toFixed(2)).replace('.', ',') + 'x';
    const segsIn = () => segs.filter((s) => s.end > st.start && s.t < st.end);

    /* ----- histórico (desfazer/refazer) ----- */
    const snap = () =>
      JSON.stringify({
        format: st.format,
        crop: st.crop,
        bw: st.bw,
        hq: st.hq,
        removePauses: st.removePauses,
        voice: st.voice,
        speed: st.speed,
        sync: st.sync,
        cap: st.cap,
        start: st.start,
        end: st.end,
        removed: st.removed,
        edits: st.edits,
        lang: st.lang,
        overlays: st.overlays,
        look: st.look,
        fx: st.fx,
        broll: st.broll,
        sfx: st.sfx,
        music: st.music,
        title: st.title,
      });
    const restore = (j) => {
      Object.assign(st, JSON.parse(j));
      shared.wordsDirty = true;
      reloadAll();
    };
    const commit = () => {
      st.hist.push(snap());
      if (st.hist.length > 80) st.hist.shift();
      st.fut = [];
      refreshBar();
    };
    st.hist.push(snap()); // estado inicial (a interface ainda não existe, então sem refreshBar)
    let savedSnap = snap(); // o que está guardado no corte; diferente disso = há mudanças por salvar
    const dirty = () => snap() !== savedSnap;
    const saveEdit = async (quiet) => {
      const j = snap();
      try {
        await api(`/uploads/${upload.id}/clips/${clip.id}`, { method: 'PATCH', json: { editor: JSON.parse(j) } });
        clip.editor = JSON.parse(j);
        savedSnap = j;
        if (!quiet) {
          toast('Edição salva. O próximo "Baixar corte" já sai com ela.');
          if (onDone) {
            try {
              onDone(await api(`/uploads/${upload.id}/clips`));
            } catch {
              /* a lista atualiza depois */
            }
          }
        }
      } catch (e) {
        if (!quiet) toast('Não consegui salvar a edição: ' + e.message);
      }
      refreshBar();
    };
    const undo = () => {
      if (st.hist.length < 2) return;
      st.fut.push(st.hist.pop());
      restore(st.hist[st.hist.length - 1]);
    };
    const redo = () => {
      if (!st.fut.length) return;
      const j = st.fut.pop();
      st.hist.push(j);
      restore(j);
    };

    /* ----- estrutura ----- */
    const root = document.createElement('div');
    root.className = 'dlx';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Editar corte');
    root.innerHTML = `
      <header class="dlx-top"><div class="dlx-t"><h2>Editar corte</h2><p class="dlx-q" id="dx-q"></p></div>
        <button class="dlx-chip" id="dx-chip"></button><button class="dlx-chip" id="dx-media"></button>
        <button class="dlx-chip" id="dx-save" title="Guarda esta edição no corte, para continuar depois">Salvar edição</button>
        <button class="ap-btn" id="dx-cancel" hidden>Cancelar</button>
        <div class="dlx-dlw"><button class="dlx-go" id="dx-go"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg><span id="dx-golab">Baixar</span><span style="opacity:.8">⌄</span></button></div>
        <button class="dlx-x" id="dx-close" aria-label="Fechar">✕</button></header>
      <div class="dlx-body" id="dx-body"><aside class="dlx-left" id="dx-left"></aside>
        <main class="dlx-mid">
          <div class="dlx-tools" id="dx-tools"></div>
          <div class="dlx-stage" id="dx-stage"><video id="dx-v" playsinline preload="metadata"></video><div class="dlx-cap" id="dx-cap"></div><div class="dlx-ovs" id="dx-ovs"></div><div class="dlx-guides" id="dx-guides"></div><button class="dlx-play" id="dx-play" aria-label="Reproduzir"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z"/></svg></button></div>
          <div class="dlx-prog"><span id="dx-t0">0:00</span><input type="range" id="dx-seek" min="0" max="1" step="0.05" value="0" aria-label="Posição"><span id="dx-t1"></span></div>
          <div class="dlx-trim" id="dx-trim" aria-label="Começo e fim do corte"><canvas id="dx-wave"></canvas><div class="dlx-trsel" id="dx-trsel"><i class="h l" data-h="s" role="slider" tabindex="0" aria-label="Começo do corte"></i><i class="h r" data-h="e" role="slider" tabindex="0" aria-label="Fim do corte"></i></div><div class="dlx-trph" id="dx-trph"></div></div>
          <div class="dlx-triml"><span id="dx-trl"></span><span class="mid">Arraste as pontas para ajustar o começo e o fim. As setas do teclado movem 0,1 s.</span><span id="dx-trr"></span></div>
          <p class="dlx-note" id="dx-note"></p></main>
        <section class="dlx-drawer" id="dx-drawer" hidden></section>
        <nav class="dlx-rail" aria-label="Ferramentas">${RAIL.map((r) => `<button data-p="${r[0]}">${ICON(r[3])}<span>${r[1]}</span></button>`).join('')}</nav></div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const v = $('#dx-v', root),
      stage = $('#dx-stage', root),
      capEl = $('#dx-cap', root),
      ovsEl = $('#dx-ovs', root),
      guides = $('#dx-guides', root);
    if (isAud) {
      v.style.display = 'none';
      stage.classList.add('aud');
      stage.insertAdjacentHTML('afterbegin', '<div class="dlx-audio">🎧<small>Áudio</small></div>');
    }
    v.src = `/api/uploads/${upload.id}/media`;

    Object.assign(shared, {
      st,
      v,
      upload,
      tm,
      root,
      commit,
      toast,
      api,
      segs,
      clip,
      fmtObj,
      isAud,
      stage,
      capEl,
      style,
      eff,
      dur,
      outD,
      reloadAll,
      D,
      removedIn,
      ovsEl,
      esc,
      guides,
      dirty,
      segsIn,
      spTxt,
      undo,
      redo,
      outSize,
      ctx,
      render,
    });
    Parts.preview(shared);
    Parts.left(shared);
    Parts.drawers(shared);
    if (Parts.arte) Parts.arte(shared);
    if (Parts.impacto) Parts.impacto(shared);
    if (Parts.apoio) Parts.apoio(shared);
    if (Parts.som) Parts.som(shared);

    $$('.dlx-rail button', root).forEach(
      (b) =>
        (b.onclick = () => {
          if (b.disabled) return;
          clearInterval(st.animT);
          st.panel = st.panel === b.dataset.p ? null : b.dataset.p;
          drawDrawer();
          layoutStage();
        }),
    );
    $('#dx-media', root).onclick = () => {
      st.panel = 'midia';
      drawDrawer();
      layoutStage();
    };
    $('#dx-chip', root).onclick = () => {
      if (isAud) return;
      st.cap.on = !st.cap.on;
      commit();
      refreshBar();
      paintCap();
      if (st.panel === 'legendas') drawDrawer();
    };
    function reloadAll() {
      drawLeft();
      drawDrawer();
      renderOverlays();
      goStart();
      layoutStage();
      tickUI();
      refreshBar();
      loadTrim();
    }

    /* ----- baixar ----- */
    const base = (st.title || clip.title || 'corte').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'corte';
    const srt = () => {
      const f = (x) => {
        x = Math.max(0, x);
        const h = Math.floor(x / 3600),
          m = Math.floor((x % 3600) / 60),
          sec = Math.floor(x % 60),
          ms = Math.round((x % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return segsIn()
        .map(
          (s, i) =>
            `${i + 1}\n${f(Math.max(s.t, st.start) - st.start)} --> ${f(Math.min(s.end, st.end) - st.start)}\n${st.edits[s.id] !== undefined ? st.edits[s.id] : s.text}\n`,
        )
        .join('\n');
    };
    const excerpt = () =>
      segsIn()
        .map((s) => (st.edits[s.id] !== undefined ? st.edits[s.id] : s.text))
        .join(' ');
    async function render(audio, o2 = {}) {
      if (st.busy) return;
      st.busy = true;
      const lab = $('#dx-golab', root),
        btn = $('#dx-go', root),
        cancel = $('#dx-cancel', root);
      btn.disabled = true;
      cancel.hidden = false;
      lab.textContent = 'Renderizando…';
      let cancelled = false;
      cancel.onclick = async () => {
        cancelled = true;
        try {
          await api(`/uploads/${upload.id}/clips/${clip.id}/render/cancel`, { json: {} });
        } catch {
          /* ok */
        }
      };
      try {
        const opts = o2.raw
          ? { format: 'orig', captions: { on: false }, start: st.start, end: st.end }
          : renderOpts(st, audio);
        if (st.title && st.title !== clip.title)
          api(`/uploads/${upload.id}/clips/${clip.id}`, { method: 'PATCH', json: { title: st.title } }).catch(() => {});
        if (!o2.raw) await saveEdit(true); // exportou: a edição usada fica guardada no corte
        await api(`/uploads/${upload.id}/clips/${clip.id}/render`, { json: opts });
        for (let i = 0; i < 1200; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const list = await api(`/uploads/${upload.id}/clips`);
          const k = list.find((x) => x.id === clip.id);
          if (!k || !k.render || k.render.status === 'rendering') {
            if (i > 3) lab.textContent = 'Renderizando… (' + Math.round(i * 1.5) + 's)';
            continue;
          }
          if (k.render.status === 'done' && o2.drive) {
            lab.textContent = 'Enviando ao Drive…';
            cancel.hidden = true;
            if (onDone) onDone(list);
            try {
              await ctx.drive.send(k);
              if (onDone) onDone(list);
            } catch (e) {
              toast('O corte foi exportado, mas o envio ao Drive falhou: ' + e.message);
            }
          } else if (k.render.status === 'done') {
            const a = document.createElement('a');
            a.href = `/api/uploads/${upload.id}/clips/${clip.id}/file`;
            a.click();
            toast(
              k.render.captions === false && st.cap.on && !audio && !isAud
                ? 'Baixado, mas sem legenda (o servidor não conseguiu queimar a legenda).'
                : 'Corte baixado.',
            );
            if (onDone) onDone(list);
          } else if (k.render.status === 'cancelled' || cancelled) toast('Renderização cancelada.');
          else toast('Falha ao renderizar: ' + (k.render.error || 'erro desconhecido'));
          break;
        }
      } catch (e) {
        toast(e.message);
      }
      st.busy = false;
      btn.disabled = false;
      cancel.hidden = true;
      lab.textContent = 'Baixar';
    }
    $('#dx-go', root).onclick = (e) => {
      if (st.busy) return;
      $$('.menu').forEach((m) => m.remove());
      const r = e.currentTarget.getBoundingClientRect(),
        m = document.createElement('div');
      m.className = 'menu';
      m.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, r.right - 230)}px;z-index:140`;
      m.innerHTML = `${isAud ? '' : '<button data-a="v">Vídeo (MP4)</button>'}${!isAud && ctx.drive ? '<button data-a="d">Vídeo (MP4) → enviar para o Drive</button>' : ''}<button data-a="a">Só áudio (MP3)</button><button data-a="s">Legenda do corte (SRT)</button><button data-a="t">Texto do corte (TXT)</button>`;
      document.body.appendChild(m);
      $$('button', m).forEach(
        (b) =>
          (b.onclick = () => {
            m.remove();
            const a = b.dataset.a;
            if (a === 'v') render(false);
            else if (a === 'd')
              ctx.drive
                .token()
                .then(() => render(false, { drive: true }))
                .catch((e) => toast(e.message));
            else if (a === 'a') render(true);
            else if (a === 's') dl(base + '.srt', srt());
            else dl(base + '.txt', excerpt());
          }),
      );
      setTimeout(
        () =>
          document.addEventListener('click', function h(ev) {
            if (!m.contains(ev.target)) {
              m.remove();
              document.removeEventListener('click', h);
            }
          }),
        0,
      );
    };
    const close = () => {
      v.pause();
      closeSyTest();
      clearInterval(st.animT);
      root.remove();
      document.body.style.overflow = '';
      window.removeEventListener('resize', layoutStage);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', drawTrim);
      $$('.menu').forEach((m) => m.remove());
    };
    const tryClose = () => {
      if (dirty() && !window.confirm('Há mudanças que não foram salvas neste corte. Fechar mesmo assim?')) return;
      close();
    };
    const onKey = (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      const o = ovById(st.sel),
        step = e.shiftKey ? 0.02 : 0.005;
      if (e.key === 'Escape') {
        if ($('.menu') || $('.modal-bg')) return;
        if (st.sel) {
          st.sel = null;
          renderOverlays();
          drawDrawer();
        } else tryClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) {
        st.tools.xray = !st.tools.xray;
        renderOverlays();
        paintCap();
      } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        st.tools.guides = !st.tools.guides;
        renderOverlays();
      } else if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (o && e.key === 'Delete') delOverlay(o.id);
      else if (o && e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') o.x = clamp(o.x - step, 0, 1);
        if (e.key === 'ArrowRight') o.x = clamp(o.x + step, 0, 1);
        if (e.key === 'ArrowUp') o.y = clamp(o.y - step, 0, 1);
        if (e.key === 'ArrowDown') o.y = clamp(o.y + step, 0, 1);
        renderOverlays();
        clearTimeout(st.nudge);
        st.nudge = setTimeout(commit, 400);
      }
    };
    loadTrim();
    document.addEventListener('keydown', onKey);
    $('#dx-close', root).onclick = tryClose;
    $('#dx-save', root).onclick = () => saveEdit(false);
    $('#dx-note', root).textContent = isAud
      ? 'O arquivo final é gerado com ffmpeg no servidor.'
      : 'Prévia aproximada (recorte central). As fontes são as mesmas do arquivo final, que é gerado no servidor.';
    drawLeft();
    drawDrawer();
    refreshBar();
    layoutStage();
    tickUI();
  }
  // Opções de exportação a partir de uma edição (a do editor aberto ou a que ficou salva no corte).
  function renderOpts(e, audio) {
    return {
      format: e.format || 'orig',
      crop: e.crop || { x: 0.5, y: 0.5 },
      bw: !!e.bw,
      hq: !!e.hq,
      removePauses: false,
      voice: e.voice || 'off',
      speed: e.speed || 1,
      audioShift: e.sync || 0,
      audio: !!audio,
      start: e.start,
      end: e.end,
      removed: e.removed || [],
      edits: e.edits || {},
      captions: { ...(e.cap || { on: false }) },
      overlays: (e.overlays || []).filter((o) => !o.hidden).map(({ tpl, hidden, grp, ...o }) => o),
      look: e.look || 'none',
      fx: (e.fx || []).map(({ type, start, end, color }) => ({ type, start, end, color })),
      broll: (e.broll || []).map(({ mediaId, start, end, mode, bw, zoom }) => ({
        mediaId,
        start,
        end,
        mode,
        bw,
        zoom,
      })),
      sfx: (e.sfx || []).map(({ type, at, vol }) => ({ type, at, vol })),
      music: e.music
        ? { mediaId: e.music.mediaId, vol: e.music.vol, duck: e.music.duck, from: e.music.from || 0 }
        : null,
    };
  }
  window.ClipEditor = { open, renderOpts };
})();
