// Testes do servidor de verdade (sobe o app com dados temporários). Cortes: criar, ajustar, texto de publicação e exportação (velocidade, trechos removidos, música, legenda, sincronia).
const {
  test, assert, fs, path, spawnSync, HAS_FFMPEG, seed, boot, tmp, meta, clip, ffDuration, meanVolume,
  waitRender, fakeDemucs, seedTone,
} = require('./helpers');

test('mudar o tempo de um corte já enviado ao Drive limpa a marca "No Drive"', async (t) => {
  const d = tmp(t); seed(d, 'aaaaaaaaaaaa', {}, { clips: [clip({ drive: { link: 'https://drive.google.com/file/d/x/view', at: 2 } })] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/aaaaaaaaaaaa/clips/m111111111111', { method: 'PATCH', json: { start: 12, end: 44 } });
  assert.equal(r.status, 200);
  const [c] = (await s.api('/uploads/aaaaaaaaaaaa/clips')).body;
  assert.equal(c.start, 12);
  assert.equal(c.drive, undefined);
});

test('renomear um corte não mexe na marca "No Drive"', async (t) => {
  const d = tmp(t); seed(d, 'aaaaaaaaaaaa', {}, { clips: [clip({ drive: { link: 'https://drive.google.com/file/d/x/view', at: 2 } })] });
  const s = await boot(t, d);
  await s.api('/uploads/aaaaaaaaaaaa/clips/m111111111111', { method: 'PATCH', json: { title: 'Outro nome' } });
  assert.ok((await s.api('/uploads/aaaaaaaaaaaa/clips')).body[0].drive);
});

test('colar minutagens cria os cortes válidos e devolve as linhas recusadas', async (t) => {
  const d = tmp(t); seed(d, 'iiiiiiiiiiii');
  const s = await boot(t, d);
  const r = await s.api('/uploads/iiiiiiiiiiii/clips/bulk', { json: { text: 'Sugestões:\n01:00 - 02:00 Um\nCorte 2: 03:00 - 04:00 Dois\n20:00 - 21:00 Fora' } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.created.map((c) => [c.title, c.start, c.end, c.manual]), [['Um', 60, 120, true], ['Dois', 180, 240, true]]);
  assert.deepEqual(r.body.rejected.map((x) => x.reason), ['Não encontrei início e fim.', 'O início passa do fim do vídeo.']);
  assert.equal((await s.api('/uploads/iiiiiiiiiiii/clips')).body.length, 2);
});

// --- texto de publicação do corte (título, descrição, hashtags) ---
test('sem chave do Claude, gerar o texto do corte é recusado', async (t) => {
  const d = tmp(t); seed(d, 'pppppppppppp', {}, { clips: [clip()] });
  const s = await boot(t, d, { env: { ANTHROPIC_API_KEY: '' } });
  assert.equal((await s.api('/uploads/pppppppppppp/clips/m111111111111/ai/post', { json: {} })).status, 501);
});

test('o texto editado pela pessoa fica salvo no corte, com hashtags normalizadas', async (t) => {
  const d = tmp(t); seed(d, 'qqqqqqqqqqqq', {}, { clips: [clip()] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/qqqqqqqqqqqq/clips/m111111111111', { method: 'PATCH', json: { post: { title: ' Meu título ', description: 'Minha descrição.', hashtags: 'fé #pregação  igreja' } } });
  assert.equal(r.status, 200);
  const [c] = (await s.api('/uploads/qqqqqqqqqqqq/clips')).body;
  assert.equal(c.post.title, 'Meu título'); assert.equal(c.post.description, 'Minha descrição.');
  assert.deepEqual(c.post.hashtags, ['#fé', '#pregação', '#igreja']);
});

test('mudar o tempo do corte descarta o texto de publicação, que era de outro trecho', async (t) => {
  const d = tmp(t); seed(d, 'rrrrrrrrrrrr', {}, { clips: [clip({ post: { title: 'Antigo', description: 'x', hashtags: ['#a'], at: 1 } })] });
  const s = await boot(t, d);
  await s.api('/uploads/rrrrrrrrrrrr/clips/m111111111111', { method: 'PATCH', json: { start: 12, end: 44 } });
  assert.equal((await s.api('/uploads/rrrrrrrrrrrr/clips')).body[0].post, undefined);
});

test('exportar com velocidade 2x gera um corte com metade da duração, com vídeo e áudio', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'cccccccccd01', { duration: 6 }, { clips: [clip({ start: 0, end: 6, render: null })] });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'original.mp4')]);
  const s = await boot(t, d);
  const render = async (opts) => {
    assert.equal((await s.api('/uploads/cccccccccd01/clips/m111111111111/render', { json: { captions: false, ...opts } })).status, 202);
    let k; for (let i = 0; i < 200; i++) { k = (await s.api('/uploads/cccccccccd01/clips')).body[0]; if (k.render && k.render.status !== 'rendering') break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(k.render.status, 'done', k.render.error); return k.render;
  };
  const fast = await render({ speed: 2 });
  assert.equal(fast.speed, 2);
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', fast.file)) - 3) < 0.4, 'duração em 2x: ' + ffDuration(path.join(dir, 'clips', fast.file)));
  const streams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(dir, 'clips', fast.file)]).stdout.toString();
  assert.match(streams, /video/); assert.match(streams, /audio/);
  const slow = await render({ speed: 0.5 });
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', slow.file)) - 12) < 0.6, 'duração em 0,5x');
  const normal = await render({});
  assert.equal(normal.speed, 1);
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', normal.file)) - 6) < 0.4, 'duração normal');
});

