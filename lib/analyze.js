// Análise do texto transcrito: capítulos, momentos (cortes sugeridos) e emoções.
// Sem IA usa heurísticas locais simples (marcadas como tal). Com IA (Claude ou OpenAI, a que tiver chave: ver lib/ai.js),
// os capítulos e as emoções vêm dela. Os cortes da IA são pedidos à parte (suggestCuts).
const EMOTIONS = ['Determinação', 'Confiança', 'Esperança', 'Humildade', 'Gratidão', 'Alegria', 'Tristeza', 'Medo', 'Raiva', 'Compaixão', 'Neutra'];
const STOP = new Set('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre até que se e ou mas porque como quando onde quem qual quais isso isto esse essa esses essas este esta estes estas aquele aquela eu tu ele ela nós vocês eles elas me te lhe nos lhes meu minha teu tua seu sua nosso nossa não sim já mais muito muita muitos muitas bem mal só também então aí ali aqui lá ser estar ter haver fazer ir vir foi era são está estão tem têm vai vamos pode podem vou tinha tinham ainda assim depois antes agora hoje sempre nunca tudo todo toda todos todas cada outro outra outros outras mesmo mesma coisa coisas né tá tô pra pro'.split(' '));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (t) => (t.toLowerCase().match(/[\p{L}]{4,}/gu) || []).filter((w) => !STOP.has(w));
const topKeywords = (text, n = 3) => { const c = new Map(); words(text).forEach((w) => c.set(w, (c.get(w) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map((e) => e[0]); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function heuristic(tr) {
  const segs = tr.segments, dur = tr.duration || (segs.length ? segs[segs.length - 1].end : 0);
  const out = { mode: 'heuristic', note: 'Análise local simples, sem IA generativa: capítulos por pausas, cortes por ritmo de fala. Emoções e capítulos por IA exigem uma chave do Claude ou da OpenAI.', chapters: [], clips: [], emotions: [] };
  if (!segs.length) return out;
  // capítulos: N janelas, fronteira na maior pausa perto do ponto ideal
  const N = Math.max(1, Math.min(20, Math.round(dur / 420)));
  const cuts = [0];
  for (let k = 1; k < N; k++) {
    const ideal = (k * dur) / N; let best = -1, bestGap = -1;
    for (let i = 1; i < segs.length; i++) { if (Math.abs(segs[i].start - ideal) > 60) continue; const gap = segs[i].start - segs[i - 1].end; if (gap > bestGap) { bestGap = gap; best = i; } }
    if (best < 0) best = segs.findIndex((s) => s.start >= ideal);
    if (best > cuts[cuts.length - 1]) cuts.push(best);
  }
  cuts.forEach((s, k) => {
    const e = (cuts[k + 1] ?? segs.length) - 1, text = segs.slice(s, e + 1).map((x) => x.text).join(' ');
    const kw = topKeywords(text, 3);
    out.chapters.push({ title: kw.length ? cap(kw.join(', ')) : `Parte ${k + 1}`, summary: trunc(segs[s].text, 180), tags: kw, start: segs[s].start, end: segs[e].end, first: s, last: e });
  });
  // cortes: janelas de 20–60s terminando em fim de frase, nota por ritmo e marcas
  const cands = [];
  for (let i = 0; i < segs.length; i++) {
    let j = i; while (j < segs.length - 1 && segs[j].end - segs[i].start < 25) j++;
    while (j < segs.length - 1 && !/[.!?…]$/.test(segs[j].text) && segs[j].end - segs[i].start < 60) j++;
    const d = segs[j].end - segs[i].start; if (d < 15 || d > 75) continue;
    const text = segs.slice(i, j + 1).map((x) => x.text).join(' '), wps = text.split(/\s+/).length / d;
    const score = Math.round(Math.max(30, Math.min(95, 45 + 22 * Math.min(1, wps / 3) + (text.includes('?') ? 8 : 0) + (text.includes('!') ? 6 : 0) + Math.min(14, topKeywords(text, 5).length * 3))));
    cands.push({ i, j, score, d, text });
  }
  cands.sort((a, b) => b.score - a.score);
  const K = Math.max(3, Math.min(30, Math.round(dur / 120))), used = [];
  for (const c of cands) { if (used.length >= K) break; if (used.some((u) => !(c.j < u.i || c.i > u.j))) continue; used.push(c); }
  out.clips = used.sort((a, b) => b.score - a.score).map((c) => ({ title: trunc(segs[c.i].text.replace(/[.!?…]+$/, ''), 64), description: 'Trecho sugerido por heurística local (sem IA): boa densidade de fala e fim de frase limpo.', tags: topKeywords(c.text, 2).map(cap), score: c.score, type: 'Trecho', start: segs[c.i].start, end: segs[c.j].end, first: c.i, last: c.j, emotion: null }));
  return out;
}

const AI_SCHEMA = {
  type: 'object',
  properties: {
    chapters: { type: 'array', items: { type: 'object', properties: {
      start: { type: 'integer', description: 'Índice da fala em que o capítulo começa.' },
      title: { type: 'string', description: 'Título curto do capítulo.' },
      summary: { type: 'string', description: 'Resumo em 1 ou 2 frases.' },
      tags: { type: 'array', items: { type: 'string' } },
    }, required: ['start', 'title', 'summary', 'tags'], additionalProperties: false } },
    emotions: { type: 'array', items: { type: 'object', properties: {
      i: { type: 'integer', description: 'Índice da fala.' },
      emotion: { type: 'string', enum: EMOTIONS },
    }, required: ['i', 'emotion'], additionalProperties: false } },
  },
  required: ['chapters', 'emotions'],
  additionalProperties: false,
};

const SYS = [
  'Você analisa a transcrição de uma pregação em português. Cada fala vem numerada: [índice] minuto:segundo texto.',
  'Divida o trecho em capítulos, em ordem, cada um começando na fala em que o assunto muda. Dê a cada capítulo um título curto, um resumo de 1 ou 2 frases e algumas palavras-chave.',
  'Marque o tom emocional só das falas em que ele é claro e relevante, no máximo uma emoção por fala. Não marque todas as falas.',
  'Use apenas os índices fornecidos e não invente conteúdo que não está no texto.',
].join('\n');

/** Capítulos e emoções pela IA ativa (cfg.aiAsk). Os cortes da IA são pedidos à parte, por suggestCuts. */
async function withAI(cfg, tr) {
  const segs = tr.segments, fmt = (i) => `[${i}] ${Math.floor(segs[i].start / 60)}:${String(Math.floor(segs[i].start % 60)).padStart(2, '0')} ${segs[i].text.slice(0, 300)}`;
  const chunks = []; let cur = [], len = 0;
  for (let i = 0; i < segs.length; i++) { const l = fmt(i); if (len + l.length > 60000 && cur.length) { chunks.push(cur); cur = []; len = 0; } cur.push(i); len += l.length + 1; }
  if (cur.length) chunks.push(cur);
  const res = { mode: 'llm', model: cfg.aiLabel || 'IA', chapters: [], clips: [], emotions: [] };
  for (const idxs of chunks) {
    const j = await cfg.aiAsk({ system: SYS, user: `Transcrição (falas ${idxs[0]} a ${idxs[idxs.length - 1]}):\n` + idxs.map(fmt).join('\n'), schema: AI_SCHEMA }) || {};
    const ok = (n) => Number.isInteger(n) && n >= idxs[0] && n <= idxs[idxs.length - 1];
    (j.chapters || []).filter((c) => ok(c.start)).forEach((c) => res.chapters.push({ title: String(c.title || '').slice(0, 120), summary: String(c.summary || '').slice(0, 400), tags: (c.tags || []).slice(0, 5).map(String), first: c.start }));
    (j.emotions || []).filter((e) => ok(e.i) && EMOTIONS.includes(e.emotion)).forEach((e) => res.emotions.push({ i: e.i, emotion: e.emotion }));
  }
  res.chapters.sort((x, y) => x.first - y.first).forEach((c, k, all) => { const nx = all[k + 1]; c.last = (nx ? nx.first : segs.length) - 1; c.start = segs[c.first].start; c.end = segs[c.last].end; });
  if (!res.chapters.length) throw new Error('a IA não devolveu capítulos');
  return res;
}

async function analyze(cfg, tr, log = () => {}) {
  if (cfg.aiAsk) { try { return await withAI(cfg, tr); } catch (e) { log('IA falhou na análise, usando a análise local: ' + e.message); const h = heuristic(tr); h.note = `A IA não conseguiu analisar esta pregação (${e.message}). ${h.note}`; return h; } }
  return heuristic(tr);
}

module.exports = { analyze, heuristic, EMOTIONS };
