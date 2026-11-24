// Rotas da API (/api/...): o que cada pedido da tela faz.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { parseDriveLink, openDrive } = require('./drive');
const { splitLines } = require('./lines');
const { canRefetch } = require('./cleanup');
const { ytInfo } = require('./ytprogress');
const { cleanShift } = require('./speed');
const autosync = require('./autosync');
const { cleanRange } = require('../public/range-utils.js');
const {
  VERSION, cfg, cloud, isCloud, settingsFile, transcribers, AI, LIB, IMG_EXT, rawBody, sniffImage, LANGS,
  groqChat, U, tooBig, tools,
} = require('./config');
const {
  sleep, rid, okId, readJson, withLock, writeJson, log, run, getMeta, saveMeta, listMeta, AUDIO, VIDEO,
  mime, queueSize, enqueue, download, update,
} = require('./store');
const { checkPw, makeCookie, authed, fails, isHttps, clientIp, send, body, serveFile } = require('./http');
const {
  peaksBusy, refetchBusy, touchUsed, dropOriginal, isGone, refetchReady, exporting, fetchYoutube,
  applyRange, makePreview, ensureThumb, playable, saveDriveStream,
} = require('./media');
const { pipeline } = require('./transcribe');
const { clamp, cleanOpts } = require('./render');
const { clipRoutes, NEXT } = require('./routes-clips');

let syncBusy = false; // uma análise de sincronia por vez: ela usa o processador inteiro

async function publicUpload(m, withData) {
  const id = m.id; const o = { ...m, canRefetch: canRefetch(m), originalGone: isGone(m) };
  if (!withData) return o;
  o.transcript = await readJson(U(id, 'transcript.json'), null);
  if (o.transcript) { o.transcript.lines = splitLines(o.transcript.segments); o.transcript.segments = o.transcript.segments.map(({ words, avg_logprob, ...s }) => s); }
  o.analysis = await readJson(U(id, 'analysis.json'), null);
  o.clips = await readJson(U(id, 'clips.json'), []);
  return o;
}

