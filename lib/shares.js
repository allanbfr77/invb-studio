// Links públicos de um corte ("Compartilhar"): /v/<código> mostra só aquele corte, sem login.
// O código é aleatório e longo (não dá para adivinhar nem chegar a outro corte por ele). Fica em data/shares.json:
// { código: { id da pregação, id do corte, quando, cloud? } } (cloud: a cópia na Vercel, ver lib/cloud-share.js). Parar de compartilhar apaga o código: o link deixa de abrir.
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

/** Guarda onde o corte ficou na internet (Vercel Blob): { video, meta, stamp }. */
function setCloud(token, cloud) {
  return withLock('shares', async () => {
    const all = await readJson(FILE(), {});
    if (!Object.prototype.hasOwnProperty.call(all, token)) return;
    all[token].cloud = cloud;
    await writeJson(FILE(), all);
  });
}

/** Para de compartilhar o corte (todos os códigos dele) e apaga as cópias dele na internet. */
async function unshare(id, clip) {
  const urls = [];
  const n = await withLock('shares', async () => {
    const all = await readJson(FILE(), {});
    let k = 0;
    for (const [t, v] of Object.entries(all))
      if (v.id === id && (clip === undefined || v.clip === clip)) {
        if (v.cloud) urls.push(v.cloud.meta, v.cloud.video);
        delete all[t];
        k++;
      }
    if (k) await writeJson(FILE(), all);
    return k;
  });
  if (urls.length) await require('./cloud-share').remove(urls);
  return n;
}

/** Código atual do corte, ou null. */
async function tokenOf(id, clip) {
  const all = await readJson(FILE(), {});
  for (const [t, v] of Object.entries(all)) if (v.id === id && v.clip === clip) return t;
  return null;
}

module.exports = { find, share, unshare, setCloud, tokenOf, okToken };
