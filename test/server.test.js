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
  return { api, url, cookie, log: () => out };
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

// --- achado no primeiro uso real: o Safari não toca VP9/AV1 nem Opus dentro de mp4; pedir H.264 + AAC primeiro ---
test('o download do YouTube pede primeiro H.264 com áudio AAC, que toca em qualquer navegador', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'mmmmmmmmmmmm', { originalGone: true }, { original: false });
  const y = fakeYtdlp(d, { acceptsFlag: true });
  const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
  await s.api('/uploads/mmmmmmmmmmmm/refetch', { json: {} }); await untilNotRefetching(s, 'mmmmmmmmmmmm');
  const fmt = (fs.readFileSync(y.log, 'utf8').match(/-f (\S+)/) || [])[1] || '';
  const opts = fmt.split('/');
  assert.match(opts[0], /vcodec\^=avc1/); assert.match(opts[0], /ba\[ext=m4a\]/); assert.match(opts[0], /height<=1080/);
  assert.equal(opts[opts.length - 1], 'b', 'mantém a alternativa genérica no fim, para vídeos sem H.264');
});

// --- "Arquivo grande demais" passa a dizer o tamanho, o limite e como aumentar ---
test('arquivo acima do limite recebe mensagem com o tamanho, o limite e a configuração a mudar', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d, { env: { MAX_UPLOAD_GB: '0.000001' } }); // limite de ~1 KB
  const r = await s.api('/uploads?name=grande.mp4', { json: 'x'.repeat(5000) });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /Arquivo grande demais/);
  assert.match(r.body.error, /limite/i);
  assert.match(r.body.error, /MAX_UPLOAD_GB/);
  assert.match(r.body.error, /\d/);
});

// --- recursos de IA só para quem tem a chave do Claude na configuração pessoal ---
test('sem chave do Claude, a IA fica desligada e a rota recusa', async (t) => {
  const d = tmp(t); seed(d, 'nnnnnnnnnnnn');
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  assert.equal((await s.api('/status')).body.ai, false);
  const r = await s.api('/uploads/nnnnnnnnnnnn/ai/cuts', { json: {} });
  assert.equal(r.status, 501);
  assert.equal((await s.api('/uploads/nnnnnnnnnnnn/clips')).body.length, 0);
});

test('com a chave, o app avisa a tela que a IA está disponível, sem expor a chave', async (t) => {
  const d = tmp(t); seed(d, 'oooooooooooo');
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-chave-de-teste-000' } });
  const st = (await s.api('/status')).body;
  assert.equal(st.ai, true);
  assert.ok(!JSON.stringify(st).includes('sk-ant-chave-de-teste-000'));
});

