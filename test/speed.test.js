const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanSpeed, atempo } = require('../lib/speed');

test('velocidade válida fica entre 0,25x e 2x, com duas casas; o resto vira 1x', () => {
  assert.equal(cleanSpeed(1.25), 1.25);
  assert.equal(cleanSpeed('1.5'), 1.5);
  assert.equal(cleanSpeed(1.333333), 1.33);
  assert.equal(cleanSpeed(5), 2);
  assert.equal(cleanSpeed(0), 0.25);
  assert.equal(cleanSpeed(0.1), 0.25);
  assert.equal(cleanSpeed(-3), 0.25);
  assert.equal(cleanSpeed(undefined), 1);
  assert.equal(cleanSpeed('abc'), 1);
  assert.equal(cleanSpeed(null), 1);
});

test('filtro de áudio: um atempo entre 0,5x e 2x, dois encadeados abaixo de 0,5x', () => {
  assert.equal(atempo(1.5), 'atempo=1.5');
  assert.equal(atempo(2), 'atempo=2');
  assert.equal(atempo(0.5), 'atempo=0.5');
  assert.equal(atempo(0.25), 'atempo=0.5,atempo=0.5');
  assert.equal(atempo(0.4), 'atempo=0.5,atempo=0.8');
});
