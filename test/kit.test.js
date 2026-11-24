const test = require('node:test');
const assert = require('node:assert/strict');
const { cues, toSrt, kitText } = require('../lib/kit');

const W = (txt, t0 = 0, d = 0.4) => txt.split(' ').map((t, i) => ({ t, s: t0 + i * d, e: t0 + i * d + d - 0.05 }));

test('blocos curtos: no máximo 42 letras e 3,5 s cada, sem perder nem repetir palavra', () => {
  const words = W(
    'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito para que todo aquele que nele crê não pereça mas tenha a vida eterna',
  );
  const c = cues(words);
  assert.ok(c.length > 1);
  for (const x of c) {
    assert.ok(x.text.length <= 42, x.text);
    assert.ok(x.e - x.s <= 3.5 + 0.5);
  }
  assert.equal(c.map((x) => x.text).join(' '), words.map((w) => w.t).join(' '));
});

test('fecha o bloco na pontuação e numa pausa longa', () => {
  const c = cues([...W('Deus é fiel em todo o tempo.'), ...W('E ele cuida de nós', 2.8), ...W('sempre', 6)]);
  assert.deepEqual(
    c.map((x) => x.text),
    ['Deus é fiel em todo o tempo.', 'E ele cuida de nós', 'sempre'],
  );
});

test('blocos não se sobrepõem e cada um dura ao menos 0,5 s quando há espaço', () => {
  const c = cues([
    { t: 'Amém.', s: 0, e: 0.1 },
    { t: 'Glória', s: 2, e: 2.3 },
  ]);
  assert.equal(c[0].e, 0.5);
  assert.ok(c[0].e <= c[1].s);
  const d = cues(
    [
      { t: 'Sim', s: 0, e: 0.1 },
      { t: 'senhor', s: 0.2, e: 0.3 },
    ],
    { maxChars: 3 },
  );
  assert.ok(d[0].e <= d[1].s);
});

test('sem palavras, sem legenda', () => {
  assert.deepEqual(cues([]), []);
  assert.equal(toSrt([]), '');
});

test('SRT no formato que o CapCut importa', () => {
  assert.equal(
    toSrt([
      { s: 0, e: 1.5, text: 'Olá' },
      { s: 61.25, e: 3725.5, text: 'mundo' },
    ]),
    '1\n00:00:00,000 --> 00:00:01,500\nOlá\n\n2\n00:01:01,250 --> 01:02:05,500\nmundo\n',
  );
});

test('texto do corte: com o texto da IA, e sem ele avisa como conseguir', () => {
  const base = { sermon: 'Culto de domingo', seconds: 85, speech: 'Deus é fiel.' };
  const a = kitText({
    ...base,
    clip: {
      title: 'Fiel',
      start: 760,
      end: 845,
      post: { title: 'Deus é fiel', description: 'Uma palavra.', hashtags: ['#fe', '#deus'] },
    },
  });
  assert.match(a, /^Deus é fiel\n\nUma palavra\.\n\n#fe #deus\n\n---/);
  assert.match(a, /Pregação: Culto de domingo\nTrecho na pregação: 12:40 a 14:05\nDuração do corte: 1:25/);
  assert.match(a, /Fala do trecho:\nDeus é fiel\.\n$/);
  assert.doesNotMatch(a, /Gerar texto/);
  const b = kitText({ ...base, clip: { title: 'Fiel', start: 3700, end: 3790 } });
  assert.match(b, /^Fiel\n\n---/);
  assert.match(b, /1:01:40 a 1:03:10/);
  assert.match(b, /Gerar texto/);
});
