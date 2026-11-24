const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('a versão do app traz o código e a data da última atualização quando a pasta é um repositório git', () => {
  const { VERSION, ROOT } = require('../lib/config');
  assert.equal(ROOT, path.join(__dirname, '..'));
  assert.match(VERSION.name, /^v\d+\.\d+\.\d+/);
  if (!fs.existsSync(path.join(ROOT, '.git'))) return; // pasta baixada em ZIP: fica só a versão do package.json
  assert.match(VERSION.commit, /^[0-9a-f]{6,12}$/);
  assert.match(VERSION.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(VERSION.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // com a hora: duas atualizações no mesmo dia se distinguem
});
