// Impacto: look, efeitos num trecho (P&B, zoom, tremida, flash, cartela) e entrada animada dos textos,
// exportados de verdade com o ffmpeg. Confere a cor dos quadros em cada trecho.
const path = require('path');
const { spawnSync } = require('child_process');
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

// cor média de um quadro (r, g, b de 0 a 255) e quanto ela é "colorida" (0 = cinza)
function frame(file, t) {
  const r = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(t),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const [R, G, B] = r.stdout;
  return { R, G, B, chroma: Math.max(R, G, B) - Math.min(R, G, B) };
}
// quanto do quadro é colorido (média do "colorido" de cada ponto, numa versão pequena)
function colorful(file, t) {
  const r = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(t),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'scale=32:18',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const px = r.stdout;
  let s = 0;
  for (let i = 0; i < px.length; i += 3)
    s += Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
  return s / (px.length / 3);
}

test(
  'Impacto: look, efeitos por trecho e texto animado saem no arquivo',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkf');
    const s = await boot(t, d);
    const base = '/uploads/kkkkkkkkkkkf/clips/' + (await s.api('/uploads/kkkkkkkkkkkf/clips')).body[0].id;
    const r = await s.api(base + '/render', {
      json: {
        captions: false,
        look: 'quente',
        fx: [
          { type: 'bw', start: 0.5, end: 1.5 },
          { type: 'zoom', start: 1.6, end: 2.4 },
          { type: 'shake', start: 2.5, end: 3.0 },
          { type: 'flash', start: 3.1, end: 3.5 },
          { type: 'card', start: 4.0, end: 5.0, color: '#c0262d' },
          { type: 'nada', start: 0, end: 1 }, // ignorado
        ],
        overlays: [
          {
            id: 'a',
            type: 'text',
            text: 'TAMBÉM',
            x: 0.3,
            y: 0.4,
            start: 4.0,
            end: 5.0,
            size: 0.12,
            color: '#ffffff',
            font: 'Archivo Black',
            anim: 'pop',
          },
          {
            id: 'b',
            type: 'text',
            text: 'jovem',
            x: 0.5,
            y: 0.6,
            start: 1,
            end: 3,
            size: 0.08,
            color: '#ffffff',
            font: 'DM Serif Display',
            anim: 'blur',
          },
          {
            id: 'c',
            type: 'text',
            text: 'sei',
            x: 0.5,
            y: 0.3,
            start: 2,
            end: 3,
            size: 0.08,
            color: '#ffffff',
            font: 'Anton',
            anim: 'slide',
          },
        ],
      },
    });
    assert.equal(r.status, 202);
    const done = await waitRender(s, 'kkkkkkkkkkkf');
    const file = path.join(d, 'uploads', 'kkkkkkkkkkkf', 'clips', done.file);
    const normal = colorful(file, 0.2),
      pb = colorful(file, 1.0);
    assert.ok(normal > 40, 'o vídeo de teste é colorido: ' + normal);
    assert.ok(pb < normal * 0.25, `no trecho P&B quase não há cor (${pb} x ${normal})`);
    assert.ok(colorful(file, 1.8) > 40, 'o zoom não tira a cor');
    const card = frame(file, 4.5);
    assert.ok(card.R > 150 && card.G < 80 && card.B < 80, 'a cartela vermelha cobre o quadro: ' + JSON.stringify(card));
    const fl = frame(file, 3.12),
      after = frame(file, 3.8);
    assert.ok(fl.R + fl.G + fl.B > after.R + after.G + after.B + 60, 'o flash clareia o quadro');
  },
);

