// Testes de ponta a ponta das rotas novas: sobem o servidor de verdade com uma pasta de dados temporária.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..'), PW = 'senha-de-teste-123', DAY = 86400000;
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

/** Cria um envio já concluído na pasta de dados. `original: false` simula o vídeo ausente. */
function seed(dataDir, id, meta = {}, { clips = [], original = true } = {}) {
  const dir = path.join(dataDir, 'uploads', id); fs.mkdirSync(dir, { recursive: true });
  const m = { id, name: 'Pregação', file: 'original.mp4', size: 4, kind: 'vid', createdAt: Date.now(), status: 'done', stage: 'Concluído', progress: 100, source: 'youtube', url: 'https://www.youtube.com/watch?v=abc', duration: 600, ...meta };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ language: 'pt', segments: [{ id: 0, speaker: 'Pessoa 1', start: 0, end: 2, text: 'olá mundo', words: [{ w: 'olá', s: 0, e: 1 }, { w: 'mundo', s: 1, e: 2 }] }] }));
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ emotions: [], chapters: [], clips: [] }));
  fs.writeFileSync(path.join(dir, 'clips.json'), JSON.stringify(clips));
  if (original) fs.writeFileSync(path.join(dir, 'original.mp4'), 'fake');
  return dir;
}

/** Sobe o servidor. `env` acrescenta variáveis; `tools: false` esconde ffmpeg e yt-dlp do PATH. */
async function boot(t, dataDir, { env = {}, tools = true } = {}) {
  const port = await freePort();
  const fakeYt = path.join(dataDir, 'yt-dlp-falso.js'); fs.writeFileSync(fakeYt, 'process.exit(1)'); // "instalado", mas todo download falha
  const base = { ...process.env, NODE_ENV: '', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, INVB_PASSWORD: PW, PYTHON: 'python-inexistente', ...env };
  if (tools) base.YTDLP_PATH = base.YTDLP_PATH || process.execPath; else { base.PATH = path.dirname(process.execPath); delete base.YTDLP_PATH; delete base.FFMPEG_PATH; }
  const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: base, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  t.after(() => { p.kill(); });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url + '/healthz')).ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 50)); if (i === 99) throw new Error('servidor não subiu:\n' + out); }
  const login = await fetch(url + '/api/login', { method: 'POST', headers: { 'x-invb': '1', 'content-type': 'application/json' }, body: JSON.stringify({ password: PW }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const api = async (p2, o = {}) => { const r = await fetch(url + '/api' + p2, { method: o.method || (o.json !== undefined ? 'POST' : 'GET'), headers: { 'x-invb': '1', cookie, ...(o.json !== undefined ? { 'content-type': 'application/json' } : {}) }, body: o.json !== undefined ? JSON.stringify(o.json) : undefined }); let j = null; try { j = await r.json(); } catch { /* sem corpo */ } return { status: r.status, body: j }; };
  return { api, log: () => out };
}
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'invb-test-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const has = (dir, f) => fs.existsSync(path.join(dir, f));
const meta = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const clip = (o = {}) => ({ id: 'm111111111111', title: 'Corte', start: 10, end: 40, manual: true, fav: false, hid: false, render: { status: 'done', file: 'm111111111111.mp4', at: 1 }, ...o });

test('mudar o tempo de um corte já enviado ao Drive limpa a marca "No Drive"', async (t) => {
  const d = tmp(t); seed(d, 'aaaaaaaaaaaa', {}, { clips: [clip({ drive: { link: 'https://drive.google.com/file/d/x/view', at: 2 } })] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/aaaaaaaaaaaa/clips/m111111111111', { method: 'PATCH', json: { start: 12, end: 44 } });
  assert.equal(r.status, 200);
  const [c] = (await s.api('/uploads/aaaaaaaaaaaa/clips')).body;
  assert.equal(c.start, 12);
  assert.equal(c.drive, undefined);
});

test('renomear um corte não mexe na marca "No Drive"', async (t) => {
  const d = tmp(t); seed(d, 'aaaaaaaaaaaa', {}, { clips: [clip({ drive: { link: 'https://drive.google.com/file/d/x/view', at: 2 } })] });
  const s = await boot(t, d);
  await s.api('/uploads/aaaaaaaaaaaa/clips/m111111111111', { method: 'PATCH', json: { title: 'Outro nome' } });
  assert.ok((await s.api('/uploads/aaaaaaaaaaaa/clips')).body[0].drive);
});

test('ao atualizar o app, pregações antigas sem registro de uso não são apagadas no primeiro início', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'bbbbbbbbbbbb', { createdAt: Date.now() - 30 * DAY });
  await boot(t, d);
  assert.ok(has(dir, 'original.mp4'), 'o original foi apagado');
  assert.ok(meta(dir).lastUsedAt > Date.now() - 60000);
  assert.ok(!meta(dir).originalGone);
});

test('sem uso há 8 dias, o original é apagado e o resto fica', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'cccccccccccc', { createdAt: Date.now() - 30 * DAY, lastUsedAt: Date.now() - 8 * DAY });
  const s = await boot(t, d);
  assert.ok(!has(dir, 'original.mp4'));
  assert.ok(has(dir, 'transcript.json') && has(dir, 'clips.json'));
  const u = (await s.api('/uploads/cccccccccccc')).body;
  assert.equal(u.originalGone, true); assert.equal(u.canRefetch, true); assert.equal(u.transcript.lines.length, 1);
});

