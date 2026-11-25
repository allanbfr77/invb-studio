// Rotas do vídeo de uma pregação (/api/uploads/<id>/...): capa, tocar, apagar e baixar de novo o original,
// forma de onda, teste e ajuste de sincronia (manual e automática). Chamado por lib/routes.js.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { parseDriveLink, openDrive } = require('./drive');
const { canRefetch } = require('./cleanup');
const { cleanShift } = require('./speed');
const autosync = require('./autosync');
const { tools, U } = require('./config');
const { getMeta, update, download, readJson, writeJson, run, withLock, log, mime, enqueue, VIDEO } = require('./store');
const {
  clearOriginals,
  ensureThumb,
  isGone,
  touchUsed,
  refetchReady,
  exporting,
  dropOriginal,
  refetchBusy,
  applyRange,
  makePreview,
  fetchYoutube,
  saveDriveStream,
  peaksBusy,
  playable,
} = require('./media');
const { clamp } = require('./render');
const { serveFile, send, body, NEXT } = require('./http');
let syncBusy = false; // uma análise de sincronia por vez: ela usa o processador inteiro

/**
 * Versão editada no Editor avançado ("Enviar pro Studio" → "Substituir o vídeo desta pregação"): o arquivo enviado
 * passa a ser o vídeo da pregação. A transcrição, a análise e os cortes do vídeo antigo saem (a minutagem mudou) e a
 * pregação é processada de novo. Como a versão editada não pode ser baixada de novo pelo link da live, ela fica marcada
 * como vinda do editor e a limpeza dos 7 dias não a apaga.
 */
async function receiveEdited({ b, m, q, req, res }) {
  const { pipeline } = require('./transcribe'); // aqui dentro: transcribe também usa media
  const { cfg } = require('./config');
  if (['queued', 'processing', 'downloading'].includes(m.status) || m.refetching)
    return send(res, 409, { error: 'Esta pregação ainda está sendo processada. Tente de novo quando terminar.' });
  if (await exporting(b))
    return send(res, 409, { error: 'Há um corte sendo exportado. Tente de novo quando terminar.' });
  const name = (q.get('name') || 'pregacao-editada.mp4').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
  const ext = path.extname(name).toLowerCase();
  if (!VIDEO.has(ext)) return send(res, 415, { error: 'Envie um vídeo (.mp4 ou .webm).' });
  const declared = +req.headers['content-length'] || 0;
  if (declared > cfg.maxUploadBytes) return send(res, 413, { error: 'Arquivo grande demais.' });
  const part = U(b, 'editado.part' + ext);
  let n = 0;
  const ws = fs.createWriteStream(part);
  const fail = async (msg, code = 500) => {
    ws.destroy();
    await fsp.rm(part, { force: true });
    if (!res.headersSent) send(res, code, { error: msg });
  };
  req.on('data', (ch) => {
    n += ch.length;
    if (n > cfg.maxUploadBytes) {
      req.destroy();
      fail('Arquivo grande demais.', 413);
    }
  });
  req.on('aborted', () => fail('Envio cancelado.'));
  req.pipe(ws);
  ws.on('error', () => fail('Falha ao gravar o arquivo.'));
  ws.on('finish', async () => {
    if (!n) return fail('Arquivo vazio.', 400);
    try {
      // o vídeo antigo e tudo o que foi calculado a partir dele
      await clearOriginals(b);
      await fsp.rename(part, U(b, 'original' + ext));
      for (const f of [
        'transcript.json',
        'analysis.json',
        'peaks.json',
        'thumb.jpg',
        'preview.mp4',
        'preview.tmp.mp4',
        'sincronizado.mp4',
        'clips.json',
      ])
        await fsp.rm(U(b, f), { force: true });
      await fsp.rm(U(b, 'clips'), { recursive: true, force: true });
      const before = await getMeta(b);
      const edited = {
        at: Date.now(),
        size: n,
        // de onde veio a live, para referência (o vídeo atual não sai mais desse link)
        from: before.edited
          ? before.edited.from
          : { source: before.source, url: before.url || null, name: before.name },
      };
      await update(b, {
        file: 'original' + ext,
        size: n,
        kind: 'vid',
        source: 'editor',
        edited,
        range: null,
        audioShift: 0,
        duration: null,
        preview: null,
        originalGone: false,
        lastUsedAt: Date.now(),
        status: 'queued',
        stage: 'Na fila',
        progress: 0,
        error: null,
      });
      log('versão editada recebida', b, name, n);
      enqueue(() => pipeline(b));
      send(res, 200, await getMeta(b));
    } catch (e) {
      log('falha ao trocar pela versão editada', b, e.message);
      fail('Não consegui trocar o vídeo: ' + e.message);
    }
  });
}

