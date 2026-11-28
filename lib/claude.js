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

/* ----- Edição de impacto: o Claude escolhe frases de impacto, cartelas, efeitos e a cor, lendo a fala do corte ----- */
const IMPACT_STYLES = [
  'vermelho',
  'classico',
  'amarelo',
  'bebas',
  'tarja',
  'revista',
  'cinema',
  'manuscrito',
  'pincel',
  'moderno',
  'caderno',
];
const IMPACT_SCHEMA = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      description: 'Frases de impacto, em ordem, sem sobrepor. Cada uma de 2 a 7 palavras seguidas.',
      items: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: 'Número da primeira palavra da frase.' },
          to: { type: 'integer', description: 'Número da última palavra da frase (inclusive).' },
          style: { type: 'string', enum: IMPACT_STYLES },
          side: { type: 'string', enum: ['esq', 'centro', 'dir'] },
          anim: { type: 'string', enum: ['pop', 'blur', 'zoom', 'slide', 'fade'] },
          card: { type: 'boolean', description: 'true = a frase aparece numa cartela, tela cheia sem o pregador.' },
          cardColor: { type: 'string', enum: ['#000000', '#ffffff', '#c0262d', '#f0b93a'] },
        },
        required: ['from', 'to', 'style', 'side', 'anim', 'card', 'cardColor'],
        additionalProperties: false,
      },
    },
    fx: {
      type: 'array',
      description: 'Efeitos num trecho, marcados pelas palavras onde acontecem.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'bw',
              'zoom',
              'push',
              'pull',
              'pulse',
              'shake',
              'handheld',
              'flash',
              'blur',
              'glitch',
              'dim',
              'echo',
              'redpop',
              'glow',
              'warm',
              'reveal',
              'oldfilm',
              'vhs',
              'pixel',
            ],
          },
          from: { type: 'integer' },
          to: { type: 'integer' },
        },
        required: ['type', 'from', 'to'],
        additionalProperties: false,
      },
    },
    look: {
      type: 'string',
      enum: ['none', 'quente', 'filme', 'frio', 'drama', 'vivo', 'cinema', 'dourado', 'noite', 'suave', 'retro'],
    },
    note: { type: 'string', description: 'Uma ou duas frases para a equipe: a ideia da edição.' },
  },
  required: ['phrases', 'fx', 'look', 'note'],
  additionalProperties: false,
};
const IMPACT_SYSTEM = [
  'Você edita cortes curtos de pregação (Reels, Shorts) para a equipe de mídia de uma igreja, no estilo "impacto":',
  'as palavras mais fortes entram grandes na tela, uma por vez, no tempo da fala, com cartelas e efeitos nos picos.',
  'Recebe a fala do corte com cada palavra numerada e o tempo dela em segundos. Responda pelos números das palavras.',
  'Regras:',
  '- Frases de impacto: escolha as frases curtas mais marcantes (2 a 7 palavras seguidas), as que resumem a mensagem.',
  '  Mais ou menos uma a cada 5 a 8 segundos, sem sobrepor e sem cobrir o corte inteiro. Não pegue meia ideia.',
  '- O primeiro impacto deve vir nos 2 primeiros segundos, como gancho.',
  '- Cartela (card=true) esconde o pregador: no máximo 1 ou 2 no corte, só nos momentos mais fortes e curtos.',
  '- Efeitos: "bw" (preto e branco) num pico emocional; "zoom" (aproxima de uma vez) numa ênfase; "push" (zoom lento)',
  '  numa frase que vai crescendo; "shake" (tremida) só num grito ou batida; "flash" numa virada; "blur" (desfoque) ao',
  '  falar de confusão ou de algo que some; "glitch" ao falar de erro, engano, mentira; "dim" (escurecer) ao falar de',
  '  trevas, pecado, peso; "echo" (rastro) ao falar de passado, memória, repetição; "pull" (zoom para fora) ao abrir',
  '  uma ideia ou terminar; "pulse" numa sequência de frases fortes, como batidas; "handheld" (câmera na mão) num',
  '  trecho íntimo; "redpop" (só o vermelho colorido) ao falar de sangue, cruz, sacrifício; "glow" (brilho) ao falar de',
  '  luz, glória, céu; "warm" (luz quente) em esperança, amor, graça; "reveal" (surge do preto) para abrir o corte;',
  '  "oldfilm" (filme antigo) ao contar uma história bíblica ou do passado; "vhs" ao lembrar a infância, os anos 90;',
  '  "pixel" (mosaico) numa virada rápida.',
  '  Use pouco (de 3 a 6 no corte), sem dois efeitos no mesmo trecho: o efeito que aparece toda hora perde a força.',
  '- Formato vertical (9:16): textos ao centro ou levemente de lado. Horizontal (16:9): textos de um lado (esquerda ou',
  '  direita), deixando o pregador livre. Quadrado: centro.',
  '- Varie estilo, lado e entrada para não ficar repetitivo, mas mantenha uma linha visual coerente.',
  '- Look: a cor do vídeo inteiro. "cinema" (azul nas sombras, laranja na pele) ou "quente" combinam com a maioria;',
  '  "dourado" em esperança e louvor; "noite" em confronto e arrependimento; "suave" em consolo; "filme"/"retro" em',
  '  histórias; "drama" (P&B) só se o corte todo for intenso.',
  '- Estilos das frases (pense como designer: um estilo principal no corte inteiro, no máximo dois): "vermelho"',
  '  (impacto, confronto), "classico"/"revista" (serifa elegante: versículos, reverência), "cinema" (títulos fortes),',
  '  "manuscrito" (palavra em caligrafia com destaque: graça, amor), "pincel" (energia, juventude), "moderno" (jovens,',
  '  direto), "caderno" (escrita à mão: pessoal, testemunho), "amarelo"/"bebas"/"tarja" (chamadas rápidas).',
  '- Não destaque momentos de oração de forma chamativa. Respeite o sentido do que foi dito: nada fora de contexto.',
  '- A nota é para a equipe, em português, curta.',
].join('\n');

