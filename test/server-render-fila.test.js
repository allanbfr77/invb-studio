// Exportação de corte: "Renderizando" que sobrou de um Studio fechado no meio volta para "não exportado",
// e enquanto exporta a lista mostra a fila ou a porcentagem.
const fs = require('fs');
const path = require('path');
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

test(
  'exportação: sobra de "Renderizando" é desfeita, e a lista mostra fila ou porcentagem',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkke');
    const f = path.join(d, 'uploads', 'kkkkkkkkkkke', 'clips.json');
    const clips = JSON.parse(fs.readFileSync(f, 'utf8'));
    clips[0].render = { status: 'rendering' }; // o Studio fechou no meio da exportação
    fs.writeFileSync(f, JSON.stringify(clips));
    const s = await boot(t, d);
    const l = (await s.api('/uploads/kkkkkkkkkkke/clips')).body;
    assert.equal(l[0].render, null);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8'))[0].render, null); // ficou salvo
    // exportando: a lista diz "na fila" ou a porcentagem, e no fim fica pronto
    const base = '/uploads/kkkkkkkkkkke/clips/' + l[0].id;
    assert.equal((await s.api(base + '/render', { json: { captions: false } })).status, 202);
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const k = (await s.api('/uploads/kkkkkkkkkkke/clips')).body[0];
      if (k.render.status !== 'rendering') break;
      seen.add(k.render.queued ? 'fila' : 'progress' in k.render ? 'progresso' : '?');
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(seen.has('?'), false);
    assert.equal((await waitRender(s, 'kkkkkkkkkkke')).status, 'done');
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'))[0].render;
    assert.equal('queued' in saved || 'progress' in saved, false); // a fila e a porcentagem não vão para o arquivo
  },
);
