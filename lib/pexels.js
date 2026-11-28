// Imagens de apoio (B-roll) do Pexels ou do Pixabay: fotos e vídeos grátis que ilustram a frase (gaveta Apoio do editor do corte).
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
    require('./usage').add({ api: 'pexels', model: 'pexels', feature: 'apoio', count: 1 });
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

/* ----- Pixabay: mesma ideia, para quando não há chave do Pexels (o Pexels pausou as chaves novas em 2026) ----- */
// Qual banco atende: o Pexels se houver a chave dele; senão o Pixabay.
const provider = () => (cfg.pexelsKey ? 'pexels' : cfg.pixabayKey ? 'pixabay' : null);
const SOURCE = { pexels: 'Pexels', pixabay: 'Pixabay' };
// O Pixabay pede que cada busca fique guardada por 24 h (não repetir a mesma pergunta): guardamos na memória.
const pxCache = new Map();
async function pxb(p, params) {
  const ck = p + '?' + new URLSearchParams(params);
  const hit = pxCache.get(ck);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.j;
  const j = await pxbFetch(p, params);
  pxCache.set(ck, { at: Date.now(), j });
  if (pxCache.size > 300) pxCache.delete(pxCache.keys().next().value);
  return j;
}
async function pxbFetch(p, params) {
  const ps = new URLSearchParams({ key: cfg.pixabayKey, safesearch: 'true', ...params });
  let r;
  try {
    r = await fetch(cfg.pixabayApi + p + '?' + ps);
    require('./usage').add({ api: 'pixabay', model: 'pixabay', feature: 'apoio', count: 1 });
  } catch {
    throw fail(502, 'Sem conexão com o Pixabay.');
  }
  if (r.status === 400 && /key/i.test(await r.clone().text()))
    throw fail(502, 'O Pixabay recusou a chave PIXABAY_API_KEY.');
  if (r.status === 429)
    throw fail(429, 'O limite de buscas do Pixabay foi atingido. Espere um minuto e tente de novo.');
  if (!r.ok) throw fail(502, `O Pixabay devolveu um erro (${r.status}).`);
  return r.json();
}
// o vídeo do Pixabay que vale baixar: o maior que não passe muito de 1080 no lado menor
function pickPixabayVideo(videos) {
  const list = Object.values(videos || {}).filter((f) => f && f.url && f.width && f.height);
  const side = (f) => Math.min(f.width, f.height);
  return (
    list.filter((f) => side(f) <= 1100).sort((a, b) => side(b) - side(a))[0] ||
    list.sort((a, b) => side(a) - side(b))[0] ||
    null
  );
}
const pxPhoto = (h) => ({
  pexelsId: String(h.id),
  kind: 'photo',
  w: h.imageWidth,
  h: h.imageHeight,
  thumb: h.webformatURL || h.previewURL,
  by: String(h.user || '').slice(0, 80),
  page: h.pageURL,
  alt: String(h.tags || '').slice(0, 160),
});
const pxVideo = (h) => {
  const f = pickPixabayVideo(h.videos) || {};
  const any = Object.values(h.videos || {}).find((x) => x && x.thumbnail);
  return {
    pexelsId: String(h.id),
    kind: 'video',
    w: f.width,
    h: f.height,
    dur: h.duration,
    thumb: (any && any.thumbnail) || '',
    by: String(h.user || '').slice(0, 80),
    page: h.pageURL,
    alt: String(h.tags || '').slice(0, 160),
  };
};

/** Busca fotos ou vídeos. orientation: portrait | landscape | square (opcional). */
async function search(query, kind = 'photo', orientation = '') {
  const q = String(query || '')
    .trim()
    .slice(0, 100);
  if (!q) throw fail(400, 'Digite o que buscar.');
  if (provider() === 'pixabay') {
    // a equipe busca em português e o Claude sugere em inglês: tenta em português e, sem resultado, em inglês
    const o = { portrait: 'vertical', landscape: 'horizontal' }[orientation];
    const go = async (lang) =>
      kind === 'video'
        ? ((await pxb('/api/videos/', { q, per_page: '18', lang })).hits || []).map(pxVideo).filter((x) => x.thumb)
        : (
            (await pxb('/api/', { q, per_page: '18', lang, image_type: 'photo', ...(o ? { orientation: o } : {}) }))
              .hits || []
          )
            .map(pxPhoto)
            .filter((x) => x.thumb);
    const pt = await go('pt');
    return pt.length ? pt : go('en');
  }
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
  const pv = provider();
  if (!pv) throw fail(501, 'A busca de imagens de apoio precisa de uma chave (veja o README).');
  // pf/pv = Pexels; xf/xv = Pixabay
  const id = (pv === 'pixabay' ? 'x' : 'p') + (kind === 'video' ? 'v' : 'f') + pexelsId;
  const have = await find(id);
  if (have) return have;
  let src, it;
  if (pv === 'pixabay') {
    const h = ((await pxb(kind === 'video' ? '/api/videos/' : '/api/', { id: String(pexelsId) })).hits || [])[0];
    if (!h) throw fail(404, 'Não encontrado no Pixabay.');
    if (kind === 'video') {
      const f = pickPixabayVideo(h.videos);
      if (!f) throw fail(502, 'Este vídeo do Pixabay não tem arquivo.');
      src = f.url;
      it = { ...pxVideo(h), ext: '.mp4' };
    } else {
      src = h.largeImageURL || h.webformatURL;
      it = { ...pxPhoto(h), ext: /\.png(\?|$)/i.test(src || '') ? '.png' : '.jpg' };
    }
  } else if (kind === 'video') {
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
  if (!src) throw fail(502, `O ${SOURCE[pv]} não mandou o endereço do arquivo.`);
  let r;
  try {
    r = await fetch(src);
  } catch {
    throw fail(502, `Não consegui baixar o arquivo do ${SOURCE[pv]}.`);
  }
  if (!r.ok) throw fail(502, `Não consegui baixar o arquivo do ${SOURCE[pv]} (${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX) throw fail(502, `O arquivo do ${SOURCE[pv]} veio vazio ou grande demais.`);
  await fsp.mkdir(DIR(), { recursive: true });
  await fsp.writeFile(DIR(id + it.ext), buf);
  const item = { ...it, id, source: SOURCE[pv], size: buf.length, at: Date.now() };
  delete item.thumb; // a miniatura passa a ser o próprio arquivo
  await withLock('broll', async () => {
    const all = await index();
    if (!all.some((x) => x.id === id)) all.push(item);
    await writeJson(DIR('index.json'), all);
  });
  return item;
}

module.exports = { search, use, find, fileOf, index, pickVideoFile, provider, SOURCE };