test('remover música: o áudio do corte passa a ser a voz separada pelo modelo, com vídeo e duração intactos', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'ggggggggggh1');
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: fakeDemucs(d) } });
  assert.equal((await s.api('/status')).body.voiceAI, true);
  await s.api('/uploads/ggggggggggh1/clips/m111111111111/render', { json: { captions: false } });
  const normal = await waitRender(s, 'ggggggggggh1'); const dbNormal = meanVolume(path.join(dir, 'clips', normal.file));
  await s.api('/uploads/ggggggggggh1/clips/m111111111111/render', { json: { captions: false, voice: 'ia' } });
  const ia = await waitRender(s, 'ggggggggggh1'); const out = path.join(dir, 'clips', ia.file);
  assert.equal(ia.voice, 'ia');
  assert.ok(meanVolume(out) < dbNormal - 40, `o áudio deveria vir do arquivo separado (silêncio no teste): ${meanVolume(out)} dB contra ${dbNormal} dB`);
  assert.ok(Math.abs(ffDuration(out) - 6) < 0.4);
  assert.match(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]).stdout.toString(), /video[\s\S]*audio|audio[\s\S]*video/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'clips')).filter((f) => /\.wav$|\.sep$/.test(f)), [], 'arquivos temporários da separação devem ser apagados');
});

test('remover música funciona junto com velocidade e remoção de silêncio', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'hhhhhhhhhhi1');
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ language: 'pt', segments: [{ id: 0, speaker: 'Pessoa 1', start: 0, end: 4, text: 'um dois', words: [{ w: 'um', s: 0, e: 1 }, { w: 'dois', s: 3, e: 4 }] }] }));
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: fakeDemucs(d) } });
  await s.api('/uploads/hhhhhhhhhhi1/clips/m111111111111/render', { json: { captions: false, voice: 'ia', speed: 2, removePauses: true } });
  const r = await waitRender(s, 'hhhhhhhhhhi1');
  assert.ok(ffDuration(path.join(dir, 'clips', r.file)) < 1.6);
});

test('sem o modelo instalado, pedir para remover música dá um erro que diz como instalar', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); seedTone(d, 'iiiiiiiiiij1');
  const s = await boot(t, d, { env: { DEMUCS_PYTHON: path.join(d, 'nao-existe') } });
  assert.equal((await s.api('/status')).body.voiceAI, false);
  await s.api('/uploads/iiiiiiiiiij1/clips/m111111111111/render', { json: { captions: false, voice: 'ia' } });
  let k; for (let i = 0; i < 100; i++) { k = (await s.api('/uploads/iiiiiiiiiij1/clips')).body[0]; if (k.render && k.render.status !== 'rendering') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(k.render.status, 'error'); assert.match(k.render.error, /instalar-voz-ia/);
});

