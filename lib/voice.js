// Remoção de música do corte: um modelo de separação de voz que roda no computador (ver renderClip em server.js).
// Os níveis "leve" e "forte" de redução de ruído e o ajuste de silêncio foram retirados do app.

/** Pedido de tratamento do áudio: 'ia' (remover música) ou 'off'. */
function cleanVoice(v) {
  return v === 'ia' ? 'ia' : 'off';
}

module.exports = { cleanVoice };