// --- texto de publicação do corte (título, descrição, hashtags) ---
test('sem chave do Claude, gerar o texto do corte é recusado', async (t) => {
  const d = tmp(t); seed(d, 'pppppppppppp', {}, { clips: [clip()] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  assert.equal((await s.api('/uploads/pppppppppppp/clips/m111111111111/ai/post', { json: {} })).status, 501);
});

test('o texto editado pela pessoa fica salvo no corte, com hashtags normalizadas', async (t) => {
  const d = tmp(t); seed(d, 'qqqqqqqqqqqq', {}, { clips: [clip()] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/qqqqqqqqqqqq/clips/m111111111111', { method: 'PATCH', json: { post: { title: ' Meu título ', description: 'Minha descrição.', hashtags: 'fé #pregação  igreja' } } });
  assert.equal(r.status, 200);
  const [c] = (await s.api('/uploads/qqqqqqqqqqqq/clips')).body;
  assert.equal(c.post.title, 'Meu título'); assert.equal(c.post.description, 'Minha descrição.');
  assert.deepEqual(c.post.hashtags, ['#fé', '#pregação', '#igreja']);
});

test('mudar o tempo do corte descarta o texto de publicação, que era de outro trecho', async (t) => {
  const d = tmp(t); seed(d, 'rrrrrrrrrrrr', {}, { clips: [clip({ post: { title: 'Antigo', description: 'x', hashtags: ['#a'], at: 1 } })] });
  const s = await boot(t, d);
  await s.api('/uploads/rrrrrrrrrrrr/clips/m111111111111', { method: 'PATCH', json: { start: 12, end: 44 } });
  assert.equal((await s.api('/uploads/rrrrrrrrrrrr/clips')).body[0].post, undefined);
});

// --- achado no uso real: o YouTube entregou arquivo vazio para o formato H.264 ---
test('se o primeiro formato falhar, o download tenta de novo com formatos mais simples', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'ssssssssssss', { originalGone: true }, { original: false });
  const y = fakeYtdlp(d, { acceptsFlag: true });
  const s = await boot(t, d, { env: { YTDLP_PATH: y.f } });
  await s.api('/uploads/ssssssssssss/refetch', { json: {} }); await untilNotRefetching(s, 'ssssssssssss');
  const formats = fs.readFileSync(y.log, 'utf8').trim().split('\n').map((l) => (l.match(/-f (\S+)/) || [])[1]);
  assert.equal(formats.length, 4);
  assert.match(formats[0], /vcodec\^=avc1/);
  assert.equal(formats[1], 'bv*[height<=1080]+ba/b');
  assert.equal(formats[2], 'bv*[height<=1080]+ba/b');
  assert.equal(formats[3], 'b');
  // as duas primeiras tentativas baixam em várias conexões ao mesmo tempo; as últimas usam o modo simples, mais lento e mais seguro
  const lines = fs.readFileSync(y.log, 'utf8').trim().split('\n');
  assert.deepEqual(lines.map((l) => /--extractor-args youtube:formats=dashy/.test(l) && /-N 8\b/.test(l)), [true, true, false, false]);
});

test('o navegador recebe a cópia compatível quando ela existe, e o original quando pede o original', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'tttttttttttt', { preview: 'preview.mp4' });
  fs.writeFileSync(path.join(dir, 'preview.mp4'), 'copia-leve');
  const s = await boot(t, d);
  const get = async (p2) => (await fetch(s.url + '/api/uploads/tttttttttttt/' + p2, { headers: { 'x-invb': '1', cookie: s.cookie } })).text();
  assert.equal(await get('media'), 'copia-leve');
  assert.equal(await get('media?orig=1'), 'fake');
});

test('"liberar espaço" apaga também a cópia do navegador', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'uuuuuuuuuuuu', { preview: 'preview.mp4' });
  fs.writeFileSync(path.join(dir, 'preview.mp4'), 'copia-leve');
  const s = await boot(t, d);
  assert.equal((await s.api('/uploads/uuuuuuuuuuuu/free', { json: {} })).status, 200);
  assert.ok(!has(dir, 'preview.mp4') && !has(dir, 'original.mp4') && has(dir, 'transcript.json'));
});

// --- cortes da IA: aba Automáticos, com nota, sem os trechos de texto pré-feito ---
const http = require('node:http');
/** API do Claude de mentira para estes testes: devolve os cortes combinados (ou falha, se cuts for null). */
const fakeClaude = (t, cuts) => new Promise((ok) => {
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (x) => { b += x; }); req.on('end', () => {
    if (!cuts) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: JSON.stringify({ cuts }) }], usage: { input_tokens: 1, output_tokens: 1 } }));
  }); });
  srv.listen(0, '127.0.0.1', () => { t.after(() => srv.close()); ok('http://127.0.0.1:' + srv.address().port); });
});
const untilAnalyzed = async (s, id) => { let m; for (let i = 0; i < 100; i++) { m = (await s.api('/uploads/' + id)).body; if (m.aiCutsAt) break; await new Promise((r) => setTimeout(r, 50)); } return m; };
const heuristicClip = { id: 'a0', title: 'Trecho antigo', description: 'Trecho sugerido por heurística local (sem IA): boa densidade de fala e fim de frase limpo.', type: 'Trecho', score: 70, start: 5, end: 40, manual: false, fav: false, hid: false, render: null };

