// Links do Google Drive: interpretação do link e abertura do download (público ou com token do usuário).
// Baseado na lógica do projeto Transcritor (lib/url.ts e lib/drive.ts), adaptada ao servidor.
const MEDIA_EXT = /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|aac|opus|flac|ogg|oga)$/i;
const EXT_BY_MIME = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv', 'video/webm': '.webm', 'video/x-msvideo': '.avi', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/flac': '.flac' };

function parseDriveLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, error: 'Cole um link para continuar.' };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`); } catch { return { ok: false, error: 'Esse texto não parece um link válido.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Use um link seguro (https).' };
  const host = u.hostname.toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return { ok: false, error: 'Este não é um link do Google Drive.' };
  if (/\/drive\/(u\/\d+\/)?folders\//.test(u.pathname) || u.pathname.includes('/folderview')) return { ok: false, error: 'Esse é um link de pasta. Abra o arquivo de vídeo ou áudio no Drive e copie o link do arquivo.' };
  const m = u.pathname.match(/\/(?:file)\/d\/([A-Za-z0-9_-]{10,})/);
  const id = (m && m[1]) || u.searchParams.get('id');
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return { ok: false, error: 'Não encontrei o ID do arquivo nesse link do Drive.' };
  const rk = u.searchParams.get('resourcekey');
  return { ok: true, fileId: id, resourceKey: rk && /^[\w-]{3,64}$/.test(rk) ? rk : undefined };
}

const nameFromDisposition = (h) => {
  if (!h) return '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(h); if (star) { try { return decodeURIComponent(star[1]); } catch { /* segue */ } }
  const q = /filename="?([^";]+)"?/i.exec(h); return q ? q[1] : '';
};

/** Abre o download. Devolve { res, name, size } ou lança Error com .status e .needsLogin. */
async function openDrive(ref, token) {
  const fail = (status, msg, needsLogin) => Object.assign(new Error(msg), { status, needsLogin: !!needsLogin });
  const id = encodeURIComponent(ref.fileId);
  const headers = {};
  let meta = null;
  let url;
  if (token) {
    headers.authorization = `Bearer ${token}`;
    if (ref.resourceKey) headers['x-goog-drive-resource-keys'] = `${ref.fileId}/${ref.resourceKey}`;
    const mr = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,size,mimeType&supportsAllDrives=true`, { headers });
    if (!mr.ok) throw fail(403, 'Não foi possível acessar este arquivo com a sua conta Google. Verifique se você tem permissão.');
    meta = await mr.json();
    url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
  } else {
    url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t${ref.resourceKey ? '&resourcekey=' + encodeURIComponent(ref.resourceKey) : ''}`;
  }
  let res;
  try { res = await fetch(url, { headers, redirect: 'follow' }); } catch { throw fail(502, 'Sem conexão com o Google Drive.'); }
  const ct = res.headers.get('content-type') || '';
  if (res.status === 401 || res.status === 403 || res.status === 404 || ct.startsWith('text/html')) {
    try { res.body && res.body.cancel(); } catch { /* ok */ }
    throw fail(403, token ? 'Não foi possível acessar este arquivo com a sua conta Google.' : 'Não consegui baixar o arquivo. Se ele for privado, entre com o Google e tente de novo.', !token);
  }
  if (!res.ok) throw fail(502, `O Google Drive retornou um erro (código ${res.status}).`);
  const name = (meta && meta.name) || nameFromDisposition(res.headers.get('content-disposition')) || 'arquivo_do_drive';
  const mime = (meta && meta.mimeType) || ct.split(';')[0];
  let finalName = name;
  if (!MEDIA_EXT.test(finalName)) {
    if (EXT_BY_MIME[mime]) finalName += EXT_BY_MIME[mime];
    else { try { res.body && res.body.cancel(); } catch { /* ok */ } throw fail(415, 'Este arquivo não é um vídeo ou áudio suportado.'); }
  }
  const size = Number((meta && meta.size) || res.headers.get('content-length') || 0);
  return { res, name: finalName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 160), size };
}

module.exports = { parseDriveLink, openDrive };
