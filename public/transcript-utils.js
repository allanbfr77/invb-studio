/* Funções puras da tela de transcrição, compartilhadas entre o navegador e os testes (node --test). */
(function (root) {
  /** Linhas que casam com a busca e o falante. Uma frase que atravessa duas linhas da mesma fala devolve as duas. */
  function matchLines(lines, q, speaker) {
    const pool = (lines || []).filter((l) => !speaker || l.who === speaker);
    const needle = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!needle) return pool;
    const low = pool.map((l) => String(l.text || '').toLowerCase().replace(/\s+/g, ' '));
    const hit = new Set();
    pool.forEach((l, k) => {
      if (low[k].includes(needle)) return void hit.add(k);
      const next = pool[k + 1];
      if (next && next.seg === l.seg && !low[k + 1].includes(needle) && (low[k] + ' ' + low[k + 1]).includes(needle)) { hit.add(k); hit.add(k + 1); }
    });
    return pool.filter((_, k) => hit.has(k));
  }

  /** Texto para copiar ou baixar: "[tempo] linha", com o nome de quem fala cada vez que ele muda. */
  function linesToText(lines, tm) {
    const blocks = []; let who;
    for (const l of lines || []) {
      if (l.who !== who || !blocks.length) { who = l.who; blocks.push([`${who}:`]); }
      blocks[blocks.length - 1].push(`[${tm(l.t)}] ${l.text}`);
    }
    return blocks.map((b) => b.join('\n')).join('\n\n');
  }

  const api = { matchLines, linesToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TranscriptUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
