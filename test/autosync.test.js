// AutoSync: decisão (pura), correção com o ffmpeg (mídia sintética) e, quando instalado, a detecção real.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide, applyShift, analyze, locate, LIMITS } = require('../lib/autosync');

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const ROOT = path.join(__dirname, '..');
const LOC = locate(ROOT);
const HAS_MODEL = fs.existsSync(LOC.python) && spawnSync(LOC.python, [LOC.worker, '--check']).status === 0;

/** Janela medida pelo worker, com o essencial para a decisão. */
const W = (t, lag, conf, extra = {}) => ({
  t,
  dur: 8,
  frames: 200,
  faces: 1,
  conf,
  lag_ms: lag,
  lag_frames: Math.round(lag / 40),
  edge: false,
  ...extra,
});
const raw = (windows) => ({ fps: 25, maxShiftMs: 1000, windows });

/* ---------- decisão ---------- */
test('som atrasado fixo: corrige adiantando o som', () => {
  const r = decide(raw([W(10, 200, 7), W(60, 198, 6.5), W(120, 205, 8), W(180, 201, 5)]));
  assert.strictEqual(r.status, 'corrigir');
  assert.ok(r.needsCorrection);
  assert.ok(Math.abs(r.offsetMs - 201) <= 2);
  assert.strictEqual(r.shiftSec, -r.offsetMs / 1000);
  assert.match(r.message, /atrasado/);
});

test('som adiantado fixo: corrige atrasando o som', () => {
  const r = decide(raw([W(10, -320, 6), W(60, -318, 7), W(120, -322, 6)]));
  assert.strictEqual(r.status, 'corrigir');
  assert.ok(r.shiftSec > 0.31 && r.shiftSec < 0.33);
  assert.match(r.message, /adiantado/);
});

test('diferença dentro da margem: sincronizado, sem correção', () => {
  const r = decide(raw([W(10, 20, 7), W(60, -10, 7), W(120, 30, 6)]));
  assert.strictEqual(r.status, 'sincronizado');
  assert.strictEqual(r.needsCorrection, false);
  assert.strictEqual(r.shiftSec, 0);
});

test('confiança baixa em todas as janelas: inconclusivo e não corrige', () => {
  const r = decide(raw([W(10, 400, 1.2), W(60, -200, 2), W(120, 80, 1.5)]));
  assert.strictEqual(r.status, 'inconclusivo');
  assert.strictEqual(r.needsCorrection, false);
  assert.strictEqual(r.offsetMs, null);
});

test('uma única janela boa entre várias não basta', () => {
  const r = decide(raw([W(10, 200, 8), W(60, 0, 1), { t: 120, reason: 'sem_rosto' }]));
  assert.strictEqual(r.status, 'inconclusivo');
});

test('medições aceitas que discordam sem padrão: inconclusivo', () => {
  const r = decide(raw([W(10, 200, 6), W(60, -100, 6)]));
  assert.strictEqual(r.status, 'inconclusivo');
});

test('atraso que cresce ao longo do vídeo: variável, fora do escopo', () => {
  const r = decide(raw([W(10, 0, 6), W(300, 120, 6), W(600, 240, 6), W(900, 360, 6)]));
  assert.strictEqual(r.status, 'variavel');
  assert.strictEqual(r.needsCorrection, false);
});

test('deriva lenta (som se afastando aos poucos, ~130 ms em 40 s): variável, não corrige', () => {
  // Medidas reais do benchmark: trecho de pregação com o som esticado 0,3% (atempo=0.997).
  const r = decide(
    raw([
      W(1, 190.3, 6.09),
      W(9.28, 218.9, 6.56),
      W(17.57, 258.7, 5.87),
      W(25.85, 277.7, 4.79),
      W(34.13, 306.3, 4.89),
      W(42.42, 322.9, 3.48),
    ]),
  );
  assert.strictEqual(r.status, 'variavel');
});

test('dois grupos de atraso (a partir de um ponto o som muda): variável', () => {
  const r = decide(raw([W(10, 100, 6), W(60, 105, 6), W(500, 400, 6), W(560, 395, 6)]));
  assert.strictEqual(r.status, 'variavel');
});

test('sem rosto em nenhuma janela', () => {
  const r = decide(
    raw([
      { t: 0, reason: 'sem_rosto' },
      { t: 60, reason: 'sem_rosto' },
      { t: 120, reason: 'rosto_pequeno' },
    ]),
  );
  assert.strictEqual(r.status, 'sem_rosto');
  assert.strictEqual(r.needsCorrection, false);
});

