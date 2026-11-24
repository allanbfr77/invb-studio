// Testes do servidor de verdade (sobe o app com dados temporários). O vídeo original: download do YouTube, limpeza automática, liberar espaço, baixar de novo, capa e trecho da pregação.
const {
  test,
  assert,
  fs,
  path,
  spawnSync,
  DAY,
  HAS_FFMPEG,
  seed,
  boot,
  tmp,
  has,
  meta,
  clip,
  fakeYtdlp,
  untilNotRefetching,
  http,
  seedTone,
  probeDur,
  sendVideo,
  waitStatus,
} = require('./helpers');

test(
  'ao atualizar o app, pregações antigas sem registro de uso não são apagadas no primeiro início',
  { skip: !HAS_FFMPEG },
  async (t) => {
    const d = tmp(t);
    const dir = seed(d, 'bbbbbbbbbbbb', { createdAt: Date.now() - 30 * DAY });
    await boot(t, d);
    assert.ok(has(dir, 'original.mp4'), 'o original foi apagado');
    assert.ok(meta(dir).lastUsedAt > Date.now() - 60000);
    assert.ok(!meta(dir).originalGone);
  },
);

test('sem uso há 8 dias, o original é apagado e o resto fica', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'cccccccccccc', { createdAt: Date.now() - 30 * DAY, lastUsedAt: Date.now() - 8 * DAY });
  const s = await boot(t, d);
  assert.ok(!has(dir, 'original.mp4'));
  assert.ok(has(dir, 'transcript.json') && has(dir, 'clips.json'));
  const u = (await s.api('/uploads/cccccccccccc')).body;
  assert.equal(u.originalGone, true);
  assert.equal(u.canRefetch, true);
  assert.equal(u.transcript.lines.length, 1);
});

test('sem yt-dlp/ffmpeg neste computador, a limpeza não apaga o que não daria para baixar de novo', async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'dddddddddddd', { createdAt: Date.now() - 30 * DAY, lastUsedAt: Date.now() - 8 * DAY });
  const s = await boot(t, d, { tools: false });
  assert.ok(has(dir, 'original.mp4'), 'o original foi apagado');
  const r = await s.api('/uploads/dddddddddddd/free', { json: {} });
  assert.equal(r.status, 501);
  assert.ok(has(dir, 'original.mp4'));
});

test('"liberar espaço" recusa enquanto há corte na fila de exportação', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'eeeeeeeeeeee', {}, { clips: [clip({ render: { status: 'rendering' } })] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/eeeeeeeeeeee/free', { json: {} });
  assert.equal(r.status, 409);
  assert.ok(has(dir, 'original.mp4'));
});

test(
  'vídeo sumiu do disco sem a marca de "apagado": a tela é avisada e "baixar de novo" tenta de verdade',
  { skip: !HAS_FFMPEG },
  async (t) => {
    const d = tmp(t);
    const dir = seed(d, 'ffffffffffff', {}, { original: false });
    const s = await boot(t, d);
    const u = (await s.api('/uploads/ffffffffffff')).body;
    assert.equal(u.originalGone, true);
    assert.equal(u.canRefetch, true);
    assert.equal((await s.api('/uploads/ffffffffffff/media')).status, 410);
    const r = await s.api('/uploads/ffffffffffff/refetch', { json: {} });
    assert.equal(r.status, 202);
    // o yt-dlp falso falha: o envio volta a ficar disponível para nova tentativa, com a mensagem de erro
    let m;
    for (let i = 0; i < 80; i++) {
      m = (await s.api('/uploads/ffffffffffff')).body;
      if (!m.refetching) break;
      await new Promise((r2) => setTimeout(r2, 50));
    }
    assert.equal(m.refetching, false);
    assert.match(m.refetchError, /YouTube/);
    assert.equal(m.originalGone, true);
    assert.ok(has(dir, 'transcript.json'));
  },
);

test(
  'download do YouTube que deixa só pedaços não registra arquivo parcial como original',
  { skip: !HAS_FFMPEG },
  async (t) => {
    const d = tmp(t);
    const dir = seed(d, 'gggggggggggg', { originalGone: true }, { original: false });
    fs.writeFileSync(path.join(dir, 'original.f137.mp4.part'), 'pedaço');
    fs.writeFileSync(path.join(dir, 'original.f251.webm'), 'só áudio de tentativa antiga');
    const s = await boot(t, d);
    assert.equal((await s.api('/uploads/gggggggggggg/refetch', { json: {} })).status, 202);
    let m;
    for (let i = 0; i < 80; i++) {
      m = (await s.api('/uploads/gggggggggggg')).body;
      if (!m.refetching) break;
      await new Promise((r2) => setTimeout(r2, 50));
    }
    assert.equal(m.originalGone, true);
    assert.match(m.refetchError || '', /YouTube/);
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.startsWith('original.')),
      [],
    );
  },
);

