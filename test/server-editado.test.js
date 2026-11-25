// Editor avançado → "Enviar pro Studio" → "Substituir o vídeo de uma pregação": a versão editada vira a base.
const { test, assert, fs, path, spawnSync, HAS_FFMPEG, boot, tmp, seedTone, meta } = require('./helpers');
const { canRefetch, staleOriginals } = require('../lib/cleanup');

const sendEdited = (s, id, buf, name = 'editado.mp4') =>
  fetch(s.url + `/api/uploads/${id}/edited?name=` + encodeURIComponent(name), {
    method: 'POST',
    headers: { 'x-invb': '1', cookie: s.cookie, 'content-type': 'application/octet-stream' },
    body: buf,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

test(
  'a versão editada substitui o vídeo, apaga transcrição e cortes antigos e nunca entra na limpeza dos 7 dias',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    const dir = seedTone(d, 'kkkkkkkkkkk8');
    // a pregação veio de um link do YouTube e já tem transcrição e um corte
    const m0 = meta(dir);
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify({ ...m0, source: 'youtube', url: 'https://youtu.be/abcdefghijk', status: 'done' }),
    );
    const s = await boot(t, d);
    const novo = path.join(d, 'editado.mp4');
    spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=25:duration=2',
      '-pix_fmt',
      'yuv420p',
      novo,
    ]);
    const buf = fs.readFileSync(novo);
    assert.equal((await sendEdited(s, 'kkkkkkkkkkk8', Buffer.from('x'), 'texto.txt')).status, 415);
    const r = await sendEdited(s, 'kkkkkkkkkkk8', buf);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const m = meta(dir);
    assert.equal(m.source, 'editor');
    assert.equal(m.edited.from.source, 'youtube'); // de onde veio a live fica guardado
    assert.equal(m.edited.from.url, 'https://youtu.be/abcdefghijk');
    assert.equal(m.size, buf.length);
    assert.deepEqual(fs.readFileSync(path.join(dir, m.file)), buf); // o vídeo agora é o editado
    assert.ok(!fs.existsSync(path.join(dir, 'transcript.json')), 'transcrição antiga sai');
    assert.ok(!fs.existsSync(path.join(dir, 'clips.json')), 'cortes antigos saem');
    // a limpeza dos 7 dias não apaga: não há link para baixar a versão editada de novo
    assert.equal(canRefetch(m), false);
    assert.deepEqual(staleOriginals([{ ...m, status: 'done', lastUsedAt: 0 }], Date.now(), 1000), []);
  },
);
