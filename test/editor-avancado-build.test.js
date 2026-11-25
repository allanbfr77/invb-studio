// Confere a exportação do invb-editor que vai no repositório (public/editor-avancado):
// todo arquivo de public/ buscado pelo editor precisa do prefixo /editor-avancado, senão cai na tela do studio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'public', 'editor-avancado', '_next', 'static');

test('nenhum url(/...) sem o prefixo do editor nos arquivos gerados', { skip: !fs.existsSync(DIR) }, () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|css)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/url\((["'`]?)\/(?!\/)([^)"'`]*)/g))
          if (!m[2].startsWith('editor-avancado/')) bad.push(`${e.name}: url(/${m[2].slice(0, 40)}`);
      }
    }
  };
  walk(DIR);
  assert.deepEqual(bad, []);
});
