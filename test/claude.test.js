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
const fake = (reply) => {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    },
  };
};
const answer = (cuts, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: JSON.stringify({ cuts }) },
  ],
  ...extra,
});

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
  const c = fake(
    answer([{ start_seconds: 60, end_seconds: 120, title: 'O amor de Deus', reason: 'Trecho central.', score: 88 }]),
  );
  const r = await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  assert.deepEqual(r, [{ start: 60, end: 120, title: 'O amor de Deus', reason: 'Trecho central.', score: 88 }]);
});

test('descarta sugestões impossíveis e ajusta o fim ao tamanho do vídeo', async () => {
  const c = fake(
    answer([
      { start_seconds: 100, end_seconds: 90, title: 'Invertido', reason: '' },
      { start_seconds: 10, end_seconds: 11, title: 'Curto', reason: '' },
      { start_seconds: 6000, end_seconds: 6060, title: 'Fora', reason: '' },
      { start_seconds: 5380, end_seconds: 5500, title: 'Final', reason: '' },
      { start_seconds: 60.4, end_seconds: 119.6, title: '', reason: '' },
    ]),
  );
  const r = await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  assert.deepEqual(
    r.map((k) => [k.start, k.end, k.title]),
    [
      [5380, 5400, 'Final'],
      [60.4, 119.6, 'Corte 2'],
    ],
  );
});

test('recusa do modelo vira erro claro, sem tentar ler a resposta', async () => {
  const c = fake({ stop_reason: 'refusal', content: [], stop_details: { category: null } });
  await assert.rejects(
    () => suggestCuts({ client: c, name: 'x', lines, duration: 5400 }),
    (e) => /recusou/i.test(e.message) && e.status === 502,
  );
});