// O Claude sugere a edição: a resposta é conferida (fora da fala, sobreposta, frase longa demais, cartelas demais).
test('Impacto com o Claude: devolve frases, efeitos e cor já conferidos', async (t) => {
  const http = require('node:http');
  const { seed, clip } = require('./helpers');
  let asked = '';
  const reply = {
    phrases: [
      { from: 0, to: 2, style: 'vermelho', side: 'esq', anim: 'pop', card: false, cardColor: '#000000' },
      { from: 1, to: 3, style: 'amarelo', side: 'dir', anim: 'pop', card: false, cardColor: '#000000' }, // sobrepõe: sai
      { from: 4, to: 5, style: 'classico', side: 'centro', anim: 'blur', card: true, cardColor: '#000000' },
      { from: 6, to: 6, style: 'bebas', side: 'centro', anim: 'zoom', card: true, cardColor: '#ffffff' },
      { from: 7, to: 7, style: 'tarja', side: 'centro', anim: 'zoom', card: true, cardColor: '#c0262d' }, // 3ª cartela: vira frase comum
      { from: 8, to: 99, style: 'tarja', side: 'esq', anim: 'fade', card: false, cardColor: '#000000' }, // fora da fala: sai
    ],
    fx: [
      { type: 'bw', from: 4, to: 6 },
      { type: 'flash', from: 50, to: 50 }, // fora: sai
    ],
    look: 'filme',
    note: 'Ênfase no "também".',
  };
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (x) => (b += x));
    req.on('end', () => {
      asked = b;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [{ type: 'text', text: JSON.stringify(reply) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const d = tmp(t);
  seed(d, 'kkkkkkkkkkkg', { duration: 30 }, { clips: [clip({ start: 0, end: 20 })] });
  const s = await boot(t, d, {
    env: { ANTHROPIC_API_KEY: 'sk-ant-teste', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + srv.address().port },
  });
  const words = 'Eu também sou jovem e sei como é difícil viver'.split(' ');
  const cid = (await s.api('/uploads/kkkkkkkkkkkg/clips')).body[0].id;
  const r = await s.api(`/uploads/kkkkkkkkkkkg/clips/${cid}/ai/impact`, {
    json: { words, times: words.map((_, i) => [i * 0.4, i * 0.4 + 0.35]), format: '9:16' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(asked, /3 \| 1\.2 \| jovem/); // a fala numerada foi para o Claude
  assert.deepEqual(
    r.body.phrases.map((p) => [p.from, p.to, p.card]),
    [
      [0, 2, false],
      [4, 5, true],
      [6, 6, true],
      [7, 7, false],
    ],
  );
  assert.deepEqual(r.body.fx, [{ type: 'bw', from: 4, to: 6 }]);
  assert.equal(r.body.look, 'filme');
  assert.equal(r.body.note, 'Ênfase no "também".');
  // pedido malformado
  assert.equal(
    (await s.api(`/uploads/kkkkkkkkkkkg/clips/${cid}/ai/impact`, { json: { words, times: [] } })).status,
    400,
  );
});

test(
  'Impacto: efeitos novos (zoom lento, desfoque, glitch, escurecer, rastro) saem no arquivo',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkl');
    const s = await boot(t, d);
    const base = '/uploads/kkkkkkkkkkkl/clips/' + (await s.api('/uploads/kkkkkkkkkkkl/clips')).body[0].id;
    await s.api(base + '/render', {
      json: {
        captions: false,
        format: '9:16',
        fx: [
          { type: 'push', start: 0.2, end: 1.2 },
          { type: 'blur', start: 1.4, end: 2.2 },
          { type: 'glitch', start: 2.4, end: 2.9 },
          { type: 'dim', start: 3.2, end: 4.2 },
          { type: 'echo', start: 4.4, end: 5.4 },
        ],
      },
    });
    const done = await waitRender(s, 'kkkkkkkkkkkl');
    const file = path.join(d, 'uploads', 'kkkkkkkkkkkl', 'clips', done.file);
    const lum = (t2) => {
      const f = frame(file, t2);
      return f.R + f.G + f.B;
    };
    assert.ok(lum(3.7) < lum(5.8) - 40, `escurecer deixa o quadro mais escuro (${lum(3.7)} x ${lum(5.8)})`);
  },
);

test('legenda some onde há palavras de impacto (capHide)', () => {
  const { buildAss, cleanOpts } = require('../lib/render');
  const tr = {
    segments: [
      {
        id: 0,
        start: 0,
        end: 4,
        text: 'eu também sou jovem e sei',
        words: ['eu', 'também', 'sou', 'jovem', 'e', 'sei'].map((w, i) => ({ w, s: i * 0.6, e: i * 0.6 + 0.5 })),
      },
    ],
  };
  const c = { start: 0, end: 4 };
  const rel = (x) => x;
  const ass = (opt) => buildAss(tr, c, cleanOpts(opt), 1080, 1920, rel, false).split('[Events]')[1].toLowerCase();
  const all = ass({ captions: { on: true } }),
    hidden = ass({ captions: { on: true }, capHide: [[0.5, 2.0]] });
  assert.match(all, /também/);
  assert.match(all, /jovem/);
  assert.doesNotMatch(hidden, /também|sou/); // as palavras ditas durante o impacto saem da legenda
  assert.match(hidden, /jovem/); // as outras continuam
});

test(
  'Impacto: todos os efeitos e looks exportam sem erro',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const { FX_TYPES, LOOKS } = require('../lib/render');
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkm');
    const s = await boot(t, d);
    const base = '/uploads/kkkkkkkkkkkm/clips/' + (await s.api('/uploads/kkkkkkkkkkkm/clips')).body[0].id;
    const fx = FX_TYPES.map((type, i) => ({ type, start: i * 0.28, end: i * 0.28 + 0.26, color: '#000000' }));
    for (const look of ['cinema', 'retro']) {
      assert.ok(LOOKS[look]);
      await s.api(base + '/render', { json: { captions: false, format: '9:16', look, fx } });
      const r = await waitRender(s, 'kkkkkkkkkkkm');
      assert.equal(r.status, 'done');
    }
  },
);
