// INVB Studio — servidor local, sem dependências npm.
// Login simples, armazenamento em disco (data/), fila de processamento, transcrição, análise e cortes.
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { analyze } = require('./lib/analyze');
const { parseDriveLink, openDrive, ensureFolder, uploadFile } = require('./lib/drive');
const { splitLines } = require('./lib/lines');
const { parseCutList, buildPrompt } = require('./lib/cutlist');
const { staleOriginals, canRefetch } = require('./lib/cleanup');
const { suggestCuts, toAutoClips, describeCut } = require('./lib/claude');
const { pickProvider } = require('./lib/ai');
const { ytProgress, ytInfo, ytId } = require('./lib/ytprogress');
const { needsPreview } = require('./lib/preview');
const { cleanSpeed, atempo, cleanShift } = require('./lib/speed');
const { cleanVoice } = require('./lib/voice');
const { Readable } = require('stream');

/* ---------- Configuração (.env opcional) ----------
   install/pessoal.env é a configuração só deste computador (ex.: a chave do Claude). Ela nunca é copiada
   nem compartilhada com a equipe, e vale sobre o .env, que vem do equipe.env de todos. */
for (const envFile of [path.join(__dirname, 'install', 'pessoal.env'), path.join(__dirname, '.env')]) try {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sem .env */ }
const E = process.env;
const cfg = {
  port: +E.PORT || 4321,
  host: E.HOST || (E.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  secureCookies: E.COOKIE_SECURE === '1',
  trustProxy: E.TRUST_PROXY === '1',
  dataDir: path.resolve(E.DATA_DIR || path.join(__dirname, 'data')),
  python: E.PYTHON || 'python',
  ffmpeg: E.FFMPEG_PATH || '',
  ytdlp: E.YTDLP_PATH || '',
  whisperModel: E.WHISPER_MODEL || 'small',
  whisperDevice: E.WHISPER_DEVICE || 'cpu',
  language: E.TRANSCRIBE_LANGUAGE || 'auto',
  provider: (E.TRANSCRIBE_PROVIDER || (E.GROQ_API_KEY ? 'groq' : 'openai')).toLowerCase(),
  openaiKey: E.OPENAI_API_KEY || '',
  // Qual IA usar quando houver as duas chaves: 'claude' (padrão) ou 'openai'. 'off' desliga a IA neste computador.
  aiProvider: (E.AI_PROVIDER || '').toLowerCase(),
  openaiBase: (E.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  openaiModel: E.OPENAI_MODEL || 'gpt-4o-mini',
  openaiTranscribeModel: E.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
  googleClientId: E.GOOGLE_CLIENT_ID || '',
  // Recursos de IA com o Claude: só aparecem em quem tem esta chave (na configuração pessoal).
  anthropicKey: E.ANTHROPIC_API_KEY || '',
  // Pasta compartilhada do Drive onde os cortes prontos ficam disponíveis para a equipe editar.
  driveCutsFolder: /^[\w-]{10,}$/.test(E.DRIVE_CUTS_FOLDER_ID || '') ? E.DRIVE_CUTS_FOLDER_ID : '',
  // Fica salvo só o link: o vídeo original sai do computador depois de N dias sem uso (negativo desliga a limpeza).
  keepOriginalMs: (E.KEEP_ORIGINAL_DAYS === undefined || E.KEEP_ORIGINAL_DAYS === '' || isNaN(+E.KEEP_ORIGINAL_DAYS) ? 7 : +E.KEEP_ORIGINAL_DAYS) * 86400000,
  maxUploadBytes: (+E.MAX_UPLOAD_GB || 4) * 1024 ** 3,
};
// Transcrição na nuvem: Groq (Whisper, camada gratuita) ou OpenAI. Ambas usam a mesma API.
const cloud = () => cfg.provider === 'groq'
  ? { name: 'Groq', base: 'https://api.groq.com/openai/v1', key: E.GROQ_API_KEY || '', model: E.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo' }
  : { name: 'OpenAI', base: cfg.openaiBase, key: cfg.openaiKey, model: cfg.openaiTranscribeModel };
const isCloud = () => cfg.provider === 'groq' || cfg.provider === 'openai';
/* IA dos recursos inteligentes (cortes, texto do corte, capítulos e emoções): Claude ou OpenAI, a que tiver chave.
   Cuidado com quem usa a chave da OpenAI só para transcrever: ali a IA não liga sozinha (seria um gasto novo sem
   ninguém pedir). Para ligar nesse caso, defina AI_PROVIDER=openai. */
const openaiForAI = cfg.openaiKey && (cfg.provider !== 'openai' || cfg.aiProvider === 'openai' || E.ANALYSIS_LLM === '1');
const AI = cfg.aiProvider === 'off' ? null : pickProvider({ ...cfg, openaiKey: openaiForAI ? cfg.openaiKey : '' });
// Capítulos e emoções pela IA custam uma chamada a mais por pregação; AI_ANALYSIS=0 deixa só os cortes e o texto.
if (AI && E.AI_ANALYSIS !== '0') { cfg.aiAsk = AI.ask; cfg.aiLabel = AI.label; }
const LIB = (...p) => path.join(cfg.dataDir, 'library', ...p);
const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const rawBody = (req, max) => new Promise((ok, bad) => { let n = 0; const c = []; req.on('data', (d) => { n += d.length; if (n > max) { bad(new Error('Arquivo grande demais (máx. 8 MB).')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });
const sniffImage = (b) => (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? '.png' : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? '.jpg' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? '.webp' : null);
const LANGS = { Inglês: 'English', Espanhol: 'Spanish', Francês: 'French', Alemão: 'German', Italiano: 'Italian', Japonês: 'Japanese', Coreano: 'Korean', Chinês: 'Chinese (Simplified)', Russo: 'Russian', Português: 'Brazilian Portuguese' };
async function groqChat(messages) {
  const key = E.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error('A tradução precisa de um modelo de linguagem: defina GROQ_API_KEY.'), { status: 501 });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: E.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b', temperature: 0.2, messages }) });
  if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 160)}`), { status: 502 });
  return (await r.json()).choices[0].message.content;
}
const U = (...p) => path.join(cfg.dataDir, 'uploads', ...p);
const gb = (n) => (n / 1024 ** 3).toFixed(n < 1024 ** 3 / 10 ? 3 : 1).replace('.', ',') + ' GB';
/** Mensagem de arquivo acima do limite: diz o tamanho (quando conhecido), o limite e onde aumentar. */
const tooBig = (size) => `Arquivo grande demais${size ? ' (' + gb(size) + ')' : ''}: o limite atual é de ${gb(cfg.maxUploadBytes)}. Para aumentar, defina MAX_UPLOAD_GB no arquivo de configuração (equipe.env) e abra o app de novo.`;
const manualClip = (title, start, end) => ({ id: 'm' + crypto.randomBytes(6).toString('hex'), title: String(title || 'Corte manual').slice(0, 120), description: 'Corte criado manualmente.', tags: ['Manual'], score: 0, type: 'Manual', start, end, emotion: null, fav: false, hid: false, manual: true, downloaded: false, render: null });
const tools = { ffmpeg: null, whisper: false, ytdlp: null, checked: false };

/* ---------- Utilidades ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => crypto.randomBytes(6).toString('hex');
const okId = (s) => /^[a-z0-9]{6,32}$/.test(s || '');
// Leitura/gravação de JSON resistentes a corrida: no Windows, ler enquanto outro processo renomeia o arquivo
// pode falhar por instantes (EBUSY/EPERM). Só um arquivo realmente ausente (ENOENT) vira o valor padrão.
const readJson = async (f, d) => {
  for (let i = 0; i < 6; i++) {
    try { return JSON.parse(await fsp.readFile(f, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return d; await sleep(25 * (i + 1)); }
  }
  return d;
};
const locks = new Map();
const withLock = (key, fn) => { const prev = locks.get(key) || Promise.resolve(); const run1 = prev.then(fn, fn); const tail = run1.catch(() => {}); locks.set(key, tail); tail.then(() => { if (locks.get(key) === tail) locks.delete(key); }); return run1; };
let wseq = 0;
const writeJson = async (f, o) => {
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const t = `${f}.${process.pid}.${++wseq}.tmp`; await fsp.writeFile(t, JSON.stringify(o));
  for (let i = 0; i < 8; i++) { try { await fsp.rename(t, f); return; } catch (e) { if (i === 7) { await fsp.rm(t, { force: true }); throw e; } await sleep(20 * (i + 1)); } }
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '', err = '';
    const p = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    if (opts.onProc) opts.onProc(p);
    p.stdout.on('data', (d) => { out += d; opts.onStdout && opts.onStdout(d.toString()); });
    p.stderr.on('data', (d) => { err += d; opts.onStderr && opts.onStderr(d.toString()); });
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
  tools.whisper = (await run(cfg.python, ['-c', 'import faster_whisper'])).code === 0;
  if (cfg.ytdlp) tools.ytdlp = [cfg.ytdlp];
  else if ((await run('yt-dlp', ['--version'])).code === 0) tools.ytdlp = ['yt-dlp'];
  else if ((await run(cfg.python, ['-m', 'yt_dlp', '--version'])).code === 0) tools.ytdlp = [cfg.python, '-m', 'yt_dlp'];
  // As versões recentes do yt-dlp precisam de um runtime JavaScript para o YouTube e, por padrão, só procuram o Deno.
  // O Node já está instalado (é ele que roda este servidor), então apontamos para ele. Versões antigas não conhecem a opção.
  if (tools.ytdlp) { const js = ['--js-runtimes', 'node:' + process.execPath]; if ((await run(tools.ytdlp[0], [...tools.ytdlp.slice(1), ...js, '--version'])).code === 0) tools.ytdlp = [...tools.ytdlp, ...js]; }
  // Remoção de música: modelo de separação de voz (Demucs) instalado à parte por install/instalar-voz-ia, na pasta .venv-voz.
  const vozPy = E.DEMUCS_PYTHON || path.join(__dirname, '.venv-voz', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  tools.demucs = fs.existsSync(vozPy) && (await run(vozPy, ['-m', 'demucs', '--help'])).code === 0 ? [vozPy, '-m', 'demucs'] : null;
  tools.checked = true;
}

/* ---------- Autenticação (senha única, uso próprio) ---------- */
const authFile = () => path.join(cfg.dataDir, 'auth.json');
let auth = null;
async function initAuth() {
  auth = await readJson(authFile(), null);
  if (auth && E.INVB_PASSWORD) { // a senha do ambiente sempre vale (permite trocar sem apagar arquivos)
    const salt = crypto.randomBytes(16).toString('hex'); auth.salt = salt; auth.hash = crypto.scryptSync(E.INVB_PASSWORD, salt, 32).toString('hex'); return;
  }
  if (auth) return;
  const pw = E.INVB_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex'), secret: crypto.randomBytes(32).toString('hex') };
  await writeJson(authFile(), auth);
  console.log('\n  ┌─ PRIMEIRO ACESSO ─────────────────────────────');
  console.log(`  │ Senha de acesso: ${E.INVB_PASSWORD ? '(a definida em INVB_PASSWORD)' : pw}`);
  console.log('  │ Guarde-a: ela não será mostrada de novo.');
  console.log('  │ Para trocar: apague data/auth.json e reinicie.');
  console.log('  └───────────────────────────────────────────────\n');
}
const checkPw = (pw) => { const h = crypto.scryptSync(String(pw || ''), auth.salt, 32); return crypto.timingSafeEqual(h, Buffer.from(auth.hash, 'hex')); };
const sign = (exp) => crypto.createHmac('sha256', auth.secret).update(String(exp)).digest('hex');
const makeCookie = () => { const exp = Date.now() + 30 * 864e5; return `${exp}.${sign(exp)}`; };
function authed(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)invb_sid=(\d+)\.([a-f0-9]+)/);
  if (!m || +m[1] < Date.now()) return false;
  const a = Buffer.from(sign(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const fails = new Map();
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message));
const isHttps = (req) => cfg.secureCookies || req.socket.encrypted || (cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https');
const clientIp = (req) => (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;

/* ---------- Armazenamento ---------- */
const metaP = (id) => U(id, 'meta.json');
const getMeta = (id) => readJson(metaP(id), null);
const saveMeta = (m) => writeJson(metaP(m.id), m);
async function listMeta() {
  let ids = []; try { ids = await fsp.readdir(U()); } catch { /* vazio */ }
  const all = await Promise.all(ids.filter(okId).map(getMeta));
  return all.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac']);
const VIDEO = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
const mime = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac' };

/* ---------- Fila de trabalhos (um por vez: CPU) ---------- */
const queue = []; let busy = false;
function enqueue(fn) { queue.push(fn); pump(); }
// Downloads ficam fora dessa fila: são espera de rede, não de processador. Assim um download lento (como o de uma live
// recém-encerrada) não segura a transcrição, a análise nem a exportação de cortes de outros vídeos. Até 3 ao mesmo tempo.
const dlWaiting = []; let dlActive = 0;
function download(fn) {
  const start = () => { dlActive++; Promise.resolve().then(fn).catch((e) => log('erro no download', e && e.message)).finally(() => { dlActive--; const next = dlWaiting.shift(); if (next) next(); }); };
  if (dlActive < 3) start(); else dlWaiting.push(start);
}
async function pump() { if (busy) return; busy = true; while (queue.length) { try { await queue.shift()(); } catch (e) { log('job falhou:', e.message); } } busy = false; }

/* ---------- Original sob demanda (só o link fica salvo) ---------- */
const lastTouch = new Map();
const aiBusy = new Set();
/** Texto de publicação de um corte, já limitado: é o que fica salvo em clips.json. */
const cleanPost = (p) => ({ title: String(p.title || '').trim().slice(0, 120), description: String(p.description || '').trim().slice(0, 2000), hashtags: (Array.isArray(p.hashtags) ? p.hashtags : String(p.hashtags || '').split(/\s+/)).map((h) => String(h).trim()).filter(Boolean).slice(0, 20).map((h) => (h.startsWith('#') ? h : '#' + h).slice(0, 60)), at: Date.now() });
const driveBusy = new Set(), refetchBusy = new Set(); // envios e novos downloads em andamento, por id do envio
function touchUsed(id, force) { const now = Date.now(); if (!force && now - (lastTouch.get(id) || 0) < 60000) return; lastTouch.set(id, now); update(id, { lastUsedAt: now }).catch(() => {}); }
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
const YT_ATTEMPTS = [{ f: YT_FORMAT, fast: true }, { f: YT_ANY, fast: true }, { f: YT_ANY, fast: false }, { f: 'b', fast: false }];
const MEDIA_FILE = /^original\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|aac|opus|flac|ogg|oga)$/i;
/** Remove o original e qualquer sobra de download (pedaços .part, faixas separadas). */
async function clearOriginals(id) { for (const f of await fsp.readdir(U(id)).catch(() => [])) if (f.startsWith('original.')) await fsp.rm(U(id, f), { force: true }); }
async function dropOriginal(m) { await clearOriginals(m.id); for (const f of ['preview.mp4', 'preview.tmp.mp4']) await fsp.rm(U(m.id, f), { force: true }); await update(m.id, { originalGone: true, preview: null }); log('original liberado', m.id, m.name); }
/** O vídeo de um envio concluído não está no disco (apagado pela limpeza, ou sumiu por outro motivo). */
const isGone = (m) => m.status === 'done' && !m.refetching && !!(m.originalGone || !m.file || !fs.existsSync(U(m.id, m.file)));
/** Este computador consegue baixar de novo? Link do YouTube precisa de yt-dlp e ffmpeg instalados. */
const refetchReady = (m) => canRefetch(m) && (m.source !== 'youtube' || !!(tools.ytdlp && tools.ffmpeg));
/** Há corte deste envio sendo exportado ou esperando na fila. */
const exporting = async (id) => [...renders.keys()].some((k) => k.startsWith(id + ':')) || (await readJson(U(id, 'clips.json'), [])).some((c) => c.render && c.render.status === 'rendering');
async function sweepOriginals() {
  if (cfg.keepOriginalMs < 0) return;
  const metas = await listMeta();
  for (const id of staleOriginals(metas, Date.now(), cfg.keepOriginalMs)) {
    const m = metas.find((x) => x.id === id);
    if (!refetchReady(m) || await exporting(id)) continue; // não apaga o que este computador não conseguiria baixar de novo
    try { await dropOriginal(m); } catch (e) { log('falha ao liberar original', id, e.message); }
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
    const st = {}; let last = 0;
    const dl = await run(cmd, [...pre, '--no-playlist', '--newline', ...(YT_ATTEMPTS[k].fast ? YT_FAST : []), '-f', YT_ATTEMPTS[k].f, '--merge-output-format', 'mp4', ...ffLoc, '-o', U(id, 'original.%(ext)s'), url], { onStdout: (d) => { const p = ytProgress(d, st); if (p && onProgress && (Date.now() - last > 1000 || p.pct >= 99)) { last = Date.now(); onProgress(p); } } });
    const all = (await fsp.readdir(U(id))).filter((x) => MEDIA_FILE.test(x));
    const f = dl.code === 0 ? (all.includes('original.mp4') ? 'original.mp4' : all[0]) : null;
    if (f && (await fsp.stat(U(id, f))).size > 0) { if (k) log('yt-dlp: baixou na tentativa', k + 1, id); return f; }
    log('yt-dlp falhou', id, `tentativa ${k + 1} de ${YT_ATTEMPTS.length}`, (dl.err || '').split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 600));
    await clearOriginals(id);
  }
  return null;
}
/**
 * Se o navegador não toca o vídeo baixado (AV1/VP9 ou áudio Opus dentro de mp4), gera em segundo plano uma cópia
 * H.264 + AAC de até 720p só para assistir na tela. Os cortes continuam sendo exportados do original.
 */
async function makePreview(id) {
  try {
    const m = await getMeta(id); if (!m || !m.file || !tools.ffmpeg) return;
    const orig = U(id, m.file), probe = await run(tools.ffmpeg, ['-hide_banner', '-i', orig]);
    if (!needsPreview(probe.err)) { if (m.preview) await update(id, { preview: null }); return; }
    await update(id, { preview: 'making', previewError: null }); log('preparando cópia para o navegador', id);
    if (tools.vtb === undefined) tools.vtb = /h264_videotoolbox/.test((await run(tools.ffmpeg, ['-hide_banner', '-encoders'])).out); // no Mac, usa o chip de vídeo: bem mais rápido
    const enc = tools.vtb ? ['-c:v', 'h264_videotoolbox', '-b:v', '2500k'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26'];
    const tmp = U(id, 'preview.tmp.mp4'), out = U(id, 'preview.mp4');
    const r = await run(tools.ffmpeg, ['-y', '-hide_banner', '-i', orig, '-vf', "scale=-2:'min(720,ih)'", ...enc, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp]);
    if (r.code !== 0) { await fsp.rm(tmp, { force: true }); await update(id, { preview: null, previewError: 'Não consegui preparar a cópia do vídeo para este navegador.' }); return log('cópia para o navegador falhou', id, (r.err || '').split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 400)); }
    await fsp.rename(tmp, out); await update(id, { preview: 'preview.mp4' }); log('cópia para o navegador pronta', id);
  } catch (e) { log('cópia para o navegador falhou', id, e.message); await update(id, { preview: null }).catch(() => {}); }
}
/**
 * Capa do envio (thumb.jpg na pasta dele): a do YouTube quando o vídeo veio de lá; senão, o primeiro quadro do vídeo.
 * É criada na primeira vez que a tela pede e fica guardada. Devolve o caminho, ou null se não houver de onde tirar.
 */
const YTIMG = (E.INVB_YTIMG_BASE || 'https://i.ytimg.com').replace(/\/$/, '');
const ensureThumb = (m) => withLock('thumb:' + m.id, async () => {
  const out = U(m.id, 'thumb.jpg'); if (fs.existsSync(out)) return out;
  const vid = m.source === 'youtube' ? ytId(m.url) : '';
  if (vid) for (const size of ['maxresdefault', 'hqdefault']) { // a maior nem sempre existe
    try { const r = await fetch(`${YTIMG}/vi/${vid}/${size}.jpg`); if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length) { await fsp.writeFile(out, buf); return out; } } } catch { /* sem internet: tenta o quadro do vídeo */ }
  }
  if (m.kind !== 'vid' || !m.file || !tools.ffmpeg) return null;
  const src = [m.file, m.preview].filter((f) => f && f !== 'making' && fs.existsSync(U(m.id, f)))[0]; if (!src) return null;
  const r = await run(tools.ffmpeg, ['-y', '-hide_banner', '-i', U(m.id, src), '-frames:v', '1', '-vf', "scale='min(960,iw)':-2", '-q:v', '4', out]);
  return r.code === 0 && fs.existsSync(out) ? out : null;
});
/** Arquivo que o navegador deve tocar: a cópia compatível, quando existe; senão o original. */
const playable = (m) => (m.preview && m.preview !== 'making' && fs.existsSync(U(m.id, m.preview)) ? m.preview : m.file);
/** Grava em disco o download aberto por openDrive. Devolve o total de bytes. */
async function saveDriveStream(id, file, dlr, onProgress) {
  let n = 0, last = 0; const ws = fs.createWriteStream(U(id, file));
  try {
    const rs = Readable.fromWeb(dlr.res.body);
    rs.on('data', (ch) => { n += ch.length; if (n > cfg.maxUploadBytes) rs.destroy(new Error(tooBig())); const now = Date.now(); if (onProgress && dlr.size && now - last > 1000) { last = now; onProgress(Math.min(99, Math.round((n / dlr.size) * 100))); } });
    await new Promise((ok, bad) => { rs.on('error', bad); ws.on('error', bad); ws.on('finish', ok); rs.pipe(ws); });
    if (!n) throw new Error('Arquivo vazio.');
    return n;
  } catch (e) { ws.destroy(); throw e; }
}
const update = (id, patch) => withLock('meta:' + id, async () => { const m = await getMeta(id); if (!m) return null; Object.assign(m, patch); await saveMeta(m); return m; });

async function mediaDuration(file) {
  const r = await run(tools.ffmpeg, ['-i', file]);
  const m = r.err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

async function transcribeLocal(id, audio, setProgress) {
  const out = U(id, 'whisper.json');
  let errMsg = '';
  const r = await run(cfg.python, [path.join(__dirname, 'worker', 'transcribe.py'), audio, '--out', out, '--model', cfg.whisperModel, '--device', cfg.whisperDevice, '--language', cfg.language], {
    onStdout: (d) => d.split('\n').forEach((l) => { try { const j = JSON.parse(l); if (j.type === 'progress') setProgress(j.pct); if (j.type === 'stage') setProgress(0, j.stage); if (j.type === 'error') errMsg = j.message; } catch { /* ruído */ } }),
  });
  if (r.code !== 0) throw new Error(errMsg || r.err.split('\n').filter(Boolean).pop() || 'falha na transcrição local');
  return readJson(out, null);
}

const fmtWait = (sec) => (sec >= 90 ? `${Math.ceil(sec / 60)} min` : `${Math.ceil(sec)} s`);
// Espera mostrando a contagem regressiva; aborta se o envio for excluído durante a espera.
async function waitCountdown(id, sec, label) {
  const end = Date.now() + sec * 1000;
  for (;;) {
    const left = (end - Date.now()) / 1000;
    if (left <= 0) return;
    if (!(await getMeta(id))) throw new Error('Envio removido durante a espera.');
    label(left);
    await sleep(Math.min(15, left) * 1000);
  }
}

// Transcrição em blocos de 20 min (Groq/OpenAI). Respeita o limite de áudio por hora esperando o tempo
// indicado pela API e RETOMA do bloco em que parou (partial.json), inclusive após reinício ou erro.
async function transcribeOpenAI(id, audio, dur, setProgress) {
  const dir = U(id, 'chunks'); await fsp.mkdir(dir, { recursive: true });
  const seg = 1200, partialFile = U(id, 'partial.json'), C0 = cloud();
  let files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.mp3')).sort();
  if (!files.length) {
    const r = await run(tools.ffmpeg, ['-y', '-i', audio, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', '-f', 'segment', '-segment_time', String(seg), path.join(dir, 'c%03d.mp3')]);
    if (r.code !== 0) throw new Error('ffmpeg falhou ao dividir o áudio');
    files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.mp3')).sort();
  }
  let segments = [], language = '', k0 = 0;
  const part = await readJson(partialFile, null);
  if (part && part.total === files.length && part.model === C0.model) { segments = part.segments; language = part.language; k0 = part.next; log('retomando', id, 'no bloco', k0 + 1, 'de', files.length); }
  const MAX_WAIT = 4 * 3600; let waited = 0;
  for (let k = k0; k < files.length; k++) {
    const C = cloud(), buf = await fsp.readFile(path.join(dir, files[k])), pct = Math.round((k / files.length) * 99);
    let res, tries5xx = 0;
    for (let attempt = 0; ; attempt++) {
      const fd = new FormData();
      fd.append('file', new Blob([buf]), files[k]);
      fd.append('model', C.model); fd.append('response_format', 'verbose_json'); fd.append('temperature', '0');
      fd.append('timestamp_granularities[]', 'word'); fd.append('timestamp_granularities[]', 'segment');
      if (cfg.language !== 'auto') fd.append('language', cfg.language);
      try { res = await fetch(`${C.base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${C.key}` }, body: fd }); }
      catch (e) { if (tries5xx++ < 4) { await sleep(5000 * tries5xx); continue; } throw new Error(`Sem conexão com a ${C.name}.`); }
      if (res.ok) break;
      if (res.status === 429) { // limite de áudio/requisições: espera o que a API pedir e tenta o MESMO bloco de novo
        const ra = +res.headers.get('retry-after');
        const wait = Math.min(3600, ra > 0 ? Math.max(5, ra + 2) : Math.min(300, 30 * (attempt + 1)));
        if (waited + wait > MAX_WAIT) throw new Error(`Limite da ${C.name} persistiu por mais de 4 horas. Use “Tentar de novo” depois: o progresso já feito foi guardado.`);
        waited += wait; log('limite', C.name, 'bloco', k + 1, 'espera', Math.round(wait), 's');
        await waitCountdown(id, wait, (left) => setProgress(pct, `Aguardando limite da ${C.name}: retoma em ${fmtWait(left)} (bloco ${k + 1}/${files.length})`));
        continue;
      }
      if (res.status >= 500 && tries5xx++ < 4) { await sleep(5000 * tries5xx); continue; }
      const txt = (await res.text()).slice(0, 200);
      throw new Error(res.status === 401 ? `Chave da ${C.name} inválida ou sem permissão.` : `${C.name} ${res.status}: ${txt}`);
    }
    const j = await res.json(); language = language || j.language || '';
    const off = k * seg, words = j.words || [];
    for (const s of j.segments || []) segments.push({ start: +(off + s.start).toFixed(2), end: +(off + s.end).toFixed(2), text: String(s.text).trim(), words: words.filter((w) => w.start >= s.start - 0.01 && w.end <= s.end + 0.01).map((w) => ({ w: w.word, s: +(off + w.start).toFixed(2), e: +(off + w.end).toFixed(2) })) });
    await writeJson(partialFile, { total: files.length, next: k + 1, model: C.model, language, segments });
    setProgress(Math.round(((k + 1) / files.length) * 99), `Transcrevendo (bloco ${k + 1}/${files.length})`);
  }
  await fsp.rm(dir, { recursive: true, force: true }); await fsp.rm(partialFile, { force: true });
  return { language, duration: dur, model: cloud().model, segments };
}

/**
 * Cortes automáticos de um envio. Com a chave do Claude, quem escolhe os trechos é a IA; sem a chave, valem os da
 * análise local. O resultado da tentativa fica no meta (aiCuts / aiCutsError) para a tela avisar.
 */
async function autoClips(id, tr, an) {
  // Sem a chave do Claude, valem os trechos da análise local. Com a chave, só entram cortes escolhidos pela IA:
  // se ela falhar, a aba fica vazia e a tela oferece tentar de novo, em vez de preencher com trechos automáticos fracos.
  if (!AI) return an.clips.map((c, i) => ({ id: 'a' + i, ...c, emotion: c.emotion || (an.emotions.find((e) => e.i === c.first) || {}).emotion || null, fav: false, hid: false, manual: false, downloaded: false, render: null }));
  const m = await getMeta(id);
  try {
    const cuts = await suggestCuts({ ask: AI.ask, name: String(m.name || '').replace(/\.[^.]+$/, ''), lines: splitLines(tr.segments), duration: m.duration || 0, count: 6 });
    if (!cuts.length) throw new Error('A IA não encontrou trechos fortes o bastante nesta pregação.');
    await update(id, { aiCuts: true, aiCutsError: null, aiCutsAt: Date.now() }); log('cortes automáticos pela IA', id, cuts.length);
    return toAutoClips(cuts);
  } catch (e) {
    await update(id, { aiCuts: false, aiCutsError: String(e.message || e).slice(0, 300), aiCutsAt: Date.now() }); log('IA falhou nos cortes automáticos', id, e.message);
    return [];
  }
}
async function pipeline(id) {
  const set = (patch) => update(id, patch);
  try {
    const m = await getMeta(id); if (!m) return;
    const orig = U(id, m.file);
    await set({ status: 'processing', stage: 'Extraindo áudio', progress: 0, error: null });
    if (!tools.ffmpeg) throw new Error('ffmpeg não encontrado (defina FFMPEG_PATH ou instale imageio-ffmpeg).');
    const dur = await mediaDuration(orig);
    if (!dur) { const pr = await run(tools.ffmpeg, ['-hide_banner', '-i', orig]); log('ffmpeg não leu', id, m.file, (pr.err || '').split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 600)); throw new Error('Não foi possível ler o áudio deste arquivo.' + (m.source === 'youtube' ? ' O download do YouTube pode ter vindo incompleto; tente de novo.' : '')); }
    const wav = U(id, 'audio.wav');
    if (!isCloud()) {
      const x = await run(tools.ffmpeg, ['-y', '-i', orig, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
      if (x.code !== 0) throw new Error('Não foi possível ler o áudio deste arquivo.');
    }
    await set({ duration: dur, stage: 'Transcrevendo', progress: 0 });
    let last = 0;
    const setProgress = (pct, stage) => { const now = Date.now(); if (stage) set({ stage: stage === 'loading_model' ? 'Carregando modelo (1ª vez baixa o modelo)' : stage, progress: pct }); else { set({ stage: 'Transcrevendo', progress: pct }); } last = now; };
    let tr;
    if (isCloud()) { if (!cloud().key) throw new Error(cfg.provider === 'groq' ? 'GROQ_API_KEY não configurada.' : 'OPENAI_API_KEY não configurada.'); tr = await transcribeOpenAI(id, orig, dur, setProgress); }
    else { if (!tools.whisper) throw new Error('faster-whisper não instalado (pip install faster-whisper) ou use TRANSCRIBE_PROVIDER=openai.'); tr = await transcribeLocal(id, wav, setProgress); }
    if (!tr || !tr.segments) throw new Error('Transcrição vazia.');
    tr.segments = tr.segments.filter((s) => s.text).map((s, i) => ({ id: i, speaker: 'Pessoa 1', ...s }));
    await writeJson(U(id, 'transcript.json'), tr);
    await set({ stage: 'Analisando', progress: 99, language: tr.language, words: tr.segments.reduce((a, s) => a + s.text.split(/\s+/).length, 0) });
    const an = await analyze(cfg, tr, log);
    await writeJson(U(id, 'analysis.json'), an);
    if (!!AI) await set({ stage: 'Sugerindo cortes com IA', progress: 99 });
    const clips = await autoClips(id, tr, an);
    await withLock('clips:' + id, async () => { const old = await readJson(U(id, 'clips.json'), []); await writeJson(U(id, 'clips.json'), [...clips, ...old.filter((c) => c.manual)]); });
    await fsp.rm(U(id, 'whisper.json'), { force: true }); await fsp.rm(wav, { force: true });
    await set({ status: 'done', stage: 'Concluído', progress: 100 });
    log('concluído', id, m.name);
  } catch (e) {
    log('erro no pipeline', id, e.message);
    await update(id, { status: 'error', stage: 'Erro', error: e.message });
  }
}

/* ---------- Cortes (ffmpeg) ---------- */
const srtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
function srtFor(tr, a, b) {
  const lines = []; let n = 1;
  for (const s of tr.segments) { if (s.end <= a || s.start >= b) continue; const st = Math.max(s.start, a) - a, en = Math.min(s.end, b) - a; lines.push(`${n++}\n${srtT(st)} --> ${srtT(Math.max(en, st + 0.4))}\n${s.text}\n`); }
  return lines.join('\n');
}
const FORMATS = { orig: null, '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const CS = require('./public/caption-styles.js');
const hex2ass = (hex, alpha = 0) => { const h = String(hex).replace('#', ''); const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6); return `&H${Math.round(alpha * 255).toString(16).padStart(2, '0')}${b}${g}${r}`.toUpperCase(); };
const tag6 = (hex) => { const h = String(hex).replace('#', ''); return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase(); };
const assT = (t) => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = Math.floor(t % 60), cs = Math.floor((t % 1) * 100); return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
const assEsc = (t) => String(t).replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const num = (v, d = null) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? d : +v);

// Opções do render, saneadas (vêm do navegador).
function cleanOpts(j) {
  const cj = j.captions && typeof j.captions === 'object' ? j.captions : { on: j.captions !== false };
  const ovs = (Array.isArray(j.overlays) ? j.overlays : []).slice(0, 30).map((o) => {
    const b = { id: String(o.id || '').slice(0, 24), x: clamp(num(o.x, 0.5), 0, 1), y: clamp(num(o.y, 0.5), 0, 1), start: num(o.start), end: num(o.end) };
    if (o.type === 'image' && /^[a-z0-9]{6,32}$/.test(o.imgId || '')) return { ...b, type: 'image', imgId: o.imgId, w: clamp(num(o.w, 0.3), 0.02, 1), op: clamp(num(o.op, 1), 0.05, 1) };
    if (o.type === 'text' && String(o.text || '').trim()) return { ...b, type: 'text', text: String(o.text).slice(0, 200), size: clamp(num(o.size, 0.06), 0.02, 0.3), color: isHex(o.color) ? o.color : '#ffffff', font: CS.FONTS.includes(o.font) ? o.font : 'Arial', bold: o.bold !== false, italic: !!o.italic, upper: !!o.upper, box: o.box && isHex(o.box.color) ? { color: o.box.color, alpha: clamp(num(o.box.alpha, 0), 0, 1) } : null, outline: o.outline && isHex(o.outline.color) ? { color: o.outline.color, w: clamp(num(o.outline.w, 2), 0, 10) } : null };
    return null;
  }).filter(Boolean);
  const edits = {}; if (j.edits && typeof j.edits === 'object') Object.entries(j.edits).slice(0, 400).forEach(([k, v]) => { if (/^\d{1,6}$/.test(k) && typeof v === 'string') edits[k] = v.slice(0, 800); });
  return {
    format: Object.prototype.hasOwnProperty.call(FORMATS, j.format) ? j.format : (j.vertical ? '9:16' : 'orig'),
    bw: !!j.bw, hq: !!j.hq, removePauses: !!j.removePauses, audio: !!j.audio, speed: cleanSpeed(j.speed), audioShift: cleanShift(j.audioShift), voice: cleanVoice(j.voice),
    start: num(j.start), end: num(j.end),
    removed: (Array.isArray(j.removed) ? j.removed : []).slice(0, 800).map((r) => [num(r && r[0]), num(r && r[1])]).filter((r) => r[0] !== null && r[1] !== null && r[1] > r[0]),
    edits, overlays: ovs,
    cap: { on: cj.on !== false, style: CS.byName(cj.style).id, size: clamp(+cj.size || 16, 10, 32), pos: ['bottom', 'middle', 'top'].includes(cj.pos) ? cj.pos : 'bottom', upper: typeof cj.upper === 'boolean' ? cj.upper : null, pop: typeof cj.pop === 'boolean' ? cj.pop : null, font: CS.FONTS.includes(cj.font) ? cj.font : null, ow: num(cj.ow) === null ? null : clamp(+cj.ow, 0, 10), shadow: num(cj.shadow) === null ? null : clamp(+cj.shadow, 0, 8) },
  };
}

// Palavras do corte (tempo relativo ao início). Aplica texto editado/traduzido e palavras removidas.
function clipWords(tr, c, opt = {}) {
  const removed = opt.removed || [], edits = opt.edits || {}, out = [];
  const gone = (w) => removed.some(([a, b]) => (w.s + w.e) / 2 >= a && (w.s + w.e) / 2 <= b);
  for (const sg of tr.segments) {
    if (sg.end <= c.start || sg.start >= c.end) continue;
    let ws;
    const spread = (text) => { const parts = text.split(/\s+/).filter(Boolean), tot = parts.reduce((a, x) => a + x.length, 0) || 1; let t0 = sg.start; return parts.map((x) => { const d = ((sg.end - sg.start) * x.length) / tot; const w = { t: x, s: t0, e: t0 + d }; t0 += d; return w; }); };
    if (edits[sg.id] !== undefined) ws = spread(edits[sg.id]);
    else if (sg.words && sg.words.length) ws = sg.words.map((w) => ({ t: String(w.w).trim(), s: w.s, e: w.e }));
    else ws = spread(sg.text);
    for (const w of ws) if (w.t && w.e > c.start && w.s < c.end && !gone(w)) out.push({ t: w.t, s: Math.max(w.s, c.start) - c.start, e: Math.min(w.e, c.end) - c.start, seg: sg.id });
  }
  return out;
}

function buildAss(tr, c, opt, W, H, rel, useIv) {
  const st = CS.byName(opt.cap.style), cp = opt.cap;
  const upper = cp.upper === null ? st.upper : cp.upper, pop = cp.pop === null ? st.pop : cp.pop;
  const ow = (cp.ow === null ? st.ow : cp.ow) * (H / 1080), shadow = (cp.shadow === null ? st.shadow : cp.shadow) * (H / 1080);
  const font = cp.font || st.font, fs = Math.round(H * (cp.size / 288) * st.size);
  const al = { bottom: 2, middle: 5, top: 8 }[cp.pos], mv = cp.pos === 'middle' ? 0 : Math.round(H * (opt.format === '9:16' ? 0.14 : 0.08));
  const box = st.box, primary = st.mode === 'karaoke' ? st.hi : st.color;
  const styles = [`Style: Default,${font},${fs},${hex2ass(primary)},${hex2ass(st.color)},${hex2ass(box ? box.color : st.outline, box ? box.alpha : 0)},${hex2ass(box ? box.color : '#000000', box ? box.alpha : 0.5)},${st.bold ? -1 : 0},${st.italic ? -1 : 0},0,0,100,100,0,0,${box ? 3 : 1},${box ? Math.max(ow, fs * 0.18).toFixed(1) : ow.toFixed(1)},${shadow.toFixed(1)},${al},${Math.round(W * 0.06)},${Math.round(W * 0.06)},${mv},1`];
  const pre = (st.glow ? '\\blur4' : '') + (pop ? '\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)' : '');
  const T = (x) => (upper ? x.toUpperCase() : x);
  const ev = [];
  const push = (a, b, text, layer = 1, style = 'Default', p = pre) => { const A = rel(a), B = rel(b); if (B - A >= 0.04) ev.push(`Dialogue: ${layer},${assT(A)},${assT(B)},${style},,0,0,0,,{${p}}${text}`); };
  if (opt.cap.on) {
    const words = clipWords(tr, c, opt);
    if (st.mode === 'block') {
      const bySeg = new Map(); words.forEach((w) => { if (!bySeg.has(w.seg)) bySeg.set(w.seg, []); bySeg.get(w.seg).push(w); });
      for (const ws of bySeg.values()) push(ws[0].s, ws[ws.length - 1].e + 0.05, assEsc(T(ws.map((w) => w.t).join(' '))));
    } else {
      for (const ws of CS.chunkWords(words, st)) {
        if (st.mode === 'karaoke') {
          const last = ws[ws.length - 1];
          push(ws[0].s, last.e + 0.12, ws.map((w, i) => { const nxt = ws[i + 1], d = Math.max(1, Math.round(((nxt ? nxt.s : w.e) - w.s) * 100)); return `{\\kf${d}}${assEsc(T(w.t))}`; }).join(' '));
          continue;
        }
        ws.forEach((w, i) => {
          const a = w.s, b = ws[i + 1] ? ws[i + 1].s : w.e + 0.12;
          if (st.mode === 'words1') return push(a, b, assEsc(T(w.t)));
          const text = ws.map((x, j) => { const t = assEsc(T(x.t)); if (j !== i) return t;
            if (st.mode === 'boxhl') return `{\\3c${tag6(st.hi)}\\bord${(fs * 0.2).toFixed(1)}}${t}{\\3c${tag6(st.outline)}\\bord${ow.toFixed(1)}}`;
            return `{\\1c${tag6(st.hi)}}${t}{\\1c${tag6(st.color)}}`; }).join(' ');
          push(a, b, text);
        });
      }
    }
  }
  // textos sobre o corte (cada um com seu estilo), acima da legenda
  const d = c.end - c.start;
  opt.overlays.filter((o) => o.type === 'text').forEach((o, i) => {
    const name = `T${i}`, size = Math.round(o.size * H), bx = o.box;
    styles.push(`Style: ${name},${o.font},${size},${hex2ass(o.color)},${hex2ass(o.color)},${hex2ass(bx ? bx.color : (o.outline ? o.outline.color : '#000000'), bx ? bx.alpha : 0)},${hex2ass(bx ? bx.color : '#000000', bx ? bx.alpha : 0.5)},${o.bold ? -1 : 0},${o.italic ? -1 : 0},0,0,100,100,0,0,${bx ? 3 : 1},${bx ? Math.max(size * 0.24, 6).toFixed(1) : (o.outline ? o.outline.w * (H / 1080) : 0).toFixed(1)},0,5,10,10,10,1`);
    const a = o.start === null ? 0 : clamp(o.start, 0, d), b = o.end === null ? d : clamp(o.end, 0, d);
    push(a, b, assEsc(o.upper ? o.text.toUpperCase() : o.text), 2 + i, name, `\\an5\\pos(${Math.round(o.x * W)},${Math.round(o.y * H)})`);
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${styles.join('\n')}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${ev.join('\n')}\n`;
}

// Trechos a manter ao "remover pausas": palavras com folga; junta lacunas curtas (pausa natural).
function keepIntervals(tr, c, gap = 0.5) {
  const d = c.end - c.start, pts = [];
  for (const s of tr.segments) {
    if (s.end <= c.start || s.start >= c.end) continue;
    if (s.words && s.words.length) { for (const w of s.words) if (w.e > c.start && w.s < c.end) pts.push([Math.max(w.s, c.start) - c.start, Math.min(w.e, c.end) - c.start]); }
    else pts.push([Math.max(s.start, c.start) - c.start, Math.min(s.end, c.end) - c.start]);
  }
  pts.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a0, b0] of pts) { const A = Math.max(0, a0 - 0.12), B = Math.min(d, b0 + 0.12), last = out[out.length - 1]; if (last && A - last[1] <= gap) last[1] = Math.max(last[1], B); else out.push([A, B]); }
  return out.filter(([x, y]) => y - x >= 0.2);
}
const subtractRanges = (iv, cuts) => { let cur = iv; for (const [ca, cb] of cuts) { const nx = []; for (const [a, b] of cur) { if (cb <= a || ca >= b) nx.push([a, b]); else { if (ca > a) nx.push([a, ca]); if (cb < b) nx.push([cb, b]); } } cur = nx; } return cur.filter(([a, b]) => b - a >= 0.08); };

const renders = new Map(); // `${id}:${cid}` -> { proc, cancelled }
async function renderClip(id, cid, rawOpt) {
  const opt = cleanOpts(rawOpt || {});
  const m = await getMeta(id); const clips = await readJson(U(id, 'clips.json'), []);
  const c0 = clips.find((x) => x.id === cid); if (!c0) return;
  const key = `${id}:${cid}`, state = { proc: null, cancelled: false }; renders.set(key, state);
  const setR = (r) => withLock('clips:' + id, async () => { const cl = await readJson(U(id, 'clips.json'), []); const t = cl.find((x) => x.id === cid); if (t) { t.render = r; await writeJson(U(id, 'clips.json'), cl); } });
  const runP = (cmd, args, o = {}) => run(cmd, args, { ...o, onProc: (p) => { state.proc = p; } });
  try {
    const dur0 = m.duration || 1e9;
    const c = { ...c0, start: clamp(opt.start === null ? c0.start : opt.start, 0, dur0), end: clamp(opt.end === null ? c0.end : opt.end, 0, dur0) };
    if (!(c.end - c.start >= 1)) throw new Error('Intervalo do corte inválido (mínimo de 1 segundo).');
    const dir = U(id, 'clips'); await fsp.mkdir(dir, { recursive: true });
    const orig = U(id, m.file), audioOnly = m.kind === 'aud' || opt.audio, d = c.end - c.start;
    const out = `${cid}${audioOnly ? '.mp3' : '.mp4'}`;
    const tr = await readJson(U(id, 'transcript.json'), { segments: [] });
    const rm = opt.removed.map(([a, b]) => [a - c.start, b - c.start]);
    let iv = opt.removePauses ? keepIntervals(tr, c) : [[0, d]];
    if (rm.length) iv = subtractRanges(iv, rm);
    const useIv = opt.removePauses || rm.length > 0;
    if (!iv.length) throw new Error('Nada sobrou depois de remover pausas/palavras.');
    const remap = (t) => { let acc = 0; for (const [a0, b0] of iv) { if (t < a0) return acc; if (t <= b0) return acc + (t - a0); acc += b0 - a0; } return acc; };
    const rel = (t) => (useIv ? remap(t) : t);
    const total = iv.reduce((s, [a0, b0]) => s + b0 - a0, 0);
    const fcFile = `${cid}.fc`;
    let aIn = '0:a'; // de onde vem o áudio: do vídeo ou, na remoção de música, do arquivo com a voz separada
    const trims = (video) => iv.map(([a0, b0], i) => `${video ? `[0:v]trim=start=${a0.toFixed(3)}:end=${b0.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` : ''}[${aIn}]atrim=start=${a0.toFixed(3)}:end=${b0.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`).join('') + iv.map((_, i) => `${video ? `[v${i}]` : ''}[a${i}]`).join('') + `concat=n=${iv.length}:v=${video ? 1 : 0}:a=1${video ? '[v][a]' : '[a]'}`;
    const baseIn = ['-y', '-ss', String(c.start), '-t', String(d), '-i', orig];
    // imagens sobre o corte (biblioteca)
    const images = audioOnly ? [] : opt.overlays.filter((o) => o.type === 'image');
    const imgFiles = []; const lib = await readJson(LIB('index.json'), []);
    for (const o of images) { const it = lib.find((x) => x.id === o.imgId); if (it) imgFiles.push({ o, file: LIB(it.id + it.ext) }); }
    const inArgs = [...baseIn, ...imgFiles.flatMap((f) => ['-i', f.file])];
    // Sincronia: o áudio é lido do mesmo arquivo, começando um pouco antes ou depois do vídeo.
    const aStart = Math.max(0, c.start - opt.audioShift);
    // Remover música: separa a voz do trecho com o modelo e usa esse arquivo como o áudio do corte.
    if (opt.voice === 'ia') {
      if (!tools.demucs) throw new Error('A remoção de música não está instalada neste computador. Rode uma vez o arquivo install/instalar-voz-ia e abra o app de novo.');
      const src = `${cid}.src.wav`, sep = `${cid}.sep`;
      const ex = await runP(tools.ffmpeg, ['-y', '-ss', String(aStart), '-t', String(d), '-i', orig, '-vn', '-ac', '2', '-ar', '44100', src], { cwd: dir });
      if (state.cancelled) return void (await setR({ status: 'cancelled' }));
      if (ex.code !== 0) throw new Error('Não consegui ler o áudio do corte para separar a voz.');
      const sp = await runP(tools.demucs[0], [...tools.demucs.slice(1), '--two-stems=vocals', '-n', 'htdemucs', '-o', sep, src], { cwd: dir });
      if (state.cancelled) return void (await setR({ status: 'cancelled' }));
      const voc = path.join(sep, 'htdemucs', `${cid}.src`, 'vocals.wav');
      if (sp.code !== 0 || !fs.existsSync(path.join(dir, voc))) throw new Error('A separação da voz falhou. ' + (sp.err || '').split(/[\r\n]+/).filter(Boolean).slice(-1).join('').slice(0, 200));
      inArgs.push('-i', voc); aIn = `${1 + imgFiles.length}:a`;
    } else if (aStart !== c.start && m.kind !== 'aud') { inArgs.push('-ss', String(aStart), '-t', String(d), '-i', orig); aIn = `${1 + imgFiles.length}:a`; }
    // tamanho final (para a legenda/overlays)
    const fmt = FORMATS[opt.format];
    let W = fmt ? fmt[0] : 0, H = fmt ? fmt[1] : 0;
    if (!audioOnly && !fmt) { const pr = await runP(tools.ffmpeg, ['-i', orig]); const mm = pr.err.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/); W = mm ? Math.round(+mm[1] / 2) * 2 : 1080; H = mm ? Math.round(+mm[2] / 2) * 2 : 1920; }
    const wantCaps = !audioOnly && (opt.cap.on || opt.overlays.some((o) => o.type === 'text'));
    // Velocidade: aplicada no fim, depois da legenda e das imagens, para tudo continuar sincronizado. A voz não muda de tom.
    const fast = opt.speed !== 1;
    const af = fast ? atempo(opt.speed) : '';
    // O filtro vai direto na linha de comando: a opção -filter_complex_script foi retirada do ffmpeg 8 (o que o Homebrew instala hoje).
    // Só um filtro enorme (centenas de trechos) vai por arquivo, pela opção que a versão instalada aceitar.
    const fcArgs = async (fc) => { if (fc.length <= 20000) return ['-filter_complex', fc]; await fsp.writeFile(path.join(dir, fcFile), fc); return tools.ffmpegMajor >= 7 ? ['-/filter_complex', fcFile] : ['-filter_complex_script', fcFile]; };
    const build = async (withSubs) => {
      if (audioOnly) {
        if (useIv) { return [...inArgs, ...(await fcArgs(trims(false) + (af ? `;[a]${af}[ao]` : ''))), '-map', af ? '[ao]' : '[a]', '-c:a', 'libmp3lame', '-b:a', '128k', out]; }
        return [...inArgs, '-vn', ...(aIn !== '0:a' ? ['-map', aIn] : []), ...(af ? ['-af', af] : []), '-c:a', 'libmp3lame', '-b:a', '128k', out];
      }
      const pre = [];
      if (fmt) { const ar = `${W}/${H}`; pre.push(`crop=w='if(gt(iw/ih,${ar}),ih*${ar},iw)':h='if(gt(iw/ih,${ar}),ih,iw/(${ar}))'`, `scale=${W}:${H}`, 'setsar=1'); }
      else pre.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
      if (opt.bw) pre.push('hue=s=0');
      const chain = []; let cur = useIv ? 'v' : '0:v';
      chain.push(`[${cur}]${pre.join(',')}[p0]`); cur = 'p0';
      imgFiles.forEach((f, i) => {
        const o = f.o, w = Math.max(8, Math.round(o.w * W)), a = o.start === null ? 0 : rel(clamp(o.start, 0, d)), b = o.end === null ? 1e6 : rel(clamp(o.end, 0, d));
        chain.push(`[${i + 1}:v]scale=${w}:-1,format=rgba${o.op < 1 ? `,colorchannelmixer=aa=${o.op}` : ''}[im${i}]`);
        chain.push(`[${cur}][im${i}]overlay=x=main_w*${o.x.toFixed(4)}-overlay_w/2:y=main_h*${o.y.toFixed(4)}-overlay_h/2:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[p${i + 1}]`); cur = `p${i + 1}`;
      });
      if (withSubs && wantCaps) { await fsp.writeFile(path.join(dir, `${cid}.ass`), buildAss(tr, c, opt, W, H, rel, useIv)); chain.push(`[${cur}]subtitles=${cid}.ass[vo]`); cur = 'vo'; }
      let aMap = useIv ? '[a]' : aIn === '0:a' ? '0:a?' : aIn, aFilter = [];
      if (fast) { chain.push(`[${cur}]setpts=PTS/${opt.speed}[vs]`); cur = 'vs'; }
      if (af) { if (useIv) { chain.push(`[a]${af}[ao]`); aMap = '[ao]'; } else aFilter = ['-af', af]; }
      const enc = ['-c:v', 'libx264', '-preset', opt.hq ? 'slow' : 'veryfast', '-crf', opt.hq ? '16' : '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', opt.hq ? '256k' : '160k', '-movflags', '+faststart', out];
      const fc = (useIv ? `${trims(true)};` : '') + chain.join(';');
      return [...inArgs, ...(await fcArgs(fc)), '-map', `[${cur}]`, '-map', aMap, ...aFilter, ...enc];
    };
    let captions = wantCaps, r = await runP(tools.ffmpeg, await build(true), { cwd: dir });
    if (state.cancelled) return void (await setR({ status: 'cancelled' }));
    if (r.code !== 0 && wantCaps) { captions = false; r = await runP(tools.ffmpeg, await build(false), { cwd: dir }); } // sem libass/fonte: tenta sem legenda
    if (state.cancelled) return void (await setR({ status: 'cancelled' }));
    if (r.code !== 0) { const ls = r.err.split(/[\r\n]+/).filter(Boolean); throw new Error((ls.filter((l) => /error|invalid|no such|unable|not found|failed|unknown/i.test(l) && !/Conversion failed/i.test(l)).slice(-2).join(' ') || ls.slice(-2).join(' ')).slice(0, 300)); }
    await setR({ status: 'done', file: out, format: audioOnly ? null : opt.format, vertical: opt.format === '9:16', bw: opt.bw, hq: opt.hq, removePauses: opt.removePauses, speed: opt.speed, audioShift: opt.audioShift, voice: opt.voice, removedWords: rm.length, overlays: imgFiles.length + opt.overlays.filter((o) => o.type === 'text').length, captions, audio: audioOnly, seconds: +(total / opt.speed).toFixed(1), at: Date.now() });
  } catch (e) { await setR(state.cancelled ? { status: 'cancelled' } : { status: 'error', error: e.message }); }
  finally { renders.delete(key); for (const f of [`${cid}.src.wav`, `${cid}.sep`]) await fsp.rm(U(id, 'clips', f), { recursive: true, force: true }).catch(() => {}); }
}

/* ---------- HTTP ---------- */
const send = (res, code, obj, headers = {}) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'cache-control': 'no-store', ...headers }); res.end(b); };
const body = (req, max = 2 ** 20) => new Promise((resolve, reject) => { let n = 0; const c = []; req.on('data', (d) => { n += d.length; if (n > max) { reject(new Error('Corpo grande demais')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { resolve(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch { reject(new Error('JSON inválido')); } }); req.on('error', reject); });

function serveFile(req, res, file, type, download) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, { error: 'Arquivo não encontrado' });
    const h = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=0' };
    if (download) h['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
    const rg = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (rg) {
      let s = rg[1] === '' ? Math.max(0, st.size - +rg[2]) : +rg[1], en = rg[1] !== '' && rg[2] ? Math.min(+rg[2], st.size - 1) : st.size - 1;
      if (s > en || s >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, 'content-range': `bytes ${s}-${en}/${st.size}`, 'content-length': en - s + 1 });
      return fs.createReadStream(file, { start: s, end: en }).pipe(res);
    }
    res.writeHead(200, { ...h, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const publicDir = path.join(__dirname, 'public');
const staticTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  if (url === '/') { res.writeHead(302, { location: '/entrar' }); return res.end(); } // sem página inicial: abre direto no login
  const file = path.normalize(path.join(publicDir, decodeURIComponent(url)));
  if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end('Proibido'); }
  fs.stat(file, (e, st) => {
    const f = !e && st.isFile() ? file : path.join(publicDir, 'index.html');
    res.writeHead(200, { 'content-type': staticTypes[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
}

async function publicUpload(m, withData) {
  const id = m.id; const o = { ...m, canRefetch: canRefetch(m), originalGone: isGone(m) };
  if (!withData) return o;
  o.transcript = await readJson(U(id, 'transcript.json'), null);
  if (o.transcript) { o.transcript.lines = splitLines(o.transcript.segments); o.transcript.segments = o.transcript.segments.map(({ words, avg_logprob, ...s }) => s); }
  o.analysis = await readJson(U(id, 'analysis.json'), null);
  o.clips = await readJson(U(id, 'clips.json'), []);
  o.scripts = await readJson(U(id, 'scripts.json'), []);
  return o;
}

async function api(req, res, url, q) {
  const method = req.method, parts = url.split('/').filter(Boolean).slice(1); // sem "api"
  const [a, b, c, d] = parts;
  if (a === 'login' && method === 'POST') {
    const ip = clientIp(req), f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return send(res, 429, { error: 'Muitas tentativas. Aguarde 1 minuto.' });
    const j = await body(req);
    if (!checkPw(j.password)) { f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } fails.set(ip, f); await sleep(400); return send(res, 401, { error: 'Senha incorreta.' }); }
    fails.delete(ip);
    return send(res, 200, { ok: true }, { 'set-cookie': `invb_sid=${makeCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${isHttps(req) ? '; Secure' : ''}` });
  }
  if (a === 'me') return send(res, authed(req) ? 200 : 401, { ok: authed(req) });
  if (!authed(req)) return send(res, 401, { error: 'Não autenticado' });
  if (a === 'logout' && method === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': 'invb_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  if (method !== 'GET' && req.headers['x-invb'] !== '1') return send(res, 403, { error: 'Requisição inválida' });

  if (a === 'status') return send(res, 200, { ffmpeg: !!tools.ffmpeg, whisper: tools.whisper, ytdlp: !!tools.ytdlp, voiceAI: !!tools.demucs, provider: cfg.provider, model: isCloud() ? cloud().model : cfg.whisperModel, driveClientId: cfg.googleClientId, ai: !!AI, driveCuts: !!(cfg.googleClientId && cfg.driveCutsFolder), provider_name: isCloud() ? cloud().name : 'Local', aiName: AI ? AI.label : null, llm: !!AI, llmModel: AI ? AI.label : null, queue: queue.length + (busy ? 1 : 0) });

  if (a === 'uploads') {
    if (!b) {
      if (method === 'GET') return send(res, 200, await listMeta());
      if (method === 'POST') { // corpo bruto do arquivo
        const name = (q.get('name') || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
        const ext = path.extname(name).toLowerCase();
        if (!AUDIO.has(ext) && !VIDEO.has(ext)) return send(res, 415, { error: 'Formato não suportado.' });
        const declared = +req.headers['content-length'] || 0;
        if (declared > cfg.maxUploadBytes) return send(res, 413, { error: tooBig(declared) });
        const id = rid(), file = 'original' + ext; await fsp.mkdir(U(id), { recursive: true });
        let n = 0; const ws = fs.createWriteStream(U(id, file));
        const fail = async (msg, code = 500) => { ws.destroy(); await fsp.rm(U(id), { recursive: true, force: true }); if (!res.headersSent) send(res, code, { error: msg }); };
        req.on('data', (ch) => { n += ch.length; if (n > cfg.maxUploadBytes) { req.destroy(); fail(tooBig(), 413); } });
        req.on('aborted', () => fail('Envio cancelado.'));
        req.pipe(ws);
        ws.on('error', () => fail('Falha ao gravar o arquivo.'));
        ws.on('finish', async () => {
          if (!n) return fail('Arquivo vazio.', 400);
          const m = { id, name, file, size: n, kind: AUDIO.has(ext) ? 'aud' : 'vid', createdAt: Date.now(), status: 'queued', stage: 'Na fila', progress: 0, source: 'upload' };
          await saveMeta(m); enqueue(() => pipeline(id)); send(res, 201, m);
        });
        return;
      }
    }
    if (b === 'youtube' && method === 'POST') {
      const j = await body(req);
      if (!tools.ytdlp) return send(res, 501, { error: 'yt-dlp não está instalado neste computador (pip install yt-dlp). Envie o arquivo diretamente.' });
      if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(j.url || '')) return send(res, 400, { error: 'Link do YouTube inválido.' });
      const id = rid(); await fsp.mkdir(U(id), { recursive: true });
      const m = { id, name: 'Importando do YouTube…', file: '', size: 0, kind: 'vid', createdAt: Date.now(), status: 'processing', stage: 'Baixando do YouTube', progress: 0, source: 'youtube', url: j.url };
      await saveMeta(m);
      download(async () => {
        const [cmd, ...pre] = tools.ytdlp;
        const info = ytInfo((await run(cmd, [...pre, '--no-playlist', '--print', '%(live_status)s\t%(title)s', j.url])).out), t = { out: info.title };
        if (info.live === 'is_live' || info.live === 'is_upcoming') return void (await update(id, { status: 'error', stage: 'Erro', error: info.live === 'is_live' ? 'Esta transmissão ainda está ao vivo. Espere ela terminar para importar.' : 'Esta transmissão ainda não começou.' }));
        // Live que acabou de terminar: o YouTube ainda está processando a gravação e só a entrega devagar, numa conexão.
        const postLive = info.live === 'post_live';
        if (postLive) { log('live recém-encerrada: o YouTube ainda está processando; o download será lento', id); await update(id, { liveNote: true }); }
        const f = await fetchYoutube(id, j.url, (p) => update(id, { stage: (postLive ? 'Live recém-encerrada, download lento. ' : '') + p.label + (p.detail ? ' (' + p.detail + ')' : ''), progress: p.pct }).catch(() => {}), { slowOnly: postLive });
        if (!f) return void (await update(id, { status: 'error', stage: 'Erro', error: postLive ? 'Não consegui baixar esta live recém-encerrada. O YouTube ainda está processando a gravação; tente de novo em algumas horas.' : 'Falha ao baixar o vídeo do YouTube.' }));
        const st = await fsp.stat(U(id, f));
        await update(id, { file: f, size: st.size, name: (t.out.trim() || 'video_do_youtube') + path.extname(f) });
        makePreview(id);
        await update(id, { status: 'queued', stage: 'Na fila para transcrever', progress: 0 });
        enqueue(() => pipeline(id)); // a transcrição e a análise seguem na fila de processamento
      });
      return send(res, 201, m);
    }
    if (b === 'drive' && method === 'POST') {
      const j = await body(req); const ref = parseDriveLink(j.url);
      if (!ref.ok) return send(res, 400, { error: ref.error });
      const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      let dlr; try { dlr = await openDrive(ref, token); } catch (e) { return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin }); }
      const ext = path.extname(dlr.name).toLowerCase();
      if (dlr.size > cfg.maxUploadBytes) { try { dlr.res.body.cancel(); } catch { /* ok */ } return send(res, 413, { error: tooBig(dlr.size) }); }
      const id = rid(), file = 'original' + ext; await fsp.mkdir(U(id), { recursive: true });
      const m = { id, name: dlr.name, file, size: dlr.size, kind: AUDIO.has(ext) ? 'aud' : 'vid', createdAt: Date.now(), status: 'processing', stage: 'Baixando do Google Drive', progress: 0, source: 'drive', url: String(j.url).trim().slice(0, 500) };
      await saveMeta(m); send(res, 201, m);
      (async () => { // download em segundo plano (fora da fila de CPU)
        try {
          const n = await saveDriveStream(id, file, dlr, (pct) => update(id, { progress: pct }));
          await update(id, { size: n, status: 'queued', stage: 'Na fila', progress: 0 }); enqueue(() => pipeline(id));
        } catch (e) { await update(id, { status: 'error', stage: 'Erro', error: 'Falha ao baixar do Google Drive: ' + e.message }); }
      })();
      return;
    }
    if (!okId(b)) return send(res, 404, { error: 'Não encontrado' });
    const m = await getMeta(b); if (!m) return send(res, 404, { error: 'Envio não encontrado' });
    if (!c) {
      if (method === 'GET') return send(res, 200, await publicUpload(m, true));
      if (method === 'PATCH') { const j = await body(req); if (typeof j.name === 'string' && j.name.trim()) m.name = j.name.trim().slice(0, 160); if ('projectId' in j) m.projectId = j.projectId || null; await saveMeta(m); return send(res, 200, m); }
      if (method === 'DELETE') { await fsp.rm(U(b), { recursive: true, force: true }); return send(res, 200, { ok: true }); }
    }
    if (c === 'thumb' && method === 'GET') { const f = await ensureThumb(m); return f ? serveFile(req, res, f, 'image/jpeg') : send(res, 404, { error: 'Sem capa' }); }
    if ((c === 'media' || c === 'audio') && method === 'GET' && (m.refetching || isGone(m))) return send(res, 410, { error: 'A pregação saiu deste computador para liberar espaço. Abra o envio e clique em "Baixar de novo".', originalGone: true, canRefetch: canRefetch(m) });
    if (c === 'media' && method === 'GET') touchUsed(b);
    if (c === 'free' && method === 'POST') { // apaga o original agora; o link continua salvo
      if (!canRefetch(m)) return send(res, 400, { error: 'Este arquivo foi enviado do computador. Como não há link para baixar de novo, ele não é apagado.' });
      if (m.status !== 'done' || m.refetching) return send(res, 409, { error: 'Aguarde o processamento terminar.' });
      if (!refetchReady(m)) return send(res, 501, { error: 'Este computador não tem yt-dlp ou ffmpeg para baixar a pregação de novo, então ela não é apagada.' });
      if (await exporting(b)) return send(res, 409, { error: 'Há um corte sendo exportado. Tente de novo quando terminar.' });
      if (!m.originalGone) await dropOriginal(m);
      return send(res, 200, await getMeta(b));
    }
    if (c === 'refetch' && method === 'POST') { // baixa o original de novo pelo link, sem transcrever outra vez
      if (m.refetching || refetchBusy.has(b)) return send(res, 202, m);
      if (!isGone(m)) return send(res, 200, m);
      if (!canRefetch(m)) return send(res, 400, { error: 'Não há link salvo para baixar este arquivo de novo.' });
      const ok = async (file, size) => { await update(b, { file, size, originalGone: false, refetching: false, refetchError: null, lastUsedAt: Date.now() }); makePreview(b); };
      const fail = (msg) => update(b, { refetching: false, refetchError: msg });
      if (m.source === 'youtube') {
        if (!tools.ytdlp || !tools.ffmpeg) return send(res, 501, { error: 'yt-dlp ou ffmpeg não está instalado neste computador.' });
        const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
        download(async () => { try { const f = await fetchYoutube(b, m.url); if (!f) return void (await fail('Não consegui baixar do YouTube. Confira se o vídeo ainda está no ar.')); await ok(f, (await fsp.stat(U(b, f))).size); } catch (e) { await fail('Falha ao baixar do YouTube: ' + e.message); } });
        return send(res, 202, mm);
      }
      const j = await body(req); const ref = parseDriveLink(m.url); if (!ref.ok) return send(res, 400, { error: ref.error });
      const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      refetchBusy.add(b);
      let dlr; try { dlr = await openDrive(ref, token); } catch (e) { refetchBusy.delete(b); return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin }); }
      const file = 'original' + path.extname(dlr.name).toLowerCase(); const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
      refetchBusy.delete(b); send(res, 202, mm);
      (async () => { try { await ok(file, await saveDriveStream(b, file, dlr)); } catch (e) { await fsp.rm(U(b, file), { force: true }); await fail('Falha ao baixar do Google Drive: ' + e.message); } })();
      return;
    }
    // Som de um trecho, em WAV: a prévia do editor usa para tocar o áudio adiantado ou atrasado em relação à imagem.
    if (c === 'audio' && method === 'GET') {
      const a = Math.max(0, +q.get('start') || 0), e = +q.get('end');
      if (!(e > a) || e - a > 660) return send(res, 400, { error: 'Trecho inválido ou longo demais para a prévia do som.' });
      if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
      touchUsed(b); await fsp.mkdir(U(b, 'clips'), { recursive: true });
      const tmpName = `.som-${crypto.randomBytes(6).toString('hex')}.wav`, tmpFile = U(b, 'clips', tmpName);
      try {
        const r = await run(tools.ffmpeg, ['-y', '-v', 'error', '-ss', String(a), '-t', String(e - a), '-i', U(b, m.file), '-vn', '-ac', '1', '-ar', '32000', '-c:a', 'pcm_s16le', tmpFile]);
        if (r.code !== 0) return send(res, 502, { error: 'Não consegui ler o som deste trecho.' });
        const buf = await fsp.readFile(tmpFile);
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': buf.length, 'cache-control': 'no-store' }); return res.end(buf);
      } finally { await fsp.rm(tmpFile, { force: true }).catch(() => {}); }
    }
    if (c === 'media' && method === 'GET') { const f = q.get('orig') ? m.file : playable(m); return serveFile(req, res, U(b, f), mime[path.extname(f)] || 'application/octet-stream', q.get('orig') ? m.name : undefined); }
    if (c === 'retry' && method === 'POST') { if (m.status === 'processing' || m.status === 'queued') return send(res, 409, { error: 'Já em processamento.' }); await update(b, { status: 'queued', stage: 'Na fila', progress: 0, error: null }); enqueue(() => pipeline(b)); return send(res, 200, { ok: true }); }
    if (c === 'speakers' && method === 'PATCH') {
      const j = await body(req); const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      const to = String(j.to || '').trim().slice(0, 60); if (!to) return send(res, 400, { error: 'Nome vazio' });
      tr.segments.forEach((s) => { if (s.speaker === j.from) s.speaker = to; }); await writeJson(U(b, 'transcript.json'), tr); return send(res, 200, { ok: true });
    }
    if (c === 'segments' && d && method === 'PATCH') { // editar texto de uma fala
      const j = await body(req); const tr = await readJson(U(b, 'transcript.json'), null); const s = tr && tr.segments[+d]; if (!s) return send(res, 404, { error: 'Fala não encontrada' });
      if (typeof j.text === 'string') s.text = j.text.slice(0, 5000); if (typeof j.speaker === 'string') s.speaker = j.speaker.slice(0, 60); await writeJson(U(b, 'transcript.json'), tr); return send(res, 200, { ok: true });
    }
    if (c === 'clips' && d && parts[4] === 'ai' && parts[5] === 'post' && method === 'POST') { // título, descrição e hashtags do corte, pelo Claude
      if (!AI) return send(res, 501, { error: 'Os recursos de IA não estão ativos neste computador.' });
      const cl = (await readJson(U(b, 'clips.json'), [])).find((x) => x.id === d); if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
      const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      if (aiBusy.has(b + ':' + d)) return send(res, 409, { error: 'O texto deste corte já está sendo gerado.' });
      const text = splitLines(tr.segments).filter((l) => l.end > cl.start && l.start < cl.end).map((l) => l.text).join(' ');
      aiBusy.add(b + ':' + d);
      try {
        const post = cleanPost(await describeCut({ ask: AI.ask, name: m.name.replace(/\.[^.]+$/, ''), text, seconds: cl.end - cl.start }));
        await withLock('clips:' + b, async () => { const l = await readJson(U(b, 'clips.json'), []); const t = l.find((x) => x.id === d); if (t) { t.post = post; await writeJson(U(b, 'clips.json'), l); } });
        return send(res, 200, { post });
      } catch (e) { log('erro na IA', b, d, e.message); return send(res, e.status === 401 ? 502 : e.status || 502, { error: e.message }); }
      finally { aiBusy.delete(b + ':' + d); }
    }
    if (c === 'clips' && d && parts[4] === 'drive' && method === 'POST') { // envia o corte pronto para a pasta da equipe
      if (!cfg.driveCutsFolder) return send(res, 501, { error: 'Pasta da equipe não configurada (DRIVE_CUTS_FOLDER_ID).' });
      const j = await body(req); const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      if (!token) return send(res, 403, { error: 'Entre com o Google para enviar ao Drive.', needsLogin: true });
      const cl = (await readJson(U(b, 'clips.json'), [])).find((x) => x.id === d); if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
      if (!cl.render || cl.render.status !== 'done') return send(res, 409, { error: 'Exporte o corte antes de enviar ao Drive.' });
      if (driveBusy.has(b)) return send(res, 409, { error: 'Já há um envio ao Drive em andamento para esta pregação. Aguarde terminar.' });
      driveBusy.add(b);
      const clean = (s, fb) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 80) || fb;
      const ext = path.extname(cl.render.file), file = U(b, 'clips', cl.render.file);
      try {
        const folder = await ensureFolder(token, cfg.driveCutsFolder, clean(m.name.replace(/\.[^.]+$/, ''), 'Culto'));
        const up = await uploadFile(token, { folderId: folder, name: clean(cl.title, 'corte') + ext, filePath: file, mime: mime[ext] || 'application/octet-stream' });
        const drive = { link: up.webViewLink, at: Date.now() };
        await withLock('clips:' + b, async () => { const l = await readJson(U(b, 'clips.json'), []); const t = l.find((x) => x.id === d); if (t) { t.drive = drive; delete t.driveError; await writeJson(U(b, 'clips.json'), l); } });
        return send(res, 200, { webViewLink: up.webViewLink, drive });
      } catch (e) { log('erro ao enviar ao Drive', b, d, e.message, e.reason || '', e.detail || '');
        // O motivo fica guardado no corte: aparece no cartão e dá para conferir depois, sem depender do aviso na tela.
        const driveError = { msg: String(e.message || '').slice(0, 400), google: [e.status, e.reason, e.detail].filter(Boolean).join(' | ').slice(0, 400), at: Date.now() };
        await withLock('clips:' + b, async () => { const l = await readJson(U(b, 'clips.json'), []); const t = l.find((x) => x.id === d); if (t) { t.driveError = driveError; await writeJson(U(b, 'clips.json'), l); } }).catch(() => {}); return send(res, e.status === 401 ? 403 : e.status || 502, { error: e.message, needsLogin: !!e.needsLogin, wrongAccount: !!e.wrongAccount }); }
      finally { driveBusy.delete(b); }
    }
    if (c === 'clips') {
      await withLock('clips:' + b, async () => {
      let clips = await readJson(U(b, 'clips.json'), []);
      if (!d && method === 'GET') return send(res, 200, clips);
      if (!d && method === 'POST') {
        const j = await body(req); const dur = m.duration || 0; const st = Math.max(0, +j.start || 0), en = Math.min(dur || 1e9, +j.end || 0);
        if (!(en - st >= 3)) return send(res, 400, { error: 'Corte precisa ter ao menos 3 segundos.' });
        const cl = manualClip(j.title, st, en);
        clips.push(cl); await writeJson(U(b, 'clips.json'), clips); return send(res, 201, cl);
      }
      if (d === 'bulk' && !parts[4] && method === 'POST') { // lista de minutagens colada (ex.: sugestões do Claude)
        const j = await body(req); const r = parseCutList(j.text, m.duration || 0);
        const created = r.cuts.map((c) => manualClip(c.title, c.start, c.end));
        if (created.length) { clips.push(...created); await writeJson(U(b, 'clips.json'), clips); }
        return send(res, 201, { created, rejected: r.rejected, adjusted: r.adjusted });
      }
      const cl = clips.find((x) => x.id === d); if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
      if (!parts[4] && method === 'PATCH') { const j = await body(req); for (const k of ['fav', 'hid']) if (typeof j[k] === 'boolean') cl[k] = j[k]; if (typeof j.title === 'string' && j.title.trim()) cl.title = j.title.trim().slice(0, 120); if (+j.start >= 0 && +j.end > +j.start) { cl.start = +j.start; cl.end = +j.end; cl.render = null; delete cl.drive; delete cl.post; if (cl.editor) { delete cl.editor.start; delete cl.editor.end; cl.editor.removed = []; } }
        // Edição salva do corte (formato, legenda, velocidade, trechos removidos...): o editor reabre do jeito que ficou.
        if (j.editor === null) delete cl.editor; else if (j.editor && typeof j.editor === 'object' && !Array.isArray(j.editor) && JSON.stringify(j.editor).length <= 400000) cl.editor = { ...j.editor, at: Date.now() };
        if (j.post && typeof j.post === 'object') cl.post = cleanPost(j.post); await writeJson(U(b, 'clips.json'), clips); return send(res, 200, cl); }
      if (!parts[4] && method === 'DELETE') { await writeJson(U(b, 'clips.json'), clips.filter((x) => x.id !== d)); return send(res, 200, { ok: true }); }
      if (parts[4] === 'render' && parts[5] === 'cancel' && method === 'POST') {
        const stt = renders.get(`${b}:${d}`); if (stt) { stt.cancelled = true; try { stt.proc && stt.proc.kill(); } catch { /* ok */ } }
        return send(res, 200, { ok: true });
      }
      if (parts[4] === 'render' && method === 'POST') {
        if (!tools.ffmpeg) return send(res, 501, { error: 'ffmpeg indisponível.' });
        if (m.refetching || isGone(m)) return send(res, 410, { error: 'A pregação saiu deste computador para liberar espaço. Abra o envio e clique em "Baixar de novo".', originalGone: true, canRefetch: canRefetch(m) });
        touchUsed(b, true);
        const j = await body(req); cl.render = { status: 'rendering' }; delete cl.drive; await writeJson(U(b, 'clips.json'), clips);
        enqueue(() => renderClip(b, d, j)); return send(res, 202, cl);
      }
      if (parts[4] === 'file' && method === 'GET') {
        if (!cl.render || cl.render.status !== 'done') return send(res, 404, { error: 'Corte ainda não renderizado.' });
        cl.downloaded = true; await writeJson(U(b, 'clips.json'), clips);
        return serveFile(req, res, U(b, 'clips', cl.render.file), mime[path.extname(cl.render.file)], `${(cl.title || 'corte').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'corte'}${path.extname(cl.render.file)}`);
      }
    
        if (!res.writableEnded) send(res, 404, { error: 'Rota não encontrada' });
      });
      return;
    }
    if (c === 'ai' && d === 'cuts' && method === 'POST') { // sugestões de corte pelo Claude, só para quem tem a chave
      if (!AI) return send(res, 501, { error: 'Os recursos de IA não estão ativos neste computador.' });
      if (aiBusy.has(b)) return send(res, 409, { error: 'Já há uma análise com IA em andamento para esta pregação.' });
      const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      const j = await body(req); aiBusy.add(b);
      try {
        const cuts = await suggestCuts({ ask: AI.ask, name: m.name, lines: splitLines(tr.segments), duration: m.duration || 0, count: j.count });
        const created = toAutoClips(cuts, 'i'); // vão para a aba Automáticos; a aba Manuais é só do que a pessoa cria
        if (created.length) await withLock('clips:' + b, async () => { const l = await readJson(U(b, 'clips.json'), []); await writeJson(U(b, 'clips.json'), [...l, ...created]); });
        log('IA sugeriu cortes', b, created.length);
        return send(res, 201, { created });
      } catch (e) { log('erro na IA', b, e.message); return send(res, e.status === 401 ? 502 : e.status || 502, { error: e.message }); } // 401 da API do Claude não pode derrubar a sessão do app
      finally { aiBusy.delete(b); }
    }
    if (c === 'claude' && method === 'GET') { // transcrição em linhas curtas, pronta para colar no Claude
      const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      return send(res, 200, { text: buildPrompt(m.name, splitLines(tr.segments)) });
    }
    if (c === 'words' && method === 'GET') { // palavras (com tempo) de um trecho, para a prévia da legenda
      const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      const st0 = Math.max(0, +q.get('start') || 0), ws0 = clipWords(tr, { start: st0, end: +q.get('end') || 1e9 });
      return send(res, 200, q.get('abs') ? ws0.map((w) => ({ ...w, s: +(w.s + st0).toFixed(3), e: +(w.e + st0).toFixed(3) })) : ws0);
    }
    if (c === 'scripts') {
      const sc = await readJson(U(b, 'scripts.json'), []);
      if (method === 'POST' && !d) {
        const j = await body(req); const mins = Math.max(1, Math.min(60, +j.mins || 3)), clips = await readJson(U(b, 'clips.json'), []), tr = await readJson(U(b, 'transcript.json'), null);
        if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
        // seleção por nota até a duração pedida (sem IA); com LLM, ver README para evoluir
        const picked = []; let tot = 0; for (const cl of [...clips].filter((x) => !x.hid).sort((x, y) => y.score - x.score)) { if (tot >= mins * 60) break; picked.push(cl); tot += cl.end - cl.start; }
        picked.sort((x, y) => x.start - y.start);
        const item = { id: rid(), mins, brief: String(j.brief || '').slice(0, 500), mode: 'selecao-por-nota', createdAt: Date.now(), items: picked.map((cl) => ({ start: cl.start, end: cl.end, title: cl.title, text: tr.segments.filter((s) => s.start >= cl.start - 0.5 && s.end <= cl.end + 0.5).map((s) => s.text).join(' ') })) };
        sc.push(item); await writeJson(U(b, 'scripts.json'), sc); return send(res, 201, item);
      }
      if (method === 'DELETE' && d) { await writeJson(U(b, 'scripts.json'), sc.filter((x) => x.id !== d)); return send(res, 200, { ok: true }); }
    }
    if (c === 'reanalyze' && method === 'POST') {
      const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      enqueue(async () => { const an = await analyze(cfg, tr, log); await writeJson(U(b, 'analysis.json'), an); const fresh = await autoClips(b, tr, an); await withLock('clips:' + b, async () => { const old = await readJson(U(b, 'clips.json'), []); await writeJson(U(b, 'clips.json'), [...fresh, ...old.filter((x) => x.manual)]); }); });
      return send(res, 202, { ok: true });
    }
  }

  if (a === 'library') {
    const idx = await readJson(LIB('index.json'), []);
    if (!b && method === 'GET') return send(res, 200, idx);
    if (!b && method === 'POST') {
      const name = (q.get('name') || 'imagem').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const buf = await rawBody(req, 8 * 1024 * 1024); const ext = sniffImage(buf);
      if (!buf.length || !ext) return send(res, 415, { error: 'Use uma imagem PNG, JPEG ou WebP (até 8 MB, só imagem parada).' });
      const id = rid(); await fsp.mkdir(LIB(), { recursive: true }); await fsp.writeFile(LIB(id + ext), buf);
      const it = { id, name, ext, size: buf.length, createdAt: Date.now() }; idx.push(it); await writeJson(LIB('index.json'), idx); return send(res, 201, it);
    }
    if (b && /^[a-z0-9]{6,32}$/.test(b)) {
      const it = idx.find((x) => x.id === b); if (!it) return send(res, 404, { error: 'Imagem não encontrada' });
      if (c === 'file' && method === 'GET') return serveFile(req, res, LIB(it.id + it.ext), IMG_EXT[it.ext]);
      if (!c && method === 'DELETE') { await fsp.rm(LIB(it.id + it.ext), { force: true }); await writeJson(LIB('index.json'), idx.filter((x) => x.id !== b)); return send(res, 200, { ok: true }); }
    }
  }
  if (a === 'translate' && method === 'POST') {
    const j = await body(req, 2 ** 20); const lang = LANGS[j.lang]; if (!lang) return send(res, 400, { error: 'Idioma não suportado.' });
    const items = (Array.isArray(j.texts) ? j.texts : []).slice(0, 300).filter((t) => t && /^\d{1,6}$/.test(String(t.id)) && typeof t.text === 'string').map((t) => ({ id: String(t.id), text: t.text.slice(0, 800) }));
    if (!items.length) return send(res, 400, { error: 'Nada para traduzir.' });
    const out = {};
    try {
      for (let i = 0; i < items.length; i += 40) {
        const part = items.slice(i, i + 40);
        const ans = await groqChat([{ role: 'system', content: `Você é um tradutor profissional de legendas. Traduza cada item para ${lang}, mantendo o sentido e o tom, sem acrescentar nada. Responda SOMENTE um array JSON de strings, na mesma ordem e com a mesma quantidade de itens.` }, { role: 'user', content: JSON.stringify(part.map((t) => t.text)) }]);
        const m = ans.match(/\[[\s\S]*\]/); let arr; try { arr = JSON.parse(m ? m[0] : ans); } catch { arr = null; }
        if (!Array.isArray(arr) || arr.length !== part.length) throw Object.assign(new Error('A tradução voltou em formato inesperado. Tente de novo.'), { status: 502 });
        part.forEach((t, k) => { out[t.id] = String(arr[k]).slice(0, 800); });
      }
    } catch (e) { return send(res, e.status || 502, { error: e.message }); }
    return send(res, 200, { lang: j.lang, translations: out });
  }
  const listFile = (n) => path.join(cfg.dataDir, n + '.json');
  if ((a === 'projects' || a === 'templates')) {
    const f = listFile(a), list = await readJson(f, []);
    if (method === 'GET' && !b) return send(res, 200, list);
    if (method === 'POST' && !b) { const j = await body(req); const name = String(j.name || '').trim().slice(0, 80); if (!name) return send(res, 400, { error: 'Nome vazio' }); const it = { id: rid(), name, createdAt: Date.now(), ...(a === 'templates' ? { css: String(j.css || '').slice(0, 400), config: j.config && typeof j.config === 'object' ? cleanOpts({ captions: j.config }).cap : undefined } : {}) }; list.push(it); await writeJson(f, list); return send(res, 201, it); }
    if (method === 'DELETE' && b) { await writeJson(f, list.filter((x) => x.id !== b)); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), url = u.pathname;
    if (url === '/healthz') return send(res, 200, { ok: true });
    if (url.startsWith('/api/')) return await api(req, res, url, u.searchParams);
    return serveStatic(req, res, url);
  } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message }); else res.end(); }
});
server.requestTimeout = 0; server.headersTimeout = 60000;

