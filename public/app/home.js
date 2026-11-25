/* INVB Studio — Início, lista de pregações, envio do link ou arquivo, resumo da pregação e a tela de entrada. */
(function () {
  const INVB = window.INVB;
  const {
    toast,
    $,
    fmtSize,
    go,
    S,
    api,
    tm,
    googleToken,
    ic,
    esc,
    fmtDate,
    guard,
    statusLabel,
    pages,
    segsOf,
    chaptersOf,
    stClass,
    $$,
    popover,
    modal,
    upWhere,
  } = INVB;

  /* ---------- Telas ---------- */
  pages.home =
    () => `<span class="eyebrow" style="font-size:11px;font-weight:800;text-transform:uppercase;display:block;margin-bottom:6px">Mídia · Nova Vida Botafogo</span><h1>${greeting()}</h1><p class="sub2">Depois da transcrição, é só fazer os cortes.</p><div style="height:20px"></div>${uploadBox()}
      <div class="ap-h2"><h2>Últimas pregações</h2>${S.uploads.length > 4 ? '<a href="/app/uploads">Ver todas ›</a>' : ''}</div>${S.uploads.length ? `<div class="ap-cards">${S.uploads.slice(0, 4).map(upCard).join('')}</div>` : '<p class="sub2">Nenhuma pregação ainda. Cole um link acima para começar.</p>'}`;
  pages.uploads =
    () => `<div class="ap-head"><div><h1>Pregações</h1><p class="sub2">Todas as pregações deste computador e em que ponto cada uma está.</p></div></div>
      <div class="ap-tools"><label class="ap-search">${ic.search}<input id="fq" placeholder="Buscar pregação pelo nome..."></label><span class="ap-sp"></span><button class="ap-btn" id="fsort">⇅ Data: Mais recentes ⌄</button><button class="ap-btn" id="ffil">Filtros</button></div>
      <p class="sub2" id="fcnt" style="margin-bottom:10px"></p><div id="flist"></div>`;
  pages.uploadsNew = () =>
    `<div style="max-width:720px;margin:30px auto"><div class="ap-head"><h1 style="font-size:24px">Nova pregação</h1></div>${uploadBox()}<p class="sub2" style="text-align:center">Seus arquivos ficam no seu computador (pasta <code>data/</code>) e não são enviados a terceiros${S.status && (S.status.provider === 'openai' || S.status.llm) ? ', exceto o texto/áudio enviado à API de IA configurada' : ''}.</p></div>`;
  pages.overview = (c) => {
    const segs = segsOf(c),
      spk = new Set(segs.map((s) => s.who)).size,
      ch = chaptersOf(c),
      emo = (c.analysis.emotions || []).length;
    const cards = [
      [
        'transcription',
        ic.doc,
        'Transcrição',
        'Seu áudio foi transcrito automaticamente, com segmentação por trecho.',
        `Palavras transcritas: ${c.words || 0}`,
      ],
      [
        'chapters',
        ic.book,
        'Capítulos',
        'O conteúdo foi dividido em capítulos para facilitar a navegação.',
        `Capítulos: ${ch.length}`,
      ],
      [
        'emotions',
        ic.heart,
        'Emoções',
        emo
          ? 'Tom emocional das falas mais marcantes.'
          : aiOn()
            ? 'Ainda não analisado com a IA.'
            : 'Marcado pela IA (Claude ou OpenAI).',
        emo ? `${emo} falas marcadas` : aiOn() ? 'Refaça a análise' : 'Sem IA',
      ],
      ['clips', ic.cut, 'Cortes', 'Trechos sugeridos, com nota.', `${(c.clips || []).length} cortes`],
    ];
    return `${note(c)}<div class="ov"><div class="vid vid-slot"><div class="pl">▶</div></div><div><span class="eyebrow" style="font-size:10px">Resumo</span><h1 style="font-size:24px;margin-top:4px">${esc(c.name)}</h1><div class="metachips"><span class="metachip">${c.kind === 'aud' ? 'Áudio' : 'Vídeo'} enviado</span><span class="metachip">${tm(c.duration)}</span>${c.range ? `<span class="metachip" title="Só este trecho do vídeo foi guardado e transcrito">Trecho ${tm(c.range.start)}–${c.range.end ? tm(c.range.end) : 'fim'}</span>` : ''}<span class="metachip">${esc(c.language || '—')}</span><span class="metachip">${fmtDate(c.createdAt)}</span></div>
        <p style="margin:12px 0">Transcrevemos <b>${c.words || 0}</b> palavras, divididas em <b>${ch.length}</b> capítulos.</p><a class="ap-btn" href="/app/uploads/${c.id}/transcription">Abrir transcrição</a> <a class="ap-btn" href="/app/uploads/${c.id}/clips">Ver cortes</a> <button class="ap-btn" id="reana">Refazer análise</button></div></div>
        <div class="kpis">${[
          ['Duração do áudio', tm(c.duration)],
          ['Palavras transcritas', String(c.words || 0)],
          ['Segmentos de fala', String(segs.length)],
          ['Falantes identificados', String(spk)],
          ['Momentos-chave', String((c.clips || []).length)],
        ]
          .map((k) => `<div><small>${k[0]}</small><b>${k[1]}</b></div>`)
          .join('')}</div>
        <h2 style="font-size:17px;margin-bottom:4px">O que está pronto</h2><p class="sub2" style="margin-bottom:14px">Toque numa análise para abrir.</p><div class="rdy">${cards.map((k) => `<a href="/app/uploads/${c.id}/${k[0]}"><div class="ib">${k[1]}</div><b>${k[2]}</b><p>${k[3]}</p><p style="margin-top:8px;font-size:11px">${k[4]}</p></a>`).join('')}</div>`;
  };

  /* ---------- Envio (real) ---------- */
  const OKEXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|mov|avi|mkv|webm|m4v)$/i;
  function sendFile(file, root) {
    if (!OKEXT.test(file.name)) return toast('Formato não suportado. Use MP3, WAV, M4A, MP4, MOV, MKV…');
    let range;
    try {
      range = readRange(root);
    } catch (e) {
      return toast(e.message);
    }
    const bar = $('#upbar', root),
      lab = $('#uplab', root);
    if (bar) bar.parentElement.hidden = false;
    const x = new XMLHttpRequest();
    x.open(
      'POST',
      '/api/uploads?name=' +
        encodeURIComponent(file.name) +
        (range.start ? '&start=' + encodeURIComponent(range.start) : '') +
        (range.end ? '&end=' + encodeURIComponent(range.end) : '') +
        (readLater(root) ? '&later=1' : ''),
    );
    x.setRequestHeader('x-invb', '1');
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && bar) {
        bar.style.width = (e.loaded / e.total) * 100 + '%';
        lab.textContent = `Enviando ${fmtSize(e.loaded)} de ${fmtSize(e.total)}…`;
      }
    };
    x.onload = () => {
      if (x.status === 201) {
        toast('Envio concluído. Processando…');
        go('/app/uploads');
      } else {
        let m = 'Falha no envio.';
        try {
          m = JSON.parse(x.responseText).error;
        } catch {
          /* */
        }
        if (x.status === 401) return go('/entrar');
        toast(m);
        if (bar) bar.parentElement.hidden = true;
      }
    };
    x.onerror = () => toast('Falha de conexão com o servidor.');
    x.send(file);
  }
  // Uma caixa só para começar uma pregação: o link (YouTube ou Google Drive, o app reconhece qual é) ou um arquivo do computador.
  // Trecho da pregação dentro de um vídeo maior (a live inteira do culto): só ele fica no computador e é transcrito.
  const rangeRow = () =>
    `<div class="up-range" role="group" aria-label="Trecho da pregação"><span class="up-rl">Só a pregação <small>(opcional)</small></span><label>de <input class="rg-a" placeholder="1:05:30" autocomplete="off" spellcheck="false" aria-label="Início da pregação no vídeo"></label><label>até <input class="rg-b" placeholder="1:52:00" autocomplete="off" spellcheck="false" aria-label="Fim da pregação no vídeo"></label></div><p class="up-hint">Vídeo do culto inteiro? Marque onde a pregação começa e termina: só esse trecho fica no computador e é transcrito. Em branco, vale o vídeo todo.</p>`;
  // Devolve { start, end } como digitado, ou lança o erro em português (o servidor confere de novo).
  const readRange = (root) => {
    const r = { start: ($('.rg-a', root) || {}).value || '', end: ($('.rg-b', root) || {}).value || '' };
    RangeUtils.cleanRange(r);
    return r;
  };
  // Depois de baixar: cortar no Editor avançado antes de transcrever (padrão) ou transcrever já. A escolha fica lembrada.
  const laterPref = () => {
    try {
      return localStorage.getItem('invb-depois') !== 'agora';
    } catch {
      return true;
    }
  };
  const laterRow = () =>
    `<div class="up-after" role="radiogroup" aria-label="Depois de baixar"><span class="up-rl">Depois de baixar</span><label><input type="radio" name="up-later" value="1" ${laterPref() ? 'checked' : ''}> Cortar no Editor avançado antes de transcrever</label><label><input type="radio" name="up-later" value="0" ${laterPref() ? '' : 'checked'}> Transcrever agora</label></div>`;
  const readLater = (root) => {
    const r = $('input[name="up-later"]:checked', root);
    const later = !r || r.value === '1';
    try {
      localStorage.setItem('invb-depois', later ? 'editor' : 'agora');
    } catch {
      /* ok */
    }
    return later;
  };
  const uploadBox = () =>
    `<div id="ut-body"><div class="ap-yt up1"><b style="font-size:16px">Cole o link da pregação</b><br><span class="sub2">YouTube ou Google Drive. Pode ser a live inteira: o louvor sai no Editor avançado.</span><br><input id="lk" placeholder="https://www.youtube.com/watch?v=...  ou  https://drive.google.com/file/d/..." aria-label="Link do YouTube ou do Google Drive" autocomplete="off" spellcheck="false">${laterRow()}${rangeRow()}<button class="ap-btn pri lg" id="lkgo">Baixar</button><p class="sub2 up-msg" id="lkmsg" role="alert"></p><button class="ap-btn" id="lklogin" hidden>Entrar com o Google e tentar de novo</button><p class="up-alt">Ou <button type="button" class="up-link" id="lkfile">envie um arquivo do computador</button></p></div><div id="ut-file" hidden></div></div>`;
  function bindUpload(root) {
    const body = $('#ut-body', root);
    if (!body) return;
    const cid = S.status && S.status.driveClientId,
      inp = $('#lk', body),
      msg = $('#lkmsg', body),
      login = $('#lklogin', body),
      btn = $('#lkgo', body);
    const isDrive = (u) => /^(https?:\/\/)?(drive|docs)\.google\.com\//i.test(u);
    const send = async (token) => {
      const url = inp.value.trim();
      msg.textContent = '';
      login.hidden = true;
      if (!url) {
        msg.textContent = 'Cole o link da pregação para continuar.';
        return inp.focus();
      }
      let range;
      try {
        range = readRange(body);
      } catch (e) {
        msg.textContent = e.message;
        return;
      }
      const later = readLater(body);
      btn.disabled = true;
      try {
        if (isDrive(url)) {
          await api('/uploads/drive', { json: { url, token, range, later } });
          toast('Download do Drive iniciado.');
        } else await api('/uploads/youtube', { json: { url, range, later } });
        go('/app/uploads');
      } catch (e) {
        if (e.status === 401) return go('/entrar');
        msg.textContent = e.message;
        if (e.data && e.data.needsLogin && cid) login.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };
    btn.onclick = () => send();
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') send();
    };
    // Link do YouTube com o tempo marcado (&t=...): já sugere esse ponto como início da pregação.
    const ra = $('.rg-a', body);
    inp.oninput = () => {
      const t = RangeUtils.ytStart(inp.value.trim());
      if (t && (!ra.value || ra.dataset.auto)) {
        ra.value = tm(t);
        ra.dataset.auto = '1';
      } else if (!t && ra.dataset.auto) {
        ra.value = '';
        delete ra.dataset.auto;
      }
    };
    ra.addEventListener('input', () => {
      delete ra.dataset.auto;
    });
    login.onclick = async () => {
      try {
        await send(await googleToken(cid));
      } catch (e) {
        msg.textContent = e.message;
      }
    };
    // arquivo do computador: abre a área de arrastar logo abaixo
    const fileBox = $('#ut-file', body);
    $('#lkfile', body).onclick = () => {
      const linkBox = $('.up1', body);
      linkBox.hidden = true;
      fileBox.hidden = false;
      fileBox.innerHTML = `<div class="up-file"><button type="button" class="up-back" id="lkback">${ic.back} Voltar para colar um link</button>${laterRow()}${rangeRow()}<div class="ap-drop" id="drop"><div class="ci">${ic.up}</div><b>Arraste o arquivo aqui</b><small>ou clique para escolher</small><p class="fm">Áudio: MP3, WAV, M4A, AAC, OGG, OPUS • Vídeo: MP4, MOV, AVI, MKV, WEBM</p><input type="file" id="file" hidden accept="audio/*,video/*,.mkv,.mov"><div hidden style="max-width:420px;margin:18px auto 0"><div class="bigbar"><i id="upbar" style="width:0"></i></div><small id="uplab" class="sub2"></small></div></div></div>`;
      $('#lkback', fileBox).onclick = () => {
        fileBox.hidden = true;
        fileBox.innerHTML = '';
        linkBox.hidden = false;
        inp.focus();
      };
      const f = $('#file', fileBox),
        d = $('#drop', fileBox);
      d.onclick = (e) => {
        if (!e.target.closest('[hidden]')) f.click();
      };
      f.onchange = () => f.files[0] && sendFile(f.files[0], fileBox);
      d.ondragover = (e) => {
        e.preventDefault();
        d.classList.add('over');
      };
      d.ondragleave = () => d.classList.remove('over');
      d.ondrop = (e) => {
        e.preventDefault();
        d.classList.remove('over');
        e.dataTransfer.files[0] && sendFile(e.dataTransfer.files[0], fileBox);
      };
    };
  }

  /* ---------- Páginas ---------- */
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };
  const upCard = (u) =>
    `<a class="ap-up" href="/app/uploads/${u.id}/overview"><div class="th"><i>${u.kind === 'aud' ? ic.aud : ic.vid}</i>${u.kind === 'vid' && (u.status === 'done' || u.status === 'waiting') ? `<img src="/api/uploads/${u.id}/thumb" alt="" loading="lazy" onerror="this.remove()">` : ''}${u.duration ? `<em>${tm(u.duration)}</em>` : ''}</div><b>${esc(u.name)}</b><small>${fmtDate(u.createdAt).split(',')[0]} · ${esc(upWhere(u))}</small></a>`;
  const aiOn = () => !!(S.status && S.status.ai);
  const aiFailNote = (c) => {
    const n = String((c.analysis && c.analysis.note) || ''),
      m = /^A IA não conseguiu analisar esta pregação \((.*?)\)\./.exec(n);
    return m ? m[1] : '';
  };
  const note = (c) =>
    !(c.analysis && c.analysis.mode === 'heuristic')
      ? ''
      : aiOn()
        ? `<div class="ap-demo gone" role="status"><span>${aiFailNote(c) ? 'A IA não conseguiu analisar esta pregação: ' + esc(aiFailNote(c)) + '.' : 'Esta pregação foi analisada sem IA, antes de a chave estar ligada neste computador.'} Capítulos, emoções e cortes podem ser refeitos com ${esc(S.status.aiName || 'a IA')}.</span><button class="ap-btn" data-reana>Refazer com IA</button></div>`
        : '<div class="ap-demo" style="background:#f3f2ff;border-color:#d5d2ff;color:#3b2fc0">Análise local simples, sem IA: capítulos por pausas e cortes por ritmo de fala. Com uma chave do Claude ou da OpenAI neste computador, capítulos, emoções e cortes passam a vir da IA.</div>';
  // Refaz a análise e espera o resultado (capítulos e emoções pela IA; os cortes automáticos são trocados; os manuais ficam).
  const reanalyze = guard(async (btn) => {
    const id = S.cur.id,
      before = JSON.stringify([
        S.cur.analysis && S.cur.analysis.mode,
        S.cur.aiCutsAt || 0,
        (S.cur.analysis && S.cur.analysis.note) || '',
      ]);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Analisando…';
    }
    await api(`/uploads/${id}/reanalyze`, { json: {} });
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const m = await api('/uploads/' + id);
      if (
        JSON.stringify([m.analysis && m.analysis.mode, m.aiCutsAt || 0, (m.analysis && m.analysis.note) || '']) !==
        before
      ) {
        toast('Análise refeita.');
        return go(location.pathname);
      }
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Refazer com IA';
    }
    toast('A análise está demorando. Recarregue a página em instantes.');
  });
  // "Cortar no editor antes de transcrever": o vídeo já está no computador, esperando a versão cortada
  const waitView = (c) =>
    `<div class="empty" id="proc"><div class="ci">✂️</div><h3>Aguardando o corte no Editor avançado</h3><p>O vídeo já está no computador. Abra no Editor avançado, corte o louvor e os avisos e, ao exportar, escolha <b>Substituir o vídeo de uma pregação</b> → esta pregação. Aí o Studio transcreve só a pregação.</p><div class="wait-act"><a class="ap-btn pri" href="/editor-avancado/projects?pregacao=${esc(c.id)}" target="_blank" rel="noopener">Abrir no Editor avançado</a><button class="ap-btn" id="now">Transcrever agora, sem cortar</button></div><a class="ap-btn" href="/app/uploads" style="margin-top:10px">Todas as pregações</a></div>`;
  const procView = (c) =>
    `<div class="empty" id="proc"><div class="ci">${c.status === 'error' ? '⚠️' : '⏳'}</div><h3>${c.status === 'error' ? 'Não foi possível processar' : 'Processando…'}</h3><p id="procmsg">${c.status === 'error' ? esc(c.error || 'Erro desconhecido.') : esc(statusLabel(c))}</p>${c.status === 'error' ? `<button class="ap-btn pri" id="retry">Tentar de novo</button> ` : `<div class="bigbar" style="max-width:320px;margin:10px auto"><i id="procbar" style="width:${c.progress || 3}%"></i></div>`}<a class="ap-btn" href="/app/uploads">Todas as pregações</a></div>`;

  /* ---------- binds ---------- */
  function bindUploads() {
    let q = '',
      sort = 'recent',
      stF = '';
    const draw = () => {
      let l = S.uploads.filter(
        (u) =>
          u.name.toLowerCase().includes(q) &&
          (!stF ||
            (stF === 'done'
              ? u.status === 'done'
              : stF === 'err'
                ? u.status === 'error'
                : ['queued', 'processing'].includes(u.status))),
      );
      if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name));
      if (sort === 'old') l = [...l].sort((a, b) => a.createdAt - b.createdAt);
      $('#fcnt').textContent = l.length === 1 ? '1 pregação' : `${l.length} pregações`;
      $('#flist').innerHTML =
        l
          .map(
            (u) =>
              `<div class="ap-row" data-up="${u.id}"><a class="rth" href="/app/uploads/${u.id}/overview" tabindex="-1" aria-hidden="true"><i>${u.kind === 'aud' ? ic.aud.replace('20', '16') : ic.vid.replace('20', '16')}</i>${u.kind === 'vid' && (u.status === 'done' || u.status === 'waiting') ? `<img src="/api/uploads/${u.id}/thumb" alt="" loading="lazy" onerror="this.remove()">` : ''}${u.duration ? `<em>${tm(u.duration)}</em>` : ''}</a><a class="nm" href="/app/uploads/${u.id}/overview"><b>${esc(u.name)}</b><small>${fmtDate(u.createdAt)} • ${fmtSize(u.size)}${u.cuts && u.cuts.total ? ` • ${u.cuts.total} corte${u.cuts.total === 1 ? '' : 's'}${u.cuts.ready ? ` · ${u.cuts.ready} exportado${u.cuts.ready === 1 ? '' : 's'}` : ''}${u.cuts.drive ? ` · ${u.cuts.drive} no Drive` : ''}` : ''}</small></a><span class="st ${stClass(u)}">${esc(statusLabel(u))}</span><button class="ap-ic" data-opt="${u.id}" aria-label="Opções do upload">⋮</button></div>`,
          )
          .join('') || '<div class="empty"><p>Nenhuma pregação encontrada.</p></div>';
      $$('[data-opt]').forEach(
        (b) =>
          (b.onclick = (e) => {
            e.preventDefault();
            const id = b.dataset.opt,
              u = S.uploads.find((z) => z.id === id);
            popover(
              b,
              `<button data-a="open">Abrir</button><button data-a="ren">Renomear</button>${u.status === 'error' ? '<button data-a="retry">Tentar de novo</button>' : ''}${u.status === 'waiting' ? '<button data-a="editor">Abrir no Editor avançado</button><button data-a="now">Transcrever agora</button>' : ''}${u.status === 'done' && !u.originalGone && (u.source === 'youtube' || u.source === 'drive') && u.url ? '<button data-a="free">Liberar espaço</button>' : ''}<button data-a="del" style="color:#c0262d">Excluir</button>`,
              (m) =>
                $$('button', m).forEach(
                  (x) =>
                    (x.onclick = () => {
                      m.remove();
                      const a = x.dataset.a;
                      if (a === 'free')
                        return modal(
                          'Liberar espaço',
                          '',
                          guard(async () => {
                            await api(`/uploads/${id}/free`, { json: {} });
                            u.originalGone = true;
                            toast('Pregação apagada deste computador. O link continua salvo.');
                          }),
                          'Apagar o vídeo',
                          `Apaga só o vídeo de “${esc(u.name)}” deste computador. A transcrição, a minutagem e os cortes prontos ficam. Para usar o vídeo de novo, o app baixa pelo link.`,
                        );
                      if (a === 'open') go(`/app/uploads/${id}/overview`);
                      if (a === 'ren')
                        modal(
                          'Renomear arquivo',
                          `<label>Nome</label><input id="rn" value="${esc(u.name)}">`,
                          guard(async (mm) => {
                            const v = $('#rn', mm).value.trim();
                            if (!v) return false;
                            await api('/uploads/' + id, { method: 'PATCH', json: { name: v } });
                            u.name = v;
                            draw();
                          }),
                        );
                      if (a === 'retry')
                        guard(async () => {
                          await api(`/uploads/${id}/retry`, { method: 'POST', json: {} });
                          await refreshList();
                        })();
                      if (a === 'now')
                        guard(async () => {
                          await api(`/uploads/${id}/retry`, { method: 'POST', json: { now: true } });
                          await refreshList();
                        })();
                      if (a === 'editor') window.open('/editor-avancado/projects?pregacao=' + id, '_blank', 'noopener');
                      if (a === 'del')
                        modal(
                          'Excluir pregação',
                          '',
                          guard(async () => {
                            await api('/uploads/' + id, { method: 'DELETE' });
                            S.uploads = S.uploads.filter((z) => z.id !== id);
                            draw();
                            toast('Envio excluído do disco.');
                          }),
                          'Excluir',
                          `Isso apaga “${esc(u.name)}”, a transcrição e os cortes gerados. Não dá para desfazer.`,
                        );
                    }),
                ),
            );
          }),
      );
    };
    S.redraw = draw;
    $('#fq').oninput = (e) => {
      q = e.target.value.toLowerCase();
      draw();
    };
    $('#fsort').onclick = (e) =>
      popover(
        e.currentTarget,
        [
          ['recent', 'Data: Mais recentes'],
          ['old', 'Data: Mais antigos'],
          ['name', 'Nome (A–Z)'],
        ]
          .map((o) => `<button data-s="${o[0]}">${o[1]}</button>`)
          .join(''),
        (m) =>
          $$('button', m).forEach(
            (b) =>
              (b.onclick = () => {
                sort = b.dataset.s;
                $('#fsort').textContent = `⇅ ${b.textContent} ⌄`;
                m.remove();
                draw();
              }),
          ),
      );
    $('#ffil').onclick = (e) =>
      popover(
        e.currentTarget,
        `<label>Status <select id="fs"><option value="">Todos</option><option value="done" ${stF === 'done' ? 'selected' : ''}>Concluído</option><option value="proc" ${stF === 'proc' ? 'selected' : ''}>Processando</option><option value="err" ${stF === 'err' ? 'selected' : ''}>Com erro</option></select></label><div class="act"><button class="ap-btn pri" id="fok">Aplicar</button></div>`,
        (m) => {
          $('#fok', m).onclick = () => {
            stF = $('#fs', m).value;
            m.remove();
            draw();
          };
        },
      );
    draw();
  }
  async function refreshList() {
    S.uploads = await api('/uploads');
    if (S.redraw) S.redraw();
  }

  /* ---------- Login ---------- */
  const login =
    () => `<div class="lg"><div class="l"><div class="lg-theme"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><button class="thsw" data-theme-sw role="switch" aria-checked="${window.InvbTheme && InvbTheme.get() === 'dark'}" aria-label="Modo noturno" type="button"></button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></div><form class="lgc" id="lgf"><img class="lg-logo c" src="/img/nv-logo-claro.png" alt="Nova Vida Botafogo"><img class="lg-logo n" src="/img/nv-logo-noturno.png" alt="Nova Vida Botafogo"><h1>INVB Studio</h1><p class="sub2" style="text-align:center">Entre com a senha da equipe de mídia.</p>
    <input id="pw" type="password" placeholder="Senha de acesso" autocomplete="current-password" aria-label="Senha de acesso" autofocus><button class="ap-btn pri" type="submit">Entrar</button><p class="sub2" id="lgerr" style="text-align:center;margin-top:10px;font-size:12.5px;color:#c0262d;min-height:18px"></p>
</form></div>
    <div class="r"><div><img src="/img/nv-logo-noturno.png" width="220" alt="Nova Vida Botafogo"><span class="tag">Mídia · Pregações</span><h2>Da pregação inteira aos cortes prontos para postar.</h2><span class="pill2">1. Transcrição</span><span class="pill2">2. Cortes</span><span class="pill2">3. Drive</span></div></div></div>`;
  Object.assign(INVB, { note, aiOn, bindUploads, login, procView, waitView, bindUpload, reanalyze, refreshList });
})();
