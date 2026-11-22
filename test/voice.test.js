const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanVoice, voiceFilters, cleanGap } = require('../lib/voice');

const ALL = new Set(['highpass', 'lowpass', 'afftdn', 'agate', 'dynaudnorm', 'speechnorm']);

test('isolamento de voz: só aceita desligado, leve ou forte', () => {
  assert.equal(cleanVoice('leve'), 'leve'); assert.equal(cleanVoice('forte'), 'forte');
  assert.equal(cleanVoice('off'), 'off'); assert.equal(cleanVoice(undefined), 'off'); assert.equal(cleanVoice('qualquer'), 'off'); assert.equal(cleanVoice(true), 'leve');
});

test('desligado não mexe no áudio', () => {
  assert.deepEqual(voiceFilters('off', ALL), []);
});

test('leve corta o grave e reduz o ruído de fundo, sem aumentar o volume de nada', () => {
  const f = voiceFilters('leve', ALL).join(',');
  assert.match(f, /^highpass=f=\d+/); assert.match(f, /afftdn=/);
  assert.doesNotMatch(f, /agate|speechnorm|dynaudnorm|loudnorm/);
});

test('forte reduz mais o ruído, fecha o som entre as falas e limita os agudos', () => {
  const leve = voiceFilters('leve', ALL).join(','), forte = voiceFilters('forte', ALL).join(',');
  const nr = (s) => +/afftdn=nr=(\d+)/.exec(s)[1];
  assert.ok(nr(forte) > nr(leve));
  assert.match(forte, /agate=/); assert.match(forte, /lowpass=f=\d+/);
});

test('filtros que o ffmpeg deste computador não tem ficam de fora, sem quebrar a exportação', () => {
  const f = voiceFilters('forte', new Set(['highpass', 'afftdn']));
  assert.ok(f.length >= 2 && f.every((x) => /^(highpass|afftdn)=/.test(x)));
  assert.deepEqual(voiceFilters('forte', new Set()), []);
});

test('pausa mínima para cortar: entre 0,2 e 3 segundos, padrão 0,5', () => {
  assert.equal(cleanGap(undefined), 0.5); assert.equal(cleanGap('abc'), 0.5);
  assert.equal(cleanGap(1.2), 1.2); assert.equal(cleanGap(0.01), 0.2); assert.equal(cleanGap(10), 3); assert.equal(cleanGap('0.8'), 0.8);
});

test('nível "ia" (remover música) é aceito e não usa os filtros comuns', () => {
  assert.equal(cleanVoice('ia'), 'ia');
  assert.deepEqual(voiceFilters('ia', ALL), []);
});