test('com a chave, os cortes automáticos vêm da IA com a nota dela, e os de texto pré-feito somem', async (t) => {
  const base = await fakeClaude(t, [{ start_seconds: 300, end_seconds: 360, title: 'Bom', reason: 'Reflexão clara.', score: 78 }, { start_seconds: 60, end_seconds: 120, title: 'Forte', reason: 'Exortação marcante.', score: 94 }]);
  const d = tmp(t); seed(d, 'wwwwwwwwwwww', {}, { clips: [heuristicClip, clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  assert.equal((await s.api('/uploads/wwwwwwwwwwww/reanalyze', { json: {} })).status, 202);
  const m = await untilAnalyzed(s, 'wwwwwwwwwwww');
  assert.equal(m.aiCuts, true);
  const auto = m.clips.filter((c) => !c.manual), manual = m.clips.filter((c) => c.manual);
  assert.deepEqual(auto.map((c) => [c.title, c.score, c.type, c.description]), [['Forte', 94, 'IA', 'Exortação marcante.'], ['Bom', 78, 'IA', 'Reflexão clara.']]);
  assert.deepEqual(manual.map((c) => c.title), ['Meu corte manual']);
  assert.ok(!JSON.stringify(m.clips).includes('heurística'));
});

test('"Sugerir cortes com IA" acrescenta na aba Automáticos, sem tocar na Manuais', async (t) => {
  const base = await fakeClaude(t, [{ start_seconds: 200, end_seconds: 250, title: 'Mais um', reason: 'Aplicação direta.', score: 81 }]);
  const d = tmp(t); seed(d, 'xxxxxxxxxxxx', {}, { clips: [clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  const r = await s.api('/uploads/xxxxxxxxxxxx/ai/cuts', { json: { count: 4 } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.created.map((c) => [c.title, c.manual, c.score, /^i[0-9a-f]{12}$/.test(c.id)]), [['Mais um', false, 81, true]]);
  const all = (await s.api('/uploads/xxxxxxxxxxxx/clips')).body;
  assert.deepEqual(all.filter((c) => c.manual).map((c) => c.title), ['Meu corte manual']);
  assert.equal(all.filter((c) => !c.manual).length, 1);
});

test('com a chave e a IA falhando, a aba Automáticos fica vazia e o motivo vai para a tela', async (t) => {
  const base = await fakeClaude(t, null);
  const d = tmp(t); seed(d, 'yyyyyyyyyyyy', {}, { clips: [heuristicClip, clip({ title: 'Meu corte manual' })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: base } });
  await s.api('/uploads/yyyyyyyyyyyy/reanalyze', { json: {} });
  const m = await untilAnalyzed(s, 'yyyyyyyyyyyy');
  assert.equal(m.aiCuts, false); assert.match(m.aiCutsError, /chave/i);
  assert.deepEqual(m.clips.filter((c) => !c.manual), []);
  assert.deepEqual(m.clips.filter((c) => c.manual).map((c) => c.title), ['Meu corte manual']);
});

test('sem a chave, quem não usa IA continua com os trechos da análise local', async (t) => {
  const d = tmp(t); seed(d, 'zzzzzzzzzzzz');
  fs.writeFileSync(path.join(d, 'uploads', 'zzzzzzzzzzzz', 'transcript.json'), JSON.stringify({ language: 'pt', segments: Array.from({ length: 30 }, (_, i) => ({ id: i, speaker: 'Pessoa 1', start: i * 10, end: i * 10 + 9, text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito para todo aquele que nele crê.' })) }));
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  await s.api('/uploads/zzzzzzzzzzzz/reanalyze', { json: {} });
  let m; for (let i = 0; i < 60; i++) { m = (await s.api('/uploads/zzzzzzzzzzzz')).body; if (m.clips.length) break; await new Promise((r) => setTimeout(r, 50)); }
  assert.ok(m.clips.length > 0); assert.ok(m.clips.every((c) => c.type !== 'IA'));
});

// --- um download lento (ex.: live recém-encerrada) não pode travar o resto do app ---
test('enquanto um vídeo baixa do YouTube, outras tarefas (análise, exportação) continuam andando', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); seed(d, 'aaaaaaaaaab1');
  fs.writeFileSync(path.join(d, 'uploads', 'aaaaaaaaaab1', 'transcript.json'), JSON.stringify({ language: 'pt', segments: Array.from({ length: 30 }, (_, i) => ({ id: i, speaker: 'Pessoa 1', start: i * 10, end: i * 10 + 9, text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito para todo aquele que nele crê.' })) }));
  const slow = path.join(d, 'yt-lento.sh');
  fs.writeFileSync(slow, '#!/bin/bash\nfor a in "$@"; do [ "$a" = "--version" ] && { echo 2026.01.01; exit 0; }; [ "$a" = "--print" ] && { printf "not_live\\tVideo lento\\n"; exit 0; }; done\nsleep 4\nexit 1\n', { mode: 0o755 });
  const s = await boot(t, d, { env: { YTDLP_PATH: slow, ANTHROPIC_API_KEY: '' } });
  const imp = await s.api('/uploads/youtube', { json: { url: 'https://www.youtube.com/watch?v=abc' } });
  assert.equal(imp.status, 201);
  await new Promise((r) => setTimeout(r, 300)); // o download já começou
  const t0 = Date.now();
  await s.api('/uploads/aaaaaaaaaab1/reanalyze', { json: {} });
  let m; for (let i = 0; i < 40; i++) { m = (await s.api('/uploads/aaaaaaaaaab1')).body; if (m.clips.length) break; await new Promise((r) => setTimeout(r, 50)); }
  assert.ok(m.clips.length > 0, 'a análise do outro vídeo ficou presa atrás do download');
  assert.ok(Date.now() - t0 < 2500, `demorou ${Date.now() - t0} ms`);
  assert.equal((await s.api('/uploads/' + imp.body.id)).body.status, 'processing');
});

// --- as duas IAs: vale a que tiver chave ---
const fakeOpenAI = (t) => new Promise((ok) => {
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (x) => { b += x; }); req.on('end', () => {
    const body = JSON.parse(b || '{}'), req1 = body.response_format.json_schema.schema.required; seen.push({ url: req.url, auth: req.headers.authorization, model: body.model, kind: req1[0] });
    const out = req1.includes('cuts') ? { cuts: [{ start_seconds: 60, end_seconds: 120, title: 'Pela OpenAI', reason: 'Trecho forte.', score: 88 }] }
      : req1.includes('chapters') ? { chapters: [{ start: 0, title: 'Capítulo da IA', summary: 'Resumo.', tags: ['fé'] }], emotions: [{ i: 0, emotion: 'Esperança' }] }
        : { title: 'Título da OpenAI', description: 'Descrição.', hashtags: ['#fé'] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(out) } }] }));
  }); });
  srv.listen(0, '127.0.0.1', () => { t.after(() => srv.close()); ok({ base: 'http://127.0.0.1:' + srv.address().port + '/v1', seen }); });
});

test('só com a chave da OpenAI, cortes, capítulos, emoções e texto do corte vêm dela', async (t) => {
  const o = await fakeOpenAI(t);
  const d = tmp(t); seed(d, 'bbbbbbbbbbc1', {}, { clips: [clip({ title: 'Meu corte manual', start: 0, end: 2 })] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-openai-teste', OPENAI_BASE_URL: o.base, OPENAI_MODEL: 'gpt-4o-mini', TRANSCRIBE_PROVIDER: 'groq' } });
  const st = (await s.api('/status')).body;
  assert.equal(st.ai, true); assert.match(st.aiName, /OpenAI gpt-4o-mini/);
  await s.api('/uploads/bbbbbbbbbbc1/reanalyze', { json: {} });
  const m = await untilAnalyzed(s, 'bbbbbbbbbbc1');
  assert.deepEqual(m.clips.filter((c) => !c.manual).map((c) => [c.title, c.score, c.type]), [['Pela OpenAI', 88, 'IA']]);
  assert.equal(m.analysis.mode, 'llm'); assert.equal(m.analysis.chapters[0].title, 'Capítulo da IA'); assert.deepEqual(m.analysis.emotions, [{ i: 0, emotion: 'Esperança' }]);
  const p = await s.api('/uploads/bbbbbbbbbbc1/clips/m111111111111/ai/post', { json: {} });
  assert.equal(p.status, 200); assert.equal(p.body.post.title, 'Título da OpenAI');
  assert.ok(o.seen.length >= 3 && o.seen.every((r) => r.url === '/v1/chat/completions' && r.auth === 'Bearer sk-openai-teste' && r.model === 'gpt-4o-mini'));
});

test('com as duas chaves vale o Claude; AI_PROVIDER=openai troca; AI_PROVIDER=off desliga', async (t) => {
  for (const [prov, expected] of [['', /Claude/], ['openai', /OpenAI/], ['off', null]]) {
    const d = tmp(t); const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: 'sk-ant-x', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'groq', AI_PROVIDER: prov } });
    const st = (await s.api('/status')).body;
    if (expected) { assert.equal(st.ai, true, prov); assert.match(st.aiName, expected); } else { assert.equal(st.ai, false); assert.equal(st.aiName, null); }
  }
});

test('quem usa a chave da OpenAI só para transcrever não ganha IA (e gasto) sem pedir', async (t) => {
  const d = tmp(t); const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'openai', AI_PROVIDER: '' } });
  assert.equal((await s.api('/status')).body.ai, false);
  const d2 = tmp(t); const s2 = await boot(t, d2, { env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-x', TRANSCRIBE_PROVIDER: 'openai', AI_PROVIDER: 'openai' } });
  assert.equal((await s2.api('/status')).body.ai, true);
});

// --- velocidade do corte exportado ---
const ffDuration = (f) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString().trim();
test('exportar com velocidade 2x gera um corte com metade da duração, com vídeo e áudio', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'cccccccccd01', { duration: 6 }, { clips: [clip({ start: 0, end: 6, render: null })] });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'original.mp4')]);
  const s = await boot(t, d);
  const render = async (opts) => {
    assert.equal((await s.api('/uploads/cccccccccd01/clips/m111111111111/render', { json: { captions: false, ...opts } })).status, 202);
    let k; for (let i = 0; i < 200; i++) { k = (await s.api('/uploads/cccccccccd01/clips')).body[0]; if (k.render && k.render.status !== 'rendering') break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(k.render.status, 'done', k.render.error); return k.render;
  };
  const fast = await render({ speed: 2 });
  assert.equal(fast.speed, 2);
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', fast.file)) - 3) < 0.4, 'duração em 2x: ' + ffDuration(path.join(dir, 'clips', fast.file)));
  const streams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(dir, 'clips', fast.file)]).stdout.toString();
  assert.match(streams, /video/); assert.match(streams, /audio/);
  const slow = await render({ speed: 0.5 });
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', slow.file)) - 12) < 0.6, 'duração em 0,5x');
  const normal = await render({});
  assert.equal(normal.speed, 1);
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', normal.file)) - 6) < 0.4, 'duração normal');
});

// --- utilidades para medir o áudio exportado ---
const meanVolume = (f) => +(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString()) || [])[1];
const waitRender = async (s, id) => { let k; for (let i = 0; i < 300; i++) { k = (await s.api(`/uploads/${id}/clips`)).body[0]; if (k.render && k.render.status !== 'rendering') break; await new Promise((r) => setTimeout(r, 100)); } assert.equal(k.render.status, 'done', k.render.error); return k.render; };

