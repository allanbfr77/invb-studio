// Lê a saída do yt-dlp (rodando com --newline) e devolve o andamento do download para mostrar na tela.
// `state` guarda entre chamadas qual arquivo está sendo baixado: o primeiro é o vídeo, o segundo é o áudio.
function ytProgress(chunk, state) {
  let out = null;
  for (const line of String(chunk || '').split(/\r?\n/)) {
    if (/^\[download\] Destination:/.test(line)) state.files = (state.files || 0) + 1;
    const m = /^\[download\]\s+([\d.]+)%/.exec(line);
    if (m) out = { pct: Math.floor(+m[1]), label: 'Baixando do YouTube: ' + ((state.files || 1) >= 2 ? 'áudio' : 'vídeo') };
    else if (/^\[Merger\]/.test(line)) out = { pct: 99, label: 'Juntando vídeo e áudio' };
  }
  return out;
}

module.exports = { ytProgress };
