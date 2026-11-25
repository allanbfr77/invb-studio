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

/**
 * Página do editor com a cara do INVB Studio: o nome e o ícone da aba do Studio, e o tema (cores, fonte, logo) e o
 * modo claro/noturno do Studio. Fica aqui, e não nos arquivos do editor, para continuar valendo depois de um novo build:studio.
 */
const BRAND_HEAD =
  '<link rel="icon" href="/favicon.ico?v=2" sizes="any">' +
  '<link rel="icon" href="/img/nv-v.png?v=2" type="image/png">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">' +
  '<script src="/app/editor-avancado-tema.js"></script>' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet">' +
  '<link rel="stylesheet" href="/css/editor-avancado.css">';
function brandEditorHtml(html) {
  return String(html)
    .replace(/<link\b[^>]*\brel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*\/?>/gi, '')
    .replace(/<title>[^<]*<\/title>/i, '<title>Editor avançado · INVB Studio</title>')
    .replace(/<head([^>]*)>/i, (m) => m + BRAND_HEAD);
}

/**
 * Ícones do editor: o Safari pede direto os arquivos (favicon.ico, icons/…) e não acompanha a troca feita pelo
 * script depois que a página abre. Então os endereços dos ícones do OpenCut entregam o "V" da igreja.
 * @returns {string|null} o arquivo do Studio a entregar no lugar, ou null quando não é um ícone
 */
const PUB = path.join(__dirname, '..', 'public');
function brandIconFile(rel) {
  const r = String(rel || '').split('?')[0];
  if (r === '/favicon.ico') return path.join(PUB, 'favicon.ico');
  if (/^\/(icons\/(favicon|apple-icon|android-icon|ms-icon)-[\w-]+\.png|apple-icon\.png|icon\.png)$/.test(r))
    return path.join(PUB, 'apple-touch-icon.png');
  return null;
}
/** manifest.json do editor (nome e ícones do app quando instalado ou fixado) com o nome e o "V" do Studio. */
function brandManifest(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return text;
  }
  m.name = 'Editor avançado · INVB Studio';
  m.short_name = 'INVB Editor';
  m.description = 'Editor de vídeo do INVB Studio · Nova Vida Botafogo';
  m.icons = [{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }];
  return JSON.stringify(m);
}

module.exports = { resolveEditorFile, editorInstalled, sendEditorFile, brandEditorHtml, brandIconFile, brandManifest };