// --- remover música com o modelo de separação de voz (IA local) ---
/** Faz o papel do "python -m demucs": devolve como "voz isolada" um áudio em silêncio, para o teste reconhecer de onde veio o som. */
const fakeDemucs = (dir) => {
  const f = path.join(dir, 'demucs-falso.sh');
  fs.writeFileSync(f, '#!/bin/bash\nfor a in "$@"; do [ "$a" = "--help" ] && exit 0; done\nout=""; inp=""\nwhile [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; -m|-n) shift;; --*) ;; *) inp="$1";; esac; shift; done\nbase=$(basename "$inp" .wav); mkdir -p "$out/htdemucs/$base"\nffmpeg -y -loglevel error -i "$inp" -af volume=0 "$out/htdemucs/$base/vocals.wav"\n', { mode: 0o755 });
  return f;
};
const seedTone = (d, id) => { const dir = seed(d, id, { duration: 6 }, { clips: [clip({ start: 0, end: 6, render: null })] }); spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'original.mp4')]); return dir; };

test('remover música: o áudio do corte passa a ser a voz separada pelo modelo, com vídeo e duração intactos', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'ggggggggggh1');
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: fakeDemucs(d) } });
  assert.equal((await s.api('/status')).body.voiceAI, true);
  await s.api('/uploads/ggggggggggh1/clips/m111111111111/render', { json: { captions: false } });
  const normal = await waitRender(s, 'ggggggggggh1'); const dbNormal = meanVolume(path.join(dir, 'clips', normal.file));
  await s.api('/uploads/ggggggggggh1/clips/m111111111111/render', { json: { captions: false, voice: 'ia' } });
  const ia = await waitRender(s, 'ggggggggggh1'); const out = path.join(dir, 'clips', ia.file);
  assert.equal(ia.voice, 'ia');
  assert.ok(meanVolume(out) < dbNormal - 40, `o áudio deveria vir do arquivo separado (silêncio no teste): ${meanVolume(out)} dB contra ${dbNormal} dB`);
  assert.ok(Math.abs(ffDuration(out) - 6) < 0.4);
  assert.match(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]).stdout.toString(), /video[\s\S]*audio|audio[\s\S]*video/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'clips')).filter((f) => /\.wav$|\.sep$/.test(f)), [], 'arquivos temporários da separação devem ser apagados');
});

