// Transcrição (neste computador ou na nuvem) e o passo a passo de uma pregação nova: áudio, transcrição, análise e cortes automáticos.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { analyze } = require('./analyze');
const { splitLines } = require('./lines');
const { suggestCuts, toAutoClips } = require('./claude');
const { ROOT, cfg, cloud, isCloud, AI, U, tools } = require('./config');
const { sleep, readJson, withLock, writeJson, log, run, getMeta, update, mediaDuration } = require('./store');
const { applyRange } = require('./media');

async function transcribeLocal(id, audio, setProgress) {
  const out = U(id, 'whisper.json');
  let errMsg = '';
  const r = await run(cfg.python, [path.join(ROOT, 'worker', 'transcribe.py'), audio, '--out', out, '--model', cfg.whisperModel, '--device', cfg.whisperDevice, '--language', cfg.language], {
    onStdout: (d) => d.split('\n').forEach((l) => { try { const j = JSON.parse(l); if (j.type === 'progress') setProgress(j.pct); if (j.type === 'stage') setProgress(0, j.stage); if (j.type === 'error') errMsg = j.message; } catch { /* ruído */ } }),
  });
  if (r.code !== 0) throw new Error(errMsg || r.err.split('\n').filter(Boolean).pop() || 'falha na transcrição local');
  return readJson(out, null);
}

const fmtWait = (sec) => (sec >= 90 ? `${Math.ceil(sec / 60)} min` : `${Math.ceil(sec)} s`);
// Espera mostrando a contagem regressiva; aborta se o envio for excluído durante a espera.
async function waitCountdown(id, sec, label) {
  const end = Date.now() + sec * 1000;
  for (;;) {
    const left = (end - Date.now()) / 1000;
    if (left <= 0) return;
    if (!(await getMeta(id))) throw new Error('Envio removido durante a espera.');
    label(left);
    await sleep(Math.min(15, left) * 1000);
  }
}

// Transcrição em blocos de 20 min (Groq/OpenAI). Respeita o limite de áudio por hora esperando o tempo
// indicado pela API e RETOMA do bloco em que parou (partial.json), inclusive após reinício ou erro.
async function transcribeOpenAI(id, audio, dur, setProgress, P = cfg.provider) {
  const dir = U(id, 'chunks'); await fsp.mkdir(dir, { recursive: true });
  const seg = 1200, partialFile = U(id, 'partial.json'), C0 = cloud(P);
  let files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.mp3')).sort();
  if (!files.length) {
    const r = await run(tools.ffmpeg, ['-y', '-i', audio, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', '-f', 'segment', '-segment_time', String(seg), path.join(dir, 'c%03d.mp3')]);
    if (r.code !== 0) throw new Error('ffmpeg falhou ao dividir o áudio');
    files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.mp3')).sort();
  }
  let segments = [], language = '', k0 = 0;
  const part = await readJson(partialFile, null);
  if (part && part.total === files.length && part.model === C0.model) { segments = part.segments; language = part.language; k0 = part.next; log('retomando', id, 'no bloco', k0 + 1, 'de', files.length); }
  const MAX_WAIT = 4 * 3600; let waited = 0;
  for (let k = k0; k < files.length; k++) {
    const C = cloud(P), buf = await fsp.readFile(path.join(dir, files[k])), pct = Math.round((k / files.length) * 99);
    let res, tries5xx = 0;
    for (let attempt = 0; ; attempt++) {
      const fd = new FormData();
      fd.append('file', new Blob([buf]), files[k]);
      fd.append('model', C.model); fd.append('response_format', 'verbose_json'); fd.append('temperature', '0');
      fd.append('timestamp_granularities[]', 'word'); fd.append('timestamp_granularities[]', 'segment');
      if (cfg.language !== 'auto') fd.append('language', cfg.language);
      try { res = await fetch(`${C.base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${C.key}` }, body: fd }); }
      catch (e) { if (tries5xx++ < 4) { await sleep(5000 * tries5xx); continue; } throw new Error(`Sem conexão com a ${C.name}.`); }
      if (res.ok) break;
      if (res.status === 429) { // limite de áudio/requisições: espera o que a API pedir e tenta o MESMO bloco de novo
        const ra = +res.headers.get('retry-after');
        const wait = Math.min(3600, ra > 0 ? Math.max(5, ra + 2) : Math.min(300, 30 * (attempt + 1)));
        if (waited + wait > MAX_WAIT) throw new Error(`Limite da ${C.name} persistiu por mais de 4 horas. Use “Tentar de novo” depois: o progresso já feito foi guardado.`);
        waited += wait; log('limite', C.name, 'bloco', k + 1, 'espera', Math.round(wait), 's');
        await waitCountdown(id, wait, (left) => setProgress(pct, `Aguardando limite da ${C.name}: retoma em ${fmtWait(left)} (bloco ${k + 1}/${files.length})`));
        continue;
      }
      if (res.status >= 500 && tries5xx++ < 4) { await sleep(5000 * tries5xx); continue; }
      const txt = (await res.text()).slice(0, 200);
      throw new Error(res.status === 401 ? `Chave da ${C.name} inválida ou sem permissão.` : `${C.name} ${res.status}: ${txt}`);
    }
    const j = await res.json(); language = language || j.language || '';
    const off = k * seg, words = j.words || [];
    for (const s of j.segments || []) segments.push({ start: +(off + s.start).toFixed(2), end: +(off + s.end).toFixed(2), text: String(s.text).trim(), words: words.filter((w) => w.start >= s.start - 0.01 && w.end <= s.end + 0.01).map((w) => ({ w: w.word, s: +(off + w.start).toFixed(2), e: +(off + w.end).toFixed(2) })) });
    await writeJson(partialFile, { total: files.length, next: k + 1, model: C.model, language, segments });
    setProgress(Math.round(((k + 1) / files.length) * 99), `Transcrevendo (bloco ${k + 1}/${files.length})`);
  }
  await fsp.rm(dir, { recursive: true, force: true }); await fsp.rm(partialFile, { force: true });
  return { language, duration: dur, model: C0.model, segments };
}

