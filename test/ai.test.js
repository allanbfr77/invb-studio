const test = require('node:test');
const assert = require('node:assert/strict');
const { pickProvider } = require('../lib/ai');
const { askOpenAI } = require('../lib/openai');
const { analyze } = require('../lib/analyze');
const { suggestCuts, describeCut } = require('../lib/claude');

const cfg = (o) => ({
  anthropicKey: '',
  openaiKey: '',
  openaiBase: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  aiProvider: '',
  ...o,
});

/* ---------- qual IA fica ativa ---------- */
test('sem nenhuma chave, não há IA', () => {
  assert.equal(pickProvider(cfg({})), null);
});

test('só com a chave do Claude, a IA é o Claude', () => {
  const p = pickProvider(cfg({ anthropicKey: 'sk-ant-x' }));
  assert.equal(p.name, 'claude');
  assert.match(p.label, /Claude/);
  assert.equal(typeof p.ask, 'function');
});

test('só com a chave da OpenAI, a IA é a OpenAI, com o modelo configurado', () => {
  const p = pickProvider(cfg({ openaiKey: 'sk-x', openaiModel: 'gpt-4o' }));
  assert.equal(p.name, 'openai');
  assert.match(p.label, /gpt-4o/);
});

test('com as duas chaves, o Claude tem prioridade, e AI_PROVIDER escolhe a outra', () => {
  assert.equal(pickProvider(cfg({ anthropicKey: 'a', openaiKey: 'b' })).name, 'claude');
  assert.equal(pickProvider(cfg({ anthropicKey: 'a', openaiKey: 'b', aiProvider: 'openai' })).name, 'openai');
  assert.equal(pickProvider(cfg({ anthropicKey: 'a', openaiKey: 'b', aiProvider: 'claude' })).name, 'claude');
});

test('pedir uma IA cuja chave não existe cai na que tem chave', () => {
  assert.equal(pickProvider(cfg({ openaiKey: 'b', aiProvider: 'claude' })).name, 'openai');
  assert.equal(pickProvider(cfg({ anthropicKey: 'a', aiProvider: 'openai' })).name, 'claude');
});

/* ---------- pedido à OpenAI ---------- */
const fakeFetch = (reply, status = 200) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  };
  f.calls = calls;
  return f;
};
const schema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
};
const chatReply = (content, extra = {}) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content, ...extra } }],
});

test('askOpenAI manda sistema, usuário e o formato de resposta estruturado, e devolve o JSON lido', async () => {
  const f = fakeFetch(chatReply('{"ok":true}'));
  const r = await askOpenAI({
    apiKey: 'sk-x',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    system: 'SYS',
    user: 'USR',
    schema,
    fetchImpl: f,
  });
  assert.deepEqual(r, { ok: true });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(c.init.headers.authorization, 'Bearer sk-x');
  assert.equal(c.body.model, 'gpt-4o-mini');
  assert.deepEqual(c.body.messages, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'USR' },
  ]);
  assert.equal(c.body.response_format.type, 'json_schema');
  assert.equal(c.body.response_format.json_schema.strict, true);
  assert.deepEqual(c.body.response_format.json_schema.schema, schema);
});

test('askOpenAI: erros viram mensagens em português com o status certo', async () => {
  const call = (status, body = { error: { message: 'x' } }) =>
    askOpenAI({
      apiKey: 'k',
      base: 'http://x',
      model: 'm',
      system: 's',
      user: 'u',
      schema,
      fetchImpl: fakeFetch(body, status),
    });
  await assert.rejects(
    () => call(401),
    (e) => e.status === 401 && /chave/i.test(e.message) && /OpenAI/.test(e.message),
  );
  await assert.rejects(
    () => call(429),
    (e) => e.status === 429 && /limite|cota/i.test(e.message),
  );
  await assert.rejects(
    () => call(500),
    (e) => e.status === 502,
  );
});