test('remover música funciona junto com velocidade e remoção de silêncio', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'hhhhhhhhhhi1');
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ language: 'pt', segments: [{ id: 0, speaker: 'Pessoa 1', start: 0, end: 4, text: 'um dois', words: [{ w: 'um', s: 0, e: 1 }, { w: 'dois', s: 3, e: 4 }] }] }));
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: fakeDemucs(d) } });
  await s.api('/uploads/hhhhhhhhhhi1/clips/m111111111111/render', { json: { captions: false, voice: 'ia', speed: 2, removePauses: true } });
  const r = await waitRender(s, 'hhhhhhhhhhi1');
  assert.ok(ffDuration(path.join(dir, 'clips', r.file)) < 1.6);
});

test('sem o modelo instalado, pedir para remover música dá um erro que diz como instalar', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); seedTone(d, 'iiiiiiiiiij1');
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: path.join(d, 'nao-existe') } });
  assert.equal((await s.api('/status')).body.voiceAI, false);
  await s.api('/uploads/iiiiiiiiiij1/clips/m111111111111/render', { json: { captions: false, voice: 'ia' } });
  let k; for (let i = 0; i < 100; i++) { k = (await s.api('/uploads/iiiiiiiiiij1/clips')).body[0]; if (k.render && k.render.status !== 'rendering') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(k.render.status, 'error'); assert.match(k.render.error, /instalar-voz-ia/);
});

