// Testes do servidor de verdade (sobe o app com dados temporários). Envio ao Drive (kit de edição) e sincronia automática.
const {
  test,
  assert,
  fs,
  path,
  spawnSync,
  HAS_FFMPEG,
  seed,
  boot,
  tmp,
  has,
  clip,
  fakeGoogle,
  TOKEN,
  HAS_AUTOSYNC,
} = require('./helpers');

test('enviar ao Drive manda o kit: texto, legenda e vídeo, nessa ordem e com o nome do corte', async (t) => {
  const d = tmp(t);
  const g = await fakeGoogle(t);
  const dir = seed(
    d,
    'kkkkkkkkkkk2',
    { name: 'Culto de domingo.mp4' },
    {
      clips: [
        clip({
          title: 'Deus é fiel',
          start: 0,
          end: 2,
          post: { title: 'Deus é fiel sempre', description: 'Uma palavra.', hashtags: ['#fe'] },
          render: { status: 'done', file: 'm111111111111.mp4', srt: 'm111111111111.srt', seconds: 2, at: 1 },
        }),
      ],
    },
  );
  fs.mkdirSync(path.join(dir, 'clips'));
  fs.writeFileSync(path.join(dir, 'clips', 'm111111111111.mp4'), 'video');
  fs.writeFileSync(path.join(dir, 'clips', 'm111111111111.srt'), '1\n00:00:00,000 --> 00:00:02,000\nolá mundo\n');
  const s = await boot(t, d, { env: { DRIVE_CUTS_FOLDER_ID: 'pasta-da-equipe-123', INVB_GOOGLE_API_BASE: g.base } });
  const r = await s.api('/uploads/kkkkkkkkkkk2/clips/m111111111111/drive', { json: { token: TOKEN } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.drive.srt, true);
  assert.deepEqual(
    g.files.map((f) => [f.name, f.mime, f.parents[0]]),
    [
      ['Deus é fiel - texto.txt', 'text/plain', 'pasta1'],
      ['Deus é fiel.srt', 'application/x-subrip', 'pasta1'],
      ['Deus é fiel.mp4', 'video/mp4', 'pasta1'],
    ],
  );
  assert.match(
    g.files[0].body,
    /^Deus é fiel sempre\n\nUma palavra\.\n\n#fe\n\n---\n\nPregação: Culto de domingo\nTrecho na pregação: 0:00 a 0:02/,
  );
  assert.match(g.files[0].body, /Fala do trecho:\nolá mundo\n$/);
  assert.equal(g.files[1].body, '1\n00:00:00,000 --> 00:00:02,000\nolá mundo\n');
  assert.equal(g.files[2].body, 'video');
  assert.equal(
    (await s.api('/uploads/kkkkkkkkkkk2/clips')).body[0].drive.link,
    'https://drive.google.com/file/d/f2/view',
  );
});

test('corte exportado antes do kit: ganha a legenda se não foi encurtado por dentro; se foi, vai só o texto', async (t) => {
  const d = tmp(t);
  const g = await fakeGoogle(t);
  const dir = seed(
    d,
    'kkkkkkkkkkk3',
    {},
    {
      clips: [
        clip({ start: 0, end: 2, render: { status: 'done', file: 'm111111111111.mp4', at: 1 } }),
        clip({
          id: 'm222222222222',
          title: 'Rápido',
          start: 0,
          end: 2,
          render: { status: 'done', file: 'm222222222222.mp4', speed: 2, at: 1 },
        }),
      ],
    },
  );
  fs.mkdirSync(path.join(dir, 'clips'));
  for (const f of ['m111111111111.mp4', 'm222222222222.mp4']) fs.writeFileSync(path.join(dir, 'clips', f), 'v');
  const s = await boot(t, d, { env: { DRIVE_CUTS_FOLDER_ID: 'pasta-da-equipe-123', INVB_GOOGLE_API_BASE: g.base } });
  assert.equal(
    (await s.api('/uploads/kkkkkkkkkkk3/clips/m111111111111/drive', { json: { token: TOKEN } })).body.drive.srt,
    true,
  );
  assert.equal(g.files[1].body, '1\n00:00:00,000 --> 00:00:02,000\nolá mundo\n');
  assert.equal(
    (await s.api('/uploads/kkkkkkkkkkk3/clips/m222222222222/drive', { json: { token: TOKEN } })).body.drive.srt,
    false,
  );
  assert.deepEqual(
    g.files.slice(3).map((f) => f.name),
    ['Rápido - texto.txt', 'Rápido.mp4'],
  );
  assert.match(g.files[3].body, /Fala do trecho:\nolá mundo\n$/);
});

/* ---------- Sincronia automática (AutoSync) ---------- */
test('sincronia automática não instalada: a rota avisa como instalar e a tela fica sabendo', async (t) => {
  const d = tmp(t);
  seed(d, 'ssssssssssss');
  const s = await boot(t, d, { env: { AUTOSYNC_PYTHON: path.join(d, 'nao-existe', 'python') } });
  assert.equal((await s.api('/status')).body.autosync, false);
  const r = await s.api('/uploads/ssssssssssss/autosync', { json: { start: 0, end: 30 } });
  assert.equal(r.status, 501);
  assert.match(r.body.error, /instalar-autosync/);
});

test(
  'sincronia automática: arquivo só de áudio e trecho curto são recusados com mensagem clara',
  { skip: !HAS_AUTOSYNC },
  async (t) => {
    const d = tmp(t);
    seed(d, 'aaaaaaaaaaab', { kind: 'aud', file: 'original.mp4' });
    seed(d, 'aaaaaaaaaaac');
    const s = await boot(t, d);
    assert.equal((await s.api('/status')).body.autosync, true);
    assert.match((await s.api('/uploads/aaaaaaaaaaab/autosync', { json: {} })).body.error, /só áudio/);
    const r = await s.api('/uploads/aaaaaaaaaaac/autosync', { json: { start: 10, end: 11 } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /curto demais/);
  },
);

test(
  'sincronia automática: vídeo sem rosto é analisado de verdade, não corrige e não mexe no original',
  { skip: !HAS_AUTOSYNC || !HAS_FFMPEG },
  async (t) => {
    const d = tmp(t);
    const dir = seed(d, 'aaaaaaaaaaad', { duration: 14 }, { original: false });
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=640x360:r=25:d=14',
      '-f',
      'lavfi',
      '-i',
      'sine=f=220:d=14',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      path.join(dir, 'original.mp4'),
    ]);
    const before = fs.readFileSync(path.join(dir, 'original.mp4'));
    const s = await boot(t, d);
    const r = await s.api('/uploads/aaaaaaaaaaad/autosync', { json: { apply: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'sem_rosto');
    assert.equal(r.body.needsCorrection, false);
    assert.equal(r.body.file, undefined);
    assert.ok(!has(dir, 'sincronizado.mp4'));
    assert.ok(before.equals(fs.readFileSync(path.join(dir, 'original.mp4'))));
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.startsWith('.autosync')),
      [],
    );
  },
);
