// Som do corte (gaveta Som do editor): efeitos sonoros e música de fundo.
// - Efeitos: gerados aqui mesmo com o ffmpeg (whoosh, batida, boom, pop, subida, clique). Não dependem de internet
//   nem de licença; cada um é feito uma vez e guardado em data/sfx/.
// - Música: arquivo enviado pela equipe ou faixa do Freesound (a prévia em mp3, com a licença e o autor guardados
//   para o crédito). Fica em data/music/.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { cfg, tools } = require('./config');
const { readJson, writeJson, withLock, run } = require('./store');

const fail = (status, message) => Object.assign(new Error(message), { status });
const FREESOUND = () => (process.env.INVB_FREESOUND_API_BASE || 'https://freesound.org/apiv2').replace(/\/$/, '');

/* ----- efeitos ----- */
const SFX = {
  whoosh: {
    label: 'Whoosh',
    src: 'anoisesrc=d=0.7:c=pink:a=0.9',
    af: 'bandpass=f=1200:w=900,afade=t=in:d=0.35:curve=qsin,afade=t=out:st=0.35:d=0.35:curve=qsin,volume=36dB,alimiter=limit=0.7',
  },
  batida: {
    label: 'Batida',
    src: "aevalsrc=exprs='sin(2*PI*(48+70*exp(-t*22))*t)*exp(-t*7)':d=0.7:s=44100",
    af: 'volume=0.9',
  },
  boom: {
    label: 'Boom',
    src: "aevalsrc=exprs='(0.9*sin(2*PI*(38+90*exp(-t*14))*t)+0.35*(random(0)*2-1)*exp(-t*10))*exp(-t*2.6)':d=1.6:s=44100",
    af: 'lowpass=f=1400,volume=0.9',
  },
  pop: { label: 'Pop', src: "aevalsrc=exprs='sin(2*PI*(1100-500*t*6)*t)*exp(-t*28)':d=0.22:s=44100", af: 'volume=0.7' },
  subida: {
    label: 'Subida',
    src: "aevalsrc=exprs='0.35*sin(2*PI*(180+900*t*t/1.6)*t)*(t/1.6)+0.25*(random(0)*2-1)*(t/1.6)*(t/1.6)':d=1.6:s=44100",
    af: 'highpass=f=120,afade=t=out:st=1.5:d=0.1',
  },
  clique: {
    label: 'Clique',
    src: "aevalsrc=exprs='(random(0)*2-1)*exp(-t*260)':d=0.06:s=44100",
    af: 'highpass=f=1500,volume=0.8',
  },
};
const SFX_DIR = (...p) => path.join(cfg.dataDir, 'sfx', ...p);
const making = new Map();
/** Caminho do efeito (gera na primeira vez). */
// Efeitos de verdade: cada tipo tem uma busca pronta no Freesound (só domínio público, CC0, curtos e bem avaliados).
// O melhor resultado vira o som da equipe para aquele tipo (dá para trocar na gaveta). Sem a chave do Freesound,
// os seis primeiros tipos usam o som gerado aqui (a versão simples de antes).
const SFX_CATALOG = {
  whoosh: { label: 'Whoosh', q: 'whoosh transition', max: 2.5 },
  boom: { label: 'Boom', q: 'cinematic boom impact', max: 6 },
  batida: { label: 'Batida', q: 'deep hit impact', max: 3 },
  subida: { label: 'Subida', q: 'cinematic riser', max: 8 },
  pop: { label: 'Pop', q: 'pop bubble', max: 1.5 },
  clique: { label: 'Clique', q: 'camera shutter click', max: 1.5 },
  sino: { label: 'Sino', q: 'church bell single', max: 8 },
  coracao: { label: 'Coração', q: 'heartbeat', max: 6 },
  reverso: { label: 'Reverso', q: 'reverse cymbal swell', max: 5 },
  trovao: { label: 'Trovão', q: 'thunder rumble', max: 8 },
  vento: { label: 'Vento', q: 'wind gust', max: 6 },
  coral: { label: 'Coral (ahh)', q: 'choir ahh', max: 8 },
};
const CHOICES = () => SFX_DIR('escolhas.json');
const okSfx = (t) => Object.prototype.hasOwnProperty.call(SFX_CATALOG, t) || /^fs\d{1,12}$/.test(String(t || ''));
async function synthFile(type) {
  const s = SFX[type];
  if (!s) return null;
  const f = SFX_DIR(type + '.synth.wav');
  if (fs.existsSync(f)) return f;
  if (!tools.ffmpeg) throw fail(501, 'ffmpeg indisponível.');
  if (!making.has(f))
    making.set(
      f,
      (async () => {
        await fsp.mkdir(SFX_DIR(), { recursive: true });
        const tmp = SFX_DIR(type + '.tmp.wav');
        const r = await run(tools.ffmpeg, [
          '-v',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          s.src,
          '-af',
          s.af + ',aformat=sample_rates=44100:channel_layouts=stereo',
          tmp,
        ]);
        if (r.code !== 0) throw fail(500, 'Não consegui gerar o efeito sonoro: ' + r.err.slice(0, 200));
        await fsp.rename(tmp, f);
      })().finally(() => making.delete(f)),
    );
  await making.get(f);
  return f;
}
const sfxItem = (r) => ({
  id: String(r.id),
  name: String(r.name || '').slice(0, 80),
  by: String(r.username || '').slice(0, 60),
  dur: Math.round((r.duration || 0) * 10) / 10,
  preview: r.previews && (r.previews['preview-hq-mp3'] || r.previews['preview-lq-mp3']),
});
/** Efeitos no Freesound: só CC0, curtos e com boa nota. */
async function searchSfx(q, max = 6) {
  const query = String(q || '')
    .trim()
    .slice(0, 100);
  if (!query) throw fail(400, 'Digite o que buscar.');
  const ps = new URLSearchParams({
    query,
    page_size: '12',
    fields: 'id,name,username,duration,previews,license',
    sort: 'score',
  });
  ps.append('filter', `duration:[0.1 TO ${max}]`);
  ps.append('filter', 'license:"Creative Commons 0"');
  ps.append('filter', 'avg_rating:[3.5 TO *]');
  const j = await fsApi('/search/text/?' + ps);
  return (j.results || []).map(sfxItem).filter((x) => x.preview);
}
/** Baixa (uma vez) o efeito do Freesound para data/sfx/fs<ID>.mp3. */
async function fetchSfx(id) {
  if (!/^\d{1,12}$/.test(String(id))) throw fail(400, 'Pedido inválido.');
  const f = SFX_DIR('fs' + id + '.mp3');
  if (fs.existsSync(f)) return f;
  const it = sfxItem(await fsApi(`/sounds/${id}/?fields=id,name,username,duration,previews,license`));
  if (!it.preview) throw fail(502, 'Este som do Freesound não tem arquivo para ouvir.');
  const r = await fetch(it.preview).catch(() => null);
  if (!r || !r.ok) throw fail(502, 'Não consegui baixar o som do Freesound.');
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > 15 * 1024 * 1024) throw fail(502, 'O som veio vazio ou grande demais.');
  await fsp.mkdir(SFX_DIR(), { recursive: true });
  await fsp.writeFile(f, buf);
  const idx = await readJson(SFX_DIR('nomes.json'), {});
  idx[id] = { name: it.name, by: it.by, dur: it.dur };
  await writeJson(SFX_DIR('nomes.json'), idx);
  return f;
}
const choices = () => readJson(CHOICES(), {});
async function choose(type, id) {
  if (!SFX_CATALOG[type]) throw fail(404, 'Tipo de efeito desconhecido.');
  await fetchSfx(id);
  await withLock('sfx-choices', async () => {
    const c = await choices();
    c[type] = String(id);
    await writeJson(CHOICES(), c);
  });
  return { type, id: String(id) };
}
/** Opções do Freesound para um tipo, com a escolhida marcada. */
async function sfxOptions(type) {
  const c = SFX_CATALOG[type];
  if (!c) throw fail(404, 'Tipo de efeito desconhecido.');
  return { items: await searchSfx(c.q, c.max), chosen: (await choices())[type] || null };
}
const picking = new Map();
/** Caminho do som de um tipo (ou de um id do Freesound "fs123"): o escolhido, o melhor do Freesound, ou o gerado. */
async function sfxFile(type) {
  if (!okSfx(type)) throw fail(404, 'Efeito sonoro desconhecido.');
  if (/^fs\d+$/.test(type)) return fetchSfx(type.slice(2));
  const ch = (await choices())[type];
  if (ch) {
    try {
      return await fetchSfx(ch);
    } catch {
      /* sem internet: cai no gerado */
    }
  }
  if (cfg.freesoundKey) {
    if (!picking.has(type))
      picking.set(
        type,
        (async () => {
          const opts = await searchSfx(SFX_CATALOG[type].q, SFX_CATALOG[type].max);
          if (!opts.length) return null;
          await choose(type, opts[0].id);
          return fetchSfx(opts[0].id);
        })()
          .catch(() => null)
          .finally(() => picking.delete(type)),
      );
    const f = await picking.get(type);
    if (f) return f;
  }
  const syn = await synthFile(type);
  if (syn) return syn;
  throw fail(503, 'Este efeito precisa da chave do Freesound (FREESOUND_API_KEY).');
}

