// Rotas dos cortes de uma pregação (/api/uploads/<id>/clips/... e as de IA): criar, ajustar, exportar,
// enviar ao Drive, gerar texto e sugerir cortes. Chamado por lib/routes.js.

const fsp = require('fs').promises;
const path = require('path');
const { analyze } = require('./analyze');
const { ensureFolder, uploadFile } = require('./drive');
const { splitLines } = require('./lines');
const { parseCutList, buildPrompt } = require('./cutlist');
const { canRefetch } = require('./cleanup');
const { altTitles, shortenCut, describeCut, suggestCuts, toAutoClips } = require('./claude');
const { AI, U, cfg, manualClip, tools } = require('./config');
const { readJson, log, withLock, writeJson, mime, enqueue } = require('./store');
const { send, body, serveFile, NEXT } = require('./http');
const { aiBusy, cleanPost, driveBusy, isGone, touchUsed } = require('./media');
const { autoClips } = require('./transcribe');
const { clipKit, renders, renderClip, clipWords } = require('./render');
const SHARES = require('./shares');

async function clipRoutes({ c, d, b, m, parts, method, q, req, res }) {
  if (c === 'clips' && d && parts[4] === 'ai' && parts[5] === 'refine' && method === 'POST') {
    // outros títulos ou uma versão mais curta do corte, pela IA
    if (!AI) return send(res, 501, { error: 'Os recursos de IA não estão ativos neste computador.' });
    const j = await body(req),
      cl = (await readJson(U(b, 'clips.json'), [])).find((x) => x.id === d);
    if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    if (aiBusy.has(b + ':' + d)) return send(res, 409, { error: 'A IA já está trabalhando neste corte.' });
    const lines = splitLines(tr.segments),
      name = m.name.replace(/\.[^.]+$/, '');
    aiBusy.add(b + ':' + d);
    try {
      if (j.mode === 'titles')
        return send(res, 200, {
          titles: await altTitles({
            ask: AI.ask,
            name,
            text: lines
              .filter((l) => l.end > cl.start && l.start < cl.end)
              .map((l) => l.text)
              .join(' '),
            current: cl.title,
          }),
        });
      if (j.mode === 'shorter')
        return send(res, 200, await shortenCut({ ask: AI.ask, name, lines, start: cl.start, end: cl.end }));
      return send(res, 400, { error: 'Pedido inválido.' });
    } catch (e) {
      log('erro no ajuste do corte pela IA', b, d, e.message);
      return send(res, e.status === 401 ? 502 : e.status || 502, { error: e.message });
    } finally {
      aiBusy.delete(b + ':' + d);
    }
  }
  if (c === 'clips' && d && parts[4] === 'ai' && parts[5] === 'post' && method === 'POST') {
    // título, descrição e hashtags do corte, pelo Claude
    if (!AI) return send(res, 501, { error: 'Os recursos de IA não estão ativos neste computador.' });
    const cl = (await readJson(U(b, 'clips.json'), [])).find((x) => x.id === d);
    if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    if (aiBusy.has(b + ':' + d)) return send(res, 409, { error: 'O texto deste corte já está sendo gerado.' });
    const text = splitLines(tr.segments)
      .filter((l) => l.end > cl.start && l.start < cl.end)
      .map((l) => l.text)
      .join(' ');
    aiBusy.add(b + ':' + d);
    try {
      const post = cleanPost(
        await describeCut({ ask: AI.ask, name: m.name.replace(/\.[^.]+$/, ''), text, seconds: cl.end - cl.start }),
      );
      await withLock('clips:' + b, async () => {
        const l = await readJson(U(b, 'clips.json'), []);
        const t = l.find((x) => x.id === d);
        if (t) {
          t.post = post;
          await writeJson(U(b, 'clips.json'), l);
        }
      });
      return send(res, 200, { post });
    } catch (e) {
      log('erro na IA', b, d, e.message);
      return send(res, e.status === 401 ? 502 : e.status || 502, { error: e.message });
    } finally {
      aiBusy.delete(b + ':' + d);
    }
  }
  if (c === 'clips' && d && parts[4] === 'drive' && method === 'POST') {
    // envia o corte pronto para a pasta da equipe
    if (!cfg.driveCutsFolder)
      return send(res, 501, { error: 'Pasta da equipe não configurada (DRIVE_CUTS_FOLDER_ID).' });
    const j = await body(req);
    const token = typeof j.token === 'string' && /^[\w.\-]{20,2048}$/.test(j.token) ? j.token : null;
    if (!token) return send(res, 403, { error: 'Entre com o Google para enviar ao Drive.', needsLogin: true });
    const cl = (await readJson(U(b, 'clips.json'), [])).find((x) => x.id === d);
    if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
    if (!cl.render || cl.render.status !== 'done')
      return send(res, 409, { error: 'Exporte o corte antes de enviar ao Drive.' });
    if (driveBusy.has(b))
      return send(res, 409, { error: 'Já há um envio ao Drive em andamento para esta pregação. Aguarde terminar.' });
    driveBusy.add(b);
    const clean = (s, fb) =>
      String(s || '')
        .replace(/[^\p{L}\p{N} _.-]/gu, '')
        .trim()
        .slice(0, 80) || fb;
    const ext = path.extname(cl.render.file),
      file = U(b, 'clips', cl.render.file);
    try {
      const folder = await ensureFolder(token, cfg.driveCutsFolder, clean(m.name.replace(/\.[^.]+$/, ''), 'Culto'));
      // Primeiro o texto e a legenda (pequenos): se o Google recusar, o vídeo não chega a subir pela metade do kit.
      const base = clean(cl.title, 'corte'),
        kit = await clipKit(b, m, cl);
      await uploadFile(token, { folderId: folder, name: `${base} - texto.txt`, filePath: kit.txt, mime: 'text/plain' });
      if (kit.srt)
        await uploadFile(token, {
          folderId: folder,
          name: `${base}.srt`,
          filePath: kit.srt,
          mime: 'application/x-subrip',
        });
      const up = await uploadFile(token, {
        folderId: folder,
        name: base + ext,
        filePath: file,
        mime: mime[ext] || 'application/octet-stream',
      });
      const drive = { link: up.webViewLink, at: Date.now(), srt: !!kit.srt };
      await withLock('clips:' + b, async () => {
        const l = await readJson(U(b, 'clips.json'), []);
        const t = l.find((x) => x.id === d);
        if (t) {
          t.drive = drive;
          delete t.driveError;
          await writeJson(U(b, 'clips.json'), l);
        }
      });
      return send(res, 200, { webViewLink: up.webViewLink, drive });
    } catch (e) {
      log('erro ao enviar ao Drive', b, d, e.message, e.reason || '', e.detail || '');
      // O motivo fica guardado no corte: aparece no cartão e dá para conferir depois, sem depender do aviso na tela.
      const driveError = {
        msg: String(e.message || '').slice(0, 400),
        google: [e.status, e.reason, e.detail].filter(Boolean).join(' | ').slice(0, 400),
        at: Date.now(),
      };
      await withLock('clips:' + b, async () => {
        const l = await readJson(U(b, 'clips.json'), []);
        const t = l.find((x) => x.id === d);
        if (t) {
          t.driveError = driveError;
          await writeJson(U(b, 'clips.json'), l);
        }
      }).catch(() => {});
      return send(res, e.status === 401 ? 403 : e.status || 502, {
        error: e.message,
        needsLogin: !!e.needsLogin,
        wrongAccount: !!e.wrongAccount,
      });
    } finally {
      driveBusy.delete(b);
    }
  }
  if (c === 'clips') {
    await withLock('clips:' + b, async () => {
      let clips = await readJson(U(b, 'clips.json'), []);
      if (!d && method === 'GET') return send(res, 200, clips);
      if (!d && method === 'POST') {
        const j = await body(req);
        const dur = m.duration || 0;
        const st = Math.max(0, +j.start || 0),
          en = Math.min(dur || 1e9, +j.end || 0);
        if (!(en - st >= 3)) return send(res, 400, { error: 'Corte precisa ter ao menos 3 segundos.' });
        const cl = manualClip(j.title, st, en);
        clips.push(cl);
        await writeJson(U(b, 'clips.json'), clips);
        return send(res, 201, cl);
      }
      if (d === 'bulk' && !parts[4] && method === 'POST') {
        // lista de minutagens colada (ex.: sugestões do Claude)
        const j = await body(req);
        const r = parseCutList(j.text, m.duration || 0);
        const created = r.cuts.map((c) => manualClip(c.title, c.start, c.end));
        if (created.length) {
          clips.push(...created);
          await writeJson(U(b, 'clips.json'), clips);
        }
        return send(res, 201, { created, rejected: r.rejected, adjusted: r.adjusted });
      }
      const cl = clips.find((x) => x.id === d);
      if (!cl) return send(res, 404, { error: 'Corte não encontrado' });
      if (!parts[4] && method === 'PATCH') {
        const j = await body(req);
        for (const k of ['fav', 'hid']) if (typeof j[k] === 'boolean') cl[k] = j[k];
        if (typeof j.title === 'string' && j.title.trim()) cl.title = j.title.trim().slice(0, 120);
        if (+j.start >= 0 && +j.end > +j.start) {
          cl.start = +j.start;
          cl.end = +j.end;
          cl.render = null;
          delete cl.drive;
          delete cl.post;
          if (cl.editor) {
            delete cl.editor.start;
            delete cl.editor.end;
            cl.editor.removed = [];
          }
        }
        // Edição salva do corte (formato, legenda, velocidade, trechos removidos...): o editor reabre do jeito que ficou.
        // Edição diferente da anterior: a exportação antiga deixa de valer (o próximo download sai com a edição nova).
        const sameEdit = (x, y) => {
          const f = (o) => JSON.stringify({ ...(o || {}), at: 0 });
          return f(x) === f(y);
        };
        if (j.editor === null) delete cl.editor;
        else if (
          j.editor &&
          typeof j.editor === 'object' &&
          !Array.isArray(j.editor) &&
          JSON.stringify(j.editor).length <= 400000
        ) {
          if (!sameEdit(cl.editor, j.editor) && !(cl.render && cl.render.status === 'rendering')) {
            cl.render = null;
            delete cl.drive;
          }
          cl.editor = { ...j.editor, at: Date.now() };
        }
        if (j.post && typeof j.post === 'object') cl.post = cleanPost(j.post);
        await writeJson(U(b, 'clips.json'), clips);
        return send(res, 200, cl);
      }
      if (!parts[4] && method === 'DELETE') {
        // excluir o corte: para a exportação em andamento e apaga os arquivos dele (vídeo, legenda, temporários)
        const stt = renders.get(`${b}:${d}`);
        if (stt) {
          stt.cancelled = true;
          try {
            stt.proc && stt.proc.kill();
          } catch {
            /* ok */
          }
        }
        await writeJson(
          U(b, 'clips.json'),
          clips.filter((x) => x.id !== d),
        );
        const files = await fsp.readdir(U(b, 'clips')).catch(() => []);
        for (const f of files)
          if (f.startsWith(d + '.') || f.startsWith(d + '-'))
            await fsp.rm(U(b, 'clips', f), { recursive: true, force: true }).catch(() => {});
        await SHARES.unshare(b, d); // o link público do corte deixa de abrir
        return send(res, 200, { ok: true });
      }
      // "Compartilhar": link público só deste corte (/v/<código>), sem login. O corte precisa estar exportado.
      if (parts[4] === 'share') {
        if (method === 'GET') return send(res, 200, { token: await SHARES.tokenOf(b, d) });
        if (method === 'DELETE') {
          await SHARES.unshare(b, d);
          return send(res, 200, { ok: true });
        }
        if (method === 'POST') {
          if (!cl.render || cl.render.status !== 'done')
            return send(res, 409, { error: 'Exporte o corte antes de compartilhar (botão Baixar corte).' });
          const token = await SHARES.share(b, d);
          return send(res, 200, { token, path: '/v/' + token });
        }
      }
      if (parts[4] === 'render' && parts[5] === 'cancel' && method === 'POST') {
        const stt = renders.get(`${b}:${d}`);
        if (stt) {
          stt.cancelled = true;
          try {
            stt.proc && stt.proc.kill();
          } catch {
            /* ok */
          }
        }
        return send(res, 200, { ok: true });
      }
      if (parts[4] === 'render' && method === 'POST') {
        if (!tools.ffmpeg) return send(res, 501, { error: 'ffmpeg indisponível.' });
        if (m.refetching || isGone(m))
          return send(res, 410, {
            error: 'A pregação saiu deste computador para liberar espaço. Abra o envio e clique em "Baixar de novo".',
            originalGone: true,
            canRefetch: canRefetch(m),
          });
        touchUsed(b, true);
        const j = await body(req);
        cl.render = { status: 'rendering' };
        delete cl.drive;
        await writeJson(U(b, 'clips.json'), clips);
        enqueue(() => renderClip(b, d, j));
        return send(res, 202, cl);
      }
      if (parts[4] === 'file' && method === 'GET') {
        if (!cl.render || cl.render.status !== 'done') return send(res, 404, { error: 'Corte ainda não renderizado.' });
        cl.downloaded = true;
        await writeJson(U(b, 'clips.json'), clips);
        return serveFile(
          req,
          res,
          U(b, 'clips', cl.render.file),
          mime[path.extname(cl.render.file)],
          `${(cl.title || 'corte').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'corte'}${path.extname(cl.render.file)}`,
        );
      }

      if (!res.writableEnded) send(res, 404, { error: 'Rota não encontrada' });
    });
    return;
  }
  if (c === 'ai' && d === 'cuts' && method === 'POST') {
    // sugestões de corte pelo Claude, só para quem tem a chave
    if (!AI) return send(res, 501, { error: 'Os recursos de IA não estão ativos neste computador.' });
    if (aiBusy.has(b)) return send(res, 409, { error: 'Já há uma análise com IA em andamento para esta pregação.' });
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    const j = await body(req);
    aiBusy.add(b);
    try {
      const cuts = await suggestCuts({
        ask: AI.ask,
        name: m.name,
        lines: splitLines(tr.segments),
        duration: m.duration || 0,
        count: j.count,
      });
      const created = toAutoClips(cuts, 'i'); // vão para a aba Automáticos; a aba Manuais é só do que a pessoa cria
      if (created.length)
        await withLock('clips:' + b, async () => {
          const l = await readJson(U(b, 'clips.json'), []);
          await writeJson(U(b, 'clips.json'), [...l, ...created]);
        });
      log('IA sugeriu cortes', b, created.length);
      return send(res, 201, { created });
    } catch (e) {
      log('erro na IA', b, e.message);
      return send(res, e.status === 401 ? 502 : e.status || 502, { error: e.message });
    } finally {
      // 401 da API do Claude não pode derrubar a sessão do app
      aiBusy.delete(b);
    }
  }
  if (c === 'claude' && method === 'GET') {
    // transcrição em linhas curtas, pronta para colar no Claude
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    return send(res, 200, { text: buildPrompt(m.name, splitLines(tr.segments)) });
  }
  if (c === 'words' && method === 'GET') {
    // palavras (com tempo) de um trecho, para a prévia da legenda
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    const st0 = Math.max(0, +q.get('start') || 0),
      ws0 = clipWords(tr, { start: st0, end: +q.get('end') || 1e9 });
    return send(
      res,
      200,
      q.get('abs') ? ws0.map((w) => ({ ...w, s: +(w.s + st0).toFixed(3), e: +(w.e + st0).toFixed(3) })) : ws0,
    );
  }
  if (c === 'reanalyze' && method === 'POST') {
    const tr = await readJson(U(b, 'transcript.json'), null);
    if (!tr) return send(res, 409, { error: 'Sem transcrição.' });
    enqueue(async () => {
      const an = await analyze(cfg, tr, log);
      await writeJson(U(b, 'analysis.json'), an);
      const fresh = await autoClips(b, tr, an);
      await withLock('clips:' + b, async () => {
        const old = await readJson(U(b, 'clips.json'), []);
        await writeJson(U(b, 'clips.json'), [...fresh, ...old.filter((x) => x.manual)]);
      });
    });
    return send(res, 202, { ok: true });
  }
  return NEXT;
}

module.exports = { clipRoutes };
