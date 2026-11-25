// Editor avançado → "Enviar pro Studio" → "Substituir o vídeo de uma pregação": a versão editada vira a base.
const { test, assert, fs, path, spawnSync, HAS_FFMPEG, boot, tmp, seedTone, meta } = require('./helpers');
const { canRefetch, staleOriginals } = require('../lib/cleanup');

// espera o servidor terminar de processar (aqui a transcrição falha logo, sem chave): a pasta do teste só pode
// ser apagada depois, senão o servidor ainda está escrevendo nela
const idle = async (s, id) => {
  for (let i = 0; i < 100; i++) {
    const m = (await s.api('/uploads/' + id)).body;
    if (!m || !['queued', 'processing'].includes(m.status)) return m;
    await new Promise((r) => setTimeout(r, 100));
  }
};
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
    await idle(s, 'kkkkkkkkkkk8');
  },
);

test(
  'cortar no editor antes de transcrever: baixa, espera sem transcrever e segue quando a versão cortada chega',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    const s = await boot(t, d);
    const vid = path.join(d, 'live.mp4');
    spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=25:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=3',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      vid,
    ]);
    const up = await fetch(s.url + '/api/uploads?name=live.mp4&later=1', {
      method: 'POST',
      headers: { 'x-invb': '1', cookie: s.cookie },
      body: fs.readFileSync(vid),
    }).then((r) => r.json());
    let m;
    for (let i = 0; i < 100; i++) {
      m = (await s.api('/uploads/' + up.id)).body;
      if (m.status === 'waiting' || m.status === 'error') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(m.status, 'waiting', m.error);
    assert.ok(m.duration > 2, 'a duração já é medida');
    assert.equal(m.transcript, null); // não transcreveu
    // a versão cortada chega do editor: deixa de esperar e entra na fila de transcrição
    const r = await sendEdited(s, up.id, fs.readFileSync(vid));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.later, false);
    assert.ok(['queued', 'processing', 'error'].includes(r.body.status));
    await idle(s, up.id);
  },
);

test('"Transcrever agora" tira a pregação da espera', async (t) => {
  const d = tmp(t);
  const dir = seedTone(d, 'kkkkkkkkkkk9');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta(dir), status: 'waiting', later: true }));
  const s = await boot(t, d);
  await s.api('/uploads/kkkkkkkkkkk9/retry', { json: { now: true } });
  const m = meta(dir);
  assert.equal(m.later, false);
  assert.notEqual(m.status, 'waiting');
  await idle(s, 'kkkkkkkkkkk9');
});

test('publicada no YouTube: guarda o link; pública ou não listada volta para a limpeza dos 7 dias, privada não', async (t) => {
  const d = tmp(t);
  const dir = seedTone(d, 'kkkkkkkkkkka');
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ ...meta(dir), status: 'done', source: 'editor', url: null }),
  );
  const s = await boot(t, d);
  assert.equal((await s.api('/uploads/kkkkkkkkkkka/youtube', { json: { videoId: 'x y' } })).status, 400);
  // privada: guarda o link, mas o vídeo continua só no computador (não sai na limpeza)
  let r = await s.api('/uploads/kkkkkkkkkkka/youtube', { json: { videoId: 'abcDEF12345', privacy: 'private' } });
  assert.equal(r.body.youtube.url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.equal(r.body.source, 'editor');
  assert.equal(canRefetch(r.body), false);
  // não listada: o link do YouTube vira a fonte
  r = await s.api('/uploads/kkkkkkkkkkka/youtube', { json: { videoId: 'abcDEF12345', privacy: 'unlisted' } });
  assert.equal(r.body.source, 'youtube');
  assert.equal(r.body.url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.equal(canRefetch(r.body), true);
  assert.deepEqual(
    staleOriginals([{ ...r.body, file: 'original.mp4', lastUsedAt: 1, createdAt: 1 }], Date.now(), 1000),
    ['kkkkkkkkkkka'],
  );
});
