// Recursos de IA com o Claude (SDK oficial da Anthropic). Só ficam ativos em quem tem ANTHROPIC_API_KEY
// na configuração pessoal; sem a chave, o app não mostra nada disso e nem carrega o SDK.
const { stamp } = require('./cutlist');

const MODEL = 'claude-opus-5-5';
let sdk; // carregado sob demanda: o app funciona sem o pacote instalado, só não oferece IA
const loadSdk = () => {
  if (sdk === undefined) {
    try {
      sdk = require('@anthropic-ai/sdk');
    } catch {
      sdk = null;
    }
  }
  return sdk;
};

/** A IA pode ser oferecida neste computador? Precisa da chave e do SDK instalado (npm install). */
const aiAvailable = (apiKey) => !!apiKey && !!loadSdk();

const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * Uma pergunta ao Claude com resposta em JSON no formato de `schema`. Devolve o objeto já lido.
 * `client` existe para os testes; no uso normal o cliente é criado com `apiKey`.
 */
async function ask({ apiKey, client, system, user, schema }) {
  const Anthropic = loadSdk();
  const c = client || (Anthropic ? new Anthropic({ apiKey }) : null);
  if (!c)
    throw fail(501, 'O SDK do Claude não está instalado neste computador. Rode "npm install" na pasta do projeto.');
  let res;
  try {
    res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Se o modelo recusar o pedido, a própria API tenta de novo em outro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    if (Anthropic && e instanceof Anthropic.AuthenticationError)
      throw fail(401, 'A chave da API do Claude foi recusada. Confira ANTHROPIC_API_KEY na sua configuração pessoal.');
    if (Anthropic && e instanceof Anthropic.PermissionDeniedError)
      throw fail(403, 'A chave da API do Claude não tem permissão para este modelo.');
    if (Anthropic && e instanceof Anthropic.RateLimitError)
      throw fail(429, 'O limite de uso da API do Claude foi atingido. Espere um pouco e tente de novo.');
    if (Anthropic && e instanceof Anthropic.APIConnectionError) throw fail(502, 'Sem conexão com a API do Claude.');
    if (Anthropic && e instanceof Anthropic.APIError)
      throw fail(
        502,
        `A API do Claude devolveu um erro (${e.status || 'sem código'}): a requisição foi recusada ou é inválida. ${String(e.message || '').slice(0, 200)}`,
      );
    throw e;
  }
  if (res.stop_reason === 'refusal') throw fail(502, 'O Claude recusou analisar este conteúdo.');
  if (res.stop_reason === 'max_tokens') throw fail(502, 'A resposta do Claude veio incompleta. Tente de novo.');
  const text = (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw fail(502, 'O Claude respondeu em um formato inesperado. Tente de novo.');
  }
}

