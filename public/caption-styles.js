/* Catálogo de estilos de legenda (235, em 22 categorias), compartilhado entre o navegador (prévia) e o
   servidor (render ASS no ffmpeg). Nomes e categorias seguem o editor original; a aparência de cada estilo
   é uma aproximação própria feita com os modos abaixo.
   Modos: block (linha inteira) · words1 (uma palavra) · words2 (duas, a falada em destaque) ·
          highlight (linha curta, palavra falada colorida) · boxhl (palavra falada com marca) · karaoke (varredura). */
(function (root) {
  const PAL = ['#ffd60a', '#22e06b', '#a855f7', '#22d3ee', '#ff8a1f', '#ff3b30', '#ff4fa3', '#3b82f6', '#a3e635', '#14b8a6', '#f5c542', '#ffffff', '#000000', '#e11d48', '#1d4ed8', '#7c3aed'];
  const base = { size: 1, bold: true, italic: false, upper: false, font: 'Arial', color: '#ffffff', hi: '#ffd60a', outline: '#000000', ow: 3, shadow: 0, box: null, glow: false, pop: false, chunk: 4, mode: 'highlight' };
  const FONT = { serif: 'Liberation Serif', mono: 'Liberation Mono', dj: 'DejaVu Sans', djs: 'DejaVu Serif' };

  // DSL: "Nome|modo|flags". Flags: u g p i x(sem negrito) serif mono dj djs size=1.2 ow=4 sh=2 col=11 hi=3 outl=12 box=5 ba=0.4 chunk=2
  function parse(cat, row, idx) {
    const [name, mode, flags = ''] = row.split('|');
    const o = { ...base, id: `${cat}/${name}`, name, cat, mode: mode || 'highlight', hi: PAL[idx % 10] };
    for (const f of flags.split(/\s+/).filter(Boolean)) {
      const [k, v] = f.split('=');
      if (k === 'u') o.upper = true; else if (k === 'g') o.glow = true; else if (k === 'p') o.pop = true; else if (k === 'i') o.italic = true; else if (k === 'x') o.bold = false;
      else if (FONT[k]) o.font = FONT[k];
      else if (k === 'size') o.size = +v; else if (k === 'ow') o.ow = +v; else if (k === 'sh') o.shadow = +v; else if (k === 'chunk') o.chunk = +v;
      else if (k === 'col') o.color = PAL[+v]; else if (k === 'hi') o.hi = PAL[+v]; else if (k === 'outl') o.outline = PAL[+v];
      else if (k === 'box') o.box = { color: PAL[+v], alpha: 0 }; else if (k === 'ba' && o.box) o.box.alpha = +v;
    }
    return o;
  }
  const CATS = [
    ['Viral', ['Hormozi|highlight|u chunk=3 ow=5 hi=0', 'Hormozi 2.0|highlight|u chunk=3 ow=5 size=1.15 hi=1', 'Beast Mode|words2|u p size=1.4 ow=5 hi=0', 'Beast Glow|words2|u p g size=1.4 hi=3 outl=3', 'Iman|block|x ow=0 sh=3', 'Ali|block|ow=2 size=.9', 'Devin|highlight|u g chunk=3 hi=0 outl=0', 'One Word|words1|u p size=1.8 ow=5 col=11', 'Two Words|words2|u p size=1.3 hi=0', 'Supersize|highlight|size=.85 chunk=5 hi=0', 'Power Word|words1|u size=1 ow=2', 'Hormozi Box|boxhl|u chunk=3 hi=2 size=1.1', 'Quake|boxhl|u chunk=3 hi=0 size=1.1 ow=4', 'TikTok Glide|highlight|p chunk=3 hi=6', 'Fire Word|words1|u p g size=1.7 col=4 outl=5', 'Think|block|i x ow=1 sh=2']],
    ['Karaokê', ['Sweep|karaoke|hi=0', 'Karaoke Rise|karaoke|p hi=1', 'Karaoke Neon|karaoke|g hi=3 outl=15', 'Underline|karaoke|hi=11 ow=2', 'Pill Glide|karaoke|hi=6 box=12 ba=.5', 'Deep Read|karaoke|hi=7 x', 'Hollow Fill|karaoke|hi=11 col=12 outl=11 ow=2', 'Box Trail|karaoke|hi=0 box=12 ba=.35', 'Lyric|karaoke|i hi=10 x', 'Bounce|karaoke|p hi=4', 'Spotlight|karaoke|g hi=11 outl=11 size=1.1']],
    ['Caixas e etiquetas', ['Label Rail|block|u box=13 size=.9', 'Contrast Block|block|u box=12 size=1.1', 'Collide Label|boxhl|u hi=5 chunk=3', 'Snap Label|boxhl|u hi=7 chunk=2', 'Sticker|block|u box=0 col=12', 'Pill|block|box=2 size=.95', 'White Card|block|box=11 col=12', 'Highlighter|boxhl|hi=0 col=12 chunk=4', 'Frame|block|ow=6 outl=11 u', 'Brutalist|block|u box=12 outl=11 size=1.05', 'Box Lift|boxhl|hi=3 chunk=3 p', 'Outline Word|highlight|ow=4 hi=11 col=12 outl=11', 'Tag Stack|block|u box=14', 'Price Tag|block|u box=0 col=12 size=1.1', 'Frost|block|box=11 ba=.45 x']],
    ['Motion', ['Slash Ribbon|words2|u p hi=5', 'Tape Cross|words1|u p size=1.5 col=0 outl=12', 'Manifesto|highlight|u serif chunk=3 hi=0', 'Tracking Title|words1|u x size=1.3', 'Deck Build|highlight|u chunk=2 p hi=1', 'Ladder|words2|u p hi=3', 'Ladder Down|words2|u p hi=4', 'Spectrum|highlight|u p chunk=3 hi=6', 'Echo Stack|words1|u p g size=1.6 hi=2', 'Flip Board|boxhl|u p chunk=2 hi=12', 'Tunnel|words1|u p size=1.9 col=3 outl=14', 'Letter Wave|highlight|p hi=8', 'Impact Stack|words2|u p size=1.5 ow=6', 'Serif Hero|words1|serif p size=1.6 ow=2', 'Grid Type|highlight|mono u chunk=3 hi=9', 'Multifont|highlight|djs p hi=0', 'Kinetic Slam|words1|u p size=2 ow=6 col=0', 'Zigzag|words2|p hi=6', 'Drop Block|boxhl|u p chunk=3 hi=5', 'Glitch Slice|words1|u mono p hi=3 col=3', 'Spin In|words1|u p hi=4', 'Unfold|highlight|p chunk=3 hi=2', 'Cascade|highlight|p chunk=2 hi=1', 'Assemble|words2|p hi=7', 'Zoom Punch|words1|u p size=1.8 ow=5', 'Word Fly|words1|p size=1.5 hi=6', 'Wipe Bar|boxhl|u chunk=3 hi=14 p', 'Two Tone|words2|u hi=6 col=3 outl=14', 'Swing Sign|words1|u p box=13', 'Motion Mix|highlight|u p chunk=3 hi=0 size=1.1', 'Dynamic Highlight|highlight|u p chunk=3 hi=1', 'Dynamic Highlight Serif|highlight|serif u p chunk=3 hi=0', 'Impact Mix|words2|u p size=1.35 hi=4', 'Focus Reveal|highlight|p chunk=3 hi=11 x']],
    ['Editorial', ['Magazine|block|serif u x ow=0 sh=3', 'Editorial|block|serif i x ow=0 sh=2', 'Quote Card|block|serif i box=12 ba=.4 x', 'Headline|block|serif u size=1.2 ow=0 sh=3', 'Byline|block|serif size=.8 x ow=0 sh=2', 'Cover Stack|words2|serif u hi=0 ow=0 sh=3', 'Couture|block|serif i x size=1.1 ow=0 sh=4', 'Brutal Serif|block|serif u size=1.3 ow=4', 'Manifest Caps|block|serif u size=1.1 x ow=0 sh=3']],
    ['Minimalista', ['Clean|block|x ow=0 sh=2', 'Lowercase|block|x ow=1 size=.9', 'Hush|block|x ow=0 sh=3 size=.85', 'Soft Blur|block|x ow=0 sh=5 g', 'Brand Minimal|block|ow=0 sh=2 size=.9 col=11', 'Mono Caps|block|mono u x ow=1', 'Thin Line|block|x ow=1 size=.8', 'Center Serif|block|serif x ow=0 sh=3']],
    ['Neon e brilho', ['Neon Tube|block|g col=3 outl=3 ow=2', 'Neon Script|block|g i col=6 outl=6 ow=2', 'Retro Neon|highlight|g u hi=6 col=3 outl=15', 'Glow Word|words1|g u size=1.6 col=11 outl=11', 'Aura|highlight|g hi=2 outl=2 ow=2', 'Red Glow|block|g u col=11 outl=5 ow=3', 'Laser|highlight|g u mono hi=8 outl=8 ow=2']],
    ['Gradiente e cromado', ['Gradient Sunset|block|u g col=4 outl=6 ow=3', 'Rainbow Shift|highlight|u p chunk=3 hi=6', 'Chrome|block|u col=11 outl=12 ow=4 sh=3', 'Shine|block|u col=11 g outl=11 ow=1 sh=2', 'Gradient Keyword|highlight|u chunk=3 hi=15 outl=15', 'Shadow Spectrum|block|u col=3 outl=15 ow=4 sh=4', 'Holo|highlight|u g chunk=3 hi=3 outl=2']],
    ['3D e profundidade', ['3D Block|block|u ow=4 sh=6 outl=14', 'Long Shadow|block|u ow=2 sh=8', 'Retro 3D|block|u col=0 outl=13 ow=4 sh=6', 'Sign Block|block|u box=13 sh=4', 'Flip 3D|words2|u p ow=4 sh=5 hi=3', 'Pop Out|words1|u p size=1.6 ow=5 sh=6', 'Layered|block|u col=11 outl=7 ow=5 sh=5', 'Echo Trail|highlight|u p ow=4 sh=6 hi=6']],
    ['Retrô e glitch', ['VHS|block|mono col=11 outl=6 ow=2 sh=2', 'Arcade|words2|mono u hi=0 col=3 outl=15', 'RGB Glitch|block|mono u col=3 outl=6 ow=2 sh=3', 'Synthwave|highlight|u g hi=6 col=3 outl=15', 'Terminal|block|mono col=1 outl=12 ow=2 x', 'Old TV|block|mono col=11 outl=12 ow=3 x', 'Yellow Subs|block|col=0 ow=3 x', 'Seventies|highlight|serif u hi=4 col=0 outl=13', 'Decoder|highlight|mono hi=1 col=1 outl=12']],
    ['Manuscrito', ['Marker Note|block|i x col=0 ow=3', 'Circled|boxhl|i hi=5 chunk=3 x', 'Chalk|block|i x col=11 ow=0 sh=2', 'Doodle|block|i col=6 outl=11 ow=3', 'Signature|block|serif i x size=1.2 ow=0 sh=3', 'Graffiti|block|u i col=0 outl=13 ow=5', 'Scrawl Punch|words2|i u hi=5 ow=4', 'Notebook|block|i x col=12 box=11 ba=.1']],
    ['Quadrinhos e meme', ['Comic Pow|words1|u p size=1.7 col=0 outl=12 ow=6', 'Speech Bubble|block|box=11 col=12 ba=.05', 'Meme|block|u ow=7 size=1.1', 'Sticker Pop|words2|u p ow=5 hi=6', 'Jelly|words1|p u hi=6 ow=5', 'Cartoon|highlight|u ow=6 hi=3', 'Pop Art|highlight|u ow=5 hi=0 outl=13', 'Tabloid|block|u box=5 ow=4', 'Boom|words1|u p size=1.9 col=4 outl=12 ow=6', 'Kawaii|highlight|p hi=6 ow=4 outl=15']],
    ['TV e cinema', ['Streaming|block|x ow=2 box=12 ba=.55 size=.95', 'Closed Caption|block|mono x box=12 ba=.1 size=.9 ow=2', 'Anime|block|u ow=5 col=11 sh=2', 'Broadcast|block|box=14 x', 'Cinema|block|serif i x ow=0 sh=3', 'Documentary|block|x ow=1 sh=3 size=.9', 'Trailer|block|u serif size=1.2 ow=0 sh=4', 'Lower Third|block|box=13 ow=5 x size=.9', 'Sports TV|highlight|u hi=0 box=14 chunk=3']],
    ['Notícia', ['Breaking|block|u box=5 size=1.05', 'Ticker|block|u box=14 x size=.85', 'News Headline|block|u serif box=11 col=12', 'Newsroom|block|u box=14 size=1', 'Flash|highlight|u hi=0 box=5 chunk=3', 'Report|block|box=12 ba=.4 x size=.95', 'Alert|block|u box=0 col=12 size=1.05']],
    ['Gamer e tech', ['HUD|block|mono u col=3 outl=12 ow=2', 'Esports|highlight|u hi=5 ow=4 chunk=3', 'Streamer|words2|u p hi=15', 'Stencil Ops|block|mono u col=8 outl=12 ow=3', 'Matrix|block|mono col=1 outl=12 ow=2 g', 'Cyber|highlight|mono u g hi=6 col=3 outl=15', 'Level Up|words1|u p size=1.6 col=0 outl=13 ow=5', 'AI Tech|highlight|mono hi=3 ow=2 g', 'Blast|boxhl|u p chunk=2 hi=4']],
    ['Podcast e entrevista', ['Interview|block|box=12 ba=.5 x', 'Podcast Bold|block|u size=1.1 ow=4', 'Transcript|block|mono x ow=1 sh=2 size=.85', 'Podcast Card|block|box=11 col=12 x']],
    ['Emoji', ['Emoji Top|block|ow=3 size=1', 'Emoji Side|block|ow=3 size=.95', 'Emoji Giant|words1|size=1.7 u p', 'Emoji Beast|words2|u p hi=0', 'Emoji Clean|block|x ow=1 sh=2']],
    ['Elegante', ['Gold|block|serif col=10 ow=0 sh=3 u', 'Luxe|block|serif i x col=10 ow=0 sh=3', 'Champagne|block|serif x col=10 ow=1 outl=13', 'Atelier|block|serif i col=11 ow=0 sh=4 size=1.1', 'Iman Gold|block|x col=10 ow=0 sh=3']],
    ['Divertido', ['Bubble|words2|p hi=6 ow=5 outl=15', 'Candy Pop|highlight|p hi=6 ow=4 col=11', 'Wiggle|words1|p u hi=3 col=3 ow=5', 'Party|highlight|p u hi=4 chunk=3', 'Rainbow Kids|highlight|p hi=3 ow=5', 'Rubber|words1|p u size=1.6 col=0 ow=5']],
    ['Datas e temas', ['Christmas|highlight|u hi=1 col=5 outl=11 ow=3', 'Halloween|highlight|u hi=4 col=2 outl=12 ow=4', 'Carnaval|highlight|u p hi=0 col=6 outl=15 ow=4', 'São João|highlight|u hi=0 col=4 outl=12 ow=4', 'Torcida|highlight|u hi=0 col=1 outl=14 ow=4', 'Black Friday|highlight|u hi=0 box=12 ba=.1', 'Valentine|highlight|i hi=6 col=11 outl=13 ow=3', 'New Year|highlight|u g hi=10 outl=10 ow=3']],
    ['Chat e redes', ['Message Blue|block|box=14 x size=.95', 'Post|block|box=11 col=12 x size=.95', 'Comment|block|box=12 ba=.3 x size=.9']],
    ['Clássicos', ['Clássica|block|ow=3', 'Karaokê|karaoke|hi=0 ow=3', 'Progressiva|highlight|hi=11 chunk=5 ow=3', 'Uma palavra|words1|u size=1.6 ow=4 p', 'Caixa|block|box=12', 'Caixa por palavra|boxhl|u chunk=3 hi=14', 'Hormozi|highlight|u ow=5 chunk=3 hi=0', 'MrBeast|words2|u p size=1.4 ow=5 hi=0', 'Minimalista|block|x ow=1 sh=2', 'Serif|block|serif x ow=2', 'Cinema|block|serif i x ow=0 sh=3', 'Neon|block|g col=3 outl=15 ow=3', 'Pop|block|u p ow=4 outl=6', 'Karaokê fill|karaoke|hi=2 ow=3', 'Beasty|words2|u p g hi=0', 'Caixa destaque|boxhl|u hi=0 col=12 chunk=3', 'Crescer|highlight|p hi=1', 'Respirar|highlight|p hi=3 x', 'Desfoque|block|x ow=0 sh=5 g', 'Quicar|highlight|p hi=4', 'Subir|highlight|p chunk=2 hi=8', 'Glitch|block|mono u col=3 outl=6 ow=2', 'Fundo|block|box=12 ba=.6 x', 'Máquina|block|mono x ow=2', 'Simples|block|x ow=2', 'Fundo escuro|block|box=12 ba=.35', 'Fundo claro|block|box=11 col=12 ba=.1', 'Pop rosa|block|u p col=6 ow=4 outl=15', 'Verde vivo|block|u col=1 ow=4', 'Sublinhado|highlight|hi=0 x', 'Glitch infinito|block|mono u g col=3 outl=6', 'Tremor|words1|u p size=1.5 ow=4', 'Desfoque ciano|block|g col=3 outl=3 ow=1', 'Condensada|block|x size=.85 ow=2', 'Foco|highlight|chunk=3 hi=11 x', 'Pouso suave|highlight|p x chunk=3 hi=3', 'Passos|words2|p hi=1']],
  ];
  const STYLES = []; const CATEGORIES = [];
  CATS.forEach(([cat, rows]) => { CATEGORIES.push({ id: cat, count: rows.length }); rows.forEach((r, i) => STYLES.push(parse(cat, r, i))); });
  // Estilo "Sem legenda" tratado pela interface (cap.on = false).
  const byName = (n) => STYLES.find((s) => s.id === n) || STYLES.find((s) => s.name === n) || STYLES.find((s) => s.id === 'Clássicos/Clássica') || STYLES[0];

  function chunkWords(words, style) {
    // Com o número de palavras escolhido pela pessoa (withWords), vale esse número e a linha pode ser mais comprida.
    const max = style.wordsSet ? style.chunk : style.mode === 'words1' ? 1 : style.mode === 'words2' ? 2 : style.chunk || 4;
    const maxChars = style.wordsSet ? Math.max(26, style.chunk * 11) : 26;
    const out = []; let cur = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const brk = cur.length && (cur.length >= max || (prev && (w.s - prev.e > 0.9 || w.seg !== prev.seg)) || cur.reduce((a, x) => a + x.t.length + 1, 0) + w.t.length > maxChars);
      if (brk) { out.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /** Estilo com o número de palavras por legenda escolhido (1 a 10). Sem número, devolve o estilo como é.
   *  Estilos de frase inteira passam a mostrar grupos; os de uma ou duas palavras passam a destacar a palavra falada. */
  function withWords(style, n) {
    n = Math.round(+n); if (!(n >= 1)) return style;
    n = Math.min(10, n);
    const mode = style.mode === 'block' ? 'plain' : (style.mode === 'words1' || style.mode === 'words2') && n > 1 ? 'highlight' : style.mode;
    return Object.assign({}, style, { mode, chunk: n, wordsSet: true });
  }

  const api = { STYLES, CATEGORIES, byName, chunkWords, withWords, FONTS: ['Arial', 'DejaVu Sans', 'DejaVu Serif', 'Liberation Serif', 'Liberation Mono'], PAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CaptionStyles = api;
})(typeof window !== 'undefined' ? window : globalThis);
