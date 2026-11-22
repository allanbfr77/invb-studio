const test = require('node:test');
const assert = require('node:assert/strict');
const { needsPreview } = require('../lib/preview');

const info = (v, a) => `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'original.mp4':\n  Duration: 00:53:45.02, start: 0.000000, bitrate: 556 kb/s\n${v ? `  Stream #0:0[0x1](und): Video: ${v}, yuv420p(tv, bt709), 1920x1080 [SAR 1:1 DAR 16:9], 447 kb/s, 30 fps\n` : ''}${a ? `  Stream #0:1[0x2](eng): Audio: ${a}, 48000 Hz, stereo, fltp, 105 kb/s (default)\n` : ''}`;

test('AV1 com Opus (o que o YouTube entregou) precisa de cópia para tocar no Safari', () => {
  assert.equal(needsPreview(info('av1 (libdav1d) (Main) (av01 / 0x31307661)', 'opus (Opus / 0x7375704F)')), true);
});

test('VP9 também precisa', () => {
  assert.equal(needsPreview(info('vp9 (Profile 0) (vp09 / 0x39307076)', 'aac (LC) (mp4a / 0x6134706D)')), true);
});

test('H.264 com AAC já toca em qualquer navegador', () => {
  assert.equal(needsPreview(info('h264 (High) (avc1 / 0x31637661)', 'aac (LC) (mp4a / 0x6134706D)')), false);
});

test('H.264 com áudio Opus precisa, por causa do áudio', () => {
  assert.equal(needsPreview(info('h264 (High) (avc1 / 0x31637661)', 'opus (Opus / 0x7375704F)')), true);
});

test('HEVC com AAC é aceito', () => {
  assert.equal(needsPreview(info('hevc (Main) (hvc1 / 0x31637668)', 'aac (LC)')), false);
});

test('arquivo só de áudio não ganha cópia de vídeo', () => {
  assert.equal(needsPreview(info(null, 'mp3 (mp3float), 44100 Hz')), false);
  assert.equal(needsPreview(info(null, 'opus (Opus)')), false);
});

test('saída ilegível do ffmpeg não gera cópia', () => {
  assert.equal(needsPreview(''), false);
  assert.equal(needsPreview(undefined), false);
});