/* ---------- Sugestão de cortes ---------- */
const CUTS_SCHEMA = {
  type: 'object',
  properties: {
    cuts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number', description: 'Início do corte, em segundos desde o começo do vídeo.' },
          end_seconds: { type: 'number', description: 'Fim do corte, em segundos desde o começo do vídeo.' },
          title: { type: 'string', description: 'Título curto do corte, em português.' },
          reason: { type: 'string', description: 'Uma frase dizendo por que este trecho funciona sozinho.' },
          score: {
            type: 'integer',
            description:
              'Nota de 0 a 100 para a força do trecho como pregação: 90 ou mais só para os momentos mais marcantes.',
          },
        },
        required: ['start_seconds', 'end_seconds', 'title', 'reason', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['cuts'],
  additionalProperties: false,
};

const CUTS_SYSTEM = [
  'Você ajuda a equipe de mídia de uma igreja a escolher trechos de uma pregação para publicar como vídeos curtos.',
  'O que se procura são os momentos fortes da pregação: o pregador ensinando, exortando ou refletindo sobre a Palavra de Deus, com convicção, de um jeito que toca quem ouve.',
  'Um bom corte funciona sozinho para quem não viu o resto: tem começo claro, uma ideia completa e um fim que fecha o pensamento.',
  'Prefira uma verdade bíblica explicada com clareza, uma reflexão que confronta ou consola, uma aplicação prática direta, ou uma ilustração completa que leva a uma lição.',
  'Nunca escolha momentos de oração: nem o pregador orando, nem convidando a igreja a orar, nem a oração de encerramento, que costuma ficar no final da pregação. Se um trecho bom termina em oração, encerre o corte antes de a oração começar.',
  'Também não escolha louvor ou música, a abertura, avisos e anúncios, ofertas, saudações, apresentações, leituras longas sem comentário, nem trechos que dependem do que veio antes.',
  'Dê a cada corte uma nota de 0 a 100 pela força como pregação: 90 ou mais só para os momentos realmente marcantes, 75 a 89 para trechos bons, abaixo de 75 para os aproveitáveis mas comuns. Seja exigente e use a escala inteira; não dê a mesma nota a todos.',
  'Se a pregação não tiver trechos fortes o bastante, devolva menos cortes do que o pedido em vez de completar com trechos fracos.',
  'Comece cada corte no início de uma frase e termine no fim de uma frase, usando os tempos da transcrição.',
  'Os tempos da transcrição aparecem como [minutos:segundos] ou [horas:minutos:segundos]; responda sempre em segundos desde o início do vídeo.',
].join('\n');

/** Sugestões de cortes para uma pregação: [{ start, end, title, reason }], já conferidas contra a duração do vídeo. */
async function suggestCuts({ apiKey, client, ask: askWith, name, lines, duration, count = 4 }) {
  if (!lines || !lines.length) throw fail(409, 'Não há transcrição para analisar.');
  const n = Math.max(1, Math.min(8, Math.round(+count) || 4));
  const user = [
    `Pregação: "${name}"`,
    `Sugira até ${n} cortes, cada um com 30 a 90 segundos. Liste do melhor para o mais fraco.`,
    '',
    'Transcrição com o tempo de cada trecho:',
    ...lines.map((l) => `[${stamp(l.start)}] ${l.text}`),
  ].join('\n');
  // `askWith` deixa outra IA responder a mesma pergunta (ver lib/ai.js); sem ele, quem responde é o Claude.
  const parsed = await (askWith
    ? askWith({ system: CUTS_SYSTEM, user, schema: CUTS_SCHEMA })
    : ask({ apiKey, client, system: CUTS_SYSTEM, user, schema: CUTS_SCHEMA }));

  const dur = +duration > 0 ? +duration : 0,
    out = [];
  for (const k of (parsed && parsed.cuts) || []) {
    const start = +k.start_seconds;
    let end = +k.end_seconds;
    if (!(start >= 0) || !(end > start) || (dur && start >= dur)) continue;
    if (dur && end > dur) end = dur;
    if (end - start < 3) continue;
    out.push({
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      title: (String(k.title || '').trim() || `Corte ${out.length + 1}`).slice(0, 120),
      reason: String(k.reason || '')
        .trim()
        .slice(0, 300),
      score: Math.max(0, Math.min(100, Math.round(+k.score) || 0)),
    });
  }
  return out.sort((a, b) => b.score - a.score); // do mais forte para o mais fraco
}

/**
 * Converte as sugestões em cortes automáticos (os da aba "Automáticos"), no formato de clips.json.
 * A nota é a que a IA deu a cada trecho (0 a 100).
 */
function toAutoClips(cuts, idPrefix) {
  const rid = () => require('crypto').randomBytes(6).toString('hex');
  return (cuts || []).map((k, i) => ({
    // 'a0', 'a1'... para os cortes criados junto com a transcrição; com prefixo, ids únicos para sugestões pedidas depois
    id: idPrefix ? idPrefix + rid() : 'a' + i,
    title: k.title,
    description: k.reason || 'Sugerido pela IA.',
    tags: ['IA'],
    score: k.score > 0 ? k.score : Math.max(60, 95 - i * 5),
    type: 'IA',
    start: k.start,
    end: k.end,
    emotion: null,
    fav: false,
    hid: false,
    manual: false,
    downloaded: false,
    render: null,
  }));
}

/* ---------- Título, descrição e hashtags de um corte ---------- */
const POST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título do vídeo, até 70 caracteres, sem aspas e sem hashtags.' },
    description: { type: 'string', description: 'Legenda da publicação, de 2 a 4 frases curtas, sem hashtags.' },
    hashtags: {
      type: 'array',
      items: { type: 'string' },
      description: 'De 6 a 10 hashtags em português, cada uma começando com #, sem espaços.',
    },
  },
  required: ['title', 'description', 'hashtags'],
  additionalProperties: false,
};