test('askOpenAI: recusa, resposta cortada e JSON inválido viram erros claros', async () => {
  const call = (reply) =>
    askOpenAI({
      apiKey: 'k',
      base: 'http://x',
      model: 'm',
      system: 's',
      user: 'u',
      schema,
      fetchImpl: fakeFetch(reply),
    });
  await assert.rejects(() => call(chatReply(null, { refusal: 'não posso' })), /recusou/i);
  await assert.rejects(
    () => call({ choices: [{ finish_reason: 'length', message: { content: '{"ok":' } }] }),
    /incompleta/i,
  );
  await assert.rejects(() => call(chatReply('isto não é json')), /formato inesperado/i);
});

test('askOpenAI sem conexão avisa que não alcançou a OpenAI', async () => {
  await assert.rejects(
    () =>
      askOpenAI({
        apiKey: 'k',
        base: 'http://x',
        model: 'm',
        system: 's',
        user: 'u',
        schema,
        fetchImpl: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    (e) => e.status === 502 && /conexão/i.test(e.message),
  );
});

/* ---------- os recursos funcionam com qualquer uma das duas ---------- */
const lines = [{ start: 60, end: 64, text: 'Porque Deus amou o mundo de tal maneira' }];

test('sugerir cortes e escrever o texto do corte aceitam qualquer IA', async () => {
  const seen = [];
  const ask = async (q) => {
    seen.push(q);
    return q.schema.required.includes('cuts')
      ? { cuts: [{ start_seconds: 60, end_seconds: 120, title: 'T', reason: 'R', score: 80 }] }
      : { title: 'Título', description: 'Desc.', hashtags: ['#fé'] };
  };
  assert.deepEqual(await suggestCuts({ ask, name: 'x', lines, duration: 600 }), [
    { start: 60, end: 120, title: 'T', reason: 'R', score: 80 },
  ]);
  assert.deepEqual(await describeCut({ ask, name: 'x', text: 'texto', seconds: 30 }), {
    title: 'Título',
    description: 'Desc.',
    hashtags: ['#fé'],
  });
  assert.equal(seen.length, 2);
  assert.ok(
    seen.every(
      (q) => typeof q.system === 'string' && typeof q.user === 'string' && q.schema.additionalProperties === false,
    ),
  );
});

/* ---------- capítulos e emoções pela IA ---------- */
const tr = {
  language: 'pt',
  segments: Array.from({ length: 12 }, (_, i) => ({
    id: i,
    start: i * 10,
    end: i * 10 + 9,
    text: `Fala número ${i} da pregação sobre a graça.`,
  })),
};

test('com IA, a análise devolve capítulos e emoções vindos dela, e nenhum corte de texto pré-feito', async () => {
  const asked = [];
  const aiAsk = async (q) => {
    asked.push(q);
    return {
      chapters: [
        { start: 0, title: 'Abertura', summary: 'Começo.', tags: ['graça'] },
        { start: 6, title: 'Aplicação', summary: 'Fim.', tags: [] },
      ],
      emotions: [
        { i: 2, emotion: 'Esperança' },
        { i: 99, emotion: 'Alegria' },
        { i: 3, emotion: 'Inventada' },
      ],
    };
  };
  const an = await analyze({ aiAsk, aiLabel: 'Claude Opus 5.5' }, tr);
  assert.equal(an.mode, 'llm');
  assert.equal(an.model, 'Claude Opus 5.5');
  assert.deepEqual(
    an.chapters.map((c) => [c.title, c.first, c.last, c.start, c.end]),
    [
      ['Abertura', 0, 5, 0, 59],
      ['Aplicação', 6, 11, 60, 119],
    ],
  );
  assert.deepEqual(an.emotions, [{ i: 2, emotion: 'Esperança' }]);
  assert.deepEqual(an.clips, []);
  assert.match(asked[0].user, /\[0\] 0:00 Fala número 0/);
  assert.deepEqual(asked[0].schema.required, ['chapters', 'emotions']);
});

test('se a IA falhar na análise, valem os capítulos locais, com o motivo anotado', async () => {
  const an = await analyze(
    {
      aiAsk: async () => {
        throw new Error('sem cota');
      },
      aiLabel: 'OpenAI',
    },
    tr,
  );
  assert.equal(an.mode, 'heuristic');
  assert.match(an.note, /sem cota/);
});

test('sem IA, a análise é a local, como sempre', async () => {
  assert.equal((await analyze({}, tr)).mode, 'heuristic');
});
