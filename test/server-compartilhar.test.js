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
