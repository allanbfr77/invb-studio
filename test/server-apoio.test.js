// Imagens de apoio (Pexels): busca, baixar uma vez, servir e exportar (tela cheia com zoom, cartão em P&B).
// O Pexels aqui é simulado, com as mesmas rotas e formatos da API.
const fs = require('fs');
const path = require('path');
const http = require('node:http');
const { spawnSync } = require('child_process');
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

function px(file, t, x, y) {
  const r = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(t),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `crop=8:8:${x}:${y},scale=1:1`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const [R, G, B] = r.stdout;
  return { R, G, B };
}

test(
  'Apoio: busca no Pexels, baixa uma vez e sai no arquivo (tela cheia e cartão)',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    // arquivos "do Pexels": uma foto verde e um vídeo azul
    const media = path.join(d, 'pexels');
    fs.mkdirSync(media, { recursive: true });
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x00c000:s=640x960',
      '-frames:v',
      '1',
      path.join(media, 'foto.jpg'),
    ]);
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x2040ff:s=1280x720:d=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      path.join(media, 'video.mp4'),
    ]);
    const hits = { auth: new Set(), files: 0 };
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const base = `http://127.0.0.1:${srv.address().port}`;
      const json = (o) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      if (u.pathname.startsWith('/arquivo/')) {
        hits.files++;
        return fs.createReadStream(path.join(media, path.basename(u.pathname))).pipe(res);
      }
      hits.auth.add(req.headers.authorization);
      const photo = {
        id: 111,
        width: 640,
        height: 960,
        url: 'https://www.pexels.com/photo/111',
        photographer: 'Ana',
        alt: 'mãos',
        src: { medium: base + '/arquivo/foto.jpg', large2x: base + '/arquivo/foto.jpg' },
      };
      const video = {
        id: 222,
        width: 1280,
        height: 720,
        duration: 2,
        url: 'https://www.pexels.com/video/222',
        image: base + '/arquivo/foto.jpg',
        user: { name: 'Beto' },
        video_files: [
          {
            id: 1,
            quality: 'uhd',
            file_type: 'video/mp4',
            width: 3840,
            height: 2160,
            link: base + '/arquivo/grande.mp4',
          },
          { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1280, height: 720, link: base + '/arquivo/video.mp4' },
        ],
      };
      if (u.pathname === '/v1/search') {
        assert.equal(u.searchParams.get('query'), 'mãos');
        return json({ photos: [photo] });
      }
      if (u.pathname === '/videos/search') return json({ videos: [video] });
      if (u.pathname === '/v1/photos/111') return json(photo);
      if (u.pathname === '/videos/videos/222') return json(video);
      res.writeHead(404);
      res.end('{}');
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    t.after(() => srv.close());
    seedTone(d, 'kkkkkkkkkkkh');
    const s = await boot(t, d, {
      env: { PEXELS_API_KEY: 'chave-pexels-teste', PEXELS_API_URL: `http://127.0.0.1:${srv.address().port}` },
    });
    assert.equal((await s.api('/status')).body.broll, true);
    const fotos = (await s.api('/broll/search?q=' + encodeURIComponent('mãos') + '&kind=photo&orientation=portrait'))
      .body.items;
    assert.equal(fotos[0].pexelsId, '111');
    assert.equal(fotos[0].by, 'Ana');
    const vids = (await s.api('/broll/search?q=queda&kind=video')).body.items;
    assert.equal(vids[0].kind, 'video');
    assert.deepEqual([...hits.auth], ['chave-pexels-teste']); // a chave vai só do servidor para o Pexels
    const f = (await s.api('/broll', { json: { kind: 'photo', pexelsId: '111' } })).body;
    const v = (await s.api('/broll', { json: { kind: 'video', pexelsId: '222' } })).body;
    assert.equal(f.id, 'pf111');
    assert.equal(v.id, 'pv222');
    assert.equal(v.w, 1280); // escolheu o arquivo HD, não o 4K
    await s.api('/broll', { json: { kind: 'photo', pexelsId: '111' } }); // de novo: não baixa outra vez
    assert.equal(hits.files, 2);
    const file = await fetch(s.url + '/api/broll/pv222/file', { headers: { cookie: s.cookie, range: 'bytes=0-9' } });
    assert.equal(file.status, 206);
    assert.equal((await s.api('/broll', { json: { kind: 'foto', pexelsId: 'x' } })).status, 400);
    // exportação 9:16: foto em tela cheia com zoom de 1 a 2,5 s; vídeo em cartão P&B de 3,5 a 5 s
    const cid = (await s.api('/uploads/kkkkkkkkkkkh/clips')).body[0].id;
    await s.api(`/uploads/kkkkkkkkkkkh/clips/${cid}/render`, {
      json: {
        captions: false,
        format: '9:16',
        broll: [
          { mediaId: 'pf111', start: 1, end: 2.5, mode: 'full', zoom: true, bw: false },
          { mediaId: 'pv222', start: 3.5, end: 5, mode: 'card', bw: true },
          { mediaId: 'pf999', start: 0, end: 1 }, // não baixada: ignorada
        ],
      },
    });
    const r = await waitRender(s, 'kkkkkkkkkkkh');
    const out = path.join(d, 'uploads', 'kkkkkkkkkkkh', 'clips', r.file);
    const before = px(out, 0.5, 536, 956),
      full = px(out, 1.8, 536, 956),
      corner = px(out, 1.8, 20, 20),
      card = px(out, 4.2, 536, 956),
      dim = px(out, 4.2, 20, 20),
      after = px(out, 5.6, 536, 956);
    assert.ok(full.G > 150 && full.R < 60 && full.B < 60, 'foto verde na tela toda: ' + JSON.stringify(full));
    assert.ok(corner.G > 150, 'até no canto: ' + JSON.stringify(corner));
    assert.ok(
      Math.max(card.R, card.G, card.B) - Math.min(card.R, card.G, card.B) < 25,
      'cartão em P&B: ' + JSON.stringify(card),
    );
    // atrás do cartão, o vídeo fica desfocado e escurecido (antes era uma tarja preta)
    const raw = px(out, 0.5, 20, 20);
    assert.ok(
      dim.R + dim.G + dim.B < (raw.R + raw.G + raw.B) * 0.85,
      'fundo escurecido atrás do cartão: ' + JSON.stringify(dim),
    );
    assert.notDeepEqual(before, full);
    assert.ok(!(after.G > 150 && after.R < 60), 'depois do tempo, volta o vídeo: ' + JSON.stringify(after));
  },
);