(async () => {
  await fsp.mkdir(cfg.dataDir, { recursive: true });
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(cfg.host);
  if (!loopback && !E.INVB_PASSWORD && !fs.existsSync(authFile())) { console.error('ERRO: o servidor está exposto na rede (HOST=' + cfg.host + '). Defina INVB_PASSWORD (senha forte) antes de iniciar.'); process.exit(1); }
  if (!loopback && E.INVB_PASSWORD && E.INVB_PASSWORD.length < 10) { console.error('ERRO: INVB_PASSWORD precisa ter ao menos 10 caracteres.'); process.exit(1); }
  await initAuth(); await detectTools();
  // trabalhos interrompidos por reinício
  for (const m of await listMeta()) if (['processing', 'queued'].includes(m.status) && m.file) { await update(m.id, { status: 'error', stage: 'Erro', error: 'Interrompido por reinício do servidor. Use “Tentar de novo”: a transcrição retoma de onde parou.' }); }
  // Um novo download interrompido por reinício não deixa o envio preso em "baixando".
  for (const m of await listMeta()) if (m.preview === 'making') { await update(m.id, { preview: null }); makePreview(m.id); }
  for (const m of await listMeta()) if (m.refetching) await update(m.id, { refetching: false, refetchError: 'O download foi interrompido. Clique em "Baixar de novo".' });
  for (const m of await listMeta()) if (m.status === 'done' && !m.lastUsedAt) await update(m.id, { lastUsedAt: Date.now() });
  await sweepOriginals().catch((e) => log('falha na limpeza de originais', e.message));
  setInterval(() => sweepOriginals().catch((e) => log('falha na limpeza de originais', e.message)), 6 * 3600000).unref();
  server.listen(cfg.port, cfg.host, () => {
    console.log(`INVB Studio em http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`);
    console.log(`  ffmpeg: ${tools.ffmpeg || 'NÃO ENCONTRADO'} | transcrição: ${isCloud() ? cloud().name + ' ' + cloud().model + (cloud().key ? '' : ' (SEM CHAVE)') : cfg.provider}${cfg.provider === 'local' ? ` (faster-whisper ${tools.whisper ? 'ok' : 'AUSENTE'}, modelo ${cfg.whisperModel})` : ''} | IA: ${AI ? AI.label : 'desligada (sem chave do Claude ou da OpenAI)'} | yt-dlp: ${tools.ytdlp ? 'ok' : 'ausente'}`);
  });
})();
