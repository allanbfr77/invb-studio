// Tratamento do áudio do corte: isolamento da voz e remoção de silêncio.
// O isolamento usa filtros do ffmpeg: corta o grave que não é voz, reduz o ruído constante de fundo (chiado, ar-condicionado,
// zumbido) e, no nível forte, fecha o som entre as falas. Não é separação por IA: música alta e outras vozes continuam no áudio.

/** Nível pedido: 'off', 'leve' ou 'forte'. */
function cleanVoice(v) {
  if (v === true) return 'leve';
  return v === 'leve' || v === 'forte' ? v : 'off';
}

/**
 * Filtros de áudio do ffmpeg para o nível escolhido, na ordem em que são aplicados.
 * `available` é o conjunto de filtros que o ffmpeg deste computador tem; os que faltarem são pulados.
 */
function voiceFilters(level, available) {
  const lv = cleanVoice(level); if (lv === 'off') return [];
  const has = (n) => !available || available.has(n);
  const chain = lv === 'forte'
    ? [['highpass', 'highpass=f=110'], ['lowpass', 'lowpass=f=8000'], ['afftdn', 'afftdn=nr=24:nf=-22'], ['agate', 'agate=threshold=0.018:ratio=2.5:attack=8:release=220']]
    : [['highpass', 'highpass=f=80'], ['afftdn', 'afftdn=nr=12:nf=-25']];
  // Valores medidos em fala com chiado: o leve tira cerca de 11 dB do ruído e o forte mais de 30 dB, sem mudar o volume da voz.
  // O rastreio automático de ruído do afftdn (tn=1) ficou de fora: nos testes ele não reduzia nada.
  // De propósito não há normalizador de volume aqui: ele aumentaria junto o ruído que sobra nos trechos sem fala.
  return chain.filter(([n]) => has(n)).map(([, f]) => f);
}

/** Pausa mínima, em segundos, para a remoção de silêncio cortar: entre 0,2 e 3; padrão 0,5. */
function cleanGap(v) {
  const n = Number(v); if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return 0.5;
  return Math.round(Math.max(0.2, Math.min(3, n)) * 100) / 100;
}

module.exports = { cleanVoice, voiceFilters, cleanGap };
