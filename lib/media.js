// O vídeo original: baixar do YouTube ou do Drive, cópia que o navegador toca, capa, e apagar quando fica sem uso (só o link fica salvo).

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { staleOriginals, canRefetch } = require('./cleanup');
const { ytProgress, ytId } = require('./ytprogress');
const { needsPreview } = require('./preview');
const { Readable } = require('stream');
const { E, cfg, U, tooBig, tools } = require('./config');
const { readJson, withLock, log, run, getMeta, listMeta, update, mediaDuration } = require('./store');
const { renders } = require('./render');

/* ---------- Original sob demanda (só o link fica salvo) ---------- */
const lastTouch = new Map();
const aiBusy = new Set();
const peaksBusy = new Map(); // forma de onda sendo calculada, por pregação
/** Texto de publicação de um corte, já limitado: é o que fica salvo em clips.json. */
const cleanPost = (p) => ({
  title: String(p.title || '')
    .trim()
    .slice(0, 120),
  description: String(p.description || '')
    .trim()
    .slice(0, 2000),
  hashtags: (Array.isArray(p.hashtags) ? p.hashtags : String(p.hashtags || '').split(/\s+/))
    .map((h) => String(h).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((h) => (h.startsWith('#') ? h : '#' + h).slice(0, 60)),
  at: Date.now(),
});
const driveBusy = new Set(),
  refetchBusy = new Set(); // envios e novos downloads em andamento, por id do envio
function touchUsed(id, force) {
  const now = Date.now();
  if (!force && now - (lastTouch.get(id) || 0) < 60000) return;
  lastTouch.set(id, now);
  update(id, { lastUsedAt: now }).catch(() => {});
}
// Primeiro H.264 + AAC: é o que todo navegador toca (o Safari não toca VP9/AV1 nem Opus dentro de mp4).
// Depois um mp4 já pronto e, por último, o melhor que houver, para vídeos que não têm H.264.
// Altura máxima do vídeo baixado. 1080 dá mais nitidez (ajuda no corte vertical); 720 baixa bem mais rápido.
const YT_H = [1080, 720, 480, 360].includes(+process.env.YT_MAX_HEIGHT) ? +process.env.YT_MAX_HEIGHT : 1080;
const YT_FORMAT = `bv*[vcodec^=avc1][height<=${YT_H}]+ba[ext=m4a]/b[ext=mp4][height<=${YT_H}]/bv*[height<=${YT_H}]+ba/b`;
// Às vezes o YouTube lista o H.264 mas entrega um arquivo vazio. Aí tentamos de novo com o melhor formato que houver
// (em geral AV1 + Opus, que baixa bem) e, por fim, com o arquivo único mais simples. O que o navegador não tocar
// ganha uma cópia compatível (ver makePreview).
// O YouTube limita a velocidade de cada conexão (na prática, perto de 1 MB/s). No modo rápido o yt-dlp divide o arquivo
// em pedaços de 10 MB (formats=dashy) e baixa 8 ao mesmo tempo (-N 8), o que aproveita a internet de verdade.
// Se o modo rápido falhar, as últimas tentativas usam uma conexão só, que é mais lento mas sempre funcionou.
const YT_FAST = ['--extractor-args', 'youtube:formats=dashy', '-N', '8'];
const YT_ANY = `bv*[height<=${YT_H}]+ba/b`;
const YT_ATTEMPTS = [
  { f: YT_FORMAT, fast: true },
  { f: YT_ANY, fast: true },
  { f: YT_ANY, fast: false },
  { f: 'b', fast: false },
];
const MEDIA_FILE = /^original\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|aac|opus|flac|ogg|oga)$/i;
/** Remove o original e qualquer sobra de download (pedaços .part, faixas separadas). */
async function clearOriginals(id) {
  for (const f of await fsp.readdir(U(id)).catch(() => []))
    if (f.startsWith('original.')) await fsp.rm(U(id, f), { force: true });
}
async function dropOriginal(m) {
  await clearOriginals(m.id);
  for (const f of ['preview.mp4', 'preview.tmp.mp4', 'sincronizado.mp4']) await fsp.rm(U(m.id, f), { force: true });
  await update(m.id, { originalGone: true, preview: null });
  log('original liberado', m.id, m.name);
}
/** O vídeo de um envio concluído não está no disco (apagado pela limpeza, ou sumiu por outro motivo). */
const isGone = (m) =>
  m.status === 'done' && !m.refetching && !!(m.originalGone || !m.file || !fs.existsSync(U(m.id, m.file)));
