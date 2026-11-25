// Túnel da Cloudflare: deixa o Studio acessível de qualquer lugar (sem depender do Wi-Fi da igreja), para os links de
// "Compartilhar" um corte abrirem em qualquer celular. O resto do Studio continua atrás da senha.
//   TUNNEL=cloudflare              túnel rápido, sem conta: o endereço (https://….trycloudflare.com) muda a cada vez que
//                                  o Studio é aberto, então links compartilhados antes deixam de abrir
//   CLOUDFLARE_TUNNEL_TOKEN=…      túnel fixo, de uma conta da Cloudflare com um domínio: o endereço não muda
//   + PUBLIC_URL=https://…         (o endereço público desse túnel fixo)
// O programa cloudflared vem do install/instalar-cloudflare (fica em .cloudflared/) ou do PATH (CLOUDFLARED_PATH).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { cfg, E, ROOT } = require('./config');

const state = { mode: null, url: null, status: 'off', error: null, proc: null, tries: 0 };

function binary() {
  if (E.CLOUDFLARED_PATH) return E.CLOUDFLARED_PATH;
  const local = path.join(ROOT, '.cloudflared', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return fs.existsSync(local) ? local : 'cloudflared';
}

const mode = () => (E.CLOUDFLARE_TUNNEL_TOKEN ? 'fixo' : /^(cloudflare|1|sim|rapido|rápido)$/i.test(E.TUNNEL || '') ? 'rapido' : null);

/** Endereço público do túnel quando ele está no ar (o fixo usa PUBLIC_URL). */
const publicUrl = () => (state.status === 'on' ? state.url : null);

function start(log = () => {}) {
  state.mode = mode();
  if (!state.mode) return state;
  const args =
    state.mode === 'fixo'
      ? ['tunnel', '--no-autoupdate', 'run', '--token', E.CLOUDFLARE_TUNNEL_TOKEN]
      : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${cfg.port}`];
  state.status = 'starting';
  state.error = null;
  let p;
  try {
    p = spawn(binary(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    state.status = 'error';
    state.error = 'Não consegui abrir o cloudflared: ' + e.message;
    return state;
  }
  state.proc = p;
  const read = (d) => {
    const t = String(d);
    if (state.mode === 'rapido') {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(t);
      if (m && state.url !== m[0]) {
        state.url = m[0];
        state.status = 'on';
        state.tries = 0;
        log('túnel da Cloudflare no ar: ' + state.url);
      }
    } else if (/Registered tunnel connection|Connection [a-f0-9-]+ registered/i.test(t) && state.status !== 'on') {
      state.url = cfg.publicUrl || null;
      state.status = 'on';
      state.tries = 0;
      log('túnel fixo da Cloudflare no ar' + (state.url ? ': ' + state.url : ' (defina PUBLIC_URL com o endereço dele)'));
    }
  };
  p.stdout.on('data', read);
  p.stderr.on('data', read);
  p.on('error', (e) => {
    state.status = 'error';
    state.error =
      e.code === 'ENOENT'
        ? 'O cloudflared não está instalado neste computador. Rode uma vez o install/instalar-cloudflare.'
        : 'O túnel da Cloudflare falhou: ' + e.message;
    log(state.error);
  });
  p.on('close', (code) => {
    if (state.proc !== p) return;
    state.proc = null;
    if (state.status === 'error' && /instalado/.test(state.error || '')) return;
    // caiu: tenta de novo, cada vez esperando mais (até 5 min)
    state.status = 'error';
    state.error = state.error || 'O túnel da Cloudflare caiu (código ' + code + '). Tentando de novo…';
    const wait = Math.min(300000, 5000 * 2 ** state.tries++);
    log(state.error);
    setTimeout(() => start(log), wait).unref();
  });
  return state;
}

function stop() {
  if (state.proc) {
    const p = state.proc;
    state.proc = null;
    try {
      p.kill();
    } catch {
      /* ok */
    }
  }
  state.status = 'off';
}

/** O pedido veio pelo túnel? (o cloudflared roda neste computador e marca o endereço real de quem acessa) */
const viaTunnel = (req) =>
  !!state.mode &&
  /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '') &&
  !!req.headers['cf-connecting-ip'];

module.exports = { start, stop, state, publicUrl, viaTunnel, mode };
