const test = require('node:test');
const assert = require('node:assert/strict');
const { clock, cleanRange, ytStart } = require('../public/range-utils');

test('lê h:mm:ss, mm:ss e o formato do YouTube', () => {
  assert.equal(clock('1:05:30'), 3930); assert.equal(clock('65:30'), 3930); assert.equal(clock(' 0:45 '), 45);
  assert.equal(clock('1h05m30s'), 3930); assert.equal(clock('3930s'), 3930); assert.equal(clock('90m'), 5400);
  assert.equal(clock(''), null); assert.equal(clock(undefined), null);
  for (const bad of ['abc', '1:75', '12', '1:2:3:4', '-5:00']) assert.ok(Number.isNaN(clock(bad)), bad);
});

test('trecho: vazio é o vídeo inteiro; só início ou só fim valem', () => {
  assert.equal(cleanRange(null), null); assert.equal(cleanRange({}), null); assert.equal(cleanRange({ start: '', end: '' }), null);
  assert.equal(cleanRange({ start: '0:00' }), null);
  assert.deepEqual(cleanRange({ start: '1:05:30', end: '1:52:00' }), { start: 3930, end: 6720 });
  assert.deepEqual(cleanRange({ start: '1:05:30' }), { start: 3930, end: null });
  assert.deepEqual(cleanRange({ end: '45:00' }), { start: 0, end: 2700 });
});

test('trecho inválido vira mensagem clara', () => {
  assert.throws(() => cleanRange({ start: 'uma hora' }), /início da pregação/);
  assert.throws(() => cleanRange({ end: 'x' }), /fim da pregação/);
  assert.throws(() => cleanRange({ start: '1:00:00', end: '50:00' }), /depois do início/);
  assert.throws(() => cleanRange({ start: '1:00:00', end: '1:00:10' }), /pelo menos 30 segundos/);
});

test('início marcado no link do YouTube', () => {
  assert.equal(ytStart('https://www.youtube.com/watch?v=abc&t=3930s'), 3930);
  assert.equal(ytStart('https://youtu.be/abc?t=1h5m30s'), 3930);
  assert.equal(ytStart('https://www.youtube.com/watch?v=abc&t=90'), 90); assert.equal(ytStart('https://youtu.be/abc?si=x&t=3930'), 3930);
  assert.equal(ytStart('https://www.youtube.com/watch?v=abc'), null); assert.equal(ytStart('não é link'), null);
});
