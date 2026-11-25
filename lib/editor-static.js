// Editor avançado: acha, dentro da pasta exportada do invb-editor (public/editor-avancado), o arquivo de um endereço.
// Fica separado do resto de public/ porque o editor tem regras próprias: página sem extensão vira o .html dela,
// e arquivo que não existe dá 404 (nunca a tela do INVB Studio).
const fs = require('fs');
const path = require('path');

/**
 * @param {string} urlPath caminho depois de /editor-avancado (ex.: "/", "/projects", "/_next/static/a.js")
 * @param {string} editorDir pasta da exportação
 * @returns {{ file: string, cache: 'long' | 'none' } | null} null quando o caminho sai da pasta
 */
function resolveEditorFile(urlPath, editorDir) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath || '/');
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  else if (!path.extname(rel)) rel += '.html';
  const root = path.resolve(editorDir);
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel.replace(/\\/g, '/')));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  if (path.relative(root, file).split(path.sep).includes('..')) return null;
  return { file, cache: rel.startsWith('/_next/static/') ? 'long' : 'none' };
}

const editorInstalled = (editorDir) => fs.existsSync(editorDir);

/**
 * Envia um arquivo já encontrado. Se ele sumir ou estiver travado entre o stat e a leitura (um build:studio rodando,
 * um antivírus), só aquela resposta é encerrada: sem o tratamento de erro o processo inteiro do app cairia.
 */
function sendEditorFile(res, file, headers) {
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.once('open', () => {
    res.writeHead(200, headers);
    stream.pipe(res);
  });
}

module.exports = { resolveEditorFile, editorInstalled, sendEditorFile };
