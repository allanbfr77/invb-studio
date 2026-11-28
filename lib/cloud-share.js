// Link de "Compartilhar" na internet: o vídeo exportado do corte e um pequeno arquivo com o título vão para o
// Vercel Blob (armazenamento da Vercel). A página do link (pasta vercel/, publicada em CLOUD_SHARE_URL) lê de lá,
// então o link abre de qualquer lugar mesmo com o computador da igreja desligado.
// Só funciona com BLOB_READ_WRITE_TOKEN na configuração (sem ela, o link é o do próprio Studio).
// Usa a API HTTP do Vercel Blob direto, sem pacote extra.
const fsp = require('fs').promises;
const path = require('path');
const { cfg } = require('./config');

const MAX = 450 * 1024 * 1024; // envio de uma vez só; corte maior que isso não é "short"
const storeId = () => String(cfg.blobToken).split('_')[3] || '';
const headers = (extra) => ({
  authorization: 'Bearer ' + cfg.blobToken,
  'x-api-version': '13',
  'x-vercel-blob-store-id': storeId(),
  ...extra,
});

async function fail(r, what) {
  let msg = '';
  try {
    const j = await r.json();
    msg = (j.error && (j.error.message || j.error.code)) || '';
  } catch {
    /* sem corpo */
  }
  if (r.status === 401 || r.status === 403) msg = 'a chave BLOB_READ_WRITE_TOKEN não foi aceita';
  throw new Error(`${what} (${r.status}${msg ? ': ' + msg : ''})`);
}

async function put(pathname, data, type, maxAge) {
  const r = await fetch(cfg.blobApi + '/?pathname=' + encodeURIComponent(pathname), {
    method: 'PUT',
    headers: headers({
      'x-vercel-blob-access': 'public',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1',
      'x-content-type': type,
      'x-cache-control-max-age': String(maxAge),
    }),
    body: data,
  });
  if (!r.ok) await fail(r, 'o envio para a Vercel falhou');
  return (await r.json()).url;
}

/** Envia o vídeo e o título do corte. Devolve { video, meta } (endereços no Blob). */
async function publish(token, file, info) {
  const st = await fsp.stat(file);
  if (st.size > MAX) throw new Error('o corte passa de 450 MB; exporte em qualidade menor para compartilhar');
  const ext = path.extname(file).toLowerCase() || '.mp4';
  const type = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
  const video = await put(`cortes/${token}${ext}`, await fsp.readFile(file), type, 2592000);
  await require('./usage').add({ api: 'vercel-blob', model: 'vercel-blob', feature: 'compartilhar', bytes: st.size });
  // o título fica pouco tempo em cache: "Parar de compartilhar" precisa derrubar o link logo
  const meta = await put(`cortes/${token}.json`, JSON.stringify({ ...info, video }), 'application/json', 60);
  return { video, meta };
}

/** Apaga os arquivos do link (best effort: um erro aqui não impede parar de compartilhar). */
async function remove(urls) {
  urls = (urls || []).filter(Boolean);
  if (!urls.length || !cfg.blobToken) return;
  try {
    const r = await fetch(cfg.blobApi + '/delete', {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ urls }),
    });
    if (!r.ok) await fail(r, 'apagar na Vercel falhou');
  } catch (e) {
    require('./store').log('compartilhar: ' + e.message);
  }
}

module.exports = { publish, remove };