test('arquivo enviado do computador nunca é apagado pela limpeza nem pelo "liberar espaço"', async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'hhhhhhhhhhhh', {
    source: 'upload',
    url: undefined,
    createdAt: Date.now() - 400 * DAY,
    lastUsedAt: Date.now() - 400 * DAY,
  });
  const s = await boot(t, d);
  assert.ok(has(dir, 'original.mp4'));
  assert.equal((await s.api('/uploads/hhhhhhhhhhhh/free', { json: {} })).status, 400);
  assert.ok(has(dir, 'original.mp4'));
});

test(
  'o download do YouTube usa o Node como runtime JavaScript do yt-dlp',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'jjjjjjjjjjjj', { originalGone: true }, { original: false });
    const y = fakeYtdlp(d, { acceptsFlag: true });
    const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
    await s.api('/uploads/jjjjjjjjjjjj/refetch', { json: {} });
    await untilNotRefetching(s, 'jjjjjjjjjjjj');
    const args = fs.readFileSync(y.log, 'utf8');
    assert.match(args, /--js-runtimes node:\S+/);
    assert.match(args, /https:\/\/www\.youtube\.com\/watch\?v=abc/);
  },
);

test(
  'yt-dlp antigo, que não conhece a opção, é chamado sem ela',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'kkkkkkkkkkkk', { originalGone: true }, { original: false });
    const y = fakeYtdlp(d, { acceptsFlag: false });
    const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
    await s.api('/uploads/kkkkkkkkkkkk/refetch', { json: {} });
    await untilNotRefetching(s, 'kkkkkkkkkkkk');
    const args = fs.readFileSync(y.log, 'utf8');
    assert.doesNotMatch(args, /--js-runtimes/);
    assert.match(args, /watch\?v=abc/);
  },
);

// --- achado no primeiro uso real: "--ffmpeg-location ffmpeg" faz o yt-dlp rodar SEM ffmpeg e não juntar vídeo e áudio ---
test(
  'o yt-dlp não recebe um --ffmpeg-location que não é um caminho de verdade',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'llllllllllll', { originalGone: true }, { original: false });
    const y = fakeYtdlp(d, { acceptsFlag: true });
    const s = await boot(t, d, { env: { YTDLP_PATH: y.f, FFMPEG_PATH: '' } }); // ffmpeg achado pelo PATH, como nos computadores da equipe
    await s.api('/uploads/llllllllllll/refetch', { json: {} });
    await untilNotRefetching(s, 'llllllllllll');
    const args = fs.readFileSync(y.log, 'utf8');
    const m = args.match(/--ffmpeg-location (\S+)/);
    assert.ok(
      !m || path.isAbsolute(m[1]),
      `--ffmpeg-location recebeu "${m && m[1]}", que o yt-dlp trata como arquivo inexistente`,
    );
  },
);

// --- achado no primeiro uso real: o Safari não toca VP9/AV1 nem Opus dentro de mp4; pedir H.264 + AAC primeiro ---
test(
  'o download do YouTube pede primeiro H.264 com áudio AAC, que toca em qualquer navegador',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'mmmmmmmmmmmm', { originalGone: true }, { original: false });
    const y = fakeYtdlp(d, { acceptsFlag: true });
    const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
    await s.api('/uploads/mmmmmmmmmmmm/refetch', { json: {} });
    await untilNotRefetching(s, 'mmmmmmmmmmmm');
    const fmt = (fs.readFileSync(y.log, 'utf8').match(/-f (\S+)/) || [])[1] || '';
    const opts = fmt.split('/');
    assert.match(opts[0], /vcodec\^=avc1/);
    assert.match(opts[0], /ba\[ext=m4a\]/);
    assert.match(opts[0], /height<=1080/);
    assert.equal(opts[opts.length - 1], 'b', 'mantém a alternativa genérica no fim, para vídeos sem H.264');
  },
);

// --- "Arquivo grande demais" passa a dizer o tamanho, o limite e como aumentar ---
test('arquivo acima do limite recebe mensagem com o tamanho, o limite e a configuração a mudar', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d, { env: { MAX_UPLOAD_GB: '0.000001' } }); // limite de ~1 KB
  const r = await s.api('/uploads?name=grande.mp4', { json: 'x'.repeat(5000) });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /Arquivo grande demais/);
  assert.match(r.body.error, /limite/i);
  assert.match(r.body.error, /MAX_UPLOAD_GB/);
  assert.match(r.body.error, /\d/);
});

