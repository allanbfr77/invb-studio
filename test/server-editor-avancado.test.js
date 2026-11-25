// Testes do servidor de verdade: o Editor avançado (arquivos exportados do invb-editor) servido em /editor-avancado.
const { test, assert, fs, path, boot, tmp } = require('./helpers');

/** Pasta com uma exportação de mentira do editor, no mesmo formato que o build:studio gera. */
function fakeEditor(t) {
  const dir = path.join(tmp(t), 'editor-avancado');
  const put = (rel, data) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), data);
  };
  put('index.html', '<p>lista</p>');
  put('projects.html', '<p>projetos</p>');
  put('editor.html', '<p>editor</p>');
  put('_next/static/app-abc.js', 'console.log(1)');
  put('wasm/core.wasm', Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  put('fonts/font-chunk-0.avif', Buffer.from([0]));
  put('_next/static/media/ort.bundle.min.mjs', 'export {}');
  return dir;
}
const bootEditor = async (t, editorDir) => boot(t, tmp(t), { env: { INVB_EDITOR_DIR: editorDir } });
const get = async (s, p) => {
  const r = await fetch(s.url + p, { redirect: 'follow' });
  return { status: r.status, headers: r.headers, text: await r.text() };
};

test('/editor-avancado/ serve o index.html do editor', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado/');
  assert.equal(r.status, 200);
  assert.match(r.text, /lista/);
});

test('/editor-avancado (sem barra) também abre o editor', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado');
  assert.equal(r.status, 200);
  assert.match(r.text, /lista/);
});

test('caminho sem extensão serve o .html correspondente', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado/projects');
  assert.equal(r.status, 200);
  assert.match(r.text, /projetos/);
});

test('F5 no editor mantém a busca', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado/editor?id=abc');
  assert.equal(r.status, 200);
  assert.equal(r.text, '<p>editor</p>');
});

test('arquivo inexistente do editor dá 404, não a tela do studio', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado/_next/static/nao-existe.js');
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.text, /INVB Studio · Nova Vida Botafogo/);
});

/** Pedido com o caminho exatamente como escrito (o fetch normalizaria "../" e "%2e%2e" antes de enviar). */
const rawGet = (s, p) =>
  new Promise((ok, fail) => {
    const u = new URL(s.url);
    require('node:http')
      .get({ host: u.hostname, port: u.port, path: p }, (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => ok({ status: res.statusCode, text }));
      })
      .on('error', fail);
  });

test('não sai da pasta do editor', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  // A barra codificada chega até o editor, que prende o caminho dentro da pasta dele.
  const encoded = await rawGet(s, '/editor-avancado/..%2F..%2Fserver.js');
  assert.ok([403, 404].includes(encoded.status), `respondeu ${encoded.status}`);
  // "../" e "%2e%2e" o servidor já resolve antes (viram /server.js, fora do editor): o importante é não vazar arquivo.
  for (const p of ['/editor-avancado/..%2F..%2Fserver.js', '/editor-avancado/%2e%2e/%2e%2e/server.js', '/editor-avancado/../../server.js']) {
    const r = await rawGet(s, p);
    assert.doesNotMatch(r.text, /createServer/, `${p} vazou o server.js`);
  }
});

test('wasm vai com application/wasm', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await get(s, '/editor-avancado/wasm/core.wasm');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/wasm');
});

test('avif e mjs vão com o tipo certo', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  assert.equal((await get(s, '/editor-avancado/fonts/font-chunk-0.avif')).headers.get('content-type'), 'image/avif');
  assert.match((await get(s, '/editor-avancado/_next/static/media/ort.bundle.min.mjs')).headers.get('content-type'), /^text\/javascript/);
});

test('arquivos de _next/static têm cache longo', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const js = await get(s, '/editor-avancado/_next/static/app-abc.js');
  assert.match(js.headers.get('cache-control'), /max-age=31536000/);
  assert.match(js.headers.get('cache-control'), /immutable/);
  const html = await get(s, '/editor-avancado/');
  assert.equal(html.headers.get('cache-control'), 'no-cache');
});

test('sem a pasta do editor, responde 404 com aviso', async (t) => {
  const s = await bootEditor(t, path.join(tmp(t), 'nao-existe'));
  const r = await get(s, '/editor-avancado/');
  assert.equal(r.status, 404);
  assert.match(r.text, /Editor avançado não instalado/);
  assert.equal((await get(s, '/app')).status, 200);
});

test('páginas do editor abrem sem login', async (t) => {
  const s = await bootEditor(t, fakeEditor(t));
  const r = await fetch(s.url + '/editor-avancado/'); // sem cookie
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<p>lista</p>');
});

test('GET /api/sounds/search exige login e busca com a chave do .env', async (t) => {
  const http = require('node:http');
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ count: 0, next: null, previous: null, results: [] }));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const s = await boot(t, tmp(t), {
    env: { FREESOUND_API_KEY: 'k', INVB_FREESOUND_API_BASE: `http://127.0.0.1:${srv.address().port}/apiv2` },
  });
  assert.equal((await fetch(s.url + '/api/sounds/search?q=x')).status, 401);
  const r = await s.api('/sounds/search?q=x');
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 0);
});
