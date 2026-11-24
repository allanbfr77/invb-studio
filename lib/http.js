// Camada web: login (senha única, cookie de sessão, limite de tentativas) e as respostas (JSON, corpo do pedido, envio de arquivos).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { E, cfg } = require('./config');
const { readJson, writeJson, download } = require('./store');

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

module.exports = { authFile, initAuth, checkPw, makeCookie, authed, fails, isHttps, clientIp, send, body, serveFile };
