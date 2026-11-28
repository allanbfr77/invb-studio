// Busca de sons do Editor avançado (lib/sounds.js), contra um Freesound de mentira.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { searchSounds } = require('../lib/sounds');

const SAMPLE = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 7,
      name: 'Sino',
      description: 'um sino',
      url: 'https://freesound.org/s/7/',
      previews: {
        'preview-hq-mp3': 'https://cdn.freesound.org/7-hq.mp3',
        'preview-lq-mp3': 'https://cdn.freesound.org/7-lq.mp3',
        'preview-hq-ogg': 'https://cdn.freesound.org/7-hq.ogg',
        'preview-lq-ogg': 'https://cdn.freesound.org/7-lq.ogg',
      },
      download: 'https://freesound.org/apiv2/sounds/7/download/',
      duration: 2.5,
      filesize: 1000,
      type: 'wav',
      channels: 2,
      bitrate: 1411,
      bitdepth: 16,
      samplerate: 44100,
      username: 'alguem',
      tags: ['bell'],
      license: 'Creative Commons 0',
      created: '2020-01-01T00:00:00',
      num_downloads: 50,
      avg_rating: 4.5,
      num_ratings: 10,
    },
  ],
};

/** Freesound de mentira: guarda as URLs recebidas e responde `status` com `body`. */
async function fakeFreesound(t, { status = 200, body = SAMPLE } = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    calls.push(new URL(req.url, 'http://x'));
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  return { base: `http://127.0.0.1:${srv.address().port}/apiv2`, calls };
}
const q = (s) => new URLSearchParams(s);

test('sem chave, responde que a busca não está configurada', async (t) => {
  const f = await fakeFreesound(t);
  const r = await searchSounds(q('q=bell'), { apiKey: '', base: f.base });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'Busca de sons não configurada');
  assert.equal(f.calls.length, 0);
});

test('busca de efeitos manda os filtros e transforma o resultado', async (t) => {
  const f = await fakeFreesound(t);
  const r = await searchSounds(q('q=bell&type=effects&page=2'), { apiKey: 'chave', base: f.base });
  assert.equal(r.status, 200);
  const u = f.calls[0];
  assert.equal(u.pathname, '/apiv2/search/text/');
  assert.equal(u.searchParams.get('query'), 'bell');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('page_size'), '20');
  assert.equal(u.searchParams.get('token'), 'chave');
  const filters = u.searchParams.getAll('filter');
  assert.ok(filters.includes('duration:[* TO 30.0]'));
  assert.ok(filters.includes('avg_rating:[3 TO *]'));
  assert.ok(filters.some((x) => x.startsWith('license:(')));
  assert.ok(filters.some((x) => x.startsWith('tag:sound-effect')));
  const [s] = r.body.results;
  assert.equal(s.previewUrl, 'https://cdn.freesound.org/7-hq.mp3');
  assert.equal(s.downloadUrl, 'https://freesound.org/apiv2/sounds/7/download/');
  assert.equal(s.downloads, 50);
  assert.equal(s.rating, 4.5);
  assert.equal(s.ratingCount, 10);
  assert.deepEqual(
    {
      type: r.body.type,
      page: r.body.page,
      pageSize: r.body.pageSize,
      sort: r.body.sort,
      minRating: r.body.minRating,
      query: r.body.query,
      count: r.body.count,
    },
    { type: 'effects', page: 2, pageSize: 20, sort: 'downloads', minRating: 3, query: 'bell', count: 1 },
  );
});

test('sem termo, ordena por downloads_desc; com termo e sort=score, usa score', async (t) => {
  const f = await fakeFreesound(t);
  await searchSounds(q(''), { apiKey: 'k', base: f.base });
  await searchSounds(q('q=x&sort=score'), { apiKey: 'k', base: f.base });
  await searchSounds(q('q=x&sort=rating'), { apiKey: 'k', base: f.base });
  assert.deepEqual(
    f.calls.map((u) => u.searchParams.get('sort')),
    ['downloads_desc', 'score', 'rating_desc'],
  );
});

test('commercial_only=false tira o filtro de licença', async (t) => {
  const f = await fakeFreesound(t);
  await searchSounds(q('q=x&commercial_only=false'), { apiKey: 'k', base: f.base });
  assert.ok(!f.calls[0].searchParams.getAll('filter').some((x) => x.startsWith('license:(')));
});

test('type=songs responde 501 com a mensagem em português', async (t) => {
  const f = await fakeFreesound(t);
  const r = await searchSounds(q('type=songs'), { apiKey: 'k', base: f.base });
  assert.equal(r.status, 501);
  assert.equal(r.body.error, 'Músicas ainda não estão disponíveis');
  assert.equal(f.calls.length, 0);
});

test('parâmetro inválido responde 400', async (t) => {
  const f = await fakeFreesound(t);
  for (const s of ['page=0', 'page_size=500', 'sort=xyz', 'type=filmes', 'min_rating=9']) {
    const r = await searchSounds(q(s), { apiKey: 'k', base: f.base });
    assert.equal(r.status, 400, s);
    assert.equal(r.body.error, 'Parâmetros inválidos');
  }
  assert.equal(f.calls.length, 0);
});

test('Freesound com erro devolve "Falha ao buscar sons" com o mesmo status', async (t) => {
  const f = await fakeFreesound(t, { status: 401, body: { detail: 'Invalid token' } });
  const r = await searchSounds(q('q=x'), { apiKey: 'errada', base: f.base });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'Falha ao buscar sons');
});

test('Freesound fora do ar responde 502 sem derrubar', async () => {
  const r = await searchSounds(q('q=x'), { apiKey: 'k', base: 'http://127.0.0.1:1/apiv2' });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'Falha ao buscar sons');
});

test('resposta estranha do Freesound responde 502', async (t) => {
  const f = await fakeFreesound(t, { body: { nada: true } });
  const r = await searchSounds(q('q=x'), { apiKey: 'k', base: f.base });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'Resposta inválida do Freesound');
});
