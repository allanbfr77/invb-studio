const test = require('node:test');
const assert = require('node:assert/strict');
const { splitLines } = require('../lib/lines');

// Monta um segmento com palavras de duração fixa (em segundos).
const seg = (text, start, per = 0.5, extra = {}) => {
  const ws = text.split(/\s+/);
  const words = ws.map((w, i) => ({ w, s: +(start + i * per).toFixed(2), e: +(start + (i + 1) * per).toFixed(2) }));
  return { start, end: words[words.length - 1].e, text, speaker: 'Falante 1', words, ...extra };
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('divide um segmento de 12 s em linhas de no máximo 5 s', () => {
  const text = Array.from({ length: 24 }, (_, i) => 'palavra' + i).join(' ');
  const lines = splitLines([seg(text, 100)]);
  assert.ok(lines.length >= 3);
  for (const l of lines) assert.ok(l.end - l.start <= 5.01, `linha com ${l.end - l.start}s`);
  assert.equal(norm(lines.map((l) => l.text).join(' ')), norm(text));
  assert.equal(lines[0].start, 100);
  assert.equal(lines[lines.length - 1].end, 112);
  assert.ok(lines.every((l) => l.seg === 0 && l.speaker === 'Falante 1'));
});

test('prefere quebrar depois da pontuação', () => {
  // 10 palavras de 0,5 s; a vírgula fica na 8ª palavra (termina em 4,0 s).
  const lines = splitLines([seg('porque Deus amou tanto o mundo de maneira, que deu o seu Filho', 0)]);
  assert.match(lines[0].text, /maneira,$/);
  assert.match(lines[1].text, /^que deu/);
});

test('não quebra na pontuação quando ela está na primeira metade da linha', () => {
  const lines = splitLines([seg('sim, um dois três quatro cinco seis sete oito nove dez onze doze', 0)]);
  assert.ok(lines[0].words.length > 1, 'a primeira linha não deve ter só "sim,"');
});

test('segmento sem palavras vira uma linha só', () => {
  const lines = splitLines([{ start: 3, end: 20, text: 'texto sem tempos por palavra', speaker: 'A' }]);
  assert.deepEqual(lines, [
    { seg: 0, start: 3, end: 20, text: 'texto sem tempos por palavra', speaker: 'A', words: [] },
  ]);
});

test('segmento com texto editado à mão vira uma linha só, com o texto editado', () => {
  const s = seg('um dois tres quatro cinco seis sete oito nove dez onze doze', 0);
  s.text = 'um dois três quatro, corrigido pela equipe';
  const lines = splitLines([s]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'um dois três quatro, corrigido pela equipe');
  assert.deepEqual(lines[0].words, []);
  assert.equal(lines[0].start, 0);
  assert.equal(lines[0].end, 6);
});

test('diferenças só de espaço, caixa e pontuação não contam como edição', () => {
  const s = seg('Olá mundo, tudo bem com vocês hoje aqui na igreja meus irmãos queridos', 0);
  s.text = ' Olá  mundo tudo bem com vocês hoje aqui na igreja meus irmãos queridos ';
  assert.ok(splitLines([s]).length > 1);
});

test('uma palavra mais longa que o limite ainda gera uma linha', () => {
  const s = {
    start: 0,
    end: 9,
    text: 'aaaaaah fim',
    speaker: 'A',
    words: [
      { w: 'aaaaaah', s: 0, e: 8 },
      { w: 'fim', s: 8, e: 9 },
    ],
  };
  const lines = splitLines([s]);
  assert.deepEqual(
    lines.map((l) => l.text),
    ['aaaaaah', 'fim'],
  );
  assert.ok(lines.every((l) => l.words.length === 1));
});

test('as palavras da linha saem no formato { t, s, e }', () => {
  const lines = splitLines([seg('um dois', 10)]);
  assert.deepEqual(lines[0].words, [
    { t: 'um', s: 10, e: 10.5 },
    { t: 'dois', s: 10.5, e: 11 },
  ]);
});

test('respeita maxSec e mantém o índice do segmento de origem', () => {
  const lines = splitLines([seg('a b c d', 0, 1), seg('e f g h', 10, 1)], { maxSec: 2 });
  assert.deepEqual(
    lines.map((l) => [l.seg, l.text]),
    [
      [0, 'a b'],
      [0, 'c d'],
      [1, 'e f'],
      [1, 'g h'],
    ],
  );
});

test('entrada vazia devolve lista vazia', () => {
  assert.deepEqual(splitLines([]), []);
  assert.deepEqual(splitLines(undefined), []);
});

// --- achados da revisão final ---
const bare = (text, start, per = 0.5) => {
  const s = seg(text, start, per);
  s.words.forEach((w) => {
    w.w = w.w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  });
  return s;
};

test('correção só de pontuação e maiúsculas aparece na linha, não as palavras antigas', () => {
  const s = seg('jesus disse vinde', 0);
  s.text = 'Jesus disse: vinde!';
  const lines = splitLines([s]);
  assert.equal(lines.map((l) => l.text).join(' '), 'Jesus disse: vinde!');
  assert.deepEqual(
    lines[0].words.map((w) => w.t),
    ['Jesus', 'disse:', 'vinde!'],
  );
  assert.equal(lines[0].words[1].s, 0.5);
});

test('quando o serviço devolve palavras sem pontuação, a linha usa a pontuação do texto da fala', () => {
  const s = bare('Porque Deus amou tanto o mundo de maneira, que deu o seu Filho', 0);
  const lines = splitLines([s]);
  assert.match(lines[0].text, /^Porque Deus .* maneira,$/);
  assert.match(lines[1].text, /^que deu o seu Filho$/);
});

test('se a divisão em palavras do texto não bate com a do serviço, usa as palavras do serviço', () => {
  const s = {
    start: 0,
    end: 2,
    text: 'Bem-vindo, irmãos',
    speaker: 'A',
    words: [
      { w: 'Bem', s: 0, e: 0.5 },
      { w: 'vindo', s: 0.5, e: 1 },
      { w: 'irmãos', s: 1, e: 2 },
    ],
  };
  assert.deepEqual(
    splitLines([s])[0].words.map((w) => w.t),
    ['Bem', 'vindo', 'irmãos'],
  );
});
