// Editor avançado com a cara do INVB Studio: nome e ícone da aba, tema e logo entram nas páginas do editor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { brandEditorHtml } = require('../lib/editor-static');

test('a página do editor ganha o nome, o ícone e o tema do Studio, antes do código do editor', () => {
  const html =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="icon" href="/editor-avancado/favicon.ico"/>' +
    '<title>OpenCut</title><script src="/editor-avancado/_next/static/chunks/a.js" async=""></script></head><body></body></html>';
  const out = brandEditorHtml(html);
  assert.match(out, /<title>Editor avançado · INVB Studio<\/title>/);
  assert.ok(!out.includes('/editor-avancado/favicon.ico'), 'sai o ícone do OpenCut');
  assert.match(out, /rel="icon" href="\/img\/nv-v.png\?v=2"/);
  assert.ok(out.indexOf('/app/editor-avancado-tema.js') < out.indexOf('_next/static'), 'o tema vem antes do editor');
  assert.match(out, /\/css\/editor-avancado.css/);
});

test('os arquivos do tema existem', () => {
  for (const f of ['public/app/editor-avancado-tema.js', 'public/css/editor-avancado.css', 'public/img/nv-v.png'])
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
});

test('ícones e manifesto do editor: o "V" e o nome do Studio no lugar dos do OpenCut', () => {
  const { brandIconFile, brandManifest } = require('../lib/editor-static');
  assert.match(brandIconFile('/favicon.ico'), /public[\\/]favicon\.ico$/);
  assert.match(brandIconFile('/icons/favicon-32x32.png?x=1'), /apple-touch-icon\.png$/);
  assert.match(brandIconFile('/icons/apple-icon-180x180.png'), /apple-touch-icon\.png$/);
  assert.equal(brandIconFile('/icons/../server.js'), null);
  assert.equal(brandIconFile('/logos/opencut/svg/logo.svg'), null); // essa a página troca pelo CSS
  const m = JSON.parse(brandManifest('{"name":"OpenCut","display":"standalone","icons":[{"src":"/icons/a.png"}]}'));
  assert.equal(m.name, 'Editor avançado · INVB Studio');
  assert.equal(m.display, 'standalone'); // o resto fica
  assert.deepEqual(
    m.icons.map((i) => i.src),
    ['/apple-touch-icon.png'],
  );
  assert.equal(brandManifest('não é json'), 'não é json');
});

test('o Studio também entrega o "V" em /favicon.ico (o Safari pede esse endereço direto)', () => {
  for (const f of ['public/favicon.ico', 'public/apple-touch-icon.png'])
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
});