/** Este computador consegue baixar de novo? Link do YouTube precisa de yt-dlp e ffmpeg instalados. */
const refetchReady = (m) => canRefetch(m) && (m.source !== 'youtube' || !!(tools.ytdlp && tools.ffmpeg));
/** Há corte deste envio sendo exportado ou esperando na fila. */
const exporting = async (id) =>
  [...renders.keys()].some((k) => k.startsWith(id + ':')) ||
  (await readJson(U(id, 'clips.json'), [])).some((c) => c.render && c.render.status === 'rendering');
async function sweepOriginals() {
  if (cfg.keepOriginalMs < 0) return;
  const metas = await listMeta();
  for (const id of staleOriginals(metas, Date.now(), cfg.keepOriginalMs)) {
    const m = metas.find((x) => x.id === id);
    if (!refetchReady(m) || (await exporting(id))) continue; // não apaga o que este computador não conseguiria baixar de novo
    try {
      await dropOriginal(m);
    } catch (e) {
      log('falha ao liberar original', id, e.message);
    }
  }
}
async function fetchYoutube(id, url, onProgress, opts = {}) {
  const [cmd, ...pre] = tools.ytdlp;
  await clearOriginals(id); // sobras de uma tentativa anterior não podem ser confundidas com o vídeo
  // O yt-dlp trata --ffmpeg-location como caminho de arquivo: receber só "ffmpeg" faz ele rodar SEM ffmpeg e não juntar
  // vídeo e áudio. Com o ffmpeg no PATH ele se acha sozinho, então a opção só vai quando temos um caminho de verdade.
  const ffLoc = path.isAbsolute(tools.ffmpeg || '') ? ['--ffmpeg-location', tools.ffmpeg] : [];
  // --newline faz o yt-dlp escrever o andamento linha a linha, que é o que mostramos na tela (no máximo uma vez por segundo).
  for (let k = 0; k < YT_ATTEMPTS.length; k++) {
    if (opts.slowOnly && YT_ATTEMPTS[k].fast) continue; // o modo rápido não funciona em live recém-encerrada
    const st = {};
    let last = 0;
    const dl = await run(
      cmd,
      [
        ...pre,
        '--no-playlist',
        '--newline',
        ...(YT_ATTEMPTS[k].fast ? YT_FAST : []),
        '-f',
        YT_ATTEMPTS[k].f,
        '--merge-output-format',
        'mp4',
        ...ffLoc,
        '-o',
        U(id, 'original.%(ext)s'),
        url,
      ],
      {
        onStdout: (d) => {
          const p = ytProgress(d, st);
          if (p && onProgress && (Date.now() - last > 1000 || p.pct >= 99)) {
            last = Date.now();
            onProgress(p);
          }
        },
      },
    );
    const all = (await fsp.readdir(U(id))).filter((x) => MEDIA_FILE.test(x));
    const f = dl.code === 0 ? (all.includes('original.mp4') ? 'original.mp4' : all[0]) : null;
    if (f && (await fsp.stat(U(id, f))).size > 0) {
      if (k) log('yt-dlp: baixou na tentativa', k + 1, id);
      return f;
    }
    log(
      'yt-dlp falhou',
      id,
      `tentativa ${k + 1} de ${YT_ATTEMPTS.length}`,
      (dl.err || '').split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 600),
    );
    await clearOriginals(id);
  }
  return null;
}
/**
 * Trecho da pregação (meta.range): corta o vídeo baixado para ficar só com ele, antes de transcrever e de preparar
 * a cópia para o navegador. Cópia direta, sem recodificar: leva segundos, e o começo pode recuar até o quadro-chave
 * anterior (poucos segundos a mais). Não faz nada se não houver trecho ou se ele já foi aplicado a este arquivo.
 */
