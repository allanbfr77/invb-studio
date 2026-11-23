const test = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../public/caption-styles.js');

// dez palavras seguidas, na mesma fala, uma a cada 0,4 s
const words = 'Deus prefere um vaso quebrado e sincero a um fingido'.split(' ').map((t, i) => ({ t, s: i * 0.4, e: i * 0.4 + 0.35, seg: 0 }));
const sizes = (style) => CS.chunkWords(words, style).map((c) => c.length);
const base = CS.STYLES.find((s) => s.mode !== 'block' && s.mode !== 'words1' && s.mode !== 'words2') || CS.STYLES[0];

test('sem número escolhido, o estilo fica como é', () => {
  assert.equal(CS.withWords(base, null), base);
  assert.equal(CS.withWords(base, 0), base);
  assert.equal(CS.withWords(base, 'abc'), base);
});

test('o número de palavras por legenda é respeitado', () => {
  assert.deepEqual(sizes(CS.withWords(base, 1)), new Array(10).fill(1));
  assert.deepEqual(sizes(CS.withWords(base, 3)), [3, 3, 3, 1]);
  assert.deepEqual(sizes(CS.withWords(base, 5)), [5, 5]);
  assert.equal(CS.withWords(base, 99).chunk, 10); // o teto é 10
});

test('uma pausa longa ou a troca de fala ainda quebram a legenda', () => {
  const w = words.map((x, i) => (i >= 4 ? { ...x, s: x.s + 2, e: x.e + 2 } : x));
  assert.deepEqual(CS.chunkWords(w, CS.withWords(base, 6)).map((c) => c.length), [4, 6]);
});

test('estilo de frase inteira passa a mostrar grupos; o de uma palavra passa a destacar', () => {
  const block = CS.STYLES.find((s) => s.mode === 'block'), one = CS.STYLES.find((s) => s.mode === 'words1');
  if (block) assert.equal(CS.withWords(block, 4).mode, 'plain');
  if (one) { assert.equal(CS.withWords(one, 3).mode, 'highlight'); assert.equal(CS.withWords(one, 1).mode, 'words1'); }
});