test('sem fala em nenhuma janela', () => {
  const r = decide(
    raw([
      { t: 0, faces: 1, reason: 'sem_fala' },
      { t: 60, faces: 1, reason: 'sem_fala' },
    ]),
  );
  assert.strictEqual(r.status, 'sem_fala');
});

test('mínimo no limite da busca: avisa que o atraso passa do que a análise mede', () => {
  const r = decide(raw([W(10, 1000, 6, { edge: true }), W(60, 1000, 6, { edge: true })]));
  assert.strictEqual(r.status, 'inconclusivo');
  assert.match(r.message, /maior que 1000 ms/);
});

test('mais de um rosto: a decisão continua, e a mensagem avisa', () => {
  const r = decide(raw([W(10, 160, 7, { faces: 2 }), W(60, 160, 7, { faces: 3 })]));
  assert.strictEqual(r.status, 'corrigir');
  assert.ok(r.evidence.multipleFaces);
  assert.match(r.message, /mais de um rosto/);
});

test('trecho curto com uma janela só exige confiança maior', () => {
  assert.strictEqual(decide(raw([W(0, 200, LIMITS.conf + 0.1)])).status, 'inconclusivo');
  assert.strictEqual(decide(raw([W(0, 200, LIMITS.confSingle + 0.1)])).status, 'corrigir');
});

test('sem medição nenhuma: erro claro', () => {
  const r = decide({ windows: [] });
  assert.strictEqual(r.status, 'erro');
  assert.ok(r.message);
});

/* ---------- correção (ffmpeg, mídia sintética: um clarão na imagem e um bipe no som, ambos em 2,0 s) ---------- */
function makeAv(dir) {
  const f = path.join(dir, 'base.mp4');
  const r = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=160x120:r=25:d=6',
    '-f',
    'lavfi',
    '-i',
    "aevalsrc='if(between(t,2,2.05),sin(2*PI*1000*t),0)':s=48000:d=6",
    '-vf',
    "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,2,2.03)'",
    '-c:v',
    'libx264',
    '-g',
    '250',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    f,
  ]);
  assert.strictEqual(r.status, 0, String(r.stderr));
  return f;
}
/** Momento do clarão (imagem) e do bipe (som), na linha do tempo do arquivo. */
function measure(f) {
  const v = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    f,
    '-map',
    '0:v',
    '-vf',
    'scale=4:4,format=gray',
    '-f',
    'rawvideo',
    '-',
  ]).stdout;
  let flash = -1;
  for (let i = 0; i < v.length / 16; i++)
    if (v[i * 16] > 128) {
      flash = i / 25;
      break;
    }
  const a = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      f,
      '-map',
      '0:a',
      '-af',
      'aresample=async=1:first_pts=0',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      's16le',
      '-',
    ],
    { maxBuffer: 1 << 26 },
  ).stdout;
  let beep = -1;
  for (let i = 0; i < a.length / 2; i++)
    if (Math.abs(a.readInt16LE(i * 2)) > 3000) {
      beep = i / 48000;
      break;
    }
  return { flash, beep };
}
const codecs = (f) =>
  String(spawnSync('ffmpeg', ['-hide_banner', '-i', f]).stderr)
    .match(/(Video|Audio): \w+/g)
    .join(',');

for (const shift of [0.3, -0.3, 0.04, -0.52]) {
  test(
    `correção de ${shift > 0 ? '+' : ''}${shift * 1000} ms desloca o som com precisão de amostra e sem recodificar`,
    { skip: !HAS_FFMPEG },
    async (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const base = makeAv(dir),
        before = fs.readFileSync(base),
        out = path.join(dir, 'corrigido.mp4');
      await applyShift({ ffmpeg: 'ffmpeg', input: base, output: out, shiftSec: shift });
      const m0 = measure(base),
        m1 = measure(out);
      assert.strictEqual(m1.flash, m0.flash, 'a imagem não pode mudar de lugar');
      assert.ok(
        Math.abs(m1.beep - m0.beep - shift) < 0.001,
        `bipe deveria andar ${shift}s; andou ${(m1.beep - m0.beep).toFixed(4)}s`,
      );
      assert.strictEqual(codecs(out), codecs(base));
      assert.ok(before.equals(fs.readFileSync(base)), 'o original não pode ser alterado');
    },
  );
}

test('a correção recusa gravar por cima do original', { skip: !HAS_FFMPEG }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const base = makeAv(dir),
    before = fs.readFileSync(base);
  await assert.rejects(
    applyShift({ ffmpeg: 'ffmpeg', input: base, output: base, shiftSec: 0.2 }),
    /não pode substituir o original/,
  );
  assert.ok(before.equals(fs.readFileSync(base)));
});

