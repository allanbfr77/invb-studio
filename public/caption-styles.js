/* Estilos de legenda, usados igual pela prévia (navegador) e pela exportação (ffmpeg, em lib/render.js).
   Um estilo é só um conjunto de propriedades (fonte, cores, contorno, fundo, destaque...). A pessoa parte de um
   estilo pronto, muda o que quiser em "Personalizar" e pode salvar como estilo seu (lib/routes.js, /api/caption-styles).

   Como a palavra falada aparece (mode):
     block      frase inteira, sem destaque
     plain      grupo de palavras, sem destaque
     highlight  grupo de palavras, a falada em outra cor
     boxhl      grupo de palavras, a falada com uma marca atrás
     karaoke    grupo de palavras, preenchendo de cor enquanto é falada
     words1     uma palavra por vez */
(function (root) {
  /* ----- fontes: os arquivos ficam em public/fonts e vão junto para o ffmpeg, então a prévia e o vídeo usam a mesma ----- */
  const FONT_LIST = [
    { name: 'Poppins ExtraBold', file: 'Poppins-ExtraBold.ttf', note: 'moderna, forte' },
    { name: 'Poppins SemiBold', file: 'Poppins-SemiBold.ttf', note: 'moderna, leve' },
    { name: 'Montserrat ExtraBold', file: 'Montserrat-ExtraBold.ttf', note: 'a da identidade da igreja' },
    { name: 'Anton', file: 'Anton-Regular.ttf', note: 'estreita, de impacto' },
    { name: 'Bebas Neue', file: 'BebasNeue-Regular.ttf', note: 'títulos, só maiúsculas' },
    { name: 'Archivo Black', file: 'ArchivoBlack-Regular.ttf', note: 'larga, pesada' },
    {
      name: 'DM Serif Display',
      file: 'DMSerifDisplay-Regular.ttf',
      italic: 'DMSerifDisplay-Italic.ttf',
      note: 'elegante, para versículos',
    },
    { name: 'Permanent Marker', file: 'PermanentMarker-Regular.ttf', note: 'escrita à mão' },
  ];
  const FONTS = FONT_LIST.map((f) => f.name);
  const DEFAULT_FONT = 'Poppins ExtraBold';
  /** Fonte conhecida, ou a padrão (estilos e textos antigos usavam Arial, DejaVu e Liberation). */
  const cleanFont = (f) => (FONTS.includes(f) ? f : DEFAULT_FONT);

  const MODES = [
    ['block', 'Frase inteira'],
    ['plain', 'Grupo de palavras'],
    ['highlight', 'Palavra falada colorida'],
    ['boxhl', 'Palavra falada com marca'],
    ['karaoke', 'Karaokê'],
    ['words1', 'Uma palavra por vez'],
  ];
  const MODE_IDS = MODES.map((m) => m[0]);

  /* ----- cores sugeridas: dourado da igreja, neutros e algumas de destaque ----- */
  const PAL = [
    '#ffffff',
    '#000000',
    '#f0b93a',
    '#f6d27a',
    '#231c47',
    '#22c55e',
    '#38bdf8',
    '#e11d48',
    '#a855f7',
    '#ff8a1f',
  ];

  /* ----- o que todo estilo tem ----- */
  const BASE = {
    font: DEFAULT_FONT,
    scale: 1, // multiplica o tamanho escolhido no painel (Personalizar > Tamanho)
    upper: false,
    italic: false,
    color: '#ffffff', // cor do texto
    hi: '#f0b93a', // cor da palavra falada
    outline: '#000000', // cor do contorno
    ow: 3, // grossura do contorno
    shadow: 0,
    box: null, // fundo atrás do texto: { color, alpha } (alpha = transparência, de 0 a 1)
    glow: false, // brilho na cor do destaque
    pop: false, // a legenda "pula" ao entrar
    mode: 'plain',
    chunk: 4, // palavras de cada vez
  };
  // Propriedades que a pessoa pode mudar em "Personalizar" (e que vão para os estilos salvos).
  const KEYS = Object.keys(BASE);

  /* ----- estilos prontos ----- */
  const DEF = [
    ['Essenciais', 'Clássica', {}],
    ['Essenciais', 'Frase inteira', { font: 'Poppins SemiBold', mode: 'block', ow: 2, shadow: 2 }],
    ['Essenciais', 'Limpa', { font: 'Poppins SemiBold', ow: 0, shadow: 3, chunk: 5 }],
    ['Destaque', 'Destaque dourado', { upper: true, mode: 'highlight', chunk: 3, ow: 4 }],
    ['Destaque', 'Destaque verde', { upper: true, mode: 'highlight', chunk: 3, ow: 4, hi: '#22c55e' }],
    ['Destaque', 'Marca-texto', { mode: 'boxhl', chunk: 3, hi: '#231c47', ow: 3 }],
    ['Destaque', 'Karaokê', { font: 'Montserrat ExtraBold', upper: true, mode: 'karaoke', chunk: 3, ow: 4 }],
    [
      'Com fundo',
      'Faixa escura',
      { font: 'Poppins SemiBold', box: { color: '#000000', alpha: 0.35 }, ow: 0, chunk: 5 },
    ],
    [
      'Com fundo',
      'Faixa clara',
      { font: 'Poppins SemiBold', color: '#111111', box: { color: '#ffffff', alpha: 0.08 }, ow: 0, chunk: 5 },
    ],
    [
      'Com fundo',
      'Etiqueta dourada',
      {
        font: 'Montserrat ExtraBold',
        upper: true,
        color: '#111111',
        box: { color: '#f0b93a', alpha: 0 },
        ow: 0,
        chunk: 3,
      },
    ],
    ['Impacto', 'Impacto', { font: 'Anton', upper: true, scale: 1.3, mode: 'highlight', chunk: 2, ow: 5 }],
    ['Impacto', 'Uma palavra', { font: 'Anton', upper: true, scale: 1.5, mode: 'words1', ow: 5, pop: true }],
    ['Impacto', 'Título', { font: 'Bebas Neue', scale: 1.4, chunk: 3, ow: 3 }],
    ['Impacto', 'Pesada', { font: 'Archivo Black', upper: true, mode: 'highlight', chunk: 3, ow: 4 }],
    ['Elegante', 'Versículo', { font: 'DM Serif Display', scale: 1.1, mode: 'block', ow: 0, shadow: 3 }],
    [
      'Elegante',
      'Versículo itálico',
      { font: 'DM Serif Display', italic: true, scale: 1.1, mode: 'block', ow: 0, shadow: 3 },
    ],
    [
      'Elegante',
      'Marca da igreja',
      { font: 'Montserrat ExtraBold', upper: true, mode: 'highlight', chunk: 3, ow: 0, shadow: 3, glow: true },
    ],
    ['Elegante', 'Manuscrito', { font: 'Permanent Marker', chunk: 3, ow: 2 }],
  ];
  const STYLES = DEF.map(([cat, name, o]) => ({ ...BASE, ...o, id: `${cat}/${name}`, name, cat }));
  const CATEGORIES = [...new Set(DEF.map((d) => d[0]))].map((id) => ({
    id,
    count: DEF.filter((d) => d[0] === id).length,
  }));
  const DEFAULT_ID = 'Essenciais/Clássica';
  // Estilos do catálogo antigo que estavam em uso: o padrão de antes era a frase inteira.
  const LEGACY = { 'Clássicos/Clássica': 'Essenciais/Frase inteira' };
  const byName = (n) =>
    STYLES.find((s) => s.id === n) ||
    STYLES.find((s) => s.id === LEGACY[n]) ||
    STYLES.find((s) => s.name === n) ||
    STYLES.find((s) => s.id === DEFAULT_ID);

  /* ----- conferência das propriedades (vale para o que vem da tela, dos estilos salvos e das edições antigas) ----- */
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const num = (v, a, b) =>
    v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : Math.min(b, Math.max(a, +v));
  /** Só as propriedades válidas de um estilo (o que não vier, ou vier errado, fica de fora). */
  function cleanProps(o) {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    if (typeof o.font === 'string') out.font = cleanFont(o.font);
    for (const [k, a, b] of [
      ['scale', 0.5, 2.5],
      ['ow', 0, 10],
      ['shadow', 0, 8],
      ['chunk', 1, 10],
    ]) {
      const v = num(o[k], a, b);
      if (v !== null) out[k] = k === 'chunk' ? Math.round(v) : v;
    }
    for (const k of ['upper', 'italic', 'glow', 'pop']) if (typeof o[k] === 'boolean') out[k] = o[k];
    for (const k of ['color', 'hi', 'outline']) if (isHex(o[k])) out[k] = o[k].toLowerCase();
    if (o.box === false) out.box = false;
    else if (o.box && isHex(o.box.color))
      out.box = { color: o.box.color.toLowerCase(), alpha: num(o.box.alpha, 0, 0.95) || 0 };
    if (MODE_IDS.includes(o.mode)) out.mode = o.mode;
    else if (o.mode === 'words2') out.mode = 'highlight'; // do catálogo antigo
    return out;
  }

  /**
   * O estilo que vale para um corte: o estilo escolhido com as mudanças feitas por cima.
   * `cap` é o que o editor guarda: { style, ...propriedades mudadas, words }. `words` (palavras de cada vez) vem do
   * controle antigo e vale como `chunk`.
   */
  function resolve(cap) {
    cap = cap || {};
    const s = byName(cap.style),
      over = cleanProps(cap);
    // `null` nas propriedades quer dizer "a do estilo" (é como o editor guardava antes)
    const out = { ...s, ...over };
    if (over.box === false) out.box = null;
    const w = num(cap.words, 1, 10);
    if (w !== null) {
      out.chunk = Math.round(w);
      if (out.mode === 'block') out.mode = 'plain'; // frase inteira não tem número de palavras
    }
    out.font = cleanFont(out.font);
    if (out.mode === 'words1') out.chunk = 1;
    return out;
  }
  /** Só o que difere do estilo base: é o que o editor guarda e o que vai para um estilo salvo. */
  function diff(full, baseId) {
    const b = byName(baseId),
      out = {};
    for (const k of KEYS) {
      const x = full[k],
        y = b[k];
      if (JSON.stringify(x === undefined ? null : x) !== JSON.stringify(y === undefined ? null : y))
        out[k] = x === null && k === 'box' ? false : x;
    }
    return out;
  }

  /** A legenda de um corte a partir de um estilo salvo pela pessoa (o que /api/caption-styles devolve). */
  const fromSaved = (it, on = true) => ({
    on,
    style: byName(it.base).id,
    ...cleanProps(it.props),
    size: it.size || 16,
    pos: it.pos || 'bottom',
    margin: it.margin === undefined ? null : it.margin,
    words: null,
    mine: it.id, // para o painel saber qual dos estilos salvos está em uso
  });

  /** Divide as palavras em legendas (grupos), respeitando pausas longas e a troca de fala. */
  function chunkWords(words, style) {
    const max = style.mode === 'words1' ? 1 : Math.max(1, style.chunk || 4);
    const maxChars = Math.max(26, max * 11);
    const out = [];
    let cur = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const brk =
        cur.length &&
        (cur.length >= max ||
          (prev && (w.s - prev.e > 0.9 || w.seg !== prev.seg)) ||
          cur.reduce((a, x) => a + x.t.length + 1, 0) + w.t.length > maxChars);
      if (brk) {
        out.push(cur);
        cur = [];
      }
      cur.push(w);
    });
    if (cur.length) out.push(cur);
    return out;
  }
  /** Compatibilidade: estilo com um número de palavras por legenda. */
  const withWords = (style, n) => {
    const w = num(n, 1, 10);
    return w === null ? style : { ...style, chunk: Math.round(w), mode: style.mode === 'block' ? 'plain' : style.mode };
  };

  const api = {
    STYLES,
    CATEGORIES,
    DEFAULT_ID,
    byName,
    resolve,
    diff,
    fromSaved,
    cleanProps,
    chunkWords,
    withWords,
    FONTS,
    FONT_LIST,
    DEFAULT_FONT,
    cleanFont,
    MODES,
    KEYS,
    PAL,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CaptionStyles = api;
})(typeof window !== 'undefined' ? window : globalThis);
