// "Fica salvo só o link": decide quais pregações já podem sair do computador.
// A transcrição, a minutagem e os cortes prontos nunca entram nessa limpeza; só o vídeo original.

/** Dá para baixar de novo? Só quando a origem foi um link que ficou guardado. */
const canRefetch = (m) => !!(m && (m.source === 'youtube' || m.source === 'drive') && m.url);

/** Ids dos envios cujo original pode ser apagado: têm link, estão concluídos e não são usados há `maxAgeMs`. */
function staleOriginals(metas, now, maxAgeMs) {
  return (metas || [])
    .filter((m) => canRefetch(m) && m.status === 'done' && m.file && !m.originalGone && !m.refetching && (m.lastUsedAt || m.createdAt || 0) <= now - maxAgeMs)
    .map((m) => m.id);
}

module.exports = { staleOriginals, canRefetch };
