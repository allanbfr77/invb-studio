/* INVB Studio — Tela de transcrição. */
(function () {
  const INVB = window.INVB;
  const {
    ic,
    tm,
    pages,
    S,
    api,
    $,
    segsOf,
    linesOf,
    esc,
    $$,
    modal,
    guard,
    toast,
    dl,
    parseT,
    popover,
    srtT,
    seek,
    paintPlayer,
    go,
  } = INVB;

  /* ---------- Telas ---------- */
  pages.transcription = (
    c,
  ) => `<h1>Transcrição</h1><p class="sub2">Clique em uma palavra para levar o vídeo ao segundo exato dela. Para criar um corte, use Selecionar e marque as linhas.</p><div style="height:16px"></div>
      <div class="tr2"><div><div class="tr-head"><div class="ap-tools"><label class="ap-search" style="max-width:none">${ic.search}<input id="tq" placeholder="Buscar na transcrição..."></label></div>
      <div class="ap-tools"><span class="ap-sp"></span>${c.transcript && c.transcript.reviewedAt ? `<button class="ap-btn" id="trev" title="A revisão da IA tirou a legenda do tempo do áudio: volta o texto e os tempos do reconhecimento de voz">↩ Desfazer revisão da IA</button>` : ''}<button class="ap-btn" id="tvoc" title="Nomes e termos que a transcrição deve escrever certo">Vocabulário</button><button class="ap-btn pri" id="tclaude">Copiar para o Claude</button><button class="ap-btn" id="tcut" hidden>Criar corte da seleção</button><button class="ap-btn" id="tsel">Selecionar</button><button class="ap-btn" id="tdl">${ic.dl} Baixar ⌄</button><button class="ap-btn" id="tfil">Filtros</button></div></div>
      <div class="segs" id="segs"></div><div class="stat3"><h4>Resumo Estatístico</h4><div class="g"><div><b>${(c.clips || []).length}</b><small>Momentos-chave</small></div><div><b>${tm(c.duration)}</b><small>Duração total</small></div><div><b>${c.words || 0}</b><small>Palavras</small></div></div></div></div>
      <div class="rpanel">${c.kind === 'vid' ? '<div class="vid vid-slot"></div>' : ''}<div class="dlp"><b style="color:var(--fg)">Baixar</b><button class="ap-btn" data-d="orig">Baixar arquivo original</button><div class="g2">${['TXT', 'SRT', 'VTT'].map((f) => `<button class="ap-btn" data-d="${f}">${f}</button>`).join('')}</div></div></div></div>`;

  function bindTranscription() {
    const c = S.cur;
    // desfaz a revisão antiga da IA (ela repartia o tempo das palavras e a legenda saía fora do áudio)
    const rev = $('#trev');
    if (rev)
      rev.onclick = guard(async () => {
        rev.disabled = true;
        try {
          const r = await api(`/uploads/${c.id}/transcript/undo-review`, { json: {} });
          toast(
            r.restored
              ? `${r.restored} trecho${r.restored === 1 ? '' : 's'} de volta ao original${r.approx ? ` (${r.approx} com o tempo aproximado)` : ''}.`
              : 'Nada a desfazer.',
          );
          go(location.pathname);
        } finally {
          rev.disabled = false;
        }
      });
    // vocabulário da igreja: vai como dica para a transcrição
    const voc = $('#tvoc');
    if (voc)
      voc.onclick = guard(async () => {
        const v = await api('/vocabulary');
        modal(
          'Vocabulário da igreja',
          `<textarea id="voc-t" rows="7" style="width:100%" placeholder="ex.: Pr. Fulano de Tal, Ministério Ágape, Rede Kairós, Botafogo">${esc(v.team || '')}</textarea>
          <details style="margin-top:8px"><summary class="sub2">Já incluído sempre (livros da Bíblia e termos comuns)</summary><p class="sub2">${esc(v.base)}</p></details>`,
          async (m) => {
            try {
              await api('/vocabulary', { method: 'PUT', json: { team: $('#voc-t', m).value } });
              toast('Vocabulário salvo.');
            } catch (e) {
              toast(e.message);
              return false;
            }
          },
          'Salvar',
          'Nomes e termos que a transcrição deve escrever certo: pastores, ministérios, lugares, expressões da igreja. Separe por vírgula ou um por linha. Vale para as próximas transcrições e para a revisão com IA.',
        );
      });
    let q = '',
      sel = false,
      spk = '',
      chk = new Set();
    let claudeTxt = '';
    const loadClaude = () =>
      api(`/uploads/${c.id}/claude`)
        .then((r) => {
          claudeTxt = r.text;
        })
        .catch(() => {});
    {
      const card = $('#ap-card'),
        mark = () => {
          S.userScrollAt = Date.now();
        };
      S.userScrollAt = 0;
      S.followL = -2;
      if (card) ['wheel', 'touchmove'].forEach((ev) => card.addEventListener(ev, mark, { passive: true }));
    }
    const reload = async () => {
      S.cur = await api('/uploads/' + c.id);
      S.segs = segsOf(S.cur);
      S.lines = linesOf(S.cur);
      draw();
      await loadClaude();
    };
    const linesTxt = (list) => TranscriptUtils.linesToText(list, tm);
    const draw = () => {
      const l = TranscriptUtils.matchLines(S.lines, q, spk);
      $('#segs').classList.toggle('one-spk', new Set(S.segs.map((x) => x.who)).size < 2); // um falante só: o nome repetido em cada fala sai da tela
      $('#segs').innerHTML =
        l
          .map((s, k) => {
            const first = !l[k - 1] || l[k - 1].seg !== s.seg;
            return `<div class="seg ln${first ? ' first' : ''}" data-l="${s.i}">${sel ? `<input type="checkbox" data-c="${s.i}" ${chk.has(s.i) ? 'checked' : ''}>` : ''}<span class="tcp">${tm(s.t)}</span><div style="flex:1">${first ? `<span class="sp" data-who="${s.seg}">${esc(s.who)}</span>` : ''}<p>${s.words.length ? s.words.map((w) => `<span class="w" data-s="${w.s}">${esc(w.t)}</span>`).join(' ') : esc(s.text)}</p></div>${first ? `<button class="ap-ic" data-ed="${s.seg}" aria-label="Editar texto da fala" style="width:26px;height:26px">${ic.edit}</button>` : '<span style="width:26px"></span>'}</div>`;
          })
          .join('') || '<p class="sub2" style="padding:20px">Nada encontrado.</p>';
      $$('.ln').forEach(
        (e) =>
          (e.onclick = (ev) => {
            if (ev.target.closest('[data-who],[data-c],[data-ed]')) return;
            const w = ev.target.closest('[data-s]');
            S.userScrollAt = 0;
            S.followL = -2;
            seek(w ? +w.dataset.s : S.lines[+e.dataset.l].t);
          }),
      );
      $$('[data-who]').forEach(
        (e) =>
          (e.onclick = () => {
            const old = S.segs[+e.dataset.who].who;
            modal(
              'Renomear falante',
              `<label>Novo nome para “${esc(old)}”</label><input id="nn" value="${esc(old)}">`,
              guard(async (m) => {
                const v = $('#nn', m).value.trim();
                if (!v) return false;
                await api(`/uploads/${c.id}/speakers`, { method: 'PATCH', json: { from: old, to: v } });
                await reload();
              }),
              'Salvar',
              'O nome vale para todas as falas dessa pessoa.',
            );
          }),
      );
      $$('[data-ed]').forEach(
        (e) =>
          (e.onclick = () => {
            const s = S.segs[+e.dataset.ed];
            modal(
              'Editar fala',
              `<label>Texto</label><textarea id="et" rows="5">${esc(s.text)}</textarea><label>Falante</label><input id="es" value="${esc(s.who)}">`,
              guard(async (m) => {
                const t = $('#et', m).value.trim();
                if (!t) return false;
                const w = $('#es', m).value.trim() || s.who;
                await api(`/uploads/${c.id}/segments/${s.id}`, { method: 'PATCH', json: { text: t, speaker: w } });
                await reload();
              }),
              'Salvar',
              `${tm(s.t)} — a correção vale para a exportação. A fala corrigida passa a aparecer em uma linha só.`,
            );
          }),
      );
      $$('[data-c]').forEach(
        (x) => (x.onchange = () => (x.checked ? chk.add(+x.dataset.c) : chk.delete(+x.dataset.c))),
      );
      paintPlayer();
    };
    $('#tq').oninput = (e) => {
      q = e.target.value.toLowerCase();
      draw();
    };
    $('#tsel').onclick = () => {
      if (sel && chk.size) {
        const t = linesTxt(S.lines.filter((s) => chk.has(s.i)));
        navigator.clipboard
          ?.writeText(t)
          .then(() => toast('Linhas copiadas.'))
          .catch(() => dl('selecao.txt', t));
      }
      sel = !sel;
      $('#tsel').textContent = sel ? 'Copiar e concluir' : 'Selecionar';
      $('#tcut').hidden = !sel;
      if (!sel) chk.clear();
      draw();
    };
    // Corte direto da transcrição: da primeira à última linha marcada (os tempos podem ser ajustados antes de criar).
    $('#tcut').onclick = () => {
      const pick = S.lines.filter((s) => chk.has(s.i));
      if (!pick.length) return toast('Marque as linhas do trecho primeiro.');
      modal(
        'Novo corte',
        `<label>Título</label><input id="nt" placeholder="Ex.: O amor de Deus"><label>Início (mm:ss)</label><input id="ns" value="${tm(pick[0].t)}"><label>Fim (mm:ss)</label><input id="ne" value="${tm(Math.ceil(pick[pick.length - 1].end))}">`,
        guard(async (m) => {
          const s = parseT($('#ns', m).value),
            e = parseT($('#ne', m).value);
          if (!(e - s >= 3)) {
            toast('O corte precisa ter ao menos 3s.');
            return false;
          }
          await api(`/uploads/${c.id}/clips`, {
            json: { title: $('#nt', m).value.trim() || 'Corte manual', start: s, end: e },
          });
          toast('Corte criado. Ele está na página Cortes.');
          sel = false;
          chk.clear();
          $('#tsel').textContent = 'Selecionar';
          $('#tcut').hidden = true;
          draw();
        }),
        'Criar corte',
        'Do começo da primeira linha marcada ao fim da última.',
      );
    };
    // O texto é buscado ao abrir a página para que a cópia aconteça no próprio clique (o navegador exige isso).
    loadClaude();
    $('#tclaude').onclick = () => {
      if (!claudeTxt) return toast('A transcrição ainda está carregando. Tente de novo em instantes.');
      const ok = () => toast('Transcrição copiada. Cole no Claude e peça os cortes.');
      if (navigator.clipboard)
        navigator.clipboard
          .writeText(claudeTxt)
          .then(ok)
          .catch(() => dl(base + '-para-o-claude.txt', claudeTxt));
      else dl(base + '-para-o-claude.txt', claudeTxt);
    };
    $('#tfil').onclick = (e) =>
      popover(
        e.currentTarget,
        `<label>Falante <select id="sf"><option value="">Todos</option>${[...new Set(S.segs.map((s) => s.who))].map((w) => `<option ${w === spk ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label><div class="act"><button class="ap-btn" id="x1">Limpar</button><button class="ap-btn pri" id="x2">Aplicar</button></div>`,
        (m) => {
          $('#x1', m).onclick = () => {
            spk = '';
            m.remove();
            draw();
          };
          $('#x2', m).onclick = () => {
            spk = $('#sf', m).value;
            m.remove();
            draw();
          };
        },
      );
    const base = c.name.replace(/\.[^.]+$/, '');
    const vtt = (t) => t.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2');
    const srt = () => S.segs.map((s, i) => `${i + 1}\n${srtT(s.t)} --> ${srtT(s.end)}\n${s.text}\n`).join('\n');
    const exp = (f) => {
      if (f === 'TXT') dl(base + '.txt', linesTxt(S.lines));
      else if (f === 'SRT') dl(base + '.srt', srt());
      else if (f === 'VTT') dl(base + '.vtt', 'WEBVTT\n\n' + vtt(srt()));
      else if (f === 'orig') {
        if (S.cur.originalGone)
          return toast(
            S.cur.canRefetch
              ? 'A pregação saiu deste computador. Use “Baixar de novo” no aviso do topo da página.'
              : 'O arquivo original não está mais neste computador.',
          );
        const a = document.createElement('a');
        a.href = `/api/uploads/${c.id}/media?orig=1`;
        a.download = c.name;
        a.click();
      }
    };
    $('#tdl').onclick = (e) =>
      popover(e.currentTarget, ['TXT', 'SRT', 'VTT'].map((f) => `<button>${f}</button>`).join(''), (m) =>
        $$('button', m).forEach(
          (b) =>
            (b.onclick = () => {
              m.remove();
              exp(b.textContent);
            }),
        ),
      );
    $$('[data-d]').forEach((b) => (b.onclick = () => exp(b.dataset.d)));
    draw();
  }
  Object.assign(INVB, { bindTranscription });
})();
