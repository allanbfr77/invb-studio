// Lê a saída do yt-dlp (rodando com --newline) e devolve o andamento do download para mostrar na tela.
// `state` guarda entre chamadas qual arquivo está sendo baixado: o primeiro é o vídeo, o segundo é o áudio.
function ytProgress(chunk, state) {
  let out = null;
  for (const line of String(chunk || '').split(/\r?\n/)) {
    if (/^\[download\] Destination:/.test(line)) state.files = (state.files || 0) + 1;
    const m = /^\[download\]\s+([\d.]+)%/.exec(line);
    if (m) {
      out = { pct: Math.floor(+m[1]), label: 'Baixando do YouTube: ' + ((state.files || 1) >= 2 ? 'áudio' : 'vídeo') };
      const sp = /at\s+([\d.]+)\s*([KMG])iB\/s\s+ETA\s+([\d:]+)/.exec(line);
      if (sp) out.detail = sp[1].replace('.', ',') + ' ' + sp[2] + 'B/s, faltam ' + sp[3];
    }
    else if (/^\[Merger\]/.test(line)) out = { pct: 99, label: 'Juntando vídeo e áudio' };
  }
  return out;
}

module.exports = { ytProgress };

/**
 * Lê a saída de `yt-dlp --print "%(live_status)s\t%(title)s"`.
 * live: 'is_live' (ainda ao vivo), 'post_live' (terminou há pouco e o YouTube ainda está processando),
 * 'was_live', 'not_live' ou '' quando o YouTube não informa.
 */
function ytInfo(out) {
  const line = String(out || '').split(/\r?\n/).filter((l) => /^(is_live|post_live|was_live|not_live|is_upcoming|NA)\t/.test(l)).pop() || '';
  const i = line.indexOf('\t'); if (i < 0) return { live: '', title: '' };
  const live = line.slice(0, i);
  return { live: live === 'NA' ? '' : live, title: line.slice(i + 1).trim() };
}

module.exports.ytInfo = ytInfo;

/** Código do vídeo (11 caracteres) de um link do YouTube: watch?v=, youtu.be/, /live/, /shorts/, /embed/. Vazio se não for. */
function ytId(url) {
  const s = String(url || '');
  if (!/^https?:\/\/([\w-]+\.)?(youtube\.com|youtu\.be)\//.test(s)) return '';
  const m = /[?&]v=([\w-]{11})/.exec(s) || /youtu\.be\/([\w-]{11})/.exec(s) || /\/(?:live|shorts|embed)\/([\w-]{11})/.exec(s);
  return m ? m[1] : '';
}

module.exports.ytId = ytId;
