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
  assert.ok(!out.includes('favicon.ico'), 'sai o ícone do OpenCut');
  assert.match(out, /rel="icon" href="\/img\/nv-v.png"/);
  assert.ok(out.indexOf('/app/editor-avancado-tema.js') < out.indexOf('_next/static'), 'o tema vem antes do editor');
  assert.match(out, /\/css\/editor-avancado.css/);
});

test('os arquivos do tema existem', () => {
  for (const f of ['public/app/editor-avancado-tema.js', 'public/css/editor-avancado.css', 'public/img/nv-v.png'])
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
});