test(
  'falha do ffmpeg na correção: erro claro, nada fica pela metade e o original continua',
  { skip: !HAS_FFMPEG },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const base = makeAv(dir),
      before = fs.readFileSync(base),
      out = path.join(dir, 'corrigido.mp4');
    const failing = async (cmd, args) => {
      fs.writeFileSync(args[args.length - 1], 'meio arquivo');
      return { code: 1, err: 'Conversion failed!\ndisk full' };
    };
    await assert.rejects(
      applyShift({ ffmpeg: 'ffmpeg', input: base, output: out, shiftSec: 0.2, run: failing }),
      /não conseguiu gravar.*disk full/,
    );
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['base.mp4']);
    assert.ok(before.equals(fs.readFileSync(base)));
  },
);

test('ajuste fora do intervalo é recusado', async () => {
  await assert.rejects(applyShift({ ffmpeg: 'ffmpeg', input: __filename, output: 'x.mp4', shiftSec: 9 }), /inválido/);
  await assert.rejects(applyShift({ ffmpeg: 'ffmpeg', input: __filename, output: 'x.mp4', shiftSec: NaN }), /inválido/);
});

test('sem a sincronia instalada, a análise avisa em vez de inventar resultado', async () => {
  await assert.rejects(analyze({ python: null, worker: null, video: __filename }), /não está instalada/);
});

/* ---------- detecção real (só onde o modelo está instalado) ---------- */
test(
  'vídeo sem rosto: a análise real diz que não dá para medir, sem corrigir',
  { skip: !HAS_FFMPEG || !HAS_MODEL },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const f = path.join(dir, 'semrosto.mp4');
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=640x360:r=25:d=14',
      '-f',
      'lavfi',
      '-i',
      'sine=f=220:d=14',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      f,
    ]);
    const r = await analyze({ ...LOC, ffmpeg: 'ffmpeg', video: f });
    assert.strictEqual(r.needsCorrection, false);
    assert.strictEqual(r.status, 'sem_rosto');
  },
);

test('arquivo sem som: erro claro da análise real', { skip: !HAS_FFMPEG || !HAS_MODEL }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'mudo.mp4');
  spawnSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x240:r=25:d=8',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    f,
  ]);
  await assert.rejects(analyze({ ...LOC, ffmpeg: 'ffmpeg', video: f }), /não tem som/);
});

// Precisão com vídeo real: precisa de um vídeo com uma pessoa falando de frente (não vai no repositório).
// AUTOSYNC_BENCH_VIDEO=caminho.mp4 [AUTOSYNC_BENCH_AT=segundos] npm test
const BENCH = process.env.AUTOSYNC_BENCH_VIDEO;
test(
  'vídeo real com atraso conhecido: detecta e corrige sozinho',
  { skip: !HAS_FFMPEG || !HAS_MODEL || !BENCH },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const at = +process.env.AUTOSYNC_BENCH_AT || 0,
      src = path.join(dir, 'ref.mp4');
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(at),
      '-t',
      '40',
      '-i',
      BENCH,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      src,
    ]);
    const ref = await analyze({ ...LOC, ffmpeg: 'ffmpeg', video: src });
    assert.ok(ref.ok, 'o vídeo de referência precisa ser analisável: ' + ref.message);
    for (const shift of [0.24, -0.32]) {
      const bad = path.join(dir, `bad${shift}.mp4`),
        fixed = path.join(dir, `fix${shift}.mp4`);
      await applyShift({ ffmpeg: 'ffmpeg', input: src, output: bad, shiftSec: shift }); // estraga a sincronia de propósito
      const r = await analyze({ ...LOC, ffmpeg: 'ffmpeg', video: bad });
      assert.strictEqual(r.status, 'corrigir', r.message);
      assert.ok(
        Math.abs(r.offsetMs - ((ref.offsetMs || 0) + shift * 1000)) <= 40,
        `esperado ~${shift * 1000} ms além da referência; veio ${r.offsetMs}`,
      );
      await applyShift({ ffmpeg: 'ffmpeg', input: bad, output: fixed, shiftSec: r.shiftSec });
      const r2 = await analyze({ ...LOC, ffmpeg: 'ffmpeg', video: fixed });
      assert.strictEqual(
        r2.status,
        'sincronizado',
        `depois de corrigir, boca e som deveriam bater; veio ${r2.offsetMs} ms`,
      );
    }
  },
);
