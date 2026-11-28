/* INVB Studio — editor do corte: a gaveta Apoio. Imagens de apoio (B-roll): fotos e vídeos grátis do Pixabay (ou do Pexels) que
   ilustram a frase, em tela cheia ou num cartão, com P&B e aproximação lenta. O Claude sugere os momentos e o que buscar.
   A busca e o download passam pelo servidor (lib/pexels.js), que guarda a chave; a exportação está em lib/render.js.
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, $$, clamp, rid } = window.ClipEditorParts.base;

  window.ClipEditorParts.apoio = function (shared) {
    const { st, v, stage, esc, commit, toast, api, upload, clip, D, tm } = shared;
    const drawDrawer = (...a) => shared.drawDrawer(...a);
    if (!Array.isArray(st.broll)) st.broll = [];
    const ui = { q: '', kind: 'photo', items: null, busy: false, ai: null, aiBusy: false, adding: null };
    const fileUrl = (id) => `/api/broll/${id}/file`;
    const orientation = () =>
      st.format === '9:16' || st.format === '4:5' ? 'portrait' : st.format === '1:1' ? 'square' : 'landscape';

    /* ----- prévia: a imagem por cima do vídeo no tempo dela ----- */
    const fxLayer = $('.imp-fx', stage) || stage.querySelector('video');
    fxLayer.insertAdjacentHTML('afterend', '<div class="apo-layer" aria-hidden="true"></div>');
    const layer = $('.apo-layer', stage);
    const els = new Map(); // id do item -> elemento na prévia
    function paint() {
      const t = shared.relT ? shared.relT() : 0;
      const on = st.broll.find((o) => t >= o.start && t <= o.end);
      for (const [id, el] of els)
        if (!on || on.id !== id) {
          el.remove();
          els.delete(id);
        }
      layer.classList.toggle('card', !!(on && on.mode === 'card'));
      if (!on) return;
      let el = els.get(on.id);
      const isVid = /^.v/.test(on.mediaId);
      if (!el) {
        el = document.createElement(isVid ? 'video' : 'img');
        el.src = fileUrl(on.mediaId);
        if (isVid) {
          el.muted = true;
          el.playsInline = true;
          el.loop = true;
        }
        layer.appendChild(el);
        els.set(on.id, el);
      }
      el.className = on.mode === 'card' ? 'card' : 'full';
      const p = clamp((t - on.start) / Math.max(0.1, on.end - on.start), 0, 1);
      el.style.filter = on.bw ? 'grayscale(1) contrast(1.15)' : '';
      el.style.transform = on.zoom && !isVid && on.mode !== 'card' ? `scale(${(1 + 0.12 * p).toFixed(4)})` : '';
      if (isVid) {
        const want = t - on.start;
        if (el.duration && Math.abs((el.currentTime % el.duration) - (want % el.duration)) > 0.35)
          el.currentTime = want % el.duration;
        if (v.paused) el.pause();
        else el.play().catch(() => {});
      }
    }
    const prev = shared.applyFx || (() => {});
    shared.applyFx = () => {
      prev();
      paint();
    };

    /* ----- ações ----- */
    const refresh = () => {
      commit();
      shared.applyFx();
      drawDrawer();
    };
    // baixa (uma vez) e põe na linha do tempo
    async function place(item, start, end, mode, label) {
      ui.adding = item.pexelsId;
      drawDrawer();
      try {
        const it = await api('/broll', { json: { kind: item.kind, pexelsId: item.pexelsId } });
        const len = item.kind === 'video' && it.dur ? Math.min(end - start, Math.max(1, it.dur)) : end - start;
        st.broll.push({
          id: rid(),
          mediaId: it.id,
          start: +clamp(start, 0, D()).toFixed(2),
          end: +clamp(start + len, 0, D()).toFixed(2),
          mode: mode || 'full',
          bw: true,
          zoom: item.kind === 'photo',
          label: label || item.alt || '',
          by: it.by || '',
        });
        st.broll.sort((a, b) => a.start - b.start);
        v.currentTime = st.start + Math.max(0, start - 0.3);
        refresh();
      } catch (e) {
        toast(e.message);
      }
      ui.adding = null;
      drawDrawer();
    }
    async function doSearch() {
      if (!ui.q.trim()) return toast('Digite o que buscar (em português ou inglês).');
      ui.busy = true;
      drawDrawer();
      try {
        const r = await api(`/broll/search?q=${encodeURIComponent(ui.q)}&kind=${ui.kind}&orientation=${orientation()}`);
        ui.items = r.items;
      } catch (e) {
        toast(e.message);
      }
      ui.busy = false;
      drawDrawer();
    }
    async function suggest() {
      const ws = shared.relWords ? shared.relWords() : [];
      if (ws.length < 4) return toast('Este corte não tem fala suficiente na transcrição para a IA sugerir.');
      ui.aiBusy = true;
      drawDrawer();
      try {
        const r = await api(`/uploads/${upload.id}/clips/${clip.id}/ai/broll`, {
          json: {
            words: ws.map((w) => w.t),
            times: ws.map((w) => [+w.s.toFixed(2), +w.e.toFixed(2)]),
            format: st.format,
          },
        });
        ui.ai = {
          note: r.note,
          moments: (r.moments || []).map((m) => ({
            ...m,
            start: ws[m.from].s,
            end: Math.max(ws[m.to].e + 0.2, ws[m.from].s + 1.5),
            text: ws
              .slice(m.from, m.to + 1)
              .map((w) => w.t)
              .join(' '),
          })),
        };
        if (!ui.ai.moments.length) toast('O Claude não achou momentos que pedem imagem neste corte.');
      } catch (e) {
        toast(e.message);
      }
      ui.aiBusy = false;
      drawDrawer();
    }

    /* ----- a gaveta ----- */
    const thumb = (it, attrs) =>
      `<button class="apo-th ${ui.adding === it.pexelsId ? 'busy' : ''}" ${attrs} title="${esc((it.alt || '') + (it.by ? ' · ' + it.by : ''))}"><img src="${esc(it.thumb)}" alt="" loading="lazy">${it.kind === 'video' ? `<i>▶ ${Math.round(it.dur || 0)}s</i>` : ''}</button>`;
    function html() {
      if (!shared.ctx || !shared.ctx.broll)
        return `<h3>Apoio</h3><p class="dlx-sub" style="margin-top:0">Fotos e vídeos que ilustram a frase, como num Reels: a mão estendida, a armadilha, a tempestade.</p>
          <div class="apo-off"><b>Falta a chave do Pixabay</b> (grátis). Crie a conta em <b>pixabay.com</b>, copie a chave em <b>pixabay.com/api/docs</b>, ponha no <code>install/equipe.env</code> como <code>PIXABAY_API_KEY=sua-chave</code> e reabra o Studio.</div>`;
      const ai = shared.ctx.ai,
        src = shared.ctx.brollSource || 'Pixabay';
      return `<h3>Apoio</h3><p class="dlx-sub" style="margin-top:0">Fotos e vídeos que ilustram a frase. Entram em tela cheia ou num cartão, em P&amp;B por padrão.</p>
        ${ai ? `<button class="ap-btn pri imp-ai" id="apo-ai" ${ui.aiBusy ? 'disabled' : ''}>${ui.aiBusy ? 'O Claude está escolhendo…' : '✨ Sugerir imagens com o Claude'}</button>` : ''}
        ${
          ui.ai
            ? `${ui.ai.note ? `<p class="imp-note">${esc(ui.ai.note)}</p>` : ''}${ui.ai.moments
                .map(
                  (m, i) =>
                    `<div class="apo-mo"><button class="apo-mt" data-go="${m.start}"><b>${tm(m.start)}</b> “${esc(m.text.slice(0, 60))}” <span>· ${esc(m.label)}</span></button><div class="apo-grid">${
                      m.items && m.items.length
                        ? m.items.map((it, j) => thumb(it, `data-mo="${i}" data-it="${j}"`)).join('')
                        : `<p class="dlx-sub">${esc(m.error || 'Nada encontrado.')}</p>`
                    }</div></div>`,
                )
                .join('')}`
            : ''
        }
        <h4>Buscar</h4>
        <div class="apo-q"><input id="apo-q" type="search" placeholder="ex.: mãos, tempestade, deserto" value="${esc(ui.q)}"><button class="ap-btn" id="apo-go" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Buscar'}</button></div>
        <div class="dlx-chips"><button data-kind="photo" aria-pressed="${ui.kind === 'photo'}">Fotos</button><button data-kind="video" aria-pressed="${ui.kind === 'video'}">Vídeos</button></div>
        ${
          ui.items
            ? ui.items.length
              ? `<p class="dlx-sub">Toque para pôr no ponto onde o vídeo está (${tm(shared.relT ? shared.relT() : 0)}).</p><div class="apo-grid">${ui.items.map((it, j) => thumb(it, `data-res="${j}"`)).join('')}</div>`
              : '<p class="dlx-sub">Nada encontrado. Tente em inglês ou com outra palavra.</p>'
            : ''
        }
        ${
          st.broll.length
            ? `<h4>No corte (${st.broll.length})</h4><div class="apo-list">${st.broll
                .map(
                  (o) =>
                    `<div class="apo-row"><button class="apo-mini" data-go="${o.start}">${/^.v/.test(o.mediaId) ? `<video src="${fileUrl(o.mediaId)}#t=0.5" muted preload="metadata"></video>` : `<img src="${fileUrl(o.mediaId)}" alt="">`}</button>
                    <div class="apo-ctl"><div class="apo-t"><input type="number" step="0.1" min="0" data-bs="${o.id}" value="${o.start.toFixed(1)}" aria-label="Início (s)"><span>→</span><input type="number" step="0.1" min="0" data-be="${o.id}" value="${o.end.toFixed(1)}" aria-label="Fim (s)"><button data-rmb="${o.id}" aria-label="Excluir">✕</button></div>
                    <div class="dlx-chips"><button data-mode="${o.id}:full" aria-pressed="${o.mode !== 'card'}">Tela cheia</button><button data-mode="${o.id}:card" aria-pressed="${o.mode === 'card'}">Cartão</button><button data-bw="${o.id}" aria-pressed="${!!o.bw}">P&amp;B</button>${/^.f/.test(o.mediaId) ? `<button data-zm="${o.id}" aria-pressed="${!!o.zoom}">Zoom lento</button>` : ''}</div></div></div>`,
                )
                .join('')}</div>`
            : ''
        }
        <p class="apo-cred">Fotos e vídeos do <a href="https://${src === 'Pexels' ? 'www.pexels.com' : 'pixabay.com'}" target="_blank" rel="noopener">${src}</a>, grátis para usar.</p>`;
    }
    function bind(dr) {
      const on = (sel, fn) => $$(sel, dr).forEach((b) => b.addEventListener('click', () => fn(b)));
      const ai = $('#apo-ai', dr);
      if (ai) ai.onclick = suggest;
      const q = $('#apo-q', dr);
      if (q) {
        q.addEventListener('input', (e) => (ui.q = e.target.value));
        q.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSearch();
          e.stopPropagation(); // espaço e letras não viram atalhos do editor
        });
      }
      const go = $('#apo-go', dr);
      if (go) go.onclick = doSearch;
      on('[data-kind]', (b) => {
        ui.kind = b.dataset.kind;
        if (ui.q.trim()) doSearch();
        else drawDrawer();
      });
      on('[data-res]', (b) => {
        const it = ui.items[+b.dataset.res];
        const t = shared.relT ? shared.relT() : 0;
        place(it, t, t + (it.kind === 'video' ? 3 : 2), 'full', it.alt);
      });
      on('[data-mo]', (b) => {
        const m = ui.ai.moments[+b.dataset.mo],
          it = m.items[+b.dataset.it];
        // troca a que já estava neste momento, se houver
        st.broll = st.broll.filter((o) => !(o.start < m.end && o.end > m.start && o.ai));
        place(it, m.start, m.end, m.mode, m.label).then(() => {
          const last = st.broll.find((o) => o.label === m.label && o.start === +clamp(m.start, 0, D()).toFixed(2));
          if (last) last.ai = true;
        });
      });
      on('[data-go]', (b) => {
        v.currentTime = st.start + Math.max(0, +b.dataset.go - 0.3);
        shared.applyFx();
      });
      on('[data-rmb]', (b) => {
        st.broll = st.broll.filter((o) => o.id !== b.dataset.rmb);
        refresh();
      });
      on('[data-mode]', (b) => {
        const [id, mode] = b.dataset.mode.split(':');
        const o = st.broll.find((x) => x.id === id);
        if (o) o.mode = mode;
        refresh();
      });
      on('[data-bw]', (b) => {
        const o = st.broll.find((x) => x.id === b.dataset.bw);
        if (o) o.bw = !o.bw;
        refresh();
      });
      on('[data-zm]', (b) => {
        const o = st.broll.find((x) => x.id === b.dataset.zm);
        if (o) o.zoom = !o.zoom;
        refresh();
      });
      const setT = (attr, key) =>
        $$(`[${attr}]`, dr).forEach((inp) =>
          inp.addEventListener('change', () => {
            const o = st.broll.find((x) => x.id === inp.getAttribute(attr));
            if (!o) return;
            o[key] = +clamp(+inp.value || 0, 0, D()).toFixed(2);
            if (o.end <= o.start) o.end = +(o.start + 0.5).toFixed(2);
            st.broll.sort((a, b) => a.start - b.start);
            refresh();
          }),
        );
      setT('data-bs', 'start');
      setT('data-be', 'end');
    }
    // usado pelo "Sugerir tudo" da gaveta Impacto: põe a 1ª opção de cada momento sugerido pelo Claude
    shared.apoioAuto = async () => {
      const ws = shared.relWords ? shared.relWords() : [];
      if (ws.length < 4) return 0;
      const r = await api(`/uploads/${upload.id}/clips/${clip.id}/ai/broll`, {
        json: {
          words: ws.map((w) => w.t),
          times: ws.map((w) => [+w.s.toFixed(2), +w.e.toFixed(2)]),
          format: st.format,
        },
      });
      st.broll = st.broll.filter((o) => !o.ai); // troca as sugestões anteriores
      let n = 0;
      for (const m of r.moments || []) {
        const it = (m.items || [])[0];
        if (!it || !ws[m.from] || !ws[m.to]) continue;
        const start = ws[m.from].s,
          end = Math.max(ws[m.to].e + 0.2, start + 1.5);
        const before = st.broll.length;
        await place(it, start, end, m.mode, m.label);
        if (st.broll.length > before) {
          const added = st.broll.find((o) => o.label === m.label && !o.ai && Math.abs(o.start - start) < 0.02);
          if (added) added.ai = true;
          n++;
        }
      }
      ui.ai = null;
      return n;
    };
    shared.panels = { ...(shared.panels || {}), apoio: { html, bind } };
    shared.applyFx();
  };
})();