async function impactEdit({ apiKey, client, ask: askWith, name, words, times, format }) {
  const n = words.length;
  if (n < 4) throw fail(409, 'Este corte não tem fala suficiente para a IA sugerir.');
  const user = [
    `Pregação: "${name}"`,
    `Formato do vídeo: ${format === '9:16' ? 'vertical 9:16 (Reels/Shorts)' : format || 'original'}. Duração: ${Math.round(times[n - 1][1])} s.`,
    '',
    'Palavras (número | segundos | palavra):',
    ...words.map((w, i) => `${i} | ${times[i][0].toFixed(1)} | ${w}`),
  ].join('\n');
  const p =
    (await (askWith
      ? askWith({ system: IMPACT_SYSTEM, user, schema: IMPACT_SCHEMA })
      : ask({ apiKey, client, system: IMPACT_SYSTEM, user, schema: IMPACT_SCHEMA }))) || {};
  const ok = (x) => Number.isInteger(x) && x >= 0 && x < n;
  // confere o que veio: dentro da fala, em ordem, sem sobrepor, frases de até 9 palavras, no máximo 2 cartelas
  let last = -1,
    cards = 0;
  const phrases = (Array.isArray(p.phrases) ? p.phrases : [])
    .filter((x) => x && ok(x.from) && ok(x.to) && x.to >= x.from)
    .sort((a, b) => a.from - b.from)
    .filter((x) => {
      if (x.from <= last || x.to - x.from > 8) return false;
      if (x.card && ++cards > 2) x.card = false;
      last = x.to;
      return true;
    })
    .slice(0, 14);
  const fx = (Array.isArray(p.fx) ? p.fx : [])
    .filter(
      (x) =>
        x &&
        [
          'bw',
          'zoom',
          'push',
          'pull',
          'pulse',
          'shake',
          'handheld',
          'flash',
          'blur',
          'glitch',
          'dim',
          'echo',
          'redpop',
          'glow',
          'warm',
          'reveal',
          'oldfilm',
          'vhs',
          'pixel',
        ].includes(x.type) &&
        ok(x.from),
    )
    .map((x) => ({ type: x.type, from: x.from, to: ok(x.to) && x.to >= x.from ? Math.min(x.to, x.from + 12) : x.from }))
    .slice(0, 12);
  return {
    phrases,
    fx,
    look: ['none', 'quente', 'filme', 'frio', 'drama', 'vivo', 'cinema', 'dourado', 'noite', 'suave', 'retro'].includes(
      p.look,
    )
      ? p.look
      : 'none',
    note: String(p.note || '')
      .trim()
      .slice(0, 400),
  };
}

