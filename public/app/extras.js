/* INVB Studio — Telas de apoio: capítulos, emoções e diagramas. */
(function () {
  const INVB = window.INVB;
  const { chaptersOf, esc, tm, ic, pages, S, $$, toast, dl, $, popover, EC, seek, note, aiOn } = INVB;

  /* ---------- Telas ---------- */
  pages.chapters = (c) => `${note(c)}<div class="ap-head"><div><h1>Capítulos</h1><p class="sub2">Navegue pelo conteúdo do áudio por temas e tópicos.</p></div><button class="ap-btn" id="ch-exp">Exportar timestamps ⌄</button></div>
      <p class="sub2" style="margin-bottom:12px">${chaptersOf(c).length} capítulos</p><div id="chps">${chaptersOf(c).map((k, i) => `<div class="chp ${i === 0 ? 'open' : ''}" data-i="${i}" style="cursor:pointer"><div class="n">${i + 1}</div><div style="flex:1"><h3>${esc(k.title)}</h3><p>${esc(k.summary)}</p><div class="mt"><span>⏱ ${tm(k.start)}</span><span>${tm(k.end - k.start)} de duração</span>${k.moments.length ? `<span>${k.moments.length} momentos</span>` : ''}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${(k.tags || []).map((t) => `<span class="tag2">${esc(t)}</span>`).join('')}</div></div><button class="ap-ic" data-dlc="${i}" aria-label="Baixar">${ic.dl}</button></div><div class="moms" ${i === 0 ? '' : 'hidden'}><div class="mom" data-t="${k.start}"><span>${tm(k.start)}</span>Ir para o início do capítulo</div>${k.moments.map((m) => `<div class="mom" data-t="${m.t}"><span>${tm(m.t)}</span>${esc(m.title)}</div>`).join('')}</div>`).join('')}</div>`;
  pages.emotions = (c) => (c.analysis.emotions || []).length ? `<div class="ap-head"><div><h1>Emoções</h1><p class="sub2">Análise emocional da transcrição.</p></div><button class="ap-btn" id="em-ord">⇅ Ordem no vídeo ⌄</button></div><label class="ap-search" style="max-width:none">${ic.search}<input id="eq" placeholder="Buscar na transcrição..."></label><div class="chiprow" id="echips"></div><div class="emo" id="emo"></div>`
      : `<h1>Emoções</h1><div class="empty"><div class="ci">${ic.heart}</div><h3>${aiOn() ? 'Emoções ainda não analisadas' : 'Emoções precisam de IA'}</h3><p>${aiOn() ? `Esta pregação foi analisada antes de a IA estar ligada. Refaça a análise para o ${esc(S.status.aiName || 'modelo')} marcar o tom emocional das falas.` : 'O tom emocional das falas é marcado pela IA. Para ativar, coloque uma chave do Claude ou da OpenAI no arquivo <code>install/pessoal.env</code> e abra o app de novo.'}</p>${aiOn() ? '<button class="ap-btn pri" data-reana>Refazer análise com IA</button>' : `<a class="ap-btn" href="/app/uploads/${c.id}/overview">Ir ao Resumo</a>`}</div>`;
  pages.diagrams = (c) => `<h1>Diagramas</h1><p class="sub2">Sua transcrição em mapa mental, fluxo e linha do tempo, montados a partir dos capítulos. Clique em qualquer ponto para abrir o trecho no player.</p><div style="height:16px"></div><div id="dg-body"></div>`;

  function bindChapters() {
    const CH = chaptersOf(S.cur);
    $$('.chp').forEach((el) => el.onclick = (e) => { if (e.target.closest('[data-dlc]')) return; const open = el.classList.toggle('open'); el.nextElementSibling.hidden = !open; });
    $$('.mom').forEach((m) => m.onclick = () => { seek(+m.dataset.t); toast(`Player em ${tm(+m.dataset.t)}`); });
    $$('[data-dlc]').forEach((b) => b.onclick = () => { const k = CH[+b.dataset.dlc]; dl(`capitulo-${+b.dataset.dlc + 1}.txt`, `${tm(k.start)} ${k.title}\n\n${k.summary}`); });
    $('#ch-exp').onclick = (e) => popover(e.currentTarget, '<button data-e="yt">Copiar formato YouTube</button><button data-e="txt">Baixar TXT</button>', (m) => $$('button', m).forEach((b) => b.onclick = () => { m.remove(); const t = CH.map((k, i) => `${i === 0 ? '00:00' : tm(k.start)} ${k.title}`).join('\n'); if (b.dataset.e === 'yt') navigator.clipboard?.writeText(t).then(() => toast('Capítulos copiados.')).catch(() => dl('capitulos.txt', t)); else dl('capitulos.txt', t); }));
  }
  function bindEmotions() {
    if (!$('#emo')) return; let q = '', em = '', ord = 'video';
    const present = [...new Set(S.segs.map((s) => s.emo).filter(Boolean))];
    const draw = () => {
      $('#echips').innerHTML = `<button class="ech" data-e="" aria-pressed="${em === ''}">Todas <b>${S.segs.filter((s) => s.emo).length}</b></button>` + present.map((e) => `<button class="ech" data-e="${e}" aria-pressed="${em === e}"><i style="background:${EC[e] || '#999'}"></i>${e} <b>${S.segs.filter((s) => s.emo === e).length}</b></button>`).join('');
      let l = S.segs.filter((s) => s.emo && (!em || s.emo === em) && (!q || s.text.toLowerCase().includes(q))); if (ord === 'emo') l = [...l].sort((a, b) => a.emo.localeCompare(b.emo));
      $('#emo').innerHTML = l.map((s) => `<div class="emc"><div class="h"><span>👤 ${esc(s.who)}</span><span class="pl" data-t="${s.t}">▶ ${tm(s.t)}</span><span><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${EC[s.emo] || '#999'};margin-right:5px"></i>${s.emo}</span></div><p>${esc(s.text)}</p></div>`).join('');
      $$('[data-e]').forEach((b) => b.onclick = () => { em = b.dataset.e; draw(); }); $$('#emo [data-t]').forEach((b) => b.onclick = () => { seek(+b.dataset.t); });
    };
    $('#eq').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#em-ord').onclick = (e) => popover(e.currentTarget, '<button data-o="video">Ordem no vídeo</button><button data-o="emo">Por emoção</button>', (m) => $$('button', m).forEach((b) => b.onclick = () => { ord = b.dataset.o; $('#em-ord').textContent = `⇅ ${b.textContent} ⌄`; m.remove(); draw(); }));
    draw();
  }
  function bindDiagrams() {
    const CH = chaptersOf(S.cur).map((k) => [k.title, k.start]), DUR = S.cur.duration || 1;
    const short = (s, n) => (s.length > n ? s.slice(0, n - 2) + '…' : s);
    const svgMind = () => { const W = 760, H = 360, cx = W / 2, cy = H / 2, n = Math.max(CH.length, 1); const nodes = CH.map((c, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: cx + Math.cos(a) * 250, y: cy + Math.sin(a) * 120, c }; });
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}">${nodes.map((o) => `<line x1="${cx}" y1="${cy}" x2="${o.x}" y2="${o.y}" stroke="#cfcaff" stroke-width="2"/>`).join('')}<rect x="${cx - 70}" y="${cy - 20}" width="140" height="40" rx="12" fill="#4f46e5"/><text x="${cx}" y="${cy + 5}" fill="#fff" text-anchor="middle">${esc(short(S.cur.name.replace(/\.[^.]+$/, ''), 16))}</text>${nodes.map((o) => `<g data-t="${o.c[1]}" style="cursor:pointer"><rect x="${o.x - 95}" y="${o.y - 20}" width="190" height="40" rx="10" fill="#fff" stroke="#8b5cf6"/><text x="${o.x}" y="${o.y + 4}" text-anchor="middle">${esc(short(o.c[0], 28))}</text></g>`).join('')}</svg>`; };
    const svgFlow = () => `<svg viewBox="0 0 220 ${CH.length * 80}" width="260">${CH.map((c, i) => `${i ? `<path d="M110 ${i * 80 - 20}v20" stroke="#8b5cf6" stroke-width="2"/>` : ''}<g data-t="${c[1]}" style="cursor:pointer"><rect x="10" y="${i * 80 + 6}" width="200" height="48" rx="10" fill="#fff" stroke="#4f46e5"/><text x="110" y="${i * 80 + 34}" text-anchor="middle">${esc(short(c[0], 26))}</text></g>`).join('')}</svg>`;
    const svgTime = () => `<svg viewBox="0 0 760 150" width="760"><line x1="30" y1="75" x2="730" y2="75" stroke="#cfcaff" stroke-width="3"/>${CH.map((c, i) => { const x = 30 + (c[1] / DUR) * 700, up = i % 2 === 0; return `<g data-t="${c[1]}" style="cursor:pointer"><circle cx="${x}" cy="75" r="8" fill="#4f46e5"/><text x="${x}" y="${up ? 52 : 108}" text-anchor="middle">${tm(c[1])}</text><text x="${x}" y="${up ? 36 : 126}" text-anchor="middle">${esc(short(c[0], 16))}</text></g>`; }).join('')}</svg>`;
    const show = (k) => { $('#dg-body').innerHTML = `<div class="ap-tabs" id="dg-tabs">${['Mapa mental', 'Fluxo', 'Linha do tempo'].map((t, i) => `<button role="tab" aria-selected="${i === k}" data-k="${i}">${t}</button>`).join('')}</div><div class="dia">${[svgMind, svgFlow, svgTime][k]()}</div><p class="sub2" style="margin-top:8px">Montado localmente a partir dos capítulos (sem IA).</p>`;
      $$('#dg-tabs button').forEach((b) => b.onclick = () => show(+b.dataset.k)); $$('.dia [data-t]').forEach((g) => g.onclick = () => { seek(+g.dataset.t); toast(`Player em ${tm(+g.dataset.t)}`); }); };
    if (!CH.length) $('#dg-body').innerHTML = '<div class="empty"><h3>Sem capítulos para desenhar</h3></div>'; else show(0);
  }
  Object.assign(INVB, { bindChapters, bindEmotions, bindDiagrams });
})();
