// AutoSync: acha e corrige o atraso FIXO entre a fala e a boca de um vídeo.
// A medição é feita por worker/autosync.py (SyncNet + detector de rosto YuNet, no computador). Aqui fica a decisão
// (corrigir, não corrigir ou não dá para saber) e a correção com o ffmpeg, sem recodificar o vídeo.
//
// Convenção: offsetMs > 0 = som ATRASADO (a boca mexe antes do som); offsetMs < 0 = som ADIANTADO.
// shiftSec é o ajuste a aplicar no formato do editor de cortes (audioShift): positivo atrasa o som, negativo adianta.
// Então shiftSec = -offsetMs / 1000.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

/**
 * Limites da decisão. Calibrados com os testes descritos em docs/autosync.md (vídeos reais com atraso conhecido e
 * controles negativos: som de outro momento do mesmo vídeo, que não pode bater com a boca).
 * conf é a medida do próprio SyncNet: distância mediana menos a mínima entre as tentativas de deslocamento.
 */
const LIMITS = {
  conf: 3.5, //         janela só conta com conf a partir daqui (nenhum controle negativo passou disso nos testes)
  confSingle: 5, //     trecho curto, com uma janela só: exige mais
  agreeMs: 60, //       janelas que concordam: até 1,5 quadro de diferença da mediana
  syncedMs: 45, //      até aqui é considerado sincronizado (pouco mais de 1 quadro a 25 fps)
  minAgree: 2, //       janelas que precisam concordar (quando há mais de uma)
  agreeShare: 0.6, //   e a parte delas entre as janelas aceitas
  variableMs: 120, //   diferença entre janelas que indica atraso variável
  driftMs: 80, //       diferença que, com tendência clara no tempo, indica deriva
};

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
const fmtMs = (ms) => `${Math.abs(Math.round(ms))} ms`;
const REASONS = { sem_rosto: 'nenhum rosto acompanhável', rosto_pequeno: 'rosto pequeno demais na imagem', sem_fala: 'sem fala', curto: 'trecho curto', erro: 'erro na leitura' };

/**
 * Decide a partir das medições por janela (saída do worker). Pura: testável sem modelo nem vídeo.
 * @returns {{ok:boolean,status:string,needsCorrection:boolean,offsetMs:number|null,shiftSec:number,message:string,evidence:object}}
 */
