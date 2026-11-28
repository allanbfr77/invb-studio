// Base do servidor: ler e gravar os dados das pregações, rodar programas (ffmpeg, yt-dlp), detectar o que está instalado e a fila de trabalhos.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const autosync = require('./autosync');
const { ROOT, E, cfg, U, tools } = require('./config');

/* ---------- Utilidades ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => crypto.randomBytes(6).toString('hex');
const okId = (s) => /^[a-z0-9]{6,32}$/.test(s || '');
// Leitura/gravação de JSON resistentes a corrida: no Windows, ler enquanto outro processo renomeia o arquivo
// pode falhar por instantes (EBUSY/EPERM). Só um arquivo realmente ausente (ENOENT) vira o valor padrão.
const readJson = async (f, d) => {
  for (let i = 0; i < 6; i++) {
    try {
      return JSON.parse(await fsp.readFile(f, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return d;
      await sleep(25 * (i + 1));
    }
  }
  return d;
};
const locks = new Map();
const withLock = (key, fn) => {
  const prev = locks.get(key) || Promise.resolve();
  const run1 = prev.then(fn, fn);
  const tail = run1.catch(() => {});
  locks.set(key, tail);
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run1;
};
let wseq = 0;
const writeJson = async (f, o) => {
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const t = `${f}.${process.pid}.${++wseq}.tmp`;
  await fsp.writeFile(t, JSON.stringify(o));
  for (let i = 0; i < 8; i++) {
    try {
      await fsp.rename(t, f);
      return;
    } catch (e) {
      if (i === 7) {
        await fsp.rm(t, { force: true });
        throw e;
      }
      await sleep(20 * (i + 1));
    }
  }
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '',
      err = '';
    const p = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    if (opts.onProc) opts.onProc(p);
    p.stdout.on('data', (d) => {
      out += d;
      opts.onStdout && opts.onStdout(d.toString());
    });
    p.stderr.on('data', (d) => {
      err += d;
      opts.onStderr && opts.onStderr(d.toString());
    });
    p.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

async function detectTools() {
  // ffmpeg: env > PATH > imageio-ffmpeg (pacote Python)
  if (!cfg.ffmpeg) {
    if ((await run('ffmpeg', ['-version'])).code === 0) cfg.ffmpeg = 'ffmpeg';
    else {
      const r = await run(cfg.python, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']);
      if (r.code === 0) cfg.ffmpeg = r.out.trim();
    }
  }
  const fv = cfg.ffmpeg ? await run(cfg.ffmpeg, ['-version']) : { code: 1 };
  tools.ffmpeg = fv.code === 0 ? cfg.ffmpeg : null;
  tools.ffmpegMajor = +((/ffmpeg version n?(\d+)\./i.exec(fv.out || '') || [])[1] || 0);
  // Legenda e textos no vídeo exportado dependem do filtro "subtitles" (biblioteca libass). Há ffmpeg sem ele
  // (instalações mínimas): aí a legenda não tem como sair, e o app precisa avisar em vez de exportar sem texto.
  if (tools.ffmpeg) {
    const fl = await run(tools.ffmpeg, ['-hide_banner', '-filters']);
    tools.libass = / subtitles /.test(fl.out || '');
    tools.ffmpegVersion = ((/ffmpeg version (\S+)/i.exec(fv.out || '') || [])[1] || '').slice(0, 40);
    if (!tools.libass)
      log('AVISO: este ffmpeg não tem o filtro "subtitles" (libass): a legenda não sai no vídeo exportado.');
  }
  tools.whisper = (await run(cfg.python, ['-c', 'import faster_whisper'])).code === 0;
  if (cfg.ytdlp) tools.ytdlp = [cfg.ytdlp];
  else if ((await run('yt-dlp', ['--version'])).code === 0) tools.ytdlp = ['yt-dlp'];
  else if ((await run(cfg.python, ['-m', 'yt_dlp', '--version'])).code === 0)
    tools.ytdlp = [cfg.python, '-m', 'yt_dlp'];
  // As versões recentes do yt-dlp precisam de um runtime JavaScript para o YouTube e, por padrão, só procuram o Deno.
  // O Node já está instalado (é ele que roda este servidor), então apontamos para ele. Versões antigas não conhecem a opção.
  if (tools.ytdlp) {
    const js = ['--js-runtimes', 'node:' + process.execPath];
    if ((await run(tools.ytdlp[0], [...tools.ytdlp.slice(1), ...js, '--version'])).code === 0)
      tools.ytdlp = [...tools.ytdlp, ...js];
  }
  // Remoção de música: modelo de separação de voz (Demucs) instalado à parte por install/instalar-voz-ia, na pasta .venv-voz.
  const vozPy =
    E.DEMUCS_PYTHON ||
    path.join(ROOT, '.venv-voz', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  tools.demucs =
    fs.existsSync(vozPy) && (await run(vozPy, ['-m', 'demucs', '--help'])).code === 0 ? [vozPy, '-m', 'demucs'] : null;
  // Sincronia automática (AutoSync): SyncNet + detector de rosto, instalados à parte por install/instalar-autosync, na pasta .venv-sync.
  const as = autosync.locate(ROOT, E),
    asc = fs.existsSync(as.python) ? await run(as.python, [as.worker, '--check']) : null;
  tools.autosync = asc && asc.code === 0 ? as : null;
  if (asc && asc.code !== 0) {
    let why = (asc.err || '').split(/\r?\n/).filter(Boolean).pop() || 'falhou';
    for (const l of (asc.out || '').split(/\r?\n/))
      try {
        const j = JSON.parse(l);
        if (j.message) why = j.message;
      } catch {
        /* ruído */
      }
    log('sincronia automática indisponível:', why);
  }
  tools.checked = true;
}

