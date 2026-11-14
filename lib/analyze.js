// Análise do texto transcrito: capítulos, momentos (cortes sugeridos) e emoções.
// Sem chave de LLM usa heurísticas locais simples (marcadas como tal). Com OPENAI_API_KEY usa um LLM.
const EMOTIONS = ['Determinação', 'Confiança', 'Esperança', 'Humildade', 'Gratidão', 'Alegria', 'Tristeza', 'Medo', 'Raiva', 'Compaixão', 'Neutra'];
const STOP = new Set('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre até que se e ou mas porque como quando onde quem qual quais isso isto esse essa esses essas este esta estes estas aquele aquela eu tu ele ela nós vocês eles elas me te lhe nos lhes meu minha teu tua seu sua nosso nossa não sim já mais muito muita muitos muitas bem mal só também então aí ali aqui lá ser estar ter haver fazer ir vir foi era são está estão tem têm vai vamos pode podem vou tinha tinham ainda assim depois antes agora hoje sempre nunca tudo todo toda todos todas cada outro outra outros outras mesmo mesma coisa coisas né tá tô pra pro'.split(' '));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (t) => (t.toLowerCase().match(/[\p{L}]{4,}/gu) || []).filter((w) => !STOP.has(w));
const topKeywords = (text, n = 3) => { const c = new Map(); words(text).forEach((w) => c.set(w, (c.get(w) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map((e) => e[0]); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function heuristic(tr) {
  const segs = tr.segments, dur = tr.duration || (segs.length ? segs[segs.length - 1].end : 0);
  const out = { mode: 'heuristic', note: 'Análise local simples, sem IA generativa: capítulos por pausas, cortes por ritmo de fala. Emoções exigem OPENAI_API_KEY.', chapters: [], clips: [], emotions: [] };
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

async function chat(cfg, system, user) {
  const r = await fetch(`${cfg.openaiBase}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiKey}` },
    body: JSON.stringify({ model: cfg.openaiModel, response_format: { type: 'json_object' }, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

const SYS = `Você analisa transcrições de áudio/vídeo em português. Responda SOMENTE JSON válido com as chaves:
"chapters": [{"start": <índice da fala>, "title": "...", "summary": "1-2 frases", "tags": ["..."]}],
"clips": [{"start": <índice>, "end": <índice>, "title": "...", "description": "por que funciona", "tags": ["..."], "score": 0-100, "type": "Gancho|História|Opinião|Prova|Ensino|Pergunta"}],
"emotions": [{"i": <índice>, "emotion": "${EMOTIONS.join('|')}"}].
Regras: use apenas os índices fornecidos; cada corte deve durar entre 15 e 90 segundos e começar/terminar em limites naturais de frase; capítulos em ordem crescente de "start"; no máximo 1 emoção por fala, só nas falas relevantes; não invente conteúdo que não está no texto.`;

async function withLLM(cfg, tr) {
  const segs = tr.segments, fmt = (i) => `[${i}] ${Math.floor(segs[i].start / 60)}:${String(Math.floor(segs[i].start % 60)).padStart(2, '0')} ${segs[i].text.slice(0, 300)}`;
  const chunks = []; let cur = [], len = 0;
  for (let i = 0; i < segs.length; i++) { const l = fmt(i); if (len + l.length > 60000 && cur.length) { chunks.push(cur); cur = []; len = 0; } cur.push(i); len += l.length + 1; }
  if (cur.length) chunks.push(cur);
  const res = { mode: 'llm', model: cfg.openaiModel, chapters: [], clips: [], emotions: [] };
  for (const idxs of chunks) {
    const j = await chat(cfg, SYS, `Transcrição (trecho ${idxs[0]}–${idxs[idxs.length - 1]}):\n` + idxs.map(fmt).join('\n'));
    const ok = (n) => Number.isInteger(n) && n >= idxs[0] && n <= idxs[idxs.length - 1];
    (j.chapters || []).filter((c) => ok(c.start)).forEach((c) => res.chapters.push({ title: String(c.title || '').slice(0, 120), summary: String(c.summary || '').slice(0, 400), tags: (c.tags || []).slice(0, 5).map(String), first: c.start }));
    (j.clips || []).filter((c) => ok(c.start) && ok(c.end) && c.end >= c.start).forEach((c) => res.clips.push({ title: String(c.title || '').slice(0, 120), description: String(c.description || '').slice(0, 300), tags: (c.tags || []).slice(0, 4).map(String), score: Math.max(0, Math.min(100, Math.round(+c.score || 0))), type: String(c.type || 'Trecho'), first: c.start, last: c.end, start: segs[c.start].start, end: segs[c.end].end }));
    (j.emotions || []).filter((e) => ok(e.i) && EMOTIONS.includes(e.emotion)).forEach((e) => res.emotions.push({ i: e.i, emotion: e.emotion }));
  }
  res.chapters.sort((a, b) => a.first - b.first).forEach((c, k, a) => { const nx = a[k + 1]; c.last = (nx ? nx.first : segs.length) - 1; c.start = segs[c.first].start; c.end = segs[c.last].end; });
  res.clips = res.clips.filter((c) => c.end - c.start >= 8).sort((a, b) => b.score - a.score).slice(0, 40);
  if (!res.chapters.length) throw new Error('LLM não devolveu capítulos');
  return res;
}

async function analyze(cfg, tr, log = () => {}) {
  if (cfg.llmEnabled) { try { return await withLLM(cfg, tr); } catch (e) { log('LLM falhou, usando heurística: ' + e.message); const h = heuristic(tr); h.note = `LLM indisponível (${e.message}). ${h.note}`; return h; } }
  return heuristic(tr);
}

module.exports = { analyze, heuristic, EMOTIONS };
