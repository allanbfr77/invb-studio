const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureFolder, uploadFile } = require('../lib/drive');

// Google Drive de mentira: registra as chamadas e responde na ordem dada.
const fakeDrive = (responses) => {
  const calls = [];
  const impl = async (url, init = {}) => {
    let body = init.body;
    if (body && typeof body !== 'string' && body[Symbol.asyncIterator]) {
      const parts = [];
      for await (const c of body) parts.push(Buffer.from(c));
      body = Buffer.concat(parts);
    }
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body });
    const r = responses.shift();
    if (!r) throw new Error('chamada inesperada: ' + url);
    return new Response(r.body === undefined ? null : typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status || 200,
      headers: r.headers || {},
    });
  };
  return { impl, calls };
};

test('ensureFolder reaproveita a pasta que já existe', async () => {
  const d = fakeDrive([{ body: { files: [{ id: 'pasta-1' }] } }]);
  assert.equal(await ensureFolder('tok', 'raiz', 'Culto 15/11', d.impl), 'pasta-1');
  assert.equal(d.calls.length, 1);
  const u = new URL(d.calls[0].url);
  assert.equal(u.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(u.searchParams.get('includeItemsFromAllDrives'), 'true');
  assert.match(u.searchParams.get('q'), /'raiz' in parents/);
  assert.match(u.searchParams.get('q'), /trashed = false/);
  assert.equal(d.calls[0].headers.authorization, 'Bearer tok');
});

test('ensureFolder cria a pasta quando não existe', async () => {
  const d = fakeDrive([{ body: { files: [] } }, { body: { id: 'nova' } }]);
  assert.equal(await ensureFolder('tok', 'raiz', 'Culto novo', d.impl), 'nova');
  assert.equal(d.calls[1].method, 'POST');
  assert.equal(new URL(d.calls[1].url).searchParams.get('supportsAllDrives'), 'true');
  assert.deepEqual(JSON.parse(d.calls[1].body), {
    name: 'Culto novo',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['raiz'],
  });
});

test('ensureFolder escapa aspas simples no nome', async () => {
  const d = fakeDrive([{ body: { files: [{ id: 'x' }] } }]);
  await ensureFolder('tok', 'raiz', "Culto d'água", d.impl);
  assert.match(new URL(d.calls[0].url).searchParams.get('q'), /name = 'Culto d\\'água'/);
});

test('uploadFile envia os bytes do arquivo e devolve id e link', async () => {
  const f = path.join(os.tmpdir(), `invb-up-${process.pid}.mp4`);
  fs.writeFileSync(f, Buffer.from('conteudo do corte'));
  try {
    const d = fakeDrive([
      { headers: { location: 'https://upload.example/sessao-1' } },
      { body: { id: 'arq-1', webViewLink: 'https://drive.google.com/file/d/arq-1/view' } },
    ]);
    const r = await uploadFile(
      'tok',
      { folderId: 'pasta-1', name: 'O amor de Deus.mp4', filePath: f, mime: 'video/mp4' },
      d.impl,
    );
    assert.deepEqual(r, { id: 'arq-1', webViewLink: 'https://drive.google.com/file/d/arq-1/view' });
    const start = new URL(d.calls[0].url);
    assert.equal(start.searchParams.get('uploadType'), 'resumable');
    assert.equal(start.searchParams.get('supportsAllDrives'), 'true');
    assert.deepEqual(JSON.parse(d.calls[0].body), { name: 'O amor de Deus.mp4', parents: ['pasta-1'] });
    assert.equal(d.calls[1].url, 'https://upload.example/sessao-1');
    assert.equal(d.calls[1].method, 'PUT');
    assert.equal(d.calls[1].body.toString(), 'conteudo do corte');
    assert.equal(String(d.calls[1].headers['content-length']), '17');
  } finally {
    fs.rmSync(f, { force: true });
  }
});

test('403 vira erro que fala de permissão na pasta', async () => {
  const d = fakeDrive([{ status: 403, body: { error: { message: 'insufficientFilePermissions' } } }]);
  await assert.rejects(
    () => ensureFolder('tok', 'raiz', 'x', d.impl),
    (e) => e.status === 403 && /permissão/.test(e.message) && /pasta/.test(e.message),
  );
});

test('401 pede para entrar com o Google de novo', async () => {
  const d = fakeDrive([{ status: 401, body: {} }]);
  await assert.rejects(
    () => ensureFolder('tok', 'raiz', 'x', d.impl),
    (e) => e.status === 401 && e.needsLogin === true,
  );
});

test('404 na pasta diz que a pasta não foi encontrada', async () => {
  const d = fakeDrive([{ status: 404, body: {} }]);
  await assert.rejects(
    () => ensureFolder('tok', 'raiz', 'x', d.impl),
    (e) => e.status === 404 && /não encontr/i.test(e.message) && e.wrongAccount === true,
  );
});

test('API do Drive desativada no projeto: a mensagem manda ativar a API', async () => {
  const d = fakeDrive([
    {
      status: 403,
      body: {
        error: {
          message: 'Google Drive API has not been used in project 1 before or it is disabled.',
          errors: [{ reason: 'accessNotConfigured' }],
        },
      },
    },
  ]);
  await assert.rejects(
    () => ensureFolder('tok', 'raiz', 'x', d.impl),
    (e) => e.status === 403 && /Google Drive API/.test(e.message) && /Ative/.test(e.message),
  );
});

test('login sem a permissão do Drive marcada: pede o login de novo', async () => {
  const d = fakeDrive([
    {
      status: 403,
      body: {
        error: {
          message: 'Request had insufficient authentication scopes.',
          errors: [{ reason: 'insufficientPermissions' }],
        },
      },
    },
  ]);
  await assert.rejects(
    () => ensureFolder('tok', 'raiz', 'x', d.impl),
    (e) => e.needsLogin === true && /marque a caixa/.test(e.message),
  );
});
