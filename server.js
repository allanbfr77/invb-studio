// INVB Studio — servidor local.
// Este arquivo só liga o app: serve as telas (public/), encaminha /api para lib/routes.js e prepara tudo ao abrir.
// O resto mora em lib/: config, store, auth, media, transcribe, render e routes.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { ROOT, E, cfg, cloud, isCloud, cloudId, settingsFile, AI, tools } = require('./lib/config');
const { readJson, log, detectTools, listMeta, update } = require('./lib/store');
const { authFile, initAuth, send } = require('./lib/http');
const { sweepOriginals, makePreview } = require('./lib/media');
const { api } = require('./lib/routes');

const publicDir = path.join(ROOT, 'public');
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
  { const saved = (await readJson(settingsFile(), {})).transcriber; if (['local', cloudId].includes(saved)) cfg.provider = saved; }
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
