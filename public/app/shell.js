/* INVB Studio — Moldura das telas: o vídeo e o player de baixo, o menu lateral e os atalhos I/O. */
(function () {
  const INVB = window.INVB;
  const { S, $, api, go, guard, googleToken, esc, segsOf, tm, ic, $$, toast, statusLabel, isDone } = INVB;

  /* ---------- Mídia / player (elemento real) ---------- */
  function ensureMedia() {
    const id = S.cur.id;
    if (S.media && S.mediaId === id) return S.media;
    if (S.media) {
      S.media.pause();
      S.media.remove();
    }
    const el = document.createElement(S.cur.kind === 'vid' ? 'video' : 'audio');
    el.preload = 'metadata';
    if (S.cur.kind === 'vid') el.poster = `/api/uploads/${id}/thumb`;
    el.src = `/api/uploads/${id}/media`;
    el.playsInline = true;
    el.playbackRate = S.speed;
    ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => el.addEventListener(ev, paintPlayer));
    S.media = el;
    S.mediaId = id;
    return el;
  }
  // Aviso quando a pregação saiu do computador (fica salvo só o link) e botão para baixar de novo.
  function goneBanner() {
    const c = S.cur,
      card = $('#ap-card');
    if (!c || !card) return;
    // O vídeo veio num formato que este navegador não toca: o app prepara uma cópia e avisa quando ficar pronta.
    if (c.preview === 'making' && !c.originalGone && !c.refetching) {
      const n = document.createElement('div');
      n.className = 'ap-demo gone';
      n.setAttribute('role', 'status');
      n.textContent =
        'Preparando o vídeo para tocar neste navegador… A transcrição e os cortes já podem ser usados; o vídeo aparece sozinho quando ficar pronto.';
      card.prepend(n);
      clearInterval(S.poll);
      S.poll = setInterval(async () => {
        try {
          const m = await api('/uploads/' + c.id);
          if (m.preview !== 'making') {
            clearInterval(S.poll);
            if (S.media) {
              S.media.remove();
              S.media = null;
              S.mediaId = null;
            }
            go(location.pathname);
          }
        } catch {
          /* tenta de novo */
        }
      }, 4000);
      return;
    }
    if (!(c.originalGone || c.refetching)) return;
    const d = document.createElement('div');
    d.className = 'ap-demo gone';
    d.setAttribute('role', 'status');
    const wait = () => {
      clearInterval(S.poll);
      S.poll = setInterval(async () => {
        try {
          const m = await api('/uploads/' + c.id);
          if (!m.refetching) {
            clearInterval(S.poll);
            if (S.media) {
              S.media.remove();
              S.media = null;
              S.mediaId = null;
            }
            go(location.pathname);
          }
        } catch {
          /* tenta de novo */
        }
      }, 2500);
    };
    let starting = false;
    const start = guard(async () => {
      if (starting) return;
      starting = true;
      const btn = $('#refetch', d);
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Iniciando…';
      }
      try {
        await begin();
      } catch (e) {
        starting = false;
        paint();
        throw e;
      }
    });
    const begin = async () => {
      const run = (t) => api(`/uploads/${c.id}/refetch`, { json: t ? { token: t } : {} });
      try {
        await run();
      } catch (e) {
        if (!(e.data && e.data.needsLogin) || !(S.status && S.status.driveClientId)) throw e;
        await run(await googleToken(S.status.driveClientId));
      } // arquivo privado do Drive: entra com o Google e repete
      c.refetching = true;
      c.refetchError = null;
      paint();
      wait();
    };
    const paint = () => {
      d.innerHTML = c.refetching
        ? 'Baixando a pregação de novo… Pode levar alguns minutos. A transcrição e os cortes continuam disponíveis.'
        : c.canRefetch
          ? `<span>A pregação saiu deste computador para liberar espaço. A transcrição e os cortes continuam aqui; para assistir ou exportar um corte novo, baixe de novo.${c.refetchError ? `<br><b>${esc(c.refetchError)}</b>` : ''}</span><button class="ap-btn" id="refetch">Baixar de novo</button>`
          : 'O arquivo original não está mais neste computador e não há link salvo para baixá-lo de novo.';
      const b = $('#refetch', d);
      if (b) b.onclick = start;
    };
    paint();
    card.prepend(d);
    if (c.refetching) wait();
  }
  const parkMedia = () => {
    if (S.media) {
      S.media.hidden = true;
      document.body.appendChild(S.media);
    }
  };
  function mountMedia() {
    const el = ensureMedia();
    const slot = $('.vid-slot');
    if (slot && S.cur.kind === 'vid') {
      slot.innerHTML = '';
      el.hidden = false;
      el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;border-radius:inherit';
      slot.appendChild(el);
    } else {
      el.hidden = true;
      document.body.appendChild(el);
    }
  }
  const seek = (t) => {
    const el = ensureMedia();
    el.currentTime = t;
    paintPlayer();
  };
  const waveBins = (c) => {
    const n = 240,
      bins = new Array(n).fill(0),
      d = c.duration || 1;
    segsOf(c).forEach((s) => {
      const w = s.text.split(/\s+/).length,
        a = Math.floor((s.t / d) * n),
        b = Math.max(a, Math.min(n - 1, Math.floor((s.end / d) * n)));
      for (let i = a; i <= b; i++) bins[i] += w / (b - a + 1);
    });
    const mx = Math.max(...bins, 1);
    return bins.map((v) => 12 + 88 * (v / mx));
  };
  // Forma de onda de verdade (o volume do som), a mesma do editor. Chega um instante depois; até lá ficam as barras estimadas pela fala.
  const peaksCache = {};
  const paintPeaks = (id) => {
    const w = $('#wave'),
      pk = peaksCache[id];
    if (!w || !pk || !S.cur || S.cur.id !== id) return;
    [...w.children].forEach((e, i) => {
      e.style.height =
        Math.max(6, pk[Math.min(pk.length - 1, Math.floor((i / w.children.length) * pk.length))] * 100) + '%';
    });
    w.classList.add('real');
  };
  const loadPeaks = async (id) => {
    if (peaksCache[id]) return paintPeaks(id);
    try {
      const r = await api('/uploads/' + id + '/peaks?full=1');
      if (r && Array.isArray(r.peaks)) {
        peaksCache[id] = r.peaks;
        paintPeaks(id);
      }
    } catch {
      /* sem a onda real, ficam as barras estimadas */
    }
  };
  function player() {
    return `<div class="pbar"><div class="wave2" id="wave">${waveBins(S.cur)
      .map((h) => `<i style="height:${h}%"></i>`)
      .join('')}</div>
      <div class="pctl">${S.cur.kind === 'vid' ? `<div class="tg2"><button data-media="audio" class="${S.mode === 'audio' ? 'on' : ''}">Áudio</button><button data-media="video" class="${S.mode === 'video' ? 'on' : ''}">Vídeo</button></div>` : '<span></span>'}
      <div class="mid"><span class="tm" id="ptm">00:00 / ${tm(S.cur.duration)}</span><button id="pb" aria-label="Voltar 10 segundos" title="Voltar 10 segundos" class="pskip">−10s</button><button class="play" id="pp" aria-label="Reproduzir">${ic.play}</button><button id="pf" aria-label="Avançar 10 segundos" title="Avançar 10 segundos" class="pskip">+10s</button></div>
      <span class="iohint" title="Com a pregação tocando: I marca o início e O marca o fim de um corte novo"><kbd>I</kbd> início · <kbd>O</kbd> fim</span><button id="psp" class="ap-btn" style="height:28px">${S.speed}x</button></div></div>`;
  }
  // Durante a reprodução, a linha falada fica no topo da transcrição, logo abaixo da busca.
  // Se a pessoa rolou a página por conta própria nos últimos segundos, não puxamos a tela de volta.
  function followLine(i) {
    const el = S.media,
      card = $('#ap-card'),
      ln = i >= 0 && document.querySelector(`.ln[data-l="${i}"]`);
    if (!el || el.paused || !card || !ln || Date.now() - (S.userScrollAt || 0) < 4000) return;
    // O cabeçalho preso fica um pouco abaixo da borda do cartão (o recuo interno); a linha tem que parar logo abaixo dele.
    const head = $('.tr-head'),
      cr = card.getBoundingClientRect(),
      pad = parseFloat(getComputedStyle(card).paddingTop) || 0;
    const hr = head ? head.getBoundingClientRect() : null,
      inset = hr ? Math.min(pad, Math.max(0, hr.top - cr.top)) : 0;
    const top = ln.getBoundingClientRect().top - cr.top + card.scrollTop - inset - (head ? head.offsetHeight : 0) - 6;
    card.scrollTo({
      top: Math.max(0, top),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  function paintPlayer() {
    const w = $('#wave');
    if (!w || !S.media) return;
    const el = S.media,
      dur = S.cur.duration || el.duration || 1,
      t = el.currentTime || 0;
    const k = Math.floor((t / dur) * w.children.length);
    [...w.children].forEach((e, i) => e.classList.toggle('p', i < k));
    $('#ptm').textContent = `${tm(t)} / ${tm(dur)}`;
    $('#pp').innerHTML = el.paused ? ic.play : ic.pause;
    let act = -1;
    (S.segs || []).forEach((s, i) => {
      if (s.t <= t) act = i;
    });
    $$('.seg:not(.ln)').forEach((e) => e.classList.toggle('act', +e.dataset.i === act && !el.paused));
    let actL = -1;
    (S.lines || []).forEach((s, i) => {
      if (s.t <= t) actL = i;
    });
    $$('.ln').forEach((e) => e.classList.toggle('act', +e.dataset.l === actL && !el.paused));
    if (actL !== S.followL) {
      S.followL = actL;
      followLine(actL);
    }
  }
  // Marcar um corte ouvindo: I guarda o início, O fecha o corte no ponto atual e cria na aba Manuais.
  const markKey = async (e) => {
    const key = (e.key || '').toLowerCase();
    if ((key !== 'i' && key !== 'o') || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (
      !S.cur ||
      !S.media ||
      S.mediaId !== S.cur.id ||
      !/^\/app\/uploads\/[^/]+\//.test(location.pathname) ||
      document.querySelector('.dlx,.modal-bg')
    )
      return;
    e.preventDefault();
    const now = S.media.currentTime || 0;
    if (key === 'i') {
      S.markIn = { id: S.cur.id, t: now };
      return toast(`Início marcado em ${tm(now)}. Aperte O no fim do trecho.`);
    }
    if (!S.markIn || S.markIn.id !== S.cur.id) return toast('Aperte I onde o corte começa, depois O onde ele termina.');
    const a = Math.min(S.markIn.t, now),
      b = Math.max(S.markIn.t, now);
    if (b - a < 3)
      return toast('O corte precisa ter pelo menos 3 segundos. Deixe tocar mais um pouco e aperte O de novo.');
    try {
      await api(`/uploads/${S.cur.id}/clips`, {
        json: { title: `Corte ${tm(a)}`, start: +a.toFixed(2), end: +b.toFixed(2) },
      });
      S.markIn = null;
      toast(`Corte criado: ${tm(a)} → ${tm(b)} (${Math.round(b - a)} s). Está na aba Manuais.`);
      if (/\/clips$/.test(location.pathname)) go(location.pathname);
    } catch (err) {
      if (err.status === 401) go('/entrar');
      else toast(err.message);
    }
  };
  document.addEventListener('keydown', markKey);
  function bindPlayer() {
    if (!$('#wave')) return;
    const el = ensureMedia();
    loadPeaks(S.cur.id);
    $('#pp').onclick = () =>
      el.paused ? el.play().catch(() => toast('Não foi possível reproduzir este arquivo no navegador.')) : el.pause();
    $('#pb').onclick = () => seek(Math.max(0, el.currentTime - 10));
    $('#pf').onclick = () => seek(el.currentTime + 10);
    $('#psp').onclick = (e) => {
      S.speed = S.speed === 1 ? 1.5 : S.speed === 1.5 ? 2 : 1;
      el.playbackRate = S.speed;
      e.target.textContent = S.speed + 'x';
    };
    $('#wave').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      seek(((e.clientX - r.left) / r.width) * (S.cur.duration || el.duration || 0));
    };
    $$('[data-media]').forEach(
      (b) =>
        (b.onclick = () => {
          S.mode = b.dataset.media;
          $$('[data-media]').forEach((x) => x.classList.toggle('on', x === b));
          $$('.vid-slot').forEach((v) => (v.style.display = S.mode === 'audio' ? 'none' : ''));
        }),
    );
    paintPlayer();
  }

  /* ---------- Shell ---------- */
  const link = (href, ico, label, path) =>
    `<a class="ap-link ${path === href || (href !== '/app' && path.startsWith(href + '/') && !/uploads\/[^/]+/.test(href)) ? 'on' : ''}" href="${href}">${ico}${label}</a>`;
  // Versão do app: a data da última atualização e o código dela (ex.: 23/11/2026 · 38abb15).
  // "24/11/2026 12:00 · 0940d56": data e hora da última atualização (no fuso deste computador) e o código dela
  const verLabel = (v) => {
    const at = v.at ? new Date(v.at) : null;
    if (at && !isNaN(at)) {
      const p = (n) => String(n).padStart(2, '0');
      const when = `${p(at.getDate())}/${p(at.getMonth() + 1)}/${at.getFullYear()} ${p(at.getHours())}:${p(at.getMinutes())}`;
      return [when, v.commit].filter(Boolean).join(' · ');
    }
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.date || '');
    return [d ? `${d[3]}/${d[2]}/${d[1]}` : v.name, v.commit].filter(Boolean).join(' · ');
  };
  // Onde transcrever: Local (Whisper neste computador) ou na nuvem (Groq). Vale para as próximas pregações.
  const trIc = {
    local:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    cloud:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H7a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20 11.5 3.8 3.8 0 0 1 17.5 19z"/></svg>',
  };
  const trTitle = (t) =>
    !t.ok
      ? t.why
      : t.id === 'local'
        ? `Neste computador (Whisper ${t.model}). Não envia o áudio para fora; é mais lento.`
        : `Na nuvem (${t.name}, ${t.model}). Mais rápido; envia o áudio para a ${t.name}.`;
  const trBox = (st) =>
    !(st.transcribers && st.transcribers.length > 1)
      ? `<div class="ap-kv"><span>Transcrição</span><b><i class="dot on"></i>${esc(st.provider_name || 'API')}</b></div>`
      : `<div class="ap-kv ap-kv-tr"><span>Transcrição</span></div><div class="ap-mode ap-tr" role="group" aria-label="Onde transcrever">${st.transcribers.map((t) => `<button type="button" data-tr="${esc(t.id)}" aria-pressed="${st.provider === t.id}"${t.ok ? '' : ' aria-disabled="true"'} title="${esc(trTitle(t))}">${t.id === 'local' ? trIc.local : trIc.cloud}${esc(t.name)}</button>`).join('')}</div>`;
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-tr]');
    if (!b || !S.status) return;
    const t = (S.status.transcribers || []).find((x) => x.id === b.dataset.tr);
    if (!t || S.status.provider === t.id) return;
    if (!t.ok) return toast(t.why);
    try {
      await api('/transcriber', { json: { provider: t.id } });
      S.status.provider = t.id;
      S.status.provider_name = t.name;
      document.querySelectorAll('[data-tr]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.tr === t.id));
      toast(`Próximas transcrições: ${t.id === 'local' ? 'neste computador' : 'na ' + t.name}.`);
    } catch (er) {
      toast(er.message);
    }
  });
  // Interruptor de modo claro/noturno (aparece na barra lateral e na tela de entrada).
  document.addEventListener('click', (e) => {
    const g = e.target.closest && e.target.closest('[data-theme-set]');
    if (g && window.InvbTheme) {
      InvbTheme.set(g.dataset.themeSet);
      document
        .querySelectorAll('[data-theme-set]')
        .forEach((x) => x.setAttribute('aria-pressed', x.dataset.themeSet === InvbTheme.get()));
      return;
    }
    const b = e.target.closest && e.target.closest('[data-theme-sw]');
    if (!b || !window.InvbTheme) return;
    const t = InvbTheme.toggle();
    document.querySelectorAll('[data-theme-sw]').forEach((x) => x.setAttribute('aria-checked', t === 'dark'));
  });
  // Em que ponto a pregação está, em poucas palavras.
  const upWhere = (u) =>
    u.status === 'error'
      ? 'Erro ao processar'
      : u.status !== 'done'
        ? statusLabel(u)
        : u.cuts && u.cuts.total
          ? `${u.cuts.total} corte${u.cuts.total === 1 ? '' : 's'}${u.cuts.drive ? ` · ${u.cuts.drive} no Drive` : ''}`
          : 'Pronta para os cortes';
  function shell(path, inner, uid) {
    const up = uid ? `/app/uploads/${uid}` : null,
      st = S.status;
    const nav = up
      ? `<a class="ap-link" href="/app/uploads">${ic.back}Todas as pregações</a>${link(up + '/overview', ic.files, 'Resumo', path)}
         <div class="ap-sec">Passo a passo</div>${link(up + '/transcription', ic.doc, '1. Transcrição', path)}${link(up + '/clips', ic.cut, '2. Cortes', path)}
         <div class="ap-sec">Sobre a pregação</div>${link(up + '/chapters', ic.book, 'Capítulos', path)}${link(up + '/emotions', ic.heart, 'Emoções', path)}${link(up + '/diagrams', ic.dia, 'Diagramas', path)}`
      : `${path === '/app' || path === '/app/uploads/new' ? '' : '<a class="ap-new" href="/app/uploads/new"><span aria-hidden="true">+</span> Nova pregação</a>'}${link('/app', ic.home, 'Início', path)}${link('/app/uploads', ic.files, 'Pregações', path)}<a class="ap-link" href="/editor-avancado/" target="_blank" rel="noopener" title="Abre o editor de vídeo numa aba nova">${ic.clap}Editor avançado</a>`;
    return `<div class="ap">
      <div class="ap-top"><a href="/app"><b>INVB Studio</b></a><button id="ap-burger" aria-label="Abrir menu">☰</button></div>
      <aside class="ap-side" id="ap-side"><a class="ap-brand" href="/app" aria-label="INVB Studio, início"><img class="lg-c" src="/img/nv-logo-claro.png" alt="Nova Vida Botafogo"><img class="lg-n" src="/img/nv-logo-noturno.png" alt="Nova Vida Botafogo"><span class="ap-brand-sub">INVB<br>Studio</span></a>${nav}<div class="ap-grow"></div>
        ${st ? `<div class="ap-box" aria-label="Situação do app">${trBox(st)}<div class="ap-kv"><span>IA</span><b><i class="dot ${st.llm ? 'on' : ''}"></i>${st.llm ? esc(st.llmModel) : 'Desligada'}</b></div>${st.version ? `<div class="ap-kv" title="Versão do app neste computador: data da última atualização e código dela"><span>Versão</span><b>${esc(verLabel(st.version))}</b></div>` : '<div class="ap-kv" title="As telas foram atualizadas, mas o app que está aberto ainda é o antigo. Feche a janela do Terminal do app e abra de novo pelo iniciar."><span>Versão</span><b class="warn">Feche e abra o app</b></div>'}</div>` : ''}
        <div class="ap-foot2"><div class="ap-mode" role="group" aria-label="Modo de cores"><button data-theme-set="light" aria-pressed="${!(window.InvbTheme && InvbTheme.get() === 'dark')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Claro</button><button data-theme-set="dark" aria-pressed="${!!(window.InvbTheme && InvbTheme.get() === 'dark')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>Noturno</button></div><button class="ap-outb" id="ap-out" title="Sair do app" aria-label="Sair do app">${ic.out}</button></div></aside>
      <div class="ap-main"><div class="ap-card" id="ap-card">${inner}</div>${uid && S.cur && isDone(S.cur) ? player() : ''}</div></div>`;
  }
  Object.assign(INVB, { upWhere, seek, paintPlayer, parkMedia, shell, goneBanner, mountMedia, bindPlayer });
})();