// --- capa do vídeo: a do YouTube quando veio de lá; senão, o primeiro quadro ---
test('vídeo do YouTube usa a capa do YouTube, guardada no computador', { skip: !HAS_FFMPEG }, async (t) => {
  const hits = [];
  const img = http.createServer((req, res) => { hits.push(req.url); if (req.url === '/vi/PFyDkicLdgk/hqdefault.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(Buffer.from('capa-do-youtube')); } res.writeHead(404); res.end(); });
  await new Promise((r) => img.listen(0, '127.0.0.1', r)); t.after(() => img.close());
  const d = tmp(t); const dir = seed(d, 'jjjjjjjjjjk1', { url: 'https://youtu.be/PFyDkicLdgk?si=x' });
  const s = await boot(t, d, { env: { INVB_YTIMG_BASE: 'http://127.0.0.1:' + img.address().port } });
  const get = async () => { const r = await fetch(s.url + '/api/uploads/jjjjjjjjjjk1/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } }); return { status: r.status, type: r.headers.get('content-type'), body: await r.text() }; };
  const a = await get();
  assert.equal(a.status, 200); assert.equal(a.type, 'image/jpeg'); assert.equal(a.body, 'capa-do-youtube');
  assert.deepEqual(hits, ['/vi/PFyDkicLdgk/maxresdefault.jpg', '/vi/PFyDkicLdgk/hqdefault.jpg']);
  assert.ok(has(dir, 'thumb.jpg'));
  await get(); assert.equal(hits.length, 2, 'a segunda vez usa a cópia guardada, sem pedir de novo ao YouTube');
});

test('vídeo que não veio do YouTube usa o primeiro quadro como capa', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'kkkkkkkkkkl1'); const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); m.source = 'upload'; delete m.url; fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m));
  const s = await boot(t, d);
  const r = await fetch(s.url + '/api/uploads/kkkkkkkkkkl1/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.length > 500 && buf[0] === 0xff && buf[1] === 0xd8, 'deveria ser um JPEG de verdade');
});

test('sem capa do YouTube e sem vídeo no computador, a capa responde 404 e não quebra a tela', async (t) => {
  const d = tmp(t); seed(d, 'lllllllllm01', { source: 'upload', url: undefined }, { original: false });
  const s = await boot(t, d);
  assert.equal((await fetch(s.url + '/api/uploads/lllllllllm01/thumb', { headers: { 'x-invb': '1', cookie: s.cookie } })).status, 404);
});

// --- remover um trecho do meio do corte ---
test('exportar com um trecho removido tira esse pedaço do vídeo e do áudio', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'mmmmmmmmmn01');
  const s = await boot(t, d);
  await s.api('/uploads/mmmmmmmmmn01/clips/m111111111111/render', { json: { captions: false, removed: [[2, 4, 1]] } });
  const r = await waitRender(s, 'mmmmmmmmmn01'); const out = path.join(dir, 'clips', r.file);
  assert.ok(Math.abs(ffDuration(out) - 4) < 0.4, 'duração: ' + ffDuration(out));
  await s.api('/uploads/mmmmmmmmmn01/clips/m111111111111/render', { json: { captions: false, removed: [[1, 2, 1], [1.5, 3, 1], [5, 9, 1]], speed: 2 } });
  const r2 = await waitRender(s, 'mmmmmmmmmn01');
  // sobram 0–1 e 3–5 = 3 s; em 2x, 1,5 s
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', r2.file)) - 1.5) < 0.4, 'duração com dois trechos e 2x: ' + ffDuration(path.join(dir, 'clips', r2.file)));
});