/* ---------- Armazenamento ---------- */
const metaP = (id) => U(id, 'meta.json');
const getMeta = (id) => readJson(metaP(id), null);
const saveMeta = (m) => writeJson(metaP(m.id), m);
async function listMeta() {
  let ids = [];
  try {
    ids = await fsp.readdir(U());
  } catch {
    /* vazio */
  }
  const all = await Promise.all(ids.filter(okId).map(getMeta));
  return all.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac']);
const VIDEO = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
const mime = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
};

/* ---------- Fila de trabalhos (um por vez: CPU) ---------- */
const queue = [];
let busy = false;
const queueSize = () => queue.length + (busy ? 1 : 0); // trabalhos na fila, contando o que está rodando
function enqueue(fn) {
  queue.push(fn);
  pump();
}
// Downloads ficam fora dessa fila: são espera de rede, não de processador. Assim um download lento (como o de uma live
// recém-encerrada) não segura a transcrição, a análise nem a exportação de cortes de outros vídeos. Até 3 ao mesmo tempo.
const dlWaiting = [];
let dlActive = 0;
function download(fn) {
  const start = () => {
    dlActive++;
    Promise.resolve()
      .then(fn)
      .catch((e) => log('erro no download', e && e.message))
      .finally(() => {
        dlActive--;
        const next = dlWaiting.shift();
        if (next) next();
      });
  };
  if (dlActive < 3) start();
  else dlWaiting.push(start);
}
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    try {
      await queue.shift()();
    } catch (e) {
      log('job falhou:', e.message);
    }
  }
  busy = false;
}

const update = (id, patch) =>
  withLock('meta:' + id, async () => {
    const m = await getMeta(id);
    if (!m) return null;
    Object.assign(m, patch);
    await saveMeta(m);
    return m;
  });

async function mediaDuration(file) {
  const r = await run(tools.ffmpeg, ['-i', file]);
  const m = r.err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

module.exports = {
  sleep,
  rid,
  okId,
  readJson,
  withLock,
  writeJson,
  log,
  run,
  detectTools,
  getMeta,
  saveMeta,
  listMeta,
  AUDIO,
  VIDEO,
  mime,
  queueSize,
  enqueue,
  download,
  update,
  mediaDuration,
};
