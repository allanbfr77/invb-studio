const test = require('node:test');
const assert = require('node:assert/strict');
const { matchLines, linesToText } = require('../public/transcript-utils.js');

const L = (i, text, who = 'Pessoa 1', seg = 0) => ({ i, seg, t: i * 5, who, text });
const lines = [L(0, 'Porque Deus amou o mundo de tal'), L(1, 'maneira que deu o seu Filho'), L(2, 'unigênito, para que todo aquele'), L(3, 'O Senhor é o meu pastor', 'Pessoa 1', 1)];

test('busca vazia devolve todas as linhas', () => {
  assert.deepEqual(matchLines(lines, '').map((l) => l.i), [0, 1, 2, 3]);
});

test('acha a palavra dentro de uma linha, sem diferenciar maiúsculas', () => {
  assert.deepEqual(matchLines(lines, 'PASTOR').map((l) => l.i), [3]);
});

test('acha uma frase que atravessa duas linhas e devolve as duas', () => {
  assert.deepEqual(matchLines(lines, 'de tal maneira').map((l) => l.i), [0, 1]);
  assert.deepEqual(matchLines(lines, 'Filho unigênito').map((l) => l.i), [1, 2]);
});

test('frase que atravessa duas falas diferentes não conta', () => {
  assert.deepEqual(matchLines(lines, 'aquele O Senhor').map((l) => l.i), []);
});

test('filtra por falante', () => {
  const l2 = [L(0, 'bom dia', 'Pastor'), L(1, 'bom dia a todos', 'Convidado', 1)];
  assert.deepEqual(matchLines(l2, 'bom', 'Convidado').map((l) => l.i), [1]);
});

test('nada encontrado devolve lista vazia', () => {
  assert.deepEqual(matchLines(lines, 'xyz'), []);
});

const tm = (s) => `00:${String(s).padStart(2, '0')}`;
test('o texto exportado traz o nome de quem fala quando ele muda', () => {
  const l2 = [L(0, 'bom dia', 'Pastor'), L(1, 'vamos orar', 'Pastor'), L(2, 'amém', 'Convidado', 1), L(3, 'obrigado', 'Pastor', 2)];
  assert.equal(linesToText(l2, tm), 'Pastor:\n[00:00] bom dia\n[00:05] vamos orar\n\nConvidado:\n[00:10] amém\n\nPastor:\n[00:15] obrigado');
});

test('lista vazia vira texto vazio', () => {
  assert.equal(linesToText([], tm), '');
});
