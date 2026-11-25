// Editor avançado: busca de efeitos sonoros no Freesound (aba Sons do editor). Porta da rota que o invb-editor
// tinha no servidor do Next (apps/web/src/app/api/sounds/search/route.ts): mesmos parâmetros e mesma resposta.
const FREESOUND = 'https://freesound.org/apiv2';
const FIELDS =
  'id,name,description,url,previews,download,duration,filesize,type,channels,bitrate,bitdepth,samplerate,username,tags,license,created,num_downloads,avg_rating,num_ratings';
const LICENSE_FILTER =
  'license:("Attribution" OR "Creative Commons 0" OR "Attribution Noncommercial" OR "Attribution Commercial")';
const TAG_FILTER =
  'tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion';

/** Lê e valida os parâmetros; null quando algum está fora do permitido. */
function readParams(query) {
  const raw = (k) => {
    const v = query.get(k);
    return v === null || v === '' ? undefined : v;
  };
  const int = (k, def, min, max) => {
    const v = raw(k);
    if (v === undefined) return def;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
  };
  const p = {
    q: raw('q'),
    type: raw('type'),
    page: int('page', 1, 1, 1000),
    pageSize: int('page_size', 20, 1, 150),
    sort: raw('sort') || 'downloads',
    minRating: raw('min_rating') === undefined ? 3 : Number(raw('min_rating')),
    commercialOnly: !['false', '0'].includes(raw('commercial_only')),
  };
  const ok =
    (p.q === undefined || p.q.length <= 500) &&
    (p.type === undefined || ['songs', 'effects'].includes(p.type)) &&
    !Number.isNaN(p.page) &&
    !Number.isNaN(p.pageSize) &&
    ['downloads', 'rating', 'created', 'score'].includes(p.sort) &&
    Number.isFinite(p.minRating) &&
    p.minRating >= 0 &&
    p.minRating <= 5;
  return ok ? p : null;
}

const validResponse = (d) => d && typeof d.count === 'number' && Array.isArray(d.results);

function transform(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    url: r.url,
    previewUrl: r.previews?.['preview-hq-mp3'] || r.previews?.['preview-lq-mp3'],
    downloadUrl: r.download,
    duration: r.duration,
    filesize: r.filesize,
    type: r.type,
    channels: r.channels,
    bitrate: r.bitrate,
    bitdepth: r.bitdepth,
    samplerate: r.samplerate,
    username: r.username,
    tags: r.tags,
    license: r.license,
    created: r.created,
    downloads: r.num_downloads || 0,
    rating: r.avg_rating || 0,
    ratingCount: r.num_ratings || 0,
  };
}

/**
 * @param {URLSearchParams} query parâmetros do pedido (q, type, page, page_size, sort, min_rating, commercial_only)
 * @param {{ apiKey: string, base?: string }} opts
 * @returns {Promise<{ status: number, body: object }>}
 */
async function searchSounds(query, { apiKey, base = FREESOUND }) {
  if (!apiKey) return { status: 503, body: { error: 'Busca de sons não configurada' } };
  const p = readParams(query);
  if (!p) return { status: 400, body: { error: 'Parâmetros inválidos' } };
  if (p.type === 'songs')
    return {
      status: 501,
      body: {
        error: 'Músicas ainda não estão disponíveis',
        message: 'A busca de músicas chega em breve. Por enquanto, busque efeitos sonoros.',
      },
    };
  const params = new URLSearchParams({
    query: p.q || '',
    token: apiKey,
    page: String(p.page),
    page_size: String(p.pageSize),
    sort: !p.q ? `${p.sort}_desc` : p.sort === 'score' ? 'score' : `${p.sort}_desc`,
    fields: FIELDS,
  });
  params.append('filter', 'duration:[* TO 30.0]');
  params.append('filter', `avg_rating:[${p.minRating} TO *]`);
  if (p.commercialOnly) params.append('filter', LICENSE_FILTER);
  params.append('filter', TAG_FILTER);

  let res, data;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/search/text/?${params}`);
    if (!res.ok) return { status: res.status, body: { error: 'Falha ao buscar sons' } };
    data = await res.json();
  } catch {
    return { status: 502, body: { error: 'Falha ao buscar sons' } };
  }
  if (!validResponse(data)) return { status: 502, body: { error: 'Resposta inválida do Freesound' } };
  return {
    status: 200,
    body: {
      count: data.count,
      next: data.next ?? null,
      previous: data.previous ?? null,
      results: data.results.map(transform),
      query: p.q || '',
      type: p.type || 'effects',
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      minRating: p.minRating,
    },
  };
}

module.exports = { searchSounds };