async function api(req, res, url, q) {
  const method = req.method, parts = url.split('/').filter(Boolean).slice(1); // sem "api"
  const [a, b, c, d] = parts;
  if (a === 'login' && method === 'POST') {
    const ip = clientIp(req), f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return send(res, 429, { error: 'Muitas tentativas. Aguarde 1 minuto.' });
    const j = await body(req);
    if (!checkPw(j.password)) { f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } fails.set(ip, f); await sleep(400); return send(res, 401, { error: 'Senha incorreta.' }); }
    fails.delete(ip);
    return send(res, 200, { ok: true }, { 'set-cookie': `invb_sid=${makeCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${isHttps(req) ? '; Secure' : ''}` });
  }
  if (a === 'me') return send(res, authed(req) ? 200 : 401, { ok: authed(req) });
  if (!authed(req)) return send(res, 401, { error: 'Não autenticado' });
  if (a === 'logout' && method === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': 'invb_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  if (method !== 'GET' && req.headers['x-invb'] !== '1') return send(res, 403, { error: 'Requisição inválida' });

  if (a === 'status') return send(res, 200, { ffmpeg: !!tools.ffmpeg, whisper: tools.whisper, ytdlp: !!tools.ytdlp, voiceAI: !!tools.demucs, autosync: !!tools.autosync, provider: cfg.provider, model: isCloud() ? cloud().model : cfg.whisperModel, driveClientId: cfg.googleClientId, ai: !!AI, driveCuts: !!(cfg.googleClientId && cfg.driveCutsFolder), provider_name: isCloud() ? cloud().name : 'Local', transcribers: transcribers(), aiName: AI ? AI.label : null, llm: !!AI, llmModel: AI ? AI.label : null, queue: queueSize(), version: VERSION });

  if (a === 'transcriber' && method === 'POST') {
    const j = await body(req), t = transcribers().find((x) => x.id === j.provider);
    if (!t) return send(res, 400, { error: 'Opção de transcrição desconhecida.' });
    if (!t.ok) return send(res, 400, { error: t.why });
    cfg.provider = t.id; await writeJson(settingsFile(), { ...(await readJson(settingsFile(), {})), transcriber: t.id });
    log('transcrição agora:', t.name);
    return send(res, 200, { ok: true, provider: t.id });
  }

  if (a === 'uploads') {
    if (!b) {
      if (method === 'GET') return send(res, 200, await Promise.all((await listMeta()).map(async (m) => { const cl = await readJson(U(m.id, 'clips.json'), []); return { ...m, cuts: { total: cl.length, ready: cl.filter((k) => k.render && k.render.status === 'done').length, drive: cl.filter((k) => k.drive && k.drive.link).length } }; })));
      if (method === 'POST') { // corpo bruto do arquivo
        const name = (q.get('name') || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
        const ext = path.extname(name).toLowerCase();
        if (!AUDIO.has(ext) && !VIDEO.has(ext)) return send(res, 415, { error: 'Formato não suportado.' });
        let range; try { range = cleanRange({ start: q.get('start'), end: q.get('end') }); } catch (e) { return send(res, 400, { error: e.message }); }
        const declared = +req.headers['content-length'] || 0;
        if (declared > cfg.maxUploadBytes) return send(res, 413, { error: tooBig(declared) });
        const id = rid(), file = 'original' + ext; await fsp.mkdir(U(id), { recursive: true });
        let n = 0; const ws = fs.createWriteStream(U(id, file));
        const fail = async (msg, code = 500) => { ws.destroy(); await fsp.rm(U(id), { recursive: true, force: true }); if (!res.headersSent) send(res, code, { error: msg }); };
        req.on('data', (ch) => { n += ch.length; if (n > cfg.maxUploadBytes) { req.destroy(); fail(tooBig(), 413); } });
        req.on('aborted', () => fail('Envio cancelado.'));
        req.pipe(ws);
        ws.on('error', () => fail('Falha ao gravar o arquivo.'));
        ws.on('finish', async () => {
          if (!n) return fail('Arquivo vazio.', 400);
          const m = { id, name, file, size: n, kind: AUDIO.has(ext) ? 'aud' : 'vid', createdAt: Date.now(), status: 'queued', stage: 'Na fila', progress: 0, source: 'upload', ...(range ? { range } : {}) };
          await saveMeta(m); enqueue(() => pipeline(id)); send(res, 201, m);
        });
        return;
      }
    }
    if (b === 'youtube' && method === 'POST') {
      const j = await body(req);
      if (!tools.ytdlp) return send(res, 501, { error: 'yt-dlp não está instalado neste computador (pip install yt-dlp). Envie o arquivo diretamente.' });
      if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(j.url || '')) return send(res, 400, { error: 'Link do YouTube inválido.' });
      let range; try { range = cleanRange(j.range); } catch (e) { return send(res, 400, { error: e.message }); }
      const id = rid(); await fsp.mkdir(U(id), { recursive: true });
      const m = { id, name: 'Importando do YouTube…', file: '', size: 0, kind: 'vid', createdAt: Date.now(), status: 'processing', stage: 'Baixando do YouTube', progress: 0, source: 'youtube', url: j.url, ...(range ? { range } : {}) };
      await saveMeta(m);
      download(async () => {
        const [cmd, ...pre] = tools.ytdlp;
        const info = ytInfo((await run(cmd, [...pre, '--no-playlist', '--print', '%(live_status)s\t%(title)s', j.url])).out), t = { out: info.title };
        if (info.live === 'is_live' || info.live === 'is_upcoming') return void (await update(id, { status: 'error', stage: 'Erro', error: info.live === 'is_live' ? 'Esta transmissão ainda está ao vivo. Espere ela terminar para importar.' : 'Esta transmissão ainda não começou.' }));
        // Live que acabou de terminar: o YouTube ainda está processando a gravação e só a entrega devagar, numa conexão.
        const postLive = info.live === 'post_live';
        if (postLive) { log('live recém-encerrada: o YouTube ainda está processando; o download será lento', id); await update(id, { liveNote: true }); }
        const f = await fetchYoutube(id, j.url, (p) => update(id, { stage: (postLive ? 'Live recém-encerrada, download lento. ' : '') + p.label + (p.detail ? ' (' + p.detail + ')' : ''), progress: p.pct }).catch(() => {}), { slowOnly: postLive });
        if (!f) return void (await update(id, { status: 'error', stage: 'Erro', error: postLive ? 'Não consegui baixar esta live recém-encerrada. O YouTube ainda está processando a gravação; tente de novo em algumas horas.' : 'Falha ao baixar o vídeo do YouTube.' }));
        const st = await fsp.stat(U(id, f));
        await update(id, { file: f, size: st.size, name: (t.out.trim() || 'video_do_youtube') + path.extname(f) });
        try { await applyRange(id); } catch (e) { return void (await update(id, { status: 'error', stage: 'Erro', error: e.message })); }
        makePreview(id);
        await update(id, { status: 'queued', stage: 'Na fila para transcrever', progress: 0 });
        enqueue(() => pipeline(id)); // a transcrição e a análise seguem na fila de processamento
      });
      return send(res, 201, m);
    }
    if (b === 'drive' && method === 'POST') {
      const j = await body(req); const ref = parseDriveLink(j.url);
      if (!ref.ok) return send(res, 400, { error: ref.error });
      let range; try { range = cleanRange(j.range); } catch (e) { return send(res, 400, { error: e.message }); }
      const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      let dlr; try { dlr = await openDrive(ref, token); } catch (e) { return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin }); }
      const ext = path.extname(dlr.name).toLowerCase();
      if (dlr.size > cfg.maxUploadBytes) { try { dlr.res.body.cancel(); } catch { /* ok */ } return send(res, 413, { error: tooBig(dlr.size) }); }
      const id = rid(), file = 'original' + ext; await fsp.mkdir(U(id), { recursive: true });
      const m = { id, name: dlr.name, file, size: dlr.size, kind: AUDIO.has(ext) ? 'aud' : 'vid', createdAt: Date.now(), status: 'processing', stage: 'Baixando do Google Drive', progress: 0, source: 'drive', url: String(j.url).trim().slice(0, 500), ...(range ? { range } : {}) };
      await saveMeta(m); send(res, 201, m);
      (async () => { // download em segundo plano (fora da fila de CPU)
        try {
          const n = await saveDriveStream(id, file, dlr, (pct) => update(id, { progress: pct }));
          await update(id, { size: n, status: 'queued', stage: 'Na fila', progress: 0 }); enqueue(() => pipeline(id));
        } catch (e) { await update(id, { status: 'error', stage: 'Erro', error: 'Falha ao baixar do Google Drive: ' + e.message }); }
      })();
      return;
    }
    if (!okId(b)) return send(res, 404, { error: 'Não encontrado' });
    const m = await getMeta(b); if (!m) return send(res, 404, { error: 'Envio não encontrado' });
    if (!c) {
      if (method === 'GET') return send(res, 200, await publicUpload(m, true));
      if (method === 'PATCH') { const j = await body(req); if (typeof j.name === 'string' && j.name.trim()) m.name = j.name.trim().slice(0, 160); await saveMeta(m); return send(res, 200, m); }
      if (method === 'DELETE') { await fsp.rm(U(b), { recursive: true, force: true }); return send(res, 200, { ok: true }); }
    }
    if (c === 'thumb' && method === 'GET') { const f = await ensureThumb(m); return f ? serveFile(req, res, f, 'image/jpeg') : send(res, 404, { error: 'Sem capa' }); }
    if ((c === 'media' || c === 'synctest' || c === 'peaks' || c === 'autosync') && (m.refetching || isGone(m))) return send(res, 410, { error: 'A pregação saiu deste computador para liberar espaço. Abra o envio e clique em "Baixar de novo".', originalGone: true, canRefetch: canRefetch(m) });
    if (c === 'media' && method === 'GET') touchUsed(b);
    if (c === 'free' && method === 'POST') { // apaga o original agora; o link continua salvo
      if (!canRefetch(m)) return send(res, 400, { error: 'Este arquivo foi enviado do computador. Como não há link para baixar de novo, ele não é apagado.' });
      if (m.status !== 'done' || m.refetching) return send(res, 409, { error: 'Aguarde o processamento terminar.' });
      if (!refetchReady(m)) return send(res, 501, { error: 'Este computador não tem yt-dlp ou ffmpeg para baixar a pregação de novo, então ela não é apagada.' });
      if (await exporting(b)) return send(res, 409, { error: 'Há um corte sendo exportado. Tente de novo quando terminar.' });
      if (!m.originalGone) await dropOriginal(m);
      return send(res, 200, await getMeta(b));
    }
    if (c === 'refetch' && method === 'POST') { // baixa o original de novo pelo link, sem transcrever outra vez
      if (m.refetching || refetchBusy.has(b)) return send(res, 202, m);
      if (!isGone(m)) return send(res, 200, m);
      if (!canRefetch(m)) return send(res, 400, { error: 'Não há link salvo para baixar este arquivo de novo.' });
      // O link baixa o vídeo inteiro de novo: o trecho da pregação é separado outra vez antes de liberar o vídeo.
      const ok = async (file, size) => { await update(b, { file, size, rangeApplied: false }); await applyRange(b); await update(b, { originalGone: false, refetching: false, refetchError: null, lastUsedAt: Date.now() }); makePreview(b); };
      const fail = (msg) => update(b, { refetching: false, refetchError: msg });
      if (m.source === 'youtube') {
        if (!tools.ytdlp || !tools.ffmpeg) return send(res, 501, { error: 'yt-dlp ou ffmpeg não está instalado neste computador.' });
        const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
        download(async () => { try { const f = await fetchYoutube(b, m.url); if (!f) return void (await fail('Não consegui baixar do YouTube. Confira se o vídeo ainda está no ar.')); await ok(f, (await fsp.stat(U(b, f))).size); } catch (e) { await fail('Falha ao baixar do YouTube: ' + e.message); } });
        return send(res, 202, mm);
      }
      const j = await body(req); const ref = parseDriveLink(m.url); if (!ref.ok) return send(res, 400, { error: ref.error });
      const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      refetchBusy.add(b);
      let dlr; try { dlr = await openDrive(ref, token); } catch (e) { refetchBusy.delete(b); return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin }); }
      const file = 'original' + path.extname(dlr.name).toLowerCase(); const mm = await update(b, { refetching: true, refetchError: null, originalGone: true });
      refetchBusy.delete(b); send(res, 202, mm);
      (async () => { try { await ok(file, await saveDriveStream(b, file, dlr)); } catch (e) { await fsp.rm(U(b, file), { force: true }); await fail('Falha ao baixar do Google Drive: ' + e.message); } })();
      return;
    }
    // Forma de onda de um trecho (o volume do som ao longo do tempo), para a linha do tempo do editor.
    // Forma de onda da pregação inteira, para o player de baixo. Calculada uma vez e guardada junto da pregação.
    if (c === 'peaks' && method === 'GET' && q.get('full')) {
      const N = 240, cache = U(b, 'peaks.json'), have = await readJson(cache, null);
      if (have && have.n === N && have.v === 2 && Array.isArray(have.peaks)) return send(res, 200, have);
      if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
      if (!peaksBusy.has(b)) peaksBusy.set(b, (async () => {
        const chunks = []; const pr = spawn(tools.ffmpeg, ['-v', 'error', '-i', U(b, m.file), '-vn', '-ac', '1', '-ar', '800', '-f', 's16le', 'pipe:1'], { windowsHide: true });
        pr.stdout.on('data', (dt) => chunks.push(dt)); pr.stderr.on('data', () => {});
        const code = await new Promise((r) => { pr.on('close', r); pr.on('error', () => r(1)); });
        const buf = Buffer.concat(chunks), total = Math.floor(buf.length / 2); if (code !== 0 || !total) return null;
        const peaks = new Array(N).fill(0);
        for (let i = 0; i < total; i++) { const x = Math.abs(buf.readInt16LE(i * 2)), k = Math.min(N - 1, Math.floor((i / total) * N)); if (x > peaks[k]) peaks[k] = x; }
        // A altura é medida contra um volume alto típico (95% das barras ficam abaixo dele), não contra o maior estalo: um pico isolado não achata o resto.
        const ref = Math.max(1, [...peaks].sort((x, y) => x - y)[Math.floor(N * 0.95)]), out = { n: N, v: 2, peaks: peaks.map((p) => +Math.min(1, p / ref).toFixed(3)) };
        await writeJson(cache, out).catch(() => {}); return out;
      })().finally(() => peaksBusy.delete(b)));
      const out = await peaksBusy.get(b);
      return out ? send(res, 200, out) : send(res, 502, { error: 'Não consegui ler o som desta pregação.' });
    }
    if (c === 'peaks' && method === 'GET') {
      const a = Math.max(0, +q.get('start') || 0), e = +q.get('end'), n = clamp(Math.round(+q.get('n') || 300), 50, 1200);
      if (!(e > a) || e - a > 1800) return send(res, 400, { error: 'Trecho inválido.' });
      if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
      const chunks = []; const pr = spawn(tools.ffmpeg, ['-v', 'error', '-ss', String(a), '-t', String(e - a), '-i', U(b, m.file), '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
      pr.stdout.on('data', (dt) => chunks.push(dt)); pr.stderr.on('data', () => {});
      const code = await new Promise((r) => { pr.on('close', r); pr.on('error', () => r(1)); });
      const buf = Buffer.concat(chunks), total = Math.floor(buf.length / 2);
      if (code !== 0 || !total) return send(res, 502, { error: 'Não consegui ler o som deste trecho.' });
      const peaks = new Array(n).fill(0);
      for (let i = 0; i < total; i++) { const v = Math.abs(buf.readInt16LE(i * 2)), k = Math.min(n - 1, Math.floor((i / total) * n)); if (v > peaks[k]) peaks[k] = v; }
      const mx = Math.max(1, ...peaks);
      return send(res, 200, { start: a, end: e, peaks: peaks.map((p) => +(p / mx).toFixed(3)) });
    }
    // Teste da sincronia: um trecho curto renderizado como o arquivo final (mesma leitura do vídeo e do som), em baixa resolução.
    if (c === 'synctest' && method === 'GET') {
      const at = Math.max(0, +q.get('at') || 0), len = clamp(+q.get('len') || 8, 1, 15), shift = cleanShift((m.audioShift || 0) + cleanShift(q.get('shift')));
      if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
      if (m.kind === 'aud') return send(res, 400, { error: 'Este arquivo é só áudio.' });
      touchUsed(b); await fsp.mkdir(U(b, 'clips'), { recursive: true });
      const orig = U(b, m.file), tmpFile = U(b, 'clips', `.teste-${crypto.randomBytes(6).toString('hex')}.mp4`), aStart = Math.max(0, at - shift);
      try {
        const ins = ['-y', '-v', 'error', '-ss', String(at), '-t', String(len), '-i', orig, ...(aStart !== at ? ['-ss', String(aStart), '-t', String(len), '-i', orig] : [])];
        const r = await run(tools.ffmpeg, [...ins, '-filter_complex', "[0:v]scale=-2:'min(480,ih)'[v]", '-map', '[v]', '-map', aStart !== at ? '1:a' : '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmpFile]);
        if (r.code !== 0) return send(res, 502, { error: 'Não consegui preparar o teste da sincronia.' });
        const buf = await fsp.readFile(tmpFile);
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': buf.length, 'cache-control': 'no-store' }); return res.end(buf);
      } finally { await fsp.rm(tmpFile, { force: true }).catch(() => {}); }
    }
    /* Sincronia automática: mede o atraso entre a fala e a boca (num trecho ou no vídeo inteiro) e diz se dá para
       corrigir. Com apply, grava sincronizado.mp4 ao lado do original (que não é alterado), sem recodificar a imagem. */
    // Sincronia da pregação inteira: um ajuste fixo do som que vale para todos os cortes (inclusive os já criados).
    // Cortes já exportados voltam a "novo", para sair de novo com o som no lugar.
    if (c === 'sync' && method === 'POST') {
      const j = await body(req), v = cleanShift(j.audioShift);
      const mm = await update(b, { audioShift: v, audioShiftAt: Date.now(), audioShiftAuto: j.auto && typeof j.auto === 'object' ? { offsetMs: +j.auto.offsetMs || 0, at: Date.now() } : null });
      let reset = 0;
      if ((m.audioShift || 0) !== v) await withLock('clips:' + b, async () => { const cl = await readJson(U(b, 'clips.json'), []); for (const k of cl) if (k.render && k.render.status === 'done') { k.render = null; delete k.drive; reset++; } await writeJson(U(b, 'clips.json'), cl); });
      log('sincronia da pregação', b, Math.round(v * 1000) + ' ms', reset ? `(${reset} cortes para exportar de novo)` : '');
      return send(res, 200, { ...mm, resetClips: reset });
    }
    if (c === 'autosync' && d === 'file' && method === 'GET') return serveFile(req, res, U(b, 'sincronizado.mp4'), 'video/mp4', m.name.replace(/\.[^.]+$/, '') + ' (sincronizado).mp4');
    if (c === 'autosync' && !d && method === 'POST') {
      if (!tools.autosync) return send(res, 501, { error: 'A sincronia automática não está instalada neste computador. Rode uma vez o arquivo install/instalar-autosync e abra o app de novo.' });
      if (!tools.ffmpeg) return send(res, 501, { error: 'O ffmpeg não está instalado.' });
      if (m.kind === 'aud') return send(res, 400, { error: 'Este arquivo é só áudio: não há boca para comparar com o som.' });
      if (m.status !== 'done') return send(res, 409, { error: 'Aguarde o processamento terminar.' });
      if (syncBusy) return send(res, 409, { error: 'Já há uma análise de sincronia em andamento. Aguarde terminar.' });
      const j = await body(req), dur = m.duration || 0;
      const start = clamp(+j.start || 0, 0, dur || 1e9), end = +j.end > 0 ? clamp(+j.end, 0, dur || 1e9) : 0;
      if (end && end - start < 3) return send(res, 400, { error: 'Trecho curto demais para medir a sincronia (mínimo de 3 segundos).' });
      syncBusy = true; touchUsed(b, true); const t0 = Date.now();
      try {
        const r = await autosync.analyze({ ...tools.autosync, ffmpeg: tools.ffmpeg, video: U(b, m.file), start, end, tmpDir: U(b) });
        log('sincronia automática', b, r.status, r.offsetMs === null ? '' : r.offsetMs + ' ms', `${Math.round((Date.now() - t0) / 1000)} s`);
        if (j.apply && r.needsCorrection) { await autosync.applyShift({ ffmpeg: tools.ffmpeg, input: U(b, m.file), output: U(b, 'sincronizado.mp4'), shiftSec: r.shiftSec }); r.file = `/api/uploads/${b}/autosync/file`; }
        return send(res, 200, r);
      } catch (e) { log('sincronia automática falhou', b, e.message); return send(res, 500, { error: e.message }); }
      finally { syncBusy = false; }
    }
    if (c === 'media' && method === 'GET') { const f = q.get('orig') ? m.file : playable(m); return serveFile(req, res, U(b, f), mime[path.extname(f)] || 'application/octet-stream', q.get('orig') ? m.name : undefined); }
    if (c === 'retry' && method === 'POST') { if (m.status === 'processing' || m.status === 'queued') return send(res, 409, { error: 'Já em processamento.' }); await update(b, { status: 'queued', stage: 'Na fila', progress: 0, error: null }); enqueue(() => pipeline(b)); return send(res, 200, { ok: true }); }
    if (c === 'speakers' && method === 'PATCH') {
      const j = await body(req); const tr = await readJson(U(b, 'transcript.json'), null); if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      const to = String(j.to || '').trim().slice(0, 60); if (!to) return send(res, 400, { error: 'Nome vazio' });
      tr.segments.forEach((s) => { if (s.speaker === j.from) s.speaker = to; }); await writeJson(U(b, 'transcript.json'), tr); return send(res, 200, { ok: true });
    }
    if (c === 'segments' && d && method === 'PATCH') { // editar texto de uma fala
      const j = await body(req); const tr = await readJson(U(b, 'transcript.json'), null); const s = tr && tr.segments[+d]; if (!s) return send(res, 404, { error: 'Fala não encontrada' });
      if (typeof j.text === 'string') s.text = j.text.slice(0, 5000); if (typeof j.speaker === 'string') s.speaker = j.speaker.slice(0, 60); await writeJson(U(b, 'transcript.json'), tr); return send(res, 200, { ok: true });
    }
    // cortes e IA: lib/routes-clips.js
    const clipAnswer = await clipRoutes({ c, d, b, m, parts, method, q, req, res }); if (clipAnswer !== NEXT) return clipAnswer;
  }

  if (a === 'library') {
    const idx = await readJson(LIB('index.json'), []);
    if (!b && method === 'GET') return send(res, 200, idx);
    if (!b && method === 'POST') {
      const name = (q.get('name') || 'imagem').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const buf = await rawBody(req, 8 * 1024 * 1024); const ext = sniffImage(buf);
      if (!buf.length || !ext) return send(res, 415, { error: 'Use uma imagem PNG, JPEG ou WebP (até 8 MB, só imagem parada).' });
      const id = rid(); await fsp.mkdir(LIB(), { recursive: true }); await fsp.writeFile(LIB(id + ext), buf);
      const it = { id, name, ext, size: buf.length, createdAt: Date.now() }; idx.push(it); await writeJson(LIB('index.json'), idx); return send(res, 201, it);
    }
    if (b && /^[a-z0-9]{6,32}$/.test(b)) {
      const it = idx.find((x) => x.id === b); if (!it) return send(res, 404, { error: 'Imagem não encontrada' });
      if (c === 'file' && method === 'GET') return serveFile(req, res, LIB(it.id + it.ext), IMG_EXT[it.ext]);
      if (!c && method === 'DELETE') { await fsp.rm(LIB(it.id + it.ext), { force: true }); await writeJson(LIB('index.json'), idx.filter((x) => x.id !== b)); return send(res, 200, { ok: true }); }
    }
  }
  if (a === 'translate' && method === 'POST') {
    const j = await body(req, 2 ** 20); const lang = LANGS[j.lang]; if (!lang) return send(res, 400, { error: 'Idioma não suportado.' });
    const items = (Array.isArray(j.texts) ? j.texts : []).slice(0, 300).filter((t) => t && /^\d{1,6}$/.test(String(t.id)) && typeof t.text === 'string').map((t) => ({ id: String(t.id), text: t.text.slice(0, 800) }));
    if (!items.length) return send(res, 400, { error: 'Nada para traduzir.' });
    const out = {};
    try {
      for (let i = 0; i < items.length; i += 40) {
        const part = items.slice(i, i + 40);
        const ans = await groqChat([{ role: 'system', content: `Você é um tradutor profissional de legendas. Traduza cada item para ${lang}, mantendo o sentido e o tom, sem acrescentar nada. Responda SOMENTE um array JSON de strings, na mesma ordem e com a mesma quantidade de itens.` }, { role: 'user', content: JSON.stringify(part.map((t) => t.text)) }]);
        const m = ans.match(/\[[\s\S]*\]/); let arr; try { arr = JSON.parse(m ? m[0] : ans); } catch { arr = null; }
        if (!Array.isArray(arr) || arr.length !== part.length) throw Object.assign(new Error('A tradução voltou em formato inesperado. Tente de novo.'), { status: 502 });
        part.forEach((t, k) => { out[t.id] = String(arr[k]).slice(0, 800); });
      }
    } catch (e) { return send(res, e.status || 502, { error: e.message }); }
    return send(res, 200, { lang: j.lang, translations: out });
  }
  const listFile = (n) => path.join(cfg.dataDir, n + '.json');
  if (a === 'templates') { // templates de legenda salvos no editor do corte
    const f = listFile(a), list = await readJson(f, []);
    if (method === 'GET' && !b) return send(res, 200, list);
    if (method === 'POST' && !b) { const j = await body(req); const name = String(j.name || '').trim().slice(0, 80); if (!name) return send(res, 400, { error: 'Nome vazio' }); const it = { id: rid(), name, createdAt: Date.now(), config: j.config && typeof j.config === 'object' ? cleanOpts({ captions: j.config }).cap : undefined }; list.push(it); await writeJson(f, list); return send(res, 201, it); }
    if (method === 'DELETE' && b) { await writeJson(f, list.filter((x) => x.id !== b)); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { api };