const clockLabel = (t) => {
  t = Math.floor(t);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    x = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};
async function applyRange(id) {
  const m = await getMeta(id);
  if (!m || !m.range || !m.file) return;
  const { start, end } = m.range,
    orig = U(id, m.file),
    ext = path.extname(m.file),
    tmp = U(id, 'trecho.tmp' + ext);
  // A marca é gravada antes de trocar o arquivo: se o app fechar no meio, a troca termina aqui e o vídeo nunca é cortado duas vezes.
  if (m.rangeApplied) {
    if (fs.existsSync(tmp)) await fsp.rename(tmp, orig);
    return;
  }
  if (!tools.ffmpeg) throw new Error('ffmpeg não encontrado: não dá para separar o trecho da pregação.');
  const total = await mediaDuration(orig);
  if (total && start >= total - 1)
    throw new Error(
      `O início marcado (${clockLabel(start)}) passa do fim do vídeo, que tem ${clockLabel(total)}. Confira o trecho da pregação e envie de novo.`,
    );
  await update(id, { stage: 'Separando o trecho da pregação', progress: 0 });
  const r = await run(tools.ffmpeg, [
    '-y',
    '-hide_banner',
    '-ss',
    String(start),
    '-i',
    orig,
    ...(end ? ['-t', String(end - start)] : []),
    '-map',
    '0:v?',
    '-map',
    '0:a?',
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    tmp,
  ]);
  const dur = r.code === 0 ? await mediaDuration(tmp) : 0;
  if (!(dur >= 1)) {
    await fsp.rm(tmp, { force: true });
    if (r.code === 0)
      throw new Error('O trecho marcado ficou vazio. Confira o início e o fim da pregação e envie de novo.');
    log('recorte do trecho falhou', id, (r.err || '').split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 400));
    throw new Error('Não consegui separar o trecho da pregação deste vídeo.');
  }
  await update(id, { rangeApplied: true, size: (await fsp.stat(tmp)).size });
  await fsp.rename(tmp, orig);
  log('trecho da pregação separado', id, `${start}s a ${end || 'fim'} (${Math.round(dur)} s)`);
}
/**
 * Se o navegador não toca o vídeo baixado (AV1/VP9 ou áudio Opus dentro de mp4), gera em segundo plano uma cópia
 * H.264 + AAC de até 720p só para assistir na tela. Os cortes continuam sendo exportados do original.
 */
async function makePreview(id) {
  try {
    const m = await getMeta(id);
    if (!m || !m.file || !tools.ffmpeg) return;
    const orig = U(id, m.file),
      probe = await run(tools.ffmpeg, ['-hide_banner', '-i', orig]);
    if (!needsPreview(probe.err)) {
      if (m.preview) await update(id, { preview: null });
      return;
    }
    await update(id, { preview: 'making', previewError: null });
    log('preparando cópia para o navegador', id);
    if (tools.vtb === undefined)
      tools.vtb = /h264_videotoolbox/.test((await run(tools.ffmpeg, ['-hide_banner', '-encoders'])).out); // no Mac, usa o chip de vídeo: bem mais rápido
    const enc = tools.vtb
      ? ['-c:v', 'h264_videotoolbox', '-b:v', '2500k']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26'];
    const tmp = U(id, 'preview.tmp.mp4'),
      out = U(id, 'preview.mp4');
    const r = await run(tools.ffmpeg, [
      '-y',
      '-hide_banner',
      '-i',
      orig,
      '-vf',
      "scale=-2:'min(720,ih)'",
      ...enc,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      tmp,
    ]);
    if (r.code !== 0) {
      await fsp.rm(tmp, { force: true });
      await update(id, { preview: null, previewError: 'Não consegui preparar a cópia do vídeo para este navegador.' });
      return log(
        'cópia para o navegador falhou',
        id,
        (r.err || '').split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 400),
      );
    }
    await fsp.rename(tmp, out);
    await update(id, { preview: 'preview.mp4' });
    log('cópia para o navegador pronta', id);
  } catch (e) {
    log('cópia para o navegador falhou', id, e.message);
    await update(id, { preview: null }).catch(() => {});
  }
}
/**
 * Capa do envio (thumb.jpg na pasta dele): a do YouTube quando o vídeo veio de lá; senão, o primeiro quadro do vídeo.
 * É criada na primeira vez que a tela pede e fica guardada. Devolve o caminho, ou null se não houver de onde tirar.
 */
