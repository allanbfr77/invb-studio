/* INVB Studio — editor do corte: fontes enviadas pela equipe e a gaveta Arte (desenhos feitos com HTML e CSS).
   A arte vira uma imagem PNG transparente, que vai para o vídeo como as imagens da Mídia: o que se vê na prévia é o que sai. */
(function () {
  const CSx = window.CaptionStyles;
  const xh = (url, body, type) =>
    fetch(url, { method: 'POST', headers: { 'x-invb': '1', 'content-type': type }, body }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Falha ao enviar.');
      return j;
    });

  /* ----- fontes da equipe: carregar, mostrar na prévia e enviar ----- */
  const INVBFonts = {
    list: [],
    async load() {
      try {
        const r = await fetch('/api/fonts', { headers: { 'x-invb': '1' } });
        this.list = r.ok ? await r.json() : [];
      } catch {
        this.list = [];
      }
      CSx.setCustomFonts(this.list);
      this.inject();
      return this.list;
    },
    inject() {
      let el = document.getElementById('invb-custom-fonts');
      if (!el) {
        el = document.createElement('style');
        el.id = 'invb-custom-fonts';
        document.head.appendChild(el);
      }
      el.textContent = this.list
        .map(
          (f) =>
            `@font-face{font-family:'${f.name}';src:url(/api/fonts/${f.id}/file) format('${f.ext === '.otf' ? 'opentype' : 'truetype'}');font-weight:normal;font-style:normal;font-display:swap}`,
        )
        .join('\n');
    },
    async upload(file) {
      if (!/\.(ttf|otf)$/i.test(file.name)) throw new Error('Use um arquivo .ttf ou .otf.');
      if (file.size > 10 * 1048576) throw new Error('Máximo de 10 MB.');
      const it = await xh('/api/fonts?name=' + encodeURIComponent(file.name), file, 'application/octet-stream');
      await this.load();
      return it;
    },
    async remove(id) {
      const r = await fetch('/api/fonts/' + id, { method: 'DELETE', headers: { 'x-invb': '1' } });
      if (!r.ok) throw new Error('Não consegui excluir a fonte.');
      await this.load();
    },
    /** <option>s do seletor de fonte: as do app e, num grupo à parte, as enviadas pela equipe. */
    options(cur, withNote) {
      const esc = (s) =>
        String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      const opt = (f) =>
        `<option value="${esc(f.name)}" ${f.name === cur ? 'selected' : ''}>${esc(f.name)}${withNote && f.note ? ' · ' + esc(f.note) : ''}</option>`;
      const mine = CSx.customFonts();
      return `<optgroup label="Fontes do app">${CSx.FONT_LIST.map(opt).join('')}</optgroup>${mine.length ? `<optgroup label="Fontes da equipe">${mine.map(opt).join('')}</optgroup>` : ''}`;
    },
    /** Todas as fontes com o endereço do arquivo (para embutir na arte). */
    files() {
      return [
        ...CSx.FONT_LIST.flatMap((f) => [
          { name: f.name, url: '/fonts/' + f.file, style: 'normal' },
          ...(f.italic ? [{ name: f.name, url: '/fonts/' + f.italic, style: 'italic' }] : []),
        ]),
        ...this.list.map((f) => ({ name: f.name, url: `/api/fonts/${f.id}/file`, style: 'normal' })),
      ];
    },
  };
  window.INVBFonts = INVBFonts;

  /* ----- artes prontas para começar (dá para mudar tudo depois) ----- */
  const STARTERS = [
    {
      name: 'Faixa com nome',
      w: 1000,
      h: 220,
      html: '<div class="faixa">\n  <div class="nome">Pr. Nome Sobrenome</div>\n  <div class="cargo">Nova Vida Botafogo</div>\n</div>',
      css: `.faixa {
  position: absolute; left: 0; bottom: 20px;
  background: #231c47; color: #fff;
  border-left: 18px solid #f0b93a;
  padding: 26px 48px; border-radius: 0 18px 18px 0;
}
.nome { font-family: 'Montserrat ExtraBold'; font-size: 62px; }
.cargo { font-family: 'Poppins SemiBold'; font-size: 34px; color: #f0b93a; }`,
    },
    {
      name: 'Selo redondo',
      w: 420,
      h: 420,
      html: '<div class="selo"><span>PALAVRA<br>DE HOJE</span></div>',
      css: `.selo {
  width: 400px; height: 400px; margin: 10px;
  border-radius: 50%; background: #f0b93a;
  border: 14px solid #fff; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  transform: rotate(-8deg);
}
.selo span {
  font-family: 'Anton'; font-size: 78px; line-height: 1;
  color: #231c47; text-align: center;
}`,
    },
    {
      name: 'Moldura dourada',
      w: 1080,
      h: 1920,
      html: '<div class="moldura"></div>\n<div class="marca">NOVA VIDA BOTAFOGO</div>',
      css: `.moldura {
  position: absolute; inset: 36px;
  border: 10px solid #f0b93a; border-radius: 40px;
}
.marca {
  position: absolute; left: 0; right: 0; top: 70px;
  text-align: center; color: #fff; letter-spacing: 8px;
  font-family: 'Montserrat ExtraBold'; font-size: 38px;
}`,
    },
    {
      name: 'Cartão de versículo',
      w: 960,
      h: 520,
      html: '<div class="cartao">\n  <p>“O Senhor é o meu pastor; nada me faltará.”</p>\n  <b>SALMOS 23:1</b>\n</div>',
      css: `.cartao {
  margin: 20px; padding: 56px 60px;
  background: rgba(255,255,255,.92); border-radius: 36px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
}
p { margin: 0 0 26px; font-family: 'DM Serif Display'; font-size: 64px; line-height: 1.15; color: #231c47; }
b { font-family: 'Montserrat ExtraBold'; font-size: 34px; color: #c48a12; letter-spacing: 4px; }`,
    },
    {
      name: 'Seta de destaque',
      w: 600,
      h: 260,
      html: '<div class="seta">OUÇA ISSO</div>',
      css: `.seta {
  position: absolute; left: 10px; top: 30px;
  height: 200px; width: 520px; box-sizing: border-box;
  background: #f0b93a; color: #231c47;
  font-family: 'Archivo Black'; font-size: 64px;
  display: flex; align-items: center; padding-left: 40px;
  clip-path: polygon(0 0, 80% 0, 100% 50%, 80% 100%, 0 100%);
}`,
    },
  ];

  /* ----- da arte (HTML + CSS) para uma imagem PNG transparente ----- */
  const clean = (html) =>
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const blobB64 = (b) =>
    new Promise((ok, err) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = err;
      r.readAsDataURL(b);
    });
  const fontCache = new Map();
  /** @font-face com as fontes usadas pela arte, embutidas (a imagem não busca arquivos de fora). */
  async function embeddedFonts(code) {
    const low = code.toLowerCase();
    const used = INVBFonts.files().filter((f) => low.includes(f.name.toLowerCase()));
    const rules = [];
    for (const f of used) {
      if (!fontCache.has(f.url))
        fontCache.set(
          f.url,
          fetch(f.url)
            .then((r) => r.blob())
            .then(blobB64)
            .catch(() => null),
        );
      const data = await fontCache.get(f.url);
      if (data)
        rules.push(
          `@font-face{font-family:'${f.name}';src:url(${data.replace(/^data:[^;,]*/, 'data:font/ttf')});font-style:${f.style};font-weight:normal}`,
        );
    }
    return rules.join('\n');
  }
  const frameDoc = (a, fontCss) =>
    `<style>${fontCss}\nhtml,body{margin:0;background:transparent}#arte{position:relative;overflow:hidden;width:${a.w}px;height:${a.h}px;font-family:'Poppins ExtraBold',sans-serif;color:#fff}#arte *{box-sizing:border-box}\n${a.css}</style><div id="arte">${clean(a.html)}</div>`;
  /** Desenha a arte num canvas do tamanho dela e devolve um PNG transparente. */
  async function rasterize(a) {
    const fontCss = await embeddedFonts(a.css + ' ' + a.html);
    const box = document.createElement('div');
    box.innerHTML = frameDoc(a, fontCss);
    const xhtml = new XMLSerializer().serializeToString(box);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = a.w;
    cv.height = a.h;
    const g = cv.getContext('2d');
    // o Safari às vezes só aplica as fontes no segundo desenho
    g.drawImage(img, 0, 0);
    await new Promise((r) => setTimeout(r, 120));
    g.clearRect(0, 0, a.w, a.h);
    g.drawImage(img, 0, 0);
    try {
      return await new Promise((ok, err) => cv.toBlob((b) => (b ? ok(b) : err(new Error('vazio'))), 'image/png'));
    } catch {
      throw new Error('Este navegador não deixou transformar a arte em imagem. Tente no Chrome.');
    }
  }

  window.ClipEditorParts.arte = function (shared) {
    const { $, $$ } = window.ClipEditorParts.base;
    const { st, esc, api, toast, commit, renderOverlays, v } = shared;
    const drawDrawer = (...x) => shared.drawDrawer(...x);
    const fmtW = () => {
      const f = shared.fmtObj();
      return f[2] || v.videoWidth || 1080;
    };
    const blank = () => ({
      id: null,
      name: 'Minha arte',
      w: 1000,
      h: 300,
      html: '<div class="caixa">Texto</div>',
      css: ".caixa {\n  font-family: 'Anton'; font-size: 90px; color: #f0b93a;\n}",
    });
    const loadArts = () =>
      api('/arts')
        .then((l) => {
          st.arts = l;
          if (st.panel === 'arte') drawDrawer();
        })
        .catch(() => {
          st.arts = [];
        });

    function panel() {
      if (st.arts === undefined || st.arts === null) {
        st.arts = null;
        loadArts();
      }
      const a = (st.artDraft = st.artDraft || blank());
      const mine = st.arts || [];
      const sizes = [
        [fmtW(), 300, 'Faixa'],
        [
          fmtW(),
          Math.round(fmtW() / (shared.fmtObj()[2] ? shared.fmtObj()[2] / shared.fmtObj()[3] : 16 / 9)),
          'Tela inteira',
        ],
        [500, 500, 'Quadrado'],
      ];
      return `<h3>Arte</h3><p class="dlx-sub" style="margin-top:0">Desenhe com <b>HTML e CSS</b>: faixas, selos, molduras, setas. A arte vira uma imagem transparente sobre o vídeo, igual à prévia.</p>
        <h4>Minhas artes</h4>
        <div class="dlx-grid">${
          mine
            .map(
              (x) =>
                `<div class="dlx-card art" data-art="${esc(x.id)}" role="button" tabindex="0" title="Adicionar ao vídeo"><button class="x" data-art-del="${esc(x.id)}" aria-label="Excluir a arte ${esc(x.name)}" title="Excluir">✕</button><button class="star" data-art-edit="${esc(x.id)}" aria-label="Editar a arte ${esc(x.name)}" title="Editar o código">✎</button><div class="pv chk">${x.imgId ? `<img src="/api/library/${esc(x.imgId)}/file" alt="">` : ''}</div><span>${esc(x.name)}</span></div>`,
            )
            .join('') ||
          (st.arts === null
            ? '<p class="dlx-sub">Carregando…</p>'
            : '<p class="dlx-sub" style="grid-column:1/-1;margin:0">Nenhuma ainda. Comece por um modelo abaixo ou escreva a sua.</p>')
        }</div>
        <h4>Começar de um modelo</h4>
        <div class="dlx-chips">${STARTERS.map((s, i) => `<button data-art-start="${i}">${esc(s.name)}</button>`).join('')}<button data-art-start="new">Em branco</button></div>
        <h4>${a.id ? 'Editando: ' + esc(a.name) : 'Nova arte'}</h4>
        <label class="dlx-lab" for="art-name">Nome</label><input id="art-name" class="dlx-input" maxlength="60" value="${esc(a.name)}">
        <div class="dlx-two"><label>Largura (px)<input type="number" id="art-w" min="20" max="3840" value="${a.w}"></label><label>Altura (px)<input type="number" id="art-h" min="20" max="3840" value="${a.h}"></label></div>
        <div class="dlx-chips" style="margin-top:6px">${sizes.map((z) => `<button data-art-size="${z[0]}x${z[1]}">${z[2]} ${z[0]}×${z[1]}</button>`).join('')}</div>
        <p class="dlx-hint">O vídeo tem ${fmtW()} px de largura: uma arte de ${fmtW()} px ocupa a largura toda.</p>
        <div class="dlx-artpv chk" id="art-pv"></div>
        <label class="dlx-lab" for="art-html">HTML</label><textarea id="art-html" class="dlx-code" rows="6" spellcheck="false">${esc(a.html)}</textarea>
        <label class="dlx-lab" for="art-css">CSS</label><textarea id="art-css" class="dlx-code" rows="10" spellcheck="false">${esc(a.css)}</textarea>
        <p class="dlx-hint">Fontes: ${CSx.FONT_LIST.concat(CSx.customFonts())
          .map((f) => `<code>'${esc(f.name)}'</code>`)
          .join(
            ', ',
          )}. Cores da igreja: <code>#f0b93a</code> e <code>#231c47</code>. O fundo fica transparente. Imagens de fora da arte (links) não aparecem: use a gaveta Mídia. Animações não vão para o vídeo.</p>
        <div class="dlx-save">
          <button class="ap-btn pri" id="art-add">${a.id ? 'Salvar e pôr no vídeo' : 'Salvar e adicionar ao vídeo'}</button>
          <button class="ap-btn" id="art-save">${a.id ? 'Salvar alterações' : 'Só salvar'}</button>
          ${a.id ? '<button class="ap-btn" id="art-copy">Salvar como nova</button>' : ''}
        </div>`;
    }

    // atualiza só a prévia (o resto da gaveta não é redesenhado enquanto se digita)
    function preview(dr) {
      const box = $('#art-pv', dr);
      if (!box) return;
      const a = st.artDraft,
        W = box.clientWidth || 320,
        k = Math.min(1, W / a.w, 260 / a.h);
      const fonts = INVBFonts.files()
        .map((f) => `@font-face{font-family:'${f.name}';src:url(${f.url});font-style:${f.style};font-weight:normal}`)
        .join('\n');
      let fr = $('iframe', box);
      if (!fr) {
        fr = document.createElement('iframe');
        fr.setAttribute('sandbox', 'allow-same-origin'); // sem scripts
        fr.setAttribute('title', 'Prévia da arte');
        box.appendChild(fr);
      }
      box.style.height = Math.round(a.h * k) + 'px';
      fr.style.cssText = `width:${a.w}px;height:${a.h}px;transform:scale(${k});transform-origin:0 0;border:0;background:transparent`;
      fr.srcdoc = frameDoc(a, fonts);
    }

    async function save(dr, { add, copy }) {
      const a = st.artDraft;
      if (!a.html.trim() && !a.css.trim()) return toast('Escreva o HTML e o CSS da arte.');
      const btns = $$('.dlx-save button', dr);
      btns.forEach((b) => (b.disabled = true));
      try {
        const png = await rasterize(a);
        const img = await xh(
          '/api/library?kind=art&name=' + encodeURIComponent('Arte: ' + a.name + '.png'),
          png,
          'image/png',
        );
        const body = { name: a.name, w: a.w, h: a.h, html: a.html, css: a.css, imgId: img.id };
        const it =
          a.id && !copy
            ? await api('/arts/' + a.id, { method: 'PATCH', json: body })
            : await api('/arts', { json: body });
        st.arts = [...(st.arts || []).filter((x) => x.id !== it.id), it];
        st.artDraft = { ...a, id: it.id };
        // a arte que já está no vídeo passa a usar a imagem nova
        let n = 0;
        st.overlays.forEach((o) => {
          if (o.artId === it.id) {
            o.imgId = it.imgId;
            n++;
          }
        });
        if (add && !n) placeArt(it);
        else if (n) {
          commit();
          renderOverlays();
        }
        st.lib = null; // a biblioteca muda
        toast(add ? 'Arte no vídeo. Arraste para posicionar.' : `Arte “${it.name}” salva.`);
        drawDrawer();
      } catch (e) {
        toast(e.message);
        btns.forEach((b) => (b.disabled = false));
      }
    }
    function placeArt(it) {
      shared.addOverlay({
        type: 'image',
        imgId: it.imgId,
        artId: it.id,
        w: Math.max(0.02, Math.min(1, it.w / fmtW())),
        op: 1,
      });
    }

    function bind(dr) {
      const on = (id, ev, fn) => {
        const e = $('#' + id, dr);
        if (e) e.addEventListener(ev, fn);
      };
      const a = st.artDraft;
      preview(dr);
      let t = null;
      const live = () => {
        clearTimeout(t);
        t = setTimeout(() => preview(dr), 250);
      };
      on('art-name', 'input', (e) => (a.name = e.target.value.trim() || 'Arte'));
      on('art-html', 'input', (e) => {
        a.html = e.target.value;
        live();
      });
      on('art-css', 'input', (e) => {
        a.css = e.target.value;
        live();
      });
      // Tab escreve espaços no código, em vez de pular de campo
      $$('.dlx-code', dr).forEach((ta) =>
        ta.addEventListener('keydown', (e) => {
          e.stopPropagation(); // atalhos do editor (espaço, X, G…) não valem enquanto se digita
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
            ta.dispatchEvent(new Event('input'));
          }
        }),
      );
      for (const id of ['art-name', 'art-w', 'art-h']) on(id, 'keydown', (e) => e.stopPropagation());
      const size = (k) => (e) => {
        a[k] = Math.max(20, Math.min(3840, Math.round(+e.target.value) || a[k]));
        preview(dr);
      };
      on('art-w', 'change', size('w'));
      on('art-h', 'change', size('h'));
      $$('[data-art-size]', dr).forEach((b) =>
        b.addEventListener('click', () => {
          const [w, h] = b.dataset.artSize.split('x').map(Number);
          Object.assign(a, { w, h });
          drawDrawer();
        }),
      );
      $$('[data-art-start]', dr).forEach((b) =>
        b.addEventListener('click', () => {
          const s = b.dataset.artStart === 'new' ? blank() : { ...STARTERS[+b.dataset.artStart], id: null };
          st.artDraft = { ...s };
          drawDrawer();
        }),
      );
      $$('[data-art]', dr).forEach((c) =>
        c.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const it = (st.arts || []).find((x) => x.id === c.dataset.art);
          if (it && it.imgId) placeArt(it);
        }),
      );
      $$('[data-art-edit]', dr).forEach((b) =>
        b.addEventListener('click', () => {
          const it = (st.arts || []).find((x) => x.id === b.dataset.artEdit);
          if (it) st.artDraft = { id: it.id, name: it.name, w: it.w, h: it.h, html: it.html, css: it.css };
          drawDrawer();
          const ed = $('#art-html', dr);
          if (ed) ed.scrollIntoView({ block: 'center' });
        }),
      );
      $$('[data-art-del]', dr).forEach((b) =>
        b.addEventListener('click', async () => {
          const it = (st.arts || []).find((x) => x.id === b.dataset.artDel);
          if (!it || !window.confirm(`Excluir a arte “${it.name}”? Os cortes que já usam continuam com ela.`)) return;
          try {
            await api('/arts/' + it.id, { method: 'DELETE' });
            st.arts = st.arts.filter((x) => x.id !== it.id);
            if (st.artDraft && st.artDraft.id === it.id) st.artDraft = { ...st.artDraft, id: null };
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        }),
      );
      on('art-add', 'click', () => save(dr, { add: true }));
      on('art-save', 'click', () => save(dr, {}));
      on('art-copy', 'click', () => save(dr, { copy: true }));
    }

    /* ----- seletor de fonte com "Adicionar fonte", usado nas gavetas Legendas e Texto ----- */
    function fontPicker(id, cur, withNote) {
      const mine = CSx.customFonts();
      return `<select id="${id}" class="dlx-select">${INVBFonts.options(cur, withNote)}</select>
        <div class="dlx-fontadd"><button class="dlx-link" data-font-add>+ Adicionar fonte (.ttf ou .otf)</button><input type="file" data-font-file hidden accept=".ttf,.otf,font/ttf,font/otf">${
          mine.length
            ? `<span class="dlx-fontmine">${mine.map((f) => `<span>${esc(f.name)} <button data-font-del="${esc(f.id)}" aria-label="Excluir a fonte ${esc(f.name)}" title="Excluir">✕</button></span>`).join('')}</span>`
            : ''
        }</div>`;
    }
    /** Liga o "Adicionar fonte". `use(nome)` aplica a fonte nova onde o seletor estava. */
    function bindFontPicker(dr, use) {
      const inp = $('[data-font-file]', dr);
      const add = $('[data-font-add]', dr);
      if (add && inp) add.onclick = () => inp.click();
      if (inp)
        inp.onchange = async () => {
          const f = inp.files[0];
          if (!f) return;
          try {
            toast('Enviando a fonte…');
            const it = await INVBFonts.upload(f);
            await document.fonts.load(`20px '${it.name}'`).catch(() => {});
            toast(`Fonte “${it.name}” adicionada. Ela já vale para a legenda, os textos e as artes.`);
            use(it.name);
          } catch (e) {
            toast(e.message);
          }
        };
      $$('[data-font-del]', dr).forEach((b) =>
        b.addEventListener('click', async () => {
          const f = INVBFonts.list.find((x) => x.id === b.dataset.fontDel);
          if (
            !f ||
            !window.confirm(`Excluir a fonte “${f.name}”? Legendas e textos com ela voltam para a fonte padrão.`)
          )
            return;
          try {
            await INVBFonts.remove(f.id);
            toast('Fonte excluída.');
            drawDrawer();
          } catch (e) {
            toast(e.message);
          }
        }),
      );
    }

    Object.assign(shared, { artePanel: panel, arteBind: bind, fontPicker, bindFontPicker });
  };
})();
