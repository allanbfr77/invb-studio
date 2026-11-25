// Links públicos de um corte ("Compartilhar"): /v/<código> mostra só aquele corte, sem login.
// O código é aleatório e longo (não dá para adivinhar nem chegar a outro corte por ele). Fica em data/shares.json:
// { código: { id da pregação, id do corte, quando } }. Parar de compartilhar apaga o código: o link deixa de abrir.
const crypto = require('crypto');
const path = require('path');
const { cfg } = require('./config');
const { readJson, writeJson, withLock } = require('./store');

const FILE = () => path.join(cfg.dataDir, 'shares.json');
const okToken = (t) => /^[A-Za-z0-9_-]{20,40}$/.test(String(t || ''));

async function find(token) {
  if (!okToken(token)) return null;
  const all = await readJson(FILE(), {});
  return Object.prototype.hasOwnProperty.call(all, token) ? all[token] : null;
}

/** Código do corte (o mesmo, se ele já estava compartilhado). */
function share(id, clip) {
  return withLock('shares', async () => {
    const all = await readJson(FILE(), {});
    for (const [t, v] of Object.entries(all)) if (v.id === id && v.clip === clip) return t;
    const t = crypto.randomBytes(18).toString('base64url'); // 24 caracteres
    all[t] = { id, clip, at: Date.now() };
    await writeJson(FILE(), all);
    return t;
  });
}

/** Para de compartilhar o corte (todos os códigos dele). */
function unshare(id, clip) {
  return withLock('shares', async () => {
    const all = await readJson(FILE(), {});
    let n = 0;
    for (const [t, v] of Object.entries(all))
      if (v.id === id && (clip === undefined || v.clip === clip)) {
        delete all[t];
        n++;
      }
    if (n) await writeJson(FILE(), all);
    return n;
  });
}

/** Código atual do corte, ou null. */
async function tokenOf(id, clip) {
  const all = await readJson(FILE(), {});
  for (const [t, v] of Object.entries(all)) if (v.id === id && v.clip === clip) return t;
  return null;
}

module.exports = { find, share, unshare, tokenOf, okToken };
