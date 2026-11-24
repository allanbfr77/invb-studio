// Avaliação da precisão do AutoSync com vídeos reais e atrasos conhecidos (não roda no "npm test": leva vários minutos).
//   node scripts/autosync-bench.js <pasta-de-trabalho> <video>@<início>[,<início>...] [<video>@...]
// Para cada trecho de 60 s: mede a referência, estraga a sincronia com atrasos conhecidos e confere se a medida acompanha.
// Também roda controles negativos (som de outro momento: não pode haver correção) e atraso variável (não pode corrigir).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { analyze, applyShift, locate } = require('../lib/autosync');

const [work, ...specs] = process.argv.slice(2);
if (!work || !specs.length) {
  console.error('Uso: node scripts/autosync-bench.js <pasta> <video>@<início>[,<início>...]');
  process.exit(2);
}
fs.mkdirSync(work, { recursive: true });
const LOC = locate(path.join(__dirname, '..')),
  FF = process.env.FFMPEG_PATH || 'ffmpeg';
const SHIFTS = (process.env.BENCH_SHIFTS || '-500,-250,-120,-60,0,60,120,250,500').split(',').map(Number);
const LEN = 60;
const ff = (args) => {
  const r = spawnSync(FF, ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};
const rows = [],
  log = (o) => {
    rows.push(o);
    fs.writeFileSync(path.join(work, 'resultados.json'), JSON.stringify(rows, null, 1));
    console.log(JSON.stringify(o));
  };

(async () => {
  const segs = [];
  for (const sp of specs) {
    const [v, ts] = sp.split('@');
    for (const t of ts.split(',')) segs.push({ v, t: +t, name: `${path.basename(path.dirname(v))}-${t}` });
  }
  for (const s of segs) {
    s.base = path.join(work, `${s.name}.mp4`);
    if (!fs.existsSync(s.base))
      ff([
        '-ss',
        String(s.t),
        '-t',
        String(LEN),
        '-i',
        s.v,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        s.base,
      ]);
  }
  for (const s of segs) {
    const t0 = Date.now(),
      ref = await analyze({ ...LOC, ffmpeg: FF, video: s.base });
    s.ref = ref;
    log({
      kind: 'ref',
      seg: s.name,
      status: ref.status,
      offsetMs: ref.offsetMs,
      conf: ref.evidence.confMedian,
      accepted: ref.evidence.accepted,
      windows: ref.evidence.windows,
      sec: Math.round((Date.now() - t0) / 1000),
      confs: ref.windows.map((w) => w.conf ?? w.reason),
    });
    if (!ref.ok) continue;
    for (const sh of SHIFTS) {
      if (!sh) continue;
      const f = path.join(work, `${s.name}_${sh}.mp4`);
      await applyShift({ ffmpeg: FF, input: s.base, output: f, shiftSec: sh / 1000 });
      const r = await analyze({ ...LOC, ffmpeg: FF, video: f });
      const expect = ref.offsetMs + sh;
      log({
        kind: 'shift',
        seg: s.name,
        shiftMs: sh,
        expectMs: expect,
        status: r.status,
        offsetMs: r.offsetMs,
        errMs: r.offsetMs === null ? null : r.offsetMs - expect,
        conf: r.evidence.confMedian,
        agree: `${r.evidence.agreeing}/${r.evidence.accepted}/${r.evidence.windows}`,
      });
      // Correção de ponta a ponta: aplica o que foi detectado e mede de novo.
      if (r.needsCorrection && (sh === 250 || sh === -250)) {
        const fx = path.join(work, `${s.name}_${sh}_fix.mp4`);
        await applyShift({ ffmpeg: FF, input: f, output: fx, shiftSec: r.shiftSec });
        const r2 = await analyze({ ...LOC, ffmpeg: FF, video: fx });
        log({ kind: 'fix', seg: s.name, shiftMs: sh, after: r2.offsetMs, status: r2.status }); // o alvo da correção é 0 ms
        fs.rmSync(fx, { force: true });
      }
      fs.rmSync(f, { force: true });
    }
  }
  // Controles negativos: imagem de um trecho com o som de outro. Nenhuma janela deveria passar do limite de confiança.
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i],
      b = segs[(i + 1) % segs.length];
    if (a === b) continue;
    const f = path.join(work, `ctrl_${a.name}_x_${b.name}.mp4`);
    ff(['-i', a.base, '-i', b.base, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', f]);
    const r = await analyze({ ...LOC, ffmpeg: FF, video: f });
    log({
      kind: 'control',
      seg: `${a.name} x ${b.name}`,
      status: r.status,
      offsetMs: r.offsetMs,
      confs: r.windows.map((w) => w.conf ?? w.reason),
      maxConf: Math.max(0, ...r.windows.map((w) => w.conf || 0)),
    });
    fs.rmSync(f, { force: true });
  }
  // Atraso variável: metade do trecho com o som certo, a outra com +300 ms; e uma deriva contínua de ~180 ms em 60 s.
  for (const s of segs.filter((x) => x.ref && x.ref.ok).slice(0, 3)) {
    const half = path.join(work, `${s.name}_degrau.mp4`),
      drift = path.join(work, `${s.name}_deriva.mp4`);
    ff([
      '-i',
      s.base,
      '-filter_complex',
      `[0:a]asplit[a1][a2];[a1]atrim=0:${LEN / 2},asetpts=PTS-STARTPTS[x];[a2]atrim=${LEN / 2},asetpts=PTS-STARTPTS,adelay=300:all=1[y];[x][y]concat=n=2:v=0:a=1[a]`,
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      half,
    ]);
    ff([
      '-i',
      s.base,
      '-filter_complex',
      '[0:a]atempo=0.997[a]',
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      drift,
    ]);
    for (const [k, f] of [
      ['degrau', half],
      ['deriva', drift],
    ]) {
      const r = await analyze({ ...LOC, ffmpeg: FF, video: f });
      log({
        kind: k,
        seg: s.name,
        status: r.status,
        offsetMs: r.offsetMs,
        lags: r.windows.filter((w) => w.conf).map((w) => [w.t, w.lag_ms, w.conf]),
      });
      fs.rmSync(f, { force: true });
    }
  }
  // Resumo
  const sh = rows.filter((r) => r.kind === 'shift'),
    det = sh.filter((r) => r.errMs !== null);
  const abs = det.map((r) => Math.abs(r.errMs)).sort((x, y) => x - y);
  const summary = {
    trechos: segs.length,
    referenciasAnalisaveis: segs.filter((s) => s.ref && s.ref.ok).length,
    deslocamentos: sh.length,
    comMedida: det.length,
    corrigirQuandoDevia:
      sh.filter((r) => Math.abs(r.expectMs) > 45 && r.status === 'corrigir').length +
      ' de ' +
      sh.filter((r) => Math.abs(r.expectMs) > 45).length,
    erroMedioMs: abs.length ? +(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(1) : null,
    erroMaxMs: abs.length ? abs[abs.length - 1] : null,
    ate40ms: abs.filter((x) => x <= 40).length + ' de ' + abs.length,
    ate20ms: abs.filter((x) => x <= 20).length + ' de ' + abs.length,
    controlesQueCorrigiram:
      rows.filter((r) => r.kind === 'control' && r.status === 'corrigir').length +
      ' de ' +
      rows.filter((r) => r.kind === 'control').length,
    maiorConfEmControle: Math.max(0, ...rows.filter((r) => r.kind === 'control').map((r) => r.maxConf)),
    variavelCorrigido:
      rows.filter((r) => (r.kind === 'degrau' || r.kind === 'deriva') && r.status === 'corrigir').length +
      ' de ' +
      rows.filter((r) => r.kind === 'degrau' || r.kind === 'deriva').length,
    fimAFim: rows.filter((r) => r.kind === 'fix').map((r) => `${r.status} (${r.after} ms)`),
  };
  fs.writeFileSync(path.join(work, 'resumo.json'), JSON.stringify(summary, null, 1));
  console.log('RESUMO', JSON.stringify(summary, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
