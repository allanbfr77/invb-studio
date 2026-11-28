// Transcrição mais precisa: vocabulário da igreja e revisão pelo Claude (corrige palavras sem mexer nos tempos).
const fs = require('fs');
const path = require('path');
const http = require('node:http');
const { test, assert, boot, tmp, seed } = require('./helpers');
const { realign } = require('../lib/transcribe');

test('realinhar: mesma contagem troca só o texto; contagem diferente reparte o tempo do trecho', () => {
  const seg = {
    start: 0,
    end: 2,
    text: 'olá mundo',
    words: [
      { w: 'olá', s: 0, e: 1 },
      { w: 'mundo', s: 1, e: 2 },
    ],
  };
  const a = realign(seg, 'Olá, Mundo.');
  assert.deepEqual(
    a.words.map((w) => [w.w.trim(), w.s, w.e]),
    [
      ['Olá,', 0, 1],
      ['Mundo.', 1, 2],
    ],
  );
  assert.equal(a.orig, 'olá mundo');
  const b = realign(seg, 'olá mundo inteiro');
  assert.equal(b.words.length, 3);
  assert.equal(b.words[0].s, 0);
  assert.ok(Math.abs(b.words[2].e - 2) < 0.02);
});

test('revisão com o Claude: corrige linhas, guarda o original, respeita a trava e registra o gasto; vocabulário salva', async (t) => {
  let asked = '';
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (x) => (b += x));
    req.on('end', () => {
      asked = b;
      const reply = {
        fixes: [
          { i: 0, text: 'Olá, Jesus.' },
          { i: 1, text: 'isto muda a linha inteira com muitas palavras a mais que não foram ditas aqui' },
          { i: 9, text: 'fora' },
        ],
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text: JSON.stringify(reply) }],
          usage: { input_tokens: 1000, output_tokens: 100 },
        }),
      );
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const d = tmp(t);
  const dir = seed(d, 'kkkkkkkkkkks', { duration: 10 });
  const tr = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
  tr.segments[0].text = 'olá jesuis';
  tr.segments.push({
    id: 1,
    speaker: 'Pessoa 1',
    start: 2,
    end: 4,
    text: 'segunda linha',
    words: [
      { w: 'segunda', s: 2, e: 3 },
      { w: 'linha', s: 3, e: 4 },
    ],
  });
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(tr));
  const s = await boot(t, d, {
    env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + srv.address().port },
  });
  assert.equal(
    (await s.api('/vocabulary', { method: 'PUT', json: { team: 'Pr. Marcos Vinícius, Rede Kairós' } })).status,
    200,
  );
  assert.match((await s.api('/vocabulary')).body.team, /Kairós/);
  const r = await s.api('/uploads/kkkkkkkkkkks/transcript/review', { json: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.changed, 1); // a linha 1 mudava demais (trava) e a 9 não existe
  assert.match(asked, /Rede Kairós/); // o vocabulário foi junto
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
  assert.equal(after.segments[0].text, 'Olá, Jesus.');
  assert.equal(after.segments[0].orig, 'olá jesuis');
  assert.deepEqual(
    after.segments[0].words.map((w) => [w.s, w.e]),
    [
      [0, 1],
      [1, 2],
    ],
  ); // tempos iguais
  assert.equal(after.segments[1].text, 'segunda linha');
  assert.ok(after.reviewedAt);
  assert.equal((await s.api('/usage')).body.byFeature.revisao.calls, 1);
});
