// Transcrição mais precisa: vocabulário da igreja e revisão pelo Claude (corrige palavras sem mexer nos tempos).
const fs = require('fs');
const path = require('path');
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

test('a transcrição não passa mais pelo Claude; desfazer a revisão antiga volta o texto e os tempos; vocabulário salva', async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'kkkkkkkkkkks', { duration: 10 });
  const tr = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
  // trecho 0: revisado com a mesma contagem (tempos exatos); trecho 1: revisado com palavra a mais (tempo estimado)
  tr.segments[0] = {
    ...tr.segments[0],
    text: 'Olá, Jesus.',
    orig: 'olá jesuis',
    words: [
      { w: ' Olá,', s: 0.1, e: 0.7 },
      { w: ' Jesus.', s: 0.9, e: 1.6 },
    ],
  };
  tr.segments.push({
    id: 1,
    speaker: 'Pessoa 1',
    start: 2,
    end: 4,
    text: 'a segunda linha',
    orig: 'segunda linha',
    words: [
      { w: ' a', s: 2, e: 2.4 },
      { w: ' segunda', s: 2.4, e: 3.3 },
      { w: ' linha', s: 3.3, e: 4 },
    ],
  });
  tr.reviewedAt = 1;
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(tr));
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste' } });
  assert.equal(
    (await s.api('/vocabulary', { method: 'PUT', json: { team: 'Pr. Marcos Vinícius, Rede Kairós' } })).status,
    200,
  );
  assert.match((await s.api('/vocabulary')).body.team, /Kairós/);
  assert.equal((await s.api('/uploads/kkkkkkkkkkks/transcript/review', { json: {} })).status, 404);
  const r = await s.api('/uploads/kkkkkkkkkkks/transcript/undo-review', { json: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { restored: 2, approx: 1 });
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
  assert.equal(after.segments[0].text, 'olá jesuis');
  assert.deepEqual(
    after.segments[0].words.map((w) => [w.w.trim(), w.s, w.e]),
    [
      ['olá', 0.1, 0.7],
      ['jesuis', 0.9, 1.6],
    ],
  );
  assert.equal(after.segments[1].text, 'segunda linha');
  assert.equal(after.segments[1].words.length, 2);
  assert.equal(after.segments[1].words[0].s, 2);
  assert.ok(Math.abs(after.segments[1].words[1].e - 4) < 0.02);
  assert.ok(!('orig' in after.segments[0]) && !after.reviewedAt);
});