/**
 * Cortes automáticos de um envio. Com a chave do Claude, quem escolhe os trechos é a IA; sem a chave, valem os da
 * análise local. O resultado da tentativa fica no meta (aiCuts / aiCutsError) para a tela avisar.
 */
async function autoClips(id, tr, an) {
  // Sem a chave do Claude, valem os trechos da análise local. Com a chave, só entram cortes escolhidos pela IA:
  // se ela falhar, a aba fica vazia e a tela oferece tentar de novo, em vez de preencher com trechos automáticos fracos.
  if (!AI) return an.clips.map((c, i) => ({ id: 'a' + i, ...c, emotion: c.emotion || (an.emotions.find((e) => e.i === c.first) || {}).emotion || null, fav: false, hid: false, manual: false, downloaded: false, render: null }));
  const m = await getMeta(id);
  try {
    const cuts = await suggestCuts({ ask: AI.ask, name: String(m.name || '').replace(/\.[^.]+$/, ''), lines: splitLines(tr.segments), duration: m.duration || 0, count: 6 });
    if (!cuts.length) throw new Error('A IA não encontrou trechos fortes o bastante nesta pregação.');
    await update(id, { aiCuts: true, aiCutsError: null, aiCutsAt: Date.now() }); log('cortes automáticos pela IA', id, cuts.length);
    return toAutoClips(cuts);
  } catch (e) {
    await update(id, { aiCuts: false, aiCutsError: String(e.message || e).slice(0, 300), aiCutsAt: Date.now() }); log('IA falhou nos cortes automáticos', id, e.message);
    return [];
  }
}
async function pipeline(id) {
  const set = (patch) => update(id, patch);
  try {
    if (!(await getMeta(id))) return;
    await set({ status: 'processing', error: null });
    await applyRange(id);
    const m = await getMeta(id);
    const orig = U(id, m.file);
    await set({ status: 'processing', stage: 'Extraindo áudio', progress: 0, error: null });
    if (!tools.ffmpeg) throw new Error('ffmpeg não encontrado (defina FFMPEG_PATH ou instale imageio-ffmpeg).');
    const dur = await mediaDuration(orig);
    if (!dur) { const pr = await run(tools.ffmpeg, ['-hide_banner', '-i', orig]); log('ffmpeg não leu', id, m.file, (pr.err || '').split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 600)); throw new Error('Não foi possível ler o áudio deste arquivo.' + (m.source === 'youtube' ? ' O download do YouTube pode ter vindo incompleto; tente de novo.' : '')); }
    const wav = U(id, 'audio.wav'), P = cfg.provider; // a escolha do momento vale para o envio inteiro
    await set({ transcriber: isCloud(P) ? cloud(P).name : 'Local' });
    if (!isCloud(P)) {
      const x = await run(tools.ffmpeg, ['-y', '-i', orig, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
      if (x.code !== 0) throw new Error('Não foi possível ler o áudio deste arquivo.');
    }
    await set({ duration: dur, stage: 'Transcrevendo', progress: 0 });
    let last = 0;
    const setProgress = (pct, stage) => { const now = Date.now(); if (stage) set({ stage: stage === 'loading_model' ? 'Carregando o modelo de transcrição' : stage === 'downloading_model' ? 'Baixando o modelo de transcrição (só na primeira vez)' : stage, progress: pct }); else { set({ stage: 'Transcrevendo', progress: pct }); } last = now; };
    let tr;
    if (isCloud(P)) { if (!cloud(P).key) throw new Error(P === 'groq' ? 'GROQ_API_KEY não configurada.' : 'OPENAI_API_KEY não configurada.'); tr = await transcribeOpenAI(id, orig, dur, setProgress, P); }
    else { if (!tools.whisper) throw new Error('faster-whisper não instalado (pip install faster-whisper). Troque para a nuvem na barra lateral.'); tr = await transcribeLocal(id, wav, setProgress); }
    if (!tr || !tr.segments) throw new Error('Transcrição vazia.');
    tr.segments = tr.segments.filter((s) => s.text).map((s, i) => ({ id: i, speaker: 'Pessoa 1', ...s }));
    await writeJson(U(id, 'transcript.json'), tr);
    await set({ stage: 'Analisando', progress: 99, language: tr.language, words: tr.segments.reduce((a, s) => a + s.text.split(/\s+/).length, 0) });
    const an = await analyze(cfg, tr, log);
    await writeJson(U(id, 'analysis.json'), an);
    if (!!AI) await set({ stage: 'Sugerindo cortes com IA', progress: 99 });
    const clips = await autoClips(id, tr, an);
    await withLock('clips:' + id, async () => { const old = await readJson(U(id, 'clips.json'), []); await writeJson(U(id, 'clips.json'), [...clips, ...old.filter((c) => c.manual)]); });
    await fsp.rm(U(id, 'whisper.json'), { force: true }); await fsp.rm(wav, { force: true });
    await set({ status: 'done', stage: 'Concluído', progress: 100 });
    log('concluído', id, m.name);
  } catch (e) {
    log('erro no pipeline', id, e.message);
    await update(id, { status: 'error', stage: 'Erro', error: e.message });
  }
}

module.exports = { autoClips, pipeline };
