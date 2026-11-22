const test = require('node:test');
const assert = require('node:assert/strict');
const { ytProgress } = require('../lib/ytprogress');

test('lê a porcentagem das linhas de download do yt-dlp', () => {
  const st = {};
  assert.deepEqual(ytProgress('[download]  12.3% of  812.40MiB at  3.10MiB/s ETA 03:50\n', st), { pct: 12, label: 'Baixando do YouTube: vídeo', detail: '3,10 MB/s, faltam 03:50' });
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

test('mostra a velocidade e o tempo que falta, quando o yt-dlp informa', () => {
  assert.deepEqual(ytProgress('[download]  12.3% of  812.40MiB at  3.10MiB/s ETA 03:50\n', {}), { pct: 12, label: 'Baixando do YouTube: vídeo', detail: '3,10 MB/s, faltam 03:50' });
  assert.equal(ytProgress('[download]  40.0% of ~ 1.20GiB at  512.00KiB/s ETA 23:10 (frag 40/100)\n', {}).detail, '512,00 KB/s, faltam 23:10');
  assert.equal(ytProgress('[download]  40.0% of 9MiB at Unknown B/s ETA Unknown\n', {}).detail, undefined);
});

const { ytInfo } = require('../lib/ytprogress');
test('ytInfo separa a situação da transmissão e o título', () => {
  assert.deepEqual(ytInfo('post_live\tCulto de domingo | 22/11\n'), { live: 'post_live', title: 'Culto de domingo | 22/11' });
  assert.deepEqual(ytInfo('not_live\tNa oficina do oleiro\n'), { live: 'not_live', title: 'Na oficina do oleiro' });
  assert.deepEqual(ytInfo('NA\tSem situação\n'), { live: '', title: 'Sem situação' });
  assert.deepEqual(ytInfo(''), { live: '', title: '' });
  assert.deepEqual(ytInfo('WARNING: algo\nwas_live\tTítulo com\ttab\n'), { live: 'was_live', title: 'Título com\ttab' });
});