/* ----- Imagens de apoio: o Claude escolhe os momentos e o que buscar no Pexels ----- */
const BROLL_SCHEMA = {
  type: 'object',
  properties: {
    moments: {
      type: 'array',
      description: 'Momentos que ganham uma imagem de apoio, em ordem, sem sobrepor.',
      items: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: 'Número da primeira palavra do momento.' },
          to: { type: 'integer', description: 'Número da última palavra do momento (inclusive).' },
          query: {
            type: 'string',
            description: 'O que buscar no Pexels, em inglês, 1 a 4 palavras concretas e visuais.',
          },
          label: { type: 'string', description: 'O mesmo em português, curto, para a equipe.' },
          kind: { type: 'string', enum: ['photo', 'video'] },
          mode: { type: 'string', enum: ['full', 'card'], description: 'full = tela cheia; card = cartão no meio.' },
        },
        required: ['from', 'to', 'query', 'label', 'kind', 'mode'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: 'Uma frase para a equipe sobre a escolha.' },
  },
  required: ['moments', 'note'],
  additionalProperties: false,
};
const BROLL_SYSTEM = [
  'Você edita cortes curtos de pregação para a equipe de mídia de uma igreja e escolhe imagens de apoio (B-roll):',
  'fotos ou vídeos curtos de banco de imagens que ilustram a frase dita, cortando por 1 a 3 segundos para a imagem.',
  'Recebe a fala com cada palavra numerada e o tempo dela. Responda pelos números das palavras.',
  'Regras:',
  '- De 2 a 5 momentos no corte, nas frases com imagem concreta ou metáfora forte (armadilha, queda, mãos, luz, deserto, tempestade).',
  '  Não ilustre todas as frases: o pregador precisa aparecer a maior parte do tempo.',
  '- Cada momento cobre a frase que a imagem ilustra, de 1,5 a 3 segundos.',
  '- A busca é em inglês e precisa ser visual e concreta ("hands reaching", "man falling dark", "storm clouds"),',
  '  nada abstrato ("salvation", "grace"). Prefira "video" quando a cena pede movimento.',
  '- Nada de imagens de Jesus, de rostos de pessoas reconhecíveis, de violência explícita ou de outras religiões.',
  '- "card" (cartão) combina com imagens simbólicas; "full" (tela cheia) com cenas e paisagens.',
].join('\n');

async function brollPlan({ apiKey, client, ask: askWith, name, words, times, format }) {
  const n = words.length;
  if (n < 4) throw fail(409, 'Este corte não tem fala suficiente para a IA sugerir.');
  const user = [
    `Pregação: "${name}"`,
    `Formato: ${format === '9:16' ? 'vertical 9:16' : format || 'original'}.`,
    '',
    'Palavras (número | segundos | palavra):',
    ...words.map((w, i) => `${i} | ${times[i][0].toFixed(1)} | ${w}`),
  ].join('\n');
  const p =
    (await (askWith
      ? askWith({ system: BROLL_SYSTEM, user, schema: BROLL_SCHEMA })
      : ask({ apiKey, client, system: BROLL_SYSTEM, user, schema: BROLL_SCHEMA }))) || {};
  const ok = (x) => Number.isInteger(x) && x >= 0 && x < n;
  let last = -1;
  const moments = (Array.isArray(p.moments) ? p.moments : [])
    .filter((x) => x && ok(x.from) && ok(x.to) && x.to >= x.from && String(x.query || '').trim())
    .sort((a, b) => a.from - b.from)
    .filter((x) => {
      if (x.from <= last) return false;
      last = x.to;
      return true;
    })
    .slice(0, 6)
    .map((x) => ({
      from: x.from,
      to: Math.min(x.to, x.from + 14),
      query: String(x.query).trim().slice(0, 60),
      label: String(x.label || x.query)
        .trim()
        .slice(0, 60),
      kind: x.kind === 'video' ? 'video' : 'photo',
      mode: x.mode === 'card' ? 'card' : 'full',
    }));
  return {
    moments,
    note: String(p.note || '')
      .trim()
      .slice(0, 300),
  };
}

/* ----- Música de fundo: o Claude escolhe o clima e o que buscar no Freesound ----- */
const MUSIC_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Busca no Freesound, em inglês, 2 a 4 palavras (ex.: "soft piano ambient").',
    },
    label: { type: 'string', description: 'O clima em português, curto (ex.: "Piano suave").' },
    why: { type: 'string', description: 'Uma frase dizendo por que combina com a fala.' },
  },
  required: ['query', 'label', 'why'],
  additionalProperties: false,
};
const MUSIC_SYSTEM = [
  'Você escolhe a música de fundo de um corte curto de pregação (Reels/Shorts) para a equipe de mídia de uma igreja.',
  'Leia a fala e diga o clima da música, sem letra e sem batida forte, que fica baixinho por baixo da voz:',
  'piano suave, pad ambiente, cordas emocionantes, cinematográfico épico, esperançoso... Nada de música secular conhecida.',
  'A busca vai para o Freesound, em inglês, com 2 a 4 palavras.',
].join('\n');
async function musicMood({ apiKey, client, ask: askWith, name, text }) {
  if (!String(text || '').trim()) throw fail(409, 'Este corte não tem fala para a IA ler.');
  const user = `Pregação: "${name}"\n\nFala do corte:\n${String(text).slice(0, 6000)}`;
  const p =
    (await (askWith
      ? askWith({ system: MUSIC_SYSTEM, user, schema: MUSIC_SCHEMA })
      : ask({ apiKey, client, system: MUSIC_SYSTEM, user, schema: MUSIC_SCHEMA }))) || {};
  const query = String(p.query || '')
    .trim()
    .slice(0, 60);
  if (!query) throw fail(502, 'A IA não sugeriu uma música.');
  return {
    query,
    label: String(p.label || query)
      .trim()
      .slice(0, 40),
    why: String(p.why || '')
      .trim()
      .slice(0, 200),
  };
}

module.exports = {
  musicMood,
  brollPlan,
  impactEdit,
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
