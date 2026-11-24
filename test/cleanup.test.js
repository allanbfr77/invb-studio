const test = require('node:test');
const assert = require('node:assert/strict');
const { staleOriginals, canRefetch } = require('../lib/cleanup');

const DAY = 86400000,
  NOW = 1_800_000_000_000,
  WEEK = 7 * DAY;
const up = (o) => ({
  id: 'x',
  status: 'done',
  source: 'youtube',
  url: 'https://www.youtube.com/watch?v=abc',
  file: 'original.mp4',
  createdAt: NOW - 8 * DAY,
  ...o,
});

test('pregação do YouTube sem uso há 8 dias está vencida', () => {
  assert.deepEqual(staleOriginals([up({ id: 'a' })], NOW, WEEK), ['a']);
});

test('sem uso há 6 dias ainda não vence', () => {
  assert.deepEqual(staleOriginals([up({ createdAt: NOW - 6 * DAY })], NOW, WEEK), []);
});

test('arquivo enviado do computador nunca vence, porque não há link para baixar de novo', () => {
  assert.deepEqual(
    staleOriginals([up({ source: 'upload', url: undefined, createdAt: NOW - 400 * DAY })], NOW, WEEK),
    [],
  );
});

test('uso recente segura uma pregação antiga', () => {
  assert.deepEqual(staleOriginals([up({ createdAt: NOW - 30 * DAY, lastUsedAt: NOW - DAY })], NOW, WEEK), []);
});

test('o que conta é o último uso, não a criação', () => {
  assert.deepEqual(staleOriginals([up({ id: 'b', createdAt: NOW - 30 * DAY, lastUsedAt: NOW - 9 * DAY })], NOW, WEEK), [
    'b',
  ]);
});

test('ignora o que já foi limpo, o que está processando, com erro ou baixando de novo', () => {
  const l = [
    up({ originalGone: true }),
    up({ status: 'processing' }),
    up({ status: 'queued' }),
    up({ status: 'error' }),
    up({ refetching: true }),
    up({ file: '' }),
  ];
  assert.deepEqual(staleOriginals(l, NOW, WEEK), []);
});

test('link do Drive vence como o do YouTube, mas só se o link ficou salvo', () => {
  const l = [
    up({ id: 'd1', source: 'drive', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKl/view' }),
    up({ id: 'd2', source: 'drive', url: undefined }),
  ];
  assert.deepEqual(staleOriginals(l, NOW, WEEK), ['d1']);
});

test('devolve só os vencidos de uma lista misturada', () => {
  const l = [
    up({ id: 'velho' }),
    up({ id: 'novo', createdAt: NOW - DAY }),
    up({ id: 'local', source: 'upload', url: undefined }),
  ];
  assert.deepEqual(staleOriginals(l, NOW, WEEK), ['velho']);
});

test('prazo zero vence tudo que tem link (usado no botão "liberar espaço" e nos testes)', () => {
  assert.deepEqual(staleOriginals([up({ id: 'a', createdAt: NOW - 1000 })], NOW, 0), ['a']);
});

test('canRefetch: só com link do YouTube ou do Drive', () => {
  assert.equal(canRefetch(up({})), true);
  assert.equal(canRefetch(up({ source: 'drive', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKl/view' })), true);
  assert.equal(canRefetch(up({ source: 'drive', url: undefined })), false);
  assert.equal(canRefetch(up({ source: 'upload', url: undefined })), false);
  assert.equal(canRefetch(null), false);
});
