// Testes do servidor de verdade (sobe o app com dados temporários). IA e transcrição: com e sem chave, Claude ou OpenAI, cortes automáticos e a troca entre Local e nuvem.
const {
  test,
  assert,
  fs,
  path,
  seed,
  boot,
  tmp,
  clip,
  fakeClaude,
  untilAnalyzed,
  heuristicClip,
  fakeOpenAI,
} = require('./helpers');

// --- recursos de IA só para quem tem a chave do Claude na configuração pessoal ---
test('sem chave do Claude, a IA fica desligada e a rota recusa', async (t) => {
  const d = tmp(t);
  seed(d, 'nnnnnnnnnnnn');
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  assert.equal((await s.api('/status')).body.ai, false);
  const r = await s.api('/uploads/nnnnnnnnnnnn/ai/cuts', { json: {} });
  assert.equal(r.status, 501);
  assert.equal((await s.api('/uploads/nnnnnnnnnnnn/clips')).body.length, 0);
});

test('com a chave, o app avisa a tela que a IA está disponível, sem expor a chave', async (t) => {
  const d = tmp(t);
  seed(d, 'oooooooooooo');
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-chave-de-teste-000' } });
  const st = (await s.api('/status')).body;
  assert.equal(st.ai, true);
  assert.ok(!JSON.stringify(st).includes('sk-ant-chave-de-teste-000'));
});

