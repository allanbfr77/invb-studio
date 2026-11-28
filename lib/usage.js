// Gastos com as APIs (aba Gastos): cada chamada paga ou contada vira uma linha em data/usage.jsonl, com o custo
// estimado na hora (tokens × preço do modelo, ou segundos de áudio × preço por hora). Os preços ficam aqui e podem
// ser ajustados na própria aba (data/usage-settings.json), porque mudam com o tempo e por conta.
// Os bancos grátis (Pixabay, Pexels, Freesound) entram só como contagem, para ver o uso.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { cfg } = require('./config');
const { readJson, writeJson } = require('./store');

const FILE = () => path.join(cfg.dataDir, 'usage.jsonl');
const SETTINGS = () => path.join(cfg.dataDir, 'usage-settings.json');

// US$ por milhão de tokens (entrada, saída, cache lido, cache escrito) e US$ por hora de áudio.
// Claude: tabela oficial (nov/2026). OpenAI e Groq: estimativas; confira no site de cada uma e ajuste na aba.
const DEFAULT_PRICES = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'whisper-large-v3': { hour: 0.111 },
  'whisper-large-v3-turbo': { hour: 0.04 },
  'whisper-1': { hour: 0.36 },
};
const FEATURES = {
  cortes: 'Cortes sugeridos',
  analise: 'Capítulos e emoções',
  texto: 'Texto do corte (título, descrição)',
  titulos: 'Outros títulos',
  encurtar: 'Encurtar corte',
  design: 'Direção de arte (Impacto)',
  apoio: 'Imagens de apoio',
  musica: 'Música de fundo',
  revisao: 'Revisão da transcrição',
  traducao: 'Tradução da legenda',
  transcricao: 'Transcrição',
  compartilhar: 'Links compartilhados',
  outros: 'Outros',
};

async function settings() {
  const s = await readJson(SETTINGS(), {});
  return {
    budget: Number.isFinite(+s.budget) && +s.budget > 0 ? +s.budget : null, // US$ por mês
    dollar: Number.isFinite(+s.dollar) && +s.dollar > 0 ? +s.dollar : 5.5, // R$ por US$ (para mostrar em reais)
    prices: { ...DEFAULT_PRICES, ...(s.prices && typeof s.prices === 'object' ? s.prices : {}) },
  };
}
async function saveSettings(j) {
  const s = await readJson(SETTINGS(), {});
  if ('budget' in j) s.budget = +j.budget > 0 ? +j.budget : null;
  if ('dollar' in j && +j.dollar > 0) s.dollar = +j.dollar;
  if (j.prices && typeof j.prices === 'object') {
    s.prices = s.prices || {};
    for (const [m, p] of Object.entries(j.prices)) {
      if (!/^[\w.-]{2,60}$/.test(m) || !p || typeof p !== 'object') continue;
      const clean = {};
      for (const k of ['in', 'out', 'cacheRead', 'cacheWrite', 'hour']) if (+p[k] >= 0 && p[k] !== '') clean[k] = +p[k];
      s.prices[m] = clean;
    }
  }
  await writeJson(SETTINGS(), s);
  return settings();
}

const costOf = (r, prices) => {
  const p = prices[r.model];
  if (!p) return null;
  if (r.seconds && p.hour !== undefined) return (r.seconds / 3600) * p.hour;
  const M = 1e6;
  return (
    ((r.inTok || 0) * (p.in || 0) +
      (r.outTok || 0) * (p.out || 0) +
      (r.cacheRead || 0) * (p.cacheRead ?? p.in ?? 0) +
      (r.cacheWrite || 0) * (p.cacheWrite ?? p.in ?? 0)) /
    M
  );
};

/** Registra uma chamada. Nunca derruba quem chamou: erro aqui só vai para o log. */
async function add(r) {
  try {
    const row = {
      at: Date.now(),
      api: String(r.api || 'outra'),
      model: String(r.model || ''),
      feature: FEATURES[r.feature] ? r.feature : 'outros',
    };
    for (const k of ['inTok', 'outTok', 'cacheRead', 'cacheWrite', 'seconds', 'bytes', 'count'])
      if (+r[k] > 0) row[k] = Math.round(+r[k] * 100) / 100;
    const c = costOf(row, (await settings()).prices);
    if (c !== null) row.cost = Math.round(c * 1e6) / 1e6;
    await fsp.mkdir(cfg.dataDir, { recursive: true });
    await fsp.appendFile(FILE(), JSON.stringify(row) + '\n');
  } catch (e) {
    require('./store').log('gastos: não consegui registrar', e.message);
  }
}

/** Resumo de um mês (AAAA-MM): total, por API, por recurso, por dia, e as últimas chamadas. */
async function summary(month) {
  const s = await settings();
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  let text = '';
  try {
    text = await fsp.readFile(FILE(), 'utf8');
  } catch {
    /* ainda sem registros */
  }
  const rows = [];
  const months = new Set();
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      const mm = new Date(r.at).toISOString().slice(0, 7);
      months.add(mm);
      if (mm === m) rows.push(r);
    } catch {
      /* linha estragada */
    }
  }
  const sum = (list, k) => list.reduce((a, r) => a + (r[k] || 0), 0);
  const group = (key) => {
    const g = {};
    for (const r of rows) {
      const k = r[key];
      g[k] = g[k] || { calls: 0, cost: 0, inTok: 0, outTok: 0, seconds: 0, bytes: 0, unknown: 0 };
      g[k].calls++;
      g[k].cost += r.cost || 0;
      if (r.cost === undefined && !['pixabay', 'pexels', 'freesound', 'vercel-blob'].includes(r.api)) g[k].unknown++;
      for (const f of ['inTok', 'outTok', 'seconds', 'bytes']) g[k][f] += r[f] || 0;
    }
    return g;
  };
  const days = {};
  for (const r of rows) {
    const d = new Date(r.at).toISOString().slice(0, 10);
    days[d] = (days[d] || 0) + (r.cost || 0);
  }
  return {
    month: m,
    months: [...months, m]
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort()
      .reverse(),
    total: sum(rows, 'cost'),
    calls: rows.length,
    byApi: group('api'),
    byFeature: group('feature'),
    features: FEATURES,
    days,
    last: rows.slice(-40).reverse(),
    budget: s.budget,
    dollar: s.dollar,
    prices: s.prices,
  };
}

module.exports = { add, summary, settings, saveSettings, DEFAULT_PRICES, FEATURES, costOf };
