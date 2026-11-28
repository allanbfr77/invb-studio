// Rotas da API (/api/...): o que cada pedido da tela faz.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { parseDriveLink, openDrive } = require('./drive');
const { splitLines } = require('./lines');
const { canRefetch } = require('./cleanup');
const { ytInfo } = require('./ytprogress');
const { cleanRange } = require('../public/range-utils.js');
const {
  VERSION,
  cfg,
  cloud,
  isCloud,
  settingsFile,
  transcribers,
  AI,
  LIB,
  IMG_EXT,
  rawBody,
  sniffImage,
  LANGS,
  groqChat,
  U,
  tooBig,
  tools,
} = require('./config');
const {
  sleep,
  rid,
  okId,
  readJson,
  writeJson,
  log,
  run,
  getMeta,
  saveMeta,
  listMeta,
  AUDIO,
  VIDEO,
  queueSize,
  enqueue,
  download,
  update,
  mime,
} = require('./store');
const { checkPw, makeCookie, authed, fails, isHttps, clientIp, send, body, serveFile, NEXT } = require('./http');
const { isGone, fetchYoutube, applyRange, makePreview, saveDriveStream } = require('./media');
const { pipeline } = require('./transcribe');
const { cleanOpts, clamp } = require('./render');
const CS = require('../public/caption-styles.js');
const FONTS = require('./fonts');
const SHARES = require('./shares');
const { clipRoutes } = require('./routes-clips');
const { mediaRoutes } = require('./routes-media');
const { searchSounds } = require('./sounds');
const PEXELS = require('./pexels');
const SOM = require('./audio-lib');
// INVB_FREESOUND_API_BASE só existe para os testes apontarem para um Freesound de mentira.
const FREESOUND_BASE = process.env.INVB_FREESOUND_API_BASE || 'https://freesound.org/apiv2';