// --- achado no uso real: o YouTube entregou arquivo vazio para o formato H.264 ---
test(
  'se o primeiro formato falhar, o download tenta de novo com formatos mais simples',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'ssssssssssss', { originalGone: true }, { original: false });
    const y = fakeYtdlp(d, { acceptsFlag: true });
    const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
    await s.api('/uploads/ssssssssssss/refetch', { json: {} });
    await untilNotRefetching(s, 'ssssssssssss');
    const formats = fs
      .readFileSync(y.log, 'utf8')
      .trim()
      .split('\n')
      .map((l) => (l.match(/-f (\S+)/) || [])[1]);
    assert.equal(formats.length, 4);
    assert.match(formats[0], /vcodec\^=avc1/);
    assert.equal(formats[1], 'bv*[height<=1080]+ba/b');
    assert.equal(formats[2], 'bv*[height<=1080]+ba/b');
    assert.equal(formats[3], 'b');
    // as duas primeiras tentativas baixam em várias conexões ao mesmo tempo; as últimas usam o modo simples, mais lento e mais seguro
    const lines = fs.readFileSync(y.log, 'utf8').trim().split('\n');
    assert.deepEqual(
      lines.map((l) => /--extractor-args youtube:formats=dashy/.test(l) && /-N 8\b/.test(l)),
      [true, true, false, false],
    );
  },
);

test(
  'o navegador recebe a cópia compatível quando ela existe, e o original quando pede o original',
  { skip: !HAS_FFMPEG },
  async (t) => {
    const d = tmp(t);
    const dir = seed(d, 'tttttttttttt', { preview: 'preview.mp4' });
    fs.writeFileSync(path.join(dir, 'preview.mp4'), 'copia-leve');
    const s = await boot(t, d);
    const get = async (p2) =>
      (await fetch(s.url + '/api/uploads/tttttttttttt/' + p2, { headers: { 'x-invb': '1', cookie: s.cookie } })).text();
    assert.equal(await get('media'), 'copia-leve');
    assert.equal(await get('media?orig=1'), 'fake');
  },
);

test('"liberar espaço" apaga também a cópia do navegador', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t);
  const dir = seed(d, 'uuuuuuuuuuuu', { preview: 'preview.mp4' });
  fs.writeFileSync(path.join(dir, 'preview.mp4'), 'copia-leve');
  const s = await boot(t, d);
  assert.equal((await s.api('/uploads/uuuuuuuuuuuu/free', { json: {} })).status, 200);
  assert.ok(!has(dir, 'preview.mp4') && !has(dir, 'original.mp4') && has(dir, 'transcript.json'));
});

// --- um download lento (ex.: live recém-encerrada) não pode travar o resto do app ---
test(
  'enquanto um vídeo baixa do YouTube, outras tarefas (análise, exportação) continuam andando',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seed(d, 'aaaaaaaaaab1');
    fs.writeFileSync(
      path.join(d, 'uploads', 'aaaaaaaaaab1', 'transcript.json'),
      JSON.stringify({
        language: 'pt',
        segments: Array.from({ length: 30 }, (_, i) => ({
          id: i,
          speaker: 'Pessoa 1',
          start: i * 10,
          end: i * 10 + 9,
          text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito para todo aquele que nele crê.',
        })),
      }),
    );
    const slow = path.join(d, 'yt-lento.sh');
    fs.writeFileSync(
      slow,
      '#!/bin/bash\nfor a in "$@"; do [ "$a" = "--version" ] && { echo 2026.01.01; exit 0; }; [ "$a" = "--print" ] && { printf "not_live\\tVideo lento\\n"; exit 0; }; done\nsleep 4\nexit 1\n',
      { mode: 0o755 },
    );
    const s = await boot(t, d, { env: { YTDLP_PATH: slow, ANTHROPIC_API_KEY: '' } });
    const imp = await s.api('/uploads/youtube', { json: { url: 'https://www.youtube.com/watch?v=abc' } });
    assert.equal(imp.status, 201);
    await new Promise((r) => setTimeout(r, 300)); // o download já começou
    const t0 = Date.now();
    await s.api('/uploads/aaaaaaaaaab1/reanalyze', { json: {} });
    let m;
    for (let i = 0; i < 40; i++) {
      m = (await s.api('/uploads/aaaaaaaaaab1')).body;
      if (m.clips.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(m.clips.length > 0, 'a análise do outro vídeo ficou presa atrás do download');
    assert.ok(Date.now() - t0 < 2500, `demorou ${Date.now() - t0} ms`);
    assert.equal((await s.api('/uploads/' + imp.body.id)).body.status, 'processing');
  },
);

// --- capa do vídeo: a do YouTube quando veio de lá; senão, o primeiro quadro ---
test('vídeo do YouTube usa a capa do YouTube, guardada no computador', { skip: !HAS_FFMPEG }, async (t) => {
  const hits = [];
  const img = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/vi/PFyDkicLdgk/hqdefault.jpg') {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(Buffer.from('capa-do-youtube'));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => img.listen(0, '127.0.0.1', r));
  t.after(() => img.close());
  const d = tmp(t);
  const dir = seed(d, 'jjjjjjjjjjk1', { url: 'https://youtu.be/PFyDkicLdgk?si=x' });
  const s = await boot(t, d, { env: { INVB_YTIMG_BASE: 'http://127.0.0.1:' + img.address().port } });
  const get = async () => {
    const r = await fetch(s.url + '/api/uploads/jjjjjjjjjjk1/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } });
    return { status: r.status, type: r.headers.get('content-type'), body: await r.text() };
  };
  const a = await get();
  assert.equal(a.status, 200);
  assert.equal(a.type, 'image/jpeg');
  assert.equal(a.body, 'capa-do-youtube');
  assert.deepEqual(hits, ['/vi/PFyDkicLdgk/maxresdefault.jpg', '/vi/PFyDkicLdgk/hqdefault.jpg']);
  assert.ok(has(dir, 'thumb.jpg'));
  await get();
  assert.equal(hits.length, 2, 'a segunda vez usa a cópia guardada, sem pedir de novo ao YouTube');
});

test('vídeo que não veio do YouTube usa o primeiro quadro como capa', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t);
  const dir = seedTone(d, 'kkkkkkkkkkl1');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  m.source = 'upload';
  delete m.url;
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m));
  const s = await boot(t, d);
  const r = await fetch(s.url + '/api/uploads/kkkkkkkkkkl1/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.length > 500 && buf[0] === 0xff && buf[1] === 0xd8, 'deveria ser um JPEG de verdade');
});

