// Legenda nunca some em silêncio: com um ffmpeg sem libass (sem o filtro "subtitles"), o app avisa e a exportação
// com legenda para com o motivo, em vez de sair sem texto. Sem legenda, exporta normal.
const fs = require('fs');
const path = require('path');
const { test, assert, HAS_FFMPEG, boot, tmp, seedTone, waitRender } = require('./helpers');

test(
  'ffmpeg sem libass: status avisa, exportação com legenda para com o motivo, sem legenda funciona',
  { skip: !HAS_FFMPEG || process.platform === 'win32' },
  async (t) => {
    const d = tmp(t);
    seedTone(d, 'kkkkkkkkkkkt');
    // um "ffmpeg" que esconde o filtro subtitles na lista e recusa usá-lo, como um ffmpeg mínimo
    const fake = path.join(d, 'ffmpeg-sem-libass.sh');
    fs.writeFileSync(
      fake,
      '#!/bin/bash\nfor a in "$@"; do if [ "$a" = "-filters" ]; then ffmpeg "$@" | grep -v " subtitles "; exit 0; fi; case "$a" in *subtitles=*) echo "No such filter: \'subtitles\'" >&2; exit 1;; esac; done\nexec ffmpeg "$@"\n',
      { mode: 0o755 },
    );
    const s = await boot(t, d, { env: { FFMPEG_PATH: fake } });
    assert.equal((await s.api('/status')).body.libass, false);
    const base = '/uploads/kkkkkkkkkkkt/clips/' + (await s.api('/uploads/kkkkkkkkkkkt/clips')).body[0].id;
    await s.api(base + '/render', { json: { captions: { on: true } } });
    const k = await (async () => {
      for (let i = 0; i < 300; i++) {
        const c = (await s.api('/uploads/kkkkkkkkkkkt/clips')).body[0];
        if (c.render && c.render.status !== 'rendering') return c;
        await new Promise((r) => setTimeout(r, 100));
      }
    })();
    assert.equal(k.render.status, 'error');
    assert.match(k.render.error, /libass/);
    await s.api(base + '/render', { json: { captions: false } });
    assert.equal((await waitRender(s, 'kkkkkkkkkkkt')).status, 'done');
  },
);