/* ----- músicas ----- */
const MUS_DIR = (...p) => path.join(cfg.dataDir, 'music', ...p);
const musicIndex = () => readJson(MUS_DIR('index.json'), []);
const okMusicId = (id) => /^(fs\d{1,12}|up[a-z0-9]{6,16})$/.test(String(id || ''));
async function findMusic(id) {
  if (!okMusicId(id)) return null;
  return (await musicIndex()).find((x) => x.id === id) || null;
}
const musicFile = (it) => MUS_DIR(it.id + it.ext);
async function saveMusic(item, buf) {
  await fsp.mkdir(MUS_DIR(), { recursive: true });
  await fsp.writeFile(MUS_DIR(item.id + item.ext), buf);
  await withLock('music', async () => {
    const all = (await musicIndex()).filter((x) => x.id !== item.id);
    all.push(item);
    await writeJson(MUS_DIR('index.json'), all);
  });
  return item;
}
// formato pelo começo do arquivo: mp3 (ID3 ou quadro), m4a/mp4, wav, ogg
function sniffAudio(b) {
  if (b.length < 12) return null;
  if (b.slice(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return '.mp3';
  if (b.slice(4, 8).toString() === 'ftyp') return '.m4a';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WAVE') return '.wav';
  if (b.slice(0, 4).toString() === 'OggS') return '.ogg';
  return null;
}
async function uploadMusic(buf, name) {
  const ext = sniffAudio(buf);
  if (!ext) throw fail(415, 'Use um arquivo de música MP3, M4A, WAV ou OGG.');
  const id = 'up' + Math.random().toString(36).slice(2, 12);
  return saveMusic(
    { id, ext, name: String(name || 'Música').slice(0, 80), by: '', license: 'enviada pela equipe', at: Date.now() },
    buf,
  );
}

const LICENSES = 'license:("Creative Commons 0" OR "Attribution")'; // as duas que deixam usar em qualquer vídeo
async function fsApi(p) {
  if (!cfg.freesoundKey) throw fail(501, 'A busca de músicas precisa da chave FREESOUND_API_KEY (veja o README).');
  let r;
  try {
    r = await fetch(FREESOUND() + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(cfg.freesoundKey));
  } catch {
    throw fail(502, 'Sem conexão com o Freesound.');
  }
  if (r.status === 401 || r.status === 403) throw fail(502, 'O Freesound recusou a chave FREESOUND_API_KEY.');
  if (r.status === 404) throw fail(404, 'Música não encontrada no Freesound.');
  if (!r.ok) throw fail(502, `O Freesound devolveu um erro (${r.status}).`);
  return r.json();
}
const shortLicense = (l) =>
  /zero|publicdomain|\/0\//i.test(String(l || ''))
    ? 'CC0 (livre)'
    : /by\//i.test(String(l || ''))
      ? 'CC BY (citar o autor)'
      : 'outra';
const FIELDS = 'id,name,username,license,duration,previews,url,tags';
const musicItem = (r) => ({
  freesoundId: String(r.id),
  name: String(r.name || '').slice(0, 90),
  by: String(r.username || '').slice(0, 60),
  license: shortLicense(r.license),
  dur: Math.round(r.duration || 0),
  preview: r.previews && (r.previews['preview-hq-mp3'] || r.previews['preview-lq-mp3']),
  page: r.url,
});
/** Busca músicas de fundo (30 s a 10 min, licenças livres) no Freesound. */
async function searchMusic(q) {
  const query = String(q || '')
    .trim()
    .slice(0, 100);
  if (!query) throw fail(400, 'Digite o que buscar.');
  const ps = new URLSearchParams({ query, page_size: '15', fields: FIELDS, sort: 'score' });
  ps.append('filter', 'duration:[30 TO 600]');
  ps.append('filter', LICENSES);
  ps.append('filter', 'tag:music OR tag:soundtrack OR tag:ambient OR tag:piano OR tag:background OR tag:cinematic');
  const j = await fsApi('/search/text/?' + ps);
  return (j.results || []).map(musicItem).filter((x) => x.preview);
}
/** Baixa (uma vez) a música do Freesound e guarda com autor e licença. */
async function useFreesound(fid) {
  if (!/^\d{1,12}$/.test(String(fid))) throw fail(400, 'Pedido inválido.');
  const id = 'fs' + fid;
  const have = await findMusic(id);
  if (have) return have;
  const r = musicItem(await fsApi(`/sounds/${fid}/?fields=${FIELDS}`));
  if (!r.preview) throw fail(502, 'Esta música do Freesound não tem arquivo para ouvir.');
  let res;
  try {
    res = await fetch(r.preview);
  } catch {
    throw fail(502, 'Não consegui baixar a música do Freesound.');
  }
  if (!res.ok) throw fail(502, `Não consegui baixar a música do Freesound (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 40 * 1024 * 1024) throw fail(502, 'A música veio vazia ou grande demais.');
  return saveMusic(
    { id, ext: '.mp3', name: r.name, by: r.by, license: r.license, page: r.page, dur: r.dur, at: Date.now() },
    buf,
  );
}

module.exports = {
  SFX,
  SFX_CATALOG,
  okSfx,
  sfxFile,
  searchSfx,
  sfxOptions,
  choose,
  fetchSfx,
  musicIndex,
  findMusic,
  musicFile,
  uploadMusic,
  searchMusic,
  useFreesound,
  sniffAudio,
};