async function mediaRoutes({ c, d, b, m, method, q, req, res, a }) {
  if (c === 'edited' && method === 'POST') return receiveEdited({ b, m, q, req, res });
  if (c === 'thumb' && method === 'GET') {
    const f = await ensureThumb(m);
    return f ? serveFile(req, res, f, 'image/jpeg') : send(res, 404, { error: 'Sem capa' });
  }
  if ((c === 'media' || c === 'synctest' || c === 'peaks' || c === 'autosync') && (m.refetching || isGone(m)))
    return send(res, 410, {
      error: 'A pregação saiu deste computador para liberar espaço. Abra o envio e clique em "Baixar de novo".',
      originalGone: true,
      canRefetch: canRefetch(m),
    });
  if (c === 'media' && method === 'GET') touchUsed(b);
  if (c === 'free' && method === 'POST') {
    // apaga o original agora; o link continua salvo
    if (!canRefetch(m))
      return send(res, 400, {
        error: 'Este arquivo foi enviado do computador. Como não há link para baixar de novo, ele não é apagado.',
      });
    if (m.status !== 'done' || m.refetching) return send(res, 409, { error: 'Aguarde o processamento terminar.' });
    if (!refetchReady(m))
      return send(res, 501, {
        error: 'Este computador não tem yt-dlp ou ffmpeg para baixar a pregação de novo, então ela não é apagada.',
      });
    if (await exporting(b))
      return send(res, 409, { error: 'Há um corte sendo exportado. Tente de novo quando terminar.' });
    if (!m.originalGone) await dropOriginal(m);
    return send(res, 200, await getMeta(b));
  }
  if (c === 'refetch' && method === 'POST') {
    // baixa o original de novo pelo link, sem transcrever outra vez
    if (m.refetching || refetchBusy.has(b)) return send(res, 202, m);
    if (!isGone(m)) return send(res, 200, m);
    if (!canRefetch(m)) return send(res, 400, { error: 'Não há link salvo para baixar este arquivo de novo.' });
    // O link baixa o vídeo inteiro de novo: o trecho da pregação é separado outra vez antes de liberar o vídeo.
    const ok = async (file, size) => {
      await update(b, { file, size, rangeApplied: false });
      await applyRange(b);
      await update(b, { originalGone: false, refetching: false, refetchError: null, lastUsedAt: Date.now() });
      makePreview(b);
    };
    const fail = (msg) => update(b, { refetching: false, refetchError: msg });
    if (m.source === 'youtube') {
      if (!tools.ytdlp || !tools.ffmpeg)
        return send(res, 501, { error: 'yt-dlp ou ffmpeg não está instalado neste computador.' });
      const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
      download(async () => {
        try {
          const f = await fetchYoutube(b, m.url);
          if (!f) return void (await fail('Não consegui baixar do YouTube. Confira se o vídeo ainda está no ar.'));
          await ok(f, (await fsp.stat(U(b, f))).size);
        } catch (e) {
          await fail('Falha ao baixar do YouTube: ' + e.message);
        }
      });
      return send(res, 202, mm);
    }
    const j = await body(req);
    const ref = parseDriveLink(m.url);
    if (!ref.ok) return send(res, 400, { error: ref.error });
    const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
    refetchBusy.add(b);
    let dlr;
    try {
      dlr = await openDrive(ref, token);
    } catch (e) {
      refetchBusy.delete(b);
      return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin });
    }
    const file = 'original' + path.extname(dlr.name).toLowerCase();
    const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
    refetchBusy.delete(b);
    send(res, 202, mm);
    (async () => {
      try {
        await ok(file, await saveDriveStream(b, file, dlr));
      } catch (e) {
        await fsp.rm(U(b, file), { force: true });
        await fail('Falha ao baixar do Google Drive: ' + e.message);
      }
    })();
    return;
  }
  // Forma de onda de um trecho (o volume do som ao longo do tempo), para a linha do tempo do editor.
  // Forma de onda da pregação inteira, para o player de baixo. Calculada uma vez e guardada junto da pregação.
  if (c === 'peaks' && method === 'GET' && q.get('full')) {
    const N = 240,
      cache = U(b, 'peaks.json'),
      have = await readJson(cache, null);
    if (have && have.n === N && have.v === 2 && Array.isArray(have.peaks)) return send(res, 200, have);
    if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
    if (!peaksBusy.has(b))
      peaksBusy.set(
        b,
        (async () => {
          const chunks = [];
          const pr = spawn(
            tools.ffmpeg,
            ['-v', 'error', '-i', U(b, m.file), '-vn', '-ac', '1', '-ar', '800', '-f', 's16le', 'pipe:1'],
            { windowsHide: true },
          );
          pr.stdout.on('data', (dt) => chunks.push(dt));
          pr.stderr.on('data', () => {});
          const code = await new Promise((r) => {
            pr.on('close', r);
            pr.on('error', () => r(1));
          });
          const buf = Buffer.concat(chunks),
            total = Math.floor(buf.length / 2);
          if (code !== 0 || !total) return null;
          const peaks = new Array(N).fill(0);
          for (let i = 0; i < total; i++) {
            const x = Math.abs(buf.readInt16LE(i * 2)),
              k = Math.min(N - 1, Math.floor((i / total) * N));
            if (x > peaks[k]) peaks[k] = x;
          }
          // A altura é medida contra um volume alto típico (95% das barras ficam abaixo dele), não contra o maior estalo: um pico isolado não achata o resto.
          const ref = Math.max(1, [...peaks].sort((x, y) => x - y)[Math.floor(N * 0.95)]),
            out = { n: N, v: 2, peaks: peaks.map((p) => +Math.min(1, p / ref).toFixed(3)) };
          await writeJson(cache, out).catch(() => {});
          return out;
        })().finally(() => peaksBusy.delete(b)),
      );
    const out = await peaksBusy.get(b);
    return out ? send(res, 200, out) : send(res, 502, { error: 'Não consegui ler o som desta pregação.' });
  }
  if (c === 'peaks' && method === 'GET') {
    const a = Math.max(0, +q.get('start') || 0),
      e = +q.get('end'),
      n = clamp(Math.round(+q.get('n') || 300), 50, 1200);
    if (!(e > a) || e - a > 1800) return send(res, 400, { error: 'Trecho inválido.' });
    if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
    const chunks = [];
    const pr = spawn(
      tools.ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        String(a),
        '-t',
        String(e - a),
        '-i',
        U(b, m.file),
        '-vn',
        '-ac',
        '1',
        '-ar',
        '4000',
        '-f',
        's16le',
        'pipe:1',
      ],
      { windowsHide: true },
    );
    pr.stdout.on('data', (dt) => chunks.push(dt));
    pr.stderr.on('data', () => {});
    const code = await new Promise((r) => {
      pr.on('close', r);
      pr.on('error', () => r(1));
    });
    const buf = Buffer.concat(chunks),
      total = Math.floor(buf.length / 2);
    if (code !== 0 || !total) return send(res, 502, { error: 'Não consegui ler o som deste trecho.' });
    const peaks = new Array(n).fill(0);
    for (let i = 0; i < total; i++) {
      const v = Math.abs(buf.readInt16LE(i * 2)),
        k = Math.min(n - 1, Math.floor((i / total) * n));
      if (v > peaks[k]) peaks[k] = v;
    }
    const mx = Math.max(1, ...peaks);
    return send(res, 200, { start: a, end: e, peaks: peaks.map((p) => +(p / mx).toFixed(3)) });
  }
  // Teste da sincronia: um trecho curto renderizado como o arquivo final (mesma leitura do vídeo e do som), em baixa resolução.
  if (c === 'synctest' && method === 'GET') {
    const at = Math.max(0, +q.get('at') || 0),
      len = clamp(+q.get('len') || 8, 1, 15),
      shift = cleanShift((m.audioShift || 0) + cleanShift(q.get('shift')));
    if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
    if (m.kind === 'aud') return send(res, 400, { error: 'Este arquivo é só áudio.' });
    touchUsed(b);
    await fsp.mkdir(U(b, 'clips'), { recursive: true });
    const orig = U(b, m.file),
      tmpFile = U(b, 'clips', `.teste-${crypto.randomBytes(6).toString('hex')}.mp4`),
      aStart = Math.max(0, at - shift);
    try {
      const ins = [
        '-y',
        '-v',
        'error',
        '-ss',
        String(at),
        '-t',
        String(len),
        '-i',
        orig,
        ...(aStart !== at ? ['-ss', String(aStart), '-t', String(len), '-i', orig] : []),
      ];
      const r = await run(tools.ffmpeg, [
        ...ins,
        '-filter_complex',
        "[0:v]scale=-2:'min(480,ih)'[v]",
        '-map',
        '[v]',
        '-map',
        aStart !== at ? '1:a' : '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        tmpFile,
      ]);
      if (r.code !== 0) return send(res, 502, { error: 'Não consegui preparar o teste da sincronia.' });
      const buf = await fsp.readFile(tmpFile);
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': buf.length, 'cache-control': 'no-store' });
      return res.end(buf);
    } finally {
      await fsp.rm(tmpFile, { force: true }).catch(() => {});
    }
  }
  /* Sincronia automática: mede o atraso entre a fala e a boca (num trecho ou no vídeo inteiro) e diz se dá para
     corrigir. Com apply, grava sincronizado.mp4 ao lado do original (que não é alterado), sem recodificar a imagem. */
  // Sincronia da pregação inteira: um ajuste fixo do som que vale para todos os cortes (inclusive os já criados).
  // Cortes já exportados voltam a "novo", para sair de novo com o som no lugar.
  if (c === 'sync' && method === 'POST') {
    const j = await body(req),
      v = cleanShift(j.audioShift);
    const mm = await update(b, {
      audioShift: v,
      audioShiftAt: Date.now(),
      audioShiftAuto: j.auto && typeof j.auto === 'object' ? { offsetMs: +j.auto.offsetMs || 0, at: Date.now() } : null,
    });
    let reset = 0;
    if ((m.audioShift || 0) !== v)
      await withLock('clips:' + b, async () => {
        const cl = await readJson(U(b, 'clips.json'), []);
        for (const k of cl)
          if (k.render && k.render.status === 'done') {
            k.render = null;
            delete k.drive;
            reset++;
          }
        await writeJson(U(b, 'clips.json'), cl);
      });
    log(
      'sincronia da pregação',
      b,
      Math.round(v * 1000) + ' ms',
      reset ? `(${reset} cortes para exportar de novo)` : '',
    );
    return send(res, 200, { ...mm, resetClips: reset });
  }
  if (c === 'autosync' && d === 'file' && method === 'GET')
    return serveFile(
      req,
      res,
      U(b, 'sincronizado.mp4'),
      'video/mp4',
      m.name.replace(/\.[^.]+$/, '') + ' (sincronizado).mp4',
    );
  if (c === 'autosync' && !d && method === 'POST') {
    if (!tools.autosync)
      return send(res, 501, {
        error:
          'A sincronia automática não está instalada neste computador. Rode uma vez o arquivo install/instalar-autosync e abra o app de novo.',
      });
    if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
    if (m.kind === 'aud')
      return send(res, 400, { error: 'Este arquivo é só áudio: não há boca para comparar com o som.' });
    if (m.status !== 'done') return send(res, 409, { error: 'Aguarde o processamento terminar.' });
    if (syncBusy) return send(res, 409, { error: 'Já há uma análise de sincronia em andamento. Aguarde terminar.' });
    const j = await body(req),
      dur = m.duration || 0;
    const start = clamp(+j.start || 0, 0, dur || 1e9),
      end = +j.end > 0 ? clamp(+j.end, 0, dur || 1e9) : 0;
    if (end && end - start < 3)
      return send(res, 400, { error: 'Trecho curto demais para medir a sincronia (mínimo de 3 segundos).' });
    syncBusy = true;
    touchUsed(b, true);
    const t0 = Date.now();
    try {
      const r = await autosync.analyze({
        ...tools.autosync,
        ffmpeg: tools.ffmpeg,
        video: U(b, m.file),
        start,
        end,
        tmpDir: U(b),
      });
      log(
        'sincronia automática',
        b,
        r.status,
        r.offsetMs === null ? '' : r.offsetMs + ' ms',
        `${Math.round((Date.now() - t0) / 1000)} s`,
      );
      if (j.apply && r.needsCorrection) {
        await autosync.applyShift({
          ffmpeg: tools.ffmpeg,
          input: U(b, m.file),
          output: U(b, 'sincronizado.mp4'),
          shiftSec: r.shiftSec,
        });
        r.file = `/api/uploads/${b}/autosync/file`;
      }
      return send(res, 200, r);
    } catch (e) {
      log('sincronia automática falhou', b, e.message);
      return send(res, 500, { error: e.message });
    } finally {
      syncBusy = false;
    }
  }
  if (c === 'media' && method === 'GET') {
    const f = q.get('orig') ? m.file : playable(m);
    return serveFile(
      req,
      res,
      U(b, f),
      mime[path.extname(f)] || 'application/octet-stream',
      q.get('orig') ? m.name : undefined,
    );
  }
  return NEXT;
}

module.exports = { mediaRoutes };
