// Imagens de apoio (B-roll) do Pexels: fotos e vídeos grátis que ilustram a frase (gaveta Apoio do editor do corte).
// A chave (PEXELS_API_KEY) fica só no servidor. O que a equipe usa é baixado uma vez para data/broll/ e serve para
// a prévia e para a exportação; a busca devolve só miniaturas, direto do Pexels.
// Termos do Pexels: uso grátis, sem precisar de crédito no vídeo; a gaveta mostra "Fotos e vídeos do Pexels".
const fsp = require('fs').promises;
const path = require('path');
const { cfg } = require('./config');
const { readJson, writeJson, withLock } = require('./store');

const DIR = (...p) => path.join(cfg.dataDir, 'broll', ...p);
const MAX = 150 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
const okId = (x) => /^[a-z0-9]{3,40}$/.test(String(x || ''));

async function api(p) {
  if (!cfg.pexelsKey) throw fail(501, 'A busca de imagens de apoio precisa da chave PEXELS_API_KEY (veja o README).');
  let r;
  try {
    r = await fetch(cfg.pexelsApi + p, { headers: { authorization: cfg.pexelsKey } });
  } catch {
    throw fail(502, 'Sem conexão com o Pexels.');
  }
  if (r.status === 401 || r.status === 403) throw fail(502, 'O Pexels recusou a chave PEXELS_API_KEY.');
  if (r.status === 429) throw fail(429, 'O limite de buscas do Pexels foi atingido. Espere um pouco e tente de novo.');
  if (r.status === 404) throw fail(404, 'Não encontrado no Pexels.');
  if (!r.ok) throw fail(502, `O Pexels devolveu um erro (${r.status}).`);
  return r.json();
}

// o arquivo de vídeo que vale baixar: mp4, o mais perto de 1080 no lado menor sem passar muito (leve e nítido)
function pickVideoFile(files) {
  const mp4 = (files || []).filter((f) => f && f.link && /mp4/.test(f.file_type || '') && f.width && f.height);
  if (!mp4.length) return null;
  const side = (f) => Math.min(f.width, f.height);
  const good = mp4.filter((f) => side(f) <= 1100).sort((a, b) => side(b) - side(a));
  return good[0] || mp4.sort((a, b) => side(a) - side(b))[0];
}

const photoItem = (p) => ({
  pexelsId: String(p.id),
  kind: 'photo',
  w: p.width,
  h: p.height,
  thumb: p.src && (p.src.medium || p.src.small),
  by: (p.photographer || '').slice(0, 80),
  page: p.url,
  alt: (p.alt || '').slice(0, 160),
});
const videoItem = (v) => ({
  pexelsId: String(v.id),
  kind: 'video',
  w: v.width,
  h: v.height,
  dur: v.duration,
  thumb: v.image || (v.video_pictures && v.video_pictures[0] && v.video_pictures[0].picture),
  by: ((v.user && v.user.name) || '').slice(0, 80),
  page: v.url,
});

/** Busca fotos ou vídeos. orientation: portrait | landscape | square (opcional). */
async function search(query, kind = 'photo', orientation = '') {
  const q = String(query || '')
    .trim()
    .slice(0, 100);
  if (!q) throw fail(400, 'Digite o que buscar.');
  const ps = new URLSearchParams({ query: q, per_page: '18', locale: 'pt-BR' });
  if (['portrait', 'landscape', 'square'].includes(orientation)) ps.set('orientation', orientation);
  if (kind === 'video') {
    const j = await api('/videos/search?' + ps);
    return (j.videos || []).map(videoItem).filter((x) => x.thumb);
  }
  const j = await api('/v1/search?' + ps);
  return (j.photos || []).map(photoItem).filter((x) => x.thumb);
}

const index = () => readJson(DIR('index.json'), []);
async function find(id) {
  if (!okId(id)) return null;
  return (await index()).find((x) => x.id === id) || null;
}
const fileOf = (it) => DIR(it.id + it.ext);

/** Baixa (uma vez só) a foto ou o vídeo do Pexels para data/broll e devolve o item guardado. */
async function use(kind, pexelsId) {
  if (!['photo', 'video'].includes(kind) || !/^\d{1,15}$/.test(String(pexelsId))) throw fail(400, 'Pedido inválido.');
  const id = (kind === 'video' ? 'pv' : 'pf') + pexelsId;
  const have = await find(id);
  if (have) return have;
  let src, it;
  if (kind === 'video') {
    const v = await api('/videos/videos/' + pexelsId);
    const f = pickVideoFile(v.video_files);
    if (!f) throw fail(502, 'Este vídeo do Pexels não tem arquivo mp4.');
    src = f.link;
    it = { ...videoItem(v), w: f.width, h: f.height, ext: '.mp4' };
  } else {
    const p = await api('/v1/photos/' + pexelsId);
    src = p.src && (p.src.large2x || p.src.large || p.src.original);
    it = { ...photoItem(p), ext: /\.png(\?|$)/i.test(src || '') ? '.png' : '.jpg' };
  }
  if (!src) throw fail(502, 'O Pexels não mandou o endereço do arquivo.');
  let r;
  try {
    r = await fetch(src);
  } catch {
    throw fail(502, 'Não consegui baixar o arquivo do Pexels.');
  }
  if (!r.ok) throw fail(502, `Não consegui baixar o arquivo do Pexels (${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX) throw fail(502, 'O arquivo do Pexels veio vazio ou grande demais.');
  await fsp.mkdir(DIR(), { recursive: true });
  await fsp.writeFile(DIR(id + it.ext), buf);
  const item = { ...it, id, size: buf.length, at: Date.now() };
  delete item.thumb; // a miniatura passa a ser o próprio arquivo
  await withLock('broll', async () => {
    const all = await index();
    if (!all.some((x) => x.id === id)) all.push(item);
    await writeJson(DIR('index.json'), all);
  });
  return item;
}

module.exports = { search, use, find, fileOf, index, pickVideoFile };
