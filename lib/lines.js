// Quebra os segmentos da transcrição em linhas curtas, usando o tempo de cada palavra.
// Não transcreve de novo: só reorganiza o que já está em transcript.json.
const key = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const ENDS_PHRASE = /[.,;:!?…]["')\]]?$/;

function splitLines(segments, opts = {}) {
  const maxSec = opts.maxSec > 0 ? opts.maxSec : 5;
  const out = [];
  (segments || []).forEach((sg, seg) => {
    const text = String(sg.text || '').trim();
    const words = (sg.words || []).map((w) => ({ t: String(w.w).trim(), s: w.s, e: w.e })).filter((w) => w.t);
    // Sem tempos por palavra, ou texto reescrito à mão (as palavras já não correspondem): uma linha só.
    if (!words.length || key(words.map((w) => w.t).join('')) !== key(text)) {
      out.push({ seg, start: sg.start, end: sg.end, text, speaker: sg.speaker, words: [] });
      return;
    }
    // O serviço costuma devolver as palavras sem pontuação. Quando elas batem uma a uma com o texto da fala,
    // a linha usa o texto da fala (com pontuação e com as correções feitas à mão) e o tempo de cada palavra.
    const toks = text.split(/\s+/);
    if (toks.length === words.length && toks.every((t, i) => key(t) === key(words[i].t))) words.forEach((w, i) => { w.t = toks[i]; });
    const push = (ws) => out.push({ seg, start: ws[0].s, end: ws[ws.length - 1].e, text: ws.map((w) => w.t).join(' '), speaker: sg.speaker, words: ws });
    let cur = [];
    for (const w of words) {
      if (cur.length && w.e - cur[0].s > maxSec + 1e-6) {
        // Recua até a última pontuação, desde que ela esteja na segunda metade da linha.
        let cut = cur.length;
        for (let i = cur.length - 2; i >= cur.length / 2; i--) if (ENDS_PHRASE.test(cur[i].t)) { cut = i + 1; break; }
        push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
      cur.push(w);
    }
    if (cur.length) push(cur);
  });
  return out;
}

module.exports = { splitLines };
