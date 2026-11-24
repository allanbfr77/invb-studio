/* INVB Studio — editor do corte: o painel da esquerda (formato, imagem, velocidade, sincronia, remover trecho) e as gavetas da direita (transcrição, templates, legendas, mídia, texto).
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, FORMATS, FORMAT_ICON, $$, CSx, clamp, SAMPLE, capHTML, FAV, EP, rid } = window.ClipEditorParts.base;

  window.ClipEditorParts.panels = function (shared) {
    const {
      st, outD, D, tm, root, isAud, esc, fmtObj, outSize, syLabel, ctx, asy, upload, commit,
      layoutStage, v, toast, removedIn, paintCap, tickUI, refreshBar, runSyTest, runAutoSync, ovById,
      renderOverlays, delOverlay, clip, dur, segs, approx, gone, eff, api, goStart, addOverlay,
    } = shared;
    // definidas em outra parte, mais adiante: chamadas por "shared" na hora do uso
    const render = (...a) => shared.render(...a);
    Object.assign(shared, { drawLeft, drawDrawer });

    /* ----- painel esquerdo (sempre visível) ----- */
    // Momento com décimos (0:12,5), para digitar e conferir o ponto exato de um trecho.
    const tmx = (s) => { s = Math.max(0, Math.round((s || 0) * 10) / 10); const m = Math.floor(s / 60), x = s - m * 60; return m + ':' + (x < 10 ? '0' : '') + x.toFixed(1).replace('.', ','); };
    const parseTx = (t) => { t = String(t || '').trim().replace(/,/g, '.'); if (!t || !/^(\d+:){0,2}\d+(\.\d+)?$/.test(t)) return NaN; return t.split(':').reduce((a, n) => a * 60 + +n, 0); };
    const cutList = () => st.removed.filter((r) => r[2]).sort((p, q) => p[0] - q[0]);
    const durTxt = () => (Math.abs(outD() - D()) < 0.05 ? `Duração do corte: ${tm(D())}` : `Duração do corte: ${tm(outD())} (era ${tm(D())})`);
    const spLabel = (x) => String(+(+x).toFixed(2)).replace('.', ',') + 'x';
    const sw = (id, on) => `<button class="dlx-sw" role="switch" aria-checked="${on}" id="${id}"></button>`;
    function drawLeft() {
      const L = $('#dx-left', root);
      // Painel em seções que abrem e fecham. Fechada, cada seção mostra o valor atual à direita do título.
      const sec = (key, title, value, body, valueId) => `<details class="dlx-sec" data-sec="${key}"${st.open[key] ? ' open' : ''}><summary><span class="dlx-sect">${title}</span><${valueId ? 'output' : 'span'} class="dlx-secv"${valueId ? ` id="${valueId}"` : ''}>${value}</${valueId ? 'output' : 'span'}></summary><div class="dlx-secb">${body}</div></details>`;
      const nCuts = cutList().length;
      L.innerHTML = [
        isAud ? '' : sec('fmt', 'Formato', esc(fmtObj()[1]), `<div class="dlx-fmts">${FORMATS.map((f) => `<button class="dlx-fmt" data-f="${f[0]}" aria-pressed="${st.format === f[0]}"><i style="width:${FORMAT_ICON[f[0]][0]}px;height:${FORMAT_ICON[f[0]][1]}px"></i>${f[1]}</button>`).join('')}</div>
          <p class="dlx-sub">${st.format === 'orig' ? 'Mantém o formato do vídeo' : 'Recorte central do vídeo'} · Saída ${outSize()}</p>`),
        isAud ? '' : sec('img', 'Imagem', [st.bw ? 'Preto e branco' : 'Colorido', st.hq ? 'alta qualidade' : ''].filter(Boolean).join(' · '), `
          <div class="dlx-row"><div><b>Preto e branco</b><small>Deixa o vídeo em tons de cinza.</small></div>${sw('dx-bw', st.bw)}</div>
          <div class="dlx-row"><div><b>Preservar qualidade</b><small>Arquivo maior e exportação mais lenta. Bom para levar ao CapCut.</small></div>${sw('dx-hq', st.hq)}</div>`),
        sec('sp', 'Velocidade', spLabel(st.speed), `<small id="dx-spd" class="dlx-spd">${durTxt()}</small>
          <input type="range" id="dx-sp" class="dlx-sp" min="0.25" max="2" step="0.05" value="${st.speed}" aria-label="Velocidade">
          <div class="dlx-spb">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => `<button data-sp="${x}" aria-pressed="${st.speed === x}">${spLabel(x)}</button>`).join('')}</div>
          <p class="dlx-hint">O tom da voz não muda. A prévia acompanha.</p>`, 'dx-spv'),
        isAud ? '' : sec('sy', 'Sincronia do áudio', syLabel(st.sync), `<input type="range" id="dx-sy" class="dlx-sp" min="-2" max="2" step="0.01" value="${st.sync}" aria-label="Sincronia do áudio">
          <div class="dlx-spb">${[[-0.1, '−100'], [-0.01, '−10'], [0, 'Zerar'], [0.01, '+10'], [0.1, '+100']].map((x) => `<button style="min-width:36px" title="${x[0] ? x[1] + ' milissegundos' : 'Voltar ao áudio original'}" data-sy="${x[0]}">${x[1]}</button>`).join('')}</div>
          <button class="dlx-sytgo" id="dx-syt">▶ Testar o ajuste (8 s)</button>
          ${ctx.autosync ? `<button class="dlx-sytgo" id="dx-asy"${asy.busy ? ' disabled' : ''}>${asy.busy ? 'Medindo boca e som… (1 a 2 min)' : '✨ Detectar automaticamente'}</button>${asy.msg ? `<p class="dlx-hint dlx-asr ${asy.kind}" id="dx-asr" role="status">${esc(asy.msg)}</p>` : ''}` : '<p class="dlx-hint">Para detectar o atraso sozinho, rode uma vez o arquivo <code>install/instalar-autosync</code> e abra o app de novo.</p>'}
          <p class="dlx-hint">Som depois da boca: vá para a esquerda. Som antes: para a direita. A prévia ao lado não muda; use Testar.${upload.audioShift ? ` A pregação já tem ajuste de ${syLabel(upload.audioShift)} (botão Sincronia, em Cortes); este controle soma a ele.` : ''}</p>`, 'dx-syv'),
        sec('cut', 'Remover trecho', nCuts ? nCuts + (nCuts === 1 ? ' removido' : ' removidos') : 'Nenhum', `
          <p class="dlx-hint">Pare o vídeo no começo do trecho e marque. Depois pare no fim e marque de novo.</p>
          <div class="dlx-spb" style="margin-bottom:12px"><button id="dx-ca" aria-pressed="${st.cutA !== null}">${st.cutA === null ? 'Marcar início' : 'Início: ' + tmx(st.cutA - st.start)}</button><button id="dx-cb" ${st.cutA === null ? 'disabled' : ''}>Marcar fim</button></div>
          <p class="dlx-hint">Ou digite o momento exato, contado do começo do corte (ex.: <code>0:12,5</code>).</p>
          <div class="dlx-cutx"><label>Início<input id="dx-cxa" inputmode="decimal" autocomplete="off" placeholder="0:00,0" value="${st.cutA === null ? '' : tmx(st.cutA - st.start)}"></label><label>Fim<input id="dx-cxb" inputmode="decimal" autocomplete="off" placeholder="0:00,0"></label><button id="dx-cxg">Remover</button></div>
          ${nCuts ? `<ul class="dlx-cuts">${cutList().map((r) => `<li><span>${tmx(r[0] - st.start)} → ${tmx(r[1] - st.start)} <small>(${(r[1] - r[0]).toFixed(1).replace('.', ',')} s)</small></span><button data-cx="${r[0]}" aria-label="Desfazer a remoção deste trecho" title="Devolver este trecho ao corte">✕</button></li>`).join('')}</ul>` : ''}`),
        sec('mu', 'Remover música', !ctx.voiceAI ? 'Não instalado' : st.voice === 'ia' ? 'Ligado' : 'Desligado', `
          <div class="dlx-row"><div><b>Deixar só a voz</b><small>Tira a música de fundo com IA, no seu computador. A exportação demora mais e o efeito não aparece na prévia.</small></div><button class="dlx-sw" role="switch" aria-checked="${st.voice === 'ia'}" id="dx-mu"${ctx.voiceAI ? '' : ' disabled title="Precisa instalar a remoção de música neste computador"'}></button></div>
          ${ctx.voiceAI ? '' : '<p class="dlx-hint">Para liberar, rode uma vez o arquivo <code>install/instalar-voz-ia</code> e abra o app de novo.</p>'}`),
      ].join('');
      $$('details[data-sec]', L).forEach((d) => d.addEventListener('toggle', () => { st.open[d.dataset.sec] = d.open; }));
      $$('[data-f]', L).forEach((b) => b.onclick = () => { st.format = b.dataset.f; commit(); layoutStage(); drawLeft(); });
      const tg = (id, key) => { const e = $('#' + id, L); if (e) e.onclick = () => { st[key] = !st[key]; commit(); layoutStage(); drawLeft(); }; };
      tg('dx-bw', 'bw'); tg('dx-hq', 'hq');
      const mu = $('#dx-mu', L); if (mu && !mu.disabled) mu.onclick = () => { st.voice = st.voice === 'ia' ? 'off' : 'ia'; commit(); drawLeft(); };
      // Remover trecho: dois cliques (início e fim) na posição atual do vídeo. Os tempos são do vídeo original.
      const ca = $('#dx-ca', L), cb = $('#dx-cb', L);
      if (ca) ca.onclick = () => { st.cutA = st.cutA === null ? Math.max(st.start, Math.min(st.end, v.currentTime || st.start)) : null; drawLeft(); };
      const addCut = (a, b, how) => {
        const x = Math.max(st.start, Math.min(a, b)), y = Math.min(st.end, Math.max(a, b));
        if (y - x < 0.3) return toast('O trecho precisa ter pelo menos 0,3 segundo. ' + how);
        if (D() - removedIn(st.start, st.end) - (y - x) + removedIn(x, y) < 1) return toast('Assim não sobraria nada do corte.');
        st.removed.push([+x.toFixed(2), +y.toFixed(2), 1]); st.cutA = null; shared.wordsDirty = true; commit(); paintCap(); drawLeft(); tickUI(); toast('Trecho removido do corte.');
      };
      if (cb) cb.onclick = () => addCut(st.cutA, v.currentTime, 'Avance o vídeo até o fim do trecho e marque de novo.');
      const xa = $('#dx-cxa', L), xb = $('#dx-cxb', L), xg = $('#dx-cxg', L);
      if (xg) {
        const go = () => {
          const a = parseTx(xa.value), b = parseTx(xb.value);
          if (!(a >= 0) || !(b >= 0)) return toast('Digite o início e o fim como minutos:segundos, por exemplo 0:12,5 e 0:18.');
          if (a > D() || b > D()) return toast('O corte tem ' + tmx(D()) + '. Digite momentos dentro dele.');
          addCut(st.start + a, st.start + b, 'Confira os dois momentos digitados.');
        };
        xg.onclick = go; [xa, xb].forEach((i) => { i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); }; });
        // mostrar o trecho digitado no player, para conferir antes de remover
        xa.onchange = () => { const a = parseTx(xa.value); if (a >= 0 && a <= D()) v.currentTime = st.start + a; }; xb.onchange = () => { const b = parseTx(xb.value); if (b >= 0 && b <= D()) v.currentTime = st.start + b; };
      }
      $$('[data-cx]', L).forEach((bt) => bt.onclick = () => { const i = st.removed.findIndex((r) => r[2] && String(r[0]) === bt.dataset.cx); if (i >= 0) { st.removed.splice(i, 1); shared.wordsDirty = true; commit(); paintCap(); drawLeft(); tickUI(); } });
      // Velocidade: de 0,25x a 2x, em passos de 0,05. A prévia toca na mesma velocidade (o navegador mantém o tom da voz).
      const sp = $('#dx-sp', L), setSp = (x, redraw) => { st.speed = Math.max(0.25, Math.min(2, Math.round(x * 100) / 100)); v.playbackRate = st.speed; $('#dx-spv', L).textContent = spLabel(st.speed); $('#dx-spd', L).textContent = durTxt(); tickUI(); refreshBar(); if (redraw) { commit(); drawLeft(); } };
      const sy = $('#dx-sy', L), setSy = (x, save) => { st.sync = Math.max(-2, Math.min(2, Math.round(x * 100) / 100)); sy.value = st.sync; $('#dx-syv', L).textContent = syLabel(st.sync); if (save) commit(); };
      const syt = $('#dx-syt', L); if (syt) syt.onclick = () => runSyTest(syt);
      const asb = $('#dx-asy', L); if (asb) asb.onclick = () => runAutoSync(L);
      if (sy) { sy.oninput = () => setSy(+sy.value, false); sy.onchange = () => setSy(+sy.value, true); $$('[data-sy]', L).forEach((b) => b.onclick = () => setSy(+b.dataset.sy === 0 ? 0 : st.sync + +b.dataset.sy, true)); }
      if (sp) { sp.oninput = () => setSp(+sp.value, false); sp.onchange = () => setSp(+sp.value, true); $$('[data-sp]', L).forEach((b) => b.onclick = () => setSp(+b.dataset.sp, true)); v.playbackRate = st.speed; }
    }

    /* ----- drawer direito ----- */
    const propsEditor = (o) => {
      if (!o) return '';
      const timing = `<div class="dlx-row" style="margin-top:10px"><div><b>Todo o corte</b><small>Desligue para escolher quando aparece</small></div>${sw('pp-all', o.start === null && o.end === null)}</div>${o.start === null && o.end === null ? '' : `<div class="dlx-two"><label>Início (s)<input type="number" id="pp-s" min="0" step="0.1" value="${(o.start ?? 0).toFixed(1)}"></label><label>Fim (s)<input type="number" id="pp-e" min="0" step="0.1" value="${(o.end ?? D()).toFixed(1)}"></label></div>`}`;
      if (o.type === 'image') return `<div class="dlx-props"><h4>Imagem selecionada</h4><label>Largura <b>${Math.round(o.w * 100)}%</b></label><input type="range" id="pp-w" min="4" max="100" value="${Math.round(o.w * 100)}"><label>Opacidade <b>${Math.round(o.op * 100)}%</b></label><input type="range" id="pp-op" min="5" max="100" value="${Math.round(o.op * 100)}">${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
      return `<div class="dlx-props"><h4>Texto selecionado</h4><label>Conteúdo</label><textarea id="pp-text" rows="2" maxlength="200">${esc(o.text)}</textarea>
        <label>Fonte</label><select id="pp-font">${CSx.FONTS.map((f) => `<option ${f === o.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <label>Tamanho <b>${Math.round(o.size * 100)}</b></label><input type="range" id="pp-size" min="2" max="30" value="${Math.round(o.size * 100)}">
        <div class="dlx-two"><label>Cor<input type="color" id="pp-color" value="${o.color}"></label><label>Contorno<input type="color" id="pp-oc" value="${o.outline ? o.outline.color : '#000000'}"></label></div>
        <div class="dlx-chips" style="margin-top:8px"><button id="pp-bold" aria-pressed="${o.bold}">Negrito</button><button id="pp-ital" aria-pressed="${o.italic}">Itálico</button><button id="pp-up" aria-pressed="${o.upper}">MAIÚSCULAS</button><button id="pp-box" aria-pressed="${!!o.box}">Tarja</button></div>
        ${o.box ? `<div class="dlx-two"><label>Cor da tarja<input type="color" id="pp-bc" value="${o.box.color}"></label><label>Transparência<input type="range" id="pp-ba" min="0" max="90" value="${Math.round(o.box.alpha * 100)}"></label></div>` : ''}
        ${timing}<button class="ap-btn" id="pp-del" style="margin-top:10px">Excluir do quadro</button></div>`;
    };
    function bindProps(D2) {
      const o = ovById(st.sel); if (!o) return; const on = (id, ev, fn) => { const e = $('#' + id, D2); if (e) e.addEventListener(ev, fn); };
      const live = () => renderOverlays(), done = () => { commit(); drawDrawer(); };
      on('pp-text', 'input', (e) => { o.text = e.target.value || ' '; live(); }); on('pp-text', 'change', commit);
      on('pp-font', 'change', (e) => { o.font = e.target.value; commit(); live(); });
      on('pp-size', 'input', (e) => { o.size = +e.target.value / 100; live(); }); on('pp-size', 'change', done);
      on('pp-color', 'input', (e) => { o.color = e.target.value; live(); }); on('pp-color', 'change', commit);
      on('pp-oc', 'input', (e) => { o.outline = { color: e.target.value, w: 2 }; live(); }); on('pp-oc', 'change', commit);
      on('pp-bold', 'click', () => { o.bold = !o.bold; done(); live(); }); on('pp-ital', 'click', () => { o.italic = !o.italic; done(); live(); }); on('pp-up', 'click', () => { o.upper = !o.upper; done(); live(); });
      on('pp-box', 'click', () => { o.box = o.box ? null : { color: '#e11d48', alpha: 0 }; done(); live(); });
      on('pp-bc', 'input', (e) => { o.box.color = e.target.value; live(); }); on('pp-bc', 'change', commit);
      on('pp-ba', 'input', (e) => { o.box.alpha = +e.target.value / 100; live(); }); on('pp-ba', 'change', commit);
      on('pp-w', 'input', (e) => { o.w = +e.target.value / 100; live(); }); on('pp-w', 'change', done);
      on('pp-op', 'input', (e) => { o.op = +e.target.value / 100; live(); }); on('pp-op', 'change', done);
      on('pp-all', 'click', () => { if (o.start === null && o.end === null) { o.start = 0; o.end = Math.min(3, D()); } else { o.start = null; o.end = null; } done(); live(); });
      on('pp-s', 'change', (e) => { o.start = clamp(+e.target.value, 0, D()); if (o.end !== null && o.end <= o.start) o.end = Math.min(D(), o.start + 1); done(); live(); });
      on('pp-e', 'change', (e) => { o.end = clamp(+e.target.value, 0.1, D()); if (o.start !== null && o.start >= o.end) o.start = Math.max(0, o.end - 1); done(); live(); });
      on('pp-del', 'click', () => delOverlay(o.id));
    }
    const sampleCard = (S, tick) => {
      const E = { upper: S.upper, ow: S.ow, shadow: S.shadow, font: S.font, pop: S.pop };
      const chunks = CSx.chunkWords(SAMPLE, S), ci = S.mode === 'block' ? 0 : chunks.findIndex((c) => c.some((w) => w.t === 'precisa')), ch = chunks[Math.max(0, ci)];
      const act = S.mode === 'block' ? -1 : (tick % ch.length), ws = S.mode === 'block' ? [{ t: 'Você não precisa de mais tempo,' }] : ch;
      return `<span style="font-size:${14 * Math.min(S.size, 1.3)}px;line-height:1.15;text-align:center;display:block">${capHTML(S, E, 0.012, ws, act, S.mode === 'karaoke' ? ((tick % 5) + 1) * 20 : 55)}</span>`;
    };
    const tplHTML = (t) => `<span class="tp-bar" style="background:${t.bg}">${esc(t.text || t.name)}</span>`;
    const catChips = (cats, cur, total, attr) => `<div class="dlx-cats"><button class="dlx-cat" ${attr}="Todos" aria-checked="${cur === 'Todos'}">Todos <b>${total}</b></button>${cats.map((c) => `<button class="dlx-cat" ${attr}="${esc(c.id)}" aria-checked="${cur === c.id}">${esc(c.id)} <b>${c.count}</b></button>`).join('')}</div>`;
    let drawerScroll = 0;
    const panelsHTML = {
      transcricao: () => {
        const ex = `<div class="dlx-two"><label>Início<span class="hms"><input type="number" min="0" data-hms="s0" value="${Math.floor(st.start / 3600)}">:<input type="number" min="0" max="59" data-hms="s1" value="${Math.floor((st.start % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="s2" value="${Math.floor(st.start % 60)}"></span></label><label>Fim<span class="hms"><input type="number" min="0" data-hms="e0" value="${Math.floor(st.end / 3600)}">:<input type="number" min="0" max="59" data-hms="e1" value="${Math.floor((st.end % 3600) / 60)}">:<input type="number" min="0" max="59" data-hms="e2" value="${Math.floor(st.end % 60)}"></span></label></div>`;
        const lo = Math.max(0, clip.start - 60), hi = Math.min(dur, clip.end + 60);
        const ctxSegs = segs.filter((s) => s.end > st.start - 30 && s.t < st.end + 30);
        const body = ctxSegs.map((s) => { const ws = shared.words.filter((w) => w.seg === s.id); const ed = st.edits[s.id] !== undefined; return `<div class="dlx-tseg"><div class="th"><b>${esc(s.who)}</b><span>${tm(s.t)}</span>${ed ? '<em>editado</em>' : ''}</div><p>${(ed ? approx(s, st.edits[s.id]) : (ws.length ? ws : approx(s, s.text))).map((w) => { const inn = w.e > st.start && w.s < st.end; return `<span class="w ${inn ? '' : 'out'} ${gone(w) ? 'rm' : ''}" data-ws="${w.s}" data-we="${w.e}" data-seg="${s.id}">${esc(w.t)}</span>`; }).join(' ')}</p></div>`; }).join('');
        return `<h3>Corte</h3><button class="dlx-link" id="tr-big">${st.trLarge ? 'Reduzir transcrição' : 'Ampliar transcrição'}</button>
          <label class="dlx-lab">Título do corte<input id="tr-title" placeholder="Título (opcional)" value="${esc(st.title)}" maxlength="120"></label>
          <label class="dlx-lab">Intervalo do corte <small>Duração: ${Math.round(D())}s</small></label>${ex}
          <div class="dlx-two"><input type="range" id="tr-rs" min="${lo.toFixed(1)}" max="${hi.toFixed(1)}" step="0.1" value="${st.start}" aria-label="Início"><input type="range" id="tr-re" min="${lo.toFixed(1)}" max="${hi.toFixed(1)}" step="0.1" value="${st.end}" aria-label="Fim"></div>
          <label class="dlx-lab">Idioma da transcrição<span class="dlx-ro">${esc(upload.language || 'Idioma detectado')}</span></label>
          <p class="dlx-sub" style="margin:6px 0 10px">Clique numa palavra pra ajustar onde o corte começa ou termina ou use o slider.</p>
          <div class="dlx-row"><div><b>Remover palavras</b><small>Clique nas palavras para cortá-las do vídeo</small></div>${sw('tr-rm', st.trMode === 'remove')}</div>
          <div class="dlx-row"><div><b>Editar texto</b><small>Clique numa fala para corrigir o texto da legenda</small></div>${sw('tr-ed', st.trMode === 'edit')}</div>
          <button class="ap-btn" id="tr-seg" style="width:100%;justify-content:center;margin-bottom:12px">Baixar segmento</button>
          <div class="dlx-tlist ${st.trLarge ? 'big' : ''}">${body || '<p class="dlx-sub">Sem texto neste trecho.</p>'}</div>`;
      },
      templates: () => {
        const mine = (st.templates || []).filter((t) => t.config), tf = FAV.get('invb.favTpl'), q = st.tq.trim().toLowerCase();
        const pr = EP.TEMPLATES.filter((t) => (st.tplCat === 'Todos' || t.cat === st.tplCat) && (!q || t.name.toLowerCase().includes(q)));
        const mineF = mine.filter((t) => !q || t.name.toLowerCase().includes(q));
        const card = (id, name, inner, own) => `<div class="dlx-card" data-tpl="${id}" ${own ? 'data-own="1"' : ''} role="button" tabindex="0"><button class="fav" data-fav="${id}" aria-label="${tf.has(id) ? 'Remover dos favoritos' : 'Marcar como favorito'}">${tf.has(id) ? '★' : '☆'}</button><div class="pv">${inner}</div><span>${esc(name)}</span></div>`;
        return `<p class="dlx-sub" style="margin-top:0">Aplique um visual salvo neste corte com um clique.</p><input class="dlx-search" id="tp-q" placeholder="Buscar template" value="${esc(st.tq)}">
          <h4>Meus templates</h4><div class="dlx-grid">${mineF.map((t) => card(t.id, t.name, `<span class="mini">${esc(t.config.style.split('/').pop())}</span>`, true)).join('') || '<p class="dlx-sub" style="grid-column:1/-1">Nenhum template seu ainda.</p>'}</div>
          <button class="ap-btn" id="tp-save" style="width:100%;justify-content:center;margin:10px 0 18px">Salvar o visual atual como template</button>
          <h4>Prontos</h4>${catChips(EP.TEMPLATE_CATS, st.tplCat, EP.TEMPLATES.length, 'data-tc')}
          <p class="dlx-sub">A moldura aparece nos formatos 9:16, 1:1 e 4:5. (Aqui o template aplica a legenda e uma faixa de título.)</p><div class="dlx-grid">${pr.map((t) => card(t.id, t.name, tplHTML(t))).join('') || '<p class="dlx-sub">Nenhum template encontrado.</p>'}</div>`;
      },
      legendas: () => {
        const e = eff(), tabs = [['estilos', 'Estilos'], ['fonte', 'Fonte'], ['efeitos', 'Efeitos'], ['traducao', 'Tradução']];
        let body = '';
        if (st.tab === 'estilos') {
          const fav = FAV.get('invb.favSty'), q = st.q.trim().toLowerCase();
          const list = CSx.STYLES.filter((s) => (st.cat === 'Todos' || s.cat === st.cat) && (!q || s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q)));
          body = `<div class="dlx-row" style="margin-bottom:8px"><div><b>Sempre animar os estilos</b></div>${sw('sty-anim', st.anim)}</div><input class="dlx-search" id="sty-q" placeholder="Buscar estilo, fonte ou efeito" value="${esc(st.q)}">${catChips(CSx.CATEGORIES, st.cat, CSx.STYLES.length, 'data-cat')}
            <div class="dlx-grid" id="sty-grid"><button class="dlx-card nosub" data-style="" aria-pressed="${!st.cap.on}"><div class="pv none">Sem legenda</div><span>Sem legenda</span></button>${list.map((s) => `<div class="dlx-card" role="button" tabindex="0" data-style="${esc(s.id)}" aria-pressed="${st.cap.on && st.cap.style === s.id}"><button class="fav" data-fav="${esc(s.id)}" aria-label="${fav.has(s.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}">${fav.has(s.id) ? '★' : '☆'}</button><div class="pv">${sampleCard(s, 0)}</div><span>${esc(s.name)}</span></div>`).join('')}</div>`;
        } else if (st.tab === 'fonte') body = `<p class="dlx-sub" style="margin-top:0">Fontes instaladas no servidor. “Padrão do estilo” usa a fonte do estilo escolhido.</p><div class="dlx-fonts"><button data-font="" aria-pressed="${st.cap.font === null}">Padrão do estilo</button>${CSx.FONTS.map((f) => `<button data-font="${esc(f)}" style="font-family:'${esc(f)}',sans-serif" aria-pressed="${st.cap.font === f}">${esc(f)}<small>Você não precisa de mais tempo</small></button>`).join('')}</div>`;
        else if (st.tab === 'efeitos') body = `<div class="dlx-fx"><label>Palavras por legenda <b id="v-wd">${st.cap.words ? st.cap.words : 'Padrão do estilo'}</b></label><input type="range" id="fx-wd" min="0" max="10" step="1" value="${st.cap.words || 0}" aria-label="Palavras por legenda"><p class="dlx-sub" style="margin:2px 0 14px">Quantas palavras aparecem de cada vez. No zero, vale o que o estilo escolhido define.</p><label>Contorno <b id="v-ow">${e.ow}</b></label><input type="range" id="fx-ow" min="0" max="10" value="${e.ow}"><label>Sombra <b id="v-sh">${e.shadow}</b></label><input type="range" id="fx-sh" min="0" max="8" value="${e.shadow}"><label>Tamanho <b id="v-sz">${st.cap.size}</b></label><input type="range" id="fx-sz" min="10" max="32" value="${st.cap.size}">
          <div class="dlx-row" style="margin-top:14px"><div><b>Animação ao entrar</b><small>A palavra “pula” ao aparecer</small></div>${sw('fx-pop', e.pop)}</div><div class="dlx-row"><div><b>Maiúsculas</b></div>${sw('fx-up', e.upper)}</div>
          <h4>Posição</h4><div class="dlx-chips">${[['top', 'Topo'], ['middle', 'Meio'], ['bottom', 'Base']].map((p) => `<button data-pos="${p[0]}" aria-pressed="${st.cap.pos === p[0]}">${p[1]}</button>`).join('')}</div><button class="dlx-link" id="fx-reset" style="margin-top:12px">Restaurar o padrão do estilo</button></div>`;
        else body = `<p class="dlx-sub" style="margin-top:0">Traduz o texto da legenda deste corte. Usa um modelo de linguagem (precisa de GROQ_API_KEY no servidor) e a tradução vale para o arquivo final.</p><label class="dlx-lab">Traduzir para<select id="tr-lang"><option value="">Original</option>${EP.LANGS.map((l) => `<option ${st.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="ap-btn pri" id="tr-go" style="width:100%;justify-content:center;margin-top:12px">Traduzir legenda</button><p class="dlx-sub" id="tr-msg">${st.lang ? `Legenda traduzida para ${esc(st.lang)}.` : ''}</p>`;
        return `<div class="dlx-tabs" role="tablist">${tabs.map((t) => { const dis = t[0] !== 'estilos' && !st.styleChosen; return `<button role="tab" data-tab="${t[0]}" aria-selected="${st.tab === t[0]}" ${dis ? 'disabled title="Escolha um estilo primeiro"' : ''}>${t[1]}</button>`; }).join('')}</div>${body}`;
      },
      midia: () => {
        const imgs = st.overlays.filter((o) => o.type === 'image'), sel = ovById(st.sel);
        return `<h3>Mídia</h3><p class="dlx-sub" style="margin-top:0">Adicione imagens sobre o corte. Arraste para posicionar, redimensione e defina quando aparecem.</p><h4>Sua biblioteca</h4><p class="dlx-sub" style="margin:0 0 10px">PNG, JPEG ou WebP, até 8 MB. Só imagem parada.</p>
          <div class="dlx-lib">${(st.lib || []).map((l) => `<div class="li"><button data-add="${l.id}" title="${esc(l.name)}"><img src="/api/library/${l.id}/file" alt="${esc(l.name)}"></button><button class="x" data-lib-del="${l.id}" aria-label="Excluir da biblioteca">✕</button></div>`).join('') || (st.lib === null ? '<p class="dlx-sub">Carregando…</p>' : '<p class="dlx-sub" style="grid-column:1/-1">Biblioteca vazia.</p>')}</div>
          <button class="ap-btn pri" id="lib-up" style="width:100%;justify-content:center;margin:12px 0">Adicionar imagem</button><input type="file" id="lib-file" hidden accept="image/png,image/jpeg,image/webp">
          ${imgs.length ? `<h4>No quadro (${imgs.length})</h4>` : ''}${sel && sel.type === 'image' ? propsEditor(sel) : (imgs.length ? '<p class="dlx-sub">Clique numa imagem no quadro para editar.</p>' : '')}`;
      },
      texto: () => {
        const ts = st.overlays.filter((o) => o.type === 'text'), sel = ovById(st.sel);
        return `<h3>Texto</h3><p class="dlx-sub" style="margin-top:0">Adicione texto sobre o corte. Arraste para posicionar, redimensione e defina quando aparece.</p><button class="ap-btn pri" id="txt-add" style="width:100%;justify-content:center">Adicionar texto</button>
          ${ts.length ? `<div class="dlx-layers" style="margin-top:12px">${ts.map((o) => `<button class="lr ${st.sel === o.id ? 'on' : ''}" data-sel="${o.id}">T <span>${esc(o.text.slice(0, 28))}</span></button>`).join('')}</div>` : '<p class="dlx-sub" style="margin-top:12px">Nenhum texto ainda. Adicione um para mostrar no corte.</p>'}${sel && sel.type === 'text' ? propsEditor(sel) : ''}`;
      },
      ganchos: () => `<h3>Ganchos</h3><p class="dlx-sub" style="margin-top:0">Adicione um gancho de texto no começo do corte para aumentar a retenção.</p><h4>Ganchos de texto</h4><div class="dlx-hooks">${EP.HOOKS.map((h, i) => `<button data-hook="${i}" style="background:${EP.COLORS[i % EP.COLORS.length]}">${esc(h)}</button>`).join('')}</div>
        <h4>Formato</h4><div class="dlx-chips"><button data-hf="box" aria-pressed="${st.hookFmt !== 'plain'}">Com tarja</button><button data-hf="plain" aria-pressed="${st.hookFmt === 'plain'}">Só texto</button></div>`,
      camadas: () => {
        const list = st.overlays.slice().reverse();
        return `<h3>Camadas</h3><p class="dlx-sub" style="margin-top:0">O topo da lista fica na frente. Arraste para mudar a ordem.</p>${list.length ? `<div class="dlx-layers" id="lay">${list.map((o) => `<div class="lr ${st.sel === o.id ? 'on' : ''}" draggable="true" data-lid="${o.id}"><button data-sel="${o.id}" class="nm">${o.type === 'image' ? '🖼' : 'T'} <span>${esc(o.type === 'image' ? ((st.lib || []).find((l) => l.id === o.imgId) || { name: 'Imagem' }).name : o.text.slice(0, 26))}</span></button><button data-eye="${o.id}" aria-label="${o.hidden ? 'Mostrar' : 'Ocultar'}">${o.hidden ? '🙈' : '👁'}</button><button data-rm="${o.id}" aria-label="Excluir">✕</button></div>`).join('')}</div>` : '<p class="dlx-sub">Nada no quadro ainda. Adicione um texto, uma imagem ou um gancho.</p>'}`;
      },
    };
    function drawDrawer() {
      const dr = $('#dx-drawer', root), keep = dr.scrollTop; $('#dx-body', root).classList.toggle('open', !!st.panel);
      $$('.dlx-rail button', root).forEach((b) => b.classList.toggle('on', b.dataset.p === st.panel));
      if (!st.panel) { dr.hidden = true; return; }
      dr.hidden = false; dr.innerHTML = `<div class="dlx-dr">${panelsHTML[st.panel]()}</div>`; dr.scrollTop = keep; bindDrawer(dr);
      if (st.panel === 'midia' && st.lib === null) loadLib();
      if (st.panel === 'templates' && st.templates === null) api('/templates').then((l) => { st.templates = l; if (st.panel === 'templates') drawDrawer(); }).catch(() => { st.templates = []; });
    }
    const loadLib = () => api('/library').then((l) => { st.lib = l; if (['midia', 'camadas'].includes(st.panel)) drawDrawer(); }).catch(() => { st.lib = []; });
    function applyTemplate(t) {
      st.cap = { ...st.cap, style: t.style, on: true }; st.styleChosen = true;
      st.overlays = st.overlays.filter((o) => !o.tpl);
      if (t.text) st.overlays.push({ id: rid(), tpl: true, type: 'text', text: t.text, x: 0.5, y: st.format === '16:9' ? 0.12 : 0.1, size: 0.05, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: true, box: { color: t.bg, alpha: 0 }, outline: null, start: null, end: null, hidden: false });
      shared.wordsDirty = true; commit(); renderOverlays(); paintCap(); drawDrawer(); refreshBar();
    }
    function bindDrawer(dr) {
      const on = (id, ev, fn) => { const e = $('#' + id, dr); if (e) e.addEventListener(ev, fn); };
      const onAll = (sel, ev, fn) => $$(sel, dr).forEach((e) => e.addEventListener(ev, () => fn(e)));
      if (st.panel === 'transcricao') {
        on('tr-big', 'click', () => { st.trLarge = !st.trLarge; drawDrawer(); });
        on('tr-title', 'input', (e) => { st.title = e.target.value; }); on('tr-title', 'change', commit);
        const setIv = (a, b) => { a = clamp(a, 0, dur); b = clamp(b, 0, dur); if (b - a < 1) { if (a === st.start) b = a + 1; else a = b - 1; } st.start = Math.max(0, a); st.end = Math.min(dur, b); shared.wordsDirty = true; goStart(); tickUI(); paintCap(); refreshBar(); };
        $$('[data-hms]', dr).forEach((i) => i.addEventListener('change', () => { const g = (k) => ['0', '1', '2'].map((n, x) => +$(`[data-hms="${k}${n}"]`, dr).value * [3600, 60, 1][x]).reduce((s, x) => s + x, 0); setIv(g('s'), g('e')); commit(); drawDrawer(); }));
        const rs = $('#tr-rs', dr), re = $('#tr-re', dr);
        if (rs) { rs.oninput = () => setIv(+rs.value, st.end); rs.onchange = () => { commit(); drawDrawer(); }; re.oninput = () => setIv(st.start, +re.value); re.onchange = () => { commit(); drawDrawer(); }; }
        on('tr-rm', 'click', () => { st.trMode = st.trMode === 'remove' ? 'cut' : 'remove'; drawDrawer(); }); on('tr-ed', 'click', () => { st.trMode = st.trMode === 'edit' ? 'cut' : 'edit'; drawDrawer(); });
        on('tr-seg', 'click', () => render(false, { raw: true }));
        onAll('.w', 'click', (w) => {
          const ws = +w.dataset.ws, we = +w.dataset.we, seg = +w.dataset.seg;
          if (st.trMode === 'remove') { const i = st.removed.findIndex(([a, b]) => Math.abs(a - ws) < 0.02 && Math.abs(b - we) < 0.02); if (i >= 0) st.removed.splice(i, 1); else st.removed.push([ws, we]); shared.wordsDirty = true; commit(); paintCap(); drawDrawer(); }
          else if (st.trMode === 'edit') { const sg = segs.find((s) => s.id === seg); if (!sg) return; const cur = st.edits[seg] !== undefined ? st.edits[seg] : sg.text; const m = document.createElement('div'); m.className = 'modal-bg'; m.style.zIndex = 130; m.innerHTML = `<div class="modal"><h3>Editar texto da fala</h3><p>${tm(sg.t)} · ${esc(sg.who)}. Vale para a legenda deste corte.</p><textarea id="ed-t" rows="4" style="width:100%">${esc(cur)}</textarea><div class="ft"><button class="ap-btn" data-x>Cancelar</button><button class="ap-btn" data-orig>Restaurar original</button><button class="ap-btn pri" data-ok>Salvar</button></div></div>`; document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); }; $('[data-ok]', m).onclick = () => { const t = $('#ed-t', m).value.trim(); if (t) st.edits[seg] = t; shared.wordsDirty = true; commit(); m.remove(); paintCap(); drawDrawer(); }; $('[data-orig]', m).onclick = () => { delete st.edits[seg]; shared.wordsDirty = true; commit(); m.remove(); paintCap(); drawDrawer(); }; }
          else { const mid = (st.start + st.end) / 2; if (ws < mid) setIv(ws, st.end); else setIv(st.start, we); commit(); drawDrawer(); }
        });
      }
      if (st.panel === 'templates') {
        on('tp-q', 'input', (e) => { st.tq = e.target.value; const pos = e.target.selectionStart; drawDrawer(); const n = $('#tp-q', root); n.focus(); n.setSelectionRange(pos, pos); });
        onAll('[data-tc]', 'click', (b) => { st.tplCat = b.dataset.tc; drawDrawer(); });
        onAll('.dlx-card', 'click', (c) => { const id = c.dataset.tpl; const t = EP.TEMPLATES.find((x) => x.id === id) || (st.templates || []).find((x) => x.id === id); if (!t) return; if (t.config) { st.cap = { ...st.cap, ...t.config, on: true }; st.styleChosen = true; if (t.config.overlays) st.overlays = t.config.overlays.map((o) => ({ ...o, id: rid() })); shared.wordsDirty = true; commit(); renderOverlays(); paintCap(); drawDrawer(); toast(`Template “${t.name}” aplicado.`); } else { applyTemplate(t); toast(`Template “${t.name}” aplicado.`); } });
        onAll('[data-fav]', 'click', (b) => { const ev = window.event; if (ev) ev.stopPropagation(); const s = FAV.get('invb.favTpl'); s.has(b.dataset.fav) ? s.delete(b.dataset.fav) : s.add(b.dataset.fav); FAV.set('invb.favTpl', s); drawDrawer(); });
        on('tp-save', 'click', () => { const name = prompt('Nome do template'); if (!name || !name.trim()) return; api('/templates', { json: { name: name.trim(), config: { ...st.cap, overlays: st.overlays.filter((o) => !o.hidden) } } }).then((t) => { (st.templates = st.templates || []).push(t); toast('Template salvo.'); drawDrawer(); }).catch((e) => toast(e.message)); });
      }
      if (st.panel === 'legendas') {
        onAll('[data-tab]', 'click', (b) => { if (b.disabled) return; st.tab = b.dataset.tab; drawDrawer(); });
        on('sty-anim', 'click', () => { st.anim = !st.anim; drawDrawer(); });
        on('sty-q', 'input', (e) => { st.q = e.target.value; const pos = e.target.selectionStart; drawDrawer(); const n = $('#sty-q', root); n.focus(); n.setSelectionRange(pos, pos); });
        onAll('[data-cat]', 'click', (b) => { st.cat = b.dataset.cat; drawDrawer(); });
        onAll('[data-style]', 'click', (c) => { const id = c.dataset.style; if (id === '') { st.cap.on = false; } else { st.cap.style = id; st.cap.on = true; st.styleChosen = true; } shared.wordsDirty = true; commit(); refreshBar(); paintCap(); drawDrawer(); });
        onAll('[data-fav]', 'click', (b) => { const ev = window.event; if (ev) ev.stopPropagation(); const s = FAV.get('invb.favSty'); s.has(b.dataset.fav) ? s.delete(b.dataset.fav) : s.add(b.dataset.fav); FAV.set('invb.favSty', s); drawDrawer(); });
        onAll('[data-font]', 'click', (b) => { st.cap.font = b.dataset.font || null; commit(); paintCap(); drawDrawer(); });
        onAll('[data-pos]', 'click', (b) => { st.cap.pos = b.dataset.pos; commit(); paintCap(); drawDrawer(); });
        const rng = (id, key, out) => { const r = $('#' + id, dr); if (r) { r.oninput = () => { st.cap[key] = +r.value; $('#' + out, dr).textContent = r.value; paintCap(); }; r.onchange = commit; } };
        rng('fx-ow', 'ow', 'v-ow'); rng('fx-sh', 'shadow', 'v-sh'); rng('fx-sz', 'size', 'v-sz');
        const wd = $('#fx-wd', dr); if (wd) { wd.oninput = () => { st.cap.words = +wd.value >= 1 ? +wd.value : null; $('#v-wd', dr).textContent = st.cap.words ? st.cap.words : 'Padrão do estilo'; paintCap(); }; wd.onchange = commit; }
        on('fx-pop', 'click', () => { st.cap.pop = !eff().pop; commit(); paintCap(); drawDrawer(); }); on('fx-up', 'click', () => { st.cap.upper = !eff().upper; commit(); paintCap(); drawDrawer(); });
        on('fx-reset', 'click', () => { Object.assign(st.cap, { upper: null, pop: null, font: null, ow: null, shadow: null, size: 16, words: null }); commit(); paintCap(); drawDrawer(); });
        on('tr-lang', 'change', (e) => { if (!e.target.value) { st.lang = null; st.edits = {}; shared.wordsDirty = true; commit(); paintCap(); drawDrawer(); } });
        on('tr-go', 'click', async () => {
          const lang = $('#tr-lang', dr).value; if (!lang) return toast('Escolha o idioma.'); const msg = $('#tr-msg', dr), btn = $('#tr-go', dr); btn.disabled = true; msg.textContent = 'Traduzindo…';
          try { const r = await api('/translate', { json: { lang, texts: segs.filter((s) => s.end > st.start && s.t < st.end).map((s) => ({ id: s.id, text: s.text })) } }); st.edits = { ...st.edits, ...r.translations }; st.lang = lang; shared.wordsDirty = true; commit(); paintCap(); msg.textContent = `Legenda traduzida para ${lang}.`; }
          catch (e) { msg.textContent = e.message; } btn.disabled = false;
        });
        if (st.tab === 'estilos') { // pré-visualizações animadas só dos cartões visíveis
          clearInterval(st.animT); if (st.anim) st.animT = setInterval(() => { st.tick++; const box = $('#dx-drawer', root); if (!box || st.panel !== 'legendas' || st.tab !== 'estilos') return clearInterval(st.animT); const br = box.getBoundingClientRect(); $$('#sty-grid [data-style]:not(.nosub)', box).forEach((c) => { const r = c.getBoundingClientRect(); if (r.bottom < br.top || r.top > br.bottom) return; const S = CSx.byName(c.dataset.style); $('.pv', c).innerHTML = sampleCard(S, st.tick); }); }, 750);
        }
      }
      if (st.panel === 'midia') {
        on('lib-up', 'click', () => $('#lib-file', dr).click());
        on('lib-file', 'change', async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 8 * 1048576) return toast('Máximo de 8 MB.'); const x = new XMLHttpRequest(); x.open('POST', '/api/library?name=' + encodeURIComponent(f.name)); x.setRequestHeader('x-invb', '1'); x.onload = () => { if (x.status === 201) { st.lib = null; loadLib(); toast('Imagem adicionada à biblioteca.'); } else { let m = 'Falha ao enviar a imagem.'; try { m = JSON.parse(x.responseText).error; } catch { /* */ } toast(m); } }; x.send(f); });
        onAll('[data-add]', 'click', (b) => addOverlay({ type: 'image', imgId: b.dataset.add, w: 0.3, op: 1 }));
        onAll('[data-lib-del]', 'click', (b) => { api('/library/' + b.dataset.libDel, { method: 'DELETE' }).then(() => { st.overlays = st.overlays.filter((o) => o.imgId !== b.dataset.libDel); st.lib = null; commit(); renderOverlays(); loadLib(); }).catch((e) => toast(e.message)); });
        bindProps(dr);
      }
      if (st.panel === 'texto') {
        on('txt-add', 'click', () => addOverlay({ type: 'text', text: 'Seu texto', size: 0.06, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: false, box: null, outline: { color: '#000000', w: 3 } }));
        onAll('[data-sel]', 'click', (b) => { st.sel = b.dataset.sel; renderOverlays(); drawDrawer(); });
        bindProps(dr);
      }
      if (st.panel === 'ganchos') {
        onAll('[data-hf]', 'click', (b) => { st.hookFmt = b.dataset.hf; drawDrawer(); });
        onAll('[data-hook]', 'click', (b) => { const i = +b.dataset.hook, plain = st.hookFmt === 'plain'; addOverlay({ type: 'text', text: EP.HOOKS[i], size: 0.065, color: '#ffffff', font: 'Arial', bold: true, italic: false, upper: false, y: 0.16, box: plain ? null : { color: EP.COLORS[i % EP.COLORS.length], alpha: 0 }, outline: plain ? { color: '#000000', w: 4 } : null, start: 0, end: Math.min(3, D()) }); toast('Gancho adicionado nos 3 primeiros segundos.'); });
      }
      if (st.panel === 'camadas') {
        if (st.lib === null) loadLib();
        onAll('[data-sel]', 'click', (b) => { st.sel = b.dataset.sel; renderOverlays(); drawDrawer(); });
        onAll('[data-eye]', 'click', (b) => { const o = ovById(b.dataset.eye); o.hidden = !o.hidden; commit(); renderOverlays(); drawDrawer(); });
        onAll('[data-rm]', 'click', (b) => delOverlay(b.dataset.rm));
        let from = null;
        $$('.lr[draggable]', dr).forEach((r) => { r.addEventListener('dragstart', () => { from = r.dataset.lid; }); r.addEventListener('dragover', (e) => e.preventDefault()); r.addEventListener('drop', (e) => { e.preventDefault(); const to = r.dataset.lid; if (!from || from === to) return; const a = st.overlays.findIndex((o) => o.id === from), b = st.overlays.findIndex((o) => o.id === to); const [it] = st.overlays.splice(a, 1); st.overlays.splice(b, 0, it); commit(); renderOverlays(); drawDrawer(); }); });
      }
    }

  };
})();