// --- remover um trecho do meio do corte ---
test('exportar com um trecho removido tira esse pedaço do vídeo e do áudio', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'mmmmmmmmmn01');
  const s = await boot(t, d);
  await s.api('/uploads/mmmmmmmmmn01/clips/m111111111111/render', { json: { captions: false, removed: [[2, 4, 1]] } });
  const r = await waitRender(s, 'mmmmmmmmmn01'); const out = path.join(dir, 'clips', r.file);
  assert.ok(Math.abs(ffDuration(out) - 4) < 0.4, 'duração: ' + ffDuration(out));
  await s.api('/uploads/mmmmmmmmmn01/clips/m111111111111/render', { json: { captions: false, removed: [[1, 2, 1], [1.5, 3, 1], [5, 9, 1]], speed: 2 } });
  const r2 = await waitRender(s, 'mmmmmmmmmn01');
  // sobram 0–1 e 3–5 = 3 s; em 2x, 1,5 s
  assert.ok(Math.abs(ffDuration(path.join(dir, 'clips', r2.file)) - 1.5) < 0.4, 'duração com dois trechos e 2x: ' + ffDuration(path.join(dir, 'clips', r2.file)));
});

// --- kit do corte: legenda (.srt) gravada na exportação e enviada ao Drive com o texto ---
test('a exportação grava a legenda no tempo do vídeo final: acompanha a velocidade e os trechos removidos', { skip: !HAS_FFMPEG || process.platform === 'win32' }, async (t) => {
  const d = tmp(t); const dir = seedTone(d, 'kkkkkkkkkkk1');
  const s = await boot(t, d);
  const srt = async (opts) => { await s.api('/uploads/kkkkkkkkkkk1/clips/m111111111111/render', { json: { captions: false, ...opts } }); const r = await waitRender(s, 'kkkkkkkkkkk1'); return fs.readFileSync(path.join(dir, 'clips', r.srt), 'utf8'); };
  assert.equal(await srt({}), '1\n00:00:00,000 --> 00:00:02,000\nolá mundo\n');
  assert.equal(await srt({ speed: 2 }), '1\n00:00:00,000 --> 00:00:01,000\nolá mundo\n');
  assert.equal(await srt({ removed: [[0, 1]] }), '1\n00:00:00,000 --> 00:00:01,000\nmundo\n');
});

test('sincronia da pregação: grava o ajuste, e cortes já exportados voltam a ser exportados', async (t) => {
  const d = tmp(t); const dir = seed(d, 'aaaaaaaaaaae', {}, { clips: [clip(), clip({ id: 'm222222222222', render: null })] });
  const s = await boot(t, d);
  const r = await s.api('/uploads/aaaaaaaaaaae/sync', { json: { audioShift: 1.46 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.audioShift, 1.46);
  assert.equal(r.body.resetClips, 1);
  assert.equal(meta(dir).audioShift, 1.46);
  assert.ok((await s.api('/uploads/aaaaaaaaaaae/clips')).body.every((k) => k.render === null));
  assert.equal((await s.api('/uploads/aaaaaaaaaaae/sync', { json: { audioShift: 99 } })).body.audioShift, 5); // limite de ±5 s
});

test('a exportação soma a sincronia da pregação ao ajuste do corte', { skip: !HAS_FFMPEG }, async (t) => {
  const d = tmp(t); const dir = seed(d, 'aaaaaaaaaaaf', { duration: 6, audioShift: 0.3 }, { clips: [clip({ start: 1, end: 6, render: null })], original: false });
  // clarão na imagem e bipe no som, ambos em 2,0 s
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:r=25:d=6', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,2,2.05),sin(2*PI*1000*t),0)':s=48000:d=6", '-vf', "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,2,2.03)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'original.mp4')]);
  const s = await boot(t, d);
  assert.equal((await s.api('/uploads/aaaaaaaaaaaf/clips/m111111111111/render', { json: { start: 1, end: 6, audioShift: 0.1 } })).status < 300, true);
  let k; for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 200)); k = (await s.api('/uploads/aaaaaaaaaaaf/clips')).body[0]; if (k.render && k.render.status !== 'rendering') break; }
  assert.equal(k.render.status, 'done', JSON.stringify(k.render));
  assert.equal(k.render.audioShift, 0.4);
  const a = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, 'clips', k.render.file), '-map', '0:a', '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 }).stdout;
  let beep = -1; for (let i = 0; i < a.length / 2; i++) if (Math.abs(a.readInt16LE(i * 2)) > 3000) { beep = i / 48000; break; }
  assert.ok(Math.abs(beep - 1.4) < 0.03, `bipe deveria ir para 1,4 s do corte (1,0 + 0,3 da pregação + 0,1 do corte); foi ${beep}`);
});
