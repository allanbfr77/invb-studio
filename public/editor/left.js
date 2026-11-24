/* INVB Studio — editor do corte: o painel da esquerda (formato, imagem, velocidade, sincronia, remover trecho e remover música).
   Parte de public/editor/editor.js; recebe o objeto "shared" com o estado e as funções das outras partes. */
(function () {
  const { $, FORMATS, FORMAT_ICON, $$ } = window.ClipEditorParts.base;

  window.ClipEditorParts.left = function (shared) {
    const {
      st,
      outD,
      D,
      tm,
      root,
      isAud,
      esc,
      fmtObj,
      outSize,
      syLabel,
      ctx,
      api,
      asy,
      upload,
      commit,
      layoutStage,
      v,
      toast,
      removedIn,
      paintCap,
      tickUI,
      refreshBar,
      runSyTest,
      runAutoSync,
    } = shared;
    Object.assign(shared, { drawLeft });

    /* ----- painel esquerdo (sempre visível) ----- */
    // Momento com décimos (0:12,5), para digitar e conferir o ponto exato de um trecho.
    const tmx = (s) => {
      s = Math.max(0, Math.round((s || 0) * 10) / 10);
      const m = Math.floor(s / 60),
        x = s - m * 60;
      return m + ':' + (x < 10 ? '0' : '') + x.toFixed(1).replace('.', ',');
    };
    const parseTx = (t) => {
      t = String(t || '')
        .trim()
        .replace(/,/g, '.');
      if (!t || !/^(\d+:){0,2}\d+(\.\d+)?$/.test(t)) return NaN;
      return t.split(':').reduce((a, n) => a * 60 + +n, 0);
    };
    const cutList = () => st.removed.filter((r) => r[2]).sort((p, q) => p[0] - q[0]);
    const durTxt = () =>
      Math.abs(outD() - D()) < 0.05
        ? `Duração do corte: ${tm(D())}`
        : `Duração do corte: ${tm(outD())} (era ${tm(D())})`;
    const spLabel = (x) => String(+(+x).toFixed(2)).replace('.', ',') + 'x';
    const sw = (id, on) => `<button class="dlx-sw" role="switch" aria-checked="${on}" id="${id}"></button>`;
    function drawLeft() {
      const L = $('#dx-left', root);
      // Painel em seções que abrem e fecham. Fechada, cada seção mostra o valor atual à direita do título.
      const sec = (key, title, value, body, valueId) =>
        `<details class="dlx-sec" data-sec="${key}"${st.open[key] ? ' open' : ''}><summary><span class="dlx-sect">${title}</span><${valueId ? 'output' : 'span'} class="dlx-secv"${valueId ? ` id="${valueId}"` : ''}>${value}</${valueId ? 'output' : 'span'}></summary><div class="dlx-secb">${body}</div></details>`;
      const nCuts = cutList().length;
      // Enquadramento: só quando o formato recorta o vídeo. Vídeo mais largo que o quadro anda para os lados;
      // mais alto, para cima e para baixo.
      const f = fmtObj(),
        vr = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9,
        fr = f[2] ? f[2] / f[3] : vr,
        axis = !f[2] || Math.abs(vr - fr) < 0.01 ? null : vr > fr ? 'x' : 'y',
        cr = st.crop || { x: 0.5, y: 0.5 },
        cv = axis ? cr[axis] : 0.5,
        ends = axis === 'x' ? ['Esquerda', 'Centro', 'Direita'] : ['Topo', 'Centro', 'Base'];
      const cropTxt = (x) =>
        (x <= 0 ? ends[0] : x >= 1 ? ends[2] : x === 0.5 ? 'centro' : Math.round(x * 100) + '%').toLowerCase();
      const isDef = !!(st.prefs && st.prefs.format === st.format);
      const frame = axis
        ? `<label class="dlx-lab" for="dx-crop">Enquadramento <small id="dx-cropv">${cropTxt(cv)}</small></label>
          <input type="range" id="dx-crop" class="dlx-sp" min="0" max="1" step="0.01" value="${cv}" aria-label="Enquadramento">
          <div class="dlx-spb">${[0, 0.5, 1].map((x, i) => `<button data-crop="${x}" aria-pressed="${Math.abs(cv - x) < 0.005}">${ends[i]}</button>`).join('')}</div>
          <p class="dlx-hint">Ou <b>arraste o vídeo na prévia</b> até o pregador ficar onde quer. Vale para o corte inteiro.</p>`
        : '';
      L.innerHTML = [
        isAud
          ? ''
          : sec(
              'fmt',
              'Formato',
              esc(fmtObj()[1]),
              `<div class="dlx-fmts">${FORMATS.map((f) => `<button class="dlx-fmt" data-f="${f[0]}" aria-pressed="${st.format === f[0]}"><span class="ic"><i style="width:${FORMAT_ICON[f[0]][0]}px;height:${FORMAT_ICON[f[0]][1]}px"></i></span>${f[1]}</button>`).join('')}</div>
          <p class="dlx-sub">${st.format === 'orig' ? 'Sai no tamanho original do vídeo' : 'Recorta o vídeo · ' + outSize()}</p>
          ${frame}
          <label class="dlx-check" style="margin-top:10px"><input type="checkbox" id="dx-fdef" ${isDef ? 'checked' : ''}> Usar ${esc(fmtObj()[1])} nos cortes novos</label>`,
            ),
        isAud
          ? ''
          : sec(
              'img',
              'Imagem',
              [st.bw ? 'P&B' : 'Colorido', st.hq ? 'alta' : ''].filter(Boolean).join(' · '),
              `
          <div class="dlx-row"><div><b>Preto e branco</b><small>Deixa o vídeo em tons de cinza.</small></div>${sw('dx-bw', st.bw)}</div>
          <div class="dlx-row"><div><b>Preservar qualidade</b><small>Arquivo maior e exportação mais lenta. Bom para levar ao CapCut.</small></div>${sw('dx-hq', st.hq)}</div>`,
            ),
        sec(
          'sp',
          'Velocidade',
          spLabel(st.speed),
          `<small id="dx-spd" class="dlx-spd">${durTxt()}</small>
          <input type="range" id="dx-sp" class="dlx-sp" min="0.5" max="2" step="0.05" value="${st.speed}" aria-label="Velocidade">
          <div class="dlx-spb g3">${[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => `<button data-sp="${x}" aria-pressed="${st.speed === x}">${spLabel(x)}</button>`).join('')}</div>
          <p class="dlx-hint">O tom da voz não muda. A prévia acompanha.</p>`,
          'dx-spv',
        ),
        isAud
          ? ''
          : sec(
              'sy',
              'Sincronia do áudio',
              syLabel(st.sync),
              `<input type="range" id="dx-sy" class="dlx-sp" min="-2" max="2" step="0.01" value="${st.sync}" aria-label="Sincronia do áudio">
          <div class="dlx-spb sy">${[
            [-0.1, '−0,1 s'],
            [0.1, '+0,1 s'],
            [-0.01, '−0,01 s'],
            [0.01, '+0,01 s'],
            [0, 'Zerar'],
          ]
            .map(
              (x) =>
                `<button title="${x[0] ? (x[0] > 0 ? 'Atrasar o som em ' : 'Adiantar o som em ') + x[1].slice(1) : 'Voltar ao áudio original'}" data-sy="${x[0]}">${x[1]}</button>`,
            )
            .join('')}</div>
          <button class="dlx-sytgo" id="dx-syt">▶ Testar o ajuste (8 s)</button>
          ${ctx.autosync ? `<button class="dlx-sytgo" id="dx-asy"${asy.busy ? ' disabled' : ''}>${asy.busy ? 'Medindo boca e som… (1 a 2 min)' : '✨ Detectar automaticamente'}</button>${asy.msg ? `<p class="dlx-hint dlx-asr ${asy.kind}" id="dx-asr" role="status">${esc(asy.msg)}</p>` : ''}` : '<p class="dlx-hint">Para detectar o atraso sozinho, rode uma vez o arquivo <code>install/instalar-autosync</code> e abra o app de novo.</p>'}
          <p class="dlx-hint">Som depois da boca: vá para a esquerda. Som antes: para a direita. A prévia ao lado não muda; use Testar.${upload.audioShift ? ` A pregação já tem ajuste de ${syLabel(upload.audioShift)} (botão Sincronia, em Cortes); este controle soma a ele.` : ''}</p>`,
              'dx-syv',
            ),
        sec(
          'cut',
          'Remover trecho',
          nCuts ? nCuts + (nCuts === 1 ? ' removido' : ' removidos') : 'Nenhum',
          `
          <p class="dlx-hint">Pare o vídeo no começo do trecho e marque. Depois pare no fim e marque de novo.</p>
          <div class="dlx-spb" style="margin-bottom:12px"><button id="dx-ca" aria-pressed="${st.cutA !== null}">${st.cutA === null ? 'Marcar início' : 'Início: ' + tmx(st.cutA - st.start)}</button><button id="dx-cb" ${st.cutA === null ? 'disabled' : ''}>Marcar fim</button></div>
          <p class="dlx-hint">Ou digite o momento exato, contado do começo do corte (ex.: <code>0:12,5</code>).</p>
          <div class="dlx-cutx"><label>Início<input id="dx-cxa" inputmode="decimal" autocomplete="off" placeholder="0:00,0" value="${st.cutA === null ? '' : tmx(st.cutA - st.start)}"></label><label>Fim<input id="dx-cxb" inputmode="decimal" autocomplete="off" placeholder="0:00,0"></label><button id="dx-cxg">Remover</button></div>
          ${
            nCuts
              ? `<ul class="dlx-cuts">${cutList()
                  .map(
                    (r) =>
                      `<li><span>${tmx(r[0] - st.start)} → ${tmx(r[1] - st.start)} <small>(${(r[1] - r[0]).toFixed(1).replace('.', ',')} s)</small></span><button data-cx="${r[0]}" aria-label="Desfazer a remoção deste trecho" title="Devolver este trecho ao corte">✕</button></li>`,
                  )
                  .join('')}</ul>`
              : ''
          }`,
        ),
        sec(
          'mu',
          'Remover música',
          !ctx.voiceAI ? 'Não instalado' : st.voice === 'ia' ? 'Ligado' : 'Desligado',
          `
          <div class="dlx-row"><div><b>Deixar só a voz</b><small>Tira a música de fundo com IA, no seu computador. A exportação demora mais e o efeito não aparece na prévia.</small></div><button class="dlx-sw" role="switch" aria-checked="${st.voice === 'ia'}" id="dx-mu"${ctx.voiceAI ? '' : ' disabled title="Precisa instalar a remoção de música neste computador"'}></button></div>
          ${ctx.voiceAI ? '' : '<p class="dlx-hint">Para liberar, rode uma vez o arquivo <code>install/instalar-voz-ia</code> e abra o app de novo.</p>'}`,
        ),
      ].join('');
      $$('details[data-sec]', L).forEach((d) =>
        d.addEventListener('toggle', () => {
          st.open[d.dataset.sec] = d.open;
        }),
      );
      $$('[data-f]', L).forEach(
        (b) =>
          (b.onclick = () => {
            st.format = b.dataset.f;
            commit();
            layoutStage();
            drawLeft();
          }),
      );
      const tg = (id, key) => {
        const e = $('#' + id, L);
        if (e)
          e.onclick = () => {
            st[key] = !st[key];
            commit();
            layoutStage();
            drawLeft();
          };
      };
      // enquadramento: arrastando, só a prévia muda; ao soltar, entra no histórico
      const crop = $('#dx-crop', L);
      const setCrop = (x, save) => {
        st.crop = { ...(st.crop || { x: 0.5, y: 0.5 }), [axis]: Math.max(0, Math.min(1, x)) };
        layoutStage();
        const o = $('#dx-cropv', L);
        if (o) o.textContent = cropTxt(st.crop[axis]);
        if (save) {
          commit();
          drawLeft();
        }
      };
      if (crop) {
        crop.oninput = () => setCrop(+crop.value, false);
        crop.onchange = () => setCrop(+crop.value, true);
        $$('[data-crop]', L).forEach((b) => (b.onclick = () => setCrop(+b.dataset.crop, true)));
      }
      const fdef = $('#dx-fdef', L);
      if (fdef)
        fdef.onchange = async () => {
          const format = fdef.checked ? st.format : null;
          try {
            st.prefs = await api('/editor-prefs', { method: 'PATCH', json: { format } });
            toast(
              format
                ? `Os cortes novos vão abrir em ${fmtObj()[1]}.`
                : 'Os cortes novos voltam a abrir no formato original.',
            );
          } catch (e) {
            toast(e.message);
          }
          drawLeft();
        };
      tg('dx-bw', 'bw');
      tg('dx-hq', 'hq');
      const mu = $('#dx-mu', L);
      if (mu && !mu.disabled)
        mu.onclick = () => {
          st.voice = st.voice === 'ia' ? 'off' : 'ia';
          commit();
          drawLeft();
        };
      // Remover trecho: dois cliques (início e fim) na posição atual do vídeo. Os tempos são do vídeo original.
      const ca = $('#dx-ca', L),
        cb = $('#dx-cb', L);
      if (ca)
        ca.onclick = () => {
          st.cutA = st.cutA === null ? Math.max(st.start, Math.min(st.end, v.currentTime || st.start)) : null;
          drawLeft();
        };
      const addCut = (a, b, how) => {
        const x = Math.max(st.start, Math.min(a, b)),
          y = Math.min(st.end, Math.max(a, b));
        if (y - x < 0.3) return toast('O trecho precisa ter pelo menos 0,3 segundo. ' + how);
        if (D() - removedIn(st.start, st.end) - (y - x) + removedIn(x, y) < 1)
          return toast('Assim não sobraria nada do corte.');
        st.removed.push([+x.toFixed(2), +y.toFixed(2), 1]);
        st.cutA = null;
        shared.wordsDirty = true;
        commit();
        paintCap();
        drawLeft();
        tickUI();
        toast('Trecho removido do corte.');
      };
      if (cb) cb.onclick = () => addCut(st.cutA, v.currentTime, 'Avance o vídeo até o fim do trecho e marque de novo.');
      const xa = $('#dx-cxa', L),
        xb = $('#dx-cxb', L),
        xg = $('#dx-cxg', L);
      if (xg) {
        const go = () => {
          const a = parseTx(xa.value),
            b = parseTx(xb.value);
          if (!(a >= 0) || !(b >= 0))
            return toast('Digite o início e o fim como minutos:segundos, por exemplo 0:12,5 e 0:18.');
          if (a > D() || b > D()) return toast('O corte tem ' + tmx(D()) + '. Digite momentos dentro dele.');
          addCut(st.start + a, st.start + b, 'Confira os dois momentos digitados.');
        };
        xg.onclick = go;
        [xa, xb].forEach((i) => {
          i.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') go();
          };
        });
        // mostrar o trecho digitado no player, para conferir antes de remover
        xa.onchange = () => {
          const a = parseTx(xa.value);
          if (a >= 0 && a <= D()) v.currentTime = st.start + a;
        };
        xb.onchange = () => {
          const b = parseTx(xb.value);
          if (b >= 0 && b <= D()) v.currentTime = st.start + b;
        };
      }
      $$('[data-cx]', L).forEach(
        (bt) =>
          (bt.onclick = () => {
            const i = st.removed.findIndex((r) => r[2] && String(r[0]) === bt.dataset.cx);
            if (i >= 0) {
              st.removed.splice(i, 1);
              shared.wordsDirty = true;
              commit();
              paintCap();
              drawLeft();
              tickUI();
            }
          }),
      );
      // Velocidade: de 0,25x a 2x, em passos de 0,05. A prévia toca na mesma velocidade (o navegador mantém o tom da voz).
      const sp = $('#dx-sp', L),
        setSp = (x, redraw) => {
          st.speed = Math.max(0.5, Math.min(2, Math.round(x * 100) / 100));
          v.playbackRate = st.speed;
          $('#dx-spv', L).textContent = spLabel(st.speed);
          $('#dx-spd', L).textContent = durTxt();
          tickUI();
          refreshBar();
          if (redraw) {
            commit();
            drawLeft();
          }
        };
      const sy = $('#dx-sy', L),
        setSy = (x, save) => {
          st.sync = Math.max(-2, Math.min(2, Math.round(x * 100) / 100));
          sy.value = st.sync;
          $('#dx-syv', L).textContent = syLabel(st.sync);
          if (save) commit();
        };
      const syt = $('#dx-syt', L);
      if (syt) syt.onclick = () => runSyTest(syt);
      const asb = $('#dx-asy', L);
      if (asb) asb.onclick = () => runAutoSync(L);
      if (sy) {
        sy.oninput = () => setSy(+sy.value, false);
        sy.onchange = () => setSy(+sy.value, true);
        $$('[data-sy]', L).forEach(
          (b) => (b.onclick = () => setSy(+b.dataset.sy === 0 ? 0 : st.sync + +b.dataset.sy, true)),
        );
      }
      if (sp) {
        sp.oninput = () => setSp(+sp.value, false);
        sp.onchange = () => setSp(+sp.value, true);
        $$('[data-sp]', L).forEach((b) => (b.onclick = () => setSp(+b.dataset.sp, true)));
        v.playbackRate = st.speed;
      }
    }

    Object.assign(shared, { sw });
  };
})();
