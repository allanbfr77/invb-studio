// Exportar um corte com o ffmpeg: formato, legenda queimada, velocidade, trechos removidos, sincronia e remoção de música.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { cleanSpeed, atempo, cleanShift } = require('./speed');
const { cleanVoice } = require('./voice');
const { cues, toSrt, kitText } = require('./kit');
const { LIB, U, tools } = require('./config');
const { readJson, withLock, writeJson, run, getMeta, log } = require('./store');

/* ---------- Cortes (ffmpeg) ---------- */
const srtT = (s) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = Math.floor(s % 60),
    ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
function srtFor(tr, a, b) {
  const lines = [];
  let n = 1;
  for (const s of tr.segments) {
    if (s.end <= a || s.start >= b) continue;
    const st = Math.max(s.start, a) - a,
      en = Math.min(s.end, b) - a;
    lines.push(`${n++}\n${srtT(st)} --> ${srtT(Math.max(en, st + 0.4))}\n${s.text}\n`);
  }
  return lines.join('\n');
}
const FORMATS = { orig: null, '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const CS = require('../public/caption-styles.js');
const FONTS = require('./fonts');
const PEXELS = require('./pexels');
const SOM = require('./audio-lib');
// Pasta das fontes para o filtro de legenda do ffmpeg, a partir da pasta onde ele roda. O caminho relativo não tem
// ":" (que no filtro separa opções); se não der para ser relativo (outro disco no Windows), vai o absoluto escapado.
const fontsArg = (cwd, fdir) => {
  const rel = path.relative(cwd, fdir).replace(/\\/g, '/');
  return /[:,;[\]']/.test(rel) ? `'${fdir.replace(/\\/g, '/').replace(/'/g, '')}'` : rel;
};
const hex2ass = (hex, alpha = 0) => {
  const h = String(hex).replace('#', '');
  const r = h.slice(0, 2),
    g = h.slice(2, 4),
    b = h.slice(4, 6);
  return `&H${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}${b}${g}${r}`.toUpperCase();
};
const tag6 = (hex) => {
  const h = String(hex).replace('#', '');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
};
const assT = (t) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    x = Math.floor(t % 60),
    cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
const assEsc = (t) =>
  String(t)
    .replace(/[{}\\]/g, '')
    .replace(/\r?\n/g, ' ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const num = (v, d = null) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? d : +v);

/* ----- Impacto: cor do vídeo (look), efeitos num trecho e entrada animada dos textos -----
   A prévia do editor imita os mesmos efeitos com CSS (public/editor/impacto.js). */
const LOOKS = {
  none: '',
  quente: 'colorbalance=rs=0.07:gs=0.01:bs=-0.08:rm=0.04:bm=-0.05,eq=contrast=1.06:saturation=0.92',
  filme:
    'colorbalance=rs=0.08:gs=0.02:bs=-0.07:rm=0.05:bm=-0.05,eq=contrast=1.12:saturation=0.78:gamma=0.97,noise=alls=9:allf=t,vignette=angle=PI/5',
  frio: 'colorbalance=rs=-0.05:bs=0.08:rh=-0.03:bh=0.05,eq=contrast=1.05:saturation=0.9',
  drama: 'hue=s=0,eq=contrast=1.3:brightness=-0.03,vignette=angle=PI/4',
  vivo: 'eq=saturation=1.28:contrast=1.08',
  // sombras azuladas e pele/luzes alaranjadas, o "teal & orange" de cinema
  cinema: 'colorbalance=rs=-0.08:gs=-0.01:bs=0.08:rh=0.08:gh=0.01:bh=-0.08,eq=contrast=1.1:saturation=1.08',
  dourado: 'colortemperature=temperature=4200:mix=0.7,eq=contrast=1.05:saturation=1.05',
  noite: 'colorbalance=rs=-0.04:bs=0.07,eq=brightness=-0.05:contrast=1.08:saturation=0.7,vignette=angle=PI/4.5',
  suave: 'eq=contrast=0.92:brightness=0.03:saturation=0.85',
  retro: 'curves=preset=vintage,noise=alls=6:allf=t',
};
// bw: preto e branco com contraste e cantos escuros; zoom: aproxima de uma vez; shake: tremida; flash: clarão que some;
// card: cartela, a tela toda numa cor só (o texto da cartela é um texto comum por cima)
// push: zoom lento; blur: desfoque; glitch: cores separadas e chuvisco; dim: escurece; echo: rastro (frames misturados)
// pull: zoom para fora; pulse: pulsa na batida; handheld: câmera na mão; redpop: só o vermelho fica colorido;
// glow: brilho suave; warm: luz quente; reveal: surge do preto; oldfilm: filme antigo; vhs; pixel: mosaico
const FX_TYPES = [
  'bw',
  'zoom',
  'shake',
  'flash',
  'card',
  'push',
  'blur',
  'glitch',
  'dim',
  'echo',
  'pull',
  'pulse',
  'handheld',
  'redpop',
  'glow',
  'warm',
  'reveal',
  'oldfilm',
  'vhs',
  'pixel',
];
const ANIMS = ['none', 'pop', 'blur', 'slide', 'zoom', 'fade'];
const cleanFx = (list) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 80)
    .map((f) => {
      const a = num(f && f.start),
        b = num(f && f.end);
      if (!f || !FX_TYPES.includes(f.type) || a === null || b === null || !(b > a)) return null;
      return { type: f.type, start: a, end: b, color: f.type === 'card' && isHex(f.color) ? f.color : '#000000' };
    })
    .filter(Boolean);
// filtros do look e dos efeitos, depois do enquadramento; devolve o nome da saída
function fxChain(chain, cur, opt, W, H, rel, d) {
  let n = 0;
  const step = (body) => {
    const out = `fx${n++}`;
    chain.push(`[${cur}]${body}[${out}]`);
    cur = out;
  };
  if (LOOKS[opt.look]) step(LOOKS[opt.look]);
  // Efeito de cor com transição: a versão com o efeito entra por cima e sai em fade (0,25 s, ou menos em trecho curto),
  // em vez de ligar e desligar seco. É uma cópia do quadro com transparência, o que custa pouco para exportar.
  const smooth = (body, A, B) => {
    const k = n++,
      dt = Math.min(0.25, (B - A) / 3);
    chain.push(
      `[${cur}]split[sa${k}][sb${k}]`,
      `[sb${k}]${body},format=yuva420p,fade=t=in:st=${A.toFixed(3)}:d=${dt.toFixed(3)}:alpha=1,fade=t=out:st=${(B - dt).toFixed(3)}:d=${dt.toFixed(3)}:alpha=1[sc${k}]`,
      `[sa${k}][sc${k}]overlay=0:0:enable='between(t,${A.toFixed(3)},${B.toFixed(3)})'[fx${k}]`,
    );
    cur = `fx${k}`;
  };
  for (const f of opt.fx) {
    const A = rel(clamp(f.start, 0, d)),
      B = rel(clamp(f.end, 0, d));
    if (!(B - A >= 0.03)) continue;
    const en = `enable='between(t,${A.toFixed(3)},${B.toFixed(3)})'`;
    if (f.type === 'bw') smooth('hue=s=0,eq=contrast=1.25,vignette=angle=PI/3.5', A, B);
    else if (f.type === 'card') {
      // cartela: uma tela de cor que entra e sai em fade rápido (0,12 s)
      const k = n++,
        dt = Math.min(0.12, (B - A) / 4);
      chain.push(
        `color=c=0x${f.color.slice(1)}:s=${W}x${H}:r=30:d=${(B + 0.2).toFixed(3)},format=yuva420p,fade=t=in:st=${A.toFixed(3)}:d=${dt.toFixed(3)}:alpha=1,fade=t=out:st=${(B - dt).toFixed(3)}:d=${dt.toFixed(3)}:alpha=1[cd${k}]`,
        `[${cur}][cd${k}]overlay=0:0:${en}:eof_action=pass[fx${k}]`,
      );
      cur = `fx${k}`;
    } else if (f.type === 'blur') smooth('gblur=sigma=14', A, B);
    else if (f.type === 'redpop') smooth('colorhold=color=red:similarity=0.3:blend=0.05', A, B);
    else if (f.type === 'warm')
      smooth('colorbalance=rh=0.14:gh=0.04:bh=-0.1:rm=0.06:bm=-0.05,eq=brightness=0.05:saturation=1.15', A, B);
    else if (f.type === 'reveal')
      step(`eq=brightness='-1+min(1,(t-${A.toFixed(3)})/${Math.max(0.1, B - A).toFixed(3)})':eval=frame:${en}`);
    else if (f.type === 'oldfilm')
      smooth(
        `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=18:allf=t,vignette=angle=PI/4,eq=brightness='0.03*sin(t*37)':eval=frame`,
        A,
        B,
      );
    else if (f.type === 'vhs')
      step(
        `rgbashift=rh=-${Math.round(W * 0.006)}:bh=${Math.round(W * 0.006)}:${en},noise=alls=14:allf=t:${en},eq=saturation=1.3:${en},drawgrid=w=iw:h=${Math.max(3, Math.round(H / 270))}:t=1:color=black@0.25:${en}`,
      );
    else if (f.type === 'pixel') step(`pixelize=width=${Math.round(W / 36)}:height=${Math.round(W / 36)}:${en}`);
    else if (f.type === 'glow') {
      const k = n++;
      chain.push(
        `[${cur}]split[ga${k}][gb${k}]`,
        `[gb${k}]gblur=sigma=${Math.round(W / 50)}[gc${k}]`,
        `[ga${k}][gc${k}]blend=all_mode=screen:all_opacity=0.45:${en}[fx${k}]`,
      );
      cur = `fx${k}`;
    } else if (f.type === 'dim') smooth('eq=brightness=-0.16:saturation=0.8', A, B);
    else if (f.type === 'echo') step(`tmix=frames=6:${en}`);
    else if (f.type === 'glitch')
      step(`rgbashift=rh=-${Math.round(W * 0.012)}:bh=${Math.round(W * 0.012)}:${en},noise=alls=28:allf=t:${en}`);
    else if (f.type === 'flash')
      step(`eq=brightness='0.6*max(0,1-(t-${A.toFixed(3)})/${Math.min(0.35, B - A).toFixed(3)})':eval=frame:${en}`);
    else {
      // zoom e tremida: uma cópia aproximada do quadro, por cima só naquele trecho
      const k = n++,
        big = (x, z) => Math.round((x * z) / 2) * 2;
      const pT = `clip((t-${A.toFixed(3)})/${Math.max(0.1, B - A).toFixed(3)},0,1)`;
      const moved =
        f.type === 'pull'
          ? `scale=w='trunc(iw*(1.15-0.15*${pT})/2)*2':h=-2:eval=frame,crop=${W}:${H}`
          : f.type === 'pulse'
            ? `scale=w='trunc(iw*(1.02+0.06*abs(sin((t-${A.toFixed(3)})*PI*2.2)))/2)*2':h=-2:eval=frame,crop=${W}:${H}`
            : f.type === 'handheld'
              ? `scale=${big(W, 1.05)}:${big(H, 1.05)},crop=${W}:${H}:x='(iw-ow)/2+sin(t*2.7)*iw*0.008+sin(t*5.3)*iw*0.004':y='(ih-oh)/2+cos(t*2.1)*ih*0.006'`
              : f.type === 'push'
                ? // aproxima devagar: 0% no começo do trecho, 15% no fim
                  `scale=w='trunc(iw*(1+0.15*clip((t-${A.toFixed(3)})/${Math.max(0.1, B - A).toFixed(3)},0,1))/2)*2':h=-2:eval=frame,crop=${W}:${H}`
                : f.type === 'zoom'
                  ? // aproxima em 0,18 s, segura e volta em 0,18 s (antes saltava de uma vez)
                    `scale=w='trunc(iw*(1+0.18*clip(min((t-${A.toFixed(3)})/0.18,(${B.toFixed(3)}-t)/0.18),0,1))/2)*2':h=-2:eval=frame,crop=${W}:${H}`
                  : `scale=${big(W, 1.08)}:${big(H, 1.08)},crop=${W}:${H}:x='(iw-ow)/2+sin(t*53)*iw*0.012':y='(ih-oh)/2+cos(t*41)*ih*0.012'`;
      chain.push(
        `[${cur}]split[za${k}][zb${k}]`,
        `[zb${k}]${moved}[zc${k}]`,
        `[za${k}][zc${k}]overlay=0:0:${en}[fx${k}]`,
      );
      cur = `fx${k}`;
    }
  }
  return cur;
}
// entrada do texto (legenda ASS): \pos no lugar, ou \move no "deslizar"
function animTag(anim, x, y, W) {
  const pos = `\\an5\\pos(${x},${y})`;
  // todas saem em fade de 0,18 s (antes sumiam seco)
  if (anim === 'pop')
    return pos + '\\fad(0,180)\\fscx35\\fscy35\\t(0,130,\\fscx112\\fscy112)\\t(130,210,\\fscx100\\fscy100)';
  if (anim === 'blur') return pos + '\\fad(0,180)\\blur22\\alpha&HFF&\\t(0,260,\\blur0\\alpha&H00&)';
  if (anim === 'zoom')
    return pos + '\\fad(0,180)\\fscx170\\fscy170\\alpha&HFF&\\t(0,220,\\fscx100\\fscy100\\alpha&H00&)';
  if (anim === 'fade') return pos + '\\fad(220,180)';
  if (anim === 'slide') return `\\an5\\move(${Math.round(x - W * 0.07)},${y},${x},${y},0,230)\\fad(160,180)`;
  return pos + '\\fad(0,180)';
}

// Opções do render, saneadas (vêm do navegador).
function cleanOpts(j) {
  const cj = j.captions && typeof j.captions === 'object' ? j.captions : { on: j.captions !== false };
  const ovs = (Array.isArray(j.overlays) ? j.overlays : [])
    .slice(0, 30)
    .map((o) => {
      const b = {
        id: String(o.id || '').slice(0, 24),
        x: clamp(num(o.x, 0.5), 0, 1),
        y: clamp(num(o.y, 0.5), 0, 1),
        start: num(o.start),
        end: num(o.end),
      };
      if (o.type === 'image' && /^[a-z0-9]{6,32}$/.test(o.imgId || ''))
        return {
          ...b,
          type: 'image',
          imgId: o.imgId,
          w: clamp(num(o.w, 0.3), 0.02, 1),
          op: clamp(num(o.op, 1), 0.05, 1),
        };
      if (o.type === 'text' && String(o.text || '').trim())
        return {
          ...b,
          type: 'text',
          text: String(o.text).slice(0, 200),
          size: clamp(num(o.size, 0.06), 0.02, 0.3),
          color: isHex(o.color) ? o.color : '#ffffff',
          font: CS.cleanFont(o.font),
          bold: false, // o peso vem da fonte escolhida (cada fonte é um arquivo com o seu peso)
          italic: !!o.italic,
          upper: !!o.upper,
          anim: ANIMS.includes(o.anim) ? o.anim : 'none',
          box: o.box && isHex(o.box.color) ? { color: o.box.color, alpha: clamp(num(o.box.alpha, 0), 0, 1) } : null,
          outline:
            o.outline && isHex(o.outline.color)
              ? { color: o.outline.color, w: clamp(num(o.outline.w, 2), 0, 10) }
              : null,
        };
      return null;
    })
    .filter(Boolean);
  const edits = {};
  if (j.edits && typeof j.edits === 'object')
    Object.entries(j.edits)
      .slice(0, 400)
      .forEach(([k, v]) => {
        if (/^\d{1,6}$/.test(k) && typeof v === 'string') edits[k] = v.slice(0, 800);
      });
  return {
    format: Object.prototype.hasOwnProperty.call(FORMATS, j.format) ? j.format : j.vertical ? '9:16' : 'orig',
    bw: !!j.bw,
    hq: !!j.hq,
    removePauses: !!j.removePauses,
    audio: !!j.audio,
    speed: cleanSpeed(j.speed),
    // enquadramento no recorte (9:16, 1:1, 4:5…): 0 = esquerda/topo, 0,5 = centro, 1 = direita/base
    crop: {
      x: clamp(num(j.crop && j.crop.x, 0.5), 0, 1),
      y: clamp(num(j.crop && j.crop.y, 0.5), 0, 1),
    },
    audioShift: cleanShift(j.audioShift),
    voice: cleanVoice(j.voice),
    start: num(j.start),
    end: num(j.end),
    removed: (Array.isArray(j.removed) ? j.removed : [])
      .slice(0, 800)
      .map((r) => [num(r && r[0]), num(r && r[1])])
      .filter((r) => r[0] !== null && r[1] !== null && r[1] > r[0]),
    edits,
    overlays: ovs,
    look: Object.prototype.hasOwnProperty.call(LOOKS, j.look) ? j.look : 'none',
    // trechos em que a legenda some (onde há palavras de impacto ou cartela), em segundos desde o início do corte
    capHide: (Array.isArray(j.capHide) ? j.capHide : [])
      .slice(0, 150)
      .map((r) => [num(r && r[0]), num(r && r[1])])
      .filter((r) => r[0] !== null && r[1] !== null && r[1] > r[0]),
    // imagens de apoio (gaveta Apoio): foto ou vídeo do Pexels já baixado em data/broll
    // som (gaveta Som): efeitos num instante e música de fundo, que abaixa quando a voz fala
    sfx: (Array.isArray(j.sfx) ? j.sfx : [])
      .slice(0, 80)
      .map((o) => {
        const at = num(o && o.at);
        if (!o || !SOM.okSfx(o.type) || at === null || at < 0) return null;
        return { type: o.type, at, vol: clamp(num(o.vol, 0.8), 0, 1.5) };
      })
      .filter(Boolean),
    music:
      j.music && /^(fs\d{1,12}|up[a-z0-9]{6,16})$/.test(j.music.mediaId || '')
        ? {
            mediaId: j.music.mediaId,
            vol: clamp(num(j.music.vol, 0.2), 0, 1),
            duck: j.music.duck !== false,
            from: clamp(num(j.music.from, 0), 0, 3600), // começar a música a partir deste segundo dela
          }
        : null,
    broll: (Array.isArray(j.broll) ? j.broll : [])
      .slice(0, 24)
      .map((o) => {
        const a = num(o && o.start),
          b = num(o && o.end);
        if (!o || !/^[px][fv]\d{1,15}$/.test(o.mediaId || '') || a === null || b === null || !(b > a)) return null;
        return {
          mediaId: o.mediaId,
          start: a,
          end: b,
          mode: o.mode === 'card' ? 'card' : 'full',
          bw: !!o.bw,
          zoom: !!o.zoom,
        };
      })
      .filter(Boolean),
    fx: cleanFx(j.fx),
    cap: {
      on: cj.on !== false,
      style: CS.byName(cj.style).id,
      size: clamp(+cj.size || 16, 10, 32),
      pos: ['bottom', 'middle', 'top'].includes(cj.pos) ? cj.pos : 'bottom',
      // distância da borda, em % da altura (vazio = a do formato)
      margin: num(cj.margin) === null ? null : clamp(+cj.margin, 0, 40),
      words: num(cj.words) === null || !(+cj.words >= 1) ? null : clamp(Math.round(+cj.words), 1, 10),
      // o resto (fonte, cores, contorno, fundo, destaque...) é conferido pelo próprio catálogo de estilos
      ...CS.cleanProps(cj),
    },
  };
}

// Palavras do corte (tempo relativo ao início). Aplica texto editado/traduzido e palavras removidas.
function clipWords(tr, c, opt = {}) {
  const removed = opt.removed || [],
    edits = opt.edits || {},
    out = [];
  const gone = (w) => removed.some(([a, b]) => (w.s + w.e) / 2 >= a && (w.s + w.e) / 2 <= b);
  for (const sg of tr.segments) {
    if (sg.end <= c.start || sg.start >= c.end) continue;
    let ws;
    const spread = (text) => {
      const parts = text.split(/\s+/).filter(Boolean),
        tot = parts.reduce((a, x) => a + x.length, 0) || 1;
      let t0 = sg.start;
      return parts.map((x) => {
        const d = ((sg.end - sg.start) * x.length) / tot;
        const w = { t: x, s: t0, e: t0 + d };
        t0 += d;
        return w;
      });
    };
    if (edits[sg.id] !== undefined) ws = spread(edits[sg.id]);
    else if (sg.words && sg.words.length) ws = sg.words.map((w) => ({ t: String(w.w).trim(), s: w.s, e: w.e }));
    else ws = spread(sg.text);
    for (const w of ws)
      if (w.t && w.e > c.start && w.s < c.end && !gone(w))
        out.push({ t: w.t, s: Math.max(w.s, c.start) - c.start, e: Math.min(w.e, c.end) - c.start, seg: sg.id });
  }
  return out;
}

function buildAss(tr, c, opt, W, H, rel, useIv) {
  // o estilo escolhido com as mudanças feitas por cima (o mesmo cálculo da prévia, em public/caption-styles.js)
  const st = CS.resolve(opt.cap),
    cp = opt.cap;
  const upper = st.upper;
  const ow = st.ow * (H / 1080),
    shadow = st.shadow * (H / 1080);
  const font = st.font,
    fs = Math.round(H * (cp.size / 288) * st.scale);
  const al = { bottom: 2, middle: 5, top: 8 }[cp.pos],
    mv =
      cp.pos === 'middle'
        ? 0
        : Math.round(
            H * ((cp.margin === null || cp.margin === undefined ? (opt.format === '9:16' ? 22 : 8) : cp.margin) / 100),
          );
  const box = st.box,
    primary = st.mode === 'karaoke' ? st.hi : st.color,
    edge = st.glow ? st.hi : st.outline; // com brilho, o contorno fica na cor do destaque e borrado
  const styles = [
    `Style: Default,${font},${fs},${hex2ass(primary)},${hex2ass(st.color)},${hex2ass(box ? box.color : edge, box ? box.alpha : 0)},${hex2ass(box ? box.color : '#000000', box ? box.alpha : 0.5)},0,${st.italic ? -1 : 0},0,0,100,100,0,0,${box ? 3 : 1},${box ? Math.max(ow, fs * 0.18).toFixed(1) : ow.toFixed(1)},${shadow.toFixed(1)},${al},${Math.round(W * 0.06)},${Math.round(W * 0.06)},${mv},1`,
  ];
  // Entrada da frase. "pop" vale em todo evento (a cada palavra); os outros, só no primeiro evento da frase.
  const ay = cp.pos === 'top' ? mv : cp.pos === 'middle' ? H / 2 : H - mv,
    ax = W / 2;
  const enter = {
    pop: '\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)',
    fade: '\\fad(160,0)',
    slide: `\\move(${ax.toFixed(0)},${(ay + fs * 0.7).toFixed(0)},${ax.toFixed(0)},${ay.toFixed(0)},0,180)\\fad(120,0)`,
    zoom: '\\fscx55\\fscy55\\t(0,170,\\fscx100\\fscy100)',
  }[st.anim];
  const pre = (first) => (st.glow ? '\\blur6' : '') + (enter && (st.anim === 'pop' || first) ? enter : '');
  const T = (x) => (upper ? x.toUpperCase() : x);
  // uma palavra, com as cores das palavras-chave e o "cresce" da palavra falada
  const kwOn = st.kw && st.mode !== 'karaoke';
  const word = (t, { active, colored } = {}) => {
    let out = assEsc(T(t));
    const isKw = kwOn && CS.isKeyword(t, st.kwWords);
    // na "acumulando" com "cresce", a palavra falada também ganha a cor de destaque (o estilo dos cortes virais)
    if (active && st.grow && st.mode === 'reveal' && !colored)
      out = `{\\1c${tag6(st.hi)}}${out}{\\1c${tag6(st.color)}}`;
    else if (isKw && !colored) out = `{\\1c${tag6(st.kc)}}${out}{\\1c${tag6(st.color)}}`;
    // tamanho: a falada cresce (grow), a palavra-chave fica maior (emph); com "quique", a palavra falada entra
    // pequena e meio transparente, passa do tamanho e assenta (~0,18 s)
    const f = (active && st.grow ? 1.18 : 1) * (isKw && st.emph ? 1.2 : 1),
      sc = (k) => `\\fscx${Math.round(100 * f * k)}\\fscy${Math.round(100 * f * k)}`;
    if (active && st.anim === 'bounce')
      out = `{${sc(0.6)}\\alpha&H60&\\t(0,90,${sc(1.12)}\\alpha&H00&)\\t(90,180,${sc(1)})}${out}{\\fscx100\\fscy100}`;
    else if (f !== 1) out = `{${sc(1)}}${out}{\\fscx100\\fscy100}`;
    return out;
  };
  const ev = [];
  const push = (a, b, text, { first = true, layer = 1, style = 'Default', p = pre(first) } = {}) => {
    // a legenda nunca invade um trecho de impacto (corta antes dele ou começa depois)
    if (style === 'Default')
      for (const [x, y] of opt.capHide || []) {
        if (a < x && b > x) b = x;
        else if (a >= x && a < y) a = y;
      }
    if (!(b > a)) return;
    const A = rel(a),
      B = rel(b);
    if (B - A >= 0.04) ev.push(`Dialogue: ${layer},${assT(A)},${assT(B)},${style},,0,0,0,,${p ? `{${p}}` : ''}${text}`);
  };
  if (opt.cap.on) {
    const hid = opt.capHide || [];
    // As palavras ditas durante o impacto saem da legenda, e o grupo de palavras QUEBRA ali: antes, a última palavra
    // antes do impacto ficava na tela até a próxima palavra depois dele (parecia repetida por baixo da frase grande).
    const words0 = clipWords(tr, c, opt);
    let part = 0;
    const words = words0
      .map((w, i) => {
        const prev = words0[i - 1];
        if (prev && hid.some(([a, b]) => a >= (prev.s + prev.e) / 2 && a <= (w.s + w.e) / 2)) part++;
        return { ...w, seg: part ? `${w.seg}~${part}` : w.seg };
      })
      .filter((w) => !hid.some(([a, b]) => (w.s + w.e) / 2 >= a && (w.s + w.e) / 2 <= b));
    if (st.mode === 'block') {
      const bySeg = new Map();
      words.forEach((w) => {
        if (!bySeg.has(w.seg)) bySeg.set(w.seg, []);
        bySeg.get(w.seg).push(w);
      });
      for (const ws of bySeg.values()) push(ws[0].s, ws[ws.length - 1].e + 0.05, ws.map((w) => word(w.t)).join(' '));
    } else {
      const chunks = CS.chunkWords(words, st);
      chunks.forEach((ws, k) => {
        // a última palavra do grupo sai quando a próxima legenda entra (nunca as duas juntas na tela)
        const nextS = chunks[k + 1] ? chunks[k + 1][0].s : Infinity,
          tail = (e) => Math.min(e + 0.12, nextS);
        if (st.mode === 'plain') {
          push(ws[0].s, tail(ws[ws.length - 1].e), ws.map((w) => word(w.t)).join(' '));
          return;
        } // grupo de palavras sem destaque
        if (st.mode === 'karaoke') {
          const last = ws[ws.length - 1];
          push(
            ws[0].s,
            tail(last.e),
            ws
              .map((w, i) => {
                const nxt = ws[i + 1],
                  d = Math.max(1, Math.round(((nxt ? nxt.s : w.e) - w.s) * 100));
                return `{\\kf${d}}${assEsc(T(w.t))}`;
              })
              .join(' '),
          );
          return;
        }
        ws.forEach((w, i) => {
          const a = w.s,
            b = ws[i + 1] ? ws[i + 1].s : tail(w.e);
          if (st.mode === 'words1') return push(a, b, word(w.t, { active: true }));
          // surgindo: as palavras que ainda não foram ditas ficam invisíveis (ocupando o lugar, a frase não pula)
          if (st.mode === 'reveal') {
            const seen = ws.slice(0, i + 1).map((x, j) => word(x.t, { active: j === i }));
            const rest = ws.slice(i + 1).map((x) => assEsc(T(x.t)));
            return push(a, b, seen.join(' ') + (rest.length ? ` {\\alpha&HFF&}${rest.join(' ')}` : ''), {
              first: i === 0,
            });
          }
          const text = ws
            .map((x, j) => {
              if (j !== i) return word(x.t);
              const t = word(x.t, { active: true, colored: true });
              if (st.mode === 'boxhl')
                return `{\\3c${tag6(st.hi)}\\bord${(fs * 0.2).toFixed(1)}}${t}{\\3c${tag6(st.outline)}\\bord${ow.toFixed(1)}}`;
              return `{\\1c${tag6(st.hi)}}${t}{\\1c${tag6(st.color)}}`;
            })
            .join(' ');
          push(a, b, text, { first: i === 0 });
        });
      });
    }
  }
  // textos sobre o corte (cada um com seu estilo), acima da legenda
  const d = c.end - c.start;
  opt.overlays
    .filter((o) => o.type === 'text')
    .forEach((o, i) => {
      const name = `T${i}`,
        size = Math.round(o.size * H),
        bx = o.box;
      styles.push(
        `Style: ${name},${o.font},${size},${hex2ass(o.color)},${hex2ass(o.color)},${hex2ass(bx ? bx.color : o.outline ? o.outline.color : '#000000', bx ? bx.alpha : 0)},${hex2ass(bx ? bx.color : '#000000', bx ? bx.alpha : 0.5)},${o.bold ? -1 : 0},${o.italic ? -1 : 0},0,0,100,100,0,0,${bx ? 3 : 1},${bx ? Math.max(size * 0.24, 6).toFixed(1) : (o.outline ? o.outline.w * (H / 1080) : 0).toFixed(1)},0,5,10,10,10,1`,
      );
      const a = o.start === null ? 0 : clamp(o.start, 0, d),
        b = o.end === null ? d : clamp(o.end, 0, d);
      push(a, b, assEsc(o.upper ? o.text.toUpperCase() : o.text), {
        layer: 2 + i,
        style: name,
        p: animTag(o.anim, Math.round(o.x * W), Math.round(o.y * H), W),
      });
    });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${styles.join('\n')}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${ev.join('\n')}\n`;
}

// Trechos a manter ao "remover pausas": palavras com folga; junta lacunas curtas (pausa natural).
function keepIntervals(tr, c, gap = 0.5) {
  const d = c.end - c.start,
    pts = [];
  for (const s of tr.segments) {
    if (s.end <= c.start || s.start >= c.end) continue;
    if (s.words && s.words.length) {
      for (const w of s.words)
        if (w.e > c.start && w.s < c.end) pts.push([Math.max(w.s, c.start) - c.start, Math.min(w.e, c.end) - c.start]);
    } else pts.push([Math.max(s.start, c.start) - c.start, Math.min(s.end, c.end) - c.start]);
  }
  pts.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a0, b0] of pts) {
    const A = Math.max(0, a0 - 0.12),
      B = Math.min(d, b0 + 0.12),
      last = out[out.length - 1];
    if (last && A - last[1] <= gap) last[1] = Math.max(last[1], B);
    else out.push([A, B]);
  }
  return out.filter(([x, y]) => y - x >= 0.2);
}
const subtractRanges = (iv, cuts) => {
  let cur = iv;
  for (const [ca, cb] of cuts) {
    const nx = [];
    for (const [a, b] of cur) {
      if (cb <= a || ca >= b) nx.push([a, b]);
      else {
        if (ca > a) nx.push([a, ca]);
        if (cb < b) nx.push([cb, b]);
      }
    }
    cur = nx;
  }
  return cur.filter(([a, b]) => b - a >= 0.08);
};

/**
 * Kit que vai com o corte para a pasta da equipe: a legenda (.srt) gravada na exportação e um texto com título,
 * descrição, hashtags e a fala do trecho. Exportações antigas, sem .srt, ganham um quando o corte não foi encurtado
 * por dentro (pausas, palavras removidas ou velocidade); nesses casos o tempo não bateria, então vai só o texto.
 */
async function clipKit(id, m, cl) {
  const dir = U(id, 'clips'),
    r = cl.render,
    ed = cl.editor || {};
  const start = r.start ?? ed.start ?? cl.start,
    end = r.end ?? ed.end ?? cl.end;
  let srt = r.srt && fs.existsSync(path.join(dir, r.srt)) ? path.join(dir, r.srt) : null,
    speech = '';
  if (srt)
    speech = (await fsp.readFile(srt, 'utf8'))
      .split(/\r?\n\r?\n/)
      .map((b) => b.split(/\r?\n/).slice(2).join(' ').trim())
      .filter(Boolean)
      .join(' ');
  else {
    const words = clipWords(
      await readJson(U(id, 'transcript.json'), { segments: [] }),
      { start, end },
      { edits: ed.edits && typeof ed.edits === 'object' ? ed.edits : {} },
    );
    speech = words.map((w) => w.t).join(' ');
    if (r.srt === undefined && !r.removePauses && !r.removedWords && (r.speed || 1) === 1 && words.length) {
      srt = path.join(dir, `${cl.id}.srt`);
      await fsp.writeFile(srt, toSrt(cues(words)));
    }
  }
  const txt = path.join(dir, `${cl.id}.txt`);
  await fsp.writeFile(
    txt,
    kitText({ sermon: m.name.replace(/\.[^.]+$/, ''), clip: { ...cl, start, end }, seconds: r.seconds, speech }),
  );
  return { srt, txt };
}

const renders = new Map(); // `${id}:${cid}` -> { proc, cancelled, progress }
const waiting = new Set(); // exportações na fila, esperando outro trabalho terminar
async function renderClip(id, cid, rawOpt) {
  const opt = cleanOpts(rawOpt || {});
  const m = await getMeta(id);
  const clips = await readJson(U(id, 'clips.json'), []);
  const c0 = clips.find((x) => x.id === cid);
  if (!c0) return;
  const key = `${id}:${cid}`,
    state = { proc: null, cancelled: false };
  waiting.delete(key);
  renders.set(key, state);
  const setR = (r) =>
    withLock('clips:' + id, async () => {
      const cl = await readJson(U(id, 'clips.json'), []);
      const t = cl.find((x) => x.id === cid);
      if (t) {
        t.render = r;
        await writeJson(U(id, 'clips.json'), cl);
      }
    });
  const runP = (cmd, args, o = {}) =>
    run(cmd, args, {
      ...o,
      onProc: (p) => {
        state.proc = p;
      },
    });
  try {
    const dur0 = m.duration || 1e9;
    const c = {
      ...c0,
      start: clamp(opt.start === null ? c0.start : opt.start, 0, dur0),
      end: clamp(opt.end === null ? c0.end : opt.end, 0, dur0),
    };
    if (!(c.end - c.start >= 1)) throw new Error('Intervalo do corte inválido (mínimo de 1 segundo).');
    const dir = U(id, 'clips');
    await fsp.mkdir(dir, { recursive: true });
    const orig = U(id, m.file),
      audioOnly = m.kind === 'aud' || opt.audio,
      d = c.end - c.start;
    const out = `${cid}${audioOnly ? '.mp3' : '.mp4'}`;
    const tr = await readJson(U(id, 'transcript.json'), { segments: [] });
    const rm = opt.removed.map(([a, b]) => [a - c.start, b - c.start]);
    let iv = opt.removePauses ? keepIntervals(tr, c) : [[0, d]];
    if (rm.length) iv = subtractRanges(iv, rm);
    const useIv = opt.removePauses || rm.length > 0;
    if (!iv.length) throw new Error('Nada sobrou depois de remover pausas/palavras.');
    const remap = (t) => {
      let acc = 0;
      for (const [a0, b0] of iv) {
        if (t < a0) return acc;
        if (t <= b0) return acc + (t - a0);
        acc += b0 - a0;
      }
      return acc;
    };
    const rel = (t) => (useIv ? remap(t) : t);
    const total = iv.reduce((s, [a0, b0]) => s + b0 - a0, 0);
    const fcFile = `${cid}.fc`;
    let aIn = '0:a'; // de onde vem o áudio: do vídeo ou, na remoção de música, do arquivo com a voz separada
    const trims = (video) =>
      iv
        .map(
          ([a0, b0], i) =>
            `${video ? `[0:v]trim=start=${a0.toFixed(3)}:end=${b0.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` : ''}[${aIn}]atrim=start=${a0.toFixed(3)}:end=${b0.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`,
        )
        .join('') +
      iv.map((_, i) => `${video ? `[v${i}]` : ''}[a${i}]`).join('') +
      `concat=n=${iv.length}:v=${video ? 1 : 0}:a=1${video ? '[v][a]' : '[a]'}`;
    const baseIn = ['-y', '-ss', String(c.start), '-t', String(d), '-i', orig];
    // imagens sobre o corte (biblioteca)
    const images = audioOnly ? [] : opt.overlays.filter((o) => o.type === 'image');
    const imgFiles = [];
    const lib = await readJson(LIB('index.json'), []);
    for (const o of images) {
      const it = lib.find((x) => x.id === o.imgId);
      if (it) imgFiles.push({ o, file: LIB(it.id + it.ext) });
    }
    const inArgs = [...baseIn, ...imgFiles.flatMap((f) => ['-i', f.file])];
    // Sincronia: o áudio é lido do mesmo arquivo, começando um pouco antes ou depois do vídeo.
    // A sincronia da pregação inteira (meta.audioShift) vale para todos os cortes; o ajuste do corte soma a ela.
    const shift = cleanShift((m.audioShift || 0) + opt.audioShift);
    const aStart = Math.max(0, c.start - shift);
    // Remover música: separa a voz do trecho com o modelo e usa esse arquivo como o áudio do corte.
    if (opt.voice === 'ia') {
      if (!tools.demucs)
        throw new Error(
          'A remoção de música não está instalada neste computador. Rode uma vez o arquivo install/instalar-voz-ia e abra o app de novo.',
        );
      const src = `${cid}.src.wav`,
        sep = `${cid}.sep`;
      const ex = await runP(
        tools.ffmpeg,
        ['-y', '-ss', String(aStart), '-t', String(d), '-i', orig, '-vn', '-ac', '2', '-ar', '44100', src],
        { cwd: dir },
      );
      if (state.cancelled) return void (await setR({ status: 'cancelled' }));
      if (ex.code !== 0) throw new Error('Não consegui ler o áudio do corte para separar a voz.');
      const sp = await runP(
        tools.demucs[0],
        [...tools.demucs.slice(1), '--two-stems=vocals', '-n', 'htdemucs', '-o', sep, src],
        { cwd: dir },
      );
      if (state.cancelled) return void (await setR({ status: 'cancelled' }));
      const voc = path.join(sep, 'htdemucs', `${cid}.src`, 'vocals.wav');
      if (sp.code !== 0 || !fs.existsSync(path.join(dir, voc)))
        throw new Error(
          'A separação da voz falhou. ' +
            (sp.err || '')
              .split(/[\r\n]+/)
              .filter(Boolean)
              .slice(-1)
              .join('')
              .slice(0, 200),
        );
      inArgs.push('-i', voc);
      aIn = `${1 + imgFiles.length}:a`;
    } else if (aStart !== c.start && m.kind !== 'aud') {
      inArgs.push('-ss', String(aStart), '-t', String(d), '-i', orig);
      aIn = `${1 + imgFiles.length}:a`;
    }
    // imagens de apoio: cada uma é uma entrada a mais (foto repetida como vídeo, ou o vídeo em laço), só pelo tempo dela
    const brolls = [];
    if (!audioOnly)
      for (const o of opt.broll) {
        const it = await PEXELS.find(o.mediaId);
        if (!it || !fs.existsSync(PEXELS.fileOf(it))) continue;
        const A = rel(clamp(o.start, 0, d)),
          B = rel(clamp(o.end, 0, d));
        if (!(B - A >= 0.1)) continue;
        const idx = inArgs.filter((x) => x === '-i').length;
        if (it.kind === 'video')
          inArgs.push('-stream_loop', '-1', '-t', (B - A + 0.5).toFixed(2), '-i', PEXELS.fileOf(it));
        else inArgs.push('-loop', '1', '-framerate', '30', '-t', (B - A + 0.5).toFixed(2), '-i', PEXELS.fileOf(it));
        brolls.push({ o, it, idx, A, B });
      }
    // som: cada efeito é uma entrada (o arquivo gerado uma vez) e a música repete se for curta
    const sounds = [];
    let musicIn = null,
      srcMono = false;
    if (!audioOnly) {
      for (const o of opt.sfx) {
        const A = rel(clamp(o.at, 0, d));
        if (A >= total - 0.05) continue;
        const f = await SOM.sfxFile(o.type).catch(() => null);
        if (!f) continue;
        sounds.push({ o, A, idx: inArgs.filter((x) => x === '-i').length });
        inArgs.push('-i', f);
      }
      const mu = opt.music && (await SOM.findMusic(opt.music.mediaId));
      if ((sounds.length || mu) && opt.voice !== 'ia') {
        // a gravação é mono? (a voz separada pela IA já sai em estéreo)
        const pr = await runP(tools.ffmpeg, ['-hide_banner', '-i', orig]);
        srcMono = /Audio:[^\n]*\bmono\b/.test(pr.err);
      }
      if (mu && fs.existsSync(SOM.musicFile(mu))) {
        musicIn = { o: opt.music, idx: inArgs.filter((x) => x === '-i').length };
        inArgs.push(
          '-stream_loop',
          '-1',
          '-ss',
          String(opt.music.from || 0),
          '-t',
          (total + 1).toFixed(2),
          '-i',
          SOM.musicFile(mu),
        );
      }
    }
    // tamanho final (para a legenda/overlays)
    const fmt = FORMATS[opt.format];
    let W = fmt ? fmt[0] : 0,
      H = fmt ? fmt[1] : 0;
    if (!audioOnly && !fmt) {
      const pr = await runP(tools.ffmpeg, ['-i', orig]);
      const mm = pr.err.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
      W = mm ? Math.round(+mm[1] / 2) * 2 : 1080;
      H = mm ? Math.round(+mm[2] / 2) * 2 : 1920;
    }
    const wantCaps = !audioOnly && (opt.cap.on || opt.overlays.some((o) => o.type === 'text'));
    // Velocidade: aplicada no fim, depois da legenda e das imagens, para tudo continuar sincronizado. A voz não muda de tom.
    const fast = opt.speed !== 1;
    const af = fast ? atempo(opt.speed) : '';
    // O filtro vai direto na linha de comando: a opção -filter_complex_script foi retirada do ffmpeg 8 (o que o Homebrew instala hoje).
    // Só um filtro enorme (centenas de trechos) vai por arquivo, pela opção que a versão instalada aceitar.
    const fcArgs = async (fc) => {
      if (fc.length <= 20000) return ['-filter_complex', fc];
      await fsp.writeFile(path.join(dir, fcFile), fc);
      return tools.ffmpegMajor >= 7 ? ['-/filter_complex', fcFile] : ['-filter_complex_script', fcFile];
    };
    const build = async (withSubs) => {
      if (audioOnly) {
        if (useIv) {
          return [
            ...inArgs,
            ...(await fcArgs(trims(false) + (af ? `;[a]${af}[ao]` : ''))),
            '-map',
            af ? '[ao]' : '[a]',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '128k',
            out,
          ];
        }
        return [
          ...inArgs,
          '-vn',
          ...(aIn !== '0:a' ? ['-map', aIn] : []),
          ...(af ? ['-af', af] : []),
          '-c:a',
          'libmp3lame',
          '-b:a',
          '128k',
          out,
        ];
      }
      const pre = [];
      if (fmt) {
        const ar = `${W}/${H}`;
        pre.push(
          `crop=w='if(gt(iw/ih,${ar}),ih*${ar},iw)':h='if(gt(iw/ih,${ar}),ih,iw/(${ar}))':x='(iw-ow)*${opt.crop.x.toFixed(3)}':y='(ih-oh)*${opt.crop.y.toFixed(3)}'`,
          `scale=${W}:${H}`,
          'setsar=1',
        );
      } else pre.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
      if (opt.bw) pre.push('hue=s=0');
      const chain = [];
      let cur = useIv ? 'v' : '0:v';
      chain.push(`[${cur}]${pre.join(',')}[p0]`);
      cur = fxChain(chain, 'p0', opt, W, H, rel, d);
      brolls.forEach(({ o, it, idx, A, B }, i) => {
        const en = `enable='between(t,${A.toFixed(3)},${B.toFixed(3)})'`,
          ev = (x) => Math.max(2, Math.round(x / 2) * 2);
        const f = [];
        if (o.mode === 'card') {
          // cartão: a imagem menor, com borda branca, no meio; o vídeo de trás escurece
          const b = ev(W * 0.012);
          f.push(
            `scale=${ev(W * 0.8)}:${ev(H * 0.62)}:force_original_aspect_ratio=decrease`,
            `pad=iw+${2 * b}:ih+${2 * b}:${b}:${b}:color=white`,
          );
        } else f.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`);
        if (o.zoom && it.kind === 'photo' && o.mode !== 'card')
          // aproximação lenta (12% no tempo da imagem), só na tela cheia
          f.push(
            `zoompan=z='1+0.12*on/${Math.max(1, Math.round((B - A) * 30))}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30`,
          );
        if (o.bw) f.push('hue=s=0', 'eq=contrast=1.15');
        const fd = Math.min(0.2, (B - A) / 4);
        f.push(
          'setsar=1',
          'fps=30',
          'format=yuva420p',
          `setpts=PTS-STARTPTS+${A.toFixed(3)}/TB`,
          // entra e sai em fade (antes cortava seco)
          `fade=t=in:st=${A.toFixed(3)}:d=${fd.toFixed(3)}:alpha=1`,
          `fade=t=out:st=${(B - fd).toFixed(3)}:d=${fd.toFixed(3)}:alpha=1`,
        );
        chain.push(`[${idx}:v]${f.join(',')}[br${i}]`);
        if (o.mode === 'card') {
          chain.push(`[${cur}]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.6:t=fill:${en}[bd${i}]`);
          cur = `bd${i}`;
        }
        chain.push(
          `[${cur}][br${i}]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:${en}:eof_action=pass[bo${i}]`,
        );
        cur = `bo${i}`;
      });
      imgFiles.forEach((f, i) => {
        const o = f.o,
          w = Math.max(8, Math.round(o.w * W)),
          a = o.start === null ? 0 : rel(clamp(o.start, 0, d)),
          b = o.end === null ? 1e6 : rel(clamp(o.end, 0, d));
        chain.push(`[${i + 1}:v]scale=${w}:-1,format=rgba${o.op < 1 ? `,colorchannelmixer=aa=${o.op}` : ''}[im${i}]`);
        chain.push(
          `[${cur}][im${i}]overlay=x=main_w*${o.x.toFixed(4)}-overlay_w/2:y=main_h*${o.y.toFixed(4)}-overlay_h/2:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[p${i + 1}]`,
        );
        cur = `p${i + 1}`;
      });
      if (withSubs && wantCaps) {
        await fsp.writeFile(path.join(dir, `${cid}.ass`), buildAss(tr, c, opt, W, H, rel, useIv));
        const fd = await FONTS.renderFontsDir(dir, cid); // as fontes do app e as da equipe, iguais às da prévia
        chain.push(`[${cur}]subtitles=${cid}.ass:fontsdir=${fontsArg(dir, fd.dir)}[vo]`);
        cur = 'vo';
      }
      let aMap = useIv ? '[a]' : aIn === '0:a' ? '0:a?' : aIn,
        aFilter = [];
      if (fast) {
        chain.push(`[${cur}]setpts=PTS/${opt.speed}[vs]`);
        cur = 'vs';
      }
      if (sounds.length || musicIn) {
        // mistura: a voz, os efeitos (cada um no seu instante) e a música, que abaixa sozinha quando a voz fala
        // a voz vai para estéreo sem perder volume: gravação mono é copiada nos dois lados (a conversão padrão
        // do ffmpeg baixa 3 dB, e dentro da mistura ele não respeita a opção que evitaria isso)
        chain.push(
          `[${useIv ? 'a' : aIn === '0:a' ? '0:a' : aIn}]${srcMono ? 'pan=stereo|c0=c0|c1=c0' : 'aformat=channel_layouts=stereo'},aresample=48000[vz]`,
        );
        let voice = 'vz';
        const mix = [];
        if (musicIn) {
          const fadeOut = Math.max(0, total - 1.5).toFixed(3);
          chain.push(
            `[${musicIn.idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicIn.o.vol.toFixed(3)},afade=t=in:d=0.8,afade=t=out:st=${fadeOut}:d=1.5[mu]`,
          );
          if (musicIn.o.duck) {
            chain.push(`[${voice}]asplit=2[vx][vk]`);
            chain.push('[mu][vk]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[md]');
            voice = 'vx';
            mix.push('[md]');
          } else mix.push('[mu]');
        }
        sounds.forEach(({ o, A, idx }, i) => {
          const ms = Math.round(A * 1000);
          chain.push(
            `[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${o.vol.toFixed(3)},adelay=${ms}|${ms}[sx${i}]`,
          );
          mix.push(`[sx${i}]`);
        });
        chain.push(
          `[${voice}]${mix.join('')}amix=inputs=${mix.length + 1}:duration=first:dropout_transition=0:normalize=0[amx]`,
        );
        aMap = '[amx]';
        if (af) {
          chain.push(`[amx]${af}[ao]`);
          aMap = '[ao]';
        }
      } else if (af) {
        if (useIv) {
          chain.push(`[a]${af}[ao]`);
          aMap = '[ao]';
        } else aFilter = ['-af', af];
      }
      const enc = [
        '-c:v',
        'libx264',
        '-preset',
        opt.hq ? 'slow' : 'veryfast',
        '-crf',
        opt.hq ? '16' : '22',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        opt.hq ? '256k' : '160k',
        '-movflags',
        '+faststart',
        out,
      ];
      const fc = (useIv ? `${trims(true)};` : '') + chain.join(';');
      return [...inArgs, ...(await fcArgs(fc)), '-map', `[${cur}]`, '-map', aMap, ...aFilter, ...enc];
    };
    // quanto já foi (o ffmpeg escreve "time=hh:mm:ss.xx"), para a tela mostrar a porcentagem
    const progress = (txt) => {
      const mm = /time=(\d+):(\d+):([\d.]+)/.exec(txt);
      if (mm)
        state.progress = Math.min(
          99,
          Math.round(((+mm[1] * 3600 + +mm[2] * 60 + +mm[3]) / (total / opt.speed || 1)) * 100),
        );
    };
    if (wantCaps && tools.libass === false)
      throw new Error(
        'O ffmpeg deste computador não sabe desenhar legenda (falta a libass), então o vídeo sairia sem a legenda e sem os textos. No Mac, no Terminal: "brew install ffmpeg-full" (o "ffmpeg" comum do Homebrew vem sem legenda desde 2026) e abra o Studio de novo. Para exportar sem legenda, desligue a legenda e os textos do corte.',
      );
    const captions = wantCaps,
      r = await runP(tools.ffmpeg, await build(true), { cwd: dir, onStderr: progress });
    if (state.cancelled) return void (await setR({ status: 'cancelled' }));
    // Antes, se a legenda falhasse, o vídeo era exportado de novo sem ela, sem avisar. Não mais: a pessoa pediu
    // legenda, então a exportação para e mostra o motivo (o detalhe do ffmpeg vai para o log do servidor).
    if (r.code !== 0 && wantCaps) {
      const tail = r.err
        .split(/[\r\n]+/)
        .filter(Boolean)
        .slice(-12)
        .join(' | ');
      log('legenda falhou na exportação', id, cid, tail.slice(0, 1500));
      const why = (
        r.err
          .split(/[\r\n]+/)
          .filter((l) => /subtitles|libass|ass|font|Fontconfig|No such filter|Error/i.test(l))
          .slice(-2)
          .join(' ') || tail.slice(-300)
      ).slice(0, 300);
      throw new Error(
        'A legenda (ou um texto) não conseguiu ser desenhada no vídeo, então a exportação parou para não sair sem ela. Detalhe do ffmpeg: ' +
          why,
      );
    }
    if (state.cancelled) return void (await setR({ status: 'cancelled' }));
    if (r.code !== 0) {
      const ls = r.err.split(/[\r\n]+/).filter(Boolean);
      throw new Error(
        (
          ls
            .filter(
              (l) => /error|invalid|no such|unable|not found|failed|unknown/i.test(l) && !/Conversion failed/i.test(l),
            )
            .slice(-2)
            .join(' ') || ls.slice(-2).join(' ')
        ).slice(0, 300),
      );
    }
    // O ffmpeg termina "com sucesso" mesmo quando o trecho fica todo depois do fim do vídeo: sai um arquivo vazio.
    const outSize = (await fsp.stat(path.join(dir, out)).catch(() => ({ size: 0 }))).size;
    if (outSize < 2048)
      throw new Error(
        'O arquivo exportado saiu vazio: confira se o começo e o fim do corte estão dentro da duração do vídeo.',
      );
    // Legenda do corte para quem edita: no tempo do vídeo exportado (sem os trechos removidos e na velocidade escolhida).
    const kc = cues(clipWords(tr, c, opt).map((w) => ({ t: w.t, s: rel(w.s) / opt.speed, e: rel(w.e) / opt.speed })));
    const srt = kc.length ? `${cid}.srt` : null;
    if (srt) await fsp.writeFile(path.join(dir, srt), toSrt(kc));
    else await fsp.rm(path.join(dir, `${cid}.srt`), { force: true });
    await setR({
      status: 'done',
      file: out,
      srt,
      start: c.start,
      end: c.end,
      format: audioOnly ? null : opt.format,
      vertical: opt.format === '9:16',
      bw: opt.bw,
      hq: opt.hq,
      removePauses: opt.removePauses,
      speed: opt.speed,
      audioShift: shift,
      voice: opt.voice,
      removedWords: rm.length,
      overlays: imgFiles.length + opt.overlays.filter((o) => o.type === 'text').length,
      captions,
      audio: audioOnly,
      seconds: +(total / opt.speed).toFixed(1),
      at: Date.now(),
    });
  } catch (e) {
    await setR(state.cancelled ? { status: 'cancelled' } : { status: 'error', error: e.message });
  } finally {
    renders.delete(key);
    for (const f of [`${cid}.src.wav`, `${cid}.sep`, `${cid}.fonts`])
      await fsp.rm(U(id, 'clips', f), { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  buildAss,
  LOOKS,
  FX_TYPES,
  ANIMS,
  clamp,
  cleanOpts,
  clipWords,
  clipKit,
  renders,
  waiting,
  renderClip,
};