function decide(raw, limits = {}) {
  const L = { ...LIMITS, ...limits };
  const ws = (raw && Array.isArray(raw.windows)) ? raw.windows : [];
  const measured = ws.filter((w) => typeof w.conf === 'number');
  const single = ws.length === 1;
  const minConf = single ? L.confSingle : L.conf;
  const accepted = measured.filter((w) => w.conf >= minConf && !w.edge);
  const edgeStrong = measured.filter((w) => w.conf >= minConf && w.edge);
  const reasons = {}; for (const w of ws) if (w.reason) reasons[w.reason] = (reasons[w.reason] || 0) + 1;
  const evidence = {
    windows: ws.length, measured: measured.length, accepted: accepted.length, agreeing: 0,
    confMedian: measured.length ? +median(measured.map((w) => w.conf)).toFixed(2) : null,
    multipleFaces: ws.some((w) => (w.faces || 0) > 1), maxShiftMs: raw && raw.maxShiftMs || null,
    resolutionMs: raw && raw.fps ? Math.round(1000 / raw.fps) : 40, reasons,
  };
  const out = (status, message, extra = {}) => ({ ok: status === 'sincronizado' || status === 'corrigir', status, needsCorrection: status === 'corrigir', offsetMs: null, shiftSec: 0, message, evidence, ...extra });

  if (!ws.length) return out('erro', 'A análise não devolveu nenhuma medição.');
  if (!accepted.length) {
    if (edgeStrong.length >= Math.max(1, Math.ceil(measured.length / 2))) return out('inconclusivo', `O atraso parece maior que ${fmtMs(evidence.maxShiftMs || 1000)}, o máximo que a análise mede. Ajuste à mão.`);
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    if (!measured.length && top) {
      if (top[0] === 'sem_rosto' || top[0] === 'rosto_pequeno') return out('sem_rosto', `Não deu para medir: ${REASONS[top[0]]} na maior parte do trecho. A sincronia precisa de um rosto de frente, falando, bem visível.`);
      if (top[0] === 'sem_fala') return out('sem_fala', 'Não deu para medir: quase não há fala neste trecho.');
      if (top[0] === 'erro') return out('erro', 'Não consegui ler o vídeo para medir a sincronia.');
      return out('inconclusivo', `Não deu para medir: ${REASONS[top[0]] || top[0]}.`);
    }
    return out('inconclusivo', 'A boca e o som não combinaram com segurança em nenhum deslocamento (pode ser o microfone na frente da boca, rosto de lado, outra pessoa falando ou música). Nada foi alterado.');
  }

  const lags = accepted.map((w) => w.lag_ms), med = median(lags);
  const agree = accepted.filter((w) => Math.abs(w.lag_ms - med) <= L.agreeMs);
  const rest = accepted.filter((w) => Math.abs(w.lag_ms - med) > L.agreeMs);
  evidence.agreeing = agree.length;
  evidence.spreadMs = Math.round(Math.max(...lags) - Math.min(...lags));
  const need = single ? 1 : L.minAgree;
  // Atraso variável: janelas aceitas que discordam muito entre si, e de forma organizada (tendência no tempo ou dois grupos).
  // Deriva lenta (o som vai se afastando aos poucos) pode ficar abaixo de variableMs: com 4 janelas ou mais, uma tendência
  // muito clara já basta. Nos testes, atraso fixo nunca passou de 35 ms de diferença entre janelas.
  const trend = accepted.length >= 3 ? Math.abs(corr(accepted.map((w) => w.t), lags)) : 0;
  const slowDrift = accepted.length >= 4 && evidence.spreadMs > L.driftMs && trend >= 0.9;
  if (slowDrift || (accepted.length >= 3 && evidence.spreadMs > L.variableMs)) {
    const restAgree = rest.length >= 2 && Math.max(...rest.map((w) => w.lag_ms)) - Math.min(...rest.map((w) => w.lag_ms)) <= L.agreeMs;
    if (slowDrift || trend >= 0.8 || (agree.length >= 2 && restAgree)) return out('variavel', `O atraso muda ao longo do vídeo (de ${Math.round(Math.min(...lags))} a ${Math.round(Math.max(...lags))} ms). A correção automática só trata atraso fixo; corrija por partes, em cortes separados.`, { lagsMs: accepted.map((w) => ({ t: w.t, ms: w.lag_ms })) });
  }
  if (agree.length < need || agree.length < L.agreeShare * accepted.length) return out('inconclusivo', 'As medições discordaram entre si. Nada foi alterado; confira à mão com o Teste.');

  const wsum = agree.reduce((a, w) => a + w.conf, 0);
  const offsetMs = Math.round(agree.reduce((a, w) => a + w.lag_ms * w.conf, 0) / wsum);
  evidence.confMedian = +median(agree.map((w) => w.conf)).toFixed(2);
  const faces = evidence.multipleFaces ? ' Havia mais de um rosto; a medida veio de quem estava falando.' : '';
  if (Math.abs(offsetMs) <= L.syncedMs) return out('sincronizado', `Som e boca já estão sincronizados (diferença de ${fmtMs(offsetMs)}, dentro da margem de ${L.syncedMs} ms).${faces}`, { offsetMs, shiftSec: 0 });
  return out('corrigir', `Som ${offsetMs > 0 ? 'atrasado' : 'adiantado'} ${fmtMs(offsetMs)} em relação à boca (${agree.length} de ${accepted.length} medições concordam).${faces}`, { offsetMs, shiftSec: -offsetMs / 1000 });
}

/** Roda o worker e devolve a decisão. Rejeita com mensagem clara quando o worker falha. */
function analyze({ python, worker, ffmpeg, video, start = 0, end = 0, maxShiftMs = 2000, onProgress, onProc, tmpDir }) {
  return new Promise((resolve, reject) => {
    if (!python || !worker) return reject(new Error('A sincronia automática não está instalada neste computador.'));
    if (!video || !fs.existsSync(video)) return reject(new Error('Vídeo não encontrado.'));
    const out = path.join(tmpDir || path.dirname(video), `.autosync-${process.pid}-${Date.now()}.json`);
    const args = [worker, path.resolve(video), '--out', path.resolve(out), '--ffmpeg', ffmpeg || 'ffmpeg', '--start', String(start || 0), '--end', String(end || 0), '--max-shift-ms', String(maxShiftMs), '--min-conf', String(LIMITS.conf)];
    const p = spawn(python, args, { cwd: path.dirname(worker), windowsHide: true });
    if (onProc) onProc(p);
    let errMsg = '', stderr = '', buf = '';
    p.stdout.on('data', (d) => {
      buf += d; const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { try { const j = JSON.parse(l); if (j.type === 'progress' && onProgress) onProgress(j.pct); if (j.type === 'error') errMsg = j.message; } catch { /* ruído */ } }
    });
    p.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    p.on('error', (e) => reject(new Error('Não consegui iniciar a análise: ' + e.message)));
    p.on('close', async (code) => {
      try {
        if (code !== 0) throw new Error(errMsg || 'A análise da sincronia falhou. ' + stderr.split(/\r?\n/).filter(Boolean).slice(-1).join('').slice(0, 200));
        const raw = JSON.parse(await fsp.readFile(out, 'utf8'));
        resolve({ ...decide(raw), windows: raw.windows, range: raw.range });
      } catch (e) { reject(e); } finally { fsp.rm(out, { force: true }).catch(() => {}); }
    });
  });
}

