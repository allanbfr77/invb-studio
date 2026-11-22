const test = require('node:test');
const assert = require('node:assert/strict');
const { ytProgress } = require('../lib/ytprogress');

test('lê a porcentagem das linhas de download do yt-dlp', () => {
  const st = {};
  assert.deepEqual(ytProgress('[download]  12.3% of  812.40MiB at  3.10MiB/s ETA 03:50\n', st), { pct: 12, label: 'Baixando do YouTube: vídeo' });
});

test('o segundo arquivo baixado é o áudio; depois vem a junção', () => {
  const st = {};
  ytProgress('[download] Destination: /x/original.f137.mp4\n[download]  50.0% of 800MiB\n', st);
  assert.deepEqual(ytProgress('[download] 100% of 800MiB in 02:10\n', st), { pct: 100, label: 'Baixando do YouTube: vídeo' });
  assert.deepEqual(ytProgress('[download] Destination: /x/original.f140.m4a\n[download]   7.5% of 50MiB\n', st), { pct: 7, label: 'Baixando do YouTube: áudio' });
  assert.deepEqual(ytProgress('[Merger] Merging formats into "/x/original.mp4"\n', st), { pct: 99, label: 'Juntando vídeo e áudio' });
});

test('pedaços sem informação de progresso não mudam nada', () => {
  assert.equal(ytProgress('[youtube] Extracting URL\n[info] abc: Downloading 1 format(s)\n', {}), null);
  assert.equal(ytProgress('', {}), null);
});

test('usa a última porcentagem quando chegam várias linhas juntas', () => {
  assert.equal(ytProgress('[download]  1.0% of 9MiB\n[download]  2.0% of 9MiB\n[download]  41.9% of 9MiB\n', {}).pct, 41);
});
