// Ajudantes dos testes do servidor (test/server-*.test.js): sobem o app de verdade numa pasta temporária, criam
// pregações e cortes de exemplo e imitam os serviços de fora (yt-dlp, Claude, OpenAI, Google, Demucs).
// Não tem testes: só o que os outros arquivos usam.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'),
  PW = 'senha-de-teste-123',
  DAY = 86400000;
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const freePort = () =>
  new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
/** Cria um envio já concluído na pasta de dados. `original: false` simula o vídeo ausente. */
function seed(dataDir, id, meta = {}, { clips = [], original = true } = {}) {
  const dir = path.join(dataDir, 'uploads', id);
  fs.mkdirSync(dir, { recursive: true });
  const m = {
    id,
    name: 'Pregação',
    file: 'original.mp4',
    size: 4,
    kind: 'vid',
    createdAt: Date.now(),
    status: 'done',
    stage: 'Concluído',
    progress: 100,
    source: 'youtube',
    url: 'https://www.youtube.com/watch?v=abc',
    duration: 600,
    ...meta,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m));
  fs.writeFileSync(
    path.join(dir, 'transcript.json'),
    JSON.stringify({
      language: 'pt',
      segments: [
        {
          id: 0,
          speaker: 'Pessoa 1',
          start: 0,
          end: 2,
          text: 'olá mundo',
          words: [
            { w: 'olá', s: 0, e: 1 },
            { w: 'mundo', s: 1, e: 2 },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ emotions: [], chapters: [], clips: [] }));
  fs.writeFileSync(path.join(dir, 'clips.json'), JSON.stringify(clips));
  if (original) fs.writeFileSync(path.join(dir, 'original.mp4'), 'fake');
  return dir;
}
/** Sobe o servidor. `env` acrescenta variáveis; `tools: false` esconde ffmpeg e yt-dlp do PATH. */
async function boot(t, dataDir, { env = {}, tools = true } = {}) {
  const port = await freePort();
  const fakeYt = path.join(dataDir, 'yt-dlp-falso.js');
  fs.writeFileSync(fakeYt, 'process.exit(1)'); // "instalado", mas todo download falha
  const base = {
    ...process.env,
    NODE_ENV: '',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: dataDir,
    INVB_PASSWORD: PW,
    PYTHON: 'python-inexistente',
    ...env,
  };
  if (tools) base.YTDLP_PATH = base.YTDLP_PATH || process.execPath;
  else {
    base.PATH = path.dirname(process.execPath);
    delete base.YTDLP_PATH;
    delete base.FFMPEG_PATH;
  }
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: base, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => {
    out += d;
  });
  p.stderr.on('data', (d) => {
    out += d;
  });
  t.after(() => {
    p.kill();
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/healthz')).ok) break;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 50));
    if (i === 99) throw new Error('servidor não subiu:\n' + out);
  }
  const login = await fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'x-invb': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const api = async (p2, o = {}) => {
    const r = await fetch(url + '/api' + p2, {
      method: o.method || (o.json !== undefined ? 'POST' : 'GET'),
      headers: { 'x-invb': '1', cookie, ...(o.json !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: o.json !== undefined ? JSON.stringify(o.json) : undefined,
    });
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* sem corpo */
    }
    return { status: r.status, body: j };
  };
  return { api, url, cookie, log: () => out };
}
const tmp = (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'invb-test-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
};
const has = (dir, f) => fs.existsSync(path.join(dir, f));
const meta = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const clip = (o = {}) => ({
  id: 'm111111111111',
  title: 'Corte',
  start: 10,
  end: 40,
  manual: true,
  fav: false,
  hid: false,
  render: { status: 'done', file: 'm111111111111.mp4', at: 1 },
  ...o,
});
// --- yt-dlp recente precisa de um runtime JavaScript; o app aponta para o Node que já está instalado ---
const fakeYtdlp = (dir, { acceptsFlag }) => {
  const f = path.join(dir, 'yt-dlp-espiao.sh'),
    log = path.join(dir, 'ytdlp-args.log');
  fs.writeFileSync(
    f,
    `#!/bin/bash\nfor a in "$@"; do if [ "$a" = "--js-runtimes" ] && [ "${acceptsFlag ? 1 : 0}" = "0" ]; then echo "no such option: --js-runtimes" >&2; exit 2; fi; done\nfor a in "$@"; do if [ "$a" = "--version" ]; then echo 2026.01.01; exit 0; fi; done\necho "$@" >> "${log}"\nexit 1\n`,
    { mode: 0o755 },
  );
  return { f, log };
};
const untilNotRefetching = async (s, id) => {
  let m;
  for (let i = 0; i < 80; i++) {
    m = (await s.api('/uploads/' + id)).body;
    if (!m.refetching) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return m;
};
// --- cortes da IA: aba Automáticos, com nota, sem os trechos de texto pré-feito ---
const http = require('node:http');
/** API do Claude de mentira para estes testes: devolve os cortes combinados (ou falha, se cuts for null). */
const fakeClaude = (t, cuts) =>
  new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (x) => {
        b += x;
      });
      req.on('end', () => {
        if (!cuts) {
          res.writeHead(401, { 'content-type': 'application/json' });
          return res.end(
            JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
          );
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            content: [{ type: 'text', text: JSON.stringify({ cuts }) }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      t.after(() => srv.close());
      ok('http://127.0.0.1:' + srv.address().port);
    });
  });
const untilAnalyzed = async (s, id) => {
  let m;
  for (let i = 0; i < 100; i++) {
    m = (await s.api('/uploads/' + id)).body;
    if (m.aiCutsAt) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return m;
};
const heuristicClip = {
  id: 'a0',
  title: 'Trecho antigo',
  description: 'Trecho sugerido por heurística local (sem IA): boa densidade de fala e fim de frase limpo.',
  type: 'Trecho',
  score: 70,
  start: 5,
  end: 40,
  manual: false,
  fav: false,
  hid: false,
  render: null,
};
// --- as duas IAs: vale a que tiver chave ---
const fakeOpenAI = (t) =>
  new Promise((ok) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (x) => {
        b += x;
      });
      req.on('end', () => {
        const body = JSON.parse(b || '{}'),
          req1 = body.response_format.json_schema.schema.required;
        seen.push({ url: req.url, auth: req.headers.authorization, model: body.model, kind: req1[0] });
        const out = req1.includes('cuts')
          ? {
              cuts: [{ start_seconds: 60, end_seconds: 120, title: 'Pela OpenAI', reason: 'Trecho forte.', score: 88 }],
            }
          : req1.includes('chapters')
            ? {
                chapters: [{ start: 0, title: 'Capítulo da IA', summary: 'Resumo.', tags: ['fé'] }],
                emotions: [{ i: 0, emotion: 'Esperança' }],
              }
            : { title: 'Título da OpenAI', description: 'Descrição.', hashtags: ['#fé'] };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(out) } }],
          }),
        );
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      t.after(() => srv.close());
      ok({ base: 'http://127.0.0.1:' + srv.address().port + '/v1', seen });
    });
  });
