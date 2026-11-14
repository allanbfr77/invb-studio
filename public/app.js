/* INVB Studio — réplica de estudo. Roteamento no cliente, sem dependências.
   Todas as demonstrações usam dados fictícios locais; nenhuma IA é executada. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tm = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const srtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},000`; };
  const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const D = window.D;
  let mode = 'video';
  let timer = null;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const I = {
    chev: '<svg class="chev" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3.5l3 3 3-3"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3.2 3L13 5"/></svg>',
  };

  /* ---------- Layout ---------- */
  const rLabel = (slug) => { for (const g of D.nav.produto) for (const i of g.items) if (i[0] === slug) return i[1]; return D.nav.basico.find((b) => b[0] === slug)?.[1] || slug; };

  function header() {
    const prod = D.nav.produto.map((g) => `<div><h4>${g.t}</h4>${g.items.map((i) => `<a class="it" href="/recursos/${i[0]}"><b>${i[1]}${i[3] ? `<span class="tag" style="display:inline;margin-left:8px">${i[3]}</span>` : ''}</b><span>${i[2]}</span></a>`).join('')}</div>`).join('');
    const usos = D.nav.usos.map((g) => `<div><h4>${g.t}</h4>${g.items.map((s) => `<a class="it" href="/usos/${s}"><b>${D.usoLabels[s]}</b></a>`).join('')}</div>`).join('');
    const rec = D.nav.recursos.map((r) => `<a class="it" href="${r[0]}"><b>${r[1]}</b><span>${r[2]}</span></a>`).join('');
    return `
    <header class="top" id="top"><div class="wrap"><div class="bar">
      <a class="logo" href="/"><img src="/logo.svg" alt="">${D.brand}</a>
      <button class="burger" aria-label="Abrir menu" id="burger">☰</button>
      <nav class="main" aria-label="Principal">
        <button data-mega="produto" aria-expanded="false">Produto ${I.chev}</button>
        <button data-mega="usos" aria-expanded="false">Usos ${I.chev}</button>
        <button data-mega="recursos" aria-expanded="false">Recursos ${I.chev}</button>
      </nav>
      <div class="actions"><button class="lang" aria-label="Idioma: PT">${I.globe} PT ${I.chev}</button>
        <a class="btn plain" href="/entrar">Entrar</a><a class="btn dark" href="/app">Abrir o app</a></div>
    </div></div>
    <div class="mega" id="mega-produto"><div class="panel" style="grid-template-columns:1fr 270px"><div class="cols" style="grid-template-columns:repeat(3,1fr)">${prod}</div>
      <div class="side"><h4>O básico</h4>${D.nav.basico.map((b) => `<a href="/recursos/${b[0]}">${b[1]}</a>`).join('')}
      <div class="card"><b>Conector para IA</b>Peça trechos, capítulos e cortes pelo ChatGPT, Claude ou Gemini, e deixe ele organizar e gerar por você.</div></div></div></div>
    <div class="mega" id="mega-usos"><div class="panel"><div class="cols" style="grid-template-columns:repeat(4,1fr)">${usos}</div></div></div>
    <div class="mega" id="mega-recursos"><div class="panel" style="grid-template-columns:1.3fr 1fr"><div class="cols" style="grid-template-columns:1fr 1fr;align-content:start">${rec}</div>
      <div class="side"><h4>Central de ajuda</h4><p style="font-size:14px;color:var(--muted);margin-bottom:12px">Cada tela do app, passo a passo, com prints.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr">${D.nav.ajuda.map((a) => `<a href="/central-de-ajuda">${a}</a>`).join('')}</div><a href="/central-de-ajuda" style="color:var(--primary);margin-top:10px">Ver todos os artigos →</a></div></div></div>
    </header>`;
  }

  function footer() {
    const f = D.footer;
    return `<footer class="foot"><div class="wrap">
      <div class="fgrid">
        <div class="fbrand"><a class="logo" href="/"><img src="/logo.svg" alt="">${D.brand}</a><p>Transforma vídeo, áudio e links do YouTube em transcrição, cortes verticais, legendas e timeline para o editor. Protótipo de interface, com dados fictícios.</p></div>
        <div><h5>Produto</h5>${f.produto.map((p) => `<a href="/recursos/${p[0]}">${p[1]}</a>`).join('')}</div>
        <div><h5>Usos</h5>${Object.entries(D.usoLabels).slice(0, 12).map(([s, l]) => `<a href="/usos/${s}">${l}</a>`).join('')}<a href="/usos">Todos os usos</a></div>
        <div><h5>${D.brand}</h5>${f.empresa.map((p) => `<a href="${p[0]}">${p[1]}</a>`).join('')}<h5 style="margin-top:20px">Guias</h5>${f.guias.slice(0, 5).map((g) => `<a href="/guias">${g}</a>`).join('')}<a href="/guias">Todos os guias</a></div>
      </div>
      <div class="fbottom"><span>© 2026 ${D.brand}. Sem fins comerciais. Marca e logo próprios.</span>
        <nav><a href="/privacidade">Privacidade</a><a href="/termos">Termos de uso</a><a href="/reembolso">Reembolso</a></nav></div>
    </div></footer>`;
  }

  const cta = (h = 'Sua próxima história já está esperando.') => `<section class="final"><div class="wrap"><h2 class="t" style="font-size:44px">${h}</h2>
    <p class="sub" style="margin-inline:auto">Envie um arquivo ou cole um link do YouTube e veja a transcrição, os capítulos e os cortes do seu próprio material.</p>
    <div class="cta-row"><a class="btn primary" href="/app">Abrir o app</a></div></div></section>`;

  const faq = (items, title = 'Perguntas frequentes') => `<section class="s"><div class="wrap"><h2 class="t center">${title}</h2><div class="faq">${items.map((q) => `<details><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}</div></div></section>`;

  /* ---------- Home ---------- */
  const modeToggle = (id) => `<div class="pill" role="group" aria-label="O que você vai enviar" data-mode>${['video', 'audio'].map((m) => `<button aria-pressed="${mode === m}" data-m="${m}">${I[m]} ${m === 'video' ? 'Vídeo' : 'Áudio'}</button>`).join('')}</div>`;

  function scene(i) {
    const aud = mode === 'audio';
    const file = aud ? 'ep112_conversa.mp3' : 'ep112_conversa.mov';
    if (i === 0) return `<div class="scene"><div class="drop"><b style="color:var(--fg)">Arraste o arquivo ou cole um link do YouTube</b><div class="file"><span>${file}</span><span>${aud ? 'MP3' : '4K'} · 58:12</span></div><div class="bar2"><i></i></div><p class="hint">Transcrevendo… (animação ilustrativa)</p></div></div>`;
    if (i === 1) return `<div class="scene two"><div>${D.sample.slice(0, 4).map((l, k) => `<div class="tline"><span class="who ${l.s === 'Léo' ? 'b' : ''}">${l.s}</span><span class="tm">${tm(l.t)}</span><span>${esc(l.w)}</span><span class="badge">${l.sc}</span></div>`).join('')}</div>
      <div><p class="eyebrow" style="margin-bottom:10px">Capítulos e momentos</p><ul class="chapters">${D.capitulosAmostra.map((c) => `<li>${c[1]}<span>${tm(c[0])}</span></li>`).join('')}</ul><div class="wave">${Array.from({ length: 40 }, (_, k) => `<i style="height:${20 + Math.abs(Math.sin(k * 1.7)) * 80}%"></i>`).join('')}</div></div></div>`;
    if (i === 2) return `<div class="scene two"><div><p class="eyebrow" style="margin-bottom:10px">Achando os melhores momentos · 58:12</p>${[[88, 'Gancho', 'o segredo'], [96, 'História', 'eu travei'], [81, 'Opinião', 'sem medo']].map((c) => `<div class="cutrow"><div class="score">${c[0]}</div><div><b>${c[1]}</b><small>${aud ? 'trecho em MP3' : 'corte 9:16'} · “${c[2]}”</small></div></div>`).join('')}</div>
      <div>${aud ? '<div class="wave" style="height:120px">' + Array.from({ length: 30 }, (_, k) => `<i style="height:${20 + Math.abs(Math.sin(k)) * 80}%"></i>`).join('') + '</div>' : `<div class="phone"><span class="cap" style="${D.estilos[0][1]}">EU TRAVEI ALI</span></div>`}</div></div>`;
    if (i === 3) return `<div class="scene two"><div><p class="eyebrow" style="margin-bottom:10px">Estilos</p><p style="color:var(--muted);font-size:14px">54 fontes, estilo por palavra, posição livre e destaque automático.</p><div class="chips" id="home-styles">${D.estilos.map((s, k) => `<button class="chip" aria-pressed="${k === 0}" data-k="${k}">${s[0]}</button>`).join('')}<span class="chip">+231</span></div><p class="hint">Idioma: Português</p></div>
      <div><div class="phone"><span class="cap" id="home-cap" style="${D.estilos[0][1]}">EU TRAVEI ALI</span></div></div></div>`;
    const dests = [['Premiere Pro', 'timeline · .xml'], ['DaVinci Resolve', 'timeline · .xml'], ['Final Cut Pro', 'timeline · .fcpxml'], ['Reels, Shorts e TikTok', aud ? 'trechos · mp3' : '3 cortes · 9:16'], ['Legenda e capítulos', '.srt · YouTube'], ['Seu assistente de IA', 'ChatGPT · Claude · Gemini']];
    return `<div class="scene"><div class="dests">${dests.map((d, k) => `<div class="dest" style="animation-delay:${k * 80}ms"><div><b>${d[0]}</b><span>${d[1]}</span></div>${I.check}</div>`).join('')}</div>
      <div class="mini"><div><div class="tr"><i style="background:#6d66ff"></i><i style="background:#f59e42"></i><i style="background:#3fb596"></i></div><div class="tr"><i style="background:#2a2a52"></i><i style="background:#4a3a28"></i><i style="background:#1f4a40"></i></div></div>
      <div><div class="phone" style="width:50px;border-radius:8px;margin:0"></div></div><div>00:00 Começo da carreira<br>12:04 Gancho · o palco<br>31:50 Dinheiro e medo</div></div></div>`;
  }

  function homeDemo(root) {
    let cur = 0;
    const stage = $('#stage', root), tabs = $$('.steps button', root);
    const show = (i) => {
      cur = i; tabs.forEach((t, k) => t.setAttribute('aria-selected', k === i));
      stage.innerHTML = scene(i);
      const cap = $('#home-cap', stage);
      if (cap) $$('#home-styles .chip', stage).forEach((b) => b.onclick = () => { $$('#home-styles .chip', stage).forEach((x) => x.setAttribute('aria-pressed', x === b)); cap.style.cssText = D.estilos[+b.dataset.k][1]; });
      if (i === 4) toast('Um envio, seis destinos.');
    };
    tabs.forEach((t, k) => t.onclick = () => { clearInterval(timer); show(k); });
    show(0);
    clearInterval(timer);
    timer = setInterval(() => show((cur + 1) % 5), 4500);
  }

  function home() {
    const aud = mode === 'audio';
    const flowCols = D.fluxo.map((f) => `<li><span class="num">${f[0]}</span><h3>${f[1]}</h3><p>${aud ? f[3] : f[2]}</p>${f[4].map((l) => `<a href="/recursos/${l[0]}">${l[1]}</a>`).join('')}</li>`).join('');
    const pp = D.pedidos.concat(D.pedidos);
    return `
    <section class="hero"><div class="wrap">
      <p class="eyebrow">Transcrição, cortes e legendas com IA para vídeo e áudio</p>
      <h1>A história já está lá.<span class="quiet grad">Nós ajudamos você a contar.</span></h1>
      <p class="lede">O ${D.brand} transforma vídeo e áudio em texto, cortes e legendas. Envie o arquivo ou o link do YouTube: nós transcrevemos cada palavra, encontramos as melhores falas, cortamos, legendamos e deixamos tudo pronto para o seu editor e para as redes.</p>
      <div class="cta-row"><a class="btn primary" href="/app">Abrir o app</a><a class="btn ghost" href="/recursos">Ver recursos</a></div>
      ${modeToggle()}
      <div class="demo" id="demo"><div class="demo-top"><div class="steps" role="tablist">${['Envie', 'Encontre', 'Corte', 'Legende', 'Entregue'].map((s, k) => `<button role="tab" aria-selected="false"><span class="n">0${k + 1}</span>${s}</button>`).join('')}</div>
        <span class="meta">ep112_conversa.${aud ? 'mp3' : 'mov'} · 58:12 · 2 falantes · <b>dados fictícios</b></span></div><div class="stage" id="stage"></div></div>
    </div></section>
    <div class="stats">${[['90+', 'idiomas na transcrição'], ['235', 'estilos de legenda'], ['Timeline pronta', 'abre já cortada no Premiere, no DaVinci e no Final Cut'], ['Palavra por palavra', 'cada palavra com o tempo e o nome de quem falou']].map((s) => `<dl><dd>${s[0]}</dd><dt>${s[1]}</dt></dl>`).join('')}</div>
    <section class="s"><div class="wrap center"><p class="eyebrow">Um fluxo, todos os recursos</p><h2 class="t" style="margin-top:12px">Envie uma vez. Use em todo lugar.</h2>
      <p class="sub">Tudo acontece no mesmo lugar, na ordem em que você trabalha. O que sai depende do que você enviou.</p>
      ${modeToggle().replace('margin-top', 'margin-top')}<ol class="flow" style="text-align:left;list-style:none;padding:0">${flowCols}</ol></div></section>
    <section class="s alt"><div class="wrap"><div class="center"><h2 class="t">Todo projeto começa aqui. Escolha o seu.</h2><p class="sub">A pregação de domingo, o episódio da semana, o filme do casamento, a aula gravada. Escolha o que você quer fazer.</p></div>
      <div class="tabsx"><div role="tablist" aria-orientation="vertical">${D.casos.map((c, k) => `<button role="tab" aria-selected="${k === 0}" data-case="${k}"><span class="n">0${k + 1}</span>${c[0]}</button>`).join('')}</div><div id="casepanel"></div></div></div></section>
    <section class="s"><div class="wrap"><div class="center"><h2 class="t">Você decide. A gente cuida do resto.</h2><p class="sub">Peça do seu jeito ou faça você mesmo, frase por frase. O resultado é sempre seu para ajustar.</p></div>
      <div class="marq"><div>${pp.map((p) => `<span>${p}</span>`).join('')}</div></div>
      <div class="trio"><div class="box"><p class="k">Deixe com a gente</p><h3>Cortes com nota, capítulos e roteiro na duração que você pedir.</h3><p>Diga o que procura em uma frase. Nós lemos o material inteiro e trazemos os trechos certos, com minutagem.</p></div>
      <div class="box"><p class="k">Ou faça do seu jeito</p><h3>Edite o texto, ajuste o corte palavra por palavra, arraste a legenda.</h3><p>A correção que você faz na transcrição vale para a legenda e para o corte. Nada sai sem passar por você.</p></div>
      <div class="box" style="background:var(--soft)"><p class="k">Conector</p><h3>Peça direto ao ChatGPT, ao Claude ou ao Gemini.</h3><p>Eles consultam o material, devolvem trechos, capítulos e cortes e, se você permitir, organizam e geram por você.</p><a class="btn primary" href="/recursos/conector-para-ia">Conhecer o conector</a></div></div></div></section>
    <section class="s alt"><div class="wrap"><div class="head-row"><h2 class="t" style="max-width:520px">Não é só a gente dizendo. Quem usa conta.</h2><a class="link-arrow" href="/depoimentos">Ver mais depoimentos →</a></div>
      <div class="quotes">${D.depoimentos.slice(0, 3).map(quote).join('')}</div></div></section>
    
    ${faq(D.faqHome)}
    <section class="s alt"><div class="wrap"><div class="center"><h2 class="t">Explore o ${D.brand}</h2><p class="sub">Ferramentas, guias e respostas.</p></div>
      <div class="grid4">${D.explore.map((e) => `<a href="${e[0]}"><b>${e[1]}</b><span>${e[2]}</span></a>`).join('')}</div><p class="upd">Atualizado em 22 de outubro de 2026</p></div></section>
    ${cta()}`;
  }
  const quote = (q) => `<figure class="q"><span class="tg">${q[0]}</span><blockquote>${q[1]}</blockquote><figcaption><strong>${q[2]}</strong> · ${q[3]}</figcaption></figure>`;

  function casePanel(k) {
    const c = D.casos[k];
    return `<div class="tabpanel" role="tabpanel"><span class="moment">${c[2]}</span><h3>${c[4]}</h3><p>${c[5]}</p><div class="recv"><b>Você recebe</b>${c[3]}</div><div class="cta-row" style="justify-content:flex-start;margin:0"><a class="btn primary" href="/app">Abrir o app</a><a class="btn ghost" href="/${c[1].includes('exportar') ? 'recursos/' + c[1] : 'usos/' + c[1]}">${c[6]}</a></div></div>`;
  }

  /* ---------- Widgets (demos locais com dados fictícios) ---------- */
  const note = (t) => `<p class="fakeprompt">${t} Dados fictícios, sem processamento de IA.</p>`;
  const srtOf = (lines, off) => lines.map((l, k) => `${k + 1}\n${srtT(l.t - off)} --> ${srtT(l.t - off + 4)}\n${l.w}\n`).join('\n');

  const widgets = {
    transcricao: () => `<div class="widget" id="w-tr"><div class="search"><span>🔍</span><input placeholder="Busque uma palavra, ex.: medo" value="medo" aria-label="Buscar na transcrição"><span class="cnt"></span></div>
      <div class="chips"><button class="chip" aria-pressed="true" data-sp="">Todos</button><button class="chip" aria-pressed="false" data-sp="Ana">Ana</button><button class="chip" aria-pressed="false" data-sp="Léo">Léo</button></div><div id="w-lines"></div>${note('Clique numa fala para “ir ao ponto”.')}</div>`,
    capitulos: () => `<div class="widget"><ul class="chapters">${D.capitulosAmostra.map((c) => `<li>${c[1]}<span>${tm(c[0])}</span></li>`).join('')}</ul>
      <button class="btn ghost" id="w-copy" style="margin-top:8px">Copiar para a descrição do YouTube</button>${note('Os capítulos vêm de um exemplo fixo.')}</div>`,
    cortes: () => `<div class="widget" id="w-cuts"><div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px"><div>${D.sample.filter((l) => l.sc > 60).sort((a, b) => b.sc - a.sc).map((l, k) => `<div class="cutrow ${k === 0 ? 'sel' : ''}" data-i="${D.sample.indexOf(l)}" style="cursor:pointer"><div class="score">${l.sc}</div><div><b>${l.s} · ${tm(l.t)}</b><small>${esc(l.w.slice(0, 54))}…</small></div></div>`).join('')}</div>
      <div><div class="phone" style="width:150px"><span class="cap" id="w-cap" style="font-size:15px;${D.estilos[0][1]}">${esc(D.sample[0].w.split(' ').slice(0, 5).join(' '))}</span></div></div></div>${note('Notas de exemplo, calculadas à mão.')}</div>`,
    legendas: () => `<div class="widget"><div class="preview"><span id="w-prev" style="${D.estilos[0][1]}">O medo não some.</span></div><div class="chips" id="w-st">${D.estilos.map((s, k) => `<button class="chip" aria-pressed="${k === 0}" data-k="${k}">${s[0]}</button>`).join('')}</div>
      <label style="font-size:13px;color:var(--muted)">Tamanho <input type="range" min="18" max="48" value="30" id="w-size"></label>${note('Prévia em CSS dos estilos.')}</div>`,
    traducao: () => `<div class="widget" id="w-trad"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><select class="sel" aria-label="Idioma"><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option></select><button class="btn ghost plain" id="w-srt">Baixar SRT</button></div><div id="w-tl"></div>${note('Traduções de exemplo escritas à mão, não geradas por IA.')}</div>`,
    exportar: () => `<div class="widget"><p style="font-size:14px;color:var(--muted);margin-bottom:10px">Escolha o destino:</p><div class="chips" id="w-ex">${[['srt', 'SRT (YouTube)'], ['txt', 'TXT'], ['cap', 'Capítulos'], ['prem', 'Premiere (.xml)'], ['dav', 'DaVinci (.xml)'], ['fcp', 'Final Cut (.fcpxml)']].map((e) => `<button class="chip" data-f="${e[0]}">${e[1]}</button>`).join('')}</div>${note('SRT, TXT e capítulos baixam um arquivo de exemplo; as timelines dependem do app real e aqui são apenas ilustrativas.')}</div>`,
    conector: () => `<div class="widget" id="w-chat"><div class="chat" id="w-msgs"><div class="u">Me dá os 3 melhores trechos sobre medo</div><div class="a">Encontrei 3 trechos no material de exemplo: 12:58 (nota 94), 12:15 (91) e 12:35 (84). (Resposta de exemplo, não gerada por IA.)</div></div>
      <div class="chips" style="margin-top:14px">${['Capítulos para o YouTube', 'Quem falou sobre roteiros?', 'Legenda em espanhol'].map((p) => `<button class="chip" data-p="${p}">${p}</button>`).join('')}</div>${note('Respostas pré-escritas; nenhum assistente foi conectado.')}</div>`,
    tabela: () => `<table class="fmt"><tr><th>Tipo</th><th>Formatos</th></tr><tr><td>Áudio</td><td>MP3, WAV, M4A, AAC, OGG, OPUS</td></tr><tr><td>Vídeo</td><td>MP4, MOV, AVI, MKV, WEBM</td></tr><tr><td>Link</td><td>YouTube: vídeo, Shorts, live (com replay)</td></tr></table>`,
    generico: () => `<div class="widget"><div class="chapters">${D.sample.slice(0, 4).map((l) => `<li style="display:block"><span>${l.s} · ${tm(l.t)}</span><br>${esc(l.w)}</li>`).join('')}</div>${note('Exemplo ilustrativo.')}</div>`,
  };

  function bindWidgets(root) {
    const tr = $('#w-tr', root);
    if (tr) {
      let sp = '';
      const draw = () => {
        const q = $('input', tr).value.trim().toLowerCase();
        const ls = D.sample.filter((l) => (!sp || l.s === sp) && (!q || l.w.toLowerCase().includes(q)));
        $('.cnt', tr).textContent = `${ls.length} resultados`;
        $('#w-lines', tr).innerHTML = ls.map((l) => `<div class="tline" data-t="${l.t}" style="cursor:pointer"><span class="who ${l.s === 'Léo' ? 'b' : ''}">${l.s}</span><span class="tm">${tm(l.t)}</span><span>${q ? esc(l.w).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), (m) => `<mark>${m}</mark>`) : esc(l.w)}</span></div>`).join('') || '<p class="hint">Nada encontrado.</p>';
        $$('.tline', tr).forEach((e) => e.onclick = () => toast(`O player iria para ${tm(+e.dataset.t)}`));
      };
      $('input', tr).oninput = draw;
      $$('.chip', tr).forEach((b) => b.onclick = () => { sp = b.dataset.sp; $$('.chip', tr).forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); });
      draw();
    }
    const cp = $('#w-copy', root);
    if (cp) cp.onclick = async () => { const t = D.capitulosAmostra.map((c) => `${tm(c[0])} ${c[1]}`).join('\n'); try { await navigator.clipboard.writeText(t); toast('Capítulos copiados'); } catch { download('capitulos.txt', t); } };
    const cuts = $('#w-cuts', root);
    if (cuts) $$('.cutrow', cuts).forEach((r) => r.onclick = () => { $$('.cutrow', cuts).forEach((x) => x.classList.toggle('sel', x === r)); $('#w-cap', cuts).textContent = D.sample[+r.dataset.i].w.split(' ').slice(0, 5).join(' '); });
    const st = $('#w-st', root);
    if (st) { const pv = $('#w-prev', root); $$('.chip', st).forEach((b) => b.onclick = () => { $$('.chip', st).forEach((x) => x.setAttribute('aria-pressed', x === b)); const sz = pv.style.fontSize; pv.style.cssText = D.estilos[+b.dataset.k][1] + (sz ? `;font-size:${sz}` : ''); }); $('#w-size', root).oninput = (e) => pv.style.fontSize = e.target.value + 'px'; }
    const td = $('#w-trad', root);
    if (td) {
      const draw = () => { const l = $('select', td).value; $('#w-tl', td).innerHTML = D.sample.map((s, k) => `<div class="tline"><span class="tm">${tm(s.t)}</span><span>${esc(D.sampleTr[l][k])}</span></div>`).join(''); };
      $('select', td).onchange = draw; draw();
      $('#w-srt', td).onclick = () => { const l = $('select', td).value; download(`legenda-${l}.srt`, srtOf(D.sample.map((s, k) => ({ t: s.t, w: D.sampleTr[l][k] })), 724)); };
    }
    const ex = $('#w-ex', root);
    if (ex) $$('.chip', ex).forEach((b) => b.onclick = () => {
      const f = b.dataset.f;
      if (f === 'srt') download('exemplo.srt', srtOf(D.sample, 724));
      else if (f === 'txt') download('exemplo.txt', D.sample.map((l) => `[${tm(l.t)}] ${l.s}: ${l.w}`).join('\n'));
      else if (f === 'cap') download('capitulos.txt', D.capitulosAmostra.map((c) => `${tm(c[0])} ${c[1]}`).join('\n'));
      else toast('Simulado: a timeline para editores só existe no app real.');
    });
    const ch = $('#w-chat', root);
    if (ch) {
      const R = { 'Capítulos para o YouTube': D.capitulosAmostra.map((c) => `${tm(c[0])} ${c[1]}`).join(' · '), 'Quem falou sobre roteiros?': 'Ana, aos 12:55: “Hoje eu escrevo a primeira frase e deixo o resto acontecer.”', 'Legenda em espanhol': 'Gerei o SRT em espanhol a partir do exemplo (ver a página de Tradução).' };
      $$('.chip', ch).forEach((b) => b.onclick = () => { $('#w-msgs', ch).insertAdjacentHTML('beforeend', `<div class="u">${esc(b.dataset.p)}</div><div class="a">${esc(R[b.dataset.p])} (Resposta de exemplo.)</div>`); });
    }
  }

  /* ---------- Resource / use pages ---------- */
  const related = (slug) => `<section class="s alt"><div class="wrap"><h2 class="t">Mais que transcrição. O texto é só o começo.</h2><div class="hubgrid">${D.nav.produto.flatMap((g) => g.items).filter((i) => i[0] !== slug).slice(0, 6).map((i) => `<a href="/recursos/${i[0]}"><b>${i[1]}</b><span>${i[2]}</span></a>`).join('')}</div></div></section>`;

  function recurso(slug) {
    const r = D.recursos[slug];
    if (!r) return stub('Recurso não encontrado');
    return `<section class="page-hero"><div class="wrap"><div class="crumbs"><a href="/">Início</a> / <a href="/recursos">Produto</a> / <span class="cur">${rLabel(slug)}</span></div>
      <h1>${r.title} <span class="grad">${r.hi}</span></h1><p class="lede">${r.intro}</p><p class="upd">Atualizado em 12 de outubro de 2026</p><a class="btn primary" href="/app">Abrir o app</a></div>
      <div class="card-big"><div class="split"><div><h2 class="t" style="font-size:30px">${r.hi}</h2><ul class="checks" style="margin-top:16px">${r.bullets.map((b) => `<li>${b}</li>`).join('')}</ul></div><div>${(widgets[r.kind] || widgets.generico)()}</div></div></div></section>
      <section class="s"><div class="wrap"><h2 class="t center">Como funciona</h2><div class="steps3">${r.steps.map((s, k) => `<div class="box"><p class="k">0${k + 1}</p><h3>${s[0]}</h3><p>${s[1]}</p></div>`).join('')}</div>
      <dl class="spec">${[['Entrada', 'Áudio ou vídeo: MP3, WAV, M4A, MP4, MOV, MKV e outros'], ['Link', 'YouTube: vídeo, Shorts e live (com replay)'], ['Idiomas', 'Transcrição em mais de 90 idiomas'], ['Falantes', 'Separados automaticamente'], ['Exportação', 'TXT, PDF, SRT, FCPXML e MP3']].map((x) => `<div><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`).join('')}</dl></div></section>
      ${related(slug)}${faq(D.faqHome.slice(1, 6))}${cta(r.title)}`;
  }
  function recursosHub() {
    return `<section class="page-hero"><div class="wrap"><h1>Todos os recursos. <span class="grad">Do envio à entrega.</span></h1><p class="lede">Tudo o que o ${D.brand} faz com o seu vídeo e o seu áudio, organizado na ordem em que você trabalha.</p></div></section>
    <section class="wrap" style="padding-bottom:60px">${D.nav.produto.map((g) => `<h2 class="hub-h">${g.t}</h2><div class="hubgrid">${g.items.map((i) => `<a href="/recursos/${i[0]}"><b>${i[1]}</b><span>${i[2]}</span></a>`).join('')}</div>`).join('')}
    <h2 class="hub-h">O básico</h2><div class="hubgrid">${D.nav.basico.map((b) => `<a href="/recursos/${b[0]}"><b>${b[1]}</b></a>`).join('')}</div></section>${cta()}`;
  }
  function uso(slug) {
    const u = D.usos[slug];
    if (!u) return stub('Uso não encontrado');
    return `<section class="page-hero"><div class="wrap"><div class="crumbs"><a href="/">Início</a> / <a href="/usos">Usos</a> / <span class="cur">${u.label}</span></div><h1>${u.title}. <span class="grad">${u.hi}</span></h1><p class="lede">${u.intro}</p><a class="btn primary" href="/app">Abrir o app</a></div>
      <div class="card-big"><div class="split"><div><h2 class="t" style="font-size:30px">Configure: ${u.label.toLowerCase()}</h2><p class="sub">Já ajustado para este tipo de conteúdo.</p>
      <p class="eyebrow" style="margin-top:22px">O que você quer receber</p><div class="chips" id="u-chips">${u.receive.map((r) => `<button class="chip" aria-pressed="true">${r}</button>`).join('')}</div>
      <p class="hint">Duração dos cortes 30 a 59 s · Legenda Viral · Formato 9:16</p></div>
      <div class="widget"><p class="eyebrow" style="margin-bottom:10px">Exemplo do que sai</p><ul class="chapters">${D.capitulosAmostra.map((c) => `<li>${c[1]}<span>${tm(c[0])}</span></li>`).join('')}</ul>${D.sample.slice(0, 2).map((l) => `<div class="tline"><span class="who">${l.s}</span><span class="tm">${tm(l.t)}</span><span>${esc(l.w)}</span><span class="badge">${l.sc}</span></div>`).join('')}${note('Exemplo ilustrativo.')}</div></div></div></section>
      <section class="s"><div class="wrap"><h2 class="t center">Como o ${D.brand} funciona para ${u.label.toLowerCase()}</h2><div class="steps3">${[['Envie o arquivo ou o link', 'Escolha só o trecho que interessa.'], ['Nós organizamos', 'Transcrição com falantes, capítulos, emoções e cortes com nota.'], ['Revise e publique', 'Ajuste palavra por palavra, escolha a legenda e baixe.']].map((s, k) => `<div class="box"><p class="k">0${k + 1}</p><h3>${s[0]}</h3><p>${s[1]}</p></div>`).join('')}</div></div></section>
      ${faq(D.faqHome.slice(1, 5))}${cta()}`;
  }
  function usosHub() {
    return `<section class="page-hero"><div class="wrap"><h1>Para cada projeto. <span class="grad">O seu uso já está pronto.</span></h1><p class="lede">Escolha o tipo de conteúdo e a configuração já vem ajustada.</p></div></section>
    <section class="wrap" style="padding-bottom:60px">${D.nav.usos.map((g) => `<h2 class="hub-h">${g.t}</h2><div class="hubgrid">${g.items.map((s) => `<a href="/usos/${s}"><b>${D.usoLabels[s]}</b></a>`).join('')}</div>`).join('')}</section>${cta()}`;
  }

  function depoimentos() {
    return `<section class="page-hero"><div class="wrap"><h1>Quem usa conta. <span class="grad">Sem enfeite.</span></h1><p class="lede">Depoimentos <b>fictícios</b>, escritos para esta réplica; os da página original são de pessoas reais e não foram copiados.</p></div></section>
      <section class="wrap" style="padding-bottom:60px"><div class="quotes">${D.depoimentos.map(quote).join('')}</div></section>
      <section class="final"><div class="wrap"><h2 class="t" style="font-size:40px">Junte-se a quem já transforma áudio em história</h2><div class="cta-row"><a class="btn primary" href="/app">Abrir o app</a></div></div></section>`;
  }
  function sobre() {
    return `<section class="page-hero"><div class="wrap"><h1>Quem somos. <span class="grad">E como trabalhamos.</span></h1><p class="lede">Equipes de mídia de igrejas, videomakers de casamento e de eventos, podcasts, produtoras, professores e palestrantes. Esta é uma réplica de estudo, sem relação com a empresa original.</p></div></section>
      <section class="wrap" style="padding-bottom:60px;max-width:820px"><h2 class="t">Como trabalhamos</h2><p class="sub" style="max-width:none">O trabalho pesado fica com a ferramenta: transcrever, marcar, cortar e legendar. As decisões ficam com você, que ajusta cada corte, cada legenda e cada palavra antes de baixar.</p>
      <h2 class="t" style="margin-top:48px">Para saber mais</h2><div class="hubgrid">${[['/recursos', 'Todos os recursos'], ['/perguntas-frequentes', 'Perguntas frequentes'], ['/guias', 'Guias'], ['/ferramentas', 'Ferramentas grátis'], ['/privacidade', 'Privacidade']].map((l) => `<a href="${l[0]}"><b>${l[1]}</b></a>`).join('')}</div></section>${cta()}`;
  }
  function ferramentas() {
    return `<section class="page-hero"><div class="wrap"><h1>Ferramentas grátis. <span class="grad">Para legendas, áudio e vídeo.</span></h1><p class="lede">Converta, corte e ajuste legendas, áudios e vídeos. (Lista reproduzida como índice; as ferramentas em si não foram implementadas.)</p></div></section>
    <section class="wrap" style="padding-bottom:60px">${Object.entries(D.ferramentas).map(([g, l]) => `<h2 class="hub-h">${g}</h2><div class="hubgrid">${l.map((t) => `<a href="/ferramentas"><b>${t}</b><span>Disponível no site original</span></a>`).join('')}</div>`).join('')}</section>${cta()}`;
  }
  function guias() {
    return `<section class="page-hero"><div class="wrap"><h1>Guias. <span class="grad">Passo a passo.</span></h1><p class="lede">Transcrição, cortes, legendas e decupagem. (Índice de títulos; os artigos completos não foram reproduzidos.)</p></div></section>
    <section class="wrap" style="padding-bottom:60px"><div class="hubgrid">${D.footer.guias.map((g) => `<a href="/guias"><b>${g}</b><span>Guia</span></a>`).join('')}</div></section>${cta()}`;
  }
  function stub(title, text) {
    return `<section class="page-hero"><div class="wrap stub"><h1 style="font-size:44px">${title}</h1><p class="lede">${text || 'Esta página existe no site original, mas não foi reproduzida nesta réplica.'}</p><div class="cta-row"><a class="btn primary" href="/">Voltar ao início</a><a class="btn ghost" href="/recursos">Ver recursos</a></div></div></section>`;
  }

  /* ---------- Router ---------- */
  function route(path) {
    const seg = path.replace(/\/+$/, '').split('/').filter(Boolean);
    const [a, b] = seg;
    if (!a) return home();
    if (a === 'recursos') return b ? recurso(b) : recursosHub();
    if (a === 'usos') return b ? uso(b) : usosHub();
    if (a === 'depoimentos') return depoimentos();
    if (a === 'sobre') return sobre();
    if (a === 'ferramentas') return ferramentas();
    if (a === 'guias') return guias();
    if (a === 'entrar' || a === 'cadastro') return stub(a === 'entrar' ? 'Entrar' : 'Testar agora', '');
    return stub(a.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()));
  }

  function bind() {
    // mega menus
    const closeAll = () => { $$('.mega').forEach((m) => m.classList.remove('open')); $$('[data-mega]').forEach((b) => b.setAttribute('aria-expanded', 'false')); };
    $$('[data-mega]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const m = $('#mega-' + b.dataset.mega), was = m.classList.contains('open'); closeAll(); if (!was) { m.classList.add('open'); b.setAttribute('aria-expanded', 'true'); } });
    document.onclick = (e) => { if (!e.target.closest('.mega')) closeAll(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') closeAll(); };
    $('#burger').onclick = () => $('#top').classList.toggle('mob');
    // mode toggles
    $$('[data-mode] button').forEach((b) => b.onclick = () => { mode = b.dataset.m; const y = scrollY; render(location.pathname, true); scrollTo(0, y); });
    // home
    if ($('#demo')) homeDemo($('#demo'));
    const cp = $('#casepanel');
    if (cp) { cp.innerHTML = casePanel(0); $$('[data-case]').forEach((t) => t.onclick = () => { $$('[data-case]').forEach((x) => x.setAttribute('aria-selected', x === t)); cp.innerHTML = casePanel(+t.dataset.case); }); }
    $$('#u-chips .chip').forEach((c) => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
    bindWidgets(document);
  }

  function render(path, keep) {
    // Sem site público: tudo que não for a área logada ou o login abre direto no login.
    if (!(window.AppArea && AppArea.match(path))) { path = '/entrar'; if (location.pathname !== path) history.replaceState({}, '', path); }
    clearInterval(timer);
    document.body.classList.remove('in-app');
    if (window.AppArea && AppArea.match(path)) {
      document.title = `Área logada | ${D.brand}`;
      AppArea.render(path.replace(/\/+$/, '') || '/', $('#app'));
      if (!keep) scrollTo(0, 0);
      return;
    }
    const titles ={ '/': 'Transcrição, cortes e legendas com IA' };
    document.title = `${titles[path] || (path.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ')} | ${D.brand}`;
    $('#app').innerHTML = `<div class="demo-banner"><b>Site de apresentação.</b> Os exemplos desta página são ilustrativos. <a href="/app" style="text-decoration:underline;color:#fff">Ver a área logada (demonstração) →</a></div>${header()}<main id="main">${route(path)}</main>${footer()}`;
    if (!keep) scrollTo(0, 0);
    bind();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || e.metaKey || e.ctrlKey || a.target) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href === location.pathname) { scrollTo(0, 0); return; }
    history.pushState({}, '', href); render(href);
  });
  addEventListener('popstate', () => render(location.pathname));
  window.__render = (p) => render(p);
  render(location.pathname);
})();
