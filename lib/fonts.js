// Fontes enviadas pela equipe (gaveta Legendas ou Texto > "Adicionar fonte").
// Ficam em data/fonts/, valem para a prévia e para o vídeo exportado, junto com as fontes do app (public/fonts/).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const CS = require('../public/caption-styles.js');
const { cfg } = require('./config');
const { readJson, writeJson, rid } = require('./store');

const APP_FONTS = path.join(__dirname, '..', 'public', 'fonts');
const DIR = (...p) => path.join(cfg.dataDir, 'fonts', ...p);
const INDEX = () => DIR('index.json');
const MAX = 50;

/** TrueType ou OpenType (o que o gerador de legenda lê). WOFF não serve: ele não abre. */
function sniffFont(b) {
  if (!b || b.length < 12) return null;
  const tag = b.toString('latin1', 0, 4);
  if (tag === '\x00\x01\x00\x00' || tag === 'true') return '.ttf';
  if (tag === 'OTTO') return '.otf';
  return null;
}

/** Lê a tabela "name" da fonte: o nome completo (ex.: "Montserrat Bold") e a família. */
function fontNames(b) {
  const n = b.readUInt16BE(4);
  let off = -1;
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    if (r + 16 > b.length) break;
    if (b.toString('latin1', r, r + 4) === 'name') off = b.readUInt32BE(r + 8);
  }
  if (off < 0 || off + 6 > b.length) return {};
  const count = b.readUInt16BE(off + 2),
    strs = off + b.readUInt16BE(off + 4);
  const found = {};
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    if (r + 12 > b.length) break;
    const pid = b.readUInt16BE(r),
      nid = b.readUInt16BE(r + 6),
      len = b.readUInt16BE(r + 8),
      at = strs + b.readUInt16BE(r + 10);
    if (![1, 4, 16].includes(nid) || at + len > b.length) continue;
    let s;
    if (pid === 3 || pid === 0) {
      // UTF-16 BE (Windows e Unicode)
      const u = Buffer.from(b.subarray(at, at + len));
      u.swap16();
      s = u.toString('utf16le');
    } else if (pid === 1) s = b.toString('latin1', at, at + len);
    else continue;
    s = s.replace(/[\x00-\x1f]/g, '').trim();
    // prefere o nome em inglês do Windows, que é o que os programas usam
    const pref = pid === 3 && b.readUInt16BE(r + 4) === 0x409 ? 2 : 1;
    if (s && (!found[nid] || found[nid].p < pref)) found[nid] = { s, p: pref };
  }
  return { full: found[4] && found[4].s, family: (found[16] || found[1] || {}).s };
}

const list = () => readJson(INDEX(), []);
/** Avisa o catálogo (o mesmo arquivo usado pela prévia) de quais fontes existem, para aceitar os nomes novos. */
const sync = async () => {
  const l = await list();
  CS.setCustomFonts(l);
  return l;
};

async function add(buf, fileName) {
  const ext = sniffFont(buf);
  if (!ext) throw Object.assign(new Error('Use um arquivo de fonte .ttf ou .otf (até 10 MB).'), { status: 415 });
  let names;
  try {
    names = fontNames(buf);
  } catch {
    names = {};
  }
  const name = String(names.full || names.family || path.parse(fileName || 'Fonte').name)
    .replace(/['"\\{}<>;,]/g, '')
    .trim()
    .slice(0, 60);
  if (!name) throw Object.assign(new Error('Não consegui ler o nome desta fonte.'), { status: 415 });
  const l = await list();
  if (CS.FONT_LIST.some((f) => f.name === name))
    throw Object.assign(new Error(`A fonte “${name}” já vem com o app.`), { status: 409 });
  if (l.some((f) => f.name === name))
    throw Object.assign(new Error(`A fonte “${name}” já foi adicionada.`), { status: 409 });
  if (l.length >= MAX) throw Object.assign(new Error(`Limite de ${MAX} fontes. Exclua alguma antes.`), { status: 400 });
  const id = rid();
  await fsp.mkdir(DIR(), { recursive: true });
  await fsp.writeFile(DIR(id + ext), buf);
  const it = { id, name, ext, file: String(fileName || '').slice(0, 80), size: buf.length, createdAt: Date.now() };
  l.push(it);
  await writeJson(INDEX(), l);
  await sync();
  return it;
}

async function remove(id) {
  const l = await list();
  const it = l.find((f) => f.id === id);
  if (!it) return false;
  await fsp.rm(DIR(it.id + it.ext), { force: true });
  await writeJson(
    INDEX(),
    l.filter((f) => f.id !== id),
  );
  await sync();
  return true;
}

/**
 * Pasta de fontes para o ffmpeg: o gerador de legenda só lê uma pasta. Sem fontes da equipe, usa a do app;
 * com elas, monta uma pasta temporária com as duas (cópias leves). Devolve o caminho e o que apagar no fim.
 */
async function renderFontsDir(dir, cid) {
  const l = await list();
  if (!l.length) return { dir: APP_FONTS, tmp: null };
  const tmp = path.join(dir, `${cid}.fonts`);
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.mkdir(tmp, { recursive: true });
  const put = async (src, dst) => {
    await fsp.link(src, dst).catch(() => fsp.copyFile(src, dst));
  };
  for (const f of await fsp.readdir(APP_FONTS))
    if (/\.(ttf|otf)$/i.test(f)) await put(path.join(APP_FONTS, f), path.join(tmp, f));
  for (const f of l) if (fs.existsSync(DIR(f.id + f.ext))) await put(DIR(f.id + f.ext), path.join(tmp, f.id + f.ext));
  return { dir: tmp, tmp };
}

module.exports = {
  sniffFont,
  fontNames,
  list,
  sync,
  add,
  remove,
  renderFontsDir,
  fontFile: (it) => DIR(it.id + it.ext),
};
