// Decide se um vídeo precisa de uma cópia só para tocar no navegador.
// O YouTube costuma entregar AV1/VP9 com áudio Opus, que o Safari não reproduz dentro de um mp4.
// A cópia (H.264 + AAC, até 720p) serve só para assistir na tela; os cortes continuam saindo do original.
const VIDEO_OK = new Set(['h264', 'hevc']);
const AUDIO_OK = new Set(['aac', 'mp3']);

/** Recebe o que o `ffmpeg -i arquivo` escreve e diz se o navegador precisa de uma cópia compatível. */
function needsPreview(ffmpegInfo) {
  const s = String(ffmpegInfo || '');
  const v = /Stream #[^\n]*Video: (\w+)/.exec(s),
    a = /Stream #[^\n]*Audio: (\w+)/.exec(s);
  if (!v) return false; // só áudio, ou não deu para ler: o navegador cuida, ou não há o que converter
  return !VIDEO_OK.has(v[1]) || (!!a && !AUDIO_OK.has(a[1]));
}

module.exports = { needsPreview };
