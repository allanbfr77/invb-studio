const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestCuts, aiAvailable, MODEL } = require('../lib/claude');

const lines = [
  { start: 0, end: 4, text: 'Bom dia, igreja.' },
  { start: 60, end: 64, text: 'Porque Deus amou o mundo de tal maneira' },
  { start: 64, end: 69, text: 'que deu o seu Filho unigênito.' },
  { start: 3723, end: 3727, text: 'Amém.' },
];
// Cliente de mentira no lugar do SDK: guarda o pedido e devolve a resposta combinada.
const fake = (reply) => { const calls = []; return { calls, beta: { messages: { create: async (req) => { calls.push(req); if (reply instanceof Error) throw reply; return reply; } } } }; };
const answer = (cuts, extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ cuts }) }], ...extra });

test('pede os cortes ao Claude com o modelo, a transcrição com tempos e saída estruturada', async () => {
  const c = fake(answer([{ start_seconds: 60, end_seconds: 120, title: 'O amor de Deus', reason: 'Trecho central.' }]));
  await suggestCuts({ client: c, name: 'Culto de domingo', lines, duration: 5400, count: 3 });
  const req = c.calls[0];
  assert.equal(req.model, MODEL);
  assert.equal(MODEL, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.format.schema.additionalProperties, false);
  assert.ok(['low', 'medium', 'high'].includes(req.output_config.effort));
  const user = req.messages[0].content;
  assert.match(user, /Culto de domingo/);
  assert.match(user, /\[01:00\] Porque Deus amou o mundo de tal maneira/);
  assert.match(user, /\[1:02:03\] Amém\./);
  assert.match(user, /3 cortes/);
});

test('devolve os cortes com tempos em segundos, título e motivo', async () => {
  const c = fake(answer([{ start_seconds: 60, end_seconds: 120, title: 'O amor de Deus', reason: 'Trecho central.' }]));
  const r = await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  assert.deepEqual(r, [{ start: 60, end: 120, title: 'O amor de Deus', reason: 'Trecho central.' }]);
});

test('descarta sugestões impossíveis e ajusta o fim ao tamanho do vídeo', async () => {
  const c = fake(answer([
    { start_seconds: 100, end_seconds: 90, title: 'Invertido', reason: '' },
    { start_seconds: 10, end_seconds: 11, title: 'Curto', reason: '' },
    { start_seconds: 6000, end_seconds: 6060, title: 'Fora', reason: '' },
    { start_seconds: 5380, end_seconds: 5500, title: 'Final', reason: '' },
    { start_seconds: 60.4, end_seconds: 119.6, title: '', reason: '' },
  ]));
  const r = await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  assert.deepEqual(r.map((k) => [k.start, k.end, k.title]), [[5380, 5400, 'Final'], [60.4, 119.6, 'Corte 2']]);
});

test('recusa do modelo vira erro claro, sem tentar ler a resposta', async () => {
  const c = fake({ stop_reason: 'refusal', content: [], stop_details: { category: null } });
  await assert.rejects(() => suggestCuts({ client: c, name: 'x', lines, duration: 5400 }), (e) => /recusou/i.test(e.message) && e.status === 502);
});

test('resposta cortada por limite de tamanho vira erro claro', async () => {
  const c = fake({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"cuts":[' }] });
  await assert.rejects(() => suggestCuts({ client: c, name: 'x', lines, duration: 5400 }), (e) => /incompleta/i.test(e.message));
});

test('transcrição vazia nem chama a API', async () => {
  const c = fake(answer([]));
  await assert.rejects(() => suggestCuts({ client: c, name: 'x', lines: [], duration: 10 }), /transcrição/i);
  assert.equal(c.calls.length, 0);
});

test('erros da API viram mensagens em português com o status certo', async () => {
  const Anthropic = require('@anthropic-ai/sdk');
  const mk = (Cls, status) => new Cls(status, { type: 'error', error: { type: 'x', message: 'detalhe' } }, 'detalhe', new Headers());
  const cases = [[mk(Anthropic.AuthenticationError, 401), 401, /chave/i], [mk(Anthropic.RateLimitError, 429), 429, /limite/i], [mk(Anthropic.BadRequestError, 400), 502, /recusada|inválid/i]];
  for (const [err, status, re] of cases) {
    await assert.rejects(() => suggestCuts({ client: fake(err), name: 'x', lines, duration: 5400 }), (e) => e.status === status && re.test(e.message), err.constructor.name);
  }
});

test('aiAvailable: só com chave', () => {
  assert.equal(aiAvailable(''), false);
  assert.equal(aiAvailable(undefined), false);
  assert.equal(aiAvailable('sk-ant-teste'), true);
});

// --- título, descrição e hashtags de um corte ---
const { describeCut } = require('../lib/claude');
const post = (o) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }] });

test('describeCut envia o texto do corte e o nome da pregação, e pede saída estruturada', async () => {
  const c = fake(post({ title: 'Deus não desiste de você', description: 'Uma palavra para quem está cansado.', hashtags: ['#fé', '#pregação'] }));
  await describeCut({ client: c, name: 'Na oficina do oleiro', text: 'O barro se quebrou na mão do oleiro, e ele fez de novo.', seconds: 45 });
  const req = c.calls[0];
  assert.equal(req.model, MODEL);
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.deepEqual(req.output_config.format.schema.required, ['title', 'description', 'hashtags']);
  assert.match(req.messages[0].content, /Na oficina do oleiro/);
  assert.match(req.messages[0].content, /O barro se quebrou na mão do oleiro/);
  assert.match(req.messages[0].content, /45 segundos/);
});

test('describeCut devolve título, descrição e hashtags normalizadas', async () => {
  const c = fake(post({ title: '  Deus não desiste de você  ', description: 'Uma palavra para quem está cansado.\n\nAssista até o fim.', hashtags: ['fé', '#Pregação', '# igreja nova vida', '#fé', '', '#a b!c'] }));
  const r = await describeCut({ client: c, name: 'x', text: 'texto do corte', seconds: 30 });
  assert.deepEqual(r, { title: 'Deus não desiste de você', description: 'Uma palavra para quem está cansado.\n\nAssista até o fim.', hashtags: ['#fé', '#Pregação', '#igrejanovavida', '#abc'] });
});

test('describeCut limita a 12 hashtags e corta título longo', async () => {
  const c = fake(post({ title: 'x'.repeat(300), description: 'd', hashtags: Array.from({ length: 30 }, (_, i) => '#tag' + i) }));
  const r = await describeCut({ client: c, name: 'x', text: 'texto', seconds: 30 });
  assert.equal(r.title.length, 120); assert.equal(r.hashtags.length, 12);
});

test('describeCut sem texto do corte nem chama a API', async () => {
  const c = fake(post({}));
  await assert.rejects(() => describeCut({ client: c, name: 'x', text: '   ', seconds: 30 }), /texto/i);
  assert.equal(c.calls.length, 0);
});

test('describeCut: recusa e erro da API viram mensagens claras', async () => {
  await assert.rejects(() => describeCut({ client: fake({ stop_reason: 'refusal', content: [] }), name: 'x', text: 't', seconds: 9 }), /recusou/i);
  const Anthropic = require('@anthropic-ai/sdk');
  const err = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'x', message: 'm' } }, 'm', new Headers());
  await assert.rejects(() => describeCut({ client: fake(err), name: 'x', text: 't', seconds: 9 }), (e) => e.status === 429);
});