test('com a chave, os cortes automáticos vêm da IA com a nota dela, e os de texto pré-feito somem', async (t) => {
  const base = await fakeClaude(t, [
    { start_seconds: 300, end_seconds: 360, title: 'Bom', reason: 'Reflexão clara.', score: 78 },
    { start_seconds: 60, end_seconds: 120, title: 'Forte', reason: 'Exortação marcante.', score: 94 },
  ]);
  const d = tmp(t);
  seed(d, 'wwwwwwwwwwww', {}, { clips: [heuristicClip, clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  assert.equal((await s.api('/uploads/wwwwwwwwwwww/reanalyze', { json: {} })).status, 202);
  const m = await untilAnalyzed(s, 'wwwwwwwwwwww');
  assert.equal(m.aiCuts, true);
  const auto = m.clips.filter((c) => !c.manual),
    manual = m.clips.filter((c) => c.manual);
  assert.deepEqual(
    auto.map((c) => [c.title, c.score, c.type, c.description]),
    [
      ['Forte', 94, 'IA', 'Exortação marcante.'],
      ['Bom', 78, 'IA', 'Reflexão clara.'],
    ],
  );
  assert.deepEqual(
    manual.map((c) => c.title),
    ['Meu corte manual'],
  );
  assert.ok(!JSON.stringify(m.clips).includes('heurística'));
});

test('"Sugerir cortes com IA" acrescenta na aba Automáticos, sem tocar na Manuais', async (t) => {
  const base = await fakeClaude(t, [
    { start_seconds: 200, end_seconds: 250, title: 'Mais um', reason: 'Aplicação direta.', score: 81 },
  ]);
  const d = tmp(t);
  seed(d, 'xxxxxxxxxxxx', {}, { clips: [clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  const r = await s.api('/uploads/xxxxxxxxxxxx/ai/cuts', { json: { count: 4 } });
  assert.equal(r.status, 201);
  assert.deepEqual(
    r.body.created.map((c) => [c.title, c.manual, c.score, /^i[0-9a-f]{12}$/.test(c.id)]),
    [['Mais um', false, 81, true]],
  );
  const all = (await s.api('/uploads/xxxxxxxxxxxx/clips')).body;
  assert.deepEqual(
    all.filter((c) => c.manual).map((c) => c.title),
    ['Meu corte manual'],
  );
  assert.equal(all.filter((c) => !c.manual).length, 1);
});

test('com a chave e a IA falhando, a aba Automáticos fica vazia e o motivo vai para a tela', async (t) => {
  const base = await fakeClaude(t, null);
  const d = tmp(t);
  seed(d, 'yyyyyyyyyyyy', {}, { clips: [heuristicClip, clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  await s.api('/uploads/yyyyyyyyyyyy/reanalyze', { json: {} });
  const m = await untilAnalyzed(s, 'yyyyyyyyyyyy');
  assert.equal(m.aiCuts, false);
  assert.match(m.aiCutsError, /chave/i);
  assert.deepEqual(
    m.clips.filter((c) => !c.manual),
    [],
  );
  assert.deepEqual(
    m.clips.filter((c) => c.manual).map((c) => c.title),
    ['Meu corte manual'],
  );
});

test('sem a chave, quem não usa IA continua com os trechos da análise local', async (t) => {
  const d = tmp(t);
  seed(d, 'zzzzzzzzzzzz');
  fs.writeFileSync(
    path.join(d, 'uploads', 'zzzzzzzzzzzz', 'transcript.json'),
    JSON.stringify({
      language: 'pt',
      segments: Array.from({ length: 30 }, (_, i) => ({
        id: i,
        speaker: 'Pessoa 1',
        start: i * 10,
        end: i * 10 + 9,
        text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito para todo aquele que nele crê.',
      })),
    }),
  );
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  await s.api('/uploads/zzzzzzzzzzzz/reanalyze', { json: {} });
  let m;
  for (let i = 0; i < 60; i++) {
    m = (await s.api('/uploads/zzzzzzzzzzzz')).body;
    if (m.clips.length) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(m.clips.length > 0);
  assert.ok(m.clips.every((c) => c.type !== 'IA'));
});

test('só com a chave da OpenAI, cortes, capítulos, emoções e texto do corte vêm dela', async (t) => {
  const o = await fakeOpenAI(t);
  const d = tmp(t);
  seed(d, 'bbbbbbbbbbc1', {}, { clips: [clip({ title: 'Meu corte manual', start: 0, end: 2 })] });
  const s = await boot(t, d, {
    env: {
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: 'sk-openai-teste',
      OPENAI_BASE_URL: o.base,
      OPENAI_MODEL: 'gpt-4o-mini',
      TRANSCRIBE_PROVIDER: 'groq',
    },
  });
  const st = (await s.api('/status')).body;
  assert.equal(st.ai, true);
  assert.match(st.aiName, /OpenAI gpt-4o-mini/);
  await s.api('/uploads/bbbbbbbbbbc1/reanalyze', { json: {} });
  const m = await untilAnalyzed(s, 'bbbbbbbbbbc1');
  assert.deepEqual(
    m.clips.filter((c) => !c.manual).map((c) => [c.title, c.score, c.type]),
    [['Pela OpenAI', 88, 'IA']],
  );
  assert.equal(m.analysis.mode, 'llm');
  assert.equal(m.analysis.chapters[0].title, 'Capítulo da IA');
  assert.deepEqual(m.analysis.emotions, [{ i: 0, emotion: 'Esperança' }]);
  const p = await s.api('/uploads/bbbbbbbbbbc1/clips/m111111111111/ai/post', { json: {} });
  assert.equal(p.status, 200);
  assert.equal(p.body.post.title, 'Título da OpenAI');
  assert.ok(
    o.seen.length >= 3 &&
      o.seen.every(
        (r) => r.url === '/v1/chat/completions' && r.auth === 'Bearer sk-openai-teste' && r.model === 'gpt-4o-mini',
      ),
  );
});

test('com as duas chaves vale o Claude; AI_PROVIDER=openai troca; AI_PROVIDER=off desliga', async (t) => {
  for (const [prov, expected] of [
    ['', /Claude/],
    ['openai', /OpenAI/],
    ['off', null],
  ]) {
    const d = tmp(t);
    const s = await boot(t, d, {
      env: { ANTHROPIC_API_KEY: 'sk-ant-x', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'groq', AI_PROVIDER: prov },
    });
    const st = (await s.api('/status')).body;
    if (expected) {
      assert.equal(st.ai, true, prov);
      assert.match(st.aiName, expected);
    } else {
      assert.equal(st.ai, false);
      assert.equal(st.aiName, null);
    }
  }
});

test('quem usa a chave da OpenAI só para transcrever não ganha IA (e gasto) sem pedir', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d, {
    env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'openai', AI_PROVIDER: '' },
  });
  assert.equal((await s.api('/status')).body.ai, false);
  const d2 = tmp(t);
  const s2 = await boot(t, d2, {
    env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'openai', AI_PROVIDER: 'openai' },
  });
  assert.equal((await s2.api('/status')).body.ai, true);
});

// --- escolher entre transcrição local e na nuvem pela tela ---
test('a tela troca entre Local e Groq, e a escolha fica salva para o próximo início', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d, { env: { GROQ_API_KEY: 'gsk-teste', TRANSCRIBE_PROVIDER: 'groq' } });
  let st = (await s.api('/status')).body;
  assert.equal(st.provider, 'groq');
  assert.deepEqual(
    st.transcribers.map((x) => [x.id, x.name, x.ok]),
    [
      ['local', 'Local', false],
      ['groq', 'Groq', true],
    ],
  );
  assert.ok(!JSON.stringify(st).includes('gsk-teste'));
  // sem faster-whisper (PYTHON inexistente) o modo local é recusado com o motivo
  const no = await s.api('/transcriber', { json: { provider: 'local' } });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /faster-whisper/);
  assert.equal((await s.api('/transcriber', { json: { provider: 'xyz' } })).status, 400);
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ transcriber: 'local' }));
  const s2 = await boot(t, d, { env: { GROQ_API_KEY: 'gsk-teste', TRANSCRIBE_PROVIDER: 'groq' } });
  assert.equal((await s2.api('/status')).body.provider, 'local'); // a escolha salva vale sobre o .env
  const ok = await s2.api('/transcriber', { json: { provider: 'groq' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.provider, 'groq');
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')).transcriber, 'groq');
});
