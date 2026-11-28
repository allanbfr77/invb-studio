// Som do corte: efeitos gerados (whoosh, boom...), música enviada ou do Freesound, e a mistura na exportação,
// com a música abaixando sob a voz. Mede a energia do áudio em faixas de frequência para conferir cada parte.
const fs = require('fs');
const path = require('path');
const http = require('node:http');
const { spawnSync } = require('child_process');
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

// volume médio (dB) de uma faixa de frequência num trecho do arquivo
function level(file, ss, t, band) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner',
    '-ss',
    String(ss),
    '-t',
    String(t),
    '-i',
    file,
    '-af',
    `${band},volumedetect`,
    '-f',
    'null',
    '-',
  ]);
  const m = /mean_volume: (-?[\d.]+) dB/.exec(String(r.stderr));
  return m ? +m[1] : -120;
}
const tone = (f, hz, dur) =>
  spawnSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${hz}:duration=${dur}`,
    '-ac',
    '2',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    f,
  ]);

test(
  'Som: efeitos e música saem misturados no arquivo, e a música abaixa sob a voz',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkki'); // a "voz" do teste é um tom de 300 Hz
    // Freesound de mentira: uma música (tom de 2000 Hz)
    const media = path.join(d, 'fs');
    fs.mkdirSync(media);
    tone(path.join(media, 'musica.mp3'), 2000, 4);
    let tokenSeen = '';
    const searches = [];
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const base = `http://127.0.0.1:${srv.address().port}`;
      if (u.pathname === '/prev/musica.mp3') return fs.createReadStream(path.join(media, 'musica.mp3')).pipe(res);
      tokenSeen = u.searchParams.get('token');
      if (u.pathname === '/search/text/')
        searches.push({ q: u.searchParams.get('query'), f: u.searchParams.getAll('filter').join(' ') });
      const it = {
        id: 555,
        name: 'Piano calmo',
        username: 'autor1',
        license: 'http://creativecommons.org/licenses/by/4.0/',
        duration: 4,
        url: 'https://freesound.org/s/555/',
        previews: { 'preview-hq-mp3': base + '/prev/musica.mp3' },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      if (u.pathname === '/search/text/') return res.end(JSON.stringify({ count: 1, results: [it] }));
      if (u.pathname === '/sounds/555/') return res.end(JSON.stringify(it));
      res.end('{}');
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    t.after(() => srv.close());
    const s = await boot(t, d, {
      env: { FREESOUND_API_KEY: 'chave-fs', INVB_FREESOUND_API_BASE: `http://127.0.0.1:${srv.address().port}` },
    });
    assert.equal((await s.api('/status')).body.musicSearch, true);
    // efeito com a chave do Freesound: o melhor resultado da busca do tipo vira o som (mp3) e fica como escolha
    const w = await fetch(s.url + '/api/sfx/boom/file', { headers: { cookie: s.cookie } });
    assert.equal(w.status, 200);
    assert.equal(w.headers.get('content-type'), 'audio/mpeg');
    assert.ok(
      searches.some((x) => /cinematic boom impact/.test(x.q) && /Creative Commons 0/.test(x.f)),
      'busca só CC0',
    );
    const opts = (await s.api('/sfx/boom/options')).body;
    assert.equal(opts.chosen, '555');
    assert.equal(opts.items[0].id, '555');
    assert.equal((await s.api('/sfx/boom/choose', { json: { id: '555' } })).status, 200);
    assert.equal((await s.api('/sfx/search?q=aplausos')).body.items.length, 1);
    assert.equal((await s.api('/sfx/fs', { json: { id: '555' } })).body.type, 'fs555');
    assert.equal((await s.api('/sfx/nada/file')).status, 404);
    // música do Freesound
    const found = (await s.api('/music/search?q=piano')).body.items;
    assert.equal(found[0].license, 'CC BY (citar o autor)');
    assert.equal(tokenSeen, 'chave-fs');
    const mu = (await s.api('/music/freesound', { json: { id: '555' } })).body;
    assert.equal(mu.id, 'fs555');
    assert.equal(mu.by, 'autor1');
    // música enviada pela equipe
    const up = path.join(d, 'minha.mp3');
    tone(up, 2000, 4);
    const ur = await fetch(s.url + '/api/music?name=Minha', {
      method: 'POST',
      headers: { cookie: s.cookie, 'x-invb': '1' },
      body: fs.readFileSync(up),
    });
    assert.equal(ur.status, 201);
    const mine = await ur.json();
    assert.match(mine.id, /^up/);
    const bad = await fetch(s.url + '/api/music', {
      method: 'POST',
      headers: { cookie: s.cookie, 'x-invb': '1' },
      body: 'não é música',
    });
    assert.equal(bad.status, 415);
    const cid = (await s.api('/uploads/kkkkkkkkkkki/clips')).body[0].id;
    const exp = async (json) => {
      await s.api(`/uploads/kkkkkkkkkkki/clips/${cid}/render`, { json: { captions: false, ...json } });
      const r = await waitRender(s, 'kkkkkkkkkkki');
      const f = path.join(d, 'uploads', 'kkkkkkkkkkki', 'clips', r.file);
      const copy = f + '.' + Object.keys(json).join('') + (json.music && json.music.duck ? 'duck' : '') + '.mp4';
      fs.copyFileSync(f, copy);
      return copy;
    };
    const plain = await exp({});
    const withAll = await exp({
      sfx: [
        { type: 'boom', at: 2, vol: 1 },
        { type: 'nada', at: 1 },
      ],
      music: { mediaId: 'fs555', vol: 0.5, duck: false },
    });
    const ducked = await exp({ music: { mediaId: 'fs555', vol: 0.5, duck: true } });
    const MUS = 'bandpass=f=2000:w=200',
      LOW = 'lowpass=f=90';
    // a música aparece (2000 Hz), e abaixada quando a voz toca o tempo todo
    assert.ok(level(withAll, 0.5, 1, MUS) > level(plain, 0.5, 1, MUS) + 20, 'música entrou');
    assert.ok(level(ducked, 2.5, 1, MUS) < level(withAll, 2.5, 1, MUS) - 4, 'música abaixa sob a voz');
    // o efeito entra aos 2 s e não antes (aqui o "boom" escolhido no Freesound de mentira é um tom de 2000 Hz)
    const onlySfx = await exp({ sfx: [{ type: 'boom', at: 2, vol: 1 }] });
    assert.ok(level(onlySfx, 2.0, 0.6, MUS) > level(onlySfx, 0.3, 0.6, MUS) + 15, 'efeito aos 2 s');
    void LOW;
    // a voz continua lá
    const vA = level(withAll, 3, 1, 'bandpass=f=300:w=50'),
      vP = level(plain, 3, 1, 'bandpass=f=300:w=50');
    assert.ok(Math.abs(vA - vP) < 3, `a voz não mudou: ${vA} x ${vP}`);
  },
);

test(
  'Som sem a chave do Freesound: os efeitos básicos são gerados no Studio',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkn');
    const s = await boot(t, d, { env: { FREESOUND_API_KEY: '' } });
    const w = await fetch(s.url + '/api/sfx/whoosh/file', { headers: { cookie: s.cookie } });
    assert.equal(w.status, 200);
    assert.equal(
      Buffer.from(await w.arrayBuffer())
        .slice(8, 12)
        .toString(),
      'WAVE',
    );
    assert.equal((await s.api('/sfx/sino/file')).status, 503); // só existe pelo Freesound
  },
);