const POST_SYSTEM = [
  'Você escreve o texto de publicação de vídeos curtos de pregações de uma igreja, para Instagram, YouTube Shorts e TikTok.',
  'Escreva em português do Brasil, com tom acolhedor e direto, fiel ao que foi dito no trecho. Não invente versículos, números nem promessas que o pregador não fez.',
  'O título chama a atenção sem sensacionalismo e sem caixa alta.',
  'A descrição resume a ideia do trecho e termina com um convite simples, como assistir à pregação completa.',
  'As hashtags misturam o tema do trecho com termos gerais de fé e pregação. Não use emojis no título.',
].join('\n');

/** Texto de publicação de um corte: { title, description, hashtags }. */
async function describeCut({ apiKey, client, ask: askWith, name, text, seconds }) {
  const body = String(text || '').trim();
  if (!body) throw fail(409, 'Este corte não tem texto na transcrição para a IA usar.');
  const user = [
    `Pregação: "${name}"`,
    `Duração do corte: ${Math.round(+seconds || 0)} segundos.`,
    '',
    'Transcrição do trecho:',
    body,
  ].join('\n');
  const p =
    (await (askWith
      ? askWith({ system: POST_SYSTEM, user, schema: POST_SCHEMA })
      : ask({ apiKey, client, system: POST_SYSTEM, user, schema: POST_SCHEMA }))) || {};
  const seen = new Set(),
    hashtags = [];
  for (const h of Array.isArray(p.hashtags) ? p.hashtags : []) {
    const word = String(h || '').replace(/[^\p{L}\p{N}_]/gu, ''),
      key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    hashtags.push('#' + word);
    if (hashtags.length === 12) break;
  }
  return {
    title: String(p.title || '')
      .trim()
      .slice(0, 120),
    description: String(p.description || '')
      .trim()
      .slice(0, 2000),
    hashtags,
  };
}

/* ---------- Ajustes de um corte já escolhido ---------- */
const TITLES_SCHEMA = {
  type: 'object',
  properties: {
    titles: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Três títulos diferentes entre si, cada um com até 70 caracteres, sem aspas, sem hashtags e sem emojis.',
    },
  },
  required: ['titles'],
  additionalProperties: false,
};
const TITLES_SYSTEM = [
  'Você escreve títulos para vídeos curtos de pregações de uma igreja.',
  'Escreva em português do Brasil, fiel ao que foi dito no trecho, sem sensacionalismo, sem caixa alta e sem inventar nada que o pregador não disse.',
  'Devolva três títulos com abordagens diferentes: um que afirma a ideia central, um em forma de pergunta ou convite, e um que usa a frase mais marcante do trecho.',
].join('\n');

