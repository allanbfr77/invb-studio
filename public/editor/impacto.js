/* INVB Studio — editor do corte: a gaveta Impacto. Palavras de impacto (as palavras fortes entram grandes, uma por vez,
   no tempo da fala), cartela (tela cheia numa cor com o texto), efeitos num trecho (P&B, zoom, tremida, flash), a cor
   do vídeo (look) e a sugestão do Claude, que monta tudo isso lendo a fala.
   A prévia aqui imita com CSS o que a exportação faz com o ffmpeg (lib/render.js: LOOKS, fxChain e animTag).
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, $$, clamp, rid } = window.ClipEditorParts.base;

  // estilos das palavras de impacto: "big" na palavra mais forte da frase, "small" nas outras
  const PRESETS = {
    vermelho: {
      label: 'Vermelho forte',
      big: { font: 'Archivo Black', color: '#e3262d', upper: true, size: 0.085 },
      small: { font: 'DM Serif Display', color: '#ffffff', size: 0.05 },
    },
    classico: {
      label: 'Serifa elegante',
      big: { font: 'DM Serif Display', color: '#ffffff', size: 0.08 },
      small: { font: 'DM Serif Display', color: '#eadfc4', italic: true, size: 0.046 },
    },
    amarelo: {
      label: 'Amarelo',
      big: { font: 'Montserrat ExtraBold', color: '#ffd60a', upper: true, size: 0.07 },
      small: { font: 'Montserrat ExtraBold', color: '#ffffff', upper: true, size: 0.044 },
    },
    bebas: {
      label: 'Branco alto',
      big: { font: 'Bebas Neue', color: '#ffffff', size: 0.11 },
      small: { font: 'Poppins SemiBold', color: '#ffffff', size: 0.04 },
    },
    revista: {
      label: 'Revista',
      big: { font: 'Playfair Display Black', color: '#ffffff', size: 0.085 },
      small: { font: 'Playfair Display Black', color: '#eadfc4', italic: true, size: 0.048 },
    },
    cinema: {
      label: 'Cinema',
      big: { font: 'Oswald Bold', color: '#ffffff', upper: true, size: 0.09 },
      small: { font: 'Cormorant Bold', color: '#f3e3b5', italic: true, size: 0.055 },
    },
    manuscrito: {
      label: 'Manuscrito',
      big: { font: 'Great Vibes', color: '#f3cf6b', size: 0.11 },
      small: { font: 'Montserrat Black', color: '#ffffff', upper: true, size: 0.042 },
    },
    pincel: {
      label: 'Pincel',
      big: { font: 'Kaushan Script', color: '#ffffff', size: 0.09 },
      small: { font: 'Montserrat Black', color: '#ffd60a', upper: true, size: 0.04 },
    },
    moderno: {
      label: 'Moderno',
      big: { font: 'Syne ExtraBold', color: '#ffffff', upper: true, size: 0.075 },
      small: { font: 'Inter Black', color: '#c8f169', upper: true, size: 0.038 },
    },
    caderno: {
      label: 'Caderno',
      big: { font: 'Caveat Bold', color: '#ffffff', size: 0.1 },
      small: { font: 'Caveat Bold', color: '#ffe08a', size: 0.06 },
    },
    tarja: {
      label: 'Tarja dourada',
      big: {
        font: 'Montserrat ExtraBold',
        color: '#111111',
        upper: true,
        size: 0.062,
        box: { color: '#f0b93a', alpha: 0 },
      },
      small: { font: 'Poppins SemiBold', color: '#ffffff', size: 0.042 },
    },
  };
  const SIDES = [
    ['esq', 'Esquerda', 0.3],
    ['centro', 'Centro', 0.5],
    ['dir', 'Direita', 0.7],
  ];
  const ANIMS = [
    ['pop', 'Pop'],
    ['blur', 'Desfocado'],
    ['zoom', 'De perto'],
    ['slide', 'Deslizar'],
    ['fade', 'Suave'],
  ];
  const LOOKS = [
    ['none', 'Original'],
    ['quente', 'Quente'],
    ['filme', 'Filme'],
    ['frio', 'Frio'],
    ['drama', 'P&B dramático'],
    ['vivo', 'Vivo'],
    ['cinema', 'Cinema'],
    ['dourado', 'Dourado'],
    ['noite', 'Noite'],
    ['suave', 'Suave'],
    ['retro', 'Retrô'],
  ];
  // o mesmo look da exportação, aproximado com filtros do navegador (+ cantos escuros onde o ffmpeg usa vinheta)
  const LOOK_CSS = {
    none: ['', false],
    quente: ['sepia(.22) saturate(.95) contrast(1.06)', false],
    filme: ['sepia(.32) saturate(.8) contrast(1.12)', true],
    frio: ['saturate(.9) contrast(1.05) hue-rotate(-8deg) brightness(1.02)', false],
    drama: ['grayscale(1) contrast(1.3) brightness(.97)', true],
    vivo: ['saturate(1.28) contrast(1.08)', false],
    cinema: ['contrast(1.1) saturate(1.08) sepia(.12) hue-rotate(-6deg)', false],
    dourado: ['sepia(.3) saturate(1.1) contrast(1.05) brightness(1.03)', false],
    noite: ['brightness(.92) contrast(1.08) saturate(.7) hue-rotate(8deg)', true],
    suave: ['contrast(.92) brightness(1.03) saturate(.85)', false],
    retro: ['sepia(.4) contrast(.95) saturate(.85)', false],
  };
  const FX = {
    bw: { label: 'P&B', dur: 1.2, tip: 'Preto e branco com cantos escuros, só no trecho' },
    zoom: { label: 'Zoom', dur: 1.5, tip: 'Aproxima a imagem de uma vez' },
    shake: { label: 'Tremida', dur: 0.6, tip: 'A imagem treme, para um grito ou batida' },
    flash: { label: 'Flash', dur: 0.3, tip: 'Um clarão branco que some' },
    card: { label: 'Cartela', dur: 1.2, tip: 'Tela cheia numa cor só' },
    push: { label: 'Zoom lento', dur: 2.5, tip: 'Aproxima devagar, numa frase que vai crescendo' },
    blur: { label: 'Desfoque', dur: 1.0, tip: 'A imagem fica borrada (confusão, algo que some)' },
    glitch: { label: 'Glitch', dur: 0.5, tip: 'Cores separadas e chuvisco (erro, engano, mentira)' },
    dim: { label: 'Escurecer', dur: 1.5, tip: 'A imagem escurece (trevas, peso, pecado)' },
    echo: { label: 'Rastro', dur: 1.0, tip: 'O movimento deixa rastro (passado, memória)' },
    pull: { label: 'Zoom para fora', dur: 2.0, tip: 'Começa perto e abre (fechar uma ideia)' },
    pulse: { label: 'Pulso', dur: 2.0, tip: 'A imagem pulsa como batida' },
    handheld: { label: 'Câmera na mão', dur: 3.0, tip: 'Balanço leve, mais íntimo' },
    redpop: { label: 'Só vermelho', dur: 1.5, tip: 'Tudo cinza, menos o vermelho (sangue, cruz)' },
    glow: { label: 'Brilho', dur: 1.5, tip: 'Brilho suave em volta da luz (glória, céu)' },
    warm: { label: 'Luz quente', dur: 1.5, tip: 'Luz dourada (esperança, graça)' },
    reveal: { label: 'Surgir do preto', dur: 0.8, tip: 'A imagem aparece do preto (abrir o corte)' },
    oldfilm: { label: 'Filme antigo', dur: 2.0, tip: 'Sépia, chuvisco e luz piscando (história)' },
    vhs: { label: 'VHS', dur: 1.5, tip: 'Fita antiga, cores vazando e linhas' },
    pixel: { label: 'Mosaico', dur: 0.4, tip: 'Quadradinhos numa virada rápida' },
    punch: { label: 'Câmera perto', dur: 3.0, tip: 'Corte seco para mais perto, como uma segunda câmera (punch-in)' },
  };
  // grupos para a gaveta, como num programa de edição
  const FX_GROUPS = [
    ['Câmera', ['punch', 'zoom', 'push', 'pull', 'pulse', 'shake', 'handheld']],
    ['Cor e luz', ['bw', 'redpop', 'dim', 'glow', 'warm', 'flash', 'reveal']],
    ['Estilo', ['oldfilm', 'vhs', 'glitch', 'blur', 'echo', 'pixel']],
  ];
  const CARD_COLORS = ['#000000', '#ffffff', '#c0262d', '#f0b93a'];
  const dark = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 140;
  };
  // largura média de uma letra, em relação ao tamanho, em cada fonte (para a palavra caber no quadro)
  const FONT_W = {
    'Archivo Black': 0.74,
    'Montserrat ExtraBold': 0.7,
    'Poppins ExtraBold': 0.68,
    'Poppins SemiBold': 0.6,
    'DM Serif Display': 0.52,
    Anton: 0.46,
    'Bebas Neue': 0.4,
    'Oswald Bold': 0.5,
    'Montserrat Black': 0.74,
    'League Spartan Black': 0.68,
    'Inter Black': 0.68,
    'Barlow Condensed ExtraBold': 0.46,
    'Syne ExtraBold': 0.74,
    'Playfair Display Black': 0.6,
    'Cormorant Bold': 0.48,
    'Abril Fatface': 0.6,
    'Great Vibes': 0.44,
    'Caveat Bold': 0.44,
    'Kaushan Script': 0.56,
    'Dancing Script Bold': 0.5,
    Righteous: 0.62,
    'Space Grotesk Bold': 0.62,
  };
  // letra escura? (o contorno vai claro, para ler em fundo escuro, e vice-versa)
  const lumDark = (hex) => (window.CaptionStyles ? window.CaptionStyles.lum(hex) : 1) < 0.4;
  const clean = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?]+$/gu, '');

  window.ClipEditorParts.impacto = function (shared) {
    const { st, v, stage, esc, commit, renderOverlays, toast, api, upload, clip, D, tm } = shared;
    const drawDrawer = (...a) => shared.drawDrawer(...a);
    // largura ÷ altura do vídeo que sai (o formato escolhido, ou o do próprio vídeo)
    const aspect = () => {
      const f = shared.fmtObj && shared.fmtObj();
      return f && f[2] ? f[2] / f[3] : v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    };
    const ui = {
      from: null,
      to: null,
      preset: 'vermelho',
      side: 'esq',
      anim: 'pop',
      card: false,
      cardColor: '#000000',
    };
    ui.busy = false;
    // o que o "Sugerir tudo" monta além do impacto
    ui.withImages = true;
    ui.withSound = true;
    ui.withMusic = true;
    ui.free = false; // liberdade total: o Claude ignora estilos prontos, paletas e o que a equipe já tinha feito
    ui.stage = '';
    if (!Array.isArray(st.fx)) st.fx = [];
    if (!st.look) st.look = 'none';

    /* ----- prévia dos efeitos ----- */
    stage
      .querySelector('video')
      .insertAdjacentHTML(
        'afterend',
        '<div class="imp-fx" aria-hidden="true"><i class="imp-vig"></i><i class="imp-card"></i><i class="imp-flash"></i></div>',
      );
    const layer = $('.imp-fx', stage),
      vig = $('.imp-vig', layer),
      card = $('.imp-card', layer),
      flash = $('.imp-flash', layer);
    shared.playAnim = (el, anim) => {
      const sp = el.querySelector('span');
      if (!sp) return;
      sp.className = '';
      void sp.offsetWidth; // reinicia a animação
      sp.className = 'an-' + anim;
    };
    function applyFx() {
      const t = shared.relT ? shared.relT() : 0;
      const on = (st.fx || []).filter((f) => t >= f.start && t <= f.end);
      const has = (k) => on.find((f) => f.type === k);
      const [lookCss, lookVig] = LOOK_CSS[st.look] || LOOK_CSS.none;
      const filt = [
        st.bw ? 'grayscale(1)' : '',
        lookCss,
        has('bw') ? 'grayscale(1) contrast(1.25)' : '',
        has('blur') ? 'blur(6px)' : '',
        has('dim') ? 'brightness(.68) saturate(.8)' : '',
        has('echo') ? 'contrast(1.08)' : '',
        has('redpop') ? 'grayscale(.85) contrast(1.1)' : '',
        has('glow') ? 'brightness(1.12) contrast(.95) saturate(1.1)' : '',
        has('warm') ? 'sepia(.35) saturate(1.2) brightness(1.05)' : '',
        has('oldfilm') ? 'sepia(.9) contrast(1.1)' : '',
        has('vhs') ? 'saturate(1.4) contrast(1.05)' : '',
        has('pixel') ? 'blur(3px) contrast(1.3)' : '',
      ]
        .filter(Boolean)
        .join(' ');
      v.style.filter = filt;
      vig.style.opacity = has('bw') || lookVig ? (has('bw') ? 1 : 0.6) : 0;
      const z = has('zoom'),
        pu = has('push');
      v.classList.toggle('imp-shake', !!has('shake'));
      v.classList.toggle('imp-glitch', !!has('glitch'));
      v.classList.toggle('imp-echo', !!has('echo'));
      v.classList.toggle('imp-hand', !!has('handheld'));
      v.classList.toggle('imp-pulse', !!has('pulse'));
      v.classList.toggle('imp-glitch', !!has('glitch') || !!has('vhs'));
      const pz = pu ? 1 + 0.15 * clamp((t - pu.start) / Math.max(0.1, pu.end - pu.start), 0, 1) : 1;
      const pl = has('pull');
      const plz = pl ? 1.15 - 0.15 * clamp((t - pl.start) / Math.max(0.1, pl.end - pl.start), 0, 1) : 1;
      // câmera perto (punch-in): 115%, um pouco acima do centro, igual à exportação
      // aproximar do enquadramento (st.zoom): escala em volta do ponto do recorte, a mesma conta da exportação
      const pc = has('punch') ? 1.15 : 1,
        zb = st.zoom > 1 ? st.zoom : 1,
        cr = st.crop || { x: 0.5, y: 0.5 };
      v.style.transformOrigin = zb > 1 ? `${cr.x * 100}% ${cr.y * 100}%` : pc > 1 ? '50% 35%' : '';
      const zz = z ? 1.18 : pu ? pz : pl ? plz : 1;
      v.style.transform = zz * pc * zb !== 1 ? `scale(${(zz * pc * zb).toFixed(4)})` : '';
      const rv = has('reveal');
      if (rv)
        v.style.filter += ` brightness(${clamp((t - rv.start) / Math.max(0.1, rv.end - rv.start), 0, 1).toFixed(2)})`;
      vig.style.opacity = has('oldfilm') ? 1 : vig.style.opacity;
      const c = has('card');
      card.style.opacity = c ? 1 : 0;
      if (c) card.style.background = c.color || '#000';
      const fl = has('flash');
      flash.style.opacity = fl
        ? (0.6 * Math.max(0, 1 - (t - fl.start) / Math.min(0.35, fl.end - fl.start))).toFixed(2)
        : 0;
    }
    shared.applyFx = applyFx;
    let raf = 0;
    const loop = () => {
      shared.applyFx(); // a gaveta Apoio acrescenta as imagens a esta mesma atualização
      raf = v.paused ? 0 : requestAnimationFrame(loop);
    };
    v.addEventListener('play', () => {
      if (!raf) raf = requestAnimationFrame(loop);
    });
    v.addEventListener('seeked', () => shared.applyFx());
    v.addEventListener('timeupdate', () => v.paused && shared.applyFx());

    /* ----- montar palavras de impacto ----- */
    // ws: palavras do corte ({ t, s, e } em segundos desde o início do corte)
    function buildImpact(ws, o = {}) {
      const P = o.P || PRESETS[o.preset] || PRESETS.vermelho;
      // palavras de 1 ou 2 letras vão junto com a seguinte ("eu sei", "de Deus")
      const groups = [];
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i],
          txt = clean(w.t);
        if (!txt) continue;
        const last = groups[groups.length - 1];
        if (last && last.join) {
          last.text += ' ' + txt;
          last.e = w.e;
          last.join = false;
          last.idx.push(i);
        } else
          groups.push({
            text: txt,
            s: w.s,
            e: w.e,
            idx: [i],
            join: txt.replace(/[!?]/g, '').length <= 2 && i < ws.length - 1,
          });
      }
      if (!groups.length) return { overlays: [], fx: [] };
      // as palavras fortes: a mais longa e, se houver, mais uma bem longa (até 2)
      const byLen = groups.map((g, i) => [g.text.replace(/\s/g, '').length, i]).sort((a, b) => b[0] - a[0]);
      let big = new Set([byLen[0][1]]);
      if (byLen[1] && byLen[1][0] >= 6 && groups.length >= 3) big.add(byLen[1][1]);
      // a direção de arte diz quais palavras pesam no sentido (índices dentro de ws)
      if (Array.isArray(o.bigIdx) && o.bigIdx.length) {
        const chosen = groups.map((g, i) => (g.idx.some((k) => o.bigIdx.includes(k)) ? i : -1)).filter((i) => i >= 0);
        if (chosen.length) big = new Set(chosen);
      }
      const bigOrder = [...big].sort((a, b) => a - b);
      // cada parte cabe no quadro: diminui a letra se a palavra for larga demais e afasta da borda
      // disposição pelo formato: no horizontal, o texto fica num terço (o pregador livre); no vertical, acima da
      // área da legenda e longe dos botões da direita; no quadrado, mais ao centro
      const ar = aspect(),
        wide = ar > 1.2,
        sideK = o.card ? 'centro' : o.side || 'esq',
        side = sideK === 'centro' ? 0.5 : sideK === 'dir' ? (wide ? 0.74 : 0.68) : wide ? 0.26 : 0.32,
        maxW = sideK !== 'centro' && wide ? 0.42 : ar < 0.7 ? 0.8 : 0.84;
      const sty = groups.map((g, i) => {
        // a segunda palavra grande ganha a cor de destaque do conceito
        const s0 = big.has(i)
          ? P.accent && bigOrder.indexOf(i) === 1
            ? { ...P.big, color: P.accent }
            : P.big
          : P.small;
        const wFrac = (size) =>
          (g.text.length * size * (FONT_W[s0.font] || 0.62) * (s0.upper ? 1.12 : 1) + (s0.box ? size * 0.5 : 0)) / ar;
        // a palavra grande ocupa a largura (como nos cortes profissionais), entre 60% e 170% do tamanho base;
        // as pequenas só diminuem se não couberem
        const fit = s0.size * ((maxW * (big.has(i) ? 0.94 : 1)) / Math.max(0.01, wFrac(s0.size)));
        const size = big.has(i) ? clamp(fit, s0.size * 0.6, s0.size * 1.7) : Math.min(s0.size, fit);
        const w = wFrac(size);
        const x = clamp(side, 0.07 + w / 2, (ar < 1 ? 0.86 : 0.93) - w / 2); // no vertical, a direita fica livre dos botões
        return { ...s0, size: +size.toFixed(4), x: +(w >= 0.78 && !wide ? 0.5 : x).toFixed(3) };
      });
      const hs = sty.map((s) => s.size * 1.08 + (s.box ? 0.02 : 0));
      const total = hs.reduce((a, b) => a + b, 0);
      const cy = o.card ? 0.5 : (o.cy ?? (ar < 0.7 ? 0.38 : wide ? 0.46 : 0.42));
      let y = clamp(cy - total / 2, o.minY ?? (ar < 0.7 ? 0.13 : 0.08), ar < 0.7 ? 0.62 : 0.72);
      const end = Math.min(D(), groups[groups.length - 1].e + (o.card ? 0.35 : 0.7));
      const grp = rid();
      const overlays = groups.map((g, i) => {
        const s = sty[i];
        const yy = y + hs[i] / 2;
        y += hs[i];
        let color = s.color;
        if (o.card) {
          // cartela escura: palavra grande na cor de destaque, pequenas em branco; cartela clara: texto escuro
          if (dark(o.cardColor)) color = big.has(i) && P.accent ? P.accent : lumDark(color) ? '#ffffff' : color;
          else color = big.has(i) && P.accent && lumDark(P.accent) ? P.accent : '#111111';
        }
        return {
          id: rid(),
          type: 'text',
          text: g.text,
          x: s.x,
          y: +yy.toFixed(3),
          // entra um pouco antes da palavra (0,12 s): a animação termina no instante em que ela é dita
          start: +Math.max(0, g.s - 0.12).toFixed(2),
          end: +end.toFixed(2),
          hidden: false,
          size: s.size,
          color,
          font: s.font,
          bold: false,
          italic: !!s.italic,
          upper: !!s.upper,
          box: s.box ? { ...s.box } : null,
          outline: s.box || o.card ? null : P.outline || { color: lumDark(color) ? '#ffffff' : '#000000', w: 1.5 }, // contorno oposto à cor da letra
          shadow: s.box ? 0 : o.card ? 3 : 5, // sombra suave: separa a letra do fundo
          anim: o.anim || 'pop',
          grp,
        };
      });
      const fx = o.card
        ? [
            {
              id: rid(),
              type: 'card',
              start: overlays[0].start,
              end: overlays[0].end,
              color: o.cardColor || '#000000',
              grp,
            },
          ]
        : [];
      return { overlays, fx, grp };
    }
    shared.buildImpact = buildImpact;
    // Título-gancho no topo (o "hook" dos cortes virais): até 3 linhas, a palavra de destaque sozinha no meio, maior e
    // na cor do conceito ("DEUS NÃO" / "TERMINOU" / "COM VOCÊ"). Fica fora da área de cima que o Instagram cobre.
    function buildHook(h, P, end) {
      const ar = aspect();
      const ws = h.text.split(/\s+/).filter(Boolean);
      const norm = (x) => clean(x).toLowerCase();
      let ai = ws.findIndex((w) => norm(w) === norm(h.accent || ''));
      const lines = [];
      if (ai >= 0) {
        if (ai > 0) lines.push([ws.slice(0, ai).join(' '), false]);
        lines.push([ws[ai], true]);
        if (ai < ws.length - 1) lines.push([ws.slice(ai + 1).join(' '), false]);
      } else {
        const half = Math.ceil(ws.length / 2);
        lines.push([ws.slice(0, half).join(' '), false]);
        if (ws.length > half) lines.push([ws.slice(half).join(' '), false]);
      }
      // condensada e pesada, em maiúsculas: o padrão dos ganchos dos cortes (Anton/Bebas)
      const font = 'Anton',
        accent = (P && P.accent) || '#facc15',
        maxW = ar < 0.7 ? 0.84 : 0.6;
      let y = ar < 0.7 ? 0.1 : 0.07;
      return lines.map(([text, big]) => {
        const s0 = big ? 0.085 : 0.05,
          wf = (sz) => (text.length * sz * (FONT_W[font] || 0.62) * 1.12) / ar,
          size = Math.min(s0, s0 * (maxW / Math.max(0.01, wf(s0))));
        const yy = y + (size * 1.08) / 2;
        y += size * 1.08;
        return {
          id: rid(),
          type: 'text',
          text,
          x: 0.5,
          y: +yy.toFixed(3),
          start: 0,
          end: +end.toFixed(2),
          hidden: false,
          size: +size.toFixed(4),
          color: big ? accent : '#ffffff',
          font,
          bold: false,
          italic: false,
          upper: true,
          box: null,
          outline: { color: '#000000', w: 2 },
          shadow: 5,
          anim: 'fade',
          hook: true,
          ai: true,
        };
      });
    }
    const addImpact = (ws, o) => {
      const r = buildImpact(ws, o);
      if (!r.overlays.length) return 0;
      st.overlays.push(...r.overlays);
      st.fx.push(...r.fx);
      return r.overlays.length;
    };
    const addFx = (type, start, end, color) => {
      st.fx.push({
        id: rid(),
        type,
        start: +clamp(start, 0, D()).toFixed(2),
        end: +clamp(end, 0, D()).toFixed(2),
        color: type === 'card' ? color || '#000000' : undefined,
      });
      st.fx.sort((a, b) => a.start - b.start);
    };
    const groupsList = () => {
      const m = new Map();
      for (const o of st.overlays) if (o.grp) m.set(o.grp, [...(m.get(o.grp) || []), o]);
      return [...m.entries()].map(([grp, os]) => ({
        grp,
        text: os.map((o) => o.text).join(' '),
        start: Math.min(...os.map((o) => o.start ?? 0)),
        card: st.fx.some((f) => f.grp === grp),
      }));
    };
    const delGroup = (grp) => {
      st.overlays = st.overlays.filter((o) => o.grp !== grp);
      st.fx = st.fx.filter((f) => f.grp !== grp);
    };
    const refresh = () => {
      commit();
      renderOverlays();
      shared.applyFx();
      drawDrawer();
    };
    const range = () => {
      const ws = shared.relWords ? shared.relWords() : [];
      if (ui.from === null) return { ws, sel: [] };
      const a = ui.from,
        b = ui.to === null ? ui.from : ui.to;
      return { ws, sel: ws.slice(Math.min(a, b), Math.max(a, b) + 1) };
    };

    // Enquadramento automático: com o rosto que a IA viu nos quadros, aproxima a câmera (rosto com ~17% da altura no
    // vertical) e põe o rosto no terço de cima. Devolve onde o rosto fica no quadro final.
    function autoFrame(fr) {
      const iw = v.videoWidth,
        ih = v.videoHeight,
        ar = aspect();
      if (!fr || !iw || !ih || st.format === 'orig') return null;
      const A = iw / ih,
        bw = A > ar ? ih * ar : iw,
        bh = A > ar ? ih : iw / ar;
      const z0 = st.zoom > 1 ? st.zoom : 1,
        cr = st.crop || { x: 0.5, y: 0.5 };
      const cw = bw / z0,
        ch = bh / z0,
        fx = (iw - cw) * cr.x + fr.x * cw,
        fy = (ih - ch) * cr.y + fr.y * ch,
        fh = fr.h * ch;
      const target = ar < 0.7 ? 0.17 : ar < 1.1 ? 0.22 : 0.3;
      let z = clamp(bh / (fh / target), 1, ar < 0.7 ? 1.45 : 1.3);
      if (z < 1.06) z = 1;
      const cw2 = bw / z,
        ch2 = bh / z,
        ty = ar < 0.7 ? 0.34 : 0.4;
      const cx = iw - cw2 > 1 ? clamp((fx - 0.5 * cw2) / (iw - cw2), 0, 1) : 0.5,
        cy = ih - ch2 > 1 ? clamp((fy - ty * ch2) / (ih - ch2), 0, 1) : 0.5;
      st.zoom = +z.toFixed(3);
      st.crop = { x: +cx.toFixed(3), y: +cy.toFixed(3) };
      return { y: (fy - (ih - ch2) * cy) / ch2, h: fh / ch2 };
    }

    /* ----- Claude: sugere a edição inteira lendo a fala ----- */
    async function suggest() {
      if (ui.busy) return;
      const ws = shared.relWords ? shared.relWords() : [];
      if (ws.length < 4) return toast('Este corte não tem fala suficiente na transcrição para a IA sugerir.');
      ui.busy = true;
      drawDrawer();
      try {
        ui.stage = 'O Claude está olhando o vídeo e desenhando…';
        drawDrawer();
        const r = await api(`/uploads/${upload.id}/clips/${clip.id}/ai/design`, {
          json: {
            words: ws.map((w) => w.t),
            times: ws.map((w) => [+w.s.toFixed(2), +w.e.toFixed(2)]),
            format: st.format,
            start: st.start,
            end: st.end,
            crop: st.crop,
            free: !!ui.free,
          },
        });
        // a legenda do corte inteiro, desenhada para este vídeo
        if (r.caption) {
          const c = r.caption;
          // liberdade total: a legenda inteira como a IA desenhou (sobre a "Clássica", mudando tudo)
          if (c.free) {
            const { free, pos, kwWords, ...props } = c;
            st.cap = { on: true, ...props, pos, margin: st.cap.margin ?? null, kwWords, kw: true };
          } else
            // estilo pronto palavra por palavra, com as cores do conceito e as palavras-chave da fala
            st.cap = {
              on: true,
              style: c.style,
              size: c.size,
              pos: c.pos,
              margin: st.cap.margin ?? null,
              color: c.color,
              outline: c.outline,
              ow: c.ow,
              box: c.box,
              hi: c.hi,
              kw: c.kwWords.length > 0,
              kc: c.kc,
              kwWords: c.kwWords,
              words: null,
            };
          st.styleChosen = true;
          shared.wordsDirty = true;
        }
        // tipografia das frases de impacto, criada para o corte (tamanho base: o do estilo "Revista")
        const DP = r.impact
          ? {
              big: { ...r.impact.big, size: 0.11 },
              small: { ...r.impact.small, size: 0.05 },
              accent: r.impact.accent,
              outline: r.impact.outline || null, // o fundo do meio do quadro é claro: contorno para ler
            }
          : null;
        // tira o que a IA tinha posto antes, para não empilhar sugestões (na liberdade total, tira também o que a
        // equipe tinha feito à mão: impacto, gancho, efeitos e cor)
        for (const g of groupsList()) if (ui.free || st.overlays.find((o) => o.grp === g.grp && o.ai)) delGroup(g.grp);
        st.overlays = st.overlays.filter((o) => !(o.hook && (o.ai || ui.free)));
        st.fx = st.fx.filter((f) => !f.ai && !ui.free);
        // enquadramento pelo rosto e a altura das frases de impacto: abaixo do rosto (no peito, acima da legenda) ou,
        // se o rosto estiver embaixo, acima dele
        const face = autoFrame(r.framing) || (r.framing ? { y: r.framing.y, h: r.framing.h } : null);
        let impactY;
        if (face && aspect() < 1.1) {
          const headB = face.y + face.h * 0.62,
            headT = face.y - face.h * 0.62;
          impactY = headB < 0.62 ? (headB + 0.74) / 2 : Math.max(0.28, headT / 2 + 0.12);
        }
        if (shared.drawLeft) shared.drawLeft();
        if (shared.layoutStage) shared.layoutStage();
        // título-gancho no topo
        const hookAlways = !!(r.hook && r.hook.show === 'always');
        if (r.hook && r.hook.text && !st.overlays.some((o) => o.hook))
          st.overlays.push(...buildHook(r.hook, DP, hookAlways ? D() : Math.min(D(), 4)));
        // câmera dinâmica: corta para mais perto e volta a cada frase (como duas câmeras)
        for (const [a, b] of r.punch || []) {
          if (b > D() + 0.05) continue;
          st.fx.push({ id: rid(), type: 'punch', start: a, end: Math.min(b, D()), ai: true, cam: true });
        }
        let nP = 0,
          nC = 0;
        // o que a pessoa fez à mão fica: sugestão que cairia em cima disso é pulada
        const mine = st.overlays.filter((o) => o.grp && !o.ai);
        const busyAt = (a, b) => mine.some((o) => (o.start ?? 0) < b && (o.end ?? D()) > a);
        for (const p of r.phrases || []) {
          const sel = ws.slice(p.from, p.to + 1);
          if (!sel.length || busyAt(sel[0].s, sel[sel.length - 1].e + 0.7)) continue;
          const n = addImpact(sel, {
            P: DP,
            minY: hookAlways && aspect() < 0.7 ? 0.3 : undefined, // abaixo do título-gancho
            cy: impactY,
            preset: PRESETS[p.style] ? p.style : ui.preset,
            bigIdx: (p.big || []).map((k) => k - p.from),
            side: r.impact ? r.impact.side : p.side || ui.side,
            anim: r.impact ? r.impact.anim : p.anim || ui.anim,
            card: !!p.card,
            cardColor: p.cardColor || '#000000',
          });
          if (!n) continue;
          st.overlays.slice(-n).forEach((o) => (o.ai = true));
          st.fx.filter((f) => f.grp === st.overlays[st.overlays.length - 1].grp).forEach((f) => (f.ai = true));
          if (p.card) nC++;
          else nP++;
        }
        let nF = 0;
        for (const f of r.fx || []) {
          const a = ws[f.from],
            b = ws[f.to] || a;
          if (!a || !FX[f.type] || f.type === 'card') continue;
          const s0 = f.type === 'flash' || f.type === 'shake' ? a.s : a.s - 0.05;
          const e0 = f.type === 'flash' ? a.s + 0.3 : f.type === 'shake' ? Math.min(b.e, a.s + 0.8) : b.e + 0.15;
          addFx(f.type, s0, e0);
          st.fx[st.fx.length - 1].ai = true;
          nF++;
        }
        if (r.look && LOOK_CSS[r.look]) st.look = r.look;
        st.fx.sort((a, b) => a.start - b.start);
        refresh();
        shared.paintCap(); // a legenda nova já aparece na prévia
        if (shared.refreshBar) shared.refreshBar();
        if (r.note)
          ui.note =
            (r.concept ? r.concept + ' — ' : '') +
            r.note +
            (r.legibility && r.legibility.fixes.length ? ' Leitura: ' + r.legibility.fixes.join('; ') + '.' : '');
        // o resto da edição, conforme as opções: imagens de apoio, efeitos sonoros e música
        const done = [
          `${nP} frase${nP === 1 ? '' : 's'} de impacto`,
          `${nC} cartela${nC === 1 ? '' : 's'}`,
          `${nF} efeito${nF === 1 ? '' : 's'}`,
        ];
        const ctx = shared.ctx || {};
        if (ui.withImages && ctx.broll && shared.apoioAuto) {
          ui.stage = 'Escolhendo as imagens de apoio…';
          drawDrawer();
          // as imagens seguem o conceito e não caem em cima das frases de impacto nem das cartelas
          const avoid = groupsList().map((g) => {
            const os = st.overlays.filter((o) => o.grp === g.grp);
            return [Math.min(...os.map((o) => o.start ?? 0)), Math.max(...os.map((o) => o.end ?? 0))];
          });
          const n = await shared.apoioAuto({ concept: r.concept, avoid }).catch((e) => (toast(e.message), 0));
          done.push(`${n} imagem${n === 1 ? '' : 'ns'} de apoio`);
        }
        if (ui.withSound && shared.somAuto) {
          const n = shared.somAuto(true);
          done.push(`${n} som${n === 1 ? '' : 's'}`);
        }
        if (ui.withMusic && ctx.musicSearch && shared.somMusicAuto) {
          ui.stage = 'Escolhendo a música…';
          drawDrawer();
          const m = await shared.somMusicAuto().catch((e) => (toast(e.message), null));
          if (m) done.push(`música “${m}”`);
        }
        ui.stage = '';
        shared.applyFx();
        toast(`O Claude montou: ${done.join(', ')}. Dê o play para ver; Ctrl+Z desfaz.`);
      } catch (e) {
        toast(e.message);
      }
      ui.busy = false;
      drawDrawer();
    }

    /* ----- a gaveta ----- */
    const chips = (list, cur, attr) =>
      `<div class="dlx-chips">${list.map(([k, l]) => `<button data-${attr}="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
    function html() {
      const { ws, sel } = range();
      const a = ui.from === null ? -1 : Math.min(ui.from, ui.to ?? ui.from),
        b = ui.from === null ? -1 : Math.max(ui.from, ui.to ?? ui.from);
      const gs = groupsList();
      const fxs = st.fx.filter((f) => !f.grp && !f.cam);
      const cams = st.fx.filter((f) => f.cam);
      const ctx = shared.ctx || {},
        ai = ctx.ai;
      const yn = (key, label, on, can = true) =>
        can
          ? `<div class="imp-opt"><span>${label}</span><div class="dlx-chips"><button data-opt="${key}:1" aria-pressed="${on}">Com</button><button data-opt="${key}:0" aria-pressed="${!on}">Sem</button></div></div>`
          : '';
      return `<h3>Impacto</h3><p class="dlx-sub" style="margin-top:0">As palavras fortes entram grandes no tempo da fala, com cartelas, efeitos e a cor do vídeo. A prévia mostra; o "Baixar corte" sai igual.</p>
        ${
          ai
            ? `<div class="imp-all">${yn('withImages', 'Imagens de apoio', ui.withImages, ctx.broll)}${yn('withSound', 'Efeitos sonoros', ui.withSound)}${yn('withMusic', 'Música de fundo', ui.withMusic, ctx.musicSearch)}${yn('free', 'Liberdade total (ignora estilos e pré-ajustes)', ui.free)}
              <button class="ap-btn pri imp-ai" id="imp-ai" ${ui.busy ? 'disabled' : ''}>${ui.busy ? esc(ui.stage || 'O Claude está montando…') : '✨ Direção de arte com o Claude'}</button></div>
              <p class="dlx-sub">O Claude olha o vídeo, cria um conceito e desenha o corte inteiro: a legenda de todas as falas, as frases de impacto com fontes e cores próprias, cartelas, efeitos, cor${ctx.broll ? ', imagens' : ''}, sons${ctx.musicSearch ? ' e música' : ''}. Depois é só ajustar.</p>${ui.note ? `<p class="imp-note">${esc(ui.note)}</p>` : ''}`
            : ''
        }
        <div class="dlx-row" style="margin-top:6px"><div><b>Esconder a legenda no impacto</b><small>Enquanto a frase de impacto ou a cartela está na tela, a legenda some (não repete a frase)</small></div>${shared.sw('imp-caphide', st.capHideImp !== false)}</div>
        <h4>Palavras de impacto</h4>
        <p class="dlx-sub" style="margin-top:0">Toque na primeira e na última palavra da frase.</p>
        <div class="imp-ws" id="imp-ws">${ws.length ? ws.map((w, i) => `<button data-w="${i}" class="${i >= a && i <= b ? 'on' : ''}" title="${tm(w.s)}">${esc(w.t)}</button>`).join('') : '<p class="dlx-sub">Carregando as palavras…</p>'}</div>
        ${
          sel.length
            ? `<p class="imp-sel">“${esc(sel.map((w) => w.t).join(' '))}” · ${tm(sel[0].s)}${sel.length > 8 ? ' <b>· frase longa: o impacto funciona melhor com até 8 palavras</b>' : ''}</p>`
            : ''
        }
        <label>Estilo</label>${chips(
          Object.entries(PRESETS).map(([k, p]) => [k, p.label]),
          ui.preset,
          'pr',
        )}
        <label>Lado</label>${chips(
          SIDES.map(([k, l]) => [k, l]),
          ui.side,
          'side',
        )}
        <label>Entrada</label>${chips(ANIMS, ui.anim, 'an')}
        <div class="dlx-row" style="margin-top:10px"><div><b>Em cartela</b><small>Tela cheia numa cor, com a frase no meio</small></div>${shared.sw('imp-card', ui.card)}</div>
        ${ui.card ? `<div class="imp-colors">${CARD_COLORS.map((c) => `<button data-cc="${c}" aria-pressed="${ui.cardColor === c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>` : ''}
        <button class="ap-btn pri" id="imp-add" style="width:100%;justify-content:center;margin-top:10px" ${sel.length ? '' : 'disabled'}>Criar impacto</button>
        ${
          gs.length
            ? `<div class="dlx-layers" style="margin-top:12px">${gs
                .sort((x, y) => x.start - y.start)
                .map(
                  (g) =>
                    `<div class="lr"><button class="nm" data-go="${g.start}">${g.card ? '▣' : '⚡'} <span>${tm(g.start)} · ${esc(g.text.slice(0, 34))}</span></button><button data-rmg="${g.grp}" aria-label="Excluir">✕</button></div>`,
                )
                .join(
                  '',
                )}</div><p class="dlx-sub">Cada palavra também aparece em Texto e Camadas, para mudar tamanho, cor e lugar.</p>`
            : ''
        }
        <h4>Efeitos no trecho</h4>
        <p class="dlx-sub" style="margin-top:0">Entram no ponto do vídeo onde você está${sel.length ? ' — ou, com palavras marcadas acima, no tempo delas' : ''}.</p>
        ${FX_GROUPS.map(
          ([g, ks]) =>
            `<div class="imp-fxg"><span>${g}</span><div class="dlx-chips">${ks.map((k) => `<button data-fx="${k}" title="${FX[k].tip}">+ ${FX[k].label}</button>`).join('')}</div></div>`,
        ).join('')}
        ${
          fxs.length
            ? `<div class="imp-fxl">${fxs
                .map(
                  (f) =>
                    `<div class="imp-fxr"><button class="nm" data-go="${f.start}">${FX[f.type].label}</button><input type="number" step="0.1" min="0" data-fs="${f.id}" value="${f.start.toFixed(1)}" aria-label="Início (s)"><span>→</span><input type="number" step="0.1" min="0" data-fe="${f.id}" value="${f.end.toFixed(1)}" aria-label="Fim (s)"><button data-rmf="${f.id}" aria-label="Excluir">✕</button></div>`,
                )
                .join('')}</div>`
            : ''
        }
        ${cams.length ? `<div class="imp-fxr"><span class="nm">🎥 Câmera dinâmica: ${cams.length} corte${cams.length === 1 ? '' : 's'} para perto</span><button data-rmcam="1" aria-label="Tirar a câmera dinâmica">✕</button></div>` : ''}
        <h4>Cor do vídeo</h4>${chips(LOOKS, st.look || 'none', 'look')}`;
    }
    function bind(dr) {
      const on = (sel, fn) => $$(sel, dr).forEach((b) => b.addEventListener('click', () => fn(b)));
      const ai = $('#imp-ai', dr);
      if (ai) ai.onclick = suggest;
      on('[data-rmcam]', () => {
        st.fx = st.fx.filter((f) => !f.cam);
        refresh();
      });
      on('[data-opt]', (b) => {
        const [k, val] = b.dataset.opt.split(':');
        ui[k] = val === '1';
        drawDrawer();
      });
      const ch = $('#imp-caphide', dr);
      if (ch)
        ch.addEventListener('click', () => {
          st.capHideImp = st.capHideImp === false;
          commit();
          shared.paintCap();
          drawDrawer();
        });
      on('[data-w]', (b) => {
        const i = +b.dataset.w;
        if (ui.from === null || ui.to !== null) {
          ui.from = i;
          ui.to = null;
        } else ui.to = i;
        const ws = shared.relWords();
        if (ws[i]) v.currentTime = st.start + ws[i].s;
        drawDrawer();
      });
      on('[data-pr]', (b) => ((ui.preset = b.dataset.pr), drawDrawer()));
      on('[data-side]', (b) => ((ui.side = b.dataset.side), drawDrawer()));
      on('[data-an]', (b) => ((ui.anim = b.dataset.an), drawDrawer()));
      on('[data-cc]', (b) => ((ui.cardColor = b.dataset.cc), drawDrawer()));
      const cs = $('#imp-card', dr);
      if (cs)
        cs.addEventListener('click', () => {
          ui.card = !ui.card;
          drawDrawer();
        });
      const add = $('#imp-add', dr);
      if (add)
        add.onclick = () => {
          const { sel } = range();
          if (!sel.length) return;
          const n = addImpact(sel, ui);
          ui.from = ui.to = null;
          refresh();
          v.currentTime = st.start + Math.max(0, sel[0].s - 0.5);
          toast(`Impacto criado com ${n} parte${n === 1 ? '' : 's'}. Dê o play para ver.`);
        };
      on('[data-rmg]', (b) => {
        delGroup(b.dataset.rmg);
        refresh();
      });
      on('[data-go]', (b) => {
        v.currentTime = st.start + Math.max(0, +b.dataset.go - 0.3);
        shared.applyFx();
      });
      on('[data-fx]', (b) => {
        const k = b.dataset.fx,
          { sel } = range();
        const t0 = sel.length ? sel[0].s : shared.relT();
        const t1 = sel.length && k !== 'flash' ? sel[sel.length - 1].e + 0.1 : t0 + FX[k].dur;
        addFx(k, t0, t1);
        refresh();
        toast(`${FX[k].label} em ${tm(t0)}. Ajuste o início e o fim na lista.`);
      });
      on('[data-rmf]', (b) => {
        st.fx = st.fx.filter((f) => f.id !== b.dataset.rmf);
        refresh();
      });
      const setT = (attr, key) =>
        $$(`[${attr}]`, dr).forEach((inp) =>
          inp.addEventListener('change', () => {
            const f = st.fx.find((x) => x.id === inp.getAttribute(attr));
            if (!f) return;
            f[key] = +clamp(+inp.value || 0, 0, D()).toFixed(2);
            if (f.end <= f.start) f.end = +(f.start + 0.2).toFixed(2);
            refresh();
          }),
        );
      setT('data-fs', 'start');
      setT('data-fe', 'end');
      on('[data-look]', (b) => {
        st.look = b.dataset.look;
        refresh();
      });
    }
    shared.panels = { ...(shared.panels || {}), impacto: { html, bind } };
    applyFx();
  };
})();
