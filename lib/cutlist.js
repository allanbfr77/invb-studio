// Ida e volta com o Claude: monta o texto da transcrição para colar na IA
// e lê de volta a lista de minutagens que ela sugerir.
const TS = '(?:\\d{1,2}:)?\\d{1,2}:\\d{2}';
const JUNK = '[\\s\\-–—→>|:\\[\\]().,_]*'; // separadores e enfeites em volta dos tempos
// Antes dos tempos pode vir um marcador, numeração ou rótulo curto ("Corte 2:"); frase longa não conta.
const BEFORE_TITLE = '[\\s\\-–—→>|:\\]).,_]*'; // depois do segundo tempo: separadores, mas não o parêntese que abre um título
const LINE = new RegExp(`^(.{0,40}?)(${TS})${JUNK}(?:até|ate|a|to)?${JUNK}(${TS})${BEFORE_TITLE}(.*)$`, 'i');
const validTime = (t) =>
  t
    .split(':')
    .slice(1)
    .every((n) => +n < 60);
const label = (s) => {
  const t = s.replace(/^[\s\-–—•>\[(]*(?:\d+[.)]\s*)?/, '').replace(/[\s\-–—→>|:\[\]().,_]+$/, '');
  return /\p{L}/u.test(t) ? t : '';
};
const secs = (t) => t.split(':').reduce((a, n) => a * 60 + +n, 0);
const stamp = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
};

/** Lê uma lista colada (uma minutagem por linha). Devolve os cortes válidos e as linhas recusadas, com o motivo. */
function parseCutList(text, duration) {
  const cuts = [],
    rejected = [],
    adjusted = [],
    dur = +duration > 0 ? +duration : 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE.exec(line.replace(/[*`]/g, ''));
    const no = (reason) => rejected.push({ line, reason });
    if (!m) {
      no('Não encontrei início e fim.');
      continue;
    }
    if (!validTime(m[2]) || !validTime(m[3])) {
      no('Tempo inválido.');
      continue;
    }
    const start = secs(m[2]);
    let end = secs(m[3]);
    if (end <= start) {
      no('O fim vem antes do início.');
      continue;
    }
    if (dur && start >= dur) {
      no('O início passa do fim do vídeo.');
      continue;
    }
    if (dur && end > dur) {
      end = dur;
      adjusted.push({ line, note: `O fim passava do vídeo e foi ajustado para ${stamp(dur)}.` });
    }
    if (end - start < 3) {
      no('O corte precisa ter ao menos 3 segundos.');
      continue;
    }
    cuts.push({ start, end, title: (m[4].trim() || label(m[1]) || `Corte ${cuts.length + 1}`).slice(0, 120) });
  }
  return { cuts, rejected, adjusted: adjusted.filter((a) => !rejected.some((r) => r.line === a.line)) };
}

/** Texto pronto para colar no Claude: instrução, formato da resposta e a transcrição com tempos. */
function buildPrompt(name, lines) {
  return [
    `Esta é a transcrição da pregação "${name}", com o tempo de cada trecho.`,
    'Sugira de 1 a 4 cortes de 30 a 90 segundos que funcionem sozinhos, sem depender do resto da pregação.',
    'Responda só com uma lista, um corte por linha, neste formato:',
    'MM:SS - MM:SS Título do corte',
    '',
    ...(lines || []).map((l) => `[${stamp(l.start)}] ${l.text}`),
  ].join('\n');
}

module.exports = { parseCutList, buildPrompt, stamp };
