// Kit do corte para quem edita: a legenda (.srt) no tempo do vídeo exportado e um texto com o que é preciso para publicar.
const pad = (n, w = 2) => String(n).padStart(w, '0');
const srtT = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = s % 60;
  return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(x);
};
const PUNCT = /[.,;:!?…]["”')\]]?$/;

/**
 * Agrupa as palavras (tempo já no vídeo exportado, em segundos) em blocos curtos de legenda, bons para o CapCut:
 * até `maxChars` letras e `maxSec` segundos; fecha o bloco numa pausa longa e, se ele já tiver um tamanho razoável, na pontuação.
 */
function cues(words, { maxChars = 42, maxSec = 3.5, gap = 0.8, minChars = 18 } = {}) {
  const ws = words
    .filter((w) => w && String(w.t || '').trim() && w.e > w.s)
    .map((w) => ({ t: String(w.t).trim(), s: w.s, e: w.e }))
    .sort((a, b) => a.s - b.s);
  const out = [];
  let cur = null;
  const close = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const w of ws) {
    if (cur) {
      const text = cur.text + ' ' + w.t;
      if (text.length > maxChars || w.e - cur.s > maxSec || w.s - cur.e > gap) close();
    }
    if (!cur) cur = { s: w.s, e: w.e, text: w.t };
    else {
      cur.text += ' ' + w.t;
      cur.e = w.e;
    }
    if (PUNCT.test(w.t) && cur.text.length >= minChars) close();
  }
  close();
  // Cada bloco fica ao menos 0,5 s na tela, sem invadir o seguinte.
  out.forEach((c, i) => {
    const next = out[i + 1];
    c.e = Math.max(c.e, Math.min(c.s + 0.5, next ? next.s : Infinity));
    if (next && c.e > next.s) c.e = next.s;
  });
  return out;
}

const toSrt = (list) => list.map((c, i) => `${i + 1}\n${srtT(c.s)} --> ${srtT(c.e)}\n${c.text}\n`).join('\n');

/** Texto que acompanha o corte no Drive: título, descrição e hashtags (quando houver) e de onde o trecho veio. */
function kitText({ sermon, clip, seconds, speech }) {
  const post = clip.post || {},
    parts = [post.title || clip.title || 'Corte'];
  if (post.description) parts.push(post.description);
  if (post.hashtags && post.hashtags.length) parts.push([].concat(post.hashtags).join(' '));
  const info = [`Pregação: ${sermon}`, `Trecho na pregação: ${mmss(clip.start)} a ${mmss(clip.end)}`];
  if (seconds) info.push(`Duração do corte: ${mmss(seconds)}`);
  if (!post.title) info.push('Título, descrição e hashtags: use "Gerar texto" no app (com IA) ou escreva na edição.');
  parts.push('---', info.join('\n'));
  if (speech) parts.push('Fala do trecho:\n' + speech);
  return parts.join('\n\n') + '\n';
}

module.exports = { cues, toSrt, kitText, srtT };
