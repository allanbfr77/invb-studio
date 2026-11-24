// Fontes enviadas pela equipe, artes feitas com HTML e CSS e templates atualizáveis (gavetas do editor do corte).
const { test, assert, fs, path, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');
const { fontNames, sniffFont } = require('../lib/fonts');

const FONT = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'fonts', f));
const upload = (s, name, buf) =>
  fetch(s.url + '/api/fonts?name=' + encodeURIComponent(name), {
    method: 'POST',
    headers: { 'x-invb': '1', cookie: s.cookie, 'content-type': 'application/octet-stream' },
    body: buf,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('o nome da fonte vem de dentro do arquivo (o mesmo que o gerador de legenda procura)', () => {
  assert.deepEqual(fontNames(FONT('Anton-Regular.ttf')), { full: 'Anton Regular', family: 'Anton' });
  assert.equal(sniffFont(FONT('Anton-Regular.ttf')), '.ttf');
  assert.equal(sniffFont(Buffer.from('wOFF0000000000000000')), null); // WOFF não serve para o ffmpeg
});

test('fontes da equipe: enviar, recusar o que não serve, baixar e excluir', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d);
  const r = await upload(s, 'minha.ttf', FONT('DMSerifDisplay-Italic.ttf'));
  assert.equal(r.status, 201);
  assert.equal(r.body.name, 'DM Serif Display Italic');
  assert.equal((await upload(s, 'de novo.ttf', FONT('DMSerifDisplay-Italic.ttf'))).status, 409); // repetida
  assert.equal((await upload(s, 'app.ttf', FONT('Montserrat-ExtraBold.ttf'))).status, 409); // já vem com o app
  assert.equal((await upload(s, 'foto.ttf', Buffer.from('não é fonte nenhuma'))).status, 415);
  const list = (await s.api('/fonts')).body;
  assert.equal(list.length, 1);
  const file = await fetch(s.url + '/api/fonts/' + list[0].id + '/file', { headers: { cookie: s.cookie } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'font/ttf');
  await s.api('/fonts/' + list[0].id, { method: 'DELETE' });
  assert.deepEqual((await s.api('/fonts')).body, []);
});

test(
  'a legenda e os textos podem usar a fonte enviada, e ela vai para o vídeo',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    const dir = seedTone(d, 'kkkkkkkkkkk4');
    const s = await boot(t, d);
    const f = (await upload(s, 'x.ttf', FONT('DMSerifDisplay-Italic.ttf'))).body;
    await s.api('/uploads/kkkkkkkkkkk4/clips/m111111111111/render', {
      json: {
        format: '9:16',
        captions: { on: true, style: 'Essenciais/Clássica', font: f.name },
        overlays: [{ id: 'a', type: 'text', text: 'Olá', x: 0.5, y: 0.3, font: f.name }],
      },
    });
    const r = await waitRender(s, 'kkkkkkkkkkk4');
    assert.equal(r.status, 'done', r.error);
    const ass = fs.readFileSync(path.join(dir, 'clips', 'm111111111111.ass'), 'utf8');
    assert.equal(ass.match(/^Style: Default,([^,]*)/m)[1], 'DM Serif Display Italic');
    assert.match(ass, /\\fnDM Serif Display Italic|Style: [^,]*,DM Serif Display Italic/);
    assert.ok(!fs.existsSync(path.join(dir, 'clips', 'm111111111111.fonts')), 'a pasta temporária de fontes some');
    // fonte desconhecida continua virando a padrão
    await s.api('/fonts/' + f.id, { method: 'DELETE' });
  },
);

test('artes: guardar o código e a imagem, atualizar e excluir; a imagem não aparece na Mídia', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d);
  // 1×1 PNG transparente
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const img = await fetch(s.url + '/api/library?kind=art&name=Arte.png', {
    method: 'POST',
    headers: { 'x-invb': '1', cookie: s.cookie, 'content-type': 'image/png' },
    body: png,
  }).then((r) => r.json());
  assert.equal(img.kind, 'art');
  const c = await s.api('/arts', {
    json: { name: 'Faixa', w: 99999, h: 300, html: '<div>Oi</div>', css: 'div{color:red}', imgId: img.id },
  });
  assert.equal(c.status, 201);
  assert.equal(c.body.w, 3840); // tamanho limitado
  assert.equal(c.body.imgId, img.id);
  const p = await s.api('/arts/' + c.body.id, { method: 'PATCH', json: { css: 'div{color:blue}' } });
  assert.equal(p.body.css, 'div{color:blue}');
  assert.equal(p.body.html, '<div>Oi</div>'); // o que não veio continua
  assert.equal((await s.api('/arts/naoexiste', { method: 'PATCH', json: {} })).status, 404);
  await s.api('/arts/' + c.body.id, { method: 'DELETE' });
  assert.deepEqual((await s.api('/arts')).body, []);
});

