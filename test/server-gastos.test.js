// Aba Gastos: cada chamada ao Claude vira um registro com o custo (tokens × preço) e entra no resumo do mês.
const http = require('node:http');
const { test, assert, boot, tmp, seed, clip } = require('./helpers');

test('gastos: chamada ao Claude é registrada com custo e aparece no resumo; limite e preços se ajustam', async (t) => {
  const srv = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text: JSON.stringify({ titles: ['Um', 'Dois', 'Três'] }) }],
          usage: {
            input_tokens: 100000,
            output_tokens: 20000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        }),
      );
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const d = tmp(t);
  seed(d, 'kkkkkkkkkkkp', { duration: 60 }, { clips: [clip({ start: 0, end: 30 })] });
  const s = await boot(t, d, {
    env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + srv.address().port },
  });
  const cid = (await s.api('/uploads/kkkkkkkkkkkp/clips')).body[0].id;
  await s.api(`/uploads/kkkkkkkkkkkp/clips/${cid}/ai/refine`, { json: { mode: 'titles' } });
  const u = (await s.api('/usage')).body;
  assert.equal(u.byApi.claude.calls, 1);
  // 100 mil × US$ 4/mi + 20 mil × US$ 20/mi = 0,40 + 0,40
  assert.ok(Math.abs(u.total - 0.8) < 1e-6, 'custo ' + u.total);
  assert.equal(u.byFeature.titulos.calls, 1);
  const set = (
    await s.api('/usage/settings', {
      method: 'PATCH',
      json: { budget: 20, dollar: 5.2, prices: { 'claude-opus-5-5': { in: 5, out: 25 } } },
    })
  ).body;
  assert.equal(set.budget, 20);
  assert.equal(set.prices['claude-opus-5-5'].in, 5);
  const u2 = (await s.api('/usage')).body;
  assert.equal(u2.budget, 20);
  assert.equal(u2.dollar, 5.2);
});
