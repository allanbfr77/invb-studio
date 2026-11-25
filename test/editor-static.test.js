// lib/editor-static.js: envio de arquivo do Editor avançado.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { sendEditorFile } = require('../lib/editor-static');

test('arquivo que some entre o stat e a leitura encerra a resposta sem derrubar o servidor', async () => {
  const res = new EventEmitter();
  res.headersSent = false;
  res.writeHead = () => {};
  res.write = () => true;
  res.end = () => {};
  let destroyed = false;
  res.destroy = () => {
    destroyed = true;
  };
  sendEditorFile(res, path.join(__dirname, 'nao-existe-mesmo.js'), { 'content-type': 'text/javascript' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(destroyed, true);
});