/**
 * Grava uma cópia do vídeo com o som deslocado. A imagem e o som são copiados sem recodificar (-c copy); só muda o
 * tempo em que o som começa. Nunca escreve por cima da entrada: grava num temporário e troca de nome no fim.
 * @param shiftSec positivo atrasa o som, negativo adianta (mesma convenção do editor).
 */
async function applyShift({ ffmpeg, input, output, shiftSec, run }) {
  if (!Number.isFinite(shiftSec) || Math.abs(shiftSec) > 5) throw new Error('Ajuste de sincronia inválido.');
  if (!fs.existsSync(input)) throw new Error('Vídeo original não encontrado.');
  if (path.resolve(input) === path.resolve(output)) throw new Error('O arquivo corrigido não pode substituir o original.');
  const ext = path.extname(output) || '.mp4', tmp = output.slice(0, -ext.length || undefined) + `.tmp-${process.pid}${ext}`;
  const args = ['-y', '-v', 'error', '-i', input, '-itsoffset', shiftSec.toFixed(3), '-i', input,
    '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '0', '-c', 'copy', ...(/\.(mp4|mov|m4v)$/i.test(ext) ? ['-movflags', '+faststart'] : []), tmp];
  const r = await (run || runFfmpeg)(ffmpeg, args);
  try {
    if (r.code !== 0) throw new Error('O ffmpeg não conseguiu gravar o vídeo corrigido: ' + String(r.err || '').split(/\r?\n/).filter(Boolean).slice(-1).join('').slice(0, 200));
    const st = await fsp.stat(tmp).catch(() => null);
    if (!st || !st.size) throw new Error('O vídeo corrigido saiu vazio.');
    await fsp.rename(tmp, output);
    return output;
  } finally { await fsp.rm(tmp, { force: true }).catch(() => {}); }
}

function runFfmpeg(cmd, args) {
  return new Promise((resolve) => {
    let err = ''; const p = spawn(cmd, args, { windowsHide: true });
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); }); p.stdout.on('data', () => {});
    p.on('error', (e) => resolve({ code: -1, err: String(e) })); p.on('close', (code) => resolve({ code, err }));
  });
}

/** Caminhos do worker e do Python da sincronia automática (pasta .venv-sync, criada por install/instalar-autosync). */
function locate(root, env = process.env) {
  const py = env.AUTOSYNC_PYTHON || path.join(root, '.venv-sync', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  return { python: py, worker: path.join(root, 'worker', 'autosync.py') };
}

module.exports = { decide, analyze, applyShift, locate, LIMITS };

// Uso direto, sem o app: node lib/autosync.js <video> [--start S] [--end E] [--apply]
if (require.main === module) {
  (async () => {
    const a = process.argv.slice(2), video = a.find((x) => !x.startsWith('--') && !/^-?\d/.test(x));
    const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? +a[i + 1] : 0; };
    if (!video) { console.error('Uso: node lib/autosync.js <video> [--start S] [--end E] [--apply]'); process.exit(2); }
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', loc = locate(path.join(__dirname, '..'));
    const r = await analyze({ ...loc, ffmpeg, video, start: opt('--start'), end: opt('--end'), onProgress: (p) => process.stderr.write(`\r${p}%  `) });
    process.stderr.write('\n');
    if (a.includes('--apply') && r.needsCorrection) {
      const ext = path.extname(video);
      r.file = await applyShift({ ffmpeg, input: video, output: video.slice(0, -ext.length) + '.sincronizado' + ext, shiftSec: r.shiftSec });
    }
    console.log(JSON.stringify(r, null, 2));
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