// --- escolher entre transcrição local e na nuvem pela tela ---
test('a tela troca entre Local e Groq, e a escolha fica salva para o próximo início', async (t) => {
  const d = tmp(t);
  const s = await boot(t, d, { env: { GROQ_API_KEY: 'gsk-teste', TRANSCRIBE_PROVIDER: 'groq' } });
  let st = (await s.api('/status')).body;
  assert.equal(st.provider, 'groq');
  assert.deepEqual(st.transcribers.map((x) => [x.id, x.name, x.ok]), [['local', 'Local', false], ['groq', 'Groq', true]]);
  assert.ok(!JSON.stringify(st).includes('gsk-teste'));
  // sem faster-whisper (PYTHON inexistente) o modo local é recusado com o motivo
  const no = await s.api('/transcriber', { json: { provider: 'local' } });
  assert.equal(no.status, 400); assert.match(no.body.error, /faster-whisper/);
  assert.equal((await s.api('/transcriber', { json: { provider: 'xyz' } })).status, 400);
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ transcriber: 'local' }));
  const s2 = await boot(t, d, { env: { GROQ_API_KEY: 'gsk-teste', TRANSCRIBE_PROVIDER: 'groq' } });
  assert.equal((await s2.api('/status')).body.provider, 'local'); // a escolha salva vale sobre o .env
  const ok = await s2.api('/transcriber', { json: { provider: 'groq' } });
  assert.equal(ok.status, 200); assert.equal(ok.body.provider, 'groq');
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')).transcriber, 'groq');
});
