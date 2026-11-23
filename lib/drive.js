// Links do Google Drive: interpretação do link e abertura do download (público ou com token do usuário).
// Baseado na lógica do projeto Transcritor (lib/url.ts e lib/drive.ts), adaptada ao servidor.
const fs = require('fs');
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

/* ---------- Envio de cortes para a pasta da equipe ---------- */
const API = 'https://www.googleapis.com';
// O Google diz o motivo no corpo da resposta; com ele a mensagem aponta o conserto certo em vez de listar hipóteses.
const driveError = (status, body) => {
  const g = (body && body.error) || {}, reason = String((g.errors && g.errors[0] && g.errors[0].reason) || (g.details && g.details[0] && g.details[0].reason) || g.status || ''), detail = String(g.message || '');
  const e = (msg, extra) => Object.assign(new Error(msg), { status, reason, detail }, extra);
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used in project|is disabled/i.test(detail)) return e('A Google Drive API não está ativada no projeto do Google Cloud deste app. Ative em console.cloud.google.com → APIs e serviços → Biblioteca → Google Drive API, espere uns minutos e envie de novo.');
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason) || /insufficient authentication scopes/i.test(detail)) return e('O acesso ao Drive não foi autorizado no login do Google. Envie de novo e, na tela do Google, marque a caixa que permite ver e editar os arquivos do Drive.', { needsLogin: true });
  if (/insufficientFilePermissions/i.test(reason + detail)) return e('A conta Google usada no login não tem permissão de editor na pasta da equipe. Peça o compartilhamento como Editor para essa conta, ou envie de novo e escolha outra conta.', { wrongAccount: true });
  if (/rateLimit|quota/i.test(reason)) return e('O Google limitou os envios por agora. Espere um minuto e tente de novo.');
  if (status === 401) return e('O login do Google expirou. Entre de novo e repita o envio.', { needsLogin: true });
  if (status === 403) return e('O Google recusou o envio. O mais comum é a sua conta não ter permissão de editor na pasta da equipe; também acontece quando o acesso ao Drive não foi autorizado no login ou quando há envios demais em pouco tempo.');
  if (status === 404) return e('A conta Google escolhida no login não tem acesso à pasta da equipe (o Google respondeu que não encontrou a pasta). Envie de novo e escolha a conta que é Editor da pasta, ou peça para compartilharem a pasta com esta conta.', { wrongAccount: true });
  return e(`O Google Drive retornou um erro (código ${status}).`);
};
async function driveCall(fetchImpl, url, init) {
  let res;
  try { res = await fetchImpl(url, init); } catch { throw Object.assign(new Error('Sem conexão com o Google Drive.'), { status: 502 }); }
  if (!res.ok) { let body = null; try { body = JSON.parse(await res.text()); } catch { /* sem corpo legível */ } throw driveError(res.status, body); }
  return res;
}

/** Devolve o id da subpasta `name` dentro de `parentId`, criando-a se ainda não existir. Vale para Meu Drive e drive compartilhado. */
async function ensureFolder(token, parentId, name, fetchImpl = fetch) {
  const headers = { authorization: `Bearer ${token}` };
  const q = `'${parentId}' in parents and name = '${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = new URL(`${API}/drive/v3/files`);
  for (const [k, v] of Object.entries({ q, fields: 'files(id)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })) list.searchParams.set(k, v);
  const found = await (await driveCall(fetchImpl, list, { headers })).json();
  if (found.files && found.files.length) return found.files[0].id;
  const made = await driveCall(fetchImpl, `${API}/drive/v3/files?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
  return (await made.json()).id;
}

/** Envia um arquivo do disco para a pasta (upload retomável, sem carregar o vídeo inteiro na memória). */
async function uploadFile(token, { folderId, name, filePath, mime }, fetchImpl = fetch) {
  const size = (await fs.promises.stat(filePath)).size;
  const start = await driveCall(fetchImpl, `${API}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mime, 'x-upload-content-length': String(size) },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const session = start.headers.get('location');
  if (!session) throw Object.assign(new Error('O Google Drive não abriu o envio.'), { status: 502 });
  const done = await driveCall(fetchImpl, session, { method: 'PUT', headers: { 'content-type': mime, 'content-length': String(size) }, body: fs.createReadStream(filePath), duplex: 'half' });
  const j = await done.json();
  return { id: j.id, webViewLink: j.webViewLink };
}

module.exports = { parseDriveLink, openDrive, ensureFolder, uploadFile };