test('resposta cortada por limite de tamanho vira erro claro', async () => {
  const c = fake({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"cuts":[' }] });
  await assert.rejects(
    () => suggestCuts({ client: c, name: 'x', lines, duration: 5400 }),
    (e) => /incompleta/i.test(e.message),
  );
});

test('transcrição vazia nem chama a API', async () => {
  const c = fake(answer([]));
  await assert.rejects(() => suggestCuts({ client: c, name: 'x', lines: [], duration: 10 }), /transcrição/i);
  assert.equal(c.calls.length, 0);
});

test('erros da API viram mensagens em português com o status certo', async () => {
  const Anthropic = require('@anthropic-ai/sdk');
  const mk = (Cls, status) =>
    new Cls(status, { type: 'error', error: { type: 'x', message: 'detalhe' } }, 'detalhe', new Headers());
  const cases = [
    [mk(Anthropic.AuthenticationError, 401), 401, /chave/i],
    [mk(Anthropic.RateLimitError, 429), 429, /limite/i],
    [mk(Anthropic.BadRequestError, 400), 502, /recusada|inválid/i],
  ];
  for (const [err, status, re] of cases) {
    await assert.rejects(
      () => suggestCuts({ client: fake(err), name: 'x', lines, duration: 5400 }),
      (e) => e.status === status && re.test(e.message),
      err.constructor.name,
    );
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
  const c = fake(
    post({
      title: 'Deus não desiste de você',
      description: 'Uma palavra para quem está cansado.',
      hashtags: ['#fé', '#pregação'],
    }),
  );
  await describeCut({
    client: c,
    name: 'Na oficina do oleiro',
    text: 'O barro se quebrou na mão do oleiro, e ele fez de novo.',
    seconds: 45,
  });
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
  const c = fake(
    post({
      title: '  Deus não desiste de você  ',
      description: 'Uma palavra para quem está cansado.\n\nAssista até o fim.',
      hashtags: ['fé', '#Pregação', '# igreja nova vida', '#fé', '', '#a b!c'],
    }),
  );
  const r = await describeCut({ client: c, name: 'x', text: 'texto do corte', seconds: 30 });
  assert.deepEqual(r, {
    title: 'Deus não desiste de você',
    description: 'Uma palavra para quem está cansado.\n\nAssista até o fim.',
    hashtags: ['#fé', '#Pregação', '#igrejanovavida', '#abc'],
  });
});

test('describeCut limita a 12 hashtags e corta título longo', async () => {
  const c = fake(
    post({ title: 'x'.repeat(300), description: 'd', hashtags: Array.from({ length: 30 }, (_, i) => '#tag' + i) }),
  );
  const r = await describeCut({ client: c, name: 'x', text: 'texto', seconds: 30 });
  assert.equal(r.title.length, 120);
  assert.equal(r.hashtags.length, 12);
});

test('describeCut sem texto do corte nem chama a API', async () => {
  const c = fake(post({}));
  await assert.rejects(() => describeCut({ client: c, name: 'x', text: '   ', seconds: 30 }), /texto/i);
  assert.equal(c.calls.length, 0);
});

test('describeCut: recusa e erro da API viram mensagens claras', async () => {
  await assert.rejects(
    () => describeCut({ client: fake({ stop_reason: 'refusal', content: [] }), name: 'x', text: 't', seconds: 9 }),
    /recusou/i,
  );
  const Anthropic = require('@anthropic-ai/sdk');
  const err = new Anthropic.RateLimitError(
    429,
    { type: 'error', error: { type: 'x', message: 'm' } },
    'm',
    new Headers(),
  );
  await assert.rejects(
    () => describeCut({ client: fake(err), name: 'x', text: 't', seconds: 9 }),
    (e) => e.status === 429,
  );
});

// --- cortes automáticos pela IA, logo depois da transcrição ---
const { toAutoClips } = require('../lib/claude');

test('suggestCuts pede os cortes em ordem, do melhor para o mais fraco', async () => {
  const c = fake(answer([]));
  await suggestCuts({ client: c, name: 'x', lines, duration: 5400, count: 6 });
  assert.match(c.calls[0].messages[0].content, /6 cortes/);
  assert.match(c.calls[0].system + c.calls[0].messages[0].content, /do melhor para o/i);
});

test('toAutoClips monta os cortes automáticos com nota decrescente, etiqueta IA e o motivo na descrição', () => {
  const r = toAutoClips([
    { start: 60, end: 120, title: 'Primeiro', reason: 'Ideia completa.', score: 92 },
    { start: 300, end: 350, title: 'Segundo', reason: '', score: 71 },
  ]);
  assert.deepEqual(
    r.map((k) => [k.id, k.title, k.start, k.end, k.score, k.type, k.manual]),
    [
      ['a0', 'Primeiro', 60, 120, 92, 'IA', false],
      ['a1', 'Segundo', 300, 350, 71, 'IA', false],
    ],
  );
  assert.equal(r[0].description, 'Ideia completa.');
  assert.equal(r[1].description, 'Sugerido pela IA.');
  assert.deepEqual(r[0].tags, ['IA']);
  assert.ok(r.every((k) => k.fav === false && k.hid === false && k.render === null && k.downloaded === false));
});

test('toAutoClips: a nota nunca fica abaixo de 60 nem lista vazia quebra', () => {
  assert.deepEqual(toAutoClips([]), []);
  // sem nota da IA (resposta antiga), a ordem vira a nota, sem cair abaixo de 60
  const many = toAutoClips(
    Array.from({ length: 12 }, (_, i) => ({ start: i * 100, end: i * 100 + 40, title: 't' + i, reason: '' })),
  );
  assert.equal(many[0].score, 95);
  assert.equal(Math.min(...many.map((k) => k.score)), 60);
  // com prefixo, os ids não colidem com os cortes automáticos que já existem
  const extra = toAutoClips([{ start: 1, end: 40, title: 't', reason: '', score: 80 }], 'i');
  assert.match(extra[0].id, /^i[0-9a-f]{12}$/);
});

// --- nota dada pela IA e o que ela deve evitar ---
test('a IA dá uma nota de 0 a 100 a cada corte e eles voltam do mais forte para o mais fraco', async () => {
  const c = fake(
    answer([
      { start_seconds: 100, end_seconds: 160, title: 'Médio', reason: '', score: 64 },
      { start_seconds: 300, end_seconds: 360, title: 'Forte', reason: '', score: 93.6 },
      { start_seconds: 500, end_seconds: 560, title: 'Fora da escala', reason: '', score: 250 },
      { start_seconds: 700, end_seconds: 760, title: 'Sem nota', reason: '' },
    ]),
  );
  const r = await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  assert.deepEqual(
    r.map((k) => [k.title, k.score]),
    [
      ['Fora da escala', 100],
      ['Forte', 94],
      ['Médio', 64],
      ['Sem nota', 0],
    ],
  );
  assert.ok(c.calls[0].output_config.format.schema.properties.cuts.items.required.includes('score'));
});

test('as instruções pedem pregação forte sobre a Palavra e proíbem oração, louvor e avisos', async () => {
  const c = fake(answer([]));
  await suggestCuts({ client: c, name: 'x', lines, duration: 5400 });
  const s = c.calls[0].system;
  assert.match(s, /oração|orando/i);
  assert.match(s, /final da pregação/i);
  assert.match(s, /Palavra de Deus/);
  assert.match(s, /reflex/i);
  assert.match(s, /louvor|música/i);
  assert.match(s, /avisos|anúncios/i);
});

/* ---------- ajustes de um corte ---------- */
const { altTitles, shortenCut } = require('../lib/claude');

test('outros títulos: três no máximo, sem repetir o atual nem duplicar', async () => {
  const r = await altTitles({
    ask: async () => ({
      titles: [
        'O amor de Deus',
        '"Deus amou o mundo"',
        'deus amou o mundo',
        'Você já recebeu esse amor?',
        'Quarto título',
      ],
    }),
    name: 'x',
    text: 'Porque Deus amou o mundo',
    current: 'O amor de Deus',
  });
  assert.deepEqual(r, ['Deus amou o mundo', 'Você já recebeu esse amor?', 'Quarto título']);
});

test('outros títulos: sem texto no trecho, nem chama a IA', async () => {
  let called = false;
  await assert.rejects(
    () =>
      altTitles({
        ask: async () => {
          called = true;
          return {};
        },
        name: 'x',
        text: '  ',
        current: 'a',
      }),
    (e) => e.status === 409,
  );
  assert.equal(called, false);
});

test('mais curto: o novo trecho fica dentro do corte e manda só as linhas dele', async () => {
  let sent = '';
  const r = await shortenCut({
    ask: async ({ user }) => {
      sent = user;
      return { start_seconds: 50, end_seconds: 90, reason: 'Fica a ideia central.' };
    },
    name: 'x',
    lines,
    start: 60,
    end: 120,
  });
  assert.deepEqual(r, { start: 60, end: 90, reason: 'Fica a ideia central.' }); // o início pedido (50) é puxado para dentro do corte
  assert.match(sent, /\[01:00\] Porque Deus amou/);
  assert.doesNotMatch(sent, /Bom dia, igreja|Amém/);
});

test('mais curto: resposta que não encurta de verdade vira erro e o corte fica como estava', async () => {
  await assert.rejects(
    () =>
      shortenCut({
        ask: async () => ({ start_seconds: 60, end_seconds: 119, reason: '' }),
        name: 'x',
        lines,
        start: 60,
        end: 120,
      }),
    (e) => e.status === 502 && /mais curta/.test(e.message),
  );
  await assert.rejects(
    () =>
      shortenCut({ ask: async () => ({}), name: 'x', lines: [{ start: 60, end: 64, text: 'a' }], start: 60, end: 70 }),
    (e) => e.status === 409,
  );
});

test('direção de arte: sem gancho no topo nem zoom automático, efeitos sóbrios e poucos, segunda cor opcional', async () => {
  const { designEdit } = require('../lib/claude');
  const words = [];
  const times = [];
  for (let i = 0; i < 40; i++) {
    words.push(i % 8 === 7 ? 'fim.' : 'palavra');
    times.push([i * 0.5, i * 0.5 + 0.4]);
  }
  const r = await designEdit({
    ask: async () => ({
      scene: 'x',
      subject_side: 'center',
      concept: 'cinema',
      caption: {
        style: 'Palavra por palavra/Dourado',
        accent: '#ffd23f',
        accent2: '#f2ebdd',
        position: 'bottom',
        size: 16,
        keywords: [],
      },
      impact: {},
      phrases: [],
      fx: [
        { type: 'glitch', from: 1, to: 2 },
        { type: 'push', from: 20, to: 25 },
        { type: 'bw', from: 34, to: 35 },
        { type: 'dim', from: 36, to: 37 },
      ],
      hook: { text: 'Deus não terminou com você.', accent: 'terminou', show: 'always' },
      look: 'cinema',
      note: '',
    }),
    name: 'teste',
    words,
    times,
    format: '9:16',
  });
  assert.deepEqual(
    r.fx.map((f) => f.type),
    ['push', 'bw'],
  ); // glitch não é da IA; dim colado no bw (menos de 3 s) sai
  assert.equal(r.hook, undefined); // a equipe não quer título fixo no topo
  assert.equal(r.punch, undefined); // nem os mini zooms automáticos
  assert.equal(r.caption.kc, '#ffd23f');
  assert.equal(r.caption.kc2, '#f2ebdd');
  assert.equal(r.caption.size, 16); // 16 é o mínimo (legenda pequena some no celular)
});

test('direção de arte com liberdade total: legenda desenhada do zero, com segunda fonte e cores livres', async () => {
  const { designEdit } = require('../lib/claude');
  const words = 'Deus prefere um vaso quebrado e sincero'.split(' ');
  let schema = null;
  const r = await designEdit({
    ask: async (q) => {
      schema = q.schema;
      return {
        scene: 'x',
        subject_side: 'center',
        concept: 'editorial',
        caption: {
          font: 'Big Shoulders Black',
          keyword_font: 'Fraunces Black',
          keyword_italic: true,
          mode: 'words1',
          words: 1,
          upper: true,
          color: '#ffffff',
          accent: '#E8C07D',
          outline: '#000000',
          outline_width: 4,
          shadow: 3,
          box_color: '',
          box_opacity: 0.8,
          animation: 'bounce',
          position: 'bottom',
          size: 20,
          keywords: ['vaso', 'quebrado'],
        },
        impact: { accent_color: '#E8C07D' },
        phrases: [],
        fx: [],
        hook: { text: '', accent: '', show: 'start' },
        look: 'none',
        note: '',
      };
    },
    name: 't',
    words,
    times: words.map((_, i) => [i * 0.5, i * 0.5 + 0.4]),
    format: '9:16',
    free: true,
  });
  assert.ok(schema.properties.caption.properties.keyword_font, 'pede a segunda fonte');
  assert.equal(r.caption.free, true);
  assert.equal(r.caption.font, 'Big Shoulders Black');
  assert.equal(r.caption.kf, 'Fraunces Black');
  assert.equal(r.caption.kc, '#e8c07d'); // cor livre
  assert.equal(r.impact.accent, '#e8c07d');
});
