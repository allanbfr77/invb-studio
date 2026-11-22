// Velocidade do corte exportado: de 0,25x a 2x. A voz acelera ou desacelera sem mudar de tom (filtro atempo do ffmpeg).
/** Normaliza o valor pedido: número entre 0,25 e 2, com duas casas. Qualquer coisa inválida vira 1 (velocidade normal). */
function cleanSpeed(v) {
  if (v === null || v === undefined || v === '') return 1;
  const n = Number(v); if (!Number.isFinite(n)) return 1;
  return Math.round(Math.max(0.25, Math.min(2, n)) * 100) / 100;
}

/** Filtro de áudio do ffmpeg para a velocidade. Cada atempo aceita de 0,5 a 2, então abaixo de 0,5x são dois em série. */
function atempo(speed) {
  const s = cleanSpeed(speed), f = (x) => 'atempo=' + +x.toFixed(4);
  return s < 0.5 ? `${f(0.5)},${f(s / 0.5)}` : f(s);
}

/** Ajuste de sincronia do áudio, em segundos: positivo atrasa o áudio, negativo adianta. Entre -5 e 5; o resto vira 0. */
function cleanShift(v) {
  const n = Number(v);
  if (v === null || v === '' || !Number.isFinite(n)) return 0;
  return Math.round(Math.max(-5, Math.min(5, n)) * 1000) / 1000;
}

module.exports = { cleanSpeed, atempo, cleanShift };