test('sem yt-dlp/ffmpeg neste computador, a limpeza não apaga o que não daria para baixar de novo', async (t) => {
  const d = tmp(t); const dir = seed(d, 'dddddddddddd', { createdAt: Date.now() - 30 * DAY, lastUsedAt: Date.now() - 8 * DAY });
  const s = await boot(t, d, { tools: false });
  assert.ok(has(dir, 'original.mp4'), 'o original foi apagado');
  const r = await s.api('/uploads/dddddddddddd/free', { json: {} });
  assert.equal(r.status, 501);
  assert.ok(has(dir, 'original.mp4'));
});

test('"liberar espaço" recusa enquanto há corte na fila de exportação', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'eeeeeeeeeeee', {}, { clips: [clip({ render: { status: 'rendering' } })] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/eeeeeeeeeeee/free', { json: {} });
  assert.equal(r.status, 409);
  assert.ok(has(dir, 'original.mp4'));
});

test('vídeo sumiu do disco sem a marca de "apagado": a tela é avisada e "baixar de novo" tenta de verdade', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'ffffffffffff', {}, { original: false });
  const s = await boot(t, d);
  const u = (await s.api('/uploads/ffffffffffff')).body;
  assert.equal(u.originalGone, true); assert.equal(u.canRefetch, true);
  assert.equal((await s.api('/uploads/ffffffffffff/media')).status, 410);
  const r = await s.api('/uploads/ffffffffffff/refetch', { json: {} });
  assert.equal(r.status, 202);
  // o yt-dlp falso falha: o envio volta a ficar disponível para nova tentativa, com a mensagem de erro
  let m; for (let i = 0; i < 80; i++) { m = (await s.api('/uploads/ffffffffffff')).body; if (!m.refetching) break; await new Promise((r2) => setTimeout(r2, 50)); }
  assert.equal(m.refetching, false); assert.match(m.refetchError, /YouTube/); assert.equal(m.originalGone, true);
  assert.ok(has(dir, 'transcript.json'));
});

test('download do YouTube que deixa só pedaços não registra arquivo parcial como original', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'gggggggggggg', { originalGone: true }, { original: false });
  fs.writeFileSync(path.join(dir, 'original.f137.mp4.part'), 'pedaço'); fs.writeFileSync(path.join(dir, 'original.f251.webm'), 'só áudio de tentativa antiga');
  const s = await boot(t, d);
  assert.equal((await s.api('/uploads/gggggggggggg/refetch', { json: {} })).status, 202);
  let m; for (let i = 0; i < 80; i++) { m = (await s.api('/uploads/gggggggggggg')).body; if (!m.refetching) break; await new Promise((r2) => setTimeout(r2, 50)); }
  assert.equal(m.originalGone, true); assert.match(m.refetchError || '', /YouTube/);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('original.')), []);
});

test('arquivo enviado do computador nunca é apagado pela limpeza nem pelo "liberar espaço"', async (t) => {
  const d = tmp(t); const dir = seed(d, 'hhhhhhhhhhhh', { source: 'upload', url: undefined, createdAt: Date.now() - 400 * DAY, lastUsedAt: Date.now() - 400 * DAY });
  const s = await boot(t, d);
  assert.ok(has(dir, 'original.mp4'));
  assert.equal((await s.api('/uploads/hhhhhhhhhhhh/free', { json: {} })).status, 400);
  assert.ok(has(dir, 'original.mp4'));
});