test('sem capa do YouTube e sem vídeo no computador, a capa responde 404 e não quebra a tela', async (t) => {
  const d = tmp(t);
  seed(d, 'lllllllllm01', { source: 'upload', url: undefined }, { original: false });
  const s = await boot(t, d);
  assert.equal(
    (await fetch(s.url + '/api/uploads/lllllllllm01/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } })).status,
    404,
  );
});

test(
  'envio com o trecho da pregação: o vídeo guardado fica só com ele, e tentar de novo não corta outra vez',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t),
      src = path.join(d, 'culto.mp4');
    spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=25:duration=60',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=300:duration=60',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-g',
      '25',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      src,
    ]);
    const s = await boot(t, d, { env: { TRANSCRIBE_PROVIDER: 'local' } }); // sem Whisper: a transcrição falha logo depois do recorte
    const r = await sendVideo(s, src, '&start=0:10&end=0:45');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.range, { start: 10, end: 45 });
    let m = await waitStatus(s, r.body.id);
    assert.equal(m.rangeApplied, true);
    assert.match(m.error, /faster-whisper/);
    const f = path.join(d, 'uploads', m.id, m.file),
      dur = probeDur(f);
    assert.ok(dur >= 34.5 && dur <= 36.5, `duração ${dur}`);
    assert.ok(!fs.readdirSync(path.join(d, 'uploads', m.id)).some((x) => x.startsWith('trecho.tmp')));
    await s.api(`/uploads/${m.id}/retry`, { json: {} });
    m = await waitStatus(s, m.id);
    assert.ok(Math.abs(probeDur(f) - dur) < 0.1, 'o vídeo não pode ser cortado duas vezes');
    // só o início: vai até o fim do vídeo
    const r2 = await sendVideo(s, src, '&start=0:20');
    const m2 = await waitStatus(s, r2.body.id);
    assert.ok(Math.abs(probeDur(path.join(d, 'uploads', m2.id, m2.file)) - 40) < 1.5);
    // início depois do fim do vídeo
    const r3 = await sendVideo(s, src, '&start=5:00');
    const m3 = await waitStatus(s, r3.body.id);
    assert.equal(m3.status, 'error');
    assert.match(m3.error, /passa do fim do vídeo/);
  },
);

test('trecho inválido é recusado antes de começar, com o motivo', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d);
  const up = await fetch(`${s.url}/api/uploads?name=culto.mp4&start=1:00:00&end=50:00`, {
    method: 'POST',
    headers: { 'x-invb': '1', cookie: s.cookie },
    body: 'x',
  });
  assert.equal(up.status, 400);
  assert.match((await up.json()).error, /depois do início/);
  const yt = await s.api('/uploads/youtube', {
    json: { url: 'https://www.youtube.com/watch?v=abc', range: { start: 'uma hora' } },
  });
  assert.equal(yt.status, 400);
  assert.match(yt.body.error, /início da pregação/);
  const dr = await s.api('/uploads/drive', {
    json: { url: 'https://drive.google.com/file/d/abcdefghijk123/view', range: { start: '10:00', end: '10:05' } },
  });
  assert.equal(dr.status, 400);
  assert.match(dr.body.error, /30 segundos/);
  assert.deepEqual(fs.existsSync(path.join(d, 'uploads')) ? fs.readdirSync(path.join(d, 'uploads')) : [], []);
});
