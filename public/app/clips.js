/* INVB Studio — Tela de cortes: cartões, Ajustar, exportar, Drive, texto da IA e ações em lote. */
(function () {
  const INVB = window.INVB;
  const { S, esc, ic, pages, guard, api, toast, go, tm, popover, $$, modal, $, dl, parseT, googleToken, G_WRITE } =
    INVB;

  /* ---------- Telas ---------- */
  pages.clips = (
    c,
  ) => `${S.status && S.status.ai && c.aiCutsError ? `<div class="ap-demo gone" role="status"><span>A IA não conseguiu sugerir os cortes automáticos desta pregação: ${esc(c.aiCutsError)}</span><button class="ap-btn" id="ai-retry">Tentar de novo com IA</button></div>` : ''}<div class="ap-head"><div><h1>Cortes</h1><p class="sub2">Crie os cortes, ajuste na tesoura, baixe e envie para o Drive.</p></div><div class="ap-tools" style="margin:0">${S.status && S.status.ai ? '<button class="ap-btn" id="cl-ai" title="O Claude lê a transcrição e cria os cortes">✨ Sugerir cortes com IA</button>' : ''}${c.kind === 'vid' ? `<button class="ap-btn" id="cl-sync" title="Acertar o som com a boca na pregação inteira (vale para todos os cortes)">🔊 Sincronia${c.audioShift ? ' · ' + (c.audioShift > 0 ? '+' : '−') + Math.abs(Math.round(c.audioShift * 1000)) + ' ms' : ''}</button>` : ''}<button class="ap-btn" id="cl-paste">Colar minutagens</button><button class="ap-btn pri" id="cl-new">+ Novo corte</button></div></div>
      <div class="ap-tabs" id="cl-tabs"><button role="tab" aria-selected="true" data-m="0">Automáticos <span class="tabn" id="cn0"></span></button><button role="tab" aria-selected="false" data-m="1">Manuais <span class="tabn" id="cn1"></span></button></div>
      <div class="ap-tools"><label class="ap-search">${ic.search}<input id="cq" placeholder="Buscar nos cortes"></label><span class="ap-sp"></span><button class="ap-btn" id="call-dl" title="Exporta e baixa todos os cortes desta aba">Baixar todos</button>${S.status && S.status.driveCuts ? '<button class="ap-btn" id="call-dr" title="Exporta e envia à pasta da equipe todos os cortes desta aba">Enviar todos ao Drive</button>' : ''}<button class="ap-btn" id="csort">⇅ Maior impacto ⌄</button><button class="ap-btn" id="cfil">Filtros</button></div><p class="sub2" id="ccnt" style="margin-bottom:12px"></p><div class="cuts" id="cuts"></div>`;

  // A tela de cortes tem dois arquivos: este (lista, cartões, exportar e ações em lote) e clips-actions.js (Drive, texto da IA,
  // sugestões, sincronia, colar minutagens e novo corte). As partes dividem o objeto "shared".
  const Parts = (window.INVB.clipsParts = {
    base: { api, googleToken, S, G_WRITE, toast, modal, esc, guard, dl, tm, $, go, $$, parseT },
  });

  function bindClips() {
    const shared = {}; // o que as partes dividem entre si
    // funções das outras partes, chamadas pelo objeto comum na hora do uso
    const driveToken = (...a) => shared.driveToken(...a);
    const sendDrive = (...a) => shared.sendDrive(...a);
    const postModal = (...a) => shared.postModal(...a);

    const c = S.cur;
    shared.clips = c.clips || [];
    shared.mode = shared.clips.some((k) => !k.manual) || !shared.clips.some((k) => k.manual) ? 0 : 1;
    let q = '';
    let sort = 'score';
    let f = { show: '', dl: '', type: '', imp: '', dur: '', emo: '' };
    const dur = (k) => k.end - k.start;
    const fil = () =>
      shared.clips.filter(
        (k) =>
          k.manual === (shared.mode === 1) &&
          (!q || k.title.toLowerCase().includes(q)) &&
          (!f.show || (f.show === 'fav' ? k.fav : !k.hid)) &&
          (!f.dl || (f.dl === 'sim' ? k.downloaded : !k.downloaded)) &&
          (!f.type || k.type === f.type) &&
          (!f.imp || k.score >= +f.imp) &&
          (!f.dur || (f.dur === 'c' ? dur(k) < 30 : f.dur === 'm' ? dur(k) >= 30 && dur(k) < 60 : dur(k) >= 60)) &&
          (!f.emo || k.emotion === f.emo),
      );
    const mediaTag = (k) => {
      const src = `/api/uploads/${c.id}/media#t=${k.start.toFixed(2)},${k.end.toFixed(2)}`;
      return c.kind === 'vid'
        ? `<video class="vid" controls preload="metadata" src="${src}" style="width:100%;aspect-ratio:16/9;background:#000"></video>`
        : `<audio controls preload="metadata" src="${src}" style="width:100%"></audio>`;
    };
    const pollRender = guard(async (id) => {
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const l = await api(`/uploads/${c.id}/clips`);
        shared.clips = l;
        const k = l.find((x) => x.id === id);
        if (!k || !k.render || k.render.status !== 'rendering') {
          draw();
          if (k && k.render && k.render.status === 'done') {
            toast('Corte pronto. Baixando…');
            fileDl(k);
          } else if (k && k.render) toast('Falha ao renderizar: ' + (k.render.error || ''));
          return;
        }
      }
    });
    const fileDl = (k) => {
      const a = document.createElement('a');
      a.href = `/api/uploads/${c.id}/clips/${k.id}/file`;
      a.click();
      setTimeout(async () => {
        shared.clips = await api(`/uploads/${c.id}/clips`);
        draw();
      }, 800);
    };
    // Exportação de um corte: com a edição salva dele, ou no formato do vídeo e sem legenda.
    const renderJson = (k) =>
      k.editor
        ? ClipEditor.renderOpts({ ...k.editor, start: k.editor.start ?? k.start, end: k.editor.end ?? k.end }, false)
        : { captions: false };
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const rendered = async (k0) => {
      // devolve o corte já exportado (exporta se preciso e espera terminar)
      if (k0.render && k0.render.status === 'done') return k0;
      if (!(k0.render && k0.render.status === 'rendering'))
        await api(`/uploads/${c.id}/clips/${k0.id}/render`, { json: renderJson(k0) });
      for (let i = 0; i < 800; i++) {
        await pause(1500);
        shared.clips = await api(`/uploads/${c.id}/clips`);
        const k = shared.clips.find((x) => x.id === k0.id);
        if (!k || !k.render || k.render.status !== 'rendering') {
          draw();
          return k && k.render && k.render.status === 'done' ? k : null;
        }
        if (i === 0) draw();
      }
      return null;
    };
    let batchOn = false;
    // Todos os cortes visíveis da aba, um por vez: exporta o que faltar e baixa, ou envia ao Drive.
    const batch = async (kind, btn) => {
      if (batchOn) return;
      const list = fil().filter((k) => !k.hid && !(kind === 'drive' && k.drive && k.drive.link));
      if (!list.length)
        return toast(
          kind === 'drive' && fil().length
            ? 'Todos os cortes desta aba já estão no Drive.'
            : 'Não há cortes nesta aba.',
        );
      const label = btn.textContent;
      batchOn = true;
      btn.disabled = true;
      let ok = 0,
        last = '';
      try {
        if (kind === 'drive') await driveToken(); // o login do Google precisa abrir dentro do clique
        for (let i = 0; i < list.length; i++) {
          btn.textContent = `${kind === 'drive' ? 'Enviando' : 'Baixando'} ${i + 1} de ${list.length}…`;
          try {
            const k = await rendered(list[i]);
            if (!k) {
              last = 'a exportação falhou';
              continue;
            }
            if (kind === 'drive') await sendDrive(k);
            else {
              const a = document.createElement('a');
              a.href = `/api/uploads/${c.id}/clips/${k.id}/file`;
              a.click();
              await pause(1200);
            }
            ok++;
          } catch (e) {
            if (e.status === 401) throw e;
            last = e.message;
            if (e.data && (e.data.wrongAccount || e.data.needsLogin)) break;
          } // conta errada: não adianta insistir nos outros
        }
        toast(
          ok === list.length
            ? kind === 'drive'
              ? `${ok} corte${ok === 1 ? '' : 's'} na pasta da equipe.`
              : `${ok} corte${ok === 1 ? '' : 's'} baixado${ok === 1 ? '' : 's'}.`
            : `${ok} de ${list.length} ${kind === 'drive' ? 'enviados' : 'baixados'}. O que faltou: ${last || 'erro desconhecido'}`,
        );
      } catch (e) {
        if (e.status === 401) go('/entrar');
        else toast(e.message);
      } finally {
        batchOn = false;
        btn.disabled = false;
        btn.textContent = label;
        try {
          shared.clips = await api(`/uploads/${c.id}/clips`);
        } catch {
          /* fica a lista atual */
        }
        draw();
      }
    };
    // Envio ao Drive: só aparece com a pasta da equipe configurada e o corte já exportado.
    const driveOn = !!(S.status && S.status.driveCuts);
    const driveBtn = (k) =>
      !driveOn || !(k.render && k.render.status === 'done')
        ? ''
        : k.drive && /^https:\/\//.test(k.drive.link || '')
          ? `<a class="ap-btn" href="${esc(k.drive.link)}" target="_blank" rel="noopener">✓ No Drive</a>`
          : '<button class="ap-btn" data-a="drive" title="Enviar este corte para a pasta da equipe no Drive">↑ Drive</button>';
    // Dois cortes que repetem o mesmo trecho: avisa no cartão, com o tamanho da repetição.
    const overlapNote = (k) => {
      let best = null;
      for (const o of shared.clips) {
        if (o.id === k.id || o.hid) continue;
        const s = Math.min(k.end, o.end) - Math.max(k.start, o.start);
        if (s >= 3 && (!best || s > best.s)) best = { s, o };
      }
      return best
        ? `<div class="ovl-warn" role="note">Repete ${Math.round(best.s)} s do corte “${esc(best.o.title)}” (${best.o.manual ? 'Manuais' : 'Automáticos'}).</div>`
        : '';
    };
    // Mudar o começo ou o fim do corte pelas frases da transcrição, ou pedir ajuda à IA.
    const setTimes = async (k, s, e, msg) => {
      if (!(e - s >= 3)) return toast('Assim o corte ficaria com menos de 3 segundos.');
      const r = await api(`/uploads/${c.id}/clips/${k.id}`, {
        method: 'PATCH',
        json: { start: +s.toFixed(2), end: +e.toFixed(2) },
      });
      Object.assign(k, r);
      draw();
      toast(`${msg} Agora: ${tm(k.start)} → ${tm(k.end)} (${Math.round(dur(k))} s).`);
    };
    const adjust = (k, btn) => {
      const sg = S.segs || [],
        ai = !!(S.status && S.status.ai);
      const before = sg.filter((x) => x.t < k.start - 0.2).pop(),
        after = sg.find((x) => x.end > k.end + 0.2);
      const first = sg.find((x) => x.t > k.start + 0.2 && x.t < k.end - 3),
        last = sg.filter((x) => x.end < k.end - 0.2 && x.end > k.start + 3).pop();
      popover(
        btn,
        `<button data-j="b" ${before ? '' : 'disabled'}>Começar uma frase antes</button><button data-j="a" ${after ? '' : 'disabled'}>Terminar uma frase depois</button><button data-j="f" ${first ? '' : 'disabled'}>Tirar a primeira frase</button><button data-j="l" ${last ? '' : 'disabled'}>Tirar a última frase</button>${ai ? '<button data-j="s">✨ Versão mais curta (IA)</button><button data-j="t">✨ Outros títulos (IA)</button>' : ''}`,
        (m) =>
          $$('button', m).forEach(
            (x) =>
              (x.onclick = guard(async () => {
                const j = x.dataset.j;
                m.remove();
                if (j === 'b') return setTimes(k, before.t, k.end, 'Uma frase a mais no começo.');
                if (j === 'a') return setTimes(k, k.start, after.end, 'Uma frase a mais no fim.');
                if (j === 'f') return setTimes(k, first.t, k.end, 'Primeira frase retirada.');
                if (j === 'l') return setTimes(k, k.start, last.end, 'Última frase retirada.');
                const old = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'IA pensando…';
                try {
                  const r = await api(`/uploads/${c.id}/clips/${k.id}/ai/refine`, {
                    json: { mode: j === 's' ? 'shorter' : 'titles' },
                  });
                  if (j === 's')
                    return modal(
                      'Versão mais curta',
                      `<p style="margin:0 0 10px">De <b>${tm(k.start)} → ${tm(k.end)}</b> (${Math.round(dur(k))} s) para <b>${tm(r.start)} → ${tm(r.end)}</b> (${Math.round(r.end - r.start)} s).</p><p class="sub2" style="margin:0">${esc(r.reason || '')}</p>`,
                      guard(async () => {
                        await setTimes(k, r.start, r.end, 'Corte encurtado.');
                      }),
                      'Usar esta versão',
                      'Trocar os tempos descarta a exportação anterior deste corte.',
                    );
                  modal(
                    'Outros títulos',
                    `<p class="sub2" style="margin:0 0 10px">Atual: ${esc(k.title)}</p>${r.titles.map((t, i) => `<label class="ttl-opt"><input type="radio" name="ttl" value="${i}" ${i === 0 ? 'checked' : ''}> <span>${esc(t)}</span></label>`).join('')}`,
                    guard(async (mm) => {
                      const pick = r.titles[+($('input[name="ttl"]:checked', mm) || {}).value || 0];
                      await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { title: pick } });
                      k.title = pick;
                      draw();
                      toast('Título trocado.');
                    }),
                    'Usar este título',
                  );
                } finally {
                  btn.disabled = false;
                  btn.textContent = old;
                }
              })),
          ),
      );
    };
    const draw = () => {
      const l = fil().sort((a, b) =>
        sort === 'score' ? b.score - a.score : sort === 'low' ? a.score - b.score : a.start - b.start,
      );
      $('#ccnt').textContent = l.length === 1 ? '1 corte' : `${l.length} cortes`;
      const n0 = shared.clips.filter((k) => !k.manual).length,
        n1 = shared.clips.length - n0;
      if ($('#cn0')) {
        $('#cn0').textContent = n0;
        $('#cn1').textContent = n1;
      }
      $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === shared.mode));
      $('#cuts').innerHTML =
        l
          .map(
            (k) => `<div class="cut ${k.hid ? 'hid' : ''}" data-c="${k.id}">${mediaTag(k)}
        <div class="sc">${k.score ? `<span class="chipx">⚡ ${k.score}</span>` : ''}<span class="chipx ok">${k.render && k.render.status === 'rendering' ? '⏳ Renderizando' : k.downloaded ? '✓ Baixado' : k.render && k.render.status === 'done' ? 'Pronto' : 'Novo'}</span><button class="tlink" data-a="ed" title="Ajustar título e tempos" aria-label="Ajustar título e tempos do corte">${tm(k.start)} → ${tm(k.end)} · ${Math.round(dur(k))}s${k.render && k.render.status === 'done' && k.render.speed && k.render.speed !== 1 ? ` · exportado em ${String(k.render.speed).replace('.', ',')}x: ${Math.round(k.render.seconds)}s` : ''} ${ic.edit}</button></div><h4>${esc(k.title)}</h4>${k.manual && /^Corte criado manualmente/.test(k.description || '') ? '' : `<p class="ds">${esc(k.description)}</p>`}
        <div class="tg" style="display:flex;gap:6px;flex-wrap:wrap">${[...new Set([k.type, k.emotion, ...(k.tags || [])].filter(Boolean))].map((t, i) => `<span class="tag2 ${'abc'[i % 3]}">${esc(t)}</span>`).join('')}</div>
        ${driveOn && k.driveError && !k.drive ? `<div class="drv-err" role="alert">Envio ao Drive falhou: ${esc(k.driveError.msg)}</div>` : ''}${overlapNote(k)}<div class="bt"><div class="bt1"><button class="ap-btn pri" data-a="dl">Baixar corte</button><button class="ap-btn" data-a="open" aria-label="Abrir o editor do corte" title="Abrir o editor do corte">${ic.scissors} Editar</button></div><div class="bt2">${driveBtn(k)}${S.status && S.status.ai ? `<button class="ap-btn ${k.post ? 'has' : ''}" data-a="post" title="Título, descrição e hashtags para publicar">✨ Texto</button>` : ''}<button class="ap-btn" data-a="adj" title="Aumentar, encurtar ou trocar o título deste corte">Ajustar ⌄</button><span class="sp"></span><button class="ap-btn ${k.fav ? 'on' : ''}" data-a="fav" aria-label="Favoritar" title="Favoritar">${ic.heartS}</button><button class="ap-btn" data-a="hid" aria-label="${k.hid ? 'Mostrar' : 'Ocultar'}" title="${k.hid ? 'Mostrar este corte' : 'Ocultar este corte'}">${ic.eye}</button></div></div></div>`,
          )
          .join('') ||
        `<div class="empty" style="grid-column:1/-1"><h3>${shared.mode === 0 ? 'Nenhum corte automático' : 'Nenhum corte manual'}</h3><p>${q || Object.values(f).some(Boolean) ? 'Nada bate com a busca ou os filtros.' : shared.mode === 0 ? (S.status && S.status.ai ? 'Use “Sugerir cortes com IA”, ou crie os seus na aba Manuais.' : 'Sem IA neste computador, os cortes são feitos por você: use “Colar minutagens” ou “+ Novo corte”.') : 'Use “Colar minutagens” ou “+ Novo corte”. Na Transcrição também dá para selecionar linhas e criar um corte.'}</p></div>`;
      $$('.cut video,.cut audio').forEach((m) =>
        m.addEventListener('play', () => {
          if (S.media) S.media.pause();
          $$('.cut video,.cut audio').forEach((o) => {
            if (o !== m) o.pause();
          });
        }),
      );
      $$('.cut').forEach((el) => {
        const k = shared.clips.find((x) => x.id === el.dataset.c);
        $$('[data-a]', el).forEach(
          (b) =>
            (b.onclick = guard(async () => {
              const a = b.dataset.a;
              if (a === 'fav') {
                await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { fav: !k.fav } });
                k.fav = !k.fav;
                draw();
              } else if (a === 'hid') {
                await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { hid: !k.hid } });
                k.hid = !k.hid;
                draw();
              } else if (a === 'adj') adjust(k, b);
              else if (a === 'post') {
                if (!k.post) {
                  b.disabled = true;
                  b.textContent = 'Escrevendo…';
                  try {
                    k.post = (await api(`/uploads/${c.id}/clips/${k.id}/ai/post`, { json: {} })).post;
                  } finally {
                    draw();
                  }
                }
                if (k.post) postModal(k);
              } else if (a === 'drive') {
                b.disabled = true;
                b.textContent = 'Enviando…';
                try {
                  await sendDrive(k);
                  delete k.driveError;
                } catch (e) {
                  k.driveError = { msg: e.message };
                  throw e;
                } finally {
                  draw();
                }
              } else if (a === 'dl') {
                // baixa direto: exporta com a edição salva do corte (ou, sem edição, no formato do vídeo e sem legenda) e salva o arquivo
                if (k.render && k.render.status === 'rendering') return toast('Este corte já está sendo exportado.');
                if (k.render && k.render.status === 'done') return fileDl(k);
                await api(`/uploads/${c.id}/clips/${k.id}/render`, { json: renderJson(k) });
                k.render = { status: 'rendering' };
                draw();
                toast(
                  k.editor
                    ? 'Exportando o corte com a edição salva… O download começa quando terminar.'
                    : 'Exportando o corte… O download começa quando terminar.',
                );
                pollRender(k.id);
              } else if (a === 'open') {
                // tesoura: abre o editor (formato, legenda, textos, ajustes finos)
                if (k.render && k.render.status === 'rendering') return toast('Este corte já está sendo exportado.');
                // estilos de legenda salvos (e o padrão), para o editor já abrir com eles
                const capStyles = await api('/caption-styles').catch(() => ({ styles: [], defaultId: null }));
                if (window.INVBFonts) await window.INVBFonts.load(); // fontes enviadas pela equipe
                ClipEditor.open({
                  capStyles,
                  upload: c,
                  clip: k,
                  segs: S.segs,
                  api,
                  toast,
                  tm,
                  esc,
                  dl,
                  drive: driveOn ? { token: driveToken, send: sendDrive } : null,
                  voiceAI: !!(S.status && S.status.voiceAI),
                  autosync: !!(S.status && S.status.autosync),
                  onDone: (list) => {
                    shared.clips = list;
                    draw();
                  },
                });
              } else if (a === 'ed')
                modal(
                  'Editar corte',
                  `<label>Título</label><input id="et" value="${esc(k.title)}"><label>Início (mm:ss)</label><input id="es" value="${tm(k.start)}"><label>Fim (mm:ss)</label><input id="ee" value="${tm(k.end)}">${k.manual ? '<label style="margin-top:14px"><a id="edel" style="color:#c0262d;cursor:pointer">Excluir este corte</a></label>' : ''}`,
                  guard(async (m) => {
                    const s = parseT($('#es', m).value),
                      e = parseT($('#ee', m).value);
                    if (!(e - s >= 3)) {
                      toast('O corte precisa ter ao menos 3s.');
                      return false;
                    }
                    const r = await api(`/uploads/${c.id}/clips/${k.id}`, {
                      method: 'PATCH',
                      json: { title: $('#et', m).value, start: s, end: e },
                    });
                    Object.assign(k, r);
                    draw();
                  }),
                  'Salvar',
                  'Alterar o tempo descarta a renderização anterior.',
                );
              const dd = $('#edel');
              if (dd)
                dd.onclick = guard(async () => {
                  await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'DELETE' });
                  shared.clips = shared.clips.filter((x) => x.id !== k.id);
                  document.querySelector('.modal-bg')?.remove();
                  draw();
                });
            })),
        );
      });
    };
    $('#call-dl').onclick = (e) => batch('dl', e.currentTarget);
    if ($('#call-dr')) $('#call-dr').onclick = (e) => batch('drive', e.currentTarget);
    $$('#cl-tabs button').forEach(
      (b) =>
        (b.onclick = () => {
          shared.mode = +b.dataset.m;
          $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
          draw();
        }),
    );
    $('#cq').oninput = (e) => {
      q = e.target.value.toLowerCase();
      draw();
    };
    $('#csort').onclick = (e) =>
      popover(
        e.currentTarget,
        [
          ['score', 'Maior impacto'],
          ['low', 'Menor impacto'],
          ['time', 'Ordem no vídeo'],
        ]
          .map((o) => `<button data-s="${o[0]}">${o[1]}</button>`)
          .join(''),
        (m) =>
          $$('button', m).forEach(
            (b) =>
              (b.onclick = () => {
                sort = b.dataset.s;
                $('#csort').textContent = `⇅ ${b.textContent} ⌄`;
                m.remove();
                draw();
              }),
          ),
      );
    const types = [...new Set(shared.clips.map((k) => k.type).filter(Boolean))],
      emos = [...new Set(shared.clips.map((k) => k.emotion).filter(Boolean))];
    $('#cfil').onclick = (e) =>
      popover(
        e.currentTarget,
        [
          [
            'show',
            'Mostrar',
            [
              ['', 'Todos'],
              ['vis', 'Visíveis'],
              ['fav', 'Favoritos'],
            ],
          ],
          [
            'dl',
            'Baixados',
            [
              ['', 'Todos'],
              ['sim', 'Sim'],
              ['nao', 'Não'],
            ],
          ],
          ['type', 'Tipo de corte', [['', 'Todos os tipos'], ...types.map((x) => [x, x])]],
          [
            'imp',
            'Impacto',
            [
              ['', 'Qualquer impacto'],
              ['80', '80+'],
              ['70', '70+'],
            ],
          ],
          [
            'dur',
            'Duração',
            [
              ['', 'Qualquer duração'],
              ['c', 'Até 30s'],
              ['m', '30–59s'],
              ['l', '1min+'],
            ],
          ],
          ...(emos.length ? [['emo', 'Emoção', [['', 'Todas as emoções'], ...emos.map((x) => [x, x])]]] : []),
        ]
          .map(
            (r) =>
              `<label>${r[1]}<select data-f="${r[0]}">${r[2].map((o) => `<option value="${o[0]}" ${f[r[0]] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`,
          )
          .join('') +
          `<div class="act"><button class="ap-btn" id="fx">Limpar</button><button class="ap-btn pri" id="fy">Ver resultados</button></div>`,
        (m) => {
          $('#fx', m).onclick = () => {
            f = { show: '', dl: '', type: '', imp: '', dur: '', emo: '' };
            m.remove();
            draw();
          };
          $('#fy', m).onclick = () => {
            $$('select', m).forEach((s) => (f[s.dataset.f] = s.value));
            m.remove();
            draw();
          };
        },
      );

    Object.assign(shared, { c, draw });
    Parts.actions(shared);

    draw();
  }
  Object.assign(INVB, { bindClips });
})();