test('colar minutagens cria os cortes válidos e devolve as linhas recusadas', async (t) => {
  const d = tmp(t); seed(d, 'iiiiiiiiiiii');
  const s = await boot(t, d);
  const r = await s.api('/uploads/iiiiiiiiiiii/clips/bulk', { json: { text: 'Sugestões:\n01:00 - 02:00 Um\nCorte 2: 03:00 - 04:00 Dois\n20:00 - 21:00 Fora' } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.created.map((c) => [c.title, c.start, c.end, c.manual]), [['Um', 60, 120, true], ['Dois', 180, 240, true]]);
  assert.deepEqual(r.body.rejected.map((x) => x.reason), ['Não encontrei início e fim.', 'O início passa do fim do vídeo.']);
  assert.equal((await s.api('/uploads/iiiiiiiiiiii/clips')).body.length, 2);
});

// --- yt-dlp recente precisa de um runtime JavaScript; o app aponta para o Node que já está instalado ---
const fakeYtdlp = (dir, { acceptsFlag }) => {
  const f = path.join(dir, 'yt-dlp-espiao.sh'), log = path.join(dir, 'ytdlp-args.log');
  fs.writeFileSync(f, `#!/bin/bash\nfor a in "$@"; do if [ "$a" = "--js-runtimes" ] && [ "${acceptsFlag ? 1 : 0}" = "0" ]; then echo "no such option: --js-runtimes" >&2; exit 2; fi; done\nfor a in "$@"; do if [ "$a" = "--version" ]; then echo 2026.01.01; exit 0; fi; done\necho "$@" >> "${log}"\nexit 1\n`, { mode: 0o755 });
  return { f, log };
};
const untilNotRefetching = async (s, id) => { let m; for (let i = 0; i < 80; i++) { m = (await s.api('/uploads/' + id)).body; if (!m.refetching) break; await new Promise((r) => setTimeout(r, 50)); } return m; };

test('o download do YouTube usa o Node como runtime JavaScript do yt-dlp', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'jjjjjjjjjjjj', { originalGone: true }, { original: false });
  const y = fakeYtdlp(d, { acceptsFlag: true });
  const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
  await s.api('/uploads/jjjjjjjjjjjj/refetch', { json: {} }); await untilNotRefetching(s, 'jjjjjjjjjjjj');
  const args = fs.readFileSync(y.log, 'utf8');
  assert.match(args, /--js-runtimes node:\S+/);
  assert.match(args, /https:\/\/www\.youtube\.com\/watch\?v=abc/);
});

test('yt-dlp antigo, que não conhece a opção, é chamado sem ela', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'kkkkkkkkkkkk', { originalGone: true }, { original: false });
  const y = fakeYtdlp(d, { acceptsFlag: false });
  const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
  await s.api('/uploads/kkkkkkkkkkkk/refetch', { json: {} }); await untilNotRefetching(s, 'kkkkkkkkkkkk');
  const args = fs.readFileSync(y.log, 'utf8');
  assert.doesNotMatch(args, /--js-runtimes/);
  assert.match(args, /watch\?v=abc/);
});

// --- achado no primeiro uso real: "--ffmpeg-location ffmpeg" faz o yt-dlp rodar SEM ffmpeg e não juntar vídeo e áudio ---
test('o yt-dlp não recebe um --ffmpeg-location que não é um caminho de verdade', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'llllllllllll', { originalGone: true }, { original: false });
  const y = fakeYtdlp(d, { acceptsFlag: true });
  const s = await boot(t, d, { env: { YTDLP_PATH: y.f, FFMPEG_PATH: '' } }); // ffmpeg achado pelo PATH, como nos computadores da equipe
  await s.api('/uploads/llllllllllll/refetch', { json: {} }); await untilNotRefetching(s, 'llllllllllll');
  const args = fs.readFileSync(y.log, 'utf8');
  const m = args.match(/--ffmpeg-location (\S+)/);
  assert.ok(!m || path.isAbsolute(m[1]), `--ffmpeg-location recebeu "${m && m[1]}", que o yt-dlp trata como arquivo inexistente`);
});
