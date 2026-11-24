/* Trecho da pregação dentro de um vídeo maior (ex.: a live inteira do culto, com louvor, avisos e oferta).
   Só esse trecho fica no computador e é transcrito. Compartilhado entre o navegador, o servidor e os testes. */
(function (root) {
  /** Lê um horário: h:mm:ss, mm:ss ou o formato do YouTube (1h05m30s). Vazio dá null; inválido dá NaN. */
  function clock(v) {
    const s = String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    if (!s) return null;
    if (/^\d{1,3}(:[0-5]?\d){1,2}$/.test(s)) return s.split(':').reduce((a, n) => a * 60 + +n, 0);
    const m = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?(?:(\d+)s)?$/.exec(s);
    if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return NaN;
  }

  const MIN = 30;
  /**
   * Valida o trecho pedido. Devolve null (vídeo inteiro) ou { start, end } (end null = até o fim).
   * Lança Error com a mensagem para a tela quando algo não faz sentido.
   */
  function cleanRange(r) {
    if (!r || typeof r !== 'object') return null;
    const a = clock(r.start),
      b = clock(r.end);
    if (Number.isNaN(a))
      throw new Error('Não entendi o início da pregação. Use horas:minutos:segundos, por exemplo 1:05:30.');
    if (Number.isNaN(b))
      throw new Error('Não entendi o fim da pregação. Use horas:minutos:segundos, por exemplo 1:52:00.');
    if (a === null && b === null) return null;
    const start = a || 0;
    if (b !== null && b - start < MIN)
      throw new Error(
        b <= start
          ? 'O fim da pregação precisa vir depois do início.'
          : `O trecho precisa ter pelo menos ${MIN} segundos.`,
      );
    if (!start && b === null) return null;
    return { start, end: b };
  }

  /** Início marcado no próprio link do YouTube (&t=3930s, ?t=1h5m30s, &start=3930). */
  function ytStart(url) {
    try {
      const u = new URL(String(url || '').trim()),
        v = (u.searchParams.get('t') || u.searchParams.get('start') || '').trim();
      const t = /^\d+$/.test(v) ? +v : clock(v); // no link, número solto é em segundos (é o que o "Compartilhar" do YouTube gera)
      return t > 0 ? t : null;
    } catch {
      return null;
    }
  }

  const api = { clock, cleanRange, ytStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RangeUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