// Endereço deste computador na rede (para o link de "Compartilhar" quando o Studio está aberto para a rede)
function lanUrl() {
  for (const list of Object.values(require('os').networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) return `http://${n.address}:${cfg.port}`;
  return null;
}
// O que o link público mostra: o vídeo exportado do corte e o título. Nada da pregação, da transcrição ou de outros cortes.
async function publicShare(req, res, token, what) {
  const sh = await SHARES.find(token);
  const gone = () => send(res, 404, { error: 'Este link não existe mais.' });
  if (!sh) return gone();
  const cl = (await readJson(U(sh.id, 'clips.json'), [])).find((x) => x.id === sh.clip);
  if (!cl || !cl.render || cl.render.status !== 'done' || !cl.render.file) return gone();
  const file = U(sh.id, 'clips', cl.render.file);
  if (!fs.existsSync(file)) return gone();
  if (what === 'video') return serveFile(req, res, file, mime[path.extname(file)] || 'video/mp4');
  if (what === 'info')
    return send(res, 200, {
      title: cl.title || 'Corte',
      vertical: !!cl.render.vertical || cl.render.format === '9:16',
      format: cl.render.format || null,
      seconds: cl.render.seconds || null,
    });
  return gone();
}

async function publicUpload(m, withData) {
  const id = m.id;
  const o = { ...m, canRefetch: canRefetch(m), originalGone: isGone(m) };
  if (!withData) return o;
  o.transcript = await readJson(U(id, 'transcript.json'), null);
  if (o.transcript) {
    o.transcript.lines = splitLines(o.transcript.segments);
    o.transcript.segments = o.transcript.segments.map(({ words, avg_logprob, ...s }) => s);
  }
  o.analysis = await readJson(U(id, 'analysis.json'), null);
  o.clips = await readJson(U(id, 'clips.json'), []);
  return o;
}

async function api(req, res, url, q) {
  const method = req.method,
    parts = url.split('/').filter(Boolean).slice(1); // sem "api"
  const [a, b, c, d] = parts;
  if (a === 'login' && method === 'POST') {
    const ip = clientIp(req),
      f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return send(res, 429, { error: 'Muitas tentativas. Aguarde 1 minuto.' });
    const j = await body(req);
    if (!checkPw(j.password)) {
      f.n++;
      if (f.n >= 5) {
        f.until = Date.now() + 60000;
        f.n = 0;
      }
      fails.set(ip, f);
      await sleep(400);
      return send(res, 401, { error: 'Senha incorreta.' });
    }
    fails.delete(ip);
    return send(
      res,
      200,
      { ok: true },
      {
        'set-cookie': `invb_sid=${makeCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${isHttps(req) ? '; Secure' : ''}`,
      },
    );
  }
  // Link público de um corte ("Compartilhar"): só o vídeo e o título daquele corte, sem login (ver lib/shares.js)
  if (a === 'public' && method === 'GET') return publicShare(req, res, b, c);
  if (a === 'me') return send(res, authed(req) ? 200 : 401, { ok: authed(req) });
  if (!authed(req)) return send(res, 401, { error: 'Não autenticado' });
  if (a === 'logout' && method === 'POST')
    return send(res, 200, { ok: true }, { 'set-cookie': 'invb_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  if (method !== 'GET' && req.headers['x-invb'] !== '1') return send(res, 403, { error: 'Requisição inválida' });

  // Editor avançado: aba Sons
  if (a === 'sounds' && b === 'search' && method === 'GET') {
    const r = await searchSounds(q, { apiKey: cfg.freesoundKey, base: FREESOUND_BASE });
    return send(res, r.status, r.body);
  }

  // Editor do corte, gaveta Apoio: imagens e vídeos do Pexels (lib/pexels.js)
  if (a === 'broll') {
    try {
      if (b === 'search' && method === 'GET')
        return send(res, 200, {
          items: await PEXELS.search(
            q.get('q'),
            q.get('kind') === 'video' ? 'video' : 'photo',
            q.get('orientation') || '',
          ),
        });
      if (!b && method === 'GET') return send(res, 200, await PEXELS.index());
      if (!b && method === 'POST') {
        const j = await body(req);
        return send(res, 201, await PEXELS.use(j.kind, j.pexelsId));
      }
      if (b && c === 'file' && method === 'GET') {
        const it = await PEXELS.find(b);
        if (!it) return send(res, 404, { error: 'Imagem de apoio não encontrada.' });
        return serveFile(
          req,
          res,
          PEXELS.fileOf(it),
          it.kind === 'video' ? 'video/mp4' : it.ext === '.png' ? 'image/png' : 'image/jpeg',
        );
      }
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  }

  // Editor do corte, gaveta Som: efeitos gerados aqui e músicas de fundo (lib/audio-lib.js)
  if (a === 'sfx') {
    try {
      if (b === 'search' && method === 'GET') return send(res, 200, { items: await SOM.searchSfx(q.get('q')) });
      if (b === 'fs' && method === 'POST') {
        const id = String((await body(req)).id || '');
        await SOM.fetchSfx(id);
        return send(res, 201, { type: 'fs' + id });
      }
      if (b && c === 'options' && method === 'GET') return send(res, 200, await SOM.sfxOptions(b));
      if (b && c === 'choose' && method === 'POST') return send(res, 200, await SOM.choose(b, (await body(req)).id));
      if (b && c === 'file' && method === 'GET') {
        const f = await SOM.sfxFile(b);
        return serveFile(req, res, f, f.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav');
      }
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  }
  if (a === 'music') {
    try {
      if (!b && method === 'GET') return send(res, 200, await SOM.musicIndex());
      if (b === 'search' && method === 'GET') return send(res, 200, { items: await SOM.searchMusic(q.get('q')) });
      if (b === 'freesound' && method === 'POST') return send(res, 201, await SOM.useFreesound((await body(req)).id));
      if (!b && method === 'POST')
        return send(res, 201, await SOM.uploadMusic(await rawBody(req, 40 * 1024 * 1024), q.get('name') || ''));
      if (b && c === 'file' && method === 'GET') {
        const it = await SOM.findMusic(b);
        if (!it) return send(res, 404, { error: 'Música não encontrada.' });
        const types = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
        return serveFile(req, res, SOM.musicFile(it), types[it.ext] || 'audio/mpeg');
      }
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  }

  // vocabulário da igreja para a transcrição e a revisão (data/vocabulario.txt)
  if (a === 'vocabulary') {
    const TR = require('./transcribe');
    if (method === 'GET') return send(res, 200, await TR.vocabulary());
    if (method === 'PUT') return send(res, 200, await TR.saveVocabulary((await body(req)).team));
  }
  // aba Gastos (lib/usage.js)
  if (a === 'usage') {
    const USAGE = require('./usage');
    if (!b && method === 'GET') return send(res, 200, await USAGE.summary(q.get('month')));
    if (b === 'settings' && method === 'PATCH') return send(res, 200, await USAGE.saveSettings(await body(req)));
  }

  if (a === 'status')
    return send(res, 200, {
      broll: !!(cfg.pexelsKey || cfg.pixabayKey),
      brollSource: PEXELS.provider() ? PEXELS.SOURCE[PEXELS.provider()] : null,
      musicSearch: !!cfg.freesoundKey,
      ffmpeg: !!tools.ffmpeg,
      libass: tools.libass !== false, // false = o ffmpeg instalado não desenha legenda (ver o aviso no app)
      ffmpegVersion: tools.ffmpegVersion || null,
      ffmpegPath: tools.ffmpeg || null,
      whisper: tools.whisper,
      ytdlp: !!tools.ytdlp,
      voiceAI: !!tools.demucs,
      autosync: !!tools.autosync,
      provider: cfg.provider,
      model: isCloud() ? cloud().model : cfg.whisperModel,
      driveClientId: cfg.googleClientId,
      ai: !!AI,
      driveCuts: !!(cfg.googleClientId && cfg.driveCutsFolder),
      // base dos links de "Compartilhar": o endereço público configurado, ou o da rede quando o Studio está aberto para ela
      shareBase: cfg.publicUrl || (cfg.host === '0.0.0.0' ? lanUrl() : null),
      cloudShare: !!cfg.blobToken,
      // pasta da equipe no Drive: o Editor avançado envia para ela direto do navegador (não é segredo, é o id da pasta)
      driveFolder: cfg.googleClientId && cfg.driveCutsFolder ? cfg.driveCutsFolder : null,
      provider_name: isCloud() ? cloud().name : 'Local',
      transcribers: transcribers(),
      aiName: AI ? AI.label : null,
      llm: !!AI,
      llmModel: AI ? AI.label : null,
      queue: queueSize(),
      version: VERSION,
    });

  if (a === 'transcriber' && method === 'POST') {
    const j = await body(req),
      t = transcribers().find((x) => x.id === j.provider);
    if (!t) return send(res, 400, { error: 'Opção de transcrição desconhecida.' });
    if (!t.ok) return send(res, 400, { error: t.why });
    cfg.provider = t.id;
    await writeJson(settingsFile(), { ...(await readJson(settingsFile(), {})), transcriber: t.id });
    log('transcrição agora:', t.name);
    return send(res, 200, { ok: true, provider: t.id });
  }

  if (a === 'uploads') {
    if (!b) {
      if (method === 'GET')
        return send(
          res,
          200,
          await Promise.all(
            (await listMeta()).map(async (m) => {
              const cl = await readJson(U(m.id, 'clips.json'), []);
              return {
                ...m,
                cuts: {
                  total: cl.length,
                  ready: cl.filter((k) => k.render && k.render.status === 'done').length,
                  drive: cl.filter((k) => k.drive && k.drive.link).length,
                },
              };
            }),
          ),
        );
      if (method === 'POST') {
        // corpo bruto do arquivo
        const name = (q.get('name') || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
        const ext = path.extname(name).toLowerCase();
        if (!AUDIO.has(ext) && !VIDEO.has(ext)) return send(res, 415, { error: 'Formato não suportado.' });
        let range;
        try {
          range = cleanRange({ start: q.get('start'), end: q.get('end') });
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
        const declared = +req.headers['content-length'] || 0;
        if (declared > cfg.maxUploadBytes) return send(res, 413, { error: tooBig(declared) });
        const id = rid(),
          file = 'original' + ext;
        await fsp.mkdir(U(id), { recursive: true });
        let n = 0;
        const ws = fs.createWriteStream(U(id, file));
        const fail = async (msg, code = 500) => {
          ws.destroy();
          await fsp.rm(U(id), { recursive: true, force: true });
          if (!res.headersSent) send(res, code, { error: msg });
        };
        req.on('data', (ch) => {
          n += ch.length;
          if (n > cfg.maxUploadBytes) {
            req.destroy();
            fail(tooBig(), 413);
          }
        });
        req.on('aborted', () => fail('Envio cancelado.'));
        req.pipe(ws);
        ws.on('error', () => fail('Falha ao gravar o arquivo.'));
        ws.on('finish', async () => {
          if (!n) return fail('Arquivo vazio.', 400);
          const m = {
            id,
            name,
            file,
            size: n,
            kind: AUDIO.has(ext) ? 'aud' : 'vid',
            createdAt: Date.now(),
            status: 'queued',
            stage: 'Na fila',
            progress: 0,
            source: 'upload',
            ...(range ? { range } : {}),
            ...(q.get('later') === '1' ? { later: true } : {}), // transcrever só depois de cortar no Editor avançado
          };
          await saveMeta(m);
          enqueue(() => pipeline(id));
          send(res, 201, m);
        });
        return;
      }
    }
    if (b === 'youtube' && method === 'POST') {
      const j = await body(req);
      if (!tools.ytdlp)
        return send(res, 501, {
          error: 'yt-dlp não está instalado neste computador (pip install yt-dlp). Envie o arquivo diretamente.',
        });
      if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(j.url || ''))
        return send(res, 400, { error: 'Link do YouTube inválido.' });
      let range;
      try {
        range = cleanRange(j.range);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
      const id = rid();
      await fsp.mkdir(U(id), { recursive: true });
      const m = {
        id,
        name: 'Importando do YouTube…',
        file: '',
        size: 0,
        kind: 'vid',
        createdAt: Date.now(),
        status: 'processing',
        stage: 'Baixando do YouTube',
        progress: 0,
        source: 'youtube',
        url: j.url,
        ...(range ? { range } : {}),
        ...(j.later ? { later: true } : {}),
      };
      await saveMeta(m);
      download(async () => {
        const [cmd, ...pre] = tools.ytdlp;
        const info = ytInfo(
            (await run(cmd, [...pre, '--no-playlist', '--print', '%(live_status)s\t%(title)s', j.url])).out,
          ),
          t = { out: info.title };
        if (info.live === 'is_live' || info.live === 'is_upcoming')
          return void (await update(id, {
            status: 'error',
            stage: 'Erro',
            error:
              info.live === 'is_live'
                ? 'Esta transmissão ainda está ao vivo. Espere ela terminar para importar.'
                : 'Esta transmissão ainda não começou.',
          }));
        // Live que acabou de terminar: o YouTube ainda está processando a gravação e só a entrega devagar, numa conexão.
        const postLive = info.live === 'post_live';
        if (postLive) {
          log('live recém-encerrada: o YouTube ainda está processando; o download será lento', id);
          await update(id, { liveNote: true });
        }
        const f = await fetchYoutube(
          id,
          j.url,
          (p) =>
            update(id, {
              stage:
                (postLive ? 'Live recém-encerrada, download lento. ' : '') +
                p.label +
                (p.detail ? ' (' + p.detail + ')' : ''),
              progress: p.pct,
            }).catch(() => {}),
          { slowOnly: postLive },
        );
        if (!f)
          return void (await update(id, {
            status: 'error',
            stage: 'Erro',
            error: postLive
              ? 'Não consegui baixar esta live recém-encerrada. O YouTube ainda está processando a gravação; tente de novo em algumas horas.'
              : 'Falha ao baixar o vídeo do YouTube.',
          }));
        const st = await fsp.stat(U(id, f));
        await update(id, { file: f, size: st.size, name: (t.out.trim() || 'video_do_youtube') + path.extname(f) });
        try {
          await applyRange(id);
        } catch (e) {
          return void (await update(id, { status: 'error', stage: 'Erro', error: e.message }));
        }
        makePreview(id);
        await update(id, { status: 'queued', stage: 'Na fila para transcrever', progress: 0 });
        enqueue(() => pipeline(id)); // a transcrição e a análise seguem na fila de processamento
      });
      return send(res, 201, m);
    }
    if (b === 'drive' && method === 'POST') {
      const j = await body(req);
      const ref = parseDriveLink(j.url);
      if (!ref.ok) return send(res, 400, { error: ref.error });
      let range;
      try {
        range = cleanRange(j.range);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
      const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
      let dlr;
      try {
        dlr = await openDrive(ref, token);
      } catch (e) {
        return send(res, e.status || 502, { error: e.message, needsLogin: !!e.needsLogin });
      }
      const ext = path.extname(dlr.name).toLowerCase();
      if (dlr.size > cfg.maxUploadBytes) {
        try {
          dlr.res.body.cancel();
        } catch {
          /* ok */
        }
        return send(res, 413, { error: tooBig(dlr.size) });
      }
      const id = rid(),
        file = 'original' + ext;
      await fsp.mkdir(U(id), { recursive: true });
      const m = {
        id,
        name: dlr.name,
        file,
        size: dlr.size,
        kind: AUDIO.has(ext) ? 'aud' : 'vid',
        createdAt: Date.now(),
        status: 'processing',
        stage: 'Baixando do Google Drive',
        progress: 0,
        source: 'drive',
        url: String(j.url).trim().slice(0, 500),
        ...(range ? { range } : {}),
        ...(j.later ? { later: true } : {}),
      };
      await saveMeta(m);
      send(res, 201, m);
      (async () => {
        // download em segundo plano (fora da fila de CPU)
        try {
          const n = await saveDriveStream(id, file, dlr, (pct) => update(id, { progress: pct }));
          await update(id, { size: n, status: 'queued', stage: 'Na fila', progress: 0 });
          enqueue(() => pipeline(id));
        } catch (e) {
          await update(id, { status: 'error', stage: 'Erro', error: 'Falha ao baixar do Google Drive: ' + e.message });
        }
      })();
      return;
    }
    if (!okId(b)) return send(res, 404, { error: 'Não encontrado' });
    const m = await getMeta(b);
    if (!m) return send(res, 404, { error: 'Envio não encontrado' });
    if (!c) {
      if (method === 'GET') return send(res, 200, await publicUpload(m, true));
      if (method === 'PATCH') {
        const j = await body(req);
        if (typeof j.name === 'string' && j.name.trim()) m.name = j.name.trim().slice(0, 160);
        await saveMeta(m);
        return send(res, 200, m);
      }
      if (method === 'DELETE') {
        await fsp.rm(U(b), { recursive: true, force: true });
        await SHARES.unshare(b); // os links públicos dos cortes dela deixam de abrir
        return send(res, 200, { ok: true });
      }
    }
    // vídeo, forma de onda e sincronia: lib/routes-media.js
    const mediaRoutesAnswer = await mediaRoutes({ c, d, b, m, method, q, req, res, a });
    if (mediaRoutesAnswer !== NEXT) return mediaRoutesAnswer;
    // desfazer a revisão antiga do Claude na transcrição (ela tirava a legenda do tempo do áudio)
    if (c === 'transcript' && d === 'undo-review' && method === 'POST') {
      if (m.status === 'processing' || m.status === 'queued')
        return send(res, 409, { error: 'Aguarde terminar o processamento.' });
      try {
        return send(res, 200, await require('./transcribe').undoReview(b));
      } catch (e) {
        return send(res, e.status || 500, { error: e.message });
      }
    }
    if (c === 'retry' && method === 'POST') {
      if (m.status === 'processing' || m.status === 'queued') return send(res, 409, { error: 'Já em processamento.' });
      const j = await body(req).catch(() => ({}));
      // "Transcrever agora": a pregação que esperava o corte no Editor avançado segue sem ele
      await update(b, {
        status: 'queued',
        stage: 'Na fila',
        progress: 0,
        error: null,
        ...(j && j.now ? { later: false } : {}),
      });
      enqueue(() => pipeline(b));
      return send(res, 200, { ok: true });
    }
    if (c === 'speakers' && method === 'PATCH') {
      const j = await body(req);
      const tr = await readJson(U(b, 'transcript.json'), null);
      if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
      const to = String(j.to || '')
        .trim()
        .slice(0, 60);
      if (!to) return send(res, 400, { error: 'Nome vazio' });
      tr.segments.forEach((s) => {
        if (s.speaker === j.from) s.speaker = to;
      });
      await writeJson(U(b, 'transcript.json'), tr);
      return send(res, 200, { ok: true });
    }
    if (c === 'segments' && d && method === 'PATCH') {
      // editar texto de uma fala
      const j = await body(req);
      const tr = await readJson(U(b, 'transcript.json'), null);
      const s = tr && tr.segments[+d];
      if (!s) return send(res, 404, { error: 'Fala não encontrada' });
      if (typeof j.text === 'string') s.text = j.text.slice(0, 5000);
      if (typeof j.speaker === 'string') s.speaker = j.speaker.slice(0, 60);
      await writeJson(U(b, 'transcript.json'), tr);
      return send(res, 200, { ok: true });
    }
    // cortes e IA: lib/routes-clips.js
    const clipAnswer = await clipRoutes({ c, d, b, m, parts, method, q, req, res });
    if (clipAnswer !== NEXT) return clipAnswer;
  }

  if (a === 'library') {
    const idx = await readJson(LIB('index.json'), []);
    if (!b && method === 'GET') return send(res, 200, idx);
    if (!b && method === 'POST') {
      const name = (q.get('name') || 'imagem').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const buf = await rawBody(req, 8 * 1024 * 1024);
      const ext = sniffImage(buf);
      if (!buf.length || !ext)
        return send(res, 415, { error: 'Use uma imagem PNG, JPEG ou WebP (até 8 MB, só imagem parada).' });
      const id = rid();
      await fsp.mkdir(LIB(), { recursive: true });
      await fsp.writeFile(LIB(id + ext), buf);
      const it = { id, name, ext, size: buf.length, createdAt: Date.now() };
      if (q.get('kind') === 'art') it.kind = 'art'; // feita na gaveta Arte: não aparece na lista de Mídia
      idx.push(it);
      await writeJson(LIB('index.json'), idx);
      return send(res, 201, it);
    }
    if (b && /^[a-z0-9]{6,32}$/.test(b)) {
      const it = idx.find((x) => x.id === b);
      if (!it) return send(res, 404, { error: 'Imagem não encontrada' });
      if (c === 'file' && method === 'GET') return serveFile(req, res, LIB(it.id + it.ext), IMG_EXT[it.ext]);
      if (!c && method === 'DELETE') {
        await fsp.rm(LIB(it.id + it.ext), { force: true });
        await writeJson(
          LIB('index.json'),
          idx.filter((x) => x.id !== b),
        );
        return send(res, 200, { ok: true });
      }
    }
  }
  if (a === 'editor-prefs') {
    // preferências do editor que valem para os cortes novos (hoje: o formato padrão). data/editor-prefs.json
    const f = path.join(cfg.dataDir, 'editor-prefs.json'),
      prefs = await readJson(f, { format: null });
    if (method === 'GET' && !b) return send(res, 200, prefs);
    if (method === 'PATCH' && !b) {
      const j = await body(req);
      if ('format' in j) prefs.format = ['16:9', '9:16', '1:1', '4:5', 'orig'].includes(j.format) ? j.format : null;
      await writeJson(f, prefs);
      return send(res, 200, prefs);
    }
  }
  if (a === 'fonts') {
    // fontes enviadas pela equipe: data/fonts/ (ver lib/fonts.js)
    if (!b && method === 'GET') return send(res, 200, await FONTS.list());
    if (!b && method === 'POST') {
      const buf = await rawBody(req, 10 * 1024 * 1024);
      try {
        return send(res, 201, await FONTS.add(buf, q.get('name') || ''));
      } catch (e) {
        return send(res, e.status || 500, { error: e.message });
      }
    }
    if (b && /^[a-z0-9]{6,32}$/.test(b)) {
      const it = (await FONTS.list()).find((f) => f.id === b);
      if (!it) return send(res, 404, { error: 'Fonte não encontrada.' });
      if (c === 'file' && method === 'GET')
        return serveFile(req, res, FONTS.fontFile(it), it.ext === '.otf' ? 'font/otf' : 'font/ttf');
      if (!c && method === 'DELETE') {
        await FONTS.remove(b);
        return send(res, 200, { ok: true });
      }
    }
  }
  if (a === 'arts') {
    // artes feitas com HTML e CSS na gaveta Arte. O código fica aqui; a imagem (PNG transparente) fica na biblioteca.
    const f = path.join(cfg.dataDir, 'arts.json'),
      list = await readJson(f, []);
    const clean = (j, old = {}) => ({
      name:
        String(j.name ?? old.name ?? 'Arte')
          .trim()
          .slice(0, 60) || 'Arte',
      w: clamp(Math.round(+j.w || old.w || 1080), 20, 3840),
      h: clamp(Math.round(+j.h || old.h || 400), 20, 3840),
      html: String(j.html ?? old.html ?? '').slice(0, 60000),
      css: String(j.css ?? old.css ?? '').slice(0, 60000),
      imgId: /^[a-z0-9]{6,32}$/.test(j.imgId || '') ? j.imgId : old.imgId || null,
    });
    if (!b && method === 'GET') return send(res, 200, list);
    if (!b && method === 'POST') {
      if (list.length >= 200) return send(res, 400, { error: 'Limite de 200 artes. Exclua alguma antes.' });
      const it = { id: rid(), createdAt: Date.now(), updatedAt: Date.now(), ...clean(await body(req, 2 ** 20)) };
      list.push(it);
      await writeJson(f, list);
      return send(res, 201, it);
    }
    const it = b && list.find((x) => x.id === b);
    if (b && !it) return send(res, 404, { error: 'Arte não encontrada.' });
    if (method === 'PATCH' && it) {
      Object.assign(it, clean(await body(req, 2 ** 20), it), { updatedAt: Date.now() });
      await writeJson(f, list);
      return send(res, 200, it);
    }
    if (method === 'DELETE' && it) {
      await writeJson(
        f,
        list.filter((x) => x.id !== b),
      );
      return send(res, 200, { ok: true });
    }
  }
  if (a === 'translate' && method === 'POST') {
    const j = await body(req, 2 ** 20);
    const lang = LANGS[j.lang];
    if (!lang) return send(res, 400, { error: 'Idioma não suportado.' });
    const items = (Array.isArray(j.texts) ? j.texts : [])
      .slice(0, 300)
      .filter((t) => t && /^\d{1,6}$/.test(String(t.id)) && typeof t.text === 'string')
      .map((t) => ({ id: String(t.id), text: t.text.slice(0, 800) }));
    if (!items.length) return send(res, 400, { error: 'Nada para traduzir.' });
    const out = {};
    try {
      for (let i = 0; i < items.length; i += 40) {
        const part = items.slice(i, i + 40);
        const ans = await groqChat([
          {
            role: 'system',
            content: `Você é um tradutor profissional de legendas. Traduza cada item para ${lang}, mantendo o sentido e o tom, sem acrescentar nada. Responda SOMENTE um array JSON de strings, na mesma ordem e com a mesma quantidade de itens.`,
          },
          { role: 'user', content: JSON.stringify(part.map((t) => t.text)) },
        ]);
        const m = ans.match(/\[[\s\S]*\]/);
        let arr;
        try {
          arr = JSON.parse(m ? m[0] : ans);
        } catch {
          arr = null;
        }
        if (!Array.isArray(arr) || arr.length !== part.length)
          throw Object.assign(new Error('A tradução voltou em formato inesperado. Tente de novo.'), { status: 502 });
        part.forEach((t, k) => {
          out[t.id] = String(arr[k]).slice(0, 800);
        });
      }
    } catch (e) {
      return send(res, e.status || 502, { error: e.message });
    }
    return send(res, 200, { lang: j.lang, translations: out });
  }
  const listFile = (n) => path.join(cfg.dataDir, n + '.json');
  if (a === 'caption-styles') {
    // estilos de legenda salvos pela pessoa (painel Legendas > Personalizar > Salvar como meu estilo)
    // e qual deles é o padrão dos cortes novos. Ficam em data/caption-styles.json, neste computador.
    const f = listFile(a),
      data = await readJson(f, { styles: [], defaultId: null });
    const save = () => writeJson(f, data);
    const clean = (j) => ({
      base: CS.byName(j.base).id,
      props: CS.cleanProps(j.props),
      size: clamp(+j.size || 16, 10, 32),
      pos: ['bottom', 'middle', 'top'].includes(j.pos) ? j.pos : 'bottom',
      margin:
        j.margin === null || j.margin === undefined || !Number.isFinite(+j.margin) ? null : clamp(+j.margin, 0, 40),
    });
    if (method === 'GET' && !b) return send(res, 200, data);
    if (method === 'POST' && !b) {
      const j = await body(req),
        name = String(j.name || '')
          .trim()
          .slice(0, 60);
      if (!name) return send(res, 400, { error: 'Dê um nome ao estilo.' });
      if (data.styles.length >= 100)
        return send(res, 400, { error: 'Limite de 100 estilos salvos. Exclua algum antes.' });
      const it = { id: rid(), name, createdAt: Date.now(), ...clean(j) };
      data.styles.push(it);
      if (j.default) data.defaultId = it.id;
      await save();
      return send(res, 201, { style: it, defaultId: data.defaultId });
    }
    const it = b && data.styles.find((x) => x.id === b);
    if (b && !it) return send(res, 404, { error: 'Estilo não encontrado.' });
    if (method === 'PATCH' && it) {
      const j = await body(req);
      if (typeof j.name === 'string' && j.name.trim()) it.name = j.name.trim().slice(0, 60);
      if (j.props) Object.assign(it, clean({ ...it, ...j, base: j.base || it.base }));
      if (j.default === true) data.defaultId = it.id;
      if (j.default === false && data.defaultId === it.id) data.defaultId = null;
      await save();
      return send(res, 200, { style: it, defaultId: data.defaultId });
    }
    if (method === 'DELETE' && it) {
      data.styles = data.styles.filter((x) => x.id !== b);
      if (data.defaultId === b) data.defaultId = null;
      await save();
      return send(res, 200, { ok: true, defaultId: data.defaultId });
    }
  }
  if (a === 'templates') {
    // templates salvos no editor do corte: o estilo da legenda e o que está por cima (textos, imagens e artes)
    const tplConfig = (cf) =>
      cf && typeof cf === 'object'
        ? { ...cleanOpts({ captions: cf }).cap, overlays: cleanOpts({ overlays: cf.overlays }).overlays }
        : undefined;
    const f = listFile(a),
      list = await readJson(f, []);
    if (method === 'GET' && !b) return send(res, 200, list);
    if (method === 'POST' && !b) {
      const j = await body(req);
      const name = String(j.name || '')
        .trim()
        .slice(0, 80);
      if (!name) return send(res, 400, { error: 'Nome vazio' });
      const it = { id: rid(), name, createdAt: Date.now(), config: tplConfig(j.config) };
      list.push(it);
      await writeJson(f, list);
      return send(res, 201, it);
    }
    // atualizar um template meu: com o visual atual do corte e/ou outro nome
    const it = b && list.find((x) => x.id === b);
    if (method === 'PATCH' && it) {
      const j = await body(req);
      const name = String(j.name || '')
        .trim()
        .slice(0, 80);
      if (name) it.name = name;
      if (j.config && typeof j.config === 'object') it.config = tplConfig(j.config);
      it.updatedAt = Date.now();
      await writeJson(f, list);
      return send(res, 200, it);
    }
    if (method === 'DELETE' && b) {
      await writeJson(
        f,
        list.filter((x) => x.id !== b),
      );
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { api };
