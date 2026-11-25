// "Compartilhar" um corte: link público só daquele corte, sem login.
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

test(
  'link público: abre só o corte compartilhado, sem login; parar de compartilhar ou apagar o corte derruba o link',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkc');
    const s = await boot(t, d);
    const base = '/uploads/kkkkkkkkkkkc/clips/m111111111111';
    assert.equal((await s.api(base + '/share', { json: {} })).status, 409); // precisa estar exportado
    await s.api(base + '/render', { json: { captions: false } });
    assert.equal((await waitRender(s, 'kkkkkkkkkkkc')).status, 'done');
    const r = await s.api(base + '/share', { json: {} });
    assert.equal(r.status, 200);
    const tok = r.body.token;
    assert.match(tok, /^[A-Za-z0-9_-]{24}$/);
    assert.equal((await s.api(base + '/share', { json: {} })).body.token, tok); // compartilhar de novo: o mesmo link
    const pub = (p, h = {}) => fetch(s.url + p, { headers: h }); // sem o cookie do login
    const page = await pub('/v/' + tok);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /assistir|Nova Vida Botafogo/);
    const info = await (await pub(`/api/public/${tok}/info`)).json();
    assert.equal(info.title.length > 0, true);
    assert.deepEqual(Object.keys(info).sort(), ['format', 'seconds', 'title', 'vertical']); // nada além disso
    const vid = await pub(`/api/public/${tok}/video`, { range: 'bytes=0-99' });
    assert.equal(vid.status, 206);
    assert.equal((await vid.arrayBuffer()).byteLength, 100);
    // o resto continua fechado sem login
    assert.equal((await pub('/api/uploads')).status, 401);
    assert.equal((await pub('/api/uploads/kkkkkkkkkkkc/clips/m111111111111/file')).status, 401);
    assert.equal((await pub(`/api/public/${'x'.repeat(24)}/video`)).status, 404);
    assert.equal((await pub(`/api/public/${tok}/../../uploads`)).status, 401);
    // parar de compartilhar
    await s.api(base + '/share', { method: 'DELETE' });
    assert.equal((await pub(`/api/public/${tok}/info`)).status, 404);
    // compartilhar de novo dá outro link; apagar o corte derruba
    const tok2 = (await s.api(base + '/share', { json: {} })).body.token;
    assert.notEqual(tok2, tok);
    await s.api(base, { method: 'DELETE' });
    assert.equal((await pub(`/api/public/${tok2}/video`)).status, 404);
  },
);

// Com a chave da Vercel (BLOB_READ_WRITE_TOKEN): o corte vai para o Vercel Blob e o link é o da página na Vercel.
// A Vercel aqui é simulada, com as mesmas chamadas da API do Blob.
test(
  'link na Vercel: envia vídeo e título ao Blob, não reenvia sem mudança, e parar de compartilhar apaga lá',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const http = require('http');
    const got = { puts: [], deletes: [], auth: new Set(), store: new Set() };
    const blob = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        got.auth.add(req.headers.authorization);
        got.store.add(req.headers['x-vercel-blob-store-id']);
        const u = new URL(req.url, 'http://x');
        if (req.method === 'PUT') {
          const pn = u.searchParams.get('pathname');
          got.puts.push({
            pn,
            bytes: Buffer.concat(chunks),
            type: req.headers['x-content-type'],
            access: req.headers['x-vercel-blob-access'],
            over: req.headers['x-allow-overwrite'],
          });
          res.setHeader('content-type', 'application/json');
          return res.end(
            JSON.stringify({ url: 'https://lojateste.public.blob.vercel-storage.com/' + pn, pathname: pn }),
          );
        }
        if (req.method === 'POST' && u.pathname === '/delete') {
          got.deletes.push(...JSON.parse(Buffer.concat(chunks).toString()).urls);
          return res.end('{}');
        }
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise((r) => blob.listen(0, '127.0.0.1', r));
    t.after(() => blob.close());
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkd');
    const s = await boot(t, d, {
      env: {
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_LojaTeste_segredo123',
        VERCEL_BLOB_API_URL: `http://127.0.0.1:${blob.address().port}`,
        CLOUD_SHARE_URL: 'https://nv-cortes.vercel.app/',
      },
    });
    assert.equal((await s.api('/status')).body.cloudShare, true);
    const base = '/uploads/kkkkkkkkkkkd/clips/m111111111111';
    await s.api(base + '/render', { json: { captions: false } });
    assert.equal((await waitRender(s, 'kkkkkkkkkkkd')).status, 'done');
    const r = await s.api(base + '/share', { json: {} });
    assert.equal(r.status, 200);
    const tok = r.body.token;
    assert.equal(r.body.url, 'https://nv-cortes.vercel.app/v/' + tok);
    assert.equal(r.body.cloud, true);
    assert.deepEqual([...got.auth], ['Bearer vercel_blob_rw_LojaTeste_segredo123']);
    assert.deepEqual([...got.store], ['LojaTeste']);
    assert.deepEqual(
      got.puts.map((p) => p.pn),
      [`cortes/${tok}.mp4`, `cortes/${tok}.json`],
    );
    const [vid, meta] = got.puts;
    const out = require('fs')
      .readdirSync(require('path').join(d, 'uploads', 'kkkkkkkkkkkd', 'clips'))
      .find((f) => f.endsWith('.mp4'));
    assert.equal(
      vid.bytes.length,
      require('fs').statSync(require('path').join(d, 'uploads', 'kkkkkkkkkkkd', 'clips', out)).size,
    ); // o vídeo inteiro
    assert.equal(vid.type, 'video/mp4');
    assert.equal(vid.access, 'public');
    const info = JSON.parse(meta.bytes.toString());
    assert.deepEqual(Object.keys(info).sort(), ['format', 'seconds', 'title', 'vertical', 'video']); // só isso vai para a internet
    assert.equal(info.video, `https://lojateste.public.blob.vercel-storage.com/cortes/${tok}.mp4`);
    // compartilhar de novo sem mudar nada: mesmo link, nada é reenviado
    const r2 = await s.api(base + '/share', { json: {} });
    assert.equal(r2.body.url, r.body.url);
    assert.equal(got.puts.length, 2);
    // mudou o título: só reenvia (mesmo link)
    await s.api(base, { method: 'PATCH', json: { title: 'Outro título' } });
    const r3 = await s.api(base + '/share', { json: {} });
    assert.equal(r3.body.url, r.body.url);
    assert.equal(got.puts.length, 4);
    assert.equal(JSON.parse(got.puts[3].bytes.toString()).title, 'Outro título');
    // parar de compartilhar apaga os dois arquivos na Vercel
    await s.api(base + '/share', { method: 'DELETE' });
    assert.deepEqual(got.deletes.sort(), [
      `https://lojateste.public.blob.vercel-storage.com/cortes/${tok}.json`,
      `https://lojateste.public.blob.vercel-storage.com/cortes/${tok}.mp4`,
    ]);
    // a Vercel recusando a chave: erro claro, sem link
    blob.removeAllListeners('request');
    blob.on('request', (req, res) => {
      req.resume();
      res.statusCode = 403;
      res.end('{"error":{"code":"forbidden"}}');
    });
    const bad = await s.api(base + '/share', { json: {} });
    assert.equal(bad.status, 502);
    assert.match(bad.body.error, /BLOB_READ_WRITE_TOKEN/);
  },
);
