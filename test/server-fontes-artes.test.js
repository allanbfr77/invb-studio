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
