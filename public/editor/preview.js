/* INVB Studio — editor do corte: a prévia do vídeo com a legenda, o teste de sincronia, a linha do tempo e as imagens e textos por cima.
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, $$, CSx, capHTML, clamp, rid } = window.ClipEditorParts.base;

  window.ClipEditorParts.preview = function (shared) {
    const {
      st,
      v,
      upload,
      tm,
      root,
      commit,
      toast,
      api,
      segs,
      clip,
      fmtObj,
      isAud,
      stage,
      capEl,
      style,
      eff,
      dur,
      outD,
      D,
      removedIn,
      ovsEl,
      esc,
      guides,
      dirty,
      segsIn,
      spTxt,
      undo,
      redo,
    } = shared;
    // definidas em outra parte, mais adiante: chamadas pelo objeto comum na hora do uso
    const drawLeft = (...a) => shared.drawLeft(...a);
    const drawDrawer = (...a) => shared.drawDrawer(...a);
    const reloadAll = (...a) => shared.reloadAll(...a);
    Object.assign(shared, { refreshBar, paintCap, renderOverlays, loadTrim, drawTrim });

    /* Sincronia do áudio: a conferência é feita num trecho curto renderizado pelo servidor, do mesmo jeito que o arquivo final.
       (Tocar o som deslocado ao vivo no navegador não é confiável: cada navegador e cada saída de som atrasam de um jeito.) */
    let syTest = null; // janela do teste aberta
    const closeSyTest = () => {
      if (!syTest) return;
      const vd = $('video', syTest);
      if (vd) {
        vd.pause();
        if (vd.src) URL.revokeObjectURL(vd.src);
      }
      syTest.remove();
      syTest = null;
    };
    const runSyTest = async (btn) => {
      const LEN = 8,
        at = Math.max(st.start, Math.min(Math.max(st.start, st.end - LEN), v.currentTime || st.start)),
        len = Math.min(LEN, st.end - at);
      v.pause();
      closeSyTest();
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparando o teste…';
      try {
        const r = await fetch(
          `/api/uploads/${upload.id}/synctest?at=${at.toFixed(2)}&len=${len.toFixed(2)}&shift=${st.sync}`,
          { headers: { 'x-invb': '1' } },
        );
        if (!r.ok) {
          let m = 'Não consegui preparar o teste.';
          try {
            m = (await r.json()).error || m;
          } catch {
            /* sem detalhe */
          }
          throw new Error(m);
        }
        const url = URL.createObjectURL(await r.blob());
        syTest = document.createElement('div');
        syTest.className = 'dlx-syt';
        syTest.innerHTML = `<div class="dlx-sytb" role="dialog" aria-label="Teste da sincronia"><h3>Teste da sincronia · ${syLabel(st.sync)}</h3><p>Trecho de ${Math.round(len)} s a partir de ${tm(at - st.start)}, igual ao que sai no arquivo. Olhe a boca e o som.</p><video controls autoplay loop playsinline></video><div class="dlx-syta"><button data-k="-0.05">Som 50 ms antes</button><button data-k="0.05">Som 50 ms depois</button><button data-k="x" class="pri">Fechar</button></div></div>`;
        $('video', syTest).src = url;
        root.appendChild(syTest);
        syTest.onclick = (e) => {
          if (e.target === syTest) closeSyTest();
        };
        $$('[data-k]', syTest).forEach(
          (bt) =>
            (bt.onclick = () => {
              if (bt.dataset.k === 'x') return closeSyTest();
              const sy = $('#dx-sy', root);
              st.sync = Math.max(-2, Math.min(2, Math.round((st.sync + +bt.dataset.k) * 100) / 100));
              if (sy) sy.value = st.sync;
              const o = $('#dx-syv', root);
              if (o) o.textContent = syLabel(st.sync);
              commit();
              const t = $('#dx-syt', root);
              if (t) runSyTest(t);
            }),
        );
        $('video', syTest)
          .play()
          .catch(() => {});
      } catch (e) {
        toast(e.message);
      }
      btn.disabled = false;
      btn.textContent = old;
    };
    /* Sincronia automática: o servidor compara a boca com o som neste corte. Só mexe no ajuste quando a medida é segura;
       nos outros casos explica por que não deu e deixa o ajuste como estava. */
    const asy = { busy: false, msg: '', kind: '' };
    const runAutoSync = async (L) => {
      if (asy.busy) return;
      asy.busy = true;
      asy.msg = '';
      drawLeft();
      try {
        const r = await api(`/uploads/${upload.id}/autosync`, { json: { start: st.start, end: st.end } });
        if (r.needsCorrection) {
          // A sincronia da pregação já é aplicada na exportação: aqui fica só o que falta além dela.
          const x = Math.max(-2, Math.min(2, Math.round((r.shiftSec - (upload.audioShift || 0)) * 100) / 100));
          st.sync = x;
          commit();
          asy.kind = 'ok';
          asy.msg = `${r.message} Ajuste aplicado: ${syLabel(x)}. Confira com Testar.`;
        } else if (r.status === 'sincronizado' && upload.audioShift) {
          st.sync = Math.max(-2, Math.min(2, Math.round(-upload.audioShift * 100) / 100));
          commit();
          asy.kind = 'ok';
          asy.msg = `${r.message} Como a pregação tem ajuste próprio, este corte recebe ${syLabel(st.sync)} para anular.`;
        } else {
          asy.kind = r.status === 'sincronizado' ? 'ok' : 'warn';
          asy.msg = r.message;
        }
      } catch (e) {
        asy.kind = 'warn';
        asy.msg = e.message;
      }
      asy.busy = false;
      drawLeft();
    };
    const syLabel = (x) => {
      const ms = Math.round(x * 1000);
      return ms === 0 ? 'Sem ajuste' : (ms > 0 ? '+' : '−') + Math.abs(ms) + ' ms';
    };

    /* ----- palavras ----- */
    const approx = (sg, text) => {
      const parts = text.split(/\s+/).filter(Boolean),
        tot = parts.reduce((a, x) => a + x.length, 0) || 1;
      let t0 = sg.t;
      return parts.map((x) => {
        const d = ((sg.end - sg.t) * x.length) / tot;
        const w = { t: x, s: t0, e: t0 + d, seg: sg.id };
        t0 += d;
        return w;
      });
    };
    const gone = (w) => st.removed.some(([a, b]) => (w.s + w.e) / 2 >= a && (w.s + w.e) / 2 <= b);
    shared.wordsDirty = true;
    let relCache = [];
    const relWords = () => {
      // palavras do corte atual (tempo relativo), com edição/tradução e remoções
      if (!shared.wordsDirty) return relCache;
      const out = [];
      for (const sg of segs) {
        if (sg.end <= st.start || sg.t >= st.end) continue;
        const ed = st.edits[sg.id];
        const ws =
          ed !== undefined
            ? approx(sg, ed)
            : shared.words.filter((w) => w.seg === sg.id).length
              ? shared.words.filter((w) => w.seg === sg.id)
              : approx(sg, sg.text);
        for (const w of ws)
          if (w.t && w.e > st.start && w.s < st.end && !gone(w))
            out.push({
              t: w.t,
              s: Math.max(w.s, st.start) - st.start,
              e: Math.min(w.e, st.end) - st.start,
              seg: sg.id,
            });
      }
      relCache = out;
      shared.wordsDirty = false;
      return out;
    };
    api(
      `/uploads/${upload.id}/words?start=${Math.max(0, clip.start - 120).toFixed(2)}&end=${(clip.end + 120).toFixed(2)}&abs=1`,
    )
      .then((w) => {
        shared.words = w;
        shared.wordsDirty = true;
        paintCap();
        if (st.panel === 'transcricao') drawDrawer();
      })
      .catch(() =>
        toast('O servidor está desatualizado: reinicie-o (node server.js) para usar todas as funções do editor.'),
      );

    /* ----- prévia ----- */
    const ratio = () => {
      const f = fmtObj();
      return f[2] ? f[2] / f[3] : v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    };
    const layoutStage = () => {
      if (isAud) return;
      const r = ratio(),
        drawerW = st.panel ? 372 : 0,
        H = Math.min(window.innerHeight - 350, 560),
        W = Math.min(H * r, window.innerWidth - 283 - 83 - drawerW - 60);
      stage.style.width = Math.max(160, W) + 'px';
      stage.style.height = Math.max(100, W / r) + 'px';
      if (shared.applyFx) shared.applyFx();
      else v.style.filter = st.bw ? 'grayscale(1)' : '';
      // enquadramento: a mesma conta da exportação ((sobra) × posição)
      const cr = st.crop || { x: 0.5, y: 0.5 };
      v.style.objectPosition = `${cr.x * 100}% ${cr.y * 100}%`;
      stage.classList.toggle('pan', canPan());
      paintCap();
      renderOverlays();
    };
    const relT = () => Math.max(0, (v.currentTime || 0) - st.start);
    shared.relT = relT;
    shared.relWords = () => relWords();
    function paintCap() {
      const hideNow =
        st.capHideImp !== false && window.ClipEditor.capHideRanges(st).some(([a, b]) => relT() >= a && relT() <= b);
      if (isAud || !st.cap.on || hideNow) {
        capEl.style.display = 'none';
        return;
      }
      const t = relT(),
        S = style(),
        E = eff(),
        H = stage.clientHeight || 1,
        scale = H / 1080,
        ws = relWords();
      let html = '',
        capK = '';
      if (S.mode === 'block') {
        const by = new Map();
        ws.forEach((w) => {
          if (!by.has(w.seg)) by.set(w.seg, []);
          by.get(w.seg).push(w);
        });
        const rng = [...by.values()].map((a) => [a[0].s, a[a.length - 1].e + 0.05, a]);
        const hit =
          rng.find((r) => r[0] <= t && t <= r[1]) ||
          (v.paused
            ? rng
                .slice()
                .sort(
                  (p, q) =>
                    Math.min(Math.abs(t - p[0]), Math.abs(t - p[1])) - Math.min(Math.abs(t - q[0]), Math.abs(t - q[1])),
                )[0]
            : null);
        if (hit) {
          html = capHTML(S, E, scale, hit[2], -1, 0);
          capK = String(hit[0]);
        }
      } else {
        const chunks = CSx.chunkWords(ws, S).map((ch) => [ch[0].s, ch[ch.length - 1].e + 0.12, ch]);
        const hit =
          chunks.find((r) => t >= r[0] && t <= r[1]) ||
          (v.paused
            ? chunks
                .slice()
                .sort(
                  (p, q) =>
                    Math.min(Math.abs(t - p[0]), Math.abs(t - p[1])) - Math.min(Math.abs(t - q[0]), Math.abs(t - q[1])),
                )[0]
            : null);
        if (hit) {
          const [a, b, ch] = hit;
          let act = 0;
          ch.forEach((w, i) => {
            if (w.s <= t) act = i;
          });
          html = capHTML(S, E, scale, ch, act, clamp(((t - a) / Math.max(0.1, b - a)) * 100, 0, 100));
          capK = S.anim === 'pop' ? a + '|' + act : String(a);
        }
      }
      if (!html) {
        capEl.style.display = 'none';
        shared.capKey = null; // a próxima frase entra com a animação
        return;
      }
      const fs = H * (st.cap.size / 288) * S.scale,
        mv =
          (st.cap.margin === null || st.cap.margin === undefined ? (st.format === '9:16' ? 14 : 8) : st.cap.margin) +
          '%';
      capEl.style.cssText = `display:block;font-size:${fs}px;${st.tools.xray ? 'opacity:.35;' : ''}${st.cap.pos === 'top' ? 'top:' + mv + ';bottom:auto' : st.cap.pos === 'middle' ? 'top:50%;transform:translateY(-50%);bottom:auto' : 'bottom:' + mv}`;
      // a frase fica num bloco que não é recriado, para a animação de entrada não recomeçar a cada quadro
      let inner = capEl.firstElementChild;
      if (!inner || !inner.classList.contains('capin')) {
        capEl.innerHTML = '<div class="capin"></div>';
        inner = capEl.firstElementChild;
      }
      if (inner.innerHTML !== html) inner.innerHTML = html;
      if (S.anim && S.anim !== 'none' && capK !== shared.capKey) {
        inner.className = 'capin';
        void inner.offsetWidth; // reinicia a animação
        inner.className = 'capin a-' + S.anim;
      }
      shared.capKey = capK;
    }
    const goStart = () => {
      v.currentTime = st.start;
    };
    v.addEventListener('loadedmetadata', () => {
      goStart();
      layoutStage();
      if (shared.drawLeft) shared.drawLeft(); // o enquadramento depende do tamanho do vídeo
    });

    /* ----- linha do tempo: forma de onda do trecho, com sobra dos dois lados, e pontas para ajustar o começo e o fim ----- */
    const TPAD = 15; // segundos de sobra antes e depois do corte
    const trim = { a: 0, b: 1, peaks: null, key: '', drag: null };
    const trimX = (t) => clamp(((t - trim.a) / Math.max(0.01, trim.b - trim.a)) * 100, 0, 100);
    function trimHead() {
      const ph = $('#dx-trph', root);
      if (ph) ph.style.left = trimX(v.currentTime || st.start) + '%';
    }
    function drawTrim() {
      const sel = $('#dx-trsel', root),
        cv = $('#dx-wave', root);
      if (!sel || !cv) return;
      sel.style.left = trimX(st.start) + '%';
      sel.style.width = Math.max(0, trimX(st.end) - trimX(st.start)) + '%';
      $('#dx-trl', root).textContent = 'Começo ' + tmAbs(st.start);
      $('#dx-trr', root).textContent = 'Fim ' + tmAbs(st.end);
      const dpr = window.devicePixelRatio || 1,
        W = cv.clientWidth,
        H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.clearRect(0, 0, W, H);
      const css = getComputedStyle(root),
        inC = css.getPropertyValue('--primary').trim() || '#3d63ff',
        outC = css.getPropertyValue('--border-strong').trim() || '#666';
      const pk = trim.peaks;
      if (!pk) return;
      const bw = W / pk.length,
        x0 = (trimX(st.start) / 100) * W,
        x1 = (trimX(st.end) / 100) * W;
      for (let i = 0; i < pk.length; i++) {
        const x = i * bw,
          h = Math.max(2, pk[i] * (H - 6));
        g.fillStyle = x + bw / 2 >= x0 && x + bw / 2 <= x1 ? inC : outC;
        g.fillRect(x, (H - h) / 2, Math.max(1, bw - 1), h);
      }
      trimHead();
    }
    // horas:minutos:segundos com décimo, no tempo da pregação inteira (é o que a equipe anota na minutagem)
    const tmAbs = (s) => {
      s = Math.max(0, Math.round(s * 10) / 10);
      const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = s - h * 3600 - m * 60;
      return (
        (h ? h + ':' + String(m).padStart(2, '0') : String(m)) +
        ':' +
        (x < 10 ? '0' : '') +
        x.toFixed(1).replace('.', ',')
      );
    };
    async function loadTrim() {
      if (trim.drag) return drawTrim();
      trim.a = Math.max(0, st.start - TPAD);
      trim.b = Math.min(dur, st.end + TPAD);
      const key = trim.a.toFixed(1) + '-' + trim.b.toFixed(1);
      if (key === trim.key) return drawTrim();
      trim.key = key;
      trim.peaks = null;
      drawTrim();
      try {
        const r = await api(`/uploads/${upload.id}/peaks?start=${trim.a.toFixed(2)}&end=${trim.b.toFixed(2)}&n=300`);
        if (trim.key === key) {
          trim.peaks = r.peaks;
          drawTrim();
        }
      } catch {
        /* sem a onda, as pontas continuam funcionando */
      }
    }
    const trimSet = (h, t) => {
      if (h === 's') st.start = +clamp(t, 0, st.end - 1).toFixed(2);
      else st.end = +clamp(t, st.start + 1, dur).toFixed(2);
      v.currentTime = h === 's' ? st.start : st.end;
      drawTrim();
      const t0 = $('#dx-t1', root);
      if (t0) t0.textContent = tm(outD());
    };
    const trimDone = (h) => {
      trim.drag = null;
      shared.wordsDirty = true;
      commit();
      reloadAll();
      if (h === 'e') v.currentTime = Math.max(st.start, st.end - 2);
    }; // depois de mexer no fim, volta 2 s para ouvir como termina
    {
      const box = $('#dx-trim', root),
        at = (e) => {
          const r = box.getBoundingClientRect();
          return trim.a + clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * (trim.b - trim.a);
        };
      $$('.h', box).forEach((hd) => {
        const h = hd.dataset.h;
        hd.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          v.pause();
          trim.drag = h;
          hd.setPointerCapture(e.pointerId);
        });
        hd.addEventListener('pointermove', (e) => {
          if (trim.drag === h) trimSet(h, at(e));
        });
        const end = () => {
          if (trim.drag === h) trimDone(h);
        };
        hd.addEventListener('pointerup', end);
        hd.addEventListener('pointercancel', end);
        hd.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          v.pause();
          trimSet(h, (h === 's' ? st.start : st.end) + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
          clearTimeout(trim.kt);
          trim.kt = setTimeout(() => trimDone(h), 600);
        });
      });
      box.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.h')) return;
        const t = at(e);
        if (t >= st.start && t <= st.end) v.currentTime = t;
      });
      window.addEventListener('resize', drawTrim);
    }
    const tickUI = () => {
      trimHead();
      const t = relT();
      $('#dx-seek', root).max = D().toFixed(2);
      $('#dx-seek', root).value = t;
      $('#dx-t0', root).textContent = tm(Math.max(0, t - removedIn(st.start, st.start + t)) / (st.speed || 1));
      $('#dx-t1', root).textContent = tm(outD());
    };
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= st.end - 0.05 && !v.paused) {
        v.pause();
        goStart();
      }
      if (v.currentTime < st.start - 0.3) goStart();
      // A prévia pula os trechos removidos (os marcados à mão; palavras soltas são curtas demais para pular com precisão).
      if (!v.paused) {
        const r = st.removed.find((x) => x[2] && v.currentTime >= x[0] && v.currentTime < x[1] - 0.05);
        if (r) v.currentTime = Math.min(r[1], st.end);
      }
      tickUI();
      paintCap();
      updateOvVisibility();
      $('#dx-play', root).style.opacity = v.paused ? 1 : 0;
    });
    v.addEventListener('pause', () => ($('#dx-play', root).style.opacity = 1));
    v.addEventListener('play', () => ($('#dx-play', root).style.opacity = 0));
    const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
    $('#dx-play', root).onclick = () => {
      if (shared.panned) return; // acabou de arrastar o enquadramento começando no botão: não é um clique
      toggle();
    };
    $('#dx-seek', root).oninput = (e) => {
      v.currentTime = st.start + +e.target.value;
    };
    window.addEventListener('resize', layoutStage);

    /* ----- overlays (texto/imagem) sobre o quadro ----- */
    const ovById = (id) => st.overlays.find((o) => o.id === id);
    // Parado, aparece o que está no quadro naquele momento e o texto selecionado (para arrastar mesmo fora do tempo dele).
    // Antes aparecia tudo do corte ao mesmo tempo, o que embolava com as palavras de impacto.
    const visibleAt = (o, t) =>
      !o.hidden &&
      ((v.paused && st.sel === o.id) || ((o.start === null || t >= o.start - 0.001) && (o.end === null || t <= o.end)));
    function renderOverlays() {
      const H = stage.clientHeight || 1,
        W = stage.clientWidth || 1;
      ovsEl.innerHTML = st.overlays
        .map((o) => {
          const sel = st.sel === o.id,
            pos = `left:${o.x * 100}%;top:${o.y * 100}%`;
          if (o.type === 'image')
            return `<div class="dlx-ov ${sel ? 'sel' : ''}" data-id="${o.id}" style="${pos};width:${o.w * 100}%;opacity:${st.tools.xray ? 0.35 : o.op};${o.hidden ? 'display:none' : ''}"><img src="/api/library/${o.imgId}/file" alt="" draggable="false"><i class="dlx-h" data-h="1"></i></div>`;
          const sty = [
            `font-size:${o.size * H}px`,
            `color:${o.color}`,
            `font-family:'${o.font}',Arial,sans-serif`,
            'font-weight:normal', // o peso vem da fonte
            o.italic ? 'font-style:italic' : '',
            o.box
              ? `background:${o.box.color}${Math.round((1 - o.box.alpha) * 255)
                  .toString(16)
                  .padStart(2, '0')};padding:.15em .45em;border-radius:6px`
              : '',
            o.outline && !o.box
              ? `-webkit-text-stroke:${o.outline.w * 2 * (H / 1080)}px ${o.outline.color};paint-order:stroke fill`
              : '',
          ]
            .filter(Boolean)
            .join(';');
          return `<div class="dlx-ov dlx-ovt ${sel ? 'sel' : ''}" data-id="${o.id}" style="${pos};${o.hidden ? 'display:none;' : ''}opacity:${st.tools.xray ? 0.35 : 1}"><span style="${sty}">${esc(o.upper ? o.text.toUpperCase() : o.text)}</span><i class="dlx-h" data-h="1"></i></div>`;
        })
        .join('');
      drawSafe();
      refreshBar();
      updateOvVisibility();
    }
    // Área segura: no vertical, o Instagram, o TikTok e o YouTube cobrem o topo, a base e a lateral direita com
    // botões e textos. As guias mostram essas faixas, o centro e os terços. Os números valem para o 9:16.
    const SAFE = { top: 0.12, bottom: 0.22, right: 0.14, left: 0.04 };
    const safeOn = () => st.format === '9:16';
    function drawSafe() {
      let el = $('.dlx-safe', stage);
      if (!el) {
        el = document.createElement('div');
        el.className = 'dlx-safe';
        stage.insertBefore(el, guides);
      }
      if (!st.tools.guides || isAud) {
        el.innerHTML = '';
        return;
      }
      const z = safeOn()
        ? `<b class="sz" style="top:0;left:0;right:0;height:${SAFE.top * 100}%"><em>Coberto pelo nome do perfil</em></b>
           <b class="sz" style="bottom:0;left:0;right:0;height:${SAFE.bottom * 100}%"><em>Coberto pela descrição e pelo áudio</em></b>
           <b class="sz" style="top:${SAFE.top * 100}%;bottom:${SAFE.bottom * 100}%;right:0;width:${SAFE.right * 100}%"><em>Botões</em></b>`
        : `<b class="sm" style="inset:5%"></b>`;
      el.innerHTML = `${z}<i class="ax v" style="left:50%"></i><i class="ax h" style="top:50%"></i><i class="th v" style="left:33.33%"></i><i class="th v" style="left:66.67%"></i><i class="th h" style="top:33.33%"></i><i class="th h" style="top:66.67%"></i>`;
    }
    // pontos onde o ímã encaixa: centro, bordas de 10% e, no vertical, a beira da área segura
    const snapX = () => [0.5, 0.1, 0.9, ...(safeOn() ? [SAFE.left, 1 - SAFE.right] : [])];
    const snapY = () => [0.5, 0.1, 0.9, ...(safeOn() ? [SAFE.top, 1 - SAFE.bottom] : [])];

    /* ----- arrastar a legenda na prévia: muda a posição (topo, meio, base) e a distância da borda ----- */
    capEl.addEventListener('pointerdown', (e) => {
      if (!st.cap.on) return;
      e.preventDefault();
      e.stopPropagation();
      const r = stage.getBoundingClientRect(),
        c = capEl.getBoundingClientRect();
      const cd = { r, y0: e.clientY, top: (c.top - r.top) / r.height, h: c.height / r.height, moved: false };
      capEl.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dy = (ev.clientY - cd.y0) / r.height;
        if (!cd.moved && Math.abs(dy) < 0.01) return;
        cd.moved = true;
        let top = clamp(cd.top + dy, 0, 1 - cd.h);
        const mid = top + cd.h / 2,
          gs = [];
        let pos, margin;
        if (st.tools.snap && Math.abs(mid - 0.5) < 0.03) {
          pos = 'middle';
          margin = st.cap.margin;
          gs.push(0.5);
        } else if (mid < 0.5) {
          pos = 'top';
          margin = top * 100;
        } else {
          pos = 'bottom';
          margin = (1 - top - cd.h) * 100;
        }
        if (pos !== 'middle') {
          if (st.tools.snap)
            for (const g of [
              ...new Set([...snapY().map((y) => (y < 0.5 ? y : 1 - y)), st.format === '9:16' ? 0.14 : 0.08]),
            ])
              if (Math.abs(margin / 100 - g) < 0.012) {
                margin = g * 100;
                gs.push(pos === 'top' ? g : 1 - g);
              }
          margin = clamp(Math.round(margin), 0, 40);
        }
        st.cap.pos = pos;
        st.cap.margin = pos === 'middle' ? st.cap.margin : margin;
        paintCap();
        guides.innerHTML = gs.map((g) => `<i class="gh" style="top:${g * 100}%"></i>`).join('');
      };
      const up = () => {
        capEl.removeEventListener('pointermove', move);
        capEl.removeEventListener('pointerup', up);
        capEl.removeEventListener('pointercancel', up);
        guides.innerHTML = '';
        if (cd.moved) {
          commit();
          if (st.panel === 'legendas') drawDrawer();
        } else {
          // um clique na legenda abre a gaveta Legendas, já em Personalizar
          st.panel = 'legendas';
          st.tab = 'personalizar';
          drawDrawer();
          layoutStage();
        }
      };
      capEl.addEventListener('pointermove', move);
      capEl.addEventListener('pointerup', up);
      capEl.addEventListener('pointercancel', up);
    });
    function updateOvVisibility() {
      const t = relT();
      $$('.dlx-ov', ovsEl).forEach((e) => {
        const o = ovById(e.dataset.id);
        if (!o) return;
        const show = visibleAt(o, t),
          was = e.style.display !== 'none';
        e.style.display = show ? '' : 'none';
        // entrada animada (gaveta Impacto / Texto): roda de novo cada vez que o texto aparece tocando
        if (show && !was && !v.paused && o.anim && o.anim !== 'none') shared.playAnim(e, o.anim);
      });
    }
    // arrastar / redimensionar
    let drag = null;
    ovsEl.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.dlx-ov');
      if (!el) return;
      const o = ovById(el.dataset.id);
      st.sel = o.id;
      e.preventDefault();
      e.stopPropagation();
      $$('.dlx-ov', ovsEl).forEach((x) => x.classList.toggle('sel', x === el));
      const r = stage.getBoundingClientRect();
      drag = {
        o,
        el,
        resize: !!e.target.dataset.h,
        r,
        x0: e.clientX,
        y0: e.clientY,
        ox: o.x,
        oy: o.y,
        ow: o.w,
        os: o.size,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
      if (st.panel === 'midia' || st.panel === 'texto' || st.panel === 'camadas') drawDrawer();
    });
    ovsEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { o, el, r } = drag,
        dx = (e.clientX - drag.x0) / r.width,
        dy = (e.clientY - drag.y0) / r.height;
      drag.moved = true;
      guides.innerHTML = '';
      if (drag.resize) {
        if (o.type === 'image') {
          o.w = clamp(drag.ow + dx * 2, 0.04, 1);
          el.style.width = o.w * 100 + '%';
        } else {
          o.size = clamp(drag.os + dy * 0.6, 0.02, 0.3);
          const sp = $('span', el);
          if (sp) sp.style.fontSize = o.size * (stage.clientHeight || 1) + 'px';
        }
        return;
      }
      let nx = clamp(drag.ox + dx, 0, 1),
        ny = clamp(drag.oy + dy, 0, 1);
      const gs = [];
      if (st.tools.snap) {
        for (const g of snapX())
          if (Math.abs(nx - g) < 0.015) {
            nx = g;
            gs.push(['v', g]);
          }
        for (const g of snapY())
          if (Math.abs(ny - g) < 0.015) {
            ny = g;
            gs.push(['h', g]);
          }
      }
      o.x = nx;
      o.y = ny;
      el.style.left = nx * 100 + '%';
      el.style.top = ny * 100 + '%';
      guides.innerHTML = gs
        .map(([k, g]) => `<i class="${k === 'v' ? 'gv' : 'gh'}" style="${k === 'v' ? 'left' : 'top'}:${g * 100}%"></i>`)
        .join('');
    });
    const endDrag = () => {
      if (!drag) return;
      const m = drag.moved;
      drag = null;
      guides.innerHTML = '';
      if (m) commit();
    };
    ovsEl.addEventListener('pointerup', endDrag);
    ovsEl.addEventListener('pointercancel', endDrag);
    // Quanto o vídeo sobra para fora do quadro (em px da prévia), nos dois sentidos. Sem recorte, nada sobra.
    const overflow = () => {
      const f = fmtObj();
      if (!f[2] || !v.videoWidth || !v.videoHeight) return { x: 0, y: 0 };
      const W = stage.clientWidth,
        H = stage.clientHeight,
        k = Math.max(W / v.videoWidth, H / v.videoHeight); // object-fit: cover
      return { x: Math.max(0, v.videoWidth * k - W), y: Math.max(0, v.videoHeight * k - H) };
    };
    const canPan = () => {
      const o = overflow();
      return o.x > 1 || o.y > 1;
    };
    // Clicar no vídeo toca ou pausa. Arrastar (nos formatos que recortam, como o 9:16) move o enquadramento:
    // o vídeo acompanha o dedo/mouse, e o que fica no quadro é o que sai no arquivo.
    stage.addEventListener('pointerdown', (e) => {
      const onPlay = e.target.closest('#dx-play');
      if (e.target.closest('.dlx-ov') || (onPlay && !canPan())) return;
      if (st.sel) {
        st.sel = null;
        renderOverlays();
        if (['midia', 'texto', 'camadas'].includes(st.panel)) drawDrawer();
      }
      if (isAud || !canPan()) return toggle();
      e.preventDefault();
      const of = overflow(),
        c0 = { ...(st.crop || { x: 0.5, y: 0.5 }) },
        x0 = e.clientX,
        y0 = e.clientY;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - x0,
          dy = ev.clientY - y0;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) stage.classList.add('panning');
        moved = true;
        st.crop = {
          x: of.x > 1 ? clamp(c0.x - dx / of.x, 0, 1) : c0.x,
          y: of.y > 1 ? clamp(c0.y - dy / of.y, 0, 1) : c0.y,
        };
        v.style.objectPosition = `${st.crop.x * 100}% ${st.crop.y * 100}%`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        stage.classList.remove('panning');
        if (!moved) return onPlay ? undefined : toggle(); // no botão, quem toca é o clique dele
        shared.panned = true;
        setTimeout(() => (shared.panned = false), 0);
        st.crop = { x: +st.crop.x.toFixed(3), y: +st.crop.y.toFixed(3) };
        commit();
        if (shared.drawLeft) shared.drawLeft();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    const addOverlay = (o) => {
      st.overlays.push({ id: rid(), x: 0.5, y: 0.5, start: null, end: null, hidden: false, ...o });
      st.sel = st.overlays[st.overlays.length - 1].id;
      commit();
      renderOverlays();
      drawDrawer();
    };
    const delOverlay = (id) => {
      st.overlays = st.overlays.filter((o) => o.id !== id);
      if (st.sel === id) st.sel = null;
      commit();
      renderOverlays();
      drawDrawer();
    };

    /* ----- barra de ferramentas da prévia ----- */
    const TB = [
      ['undo', 'Desfazer', '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>'],
      ['redo', 'Refazer', '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3"/>'],
      ['snap', 'Ímã: encaixar nas guias', '<path d="M6 3v8a6 6 0 0012 0V3M6 7h4M14 7h4"/>'],
      [
        'xray',
        'Raio-X: ver o que está embaixo (X)',
        '<circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/>',
      ],
      [
        'guides',
        'Guias: centro, terços e a área que o Instagram/TikTok cobre no vertical (G)',
        '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 7h16M4 16h16M12 3v18"/>',
      ],
      [
        'center',
        'Centralizar o texto ou a imagem selecionada (1º clique: na horizontal; 2º: no meio do quadro)',
        '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
      ],
      [
        'keys',
        'Atalhos do teclado',
        '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
      ],
    ];
    $('#dx-tools', root).innerHTML = TB.map(
      (b) =>
        `<button data-t="${b[0]}" aria-label="${b[1]}" title="${b[1]}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${b[2]}</svg></button>`,
    ).join('');
    function refreshBar() {
      const sb = $('#dx-save', root);
      if (sb) {
        const d = dirty();
        sb.textContent = d ? 'Salvar edição' : clip.editor ? '✓ Edição salva' : 'Salvar edição';
        sb.disabled = !d;
        sb.style.opacity = d ? 1 : 0.6;
      }
      const b = (k) => $(`[data-t="${k}"]`, root);
      if (!b('undo')) return;
      b('undo').disabled = st.hist.length < 2;
      b('redo').disabled = !st.fut.length;
      ['snap', 'xray', 'guides'].forEach((k) => {
        b(k).classList.toggle('on', !!st.tools[k]);
        b(k).setAttribute('aria-pressed', !!st.tools[k]);
      });
      b('center').classList.toggle('dim', !st.sel);
      const n = st.overlays.filter((o) => o.type === 'image').length;
      $('#dx-media', root).textContent = `Mídia: ${n}`;
      $('#dx-chip', root).textContent = isAud ? 'só áudio' : st.cap.on ? 'com legendas' : 'sem legendas';
      $('#dx-q', root).textContent = `“${segsIn()
        .map((s) => s.text)
        .join(
          ' ',
        )}” · ${tm(outD())}${st.speed !== 1 ? ` em ${spTxt(st.speed)} (original: ${tm(D())})` : Math.abs(outD() - D()) >= 0.05 ? ` (original: ${tm(D())})` : ''}`;
    }
    const shortcuts = () => {
      const m = document.createElement('div');
      m.className = 'modal-bg';
      m.style.zIndex = 130;
      m.innerHTML = `<div class="modal"><h3>Atalhos do teclado</h3><p>Valem com o editor aberto.</p><table class="tbl"><tr><td><b>Espaço</b></td><td>Reproduzir / pausar</td></tr><tr><td><b>Ctrl+Z</b> · <b>Ctrl+Y</b></td><td>Desfazer · refazer</td></tr><tr><td><b>Setas</b></td><td>Mover o item selecionado (Shift = passo maior)</td></tr><tr><td><b>Delete</b></td><td>Excluir o item selecionado</td></tr><tr><td><b>X</b></td><td>Raio-X (clareia textos e legenda para ver o vídeo embaixo)</td></tr><tr><td><b>G</b></td><td>Guias (centro, terços e a área coberta pelas redes no vertical)</td></tr><tr><td><b>Arrastar a legenda</b></td><td>Muda a posição dela. Um clique abre o estilo</td></tr><tr><td><b>Esc</b></td><td>Desmarcar · fechar</td></tr></table><div class="ft"><button class="ap-btn pri" data-x>Fechar</button></div></div>`;
      document.body.appendChild(m);
      m.onclick = (e) => {
        if (e.target === m || e.target.dataset.x !== undefined) m.remove();
      };
    };
    $('#dx-tools', root).onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const k = b.dataset.t;
      if (k === 'undo') undo();
      else if (k === 'redo') redo();
      else if (k === 'keys') shortcuts();
      else if (k === 'center') {
        const o = ovById(st.sel);
        if (!o) return toast('Clique num texto ou numa imagem no vídeo e depois em Centralizar.');
        if (Math.abs(o.x - 0.5) > 0.001) o.x = 0.5;
        else o.y = 0.5;
        commit();
        renderOverlays();
      } else {
        st.tools[k] = !st.tools[k];
        renderOverlays();
        paintCap();
        if (k === 'snap')
          toast(st.tools.snap ? 'Ímã ligado: textos e legenda encaixam no centro e nas guias.' : 'Ímã desligado.');
      }
    };

    Object.assign(shared, {
      syLabel,
      asy,
      layoutStage,
      tickUI,
      runSyTest,
      runAutoSync,
      ovById,
      delOverlay,
      approx,
      gone,
      goStart,
      addOverlay,
      closeSyTest,
      toggle,
    });
  };
})();