// --- velocidade do corte exportado ---
const ffDuration = (f) =>
  +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])
    .stdout.toString()
    .trim();
// --- utilidades para medir o áudio exportado ---
const meanVolume = (f) =>
  +(/mean_volume: (-?[\d.]+) dB/.exec(
    spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString(),
  ) || [])[1];
const waitRender = async (s, id) => {
  let k;
  for (let i = 0; i < 300; i++) {
    k = (await s.api(`/uploads/${id}/clips`)).body[0];
    if (k.render && k.render.status !== 'rendering') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(k.render.status, 'done', k.render.error);
  return k.render;
};
// --- remover música com o modelo de separação de voz (IA local) ---
/** Faz o papel do "python -m demucs": devolve como "voz isolada" um áudio em silêncio, para o teste reconhecer de onde veio o som. */
const fakeDemucs = (dir) => {
  const f = path.join(dir, 'demucs-falso.sh');
  fs.writeFileSync(
    f,
    '#!/bin/bash\nfor a in "$@"; do [ "$a" = "--help" ] && exit 0; done\nout=""; inp=""\nwhile [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; -m|-n) shift;; --*) ;; *) inp="$1";; esac; shift; done\nbase=$(basename "$inp" .wav); mkdir -p "$out/htdemucs/$base"\nffmpeg -y -loglevel error -i "$inp" -af volume=0 "$out/htdemucs/$base/vocals.wav"\n',
    { mode: 0o755 },
  );
  return f;
};
const seedTone = (d, id) => {
  const dir = seed(d, id, { duration: 6 }, { clips: [clip({ start: 0, end: 6, render: null })] });
  spawnSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=25:duration=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=300:duration=6',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    path.join(dir, 'original.mp4'),
  ]);
  return dir;
};
/** Um Google Drive de mentira: guarda nome, tipo e conteúdo de cada arquivo enviado. */
async function fakeGoogle(t) {
  const http = require('node:http'),
    files = [];
  let n = 0;
  const srv = http.createServer((req, res) => {
    let b = [];
    req.on('data', (c) => b.push(c));
    req.on('end', () => {
      b = Buffer.concat(b);
      const u = new URL(req.url, 'http://x'),
        j = (o) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(o));
        };
      if (req.method === 'GET' && u.pathname === '/drive/v3/files') return j({ files: [] });
      if (req.method === 'POST' && u.pathname === '/drive/v3/files') return j({ id: 'pasta1' });
      if (req.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
        const k = n++;
        files[k] = { ...JSON.parse(b), mime: req.headers['x-upload-content-type'] };
        res.writeHead(200, { location: `http://127.0.0.1:${srv.address().port}/sessao/${k}` });
        return res.end();
      }
      if (req.method === 'PUT' && u.pathname.startsWith('/sessao/')) {
        const k = +u.pathname.split('/').pop();
        files[k].body = b.toString('utf8');
        return j({ id: 'f' + k, webViewLink: `https://drive.google.com/file/d/f${k}/view` });
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  return { base: `http://127.0.0.1:${srv.address().port}`, files };
}
const TOKEN = 'ya29.token-de-teste-com-tamanho-suficiente';
// --- trecho da pregação: só ele fica no computador e é transcrito ---
const probeDur = (f) => {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(spawnSync('ffmpeg', ['-i', f]).stderr.toString());
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};
const sendVideo = async (s, f, qs) => {
  const r = await fetch(`${s.url}/api/uploads?name=culto.mp4${qs}`, {
    method: 'POST',
    headers: { 'x-invb': '1', cookie: s.cookie },
    body: fs.readFileSync(f),
  });
  return { status: r.status, body: await r.json() };
};
const waitStatus = async (s, id) => {
  let m;
  for (let i = 0; i < 200; i++) {
    m = (await s.api('/uploads/' + id)).body;
    if (['error', 'done'].includes(m.status)) return m;
    await new Promise((r) => setTimeout(r, 100));
  }
  return m;
};
const AS_PY = path.join(
  ROOT,
  '.venv-sync',
  ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
);
const HAS_AUTOSYNC =
  fs.existsSync(AS_PY) && spawnSync(AS_PY, [path.join(ROOT, 'worker', 'autosync.py'), '--check']).status === 0;

module.exports = {
  test,
  assert,
  fs,
  os,
  path,
  net,
  spawn,
  spawnSync,
  ROOT,
  PW,
  DAY,
  HAS_FFMPEG,
  freePort,
  seed,
  boot,
  tmp,
  has,
  meta,
  clip,
  fakeYtdlp,
  untilNotRefetching,
  http,
  fakeClaude,
  untilAnalyzed,
  heuristicClip,
  fakeOpenAI,
  ffDuration,
  meanVolume,
  waitRender,
  fakeDemucs,
  seedTone,
  fakeGoogle,
  TOKEN,
  probeDur,
  sendVideo,
  waitStatus,
  AS_PY,
  HAS_AUTOSYNC,
};
