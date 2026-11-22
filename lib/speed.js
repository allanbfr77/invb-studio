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

module.exports = { cleanSpeed, atempo };
