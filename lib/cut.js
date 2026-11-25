// "Cortar no Studio": o Editor avançado manda só a lista de trechos que ficaram (em segundos do vídeo da pregação) e o
// ffmpeg corta o vídeo aqui, em vez de o navegador gerar o vídeo de novo quadro por quadro (horas numa live inteira).
//   rápido: cópia direta dos trechos (segundos; o corte cai no quadro-chave mais próximo, até ~2 s de diferença)
//   exato:  gera de novo só o que ficou, com o codificador do computador (VideoToolbox no Mac) quando houver
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { tools, U } = require('./config');
const { run } = require('./store');

/** Trechos válidos, em ordem, sem sobreposição, dentro da duração; null se não sobrar nada. */
function cleanSegments(segs, duration) {
  const max = duration > 0 ? duration : Infinity;
  const list = (Array.isArray(segs) ? segs : [])
    .slice(0, 500)
    .map((s) => [Number(s && s[0]), Number(s && s[1])])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    .map(([a, b]) => [Math.max(0, Math.min(a, max)), Math.max(0, Math.min(b, max))])
    .filter(([a, b]) => b - a >= 0.2)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 0.05) last[1] = Math.max(last[1], s[1]);
    else out.push(s);
  }
  return out.length ? out.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]) : null;
}

const SOFT = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
let chosen = null;
/**
 * Codificador de vídeo para o corte exato: o do hardware (VideoToolbox no Mac, NVENC com placa NVIDIA) quando ele
 * funciona de verdade neste computador, senão o libx264 rápido. Só a lista do ffmpeg não basta: ele pode listar o
 * NVENC sem haver a placa. Então cada um é testado com um quadro, uma vez.
 */
async function videoEncoder() {
  if (chosen) return chosen;
  const list = (await run(tools.ffmpeg, ['-hide_banner', '-encoders'])).out || '';
  const tries = [];
  if (/h264_videotoolbox/.test(list)) tries.push(['-c:v', 'h264_videotoolbox', '-b:v', '8M', '-allow_sw', '1']);
  if (/h264_nvenc/.test(list)) tries.push(['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21']);
  for (const enc of tries) {
    const r = await run(tools.ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=size=320x240:rate=25:duration=0.2',
      ...enc,
      '-pix_fmt',
      'yuv420p',
      '-f',
      'null',
      '-',
    ]);
    if (r.code === 0) return (chosen = enc);
  }
  return (chosen = SOFT);
}

/** Lê "out_time_us=" do -progress do ffmpeg e devolve a fração feita. */
const progressOf = (chunk, total) => {
  const m = /out_time_us=(\d+)/g;
  let x,
    last = null;
  while ((x = m.exec(chunk))) last = +x[1] / 1e6;
  return last === null || !total ? null : Math.max(0, Math.min(1, last / total));
};

/**
 * Corta `src` deixando só os trechos `segs` e grava em `out` (.mp4). `onProgress(0..1)`.
 * @returns {Promise<void>}
 */
async function cutVideo(src, segs, out, mode, onProgress = () => {}) {
  if (!tools.ffmpeg) throw new Error('ffmpeg não encontrado.');
  const total = segs.reduce((a, [s, e]) => a + (e - s), 0);
  const dir = path.dirname(out);
  if (mode === 'exact') {
    const parts = segs
      .map(
        ([s, e], i) =>
          `[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${i}]`,
      )
      .join(';');
    const cat = segs.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${segs.length}:v=1:a=1[v][a]`;
    const r = await run(
      tools.ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-progress',
        'pipe:1',
        '-i',
        src,
        '-filter_complex',
        parts + ';' + cat,
        '-map',
        '[v]',
        '-map',
        '[a]',
        ...(await videoEncoder()),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart',
        out,
      ],
      { onStdout: (d) => { const f = progressOf(d, total); if (f !== null) onProgress(f); } }, // prettier-ignore
    );
    if (r.code !== 0) {
      if ((await videoEncoder()) !== SOFT) {
        chosen = SOFT; // o do hardware falhou neste vídeo: daqui em diante, o comum
        return cutVideo(src, segs, out, mode, onProgress);
      }
      throw new Error('O ffmpeg não conseguiu cortar: ' + (r.err || '').split('\n').filter(Boolean).pop());
    }
    return;
  }
  // rápido: cada trecho copiado sem gerar de novo, depois juntados
  const list = [];
  let done = 0;
  try {
    for (let i = 0; i < segs.length; i++) {
      const [s, e] = segs[i];
      const part = path.join(dir, `corte-${i}.part.mp4`);
      const r = await run(
        tools.ffmpeg,
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-progress',
          'pipe:1',
          '-ss',
          String(s),
          '-i',
          src,
          '-t',
          String(e - s),
        ].concat(['-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', part]),
        { onStdout: (d) => { const f = progressOf(d, total); if (f !== null) onProgress(Math.min(0.95, (done + f * (e - s)) / total)); } }, // prettier-ignore
      );
      if (r.code !== 0)
        throw new Error('O ffmpeg não conseguiu copiar um trecho: ' + (r.err || '').split('\n').filter(Boolean).pop());
      list.push(part);
      done += e - s;
      onProgress(Math.min(0.95, done / total));
    }
    const txt = path.join(dir, 'corte.lista.txt');
    await fsp.writeFile(txt, list.map((f) => `file '${path.basename(f).replace(/'/g, "'\\''")}'`).join('\n'));
    const r = await run(
      tools.ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        txt,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        out,
      ],
      { cwd: dir },
    );
    if (r.code !== 0)
      throw new Error('O ffmpeg não conseguiu juntar os trechos: ' + (r.err || '').split('\n').filter(Boolean).pop());
    onProgress(1);
  } finally {
    for (const f of list) await fsp.rm(f, { force: true }).catch(() => {});
    await fsp.rm(path.join(dir, 'corte.lista.txt'), { force: true }).catch(() => {});
  }
}

module.exports = { cleanSegments, cutVideo, U };