test('template: criar com textos e imagens e atualizar com o visual novo', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d);
  const c = await s.api('/templates', {
    json: {
      name: 'Domingo',
      config: { style: 'Impacto/Impacto', overlays: [{ type: 'text', text: 'A', x: 0.5, y: 0.5 }] },
    },
  });
  const p = await s.api('/templates/' + c.body.id, {
    method: 'PATCH',
    json: {
      config: {
        style: 'Destaque/Karaokê',
        overlays: [
          { type: 'text', text: 'B', x: 0.5, y: 0.5 },
          { type: 'image', imgId: 'abcdef12', x: 0.2, y: 0.8, w: 0.5 },
        ],
      },
    },
  });
  assert.equal(p.status, 200);
  assert.equal(p.body.name, 'Domingo');
  assert.equal(p.body.config.style, 'Destaque/Karaokê');
  assert.deepEqual(
    p.body.config.overlays.map((o) => o.type),
    ['text', 'image'],
  );
  assert.ok(p.body.updatedAt);
});

test('enquadramento: fica entre 0 e 1 e muda o pedaço do vídeo que vai para o quadro', async (t) => {
  const { cleanOpts } = require('../lib/render');
  assert.deepEqual(cleanOpts({}).crop, { x: 0.5, y: 0.5 }); // sem escolha: centro
  assert.deepEqual(cleanOpts({ crop: { x: 3, y: 'a' } }).crop, { x: 1, y: 0.5 });
  if (!HAS_FFMPEG || process.platform === 'win32') return;
  const { spawnSync } = require('child_process');
  const d = tmp(t);
  const dir = seedTone(d, 'kkkkkkkkkkk5');
  const s = await boot(t, d);
  // cor média de um quadro do vídeo exportado (1×1 pixel)
  const avg = () => [
    ...spawnSync('ffmpeg', [
      '-loglevel',
      'error',
      '-ss',
      '1',
      '-i',
      path.join(dir, 'clips', 'm111111111111.mp4'),
      '-frames:v',
      '1',
      '-vf',
      'scale=1:1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ]).stdout,
  ];
  const colors = [];
  for (const x of [0, 1]) {
    await s.api('/uploads/kkkkkkkkkkk5/clips/m111111111111/render', {
      json: { format: '9:16', crop: { x }, captions: false },
    });
    const r = await waitRender(s, 'kkkkkkkkkkk5');
    assert.equal(r.status, 'done', r.error);
    colors.push(avg());
  }
  assert.notDeepEqual(colors[0], colors[1], 'esquerda e direita deram o mesmo quadro');
});

test('formato padrão dos cortes novos: guardar e limpar', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d);
  assert.deepEqual((await s.api('/editor-prefs')).body, { format: null });
  assert.equal((await s.api('/editor-prefs', { method: 'PATCH', json: { format: '9:16' } })).body.format, '9:16');
  assert.equal((await s.api('/editor-prefs')).body.format, '9:16');
  assert.equal((await s.api('/editor-prefs', { method: 'PATCH', json: { format: 'quadrado' } })).body.format, null);
});

test(
  'legenda com efeitos: surgindo, palavras-chave, cresce e entrada vão para o arquivo da legenda',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    const dir = seedTone(d, 'kkkkkkkkkkk6');
    const words = ['Deus', 'é', 'fiel', 'sempre'].map((w, i) => ({ w, s: i, e: i + 0.9 }));
    fs.writeFileSync(
      path.join(dir, 'transcript.json'),
      JSON.stringify({ language: 'pt', segments: [{ id: 0, start: 0, end: 4, text: 'Deus é fiel sempre', words }] }),
    );
    const s = await boot(t, d);
    const ass = async (captions) => {
      await s.api('/uploads/kkkkkkkkkkk6/clips/m111111111111/render', { json: { format: '9:16', captions } });
      const r = await waitRender(s, 'kkkkkkkkkkk6');
      assert.equal(r.status, 'done', r.error);
      return fs
        .readFileSync(path.join(dir, 'clips', 'm111111111111.ass'), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('Dialogue: 1,'));
    };
    // surgindo + palavras-chave: "Deus" no dourado; as palavras ainda não ditas ficam invisíveis
    const rv = await ass({ on: true, style: 'Destaque/Surgindo' });
    assert.equal(rv.length, 4);
    assert.match(rv[0], /\{\\1c&H3AB9F0&\}DEUS|\{\\1c&H3AB9F0&\}Deus/);
    assert.match(rv[0], /\{\\alpha&HFF&\}é fiel sempre$/);
    assert.ok(!/alpha/.test(rv[3])); // na última, a frase toda aparece
    // palavra que cresce + entrada "sobe" só na primeira palavra da frase
    const hl = await ass({ on: true, style: 'Destaque/Destaque dourado', grow: true, anim: 'slide', words: 4 });
    assert.match(hl[0], /\\move\(/);
    assert.ok(!/\\move\(/.test(hl[1]));
    assert.match(hl[1], /\\fscx118\\fscy118/);
    // edição antiga com "pop" continua pulando a cada palavra
    const pp = await ass({ on: true, style: 'Destaque/Destaque dourado', pop: true, words: 4 });
    assert.ok(pp.every((l) => /\\fscx85/.test(l)));
  },
);
