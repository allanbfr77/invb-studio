/* INVB Studio — editor do corte: as gavetas da direita (transcrição, templates, legendas, mídia, texto, ganchos e camadas).
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { CSx, $, clamp, SAMPLE, capHTML, EP, $$, rid } = window.ClipEditorParts.base;

  window.ClipEditorParts.drawers = function (shared) {
    const {
      sw,
      D,
      esc,
      ovById,
      st,
      renderOverlays,
      commit,
      delOverlay,
      clip,
      dur,
      segs,
      tm,
      approx,
      gone,
      upload,
      eff,
      root,
      api,
      paintCap,
      refreshBar,
      goStart,
      tickUI,
      toast,
      addOverlay,
    } = shared;
    // definidas em outra parte, mais adiante: chamadas pelo objeto comum na hora do uso
    const render = (...a) => shared.render(...a);
    Object.assign(shared, { drawDrawer });

    /* ----- drawer direito ----- */
    const propsEditor = (o) => {
      if (!o) return '';
      const timing = `<div class="dlx-row" style="margin-top:10px"><div><b>Todo o corte</b><small>Desligue para escolher quando aparece</small></div>${sw('pp-all', o.start === null && o.end === null)}</div>${o.start === null && o.end === null ? '' : `<div class="dlx-two"><label>Início (s)<input type="number" id="pp-s" min="0" step="0.1" value="${(o.start ?? 0).toFixed(1)}"></label><label>Fim (s)<input type="number" id="pp-e" min="0" step="0.1" value="${(o.end ?? D()).toFixed(1)}"></label></div>`}`;
      if (o.type === 'image')
        return `<div class="dlx-props"><h4>Imagem selecionada</h4><label>Largura <b>${Math.round(o.w * 100)}%</b></label><input type="range" id="pp-w" min="4" max="100" value="${Math.round(o.w * 100)}"><label>Opacidade <b>${Math.round(o.op * 100)}%</b></label><input type="range" id="pp-op" min="5" max="100" value="${Math.round(o.op * 100)}">${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
      return `<div class="dlx-props"><h4>Texto selecionado</h4><label>Conteúdo</label><textarea id="pp-text" rows="2" maxlength="200">${esc(o.text)}</textarea>
        <label>Fonte</label><select id="pp-font">${CSx.FONTS.map((f) => `<option ${f === o.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <label>Tamanho <b>${Math.round(o.size * 100)}</b></label><input type="range" id="pp-size" min="2" max="30" value="${Math.round(o.size * 100)}">
        <div class="dlx-two"><label>Cor<input type="color" id="pp-color" value="${o.color}"></label><label>Contorno<input type="color" id="pp-oc" value="${o.outline ? o.outline.color : '#000000'}"></label></div>
        <div class="dlx-chips" style="margin-top:8px"><button id="pp-ital" aria-pressed="${o.italic}">Itálico</button><button id="pp-up" aria-pressed="${o.upper}">MAIÚSCULAS</button><button id="pp-box" aria-pressed="${!!o.box}">Tarja</button></div>
        ${o.box ? `<div class="dlx-two"><label>Cor da tarja<input type="color" id="pp-bc" value="${o.box.color}"></label><label>Transparência<input type="range" id="pp-ba" min="0" max="90" value="${Math.round(o.box.alpha * 100)}"></label></div>` : ''}
        ${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
    };
    function bindProps(D2) {
      const o = ovById(st.sel);
      if (!o) return;
      const on = (id, ev, fn) => {
        const e = $('#' + id, D2);
        if (e) e.addEventListener(ev, fn);
      };
      const live = () => renderOverlays(),
        done = () => {
          commit();
          drawDrawer();
        };
      on('pp-text', 'input', (e) => {
        o.text = e.target.value || ' ';
        live();
      });
      on('pp-text', 'change', commit);
      on('pp-font', 'change', (e) => {
        o.font = e.target.value;
        commit();
        live();
      });
      on('pp-size', 'input', (e) => {
        o.size = +e.target.value / 100;
        live();
      });
      on('pp-size', 'change', done);
      on('pp-color', 'input', (e) => {
        o.color = e.target.value;
        live();
      });
      on('pp-color', 'change', commit);
      on('pp-oc', 'input', (e) => {
        o.outline = { color: e.target.value, w: 2 };
        live();
      });
      on('pp-oc', 'change', commit);
      on('pp-ital', 'click', () => {
        o.italic = !o.italic;
        done();
        live();
      });
      on('pp-up', 'click', () => {
        o.upper = !o.upper;
        done();
        live();
      });
      on('pp-box', 'click', () => {
        o.box = o.box ? null : { color: '#e11d48', alpha: 0 };
        done();
        live();
      });
      on('pp-bc', 'input', (e) => {
        o.box.color = e.target.value;
        live();
      });
      on('pp-bc', 'change', commit);
      on('pp-ba', 'input', (e) => {
        o.box.alpha = +e.target.value / 100;
        live();
      });
      on('pp-ba', 'change', commit);
      on('pp-w', 'input', (e) => {
        o.w = +e.target.value / 100;
        live();
      });
      on('pp-w', 'change', done);
      on('pp-op', 'input', (e) => {
        o.op = +e.target.value / 100;
        live();
      });
      on('pp-op', 'change', done);
      on('pp-all', 'click', () => {
        if (o.start === null && o.end === null) {
          o.start = 0;
          o.end = Math.min(3, D());
        } else {
          o.start = null;
          o.end = null;
        }
        done();
        live();
      });
      on('pp-s', 'change', (e) => {
        o.start = clamp(+e.target.value, 0, D());
        if (o.end !== null && o.end <= o.start) o.end = Math.min(D(), o.start + 1);
        done();
        live();
      });
      on('pp-e', 'change', (e) => {
        o.end = clamp(+e.target.value, 0.1, D());
        if (o.start !== null && o.start >= o.end) o.start = Math.max(0, o.end - 1);
        done();
        live();
      });
      on('pp-del', 'click', () => delOverlay(o.id));
    }
    const sampleCard = (S, tick) => {
      const E = S; // o estilo já vem resolvido (fonte, contorno, sombra...)
      const chunks = CSx.chunkWords(SAMPLE, S),
        ci = S.mode === 'block' ? 0 : chunks.findIndex((c) => c.some((w) => w.t === 'precisa')),
        ch = chunks[Math.max(0, ci)];
      const act = S.mode === 'block' ? -1 : tick % ch.length,
        ws = S.mode === 'block' ? [{ t: 'Você não precisa de mais tempo,' }] : ch;
      return `<span style="font-size:${14 * Math.min(S.scale || 1, 1.3)}px;line-height:1.15;text-align:center;display:block">${capHTML(S, E, 0.012, ws, act, S.mode === 'karaoke' ? ((tick % 5) + 1) * 20 : 55)}</span>`;
    };
    const tplHTML = (t) =>
      t.text
        ? `<span class="tp-bar" style="background:${t.bg};color:${t.fg || '#fff'}">${esc(t.text)}</span>`
        : `<span class="mini">${esc(CSx.byName(t.style).name)}</span>`;
    let drawerScroll = 0;
    const panelsHTML = {
      transcricao: () => {
        const ex = `<div class="dlx-two"><label>Início<span class="hms"><input type="number" min="0" data-hms="s0" value="${Math.floor(st.start / 3600)}">:<input type="number" min="0" max="59" data-hms="s1" value="${Math.floor((st.start % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="s2" value="${Math.floor(st.start % 60)}"></span></label><label>Fim<span class="hms"><input type="number" min="0" data-hms="e0" value="${Math.floor(st.end / 3600)}">:<input type="number" min="0" max="59" data-hms="e1" value="${Math.floor((st.end % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="e2" value="${Math.floor(st.end % 60)}"></span></label></div>`;
        const ctxSegs = segs.filter((s) => s.end > st.start - 30 && s.t < st.end + 30);
        const body = ctxSegs
          .map((s) => {
            const ws = shared.words.filter((w) => w.seg === s.id);
            const ed = st.edits[s.id] !== undefined;
            return `<div class="dlx-tseg"><div class="th"><b>${esc(s.who)}</b><span>${tm(s.t)}</span>${ed ? '<em>editado</em>' : ''}</div><p>${(ed
              ? approx(s, st.edits[s.id])
              : ws.length
                ? ws
                : approx(s, s.text)
            )
              .map((w) => {
                const inn = w.e > st.start && w.s < st.end;
                return `<span class="w ${inn ? '' : 'out'} ${gone(w) ? 'rm' : ''}" data-ws="${w.s}" data-we="${w.e}" data-seg="${s.id}">${esc(w.t)}</span>`;
              })
              .join(' ')}</p></div>`;
          })
          .join('');
        return `<h3>Corte</h3><button class="dlx-link" id="tr-big">${st.trLarge ? 'Reduzir transcrição' : 'Ampliar transcrição'}</button>
          <label class="dlx-lab">Título do corte<input id="tr-title" placeholder="Título (opcional)" value="${esc(st.title)}" maxlength="120"></label>
          <label class="dlx-lab">Intervalo do corte <small>Duração: ${Math.round(D())}s</small></label>${ex}
          <p class="dlx-sub" style="margin:6px 0 10px">Clique numa palavra para o corte começar ou terminar nela. A linha do tempo embaixo do vídeo faz o ajuste fino.</p>
          <div class="dlx-row"><div><b>Remover palavras</b><small>Clique nas palavras para cortá-las do vídeo</small></div>${sw('tr-rm', st.trMode === 'remove')}</div>
          <div class="dlx-row"><div><b>Editar texto</b><small>Clique numa fala para corrigir o texto da legenda</small></div>${sw('tr-ed', st.trMode === 'edit')}</div>
          <button class="ap-btn" id="tr-seg" style="width:100%;justify-content:center;margin-bottom:12px" title="Baixa este trecho do vídeo como está, sem legenda, textos nem ajustes">Baixar o trecho original</button>
          <div class="dlx-tlist ${st.trLarge ? 'big' : ''}">${body || '<p class="dlx-sub">Sem texto neste trecho.</p>'}</div>`;
      },
      templates: () => {
        const mine = (st.templates || []).filter((t) => t.config);
        const card = (id, name, inner, own) =>
          `<div class="dlx-card" data-tpl="${id}" role="button" tabindex="0">${own ? `<button class="x" data-tpl-del="${id}" aria-label="Excluir o template ${esc(name)}" title="Excluir">✕</button>` : ''}<div class="pv">${inner}</div><span>${esc(name)}</span></div>`;
        return `<p class="dlx-sub" style="margin-top:0">Um template aplica de uma vez o estilo da legenda e uma faixa de título no alto do corte. Depois dá para mudar tudo.</p>
          <h4>Meus templates</h4><div class="dlx-grid">${mine.map((t) => card(t.id, t.name, `<span class="mini">${esc(CSx.byName(t.config.style).name)}</span>`, true)).join('') || '<p class="dlx-sub" style="grid-column:1/-1;margin:0">Nenhum ainda. Monte o visual (legenda, textos, imagens) e salve aqui.</p>'}</div>
          <button class="ap-btn" id="tp-save" style="width:100%;justify-content:center;margin:10px 0 4px">Salvar o visual atual como template</button>
          ${EP.TEMPLATE_CATS.map(
            (c) =>
              `<h4>${esc(c.id)}</h4><div class="dlx-grid">${EP.TEMPLATES.filter((t) => t.cat === c.id)
                .map((t) => card(t.id, t.name, tplHTML(t)))
                .join('')}</div>`,
          ).join('')}`;
      },
      legendas: () => {
        // abas antigas (Fonte e Efeitos) viraram "Personalizar"
        if (st.tab === 'fonte' || st.tab === 'efeitos') st.tab = 'personalizar';
        const tabs = [
          ['estilos', 'Estilos'],
          ['personalizar', 'Personalizar'],
          ['traducao', 'Tradução'],
        ];
        const S = eff(),
          mine = (st.myStyles && st.myStyles.styles) || [],
          defId = st.myStyles && st.myStyles.defaultId,
          changed = Object.keys(CSx.diff(S, st.cap.style)).length > 0;
        let body = '';
        if (st.tab === 'estilos') {
          const card = (attr, id, name, S2, pressed, extra = '') =>
            `<div class="dlx-card" role="button" tabindex="0" ${attr}="${esc(id)}" aria-pressed="${pressed}">${extra}<div class="pv">${sampleCard(S2, 0)}</div><span>${name}</span></div>`;
          const mineCards = mine
            .map((it) =>
              card(
                'data-mine',
                it.id,
                `${esc(it.name)}${it.id === defId ? ' <em class="dlx-def">padrão</em>' : ''}`,
                CSx.resolve(CSx.fromSaved(it)),
                st.cap.on && st.cap.mine === it.id,
                `<button class="x" data-mine-del="${esc(it.id)}" aria-label="Excluir o estilo ${esc(it.name)}" title="Excluir">✕</button><button class="star ${it.id === defId ? 'on' : ''}" data-mine-def="${esc(it.id)}" aria-label="${it.id === defId ? 'Deixar de usar como padrão' : 'Usar como padrão nos cortes novos'}" title="${it.id === defId ? 'Padrão dos cortes novos (clique para tirar)' : 'Usar como padrão nos cortes novos'}">★</button>`,
              ),
            )
            .join('');
          body = `<p class="dlx-sub" style="margin-top:0">Escolha um ponto de partida. Em <b>Personalizar</b> dá para mudar tudo e salvar como estilo seu.</p>
            <div class="dlx-grid" id="sty-grid" style="margin-bottom:6px"><button class="dlx-card nosub" data-style="" aria-pressed="${!st.cap.on}"><div class="pv none">Sem legenda</div><span>Sem legenda</span></button></div>
            <h4>Meus estilos</h4><div class="dlx-grid sty-grid">${mineCards || '<p class="dlx-sub" style="grid-column:1/-1;margin:0">Nenhum ainda. Ajuste em Personalizar e clique em “Salvar como meu estilo”.</p>'}</div>
            ${CSx.CATEGORIES.map(
              (c) =>
                `<h4>${esc(c.id)}</h4><div class="dlx-grid sty-grid">${CSx.STYLES.filter((x) => x.cat === c.id)
                  .map((x) =>
                    card(
                      'data-style',
                      x.id,
                      esc(x.name),
                      x,
                      st.cap.on && !st.cap.mine && st.cap.style === x.id && !changed,
                    ),
                  )
                  .join('')}</div>`,
            ).join('')}`;
        } else if (st.tab === 'personalizar') {
          const hasHi = ['highlight', 'boxhl', 'karaoke'].includes(S.mode),
            hasWords = !['block', 'words1'].includes(S.mode);
          const color = (key, label, val) =>
            `<div class="dlx-color"><span>${label}</span><div class="dlx-swatches">${CSx.PAL.map((c) => `<button data-cset="${key}" data-c="${c}" style="background:${c}" aria-label="${label}: ${c}" ${val === c ? 'aria-pressed="true"' : ''}></button>`).join('')}<input type="color" data-color="${key}" value="${val}" aria-label="${label}: outra cor"></div></div>`;
          const range = (id, label, val, min, max, shown = val) =>
            `<label for="${id}">${label} <b id="${id}-v">${shown}</b></label><input type="range" id="${id}" min="${min}" max="${max}" value="${val}">`;
          const mine1 = st.cap.mine && mine.find((x) => x.id === st.cap.mine);
          body = `${st.cap.on ? '' : '<div class="dlx-note2">A legenda está desligada. <button class="dlx-link" id="cx-on">Ligar a legenda</button></div>'}
            <p class="dlx-sub" style="margin-top:0">Partindo de <b>${esc(mine1 ? mine1.name : CSx.byName(st.cap.style).name)}</b>${changed && !mine1 ? ', com mudanças' : ''}. <button class="dlx-link" id="cx-reset">Voltar ao estilo original</button></p>
            <div class="dlx-fx">
            <h4>Texto</h4>
            <label class="dlx-lab" for="cx-font">Fonte</label><select id="cx-font" class="dlx-select">${CSx.FONT_LIST.map((f) => `<option value="${esc(f.name)}" ${f.name === S.font ? 'selected' : ''}>${esc(f.name)} · ${esc(f.note)}</option>`).join('')}</select>
            <div class="dlx-fontpv" style="font-family:'${esc(S.font)}';${S.italic ? 'font-style:italic;' : ''}${S.upper ? 'text-transform:uppercase' : ''}">Você não precisa de mais tempo</div>
            ${range('cx-size', 'Tamanho', st.cap.size, 10, 32)}
            <div class="dlx-row" style="margin-top:14px"><div><b>Maiúsculas</b></div>${sw('cx-upper', S.upper)}</div>
            <div class="dlx-row"><div><b>Itálico</b></div>${sw('cx-italic', S.italic)}</div>
            <h4>Como a palavra falada aparece</h4>
            <div class="dlx-chips">${CSx.MODES.map((m) => `<button data-mode="${m[0]}" aria-pressed="${S.mode === m[0]}">${m[1]}</button>`).join('')}</div>
            ${hasWords ? range('cx-words', 'Palavras de cada vez', S.chunk, 1, 10) : ''}
            <h4>Cores</h4>
            ${color('color', 'Texto', S.color)}${hasHi ? color('hi', 'Palavra falada', S.hi) : ''}${S.box ? '' : color('outline', 'Contorno', S.outline)}
            <h4>Contorno, sombra e brilho</h4>
            ${S.box ? '<p class="dlx-sub" style="margin:0">Com fundo, o contorno não aparece.</p>' : range('cx-ow', 'Contorno', S.ow, 0, 10)}
            ${range('cx-sh', 'Sombra', S.shadow, 0, 8)}
            <div class="dlx-row" style="margin-top:14px"><div><b>Brilho</b><small>O contorno vira um brilho na cor da palavra falada</small></div>${sw('cx-glow', S.glow)}</div>
            <h4>Fundo</h4>
            <div class="dlx-row"><div><b>Fundo atrás do texto</b><small>Uma faixa que deixa a legenda legível em qualquer imagem</small></div>${sw('cx-box', !!S.box)}</div>
            ${S.box ? color('box', 'Cor do fundo', S.box.color) + range('cx-ba', 'Transparência', Math.round(S.box.alpha * 100), 0, 95, Math.round(S.box.alpha * 100) + '%') : ''}
            <h4>Entrada</h4>
            <div class="dlx-row"><div><b>Animação ao entrar</b><small>A legenda “pula” ao aparecer</small></div>${sw('cx-pop', S.pop)}</div>
            <h4>Posição</h4>
            <div class="dlx-chips">${[
              ['top', 'Topo'],
              ['middle', 'Meio'],
              ['bottom', 'Base'],
            ]
              .map((p) => `<button data-pos="${p[0]}" aria-pressed="${st.cap.pos === p[0]}">${p[1]}</button>`)
              .join('')}</div>
            ${st.cap.pos === 'middle' ? '' : `${range('cx-mg', 'Distância da borda', st.cap.margin === null || st.cap.margin === undefined ? (st.format === '9:16' ? 14 : 8) : st.cap.margin, 0, 40, st.cap.margin === null || st.cap.margin === undefined ? 'automática' : st.cap.margin + '%')}${st.cap.margin === null || st.cap.margin === undefined ? '' : '<button class="dlx-link" id="cx-mg-auto">Voltar à automática</button>'}`}
            </div>
            <div class="dlx-save">
              <button class="ap-btn pri" id="cx-save">Salvar como meu estilo</button>
              ${mine1 ? `<button class="ap-btn" id="cx-upd">Atualizar “${esc(mine1.name)}”</button>` : ''}
              <label class="dlx-check"><input type="checkbox" id="cx-def"> Usar como padrão nos cortes novos</label>
            </div>`;
        } else
          body = `<p class="dlx-sub" style="margin-top:0">Traduz o texto da legenda deste corte. Usa um modelo de linguagem (precisa de GROQ_API_KEY no servidor) e a tradução vale para o arquivo final.</p><label class="dlx-lab">Traduzir para<select id="tr-lang"><option value="">Original</option>${EP.LANGS.map((l) => `<option ${st.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="ap-btn pri" id="tr-go" style="width:100%;justify-content:center;margin-top:12px">Traduzir legenda</button><p class="dlx-sub" id="tr-msg">${st.lang ? `Legenda traduzida para ${esc(st.lang)}.` : ''}</p>`;
        return `<div class="dlx-tabs three" role="tablist">${tabs.map((t) => `<button role="tab" data-tab="${t[0]}" aria-selected="${st.tab === t[0]}">${t[1]}</button>`).join('')}</div>${body}`;
      },
      midia: () => {
        const imgs = st.overlays.filter((o) => o.type === 'image'),
          sel = ovById(st.sel);
        return `<h3>Mídia</h3><p class="dlx-sub" style="margin-top:0">Adicione imagens sobre o corte. Arraste para posicionar, redimensione e defina quando aparecem.</p><h4>Sua biblioteca</h4><p class="dlx-sub" style="margin:0 0 10px">PNG, JPEG ou WebP, até 8 MB. Só imagem parada.</p>
          <div class="dlx-lib">${(st.lib || []).map((l) => `<div class="li"><button data-add="${l.id}" title="${esc(l.name)}"><img src="/api/library/${l.id}/file" alt="${esc(l.name)}"></button><button class="x" data-lib-del="${l.id}" aria-label="Excluir da biblioteca">✕</button></div>`).join('') || (st.lib === null ? '<p class="dlx-sub">Carregando…</p>' : '<p class="dlx-sub" style="grid-column:1/-1">Biblioteca vazia.</p>')}</div>
          <button class="ap-btn pri" id="lib-up" style="width:100%;justify-content:center;margin:12px 0">Adicionar imagem</button><input type="file" id="lib-file" hidden accept="image/png,image/jpeg,image/webp">
          ${imgs.length ? `<h4>No quadro (${imgs.length})</h4>` : ''}${sel && sel.type === 'image' ? propsEditor(sel) : imgs.length ? '<p class="dlx-sub">Clique numa imagem no quadro para editar.</p>' : ''}`;
      },
      texto: () => {
        const ts = st.overlays.filter((o) => o.type === 'text'),
          sel = ovById(st.sel);
        return `<h3>Texto</h3><p class="dlx-sub" style="margin-top:0">Adicione texto sobre o corte. Arraste para posicionar, redimensione e defina quando aparece.</p><button class="ap-btn pri" id="txt-add" style="width:100%;justify-content:center">Adicionar texto</button>
          ${ts.length ? `<div class="dlx-layers" style="margin-top:12px">${ts.map((o) => `<button class="lr ${st.sel === o.id ? 'on' : ''}" data-sel="${o.id}">T <span>${esc(o.text.slice(0, 28))}</span></button>`).join('')}</div>` : '<p class="dlx-sub" style="margin-top:12px">Nenhum texto ainda. Adicione um para mostrar no corte.</p>'}${sel && sel.type === 'text' ? propsEditor(sel) : ''}`;
      },
      ganchos:
        () => `<h3>Ganchos</h3><p class="dlx-sub" style="margin-top:0">Adicione um gancho de texto no começo do corte para aumentar a retenção.</p><h4>Ganchos de texto</h4><div class="dlx-hooks">${EP.HOOKS.map((h, i) => `<button data-hook="${i}" style="background:${EP.COLORS[i % EP.COLORS.length]};color:${EP.COLORS[i % EP.COLORS.length] === '#f0b93a' ? '#111' : '#fff'}">${esc(h)}</button>`).join('')}</div>
        <h4>Formato</h4><div class="dlx-chips"><button data-hf="box" aria-pressed="${st.hookFmt !== 'plain'}">Com tarja</button><button data-hf="plain" aria-pressed="${st.hookFmt === 'plain'}">Só texto</button></div>`,
      camadas: () => {
        const list = st.overlays.slice().reverse();
        return `<h3>Camadas</h3><p class="dlx-sub" style="margin-top:0">O topo da lista fica na frente. Arraste para mudar a ordem.</p>${list.length ? `<div class="dlx-layers" id="lay">${list.map((o) => `<div class="lr ${st.sel === o.id ? 'on' : ''}" draggable="true" data-lid="${o.id}"><button data-sel="${o.id}" class="nm">${o.type === 'image' ? '🖼' : 'T'} <span>${esc(o.type === 'image' ? ((st.lib || []).find((l) => l.id === o.imgId) || { name: 'Imagem' }).name : o.text.slice(0, 26))}</span></button><button data-eye="${o.id}" aria-label="${o.hidden ? 'Mostrar' : 'Ocultar'}">${o.hidden ? '🙈' : '👁'}</button><button data-rm="${o.id}" aria-label="Excluir">✕</button></div>`).join('')}</div>` : '<p class="dlx-sub">Nada no quadro ainda. Adicione um texto, uma imagem ou um gancho.</p>'}`;
      },
    };
    function drawDrawer() {
      const dr = $('#dx-drawer', root),
        keep = dr.scrollTop;
      $('#dx-body', root).classList.toggle('open', !!st.panel);
      $$('.dlx-rail button', root).forEach((b) => b.classList.toggle('on', b.dataset.p === st.panel));
      if (!st.panel) {
        dr.hidden = true;
        return;
      }
      dr.hidden = false;
      dr.innerHTML = `<div class="dlx-dr">${panelsHTML[st.panel]()}</div>`;
      dr.scrollTop = keep;
      bindDrawer(dr);
      if (st.panel === 'midia' && st.lib === null) loadLib();
      if (st.panel === 'templates' && st.templates === null)
        api('/templates')
          .then((l) => {
            st.templates = l;
            if (st.panel === 'templates') drawDrawer();
          })
          .catch(() => {
            st.templates = [];
          });
    }
    const loadLib = () =>
      api('/library')
        .then((l) => {
          st.lib = l;
          if (['midia', 'camadas'].includes(st.panel)) drawDrawer();
        })
        .catch(() => {
          st.lib = [];
        });
    function applyTemplate(t) {
      st.cap = { on: true, style: t.style, size: st.cap.size, pos: st.cap.pos, margin: st.cap.margin, words: null };
      st.styleChosen = true;
      st.overlays = st.overlays.filter((o) => !o.tpl);
      if (t.text)
        st.overlays.push({
          id: rid(),
          tpl: true,
          type: 'text',
          text: t.text,
          x: 0.5,
          y: st.format === '16:9' ? 0.12 : 0.1,
          size: 0.05,
          color: t.fg || '#ffffff',
          font: 'Montserrat ExtraBold',
          bold: false,
          italic: false,
          upper: true,
          box: { color: t.bg, alpha: 0 },
          outline: null,
          start: null,
          end: null,
          hidden: false,
        });
      shared.wordsDirty = true;
      commit();
      renderOverlays();
      paintCap();
      drawDrawer();
      refreshBar();
    }
    function bindDrawer(dr) {
      const on = (id, ev, fn) => {
        const e = $('#' + id, dr);
        if (e) e.addEventListener(ev, fn);
      };
      const onAll = (sel, ev, fn) => $$(sel, dr).forEach((e) => e.addEventListener(ev, () => fn(e)));
      if (st.panel === 'transcricao') {
        on('tr-big', 'click', () => {
          st.trLarge = !st.trLarge;
          drawDrawer();
        });
        on('tr-title', 'input', (e) => {
          st.title = e.target.value;
        });
        on('tr-title', 'change', commit);
        const setIv = (a, b) => {
          a = clamp(a, 0, dur);
          b = clamp(b, 0, dur);
          if (b - a < 1) {
            if (a === st.start) b = a + 1;
            else a = b - 1;
          }
          st.start = Math.max(0, a);
          st.end = Math.min(dur, b);
          shared.wordsDirty = true;
          goStart();
          tickUI();
          paintCap();
          refreshBar();
        };
        $$('[data-hms]', dr).forEach((i) =>
          i.addEventListener('change', () => {
            const g = (k) =>
              ['0', '1', '2']
                .map((n, x) => +$(`[data-hms="${k}${n}"]`, dr).value * [3600, 60, 1][x])
                .reduce((s, x) => s + x, 0);
            setIv(g('s'), g('e'));
            commit();
            drawDrawer();
          }),
        );
        on('tr-rm', 'click', () => {
          st.trMode = st.trMode === 'remove' ? 'cut' : 'remove';
          drawDrawer();
        });
        on('tr-ed', 'click', () => {
          st.trMode = st.trMode === 'edit' ? 'cut' : 'edit';
          drawDrawer();
        });
        on('tr-seg', 'click', () => render(false, { raw: true }));
        onAll('.w', 'click', (w) => {
          const ws = +w.dataset.ws,
            we = +w.dataset.we,
            seg = +w.dataset.seg;
          if (st.trMode === 'remove') {
            const i = st.removed.findIndex(([a, b]) => Math.abs(a - ws) < 0.02 && Math.abs(b - we) < 0.02);
            if (i >= 0) st.removed.splice(i, 1);
            else st.removed.push([ws, we]);
            shared.wordsDirty = true;
            commit();
            paintCap();
            drawDrawer();
          } else if (st.trMode === 'edit') {
            const sg = segs.find((s) => s.id === seg);
            if (!sg) return;
            const cur = st.edits[seg] !== undefined ? st.edits[seg] : sg.text;
            const m = document.createElement('div');
            m.className = 'modal-bg';
            m.style.zIndex = 130;
            m.innerHTML = `<div class="modal"><h3>Editar texto da fala</h3><p>${tm(sg.t)} · ${esc(sg.who)}. Vale para a legenda deste corte.</p><textarea id="ed-t" rows="4" style="width:100%">${esc(cur)}</textarea><div class="ft"><button class="ap-btn" data-x>Cancelar</button><button class="ap-btn" data-orig>Restaurar original</button><button class="ap-btn pri" data-ok>Salvar</button></div></div>`;
            document.body.appendChild(m);
            m.onclick = (e) => {
              if (e.target === m || e.target.dataset.x !== undefined) m.remove();
            };
            $('[data-ok]', m).onclick = () => {
              const t = $('#ed-t', m).value.trim();
              if (t) st.edits[seg] = t;
              shared.wordsDirty = true;
              commit();
              m.remove();
              paintCap();
              drawDrawer();
            };
            $('[data-orig]', m).onclick = () => {
              delete st.edits[seg];
              shared.wordsDirty = true;
              commit();
              m.remove();
              paintCap();
              drawDrawer();
            };
          } else {
            const mid = (st.start + st.end) / 2;
            if (ws < mid) setIv(ws, st.end);
            else setIv(st.start, we);
            commit();
            drawDrawer();
          }
        });
      }
      if (st.panel === 'templates') {
        onAll('[data-tpl-del]', 'click', async (b) => {
          const ev = window.event;
          if (ev) ev.stopPropagation();
          const t = (st.templates || []).find((x) => x.id === b.dataset.tplDel);
          if (!t || !window.confirm(`Excluir o template “${t.name}”?`)) return;
          try {
            await api('/templates/' + t.id, { method: 'DELETE' });
            st.templates = st.templates.filter((x) => x.id !== t.id);
            toast('Template excluído.');
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        });
        onAll('.dlx-card', 'click', (c) => {
          const id = c.dataset.tpl;
          const t = EP.TEMPLATES.find((x) => x.id === id) || (st.templates || []).find((x) => x.id === id);
          if (!t) return;
          if (t.config) {
            st.cap = { ...st.cap, ...t.config, on: true };
            st.styleChosen = true;
            if (t.config.overlays) st.overlays = t.config.overlays.map((o) => ({ ...o, id: rid() }));
            shared.wordsDirty = true;
            commit();
            renderOverlays();
            paintCap();
            drawDrawer();
            toast(`Template “${t.name}” aplicado.`);
          } else {
            applyTemplate(t);
            toast(`Template “${t.name}” aplicado.`);
          }
        });
        on('tp-save', 'click', () => {
          const name = prompt('Nome do template');
          if (!name || !name.trim()) return;
          api('/templates', {
            json: { name: name.trim(), config: { ...st.cap, overlays: st.overlays.filter((o) => !o.hidden) } },
          })
            .then((t) => {
              (st.templates = st.templates || []).push(t);
              toast('Template salvo.');
              drawDrawer();
            })
            .catch((e) => toast(e.message));
        });
      }
      if (st.panel === 'legendas') {
        const redraw = () => {
          shared.wordsDirty = true;
          commit();
          refreshBar();
          paintCap();
          drawDrawer();
        };
        // muda uma propriedade do estilo deste corte; `live` só repinta (enquanto arrasta), sem guardar no histórico
        const setP = (k, v, live) => {
          st.cap[k] = v;
          if (!st.cap.on) st.cap.on = true;
          shared.wordsDirty = true;
          paintCap();
          if (!live) {
            commit();
            refreshBar();
          }
        };
        const keep = () => ({ size: st.cap.size, pos: st.cap.pos, margin: st.cap.margin });
        onAll('[data-tab]', 'click', (b) => {
          st.tab = b.dataset.tab;
          drawDrawer();
        });
        /* ----- Estilos ----- */
        onAll('[data-style]', 'click', (c) => {
          const id = c.dataset.style;
          if (id === '') st.cap.on = false;
          else st.cap = { on: true, style: id, ...keep(), words: null }; // estilo pronto: começa sem as mudanças anteriores
          st.styleChosen = true;
          redraw();
        });
        const myList = () => (st.myStyles && st.myStyles.styles) || [];
        onAll('[data-mine]', 'click', (c) => {
          const it = myList().find((x) => x.id === c.dataset.mine);
          if (!it) return;
          st.cap = CSx.fromSaved(it, true);
          st.styleChosen = true;
          redraw();
        });
        onAll('[data-mine-del]', 'click', async (b) => {
          const ev = window.event;
          if (ev) ev.stopPropagation();
          const it = myList().find((x) => x.id === b.dataset.mineDel);
          if (!it || !window.confirm(`Excluir o estilo “${it.name}”? Os cortes que já usam continuam como estão.`))
            return;
          try {
            const r = await api('/caption-styles/' + it.id, { method: 'DELETE' });
            st.myStyles = { styles: myList().filter((x) => x.id !== it.id), defaultId: r.defaultId };
            if (st.cap.mine === it.id) delete st.cap.mine;
            toast('Estilo excluído.');
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        });
        onAll('[data-mine-def]', 'click', async (b) => {
          const ev = window.event;
          if (ev) ev.stopPropagation();
          const id = b.dataset.mineDef,
            on = st.myStyles.defaultId !== id;
          try {
            const r = await api('/caption-styles/' + id, { method: 'PATCH', json: { default: on } });
            st.myStyles.defaultId = r.defaultId;
            toast(
              on ? 'Os cortes novos vão começar com este estilo.' : 'Os cortes novos voltam a começar com a Clássica.',
            );
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        });
        /* ----- Personalizar ----- */
        on('cx-on', 'click', () => {
          st.cap.on = true;
          redraw();
        });
        on('cx-reset', 'click', () => {
          const mine1 = st.cap.mine && myList().find((x) => x.id === st.cap.mine);
          st.cap = mine1
            ? CSx.fromSaved(mine1, st.cap.on)
            : { on: st.cap.on, style: st.cap.style, ...keep(), words: null };
          redraw();
        });
        on('cx-font', 'change', (e) => {
          setP('font', e.target.value);
          drawDrawer();
        });
        const rng = (id, fn, fmt = (v) => v) => {
          const r = $('#' + id, dr);
          if (!r) return;
          r.oninput = () => {
            fn(+r.value, true);
            const o = $('#' + id + '-v', dr);
            if (o) o.textContent = fmt(+r.value);
          };
          r.onchange = () => fn(+r.value, false);
        };
        rng('cx-size', (v, live) => {
          st.cap.size = v;
          paintCap();
          if (!live) commit();
        });
        rng('cx-words', (v, live) => {
          st.cap.words = v;
          delete st.cap.chunk;
          setP('words', v, live);
        });
        rng('cx-ow', (v, live) => setP('ow', v, live));
        rng('cx-sh', (v, live) => setP('shadow', v, live));
        rng(
          'cx-ba',
          (v, live) => setP('box', { color: eff().box.color, alpha: v / 100 }, live),
          (v) => v + '%',
        );
        rng(
          'cx-mg',
          (v, live) => {
            st.cap.margin = v;
            paintCap();
            if (!live) {
              commit();
              drawDrawer();
            }
          },
          (v) => v + '%',
        );
        on('cx-mg-auto', 'click', () => {
          st.cap.margin = null;
          redraw();
        });
        for (const k of ['upper', 'italic', 'glow', 'pop'])
          on('cx-' + k, 'click', () => {
            setP(k, !eff()[k]);
            drawDrawer();
          });
        on('cx-box', 'click', () => {
          setP('box', eff().box ? false : { color: '#000000', alpha: 0.35 });
          drawDrawer();
        });
        onAll('[data-mode]', 'click', (b) => {
          setP('mode', b.dataset.mode);
          drawDrawer();
        });
        const setColor = (key, c, live) =>
          key === 'box'
            ? setP('box', { color: c, alpha: eff().box ? eff().box.alpha : 0.35 }, live)
            : setP(key, c, live);
        onAll('[data-cset]', 'click', (b) => {
          setColor(b.dataset.cset, b.dataset.c);
          drawDrawer();
        });
        $$('[data-color]', dr).forEach((i) => {
          i.oninput = () => setColor(i.dataset.color, i.value, true);
          i.onchange = () => {
            setColor(i.dataset.color, i.value);
            drawDrawer();
          };
        });
        onAll('[data-pos]', 'click', (b) => {
          st.cap.pos = b.dataset.pos;
          redraw();
        });
        // o que vai para um estilo salvo: o estilo base, só o que mudou, e tamanho/posição
        const payload = () => ({
          base: st.cap.style,
          props: CSx.diff(eff(), st.cap.style),
          ...keep(),
          default: !!($('#cx-def', dr) || {}).checked,
        });
        on('cx-save', 'click', async () => {
          const name = (window.prompt('Nome do estilo (ex.: Pregação domingo):') || '').trim();
          if (!name) return;
          try {
            const r = await api('/caption-styles', { json: { name, ...payload() } });
            st.myStyles = { styles: [...myList(), r.style], defaultId: r.defaultId };
            st.cap.mine = r.style.id;
            commit();
            toast(
              `Estilo “${name}” salvo.${r.defaultId === r.style.id ? ' Os cortes novos vão começar com ele.' : ''}`,
            );
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        });
        on('cx-upd', 'click', async () => {
          const it = myList().find((x) => x.id === st.cap.mine);
          if (!it) return;
          const p = payload();
          try {
            const r = await api('/caption-styles/' + it.id, {
              method: 'PATCH',
              json: { ...p, default: p.default || undefined },
            });
            Object.assign(it, r.style);
            st.myStyles.defaultId = r.defaultId;
            toast(`Estilo “${it.name}” atualizado.`);
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        });
        /* ----- Tradução ----- */
        on('tr-lang', 'change', (e) => {
          if (!e.target.value) {
            st.lang = null;
            st.edits = {};
            shared.wordsDirty = true;
            commit();
            paintCap();
            drawDrawer();
          }
        });
        on('tr-go', 'click', async () => {
          const lang = $('#tr-lang', dr).value;
          if (!lang) return toast('Escolha o idioma.');
          const msg = $('#tr-msg', dr),
            btn = $('#tr-go', dr);
          btn.disabled = true;
          msg.textContent = 'Traduzindo…';
          try {
            const r = await api('/translate', {
              json: {
                lang,
                texts: segs.filter((s) => s.end > st.start && s.t < st.end).map((s) => ({ id: s.id, text: s.text })),
              },
            });
            st.edits = { ...st.edits, ...r.translations };
            st.lang = lang;
            shared.wordsDirty = true;
            commit();
            paintCap();
            msg.textContent = `Legenda traduzida para ${lang}.`;
          } catch (e) {
            msg.textContent = e.message;
          }
          btn.disabled = false;
        });
        if (st.tab === 'estilos') {
          // as amostras dos cartões visíveis ficam animadas, mostrando como a palavra falada aparece
          clearInterval(st.animT);
          st.animT = setInterval(() => {
            st.tick++;
            const box = $('#dx-drawer', root);
            if (!box || st.panel !== 'legendas' || st.tab !== 'estilos') return clearInterval(st.animT);
            const br = box.getBoundingClientRect();
            $$('.sty-grid [data-style], .sty-grid [data-mine]', box).forEach((c) => {
              const r = c.getBoundingClientRect();
              if (r.bottom < br.top || r.top > br.bottom) return;
              const it = c.dataset.mine && myList().find((x) => x.id === c.dataset.mine);
              const S = it ? CSx.resolve(CSx.fromSaved(it)) : CSx.byName(c.dataset.style);
              $('.pv', c).innerHTML = sampleCard(S, st.tick);
            });
          }, 750);
        }
      }
      if (st.panel === 'midia') {
        on('lib-up', 'click', () => $('#lib-file', dr).click());
        on('lib-file', 'change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          if (f.size > 8 * 1048576) return toast('Máximo de 8 MB.');
          const x = new XMLHttpRequest();
          x.open('POST', '/api/library?name=' + encodeURIComponent(f.name));
          x.setRequestHeader('x-invb', '1');
          x.onload = () => {
            if (x.status === 201) {
              st.lib = null;
              loadLib();
              toast('Imagem adicionada à biblioteca.');
            } else {
              let m = 'Falha ao enviar a imagem.';
              try {
                m = JSON.parse(x.responseText).error;
              } catch {
                /* */
              }
              toast(m);
            }
          };
          x.send(f);
        });
        onAll('[data-add]', 'click', (b) => addOverlay({ type: 'image', imgId: b.dataset.add, w: 0.3, op: 1 }));
        onAll('[data-lib-del]', 'click', (b) => {
          api('/library/' + b.dataset.libDel, { method: 'DELETE' })
            .then(() => {
              st.overlays = st.overlays.filter((o) => o.imgId !== b.dataset.libDel);
              st.lib = null;
              commit();
              renderOverlays();
              loadLib();
            })
            .catch((e) => toast(e.message));
        });
        bindProps(dr);
      }
      if (st.panel === 'texto') {
        on('txt-add', 'click', () =>
          addOverlay({
            type: 'text',
            text: 'Seu texto',
            size: 0.06,
            color: '#ffffff',
            font: CSx.DEFAULT_FONT,
            bold: false,
            italic: false,
            upper: false,
            box: null,
            outline: { color: '#000000', w: 3 },
          }),
        );
        onAll('[data-sel]', 'click', (b) => {
          st.sel = b.dataset.sel;
          renderOverlays();
          drawDrawer();
        });
        bindProps(dr);
      }
      if (st.panel === 'ganchos') {
        onAll('[data-hf]', 'click', (b) => {
          st.hookFmt = b.dataset.hf;
          drawDrawer();
        });
        onAll('[data-hook]', 'click', (b) => {
          const i = +b.dataset.hook,
            plain = st.hookFmt === 'plain';
          const bg = EP.COLORS[i % EP.COLORS.length];
          addOverlay({
            type: 'text',
            text: EP.HOOKS[i],
            size: 0.065,
            color: !plain && bg === '#f0b93a' ? '#111111' : '#ffffff', // texto escuro na tarja dourada
            font: 'Montserrat ExtraBold',
            bold: false,
            italic: false,
            upper: false,
            y: st.overlays.some((o) => o.tpl && !o.hidden) ? 0.24 : 0.16, // abaixo da faixa do template, se houver
            box: plain ? null : { color: bg, alpha: 0 },
            outline: plain ? { color: '#000000', w: 4 } : null,
            start: 0,
            end: Math.min(3, D()),
          });
          toast('Gancho adicionado nos 3 primeiros segundos.');
        });
      }
      if (st.panel === 'camadas') {
        if (st.lib === null) loadLib();
        onAll('[data-sel]', 'click', (b) => {
          st.sel = b.dataset.sel;
          renderOverlays();
          drawDrawer();
        });
        onAll('[data-eye]', 'click', (b) => {
          const o = ovById(b.dataset.eye);
          o.hidden = !o.hidden;
          commit();
          renderOverlays();
          drawDrawer();
        });
        onAll('[data-rm]', 'click', (b) => delOverlay(b.dataset.rm));
        let from = null;
        $$('.lr[draggable]', dr).forEach((r) => {
          r.addEventListener('dragstart', () => {
            from = r.dataset.lid;
          });
          r.addEventListener('dragover', (e) => e.preventDefault());
          r.addEventListener('drop', (e) => {
            e.preventDefault();
            const to = r.dataset.lid;
            if (!from || from === to) return;
            const a = st.overlays.findIndex((o) => o.id === from),
              b = st.overlays.findIndex((o) => o.id === to);
            const [it] = st.overlays.splice(a, 1);
            st.overlays.splice(b, 0, it);
            commit();
            renderOverlays();
            drawDrawer();
          });
        });
      }
    }
  };
})();