// Sem a chave do Pexels (que pausou as chaves novas), o Apoio usa o Pixabay, com a chave na própria URL.
test(
  'Apoio pelo Pixabay: busca, baixa e sai no arquivo',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    const media = path.join(d, 'pixabay');
    fs.mkdirSync(media, { recursive: true });
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0xc00000:s=640x960',
      '-frames:v',
      '1',
      path.join(media, 'foto.jpg'),
    ]);
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x2040ff:s=720x1280:d=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      path.join(media, 'video.mp4'),
    ]);
    const seen = [];
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const base = `http://127.0.0.1:${srv.address().port}`;
      if (u.pathname.startsWith('/arq/'))
        return fs.createReadStream(path.join(media, path.basename(u.pathname))).pipe(res);
      seen.push(
        u.pathname +
          ' key=' +
          u.searchParams.get('key') +
          ' q=' +
          (u.searchParams.get('q') || '') +
          ' id=' +
          (u.searchParams.get('id') || '') +
          ' o=' +
          (u.searchParams.get('orientation') || ''),
      );
      const photo = {
        id: 77,
        pageURL: 'https://pixabay.com/p/77',
        tags: 'mãos, luz',
        webformatURL: base + '/arq/foto.jpg',
        largeImageURL: base + '/arq/foto.jpg',
        imageWidth: 640,
        imageHeight: 960,
        user: 'ana',
      };
      const video = {
        id: 88,
        pageURL: 'https://pixabay.com/v/88',
        tags: 'queda',
        duration: 2,
        user: 'beto',
        videos: {
          large: { url: base + '/arq/grande.mp4', width: 2160, height: 3840, thumbnail: base + '/arq/foto.jpg' },
          medium: { url: base + '/arq/video.mp4', width: 720, height: 1280, thumbnail: base + '/arq/foto.jpg' },
        },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ total: 1, hits: [u.pathname === '/api/videos/' ? video : photo] }));
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    t.after(() => srv.close());
    seedTone(d, 'kkkkkkkkkkkj');
    const s = await boot(t, d, {
      env: {
        PEXELS_API_KEY: '',
        PIXABAY_API_KEY: 'chave-pixabay',
        PIXABAY_API_URL: `http://127.0.0.1:${srv.address().port}`,
      },
    });
    const st = (await s.api('/status')).body;
    assert.equal(st.broll, true);
    assert.equal(st.brollSource, 'Pixabay');
    const fotos = (await s.api('/broll/search?q=' + encodeURIComponent('mãos') + '&kind=photo&orientation=portrait'))
      .body.items;
    assert.equal(fotos[0].pexelsId, '77');
    assert.equal(fotos[0].by, 'ana');
    const vids = (await s.api('/broll/search?q=queda&kind=video')).body.items;
    assert.equal(vids[0].dur, 2);
    const f = (await s.api('/broll', { json: { kind: 'photo', pexelsId: '77' } })).body;
    const v = (await s.api('/broll', { json: { kind: 'video', pexelsId: '88' } })).body;
    assert.equal(f.id, 'xf77');
    assert.equal(v.id, 'xv88');
    assert.equal(v.source, 'Pixabay');
    assert.equal(v.w, 720); // o vídeo leve, não o 4K
    assert.match(seen[0], /^\/api\/ key=chave-pixabay q=mãos id= o=vertical$/);
    assert.ok(seen.some((x) => /^\/api\/videos\/ .* id=88/.test(x)));
    const cid = (await s.api('/uploads/kkkkkkkkkkkj/clips')).body[0].id;
    await s.api(`/uploads/kkkkkkkkkkkj/clips/${cid}/render`, {
      json: {
        captions: false,
        format: '9:16',
        broll: [
          { mediaId: 'xf77', start: 1, end: 2.5, mode: 'full' },
          { mediaId: 'xv88', start: 3.5, end: 5, mode: 'full' },
        ],
      },
    });
    const r = await waitRender(s, 'kkkkkkkkkkkj');
    const out = path.join(d, 'uploads', 'kkkkkkkkkkkj', 'clips', r.file);
    const red = px(out, 1.8, 536, 956),
      blue = px(out, 4.2, 536, 956);
    assert.ok(red.R > 150 && red.G < 60, 'foto do Pixabay na tela: ' + JSON.stringify(red));
    assert.ok(blue.B > 150 && blue.R < 90, 'vídeo do Pixabay na tela: ' + JSON.stringify(blue));
  },
);