/** Três outros títulos para um corte, diferentes do atual. */
async function altTitles({ apiKey, client, ask: askWith, name, text, current }) {
  const body = String(text || '').trim();
  if (!body) throw fail(409, 'Este corte não tem texto na transcrição para a IA usar.');
  const user = [
    `Pregação: "${name}"`,
    `Título atual (não repita): "${String(current || '').slice(0, 120)}"`,
    '',
    'Transcrição do trecho:',
    body,
  ].join('\n');
  const p =
    (await (askWith
      ? askWith({ system: TITLES_SYSTEM, user, schema: TITLES_SCHEMA })
      : ask({ apiKey, client, system: TITLES_SYSTEM, user, schema: TITLES_SCHEMA }))) || {};
  const cur = String(current || '')
      .trim()
      .toLowerCase(),
    seen = new Set(),
    out = [];
  for (const t of Array.isArray(p.titles) ? p.titles : []) {
    const s = String(t || '')
        .trim()
        .replace(/^["“”']+|["“”']+$/g, '')
        .slice(0, 120),
      k = s.toLowerCase();
    if (!s || k === cur || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length === 3) break;
  }
  if (!out.length) throw fail(502, 'A IA não devolveu títulos novos. Tente de novo.');
  return out;
}

const SHORT_SCHEMA = {
  type: 'object',
  properties: {
    start_seconds: { type: 'number', description: 'Novo início, em segundos desde o começo do vídeo.' },
    end_seconds: { type: 'number', description: 'Novo fim, em segundos desde o começo do vídeo.' },
    reason: { type: 'string', description: 'Uma frase dizendo o que ficou e por que continua funcionando sozinho.' },
  },
  required: ['start_seconds', 'end_seconds', 'reason'],
  additionalProperties: false,
};
const SHORT_SYSTEM = [
  'Você ajuda a equipe de mídia de uma igreja a encurtar um corte de pregação.',
  'Dentro do trecho dado, escolha a parte contínua mais forte, que funcione sozinha: começo claro, ideia completa e fim que fecha o pensamento.',
  'O novo corte precisa ficar inteiro dentro do trecho original, começar no início de uma frase e terminar no fim de uma frase, usando os tempos da transcrição.',
  'Não escolha momentos de oração. Não remova partes do meio: só aproxime o começo, o fim ou os dois.',
  'Os tempos aparecem como [minutos:segundos] ou [horas:minutos:segundos]; responda em segundos desde o início do vídeo.',
].join('\n');

/** Versão mais curta de um corte: { start, end, reason }, sempre dentro do corte original. */
async function shortenCut({ apiKey, client, ask: askWith, name, lines, start, end }) {
  const inside = (lines || []).filter((l) => l.end > start && l.start < end);
  if (!inside.length) throw fail(409, 'Este corte não tem texto na transcrição para a IA usar.');
  const d = end - start,
    target = Math.max(15, Math.round(d * 0.6));
  if (d < 20) throw fail(409, 'Este corte já é curto demais para encurtar.');
  const user = [
    `Pregação: "${name}"`,
    `O corte atual vai de ${stamp(start)} a ${stamp(end)} (${Math.round(d)} segundos). Encurte para cerca de ${target} segundos.`,
    '',
    'Transcrição do trecho, com o tempo de cada linha:',
    ...inside.map((l) => `[${stamp(l.start)}] ${l.text}`),
  ].join('\n');
  const p =
    (await (askWith
      ? askWith({ system: SHORT_SYSTEM, user, schema: SHORT_SCHEMA })
      : ask({ apiKey, client, system: SHORT_SYSTEM, user, schema: SHORT_SCHEMA }))) || {};
  const s = Math.max(start, +p.start_seconds),
    e = Math.min(end, +p.end_seconds);
  if (!(e - s >= 8) || !(d - (e - s) >= 3))
    throw fail(502, 'A IA não encontrou uma versão mais curta que funcione sozinha. O corte ficou como estava.');
  return {
    start: +s.toFixed(2),
    end: +e.toFixed(2),
    reason: String(p.reason || '')
      .trim()
      .slice(0, 300),
  };
}

module.exports = {
  altTitles,
  shortenCut,
  suggestCuts,
  toAutoClips,
  describeCut,
  aiAvailable,
  claudeAvailable: aiAvailable,
  askClaude: ask,
  MODEL,
};