const YTIMG = (E.INVB_YTIMG_BASE || 'https://i.ytimg.com').replace(/\/$/, '');
const ensureThumb = (m) =>
  withLock('thumb:' + m.id, async () => {
    const out = U(m.id, 'thumb.jpg');
    if (fs.existsSync(out)) return out;
    const vid = m.source === 'youtube' ? ytId(m.url) : '';
    if (vid)
      for (const size of ['maxresdefault', 'hqdefault']) {
        // a maior nem sempre existe
        try {
          const r = await fetch(`${YTIMG}/vi/${vid}/${size}.jpg`);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length) {
              await fsp.writeFile(out, buf);
              return out;
            }
          }
        } catch {
          /* sem internet: tenta o quadro do vídeo */
        }
      }
    if (m.kind !== 'vid' || !m.file || !tools.ffmpeg) return null;
    const src = [m.file, m.preview].filter((f) => f && f !== 'making' && fs.existsSync(U(m.id, f)))[0];
    if (!src) return null;
    const r = await run(tools.ffmpeg, [
      '-y',
      '-hide_banner',
      '-i',
      U(m.id, src),
      '-frames:v',
      '1',
      '-vf',
      "scale='min(960,iw)':-2",
      '-q:v',
      '4',
      out,
    ]);
    return r.code === 0 && fs.existsSync(out) ? out : null;
  });
/** Arquivo que o navegador deve tocar: a cópia compatível, quando existe; senão o original. */
const playable = (m) => (m.preview && m.preview !== 'making' && fs.existsSync(U(m.id, m.preview)) ? m.preview : m.file);
/** Grava em disco o download aberto por openDrive. Devolve o total de bytes. */
async function saveDriveStream(id, file, dlr, onProgress) {
  let n = 0,
    last = 0;
  const ws = fs.createWriteStream(U(id, file));
  try {
    const rs = Readable.fromWeb(dlr.res.body);
    rs.on('data', (ch) => {
      n += ch.length;
      if (n > cfg.maxUploadBytes) rs.destroy(new Error(tooBig()));
      const now = Date.now();
      if (onProgress && dlr.size && now - last > 1000) {
        last = now;
        onProgress(Math.min(99, Math.round((n / dlr.size) * 100)));
      }
    });
    await new Promise((ok, bad) => {
      rs.on('error', bad);
      ws.on('error', bad);
      ws.on('finish', ok);
      rs.pipe(ws);
    });
    if (!n) throw new Error('Arquivo vazio.');
    return n;
  } catch (e) {
    ws.destroy();
    throw e;
  }
}

module.exports = {
  aiBusy,
  peaksBusy,
  cleanPost,
  refetchBusy,
  driveBusy,
  touchUsed,
  dropOriginal,
  isGone,
  refetchReady,
  exporting,
  sweepOriginals,
  fetchYoutube,
  applyRange,
  makePreview,
  ensureThumb,
  playable,
  saveDriveStream,
};
