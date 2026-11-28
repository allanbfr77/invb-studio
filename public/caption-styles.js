/* Estilos de legenda, usados igual pela prévia (navegador) e pela exportação (ffmpeg, em lib/render.js).
   Um estilo é só um conjunto de propriedades (fonte, cores, contorno, fundo, destaque...). A pessoa parte de um
   estilo pronto, muda o que quiser em "Personalizar" e pode salvar como estilo seu (lib/routes.js, /api/caption-styles).

   Como a palavra falada aparece (mode):
     block      frase inteira, sem destaque
     plain      grupo de palavras, sem destaque
     highlight  grupo de palavras, a falada em outra cor
     boxhl      grupo de palavras, a falada com uma marca atrás
     karaoke    grupo de palavras, preenchendo de cor enquanto é falada
     words1     uma palavra por vez
     reveal     palavra por palavra, acumulando na frase */
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
    { name: 'Oswald Bold', file: 'Oswald-Bold.ttf', note: 'condensada, forte' },
    { name: 'Montserrat Black', file: 'Montserrat-Black.ttf', note: 'a mais pesada da Montserrat' },
    { name: 'League Spartan Black', file: 'LeagueSpartan-Black.ttf', note: 'geométrica, de cartaz' },
    { name: 'Inter Black', file: 'Inter-Black.ttf', note: 'limpa, moderna' },
    { name: 'Barlow Condensed ExtraBold', file: 'BarlowCondensed-ExtraBold.ttf', note: 'estreita, para frases longas' },
    { name: 'Syne ExtraBold', file: 'Syne-ExtraBold.ttf', note: 'editorial, ousada' },
    {
      name: 'Playfair Display Black',
      file: 'PlayfairDisplay-Black.ttf',
      italic: 'PlayfairDisplay-BoldItalic.ttf',
      note: 'serifa de revista',
    },
    {
      name: 'Cormorant Bold',
      file: 'CormorantGaramond-Bold.ttf',
      italic: 'CormorantGaramond-BoldItalic.ttf',
      note: 'serifa clássica, delicada',
    },
    { name: 'Abril Fatface', file: 'AbrilFatface-Regular.ttf', note: 'serifa grossa, de título' },
    { name: 'Great Vibes', file: 'GreatVibes-Regular.ttf', note: 'caligrafia elegante' },
    { name: 'Caveat Bold', file: 'Caveat-Bold.ttf', note: 'escrita à mão, natural' },
    { name: 'Kaushan Script', file: 'KaushanScript-Regular.ttf', note: 'pincel, com energia' },
    { name: 'Dancing Script Bold', file: 'DancingScript-Bold.ttf', note: 'cursiva, alegre' },
    { name: 'Righteous', file: 'Righteous-Regular.ttf', note: 'arredondada, retrô' },
    { name: 'Space Grotesk Bold', file: 'SpaceGrotesk-Bold.ttf', note: 'técnica, moderna' },
    // segunda leva: serifas de revista, condensadas de cartaz e caligrafias, para combinar em pares
    {
      name: 'Fraunces Black',
      file: 'Fraunces-Black.ttf',
      italic: 'Fraunces-BlackItalic.ttf',
      note: 'serifa display gorda e suave, ótima em itálico',
    },
    { name: 'Bodoni Moda Black', file: 'BodoniModa-Black.ttf', note: 'serifa de moda, alto contraste' },
    { name: 'Cinzel ExtraBold', file: 'Cinzel-ExtraBold.ttf', note: 'maiúsculas romanas, clássica, bíblica' },
    { name: 'Teko SemiBold', file: 'Teko-SemiBold.ttf', note: 'condensada técnica, esportiva' },
    { name: 'Big Shoulders Black', file: 'BigShoulders-Black.ttf', note: 'condensada de cartaz, urbana' },
    { name: 'Unbounded ExtraBold', file: 'Unbounded-ExtraBold.ttf', note: 'larga e arredondada, jovem' },
    { name: 'Bricolage ExtraBold', file: 'Bricolage-ExtraBold.ttf', note: 'grotesca com personalidade' },
    {
      name: 'Libre Baskerville Bold',
      file: 'LibreBaskerville-Bold.ttf',
      italic: 'LibreBaskerville-BoldItalic.ttf',
      note: 'serifa de livro, versículo',
    },
    {
      name: 'Instrument Serif',
      file: 'InstrumentSerif-Regular.ttf',
      italic: 'InstrumentSerif-Italic.ttf',
      note: 'serifa fina editorial, linda em itálico',
    },
    { name: 'Yeseva One', file: 'YesevaOne-Regular.ttf', note: 'serifa display feminina, elegante' },
    { name: 'Alfa Slab One', file: 'AlfaSlabOne-Regular.ttf', note: 'serifa quadrada pesada, impacto' },
    { name: 'Allura', file: 'Allura-Regular.ttf', note: 'caligrafia fina' },
    { name: 'Pinyon Script', file: 'PinyonScript-Regular.ttf', note: 'caligrafia formal, convite' },
    { name: 'Sacramento', file: 'Sacramento-Regular.ttf', note: 'caligrafia leve, monolinha' },
    { name: 'Lobster', file: 'Lobster-Regular.ttf', note: 'letreiro retrô em negrito' },
    { name: 'Marcellus', file: 'Marcellus-Regular.ttf', note: 'romana leve, solene' },
    { name: 'Prata', file: 'Prata-Regular.ttf', note: 'serifa didone delicada' },
  ];
  const FONTS = FONT_LIST.map((f) => f.name);
  // largura média de uma letra (em fração do tamanho da fonte), para a palavra nunca passar da borda da tela
  const FONT_WF = {
    Anton: 0.5,
    'Bebas Neue': 0.45,
    'Oswald Bold': 0.52,
    'Barlow Condensed ExtraBold': 0.47,
    'Montserrat Black': 0.78,
    'Montserrat ExtraBold': 0.74,
    'Poppins ExtraBold': 0.72,
    'Archivo Black': 0.8,
    'Syne ExtraBold': 0.86,
    'League Spartan Black': 0.7,
    'Inter Black': 0.7,
    'Playfair Display Black': 0.64,
    'Permanent Marker': 0.66,
    'Big Shoulders Black': 0.46,
    'Teko SemiBold': 0.44,
    'Unbounded ExtraBold': 0.9,
    'Alfa Slab One': 0.78,
    'Fraunces Black': 0.66,
    'Bodoni Moda Black': 0.66,
    'Cinzel ExtraBold': 0.8,
    'Instrument Serif': 0.46,
    Allura: 0.48,
    'Pinyon Script': 0.55,
    Sacramento: 0.42,
    Lobster: 0.55,
  };
  // Larguras reais de cada letra, tiradas dos arquivos das fontes (public/fonts/metrics.json, gerado com fontTools):
  // a prévia e a exportação medem igual, e nenhum texto passa da borda da tela. Sem o arquivo, uma estimativa.
  let METRICS = null;
  const setMetrics = (m) => {
    METRICS = m && typeof m === 'object' ? m : null;
  };
  if (typeof module !== 'undefined' && module.exports)
    try {
      setMetrics(require('./fonts/metrics.json'));
    } catch {
      /* sem o arquivo: estimativa */
    }
  else if (typeof fetch !== 'undefined')
    fetch('/fonts/metrics.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMetrics)
      .catch(() => {});
  /** Cor de uma palavra-chave: com duas cores, cada palavra fica sempre com a mesma (escolhida pela própria palavra). */
  const kwColor = (style, t) => {
    if (!style.kc2) return style.kc;
    let h = 0;
    for (const ch of normWord(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 2 ? style.kc2 : style.kc;
  };
  /** Largura de um texto, em múltiplos do tamanho da fonte (com as medidas reais quando há). */
  const textW = (font, text, upper, italic) => {
    const s = upper ? String(text || '').toUpperCase() : String(text || '');
    const m = METRICS && ((italic && METRICS[font + '|i']) || METRICS[font]);
    if (!m) return s.length * (FONT_WF[font] || 0.64) * (upper ? 1.08 : 1);
    let w = 0;
    for (const ch of s) w += m[ch] ?? m.o ?? 0.6;
    return w;
  };
  const DEFAULT_FONT = 'Poppins ExtraBold';
  // fontes enviadas pela equipe (data/fonts): o servidor e o editor avisam quais existem
  let CUSTOM = [];
  const setCustomFonts = (l) => {
    CUSTOM = (Array.isArray(l) ? l : [])
      .filter((f) => f && typeof f.name === 'string' && f.name)
      .map((f) => ({ id: f.id, name: f.name, custom: true, note: 'enviada pela equipe' }));
  };
  const customFonts = () => CUSTOM.slice();
  /** Fonte conhecida (do app ou enviada pela equipe), ou a padrão (estilos e textos antigos usavam Arial, DejaVu e Liberation). */
  const cleanFont = (f) => (FONTS.includes(f) || CUSTOM.some((c) => c.name === f) ? f : DEFAULT_FONT);

  const MODES = [
    ['block', 'Frase inteira'],
    ['plain', 'Grupo de palavras'],
    ['highlight', 'Palavra falada colorida'],
    ['boxhl', 'Palavra falada com marca'],
    ['karaoke', 'Karaokê'],
    ['words1', 'Uma palavra por vez'],
    ['reveal', 'Palavra por palavra, acumulando'],
  ];
  const MODE_IDS = MODES.map((m) => m[0]);
  // Como a frase entra na tela. "pop" dá um pulinho a cada palavra; os outros valem só quando a frase aparece.
  const ANIMS = [
    ['none', 'Sem animação'],
    ['bounce', 'Quique a cada palavra'],
    ['pop', 'Pulo a cada palavra'],
    ['fade', 'Aparece suave'],
    ['slide', 'Sobe'],
    ['zoom', 'Zoom'],
  ];
  const ANIM_IDS = ANIMS.map((a) => a[0]);
  // Palavras-chave da fé: com "Palavras-chave" ligado, aparecem sempre na cor escolhida.
  const KEYWORDS = new Set(
    (
      'deus jesus cristo senhor espírito santo pai filho fé amor graça glória palavra oração orar vida salvação ' +
      'salvo cruz céu céus perdão esperança paz aleluia amém bíblia igreja coração milagre milagres propósito ' +
      'família reino adoração louvor promessa promessas cura libertação verdade luz eterna eterno sangue ressurreição'
    ).split(' '),
  );
  const normWord = (t) =>
    String(t || '')
      .toLowerCase()
      .replace(/[^\p{L}]/gu, '');
  // palavra-chave: as da lista fixa ou as escolhidas para o corte (kwWords, pela direção de arte do Claude)
  const isKeyword = (t, extra) => {
    const w = normWord(t);
    return KEYWORDS.has(w) || (Array.isArray(extra) && extra.includes(w));
  };

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
    anim: 'none', // como a frase entra (ANIMS)
    grow: false, // a palavra falada fica maior
    kw: false, // palavras-chave da fé coloridas
    kc: '#f0b93a', // cor das palavras-chave
    kc2: '', // segunda cor das palavras-chave (alternam entre as duas); vazio = só uma
    emph: false, // palavras-chave também maiores (ênfase, como nos cortes virais)
    kf: '', // fonte das palavras-chave (mistura de duas fontes: ex. bloco pesado + serifa itálica); vazio = a mesma
    ki: false, // palavras-chave em itálico
    mode: 'plain',
    chunk: 4, // palavras de cada vez
  };
  // Propriedades que a pessoa pode mudar em "Personalizar" (e que vão para os estilos salvos).
  const KEYS = Object.keys(BASE);

  /* ----- estilos prontos ----- */
  // "Palavra por palavra": o padrão. Cada palavra entra no tempo exato em que é dita, com um quique curto
  // (cresce além do tamanho e assenta, ~0,18 s), e as palavras-chave da fala ganham cor e ficam maiores.
  // É o que as ferramentas de corte viral fazem (Submagic, Captions, OpusClip); cada estilo tem uma identidade.
  const PP = 'Palavra por palavra';
  const DEF = [
    [
      PP,
      'Branco forte',
      {
        font: 'Montserrat Black',
        upper: true,
        scale: 1.25,
        mode: 'words1',
        anim: 'bounce',
        ow: 5,
        shadow: 3,
        kw: true,
        kc: '#facc15',
        emph: true,
      },
    ],
    [
      PP,
      'Amarelo viral',
      {
        font: 'Anton',
        upper: true,
        scale: 1.45,
        mode: 'words1',
        anim: 'bounce',
        color: '#fde047',
        ow: 6,
        shadow: 2,
        kw: true,
        kc: '#ffffff',
        emph: true,
      },
    ],
    [
      PP,
      'Acumulando',
      {
        font: 'Montserrat Black',
        upper: true,
        scale: 1.15,
        mode: 'reveal',
        chunk: 3,
        anim: 'bounce',
        ow: 5,
        shadow: 3,
        grow: true,
        hi: '#facc15',
        kw: true,
        kc: '#facc15',
      },
    ],
    [
      PP,
      'Etiqueta',
      {
        font: 'League Spartan Black',
        upper: true,
        scale: 1.2,
        mode: 'words1',
        anim: 'bounce',
        color: '#111111',
        box: { color: '#ffffff', alpha: 0 },
        ow: 0,
        kw: true,
        kc: '#e11d48',
        emph: true,
      },
    ],
    [
      PP,
      'Dourado',
      {
        font: 'Montserrat ExtraBold',
        upper: true,
        scale: 1.25,
        mode: 'words1',
        anim: 'bounce',
        ow: 3,
        shadow: 4,
        glow: true,
        hi: '#f0b93a',
        kw: true,
        kc: '#f6d27a',
        emph: true,
      },
    ],
    [
      PP,
      'Revista',
      {
        font: 'Playfair Display Black',
        scale: 1.4,
        mode: 'words1',
        anim: 'zoom',
        ow: 0,
        shadow: 4,
        kw: true,
        kc: '#f6d27a',
        emph: true,
      },
    ],
    [
      PP,
      'Limpo acumulando',
      {
        font: 'Inter Black',
        scale: 1.1,
        mode: 'reveal',
        chunk: 4,
        anim: 'bounce',
        ow: 2,
        shadow: 3,
        grow: true,
        hi: '#38bdf8',
        kw: true,
        kc: '#38bdf8',
      },
    ],
    [
      PP,
      'Neon',
      {
        font: 'Syne ExtraBold',
        upper: true,
        scale: 1,
        mode: 'words1',
        anim: 'bounce',
        ow: 3,
        shadow: 3,
        glow: true,
        hi: '#a855f7',
        kw: true,
        kc: '#e9d5ff',
        emph: true,
      },
    ],
    // duas fontes: o texto num bloco pesado e a palavra-chave numa serifa itálica ou caligrafia, maior e colorida
    [
      PP,
      'Editorial',
      {
        font: 'Montserrat Black',
        upper: true,
        scale: 1.2,
        mode: 'words1',
        anim: 'bounce',
        ow: 4,
        shadow: 3,
        kw: true,
        kc: '#f2ebdd',
        emph: true,
        kf: 'Instrument Serif',
        ki: true,
      },
    ],
    [
      PP,
      'Clássico',
      {
        font: 'Cinzel ExtraBold',
        scale: 1.15,
        mode: 'words1',
        anim: 'zoom',
        ow: 0,
        shadow: 4,
        kw: true,
        kc: '#f5c542',
        emph: true,
        kf: 'Pinyon Script',
      },
    ],
    [
      PP,
      'Acumulando editorial',
      {
        font: 'Inter Black',
        upper: true,
        scale: 1.05,
        mode: 'reveal',
        chunk: 3,
        anim: 'bounce',
        ow: 3,
        shadow: 3,
        grow: true,
        hi: '#ffd23f',
        kw: true,
        kc: '#ffd23f',
        kf: 'Fraunces Black',
        ki: true,
      },
    ],
    [
      PP,
      'Cartaz',
      {
        font: 'Big Shoulders Black',
        upper: true,
        scale: 1.6,
        mode: 'words1',
        anim: 'bounce',
        ow: 5,
        shadow: 3,
        kw: true,
        kc: '#ffd23f',
        emph: true,
        kf: 'Fraunces Black',
        ki: true,
      },
    ],
    [
      PP,
      'Escrita à mão',
      {
        font: 'Permanent Marker',
        scale: 1.35,
        mode: 'words1',
        anim: 'bounce',
        ow: 4,
        shadow: 2,
        kw: true,
        kc: '#38bdf8',
        emph: true,
      },
    ],
    [
      PP,
      'Condensada',
      {
        font: 'Bebas Neue',
        scale: 1.7,
        mode: 'words1',
        anim: 'bounce',
        ow: 4,
        shadow: 3,
        kw: true,
        kc: '#ff8a1f',
        emph: true,
      },
    ],
    ['Essenciais', 'Clássica', {}],
    ['Essenciais', 'Frase inteira', { font: 'Poppins SemiBold', mode: 'block', ow: 2, shadow: 2 }],
    ['Essenciais', 'Limpa', { font: 'Poppins SemiBold', ow: 0, shadow: 3, chunk: 5 }],
    ['Destaque', 'Destaque dourado', { upper: true, mode: 'highlight', chunk: 3, ow: 4 }],
    ['Destaque', 'Destaque verde', { upper: true, mode: 'highlight', chunk: 3, ow: 4, hi: '#22c55e' }],
    ['Destaque', 'Marca-texto', { mode: 'boxhl', chunk: 3, hi: '#231c47', ow: 3 }],
    ['Destaque', 'Karaokê', { font: 'Montserrat ExtraBold', upper: true, mode: 'karaoke', chunk: 3, ow: 4 }],
    [
      'Destaque',
      'Palavra que cresce',
      { upper: true, mode: 'highlight', chunk: 3, ow: 4, grow: true, anim: 'pop', hi: '#facc15' },
    ],
    ['Destaque', 'Palavras-chave', { font: 'Poppins ExtraBold', chunk: 4, ow: 3, kw: true, anim: 'fade' }],
    ['Destaque', 'Surgindo', { mode: 'reveal', chunk: 5, ow: 3, shadow: 2, kw: true }],
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
    ['Impacto', 'Uma palavra', { font: 'Anton', upper: true, scale: 1.5, mode: 'words1', ow: 5, anim: 'pop' }],
    [
      'Impacto',
      'Viral',
      {
        font: 'Anton',
        upper: true,
        scale: 1.35,
        mode: 'highlight',
        chunk: 2,
        ow: 6,
        hi: '#facc15',
        grow: true,
        anim: 'zoom',
      },
    ],
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
    [
      'Elegante',
      'Versículo surgindo',
      { font: 'DM Serif Display', scale: 1.1, mode: 'reveal', chunk: 6, ow: 0, shadow: 3, kw: true, kc: '#f6d27a' },
    ],
    [
      'Elegante',
      'Sobe suave',
      { font: 'Poppins SemiBold', chunk: 4, ow: 0, shadow: 3, anim: 'slide', box: { color: '#231c47', alpha: 0.15 } },
    ],
  ];
  const STYLES = DEF.map(([cat, name, o]) => ({ ...BASE, ...o, id: `${cat}/${name}`, name, cat }));
  const CATEGORIES = [...new Set(DEF.map((d) => d[0]))].map((id) => ({
    id,
    count: DEF.filter((d) => d[0] === id).length,
  }));
  const DEFAULT_ID = 'Palavra por palavra/Branco forte';
  // os estilos palavra por palavra (a direção de arte da IA escolhe entre eles)
  const WORD_STYLES = DEF.filter((d) => d[0] === PP).map((d) => `${d[0]}/${d[1]}`);
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
    if (typeof o.kf === 'string') out.kf = o.kf ? cleanFont(o.kf) : '';
    for (const [k, a, b] of [
      ['scale', 0.5, 2.5],
      ['ow', 0, 10],
      ['shadow', 0, 8],
      ['chunk', 1, 10],
    ]) {
      const v = num(o[k], a, b);
      if (v !== null) out[k] = k === 'chunk' ? Math.round(v) : v;
    }
    for (const k of ['upper', 'italic', 'glow', 'grow', 'kw', 'emph', 'ki'])
      if (typeof o[k] === 'boolean') out[k] = o[k];
    for (const k of ['color', 'hi', 'outline', 'kc']) if (isHex(o[k])) out[k] = o[k].toLowerCase();
    if (o.kc2 === '' || isHex(o.kc2)) out.kc2 = String(o.kc2).toLowerCase();
    if (ANIM_IDS.includes(o.anim)) out.anim = o.anim;
    else if (typeof o.pop === 'boolean') out.anim = o.pop ? 'pop' : 'none'; // edições e estilos de antes: "pop" ligado ou não
    if (o.box === false) out.box = false;
    else if (o.box && isHex(o.box.color))
      out.box = { color: o.box.color.toLowerCase(), alpha: num(o.box.alpha, 0, 0.95) || 0 };
    if (MODE_IDS.includes(o.mode)) out.mode = o.mode;
    else if (o.mode === 'words2') out.mode = 'highlight'; // do catálogo antigo
    if (Array.isArray(o.kwWords))
      out.kwWords = o.kwWords
        .map(normWord)
        .filter((w) => w.length >= 2)
        .slice(0, 40);
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
      if (out.mode === 'words1' && out.chunk > 1) out.mode = 'highlight'; // mais de uma: a falada fica destacada
    }
    out.font = cleanFont(out.font);
    if (out.mode === 'words1') out.chunk = 1;
    // Leitura garantida (vem ligada): sem tarja, a letra precisa de um contorno que contraste com ela, senão some
    // num fundo da mesma cor (letra branca sobre parede branca). Desliga com cap.safe = false.
    if (cap.safe !== false && !out.box) {
      if (contrast(out.color, out.outline) < 3) out.outline = lum(out.color) > 0.4 ? '#000000' : '#ffffff';
      const minOw = out.shadow >= 3 ? 1.5 : 2;
      if ((out.ow || 0) < minOw) out.ow = minOw;
    }
    return out;
  }
  // luminância relativa (0 a 1) e contraste entre duas cores, como nas regras de acessibilidade (WCAG)
  function lum(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const ch = [0, 2, 4]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    const x = lum(a),
      y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** Só o que difere do estilo base: é o que o editor guarda e o que vai para um estilo salvo. */
  function diff(full, baseId) {
    // compara com o estilo base já com a leitura garantida, para esse ajuste não virar "mudança" guardada
    // (sem tarja, a base também é comparada sem tarja: o contorno que a leitura garantida põe não conta como mudança)
    const b0 = resolve({ style: baseId }),
      b = full.box ? b0 : resolve({ style: baseId, box: false }),
      out = {};
    for (const k of KEYS) {
      const x = full[k],
        y = k === 'box' ? b0[k] : b[k];
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
    WORD_STYLES,
    byName,
    resolve,
    diff,
    fromSaved,
    cleanProps,
    chunkWords,
    lum,
    contrast,
    textW,
    kwColor,
    setMetrics,
    withWords,
    FONTS,
    FONT_LIST,
    DEFAULT_FONT,
    cleanFont,
    setCustomFonts,
    customFonts,
    MODES,
    ANIMS,
    isKeyword,
    KEYS,
    PAL,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CaptionStyles = api;
})(typeof window !== 'undefined' ? window : globalThis);
