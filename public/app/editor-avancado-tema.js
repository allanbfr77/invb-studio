/* Editor avançado com a cara do INVB Studio. O servidor coloca este arquivo no começo das páginas do editor
   (lib/editor-static.js), antes do código dele.
   - Modo claro/noturno: o mesmo do Studio (chave "invb-tema"), dos dois lados: trocar no editor troca no Studio.
     É aplicado já no começo, para nada piscar na cor errada.
   - Nome e ícone da aba: os do Studio. Só depois que o editor termina de montar a página: mexer antes faz o
     React (que monta o editor) reclamar que a página não é a que ele esperava.
   - A logo da igreja e o "V" no lugar da marca do OpenCut vêm só do CSS (public/css/editor-avancado.css). */
(function () {
  var KEY = 'invb-tema';
  var TITLE = 'Editor avançado · INVB Studio';
  var ICON = '/img/nv-v.png?v=2';
  var TOUCH = '/apple-touch-icon.png?v=2';
  var saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {
    /* navegação privada: segue o sistema */
  }
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = saved === 'dark' || saved === 'light' ? saved : dark ? 'dark' : 'light';
  try {
    localStorage.setItem('theme', theme); // a chave que o editor lê (next-themes): ele já abre no modo do Studio
  } catch (e) {
    /* ok */
  }
  var root = document.documentElement;

  // trocar o modo dentro do editor também troca no Studio
  new MutationObserver(function () {
    var t = root.classList.contains('dark') ? 'dark' : root.classList.contains('light') ? 'light' : null;
    if (!t || t === theme) return;
    theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch (e) {
      /* ok */
    }
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  function tab() {
    if (document.title !== TITLE) document.title = TITLE;
    var links = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
    for (var i = 0; i < links.length; i++) {
      var want =
        links[i].rel === 'apple-touch-icon'
          ? TOUCH
          : /\.ico/.test(links[i].getAttribute('href') || '')
            ? '/favicon.ico?v=2'
            : ICON;
      if (links[i].getAttribute('href') !== want) links[i].setAttribute('href', want);
    }
  }
  var queued = false;
  function start() {
    tab();
    // o editor troca o título e os ícones ao mudar de tela: volta a pôr os do Studio
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        tab();
      });
    }).observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  if (document.readyState === 'complete') setTimeout(start, 300);
  else
    window.addEventListener('load', function () {
      setTimeout(start, 300);
    });

  /* ----- Exportação protegida -----
     O painel de exportar do editor é um balão que fecha ao clicar fora dele, e fechar o balão cancela a exportação.
     Enquanto ele mostra "Exportando projeto", cliques e toques fora do balão e a tecla Esc não chegam ao editor
     (o balão fica aberto, a exportação segue) e aparece um aviso. Dentro do balão tudo funciona, inclusive "Cancelar".
     Fechar ou recarregar a aba pede confirmação. */
  function exportPanel() {
    var hs = document.querySelectorAll('[data-radix-popper-content-wrapper] h3');
    for (var i = 0; i < hs.length; i++)
      if (/^Exportando projeto/.test((hs[i].textContent || '').trim()))
        return hs[i].closest('[data-radix-popper-content-wrapper]');
    return null;
  }
  var noteT = null;
  function note() {
    var n = document.getElementById('invb-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'invb-note';
      n.className = 'invb-note';
      n.setAttribute('role', 'status');
      n.textContent = 'Aguarde a exportação terminar. Para parar, use “Cancelar” no painel de exportar.';
      document.body.appendChild(n);
    }
    n.classList.add('on');
    clearTimeout(noteT);
    noteT = setTimeout(function () {
      n.classList.remove('on');
    }, 2600);
  }
  function guard(e) {
    var panel = exportPanel();
    if (!panel) return;
    if (e.type === 'keydown') {
      if (e.key !== 'Escape') return;
    } else if (panel.contains(e.target) || (e.target.closest && e.target.closest('#invb-send, #invb-note'))) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    // no mousedown, impedir o padrão também impede o foco de sair do balão (o que também o fecharia)
    if (e.type !== 'focusin' && e.cancelable) e.preventDefault();
    if (e.type === 'pointerdown' || e.type === 'keydown') note();
  }
  ['pointerdown', 'mousedown', 'touchstart', 'click', 'focusin', 'keydown'].forEach(function (t) {
    window.addEventListener(t, guard, { capture: true, passive: false });
  });
  window.addEventListener('beforeunload', function (e) {
    if (!exportPanel()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ----- Exportar → "Enviar pro Studio" -----
     O editor entrega o arquivo exportado sempre do mesmo jeito: cria um endereço temporário para o vídeo
     (URL.createObjectURL) e clica num link de download. Aqui esse clique, quando é de um vídeo, abre a janela
     "Enviar pro Studio" (como pregação nova ou no lugar do vídeo de uma pregação), com a opção de baixar também.
     Não mexe no código do editor: continua valendo depois de um novo build:studio. */
  var blobs = {};
  var createURL = URL.createObjectURL,
    revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = function (o) {
    var u = createURL.apply(URL, arguments);
    if (o instanceof Blob) blobs[u] = o;
    return u;
  };
  URL.revokeObjectURL = function (u) {
    delete blobs[u];
    return revokeURL.apply(URL, arguments);
  };
  var click = HTMLAnchorElement.prototype.click;
  var isVideo = function (b, name) {
    return /^video\//.test(b.type || '') || /\.(mp4|webm|mov|m4v)$/i.test(name || '');
  };
  HTMLAnchorElement.prototype.click = function () {
    var b = this.download && blobs[this.href];
    if (b && !this.__invbPass && isVideo(b, this.download)) {
      offer(b, this.download);
      return;
    }
    return click.apply(this, arguments);
  };
  function saveLocal(b, name) {
    var u = createURL.call(URL, b),
      a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.__invbPass = true;
    document.body.appendChild(a);
    click.call(a);
    a.remove();
    setTimeout(function () {
      revokeURL.call(URL, u);
    }, 4000);
  }
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var mb = function (n) {
    return (n / 1048576).toFixed(n > 104857600 ? 0 : 1).replace('.', ',') + ' MB';
  };
  function api(url) {
    return fetch(url, { headers: { 'x-invb': '1' }, credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) throw new Error('login');
      return r.json();
    });
  }

  /* ----- YouTube: login, envio e thumbnail (tudo direto do navegador para o YouTube) ----- */
  var YT_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
  function loadGsi() {
    return new Promise(function (ok, bad) {
      if (window.google && google.accounts && google.accounts.oauth2) return ok();
      var sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = ok;
      sc.onerror = function () {
        bad(new Error('Não foi possível carregar o login do Google.'));
      };
      document.head.appendChild(sc);
    });
  }
  function ytToken(clientId) {
    return loadGsi().then(function () {
      return new Promise(function (ok, bad) {
        google.accounts.oauth2
          .initTokenClient({
            client_id: clientId,
            scope: YT_SCOPE,
            callback: function (t) {
              t && t.access_token ? ok(t.access_token) : bad(new Error('Não foi possível entrar com o Google.'));
            },
            error_callback: function () {
              bad(new Error('Login do Google cancelado ou bloqueado pelo navegador.'));
            },
          })
          .requestAccessToken({ prompt: '' });
      });
    });
  }
  // envio com andamento: devolve { status, json, xhr }
  function send(url, body, headers, onprog, method) {
    return new Promise(function (ok, bad) {
      var x = new XMLHttpRequest();
      x.open(method || 'POST', url);
      for (var h in headers || {}) x.setRequestHeader(h, headers[h]);
      if (onprog)
        x.upload.onprogress = function (e) {
          if (e.lengthComputable) onprog(e.loaded / e.total);
        };
      x.onload = function () {
        var j = {};
        try {
          j = JSON.parse(x.responseText || '{}');
        } catch (e) {
          /* sem corpo */
        }
        ok({ status: x.status, json: j, xhr: x });
      };
      x.onerror = function () {
        bad(new Error('Sem conexão (' + url.split('?')[0].replace(/^https?:\/\//, '') + ').'));
      };
      x.send(body);
    });
  }
  var ytErr = function (j, def) {
    var e = j && j.error;
    var reason = e && e.errors && e.errors[0] && e.errors[0].reason;
    if (reason === 'quotaExceeded') return 'O limite diário de envios da API do YouTube acabou. Tente amanhã.';
    if (reason === 'youtubeSignupRequired' || reason === 'channelNotFound')
      return 'Esta conta do Google não tem canal no YouTube. Entre com a conta do canal da igreja.';
    if (/accessNotConfigured|SERVICE_DISABLED/.test(JSON.stringify(e || '')))
      return 'A API do YouTube não está ativada no projeto do Google (YouTube Data API v3).';
    if (reason === 'forbidden' && def === 'thumb')
      return 'O YouTube não aceitou a thumbnail: o canal precisa estar verificado por telefone.';
    return (e && e.message) || 'O YouTube recusou o envio.';
  };
  // envio retomável (o jeito do YouTube para arquivos grandes): abre a sessão e manda o vídeo
  async function ytUpload(token, blob, meta, onprog) {
    var body = JSON.stringify({
      snippet: {
        title: meta.title.slice(0, 100),
        description: meta.description || '',
        categoryId: '29',
        defaultLanguage: 'pt-BR',
        defaultAudioLanguage: 'pt-BR',
      },
      status: { privacyStatus: meta.privacy || 'private', selfDeclaredMadeForKids: false },
    });
    var r = await send(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      body,
      {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'video/mp4',
        'X-Upload-Content-Length': String(blob.size),
      },
    );
    var loc = r.xhr.getResponseHeader('Location') || r.xhr.getResponseHeader('location');
    if (r.status !== 200 || !loc) throw new Error(ytErr(r.json));
    var up = await send(loc, blob, { 'Content-Type': blob.type || 'video/mp4' }, onprog, 'PUT');
    if ((up.status !== 200 && up.status !== 201) || !up.json.id) throw new Error(ytErr(up.json));
    return up.json.id;
  }
  async function ytThumb(token, videoId, jpg) {
    var r = await send(
      'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' + encodeURIComponent(videoId),
      jpg,
      {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'image/jpeg',
      },
    );
    if (r.status !== 200) throw new Error(ytErr(r.json, 'thumb'));
  }
  // thumbnail: um quadro do vídeo, ou o modelo da igreja por cima dele
  function videoFrom(blob) {
    return new Promise(function (ok, bad) {
      var v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = createURL.call(URL, blob);
      v.onloadedmetadata = function () {
        ok(v);
      };
      v.onerror = function () {
        bad(new Error('Não consegui abrir o vídeo para a thumbnail.'));
      };
    });
  }
  function seek(v, t) {
    return new Promise(function (ok) {
      var done = function () {
        v.removeEventListener('seeked', done);
        ok();
      };
      v.addEventListener('seeked', done);
      v.currentTime = Math.max(0, Math.min((v.duration || 1) - 0.05, t));
      setTimeout(done, 1500);
    });
  }
  function loadImg(src) {
    return new Promise(function (ok, bad) {
      var i = new Image();
      i.onload = function () {
        ok(i);
      };
      i.onerror = bad;
      i.src = src;
    });
  }
  function clearCanvas(cv) {
    var g = cv.getContext('2d');
    g.fillStyle = '#16140f';
    g.fillRect(0, 0, cv.width, cv.height);
  }
  function drawCover(cv, src) {
    var g = cv.getContext('2d'),
      W = cv.width,
      H = cv.height;
    var sw = src.videoWidth || src.naturalWidth || src.width,
      sh = src.videoHeight || src.naturalHeight || src.height;
    var k = Math.max(W / sw, H / sh);
    clearCanvas(cv);
    g.drawImage(src, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
  }
  var fontsReady = null;
  function thumbFonts() {
    if (!fontsReady)
      fontsReady = Promise.all([
        new FontFace('INVB Thumb', 'url(/fonts/Montserrat-ExtraBold.ttf)').load(),
        new FontFace('INVB Thumb 2', 'url(/fonts/Poppins-SemiBold.ttf)').load(),
      ]).then(function (fs) {
        fs.forEach(function (f) {
          document.fonts.add(f);
        });
      });
    return fontsReady;
  }
  function wrapLines(g, text, maxW, maxLines) {
    var words = String(text).split(/\s+/),
      lines = [],
      cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryL = cur ? cur + ' ' + words[i] : words[i];
      if (g.measureText(tryL).width > maxW && cur) {
        lines.push(cur);
        cur = words[i];
      } else cur = tryL;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    }
    return lines;
  }
  // modelo da igreja: o quadro escurecido à esquerda, a logo, o título em letras grandes e a linha dourada
  async function churchThumb(cv, video, title, sub) {
    await thumbFonts().catch(function () {});
    var g = cv.getContext('2d'),
      W = cv.width,
      H = cv.height;
    drawCover(cv, video);
    var grd = g.createLinearGradient(0, 0, W * 0.85, 0);
    grd.addColorStop(0, 'rgba(10,10,11,0.92)');
    grd.addColorStop(0.55, 'rgba(10,10,11,0.6)');
    grd.addColorStop(1, 'rgba(10,10,11,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    try {
      var logo = await loadImg('/img/nv-logo-noturno.png');
      g.drawImage(logo, 70, 60, 200, 79);
    } catch (e) {
      /* sem logo */
    }
    g.fillStyle = '#f0b93a';
    g.fillRect(70, 190, 120, 10);
    g.fillStyle = '#ffffff';
    var size = 92;
    g.font = size + "px 'INVB Thumb', 'Montserrat', sans-serif";
    var lines = wrapLines(g, String(title || '').toUpperCase(), W * 0.62, 3);
    if (lines.length === 3) {
      size = 78;
      g.font = size + "px 'INVB Thumb', 'Montserrat', sans-serif";
      lines = wrapLines(g, String(title || '').toUpperCase(), W * 0.62, 3);
    }
    g.textBaseline = 'top';
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 12;
    lines.forEach(function (l, i) {
      g.fillText(l, 70, 230 + i * (size * 1.08));
    });
    if (sub) {
      g.font = "40px 'INVB Thumb 2', 'Poppins', sans-serif";
      g.fillStyle = '#f6d27a';
      g.fillText(sub, 72, 230 + lines.length * (size * 1.08) + 24);
    }
    g.shadowBlur = 0;
  }
  function canvasJpeg(cv) {
    return new Promise(function (ok, bad) {
      var q = 0.9;
      (function go() {
        cv.toBlob(
          function (b) {
            if (!b) return bad(new Error('Não consegui gerar a imagem.'));
            if (b.size > 2 * 1048576 && q > 0.5) {
              q -= 0.1;
              return go();
            }
            ok(b);
          },
          'image/jpeg',
          q,
        );
      })();
    });
  }

  function offer(blob, fileName, opts) {
    opts = opts || {};
    var old = document.getElementById('invb-send');
    if (old) old.remove();
    var ext = (/\.[a-z0-9]+$/i.exec(fileName) || ['.mp4'])[0].toLowerCase();
    var title = fileName.replace(/\.[a-z0-9]+$/i, '');
    var box = document.createElement('div');
    box.id = 'invb-send';
    box.className = 'invb-send';
    box.innerHTML =
      '<div class="invb-card" role="dialog" aria-modal="true" aria-labelledby="invb-send-t">' +
      '<h2 id="invb-send-t">Vídeo exportado</h2>' +
      '<p class="invb-sub">' +
      esc(fileName) +
      ' · ' +
      mb(blob.size) +
      '</p>' +
      '<div class="invb-opts">' +
      '<label class="invb-opt"><input type="radio" name="invb-dest" value="new" checked><span><b>Enviar pro Studio como pregação nova</b><small>Aparece em Pregações e é transcrita.</small></span></label>' +
      '<label class="invb-opt"><input type="radio" name="invb-dest" value="replace"><span><b>Substituir o vídeo de uma pregação</b><small>A versão editada passa a ser a base da transcrição e dos cortes. A minutagem começa no início deste vídeo.</small></span></label>' +
      '<label class="invb-opt"><input type="radio" name="invb-dest" value="none"><span><b>Não enviar pro Studio</b><small>Só baixa no computador (e publica no YouTube, se marcar abaixo).</small></span></label>' +
      '</div>' +
      '<div class="invb-f" data-for="new"><label for="invb-title">Nome da pregação</label><input id="invb-title" value="' +
      esc(title) +
      '"></div>' +
      '<div class="invb-f" data-for="replace" hidden><label for="invb-up">Qual pregação</label><select id="invb-up"><option value="">Carregando…</option></select><p class="invb-warn" id="invb-warn"></p></div>' +
      '<label class="invb-chk" data-for-not="none"><input type="checkbox" id="invb-dl"> Baixar também no computador</label>' +
      '<div class="invb-yt"><label class="invb-chk invb-ytchk"><input type="checkbox" id="invb-yt"> <b>Publicar no YouTube</b></label>' +
      '<div class="invb-ytf" hidden>' +
      '<div class="invb-f"><label for="invb-yt-title">Título</label><input id="invb-yt-title" maxlength="100"></div>' +
      '<div class="invb-f"><label for="invb-yt-desc">Descrição</label><textarea id="invb-yt-desc" rows="4" maxlength="5000"></textarea></div>' +
      '<div class="invb-f"><label for="invb-yt-priv">Visibilidade</label><select id="invb-yt-priv"><option value="private">Privado (só quem você convidar)</option><option value="unlisted">Não listado (quem tiver o link)</option><option value="public">Público</option></select></div>' +
      '<div class="invb-f"><label>Thumbnail</label><div class="invb-chips">' +
      '<label><input type="radio" name="invb-th" value="tpl" checked> Modelo da igreja</label>' +
      '<label><input type="radio" name="invb-th" value="frame"> Quadro do vídeo</label>' +
      '<label><input type="radio" name="invb-th" value="file"> Imagem pronta</label>' +
      '<label><input type="radio" name="invb-th" value="none"> O YouTube escolhe</label></div>' +
      '<div class="invb-th" data-th><canvas id="invb-th-cv" width="1280" height="720"></canvas>' +
      '<div class="invb-thc"><label data-th-t>Momento do vídeo <input type="range" id="invb-th-t" min="0" max="1000" value="250"></label>' +
      '<label data-th-sub>Linha de baixo (ex.: nome do pregador) <input id="invb-th-sub" maxlength="60" placeholder="Pr. Nome · Nova Vida Botafogo"></label>' +
      '<label data-th-file hidden>Imagem (JPG ou PNG, até 2 MB) <input type="file" id="invb-th-file" accept="image/jpeg,image/png"></label></div></div>' +
      '<p class="invb-sub" style="margin:6px 0 0">A thumbnail personalizada só funciona com o canal verificado por telefone.</p></div>' +
      '</div></div>' +
      '<div class="invb-bar" hidden><i></i></div><p class="invb-msg" role="status"></p>' +
      '<div class="invb-act"><button type="button" class="invb-btn" data-x>Fechar</button><button type="button" class="invb-btn pri" data-go>Enviar pro Studio</button></div>' +
      '</div>';
    document.body.appendChild(box);
    var $ = function (sel) {
      return box.querySelector(sel);
    };
    var ups = [];
    // projeto aberto a partir de uma pregação do Studio: a sugestão é substituir o vídeo dela
    var linked = linkedPregacao();
    if (linked) box.querySelector('input[name="invb-dest"][value="replace"]').checked = true;
    // vindo do "Cortar no Studio": o vídeo já está no Studio, aqui é só publicar
    if (opts.studioDone) {
      box.querySelector('input[name="invb-dest"][value="none"]').checked = true;
      box.querySelector('.invb-opts').hidden = true;
      $('#invb-send-t').textContent = 'Publicar a versão cortada';
      $('#invb-yt').checked = true;
    }
    var dest = function () {
      return box.querySelector('input[name="invb-dest"]:checked').value;
    };
    var warn = function () {
      var u = ups.find(function (x) {
        return x.id === $('#invb-up').value;
      });
      var n = u && u.cuts ? u.cuts.total : 0;
      $('#invb-warn').textContent = u
        ? 'A transcrição é refeita' +
          (n ? ' e os ' + n + ' corte' + (n > 1 ? 's' : '') + ' desta pregação são apagados (a minutagem muda).' : '.')
        : '';
    };
    var sync = function () {
      var d = dest();
      box.querySelectorAll('[data-for]').forEach(function (e) {
        e.hidden = e.getAttribute('data-for') !== d;
      });
      $('[data-for-not]').hidden = d === 'none' && !opts.studioDone;
      var ytOn = $('#invb-yt') && $('#invb-yt').checked;
      $('[data-go]').textContent =
        d === 'none' ? (ytOn ? 'Publicar no YouTube' : 'Baixar') : ytOn ? 'Enviar e publicar' : 'Enviar pro Studio';
      if (d === 'replace' && !ups.length)
        api('/api/uploads')
          .then(function (l) {
            ups = l
              .filter(function (x) {
                return x.kind !== 'aud' && ['done', 'error', 'waiting'].indexOf(x.status) >= 0;
              })
              .sort(function (a, b) {
                return (b.createdAt || 0) - (a.createdAt || 0);
              });
            $('#invb-up').innerHTML = ups.length
              ? ups
                  .map(function (x) {
                    return (
                      '<option value="' +
                      esc(x.id) +
                      '"' +
                      (x.id === linked ? ' selected' : '') +
                      '>' +
                      esc(x.title || x.name) +
                      (x.status === 'waiting' ? ' (aguardando o corte)' : '') +
                      '</option>'
                    );
                  })
                  .join('')
              : '<option value="">Nenhuma pregação pronta no Studio</option>';
            warn();
          })
          .catch(function (e) {
            $('#invb-up').innerHTML =
              '<option value="">' +
              (e.message === 'login' ? 'Entre no Studio primeiro' : 'Não consegui ler as pregações') +
              '</option>';
          });
    };
    box.querySelectorAll('input[name="invb-dest"]').forEach(function (r) {
      r.onchange = sync;
    });
    $('#invb-up').onchange = warn;
    var close = function () {
      box.remove();
    };
    $('[data-x]').onclick = close;
    box.addEventListener('keydown', function (e) {
      e.stopPropagation(); // os atalhos do editor não valem enquanto a janela está aberta
      if (e.key === 'Escape') close();
    });
    // ----- YouTube: campos, thumbnail e o envio -----
    var cid = null;
    api('/api/status')
      .then(function (st) {
        cid = st.driveClientId || null;
      })
      .catch(function () {});
    loadGsi().catch(function () {}); // já carrega o login do Google, para o clique abrir a janela sem bloqueio
    var projName = ((document.querySelector('header input') || {}).value || '').trim();
    $('#invb-yt-title').value = projName && projName !== 'Novo projeto' ? projName : title;
    $('#invb-yt-desc').value = ($('#invb-yt-title').value || title) + '\n\nNova Vida Botafogo';
    var vid = null;
    var thumbFile = null;
    var drawThumb = async function () {
      var kind = (box.querySelector('input[name="invb-th"]:checked') || {}).value || 'none';
      var area = $('[data-th]');
      area.hidden = kind === 'none';
      $('[data-th-t]').hidden = kind === 'file' || kind === 'none';
      $('[data-th-sub]').hidden = kind !== 'tpl';
      $('[data-th-file]').hidden = kind !== 'file';
      if (kind === 'none') return;
      var cv = $('#invb-th-cv');
      try {
        if (kind === 'file') {
          if (thumbFile) await drawCover(cv, await loadImg(URL.createObjectURL(thumbFile)));
          else clearCanvas(cv);
          return;
        }
        if (!vid) vid = await videoFrom(blob);
        var t = (vid.duration || 0) * (+$('#invb-th-t').value / 1000);
        await seek(vid, t);
        if (kind === 'frame') return drawCover(cv, vid);
        await churchThumb(cv, vid, $('#invb-yt-title').value || title, $('#invb-th-sub').value);
      } catch (e) {
        clearCanvas(cv);
      }
    };
    var ytSync = function () {
      $('.invb-ytf').hidden = !$('#invb-yt').checked;
      if ($('#invb-yt').checked) drawThumb();
      sync();
    };
    $('#invb-yt').onchange = ytSync;
    box.querySelectorAll('input[name="invb-th"]').forEach(function (r) {
      r.onchange = drawThumb;
    });
    var redraw = null;
    ['#invb-th-t', '#invb-th-sub', '#invb-yt-title'].forEach(function (sel) {
      $(sel).addEventListener('input', function () {
        clearTimeout(redraw);
        redraw = setTimeout(drawThumb, 200);
      });
    });
    $('#invb-th-file').onchange = function () {
      thumbFile = this.files[0] || null;
      drawThumb();
    };

    $('[data-go]').onclick = async function () {
      var d = dest(),
        yt = $('#invb-yt').checked,
        msg = $('.invb-msg'),
        go = $('[data-go]'),
        bar = $('.invb-bar');
      var say = function (t, html) {
        msg[html ? 'innerHTML' : 'textContent'] = t;
      };
      var prog = function (f) {
        bar.hidden = false;
        bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
      };
      if (d === 'none' && !yt) {
        if (opts.studioDone && !$('#invb-dl').checked) return close();
        saveLocal(blob, fileName);
        return close();
      }
      // o que vai para o Studio
      var url = null,
        target = null;
      if (d === 'new') {
        var t = ($('#invb-title').value || '').trim() || title;
        url = '/api/uploads?name=' + encodeURIComponent(t + ext);
      } else if (d === 'replace') {
        var id = $('#invb-up').value;
        if (!id) return say('Escolha a pregação.');
        var u = ups.find(function (x) {
          return x.id === id;
        });
        var n = u && u.cuts ? u.cuts.total : 0;
        if (
          n &&
          !window.confirm(
            'Os ' +
              n +
              ' corte(s) de “' +
              (u.title || u.name) +
              '” vão ser apagados, porque a minutagem muda. Continuar?',
          )
        )
          return;
        url = '/api/uploads/' + encodeURIComponent(id) + '/edited?name=' + encodeURIComponent(fileName);
        target = id;
      }
      // o login do Google primeiro, ainda dentro do clique (senão o navegador bloqueia a janela de login)
      var token = null;
      if (yt) {
        if (!cid) return say('O login do Google não está configurado no Studio (GOOGLE_CLIENT_ID).');
        if (!($('#invb-yt-title').value || '').trim()) return say('Dê um título ao vídeo do YouTube.');
        go.disabled = true;
        say('Entrando no Google…');
        try {
          token = await ytToken(cid);
        } catch (e) {
          go.disabled = false;
          return say(e.message);
        }
      }
      go.disabled = true;
      if ((d === 'none' && !opts.studioDone) || $('#invb-dl').checked) saveLocal(blob, fileName);
      var lines = [];
      try {
        if (url) {
          say('Enviando pro Studio…');
          var r = await send(url, blob, { 'x-invb': '1' }, prog);
          if (r.status === 401)
            throw new Error('Entre no Studio primeiro (abra o Studio e faça login) e tente de novo.');
          if (r.status < 200 || r.status >= 300 || !r.json.id)
            throw new Error(r.json.error || 'Não consegui enviar pro Studio.');
          target = target || r.json.id;
          lines.push(
            '✓ No Studio: <a href="/app/uploads/' +
              esc(r.json.id) +
              '/transcription" target="_blank" rel="noopener">abrir</a>',
          );
          say(lines.join('<br>'), true);
        }
        if (yt) {
          prog(0);
          say(lines.concat('Enviando pro YouTube… (não feche esta aba)').join('<br>'), true);
          var v = await ytUpload(
            token,
            blob,
            {
              title: $('#invb-yt-title').value.trim(),
              description: $('#invb-yt-desc').value,
              privacy: $('#invb-yt-priv').value,
            },
            prog,
          );
          var link = 'https://youtu.be/' + v;
          lines.push('✓ No YouTube: <a href="' + link + '" target="_blank" rel="noopener">' + link + '</a>');
          // thumbnail
          var kind = (box.querySelector('input[name="invb-th"]:checked') || {}).value;
          if (kind && kind !== 'none' && (kind !== 'file' || thumbFile)) {
            say(lines.concat('Enviando a thumbnail…').join('<br>'), true);
            try {
              await drawThumb();
              var jpg = await canvasJpeg($('#invb-th-cv'));
              await ytThumb(token, v, jpg);
              lines.push('✓ Thumbnail enviada');
            } catch (e) {
              lines.push('⚠ Thumbnail: ' + esc(e.message));
            }
          }
          // a pregação do Studio guarda o link do YouTube (e a limpeza passa a contar com ele)
          var who = target || linked;
          if (who)
            await fetch('/api/uploads/' + encodeURIComponent(who) + '/youtube', {
              method: 'POST',
              headers: { 'x-invb': '1', 'content-type': 'application/json' },
              body: JSON.stringify({
                videoId: v,
                privacy: $('#invb-yt-priv').value,
                title: $('#invb-yt-title').value.trim(),
              }),
            }).catch(function () {});
        }
        prog(1);
        say(lines.join('<br>') || '✓ Pronto.', true);
        go.hidden = true;
      } catch (e) {
        go.disabled = false;
        say(lines.concat('⚠ ' + esc(e.message)).join('<br>'), true);
      }
    };
    sync();
    if (opts.studioDone) {
      $('.invb-ytf').hidden = false;
      drawThumb();
    }
  }

  /* ----- Pregações do Studio dentro do editor -----
     Na tela de projetos aparece a seção "Pregações do Studio". Cada pregação tem um projeto só (a ligação fica
     guardada neste navegador): abrir de novo cai no mesmo projeto, com as edições. Na primeira vez, o script cria o
     projeto com o nome da pregação, traz o vídeo do Studio e o coloca no começo da linha do tempo.
     Tudo pela própria tela do editor (os botões e campos dele); o banco do editor só é lido, para saber se o projeto
     ainda existe. O Studio abre direto uma pregação com /editor-avancado/projects?pregacao=<id>. */
  var MAPKEY = 'invb-pregacao-projetos';
  var PENDING = 'invb-pregacao-pendente';
  function loadMap() {
    try {
      return JSON.parse(localStorage.getItem(MAPKEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function saveMap(m) {
    try {
      localStorage.setItem(MAPKEY, JSON.stringify(m));
    } catch (e) {
      /* ok */
    }
  }
  function currentProject() {
    return /\/editor-avancado\/editor/.test(location.pathname) ? new URLSearchParams(location.search).get('id') : null;
  }
  function linkedPregacao() {
    var pid = currentProject(),
      m = loadMap();
    if (!pid) return null;
    for (var k in m) if (m[k] === pid) return k;
    return null;
  }
  // o projeto ainda existe no banco do editor? (só leitura)
  function projectExists(pid) {
    return new Promise(function (ok) {
      try {
        var rq = indexedDB.open('video-editor-projects');
        rq.onerror = function () {
          ok(true); // sem como conferir: tenta abrir
        };
        rq.onsuccess = function () {
          var db = rq.result;
          try {
            var g = db.transaction('projects', 'readonly').objectStore('projects').get(pid);
            g.onsuccess = function () {
              ok(!!g.result);
              db.close();
            };
            g.onerror = function () {
              ok(true);
              db.close();
            };
          } catch (e) {
            ok(true);
            db.close();
          }
        };
      } catch (e) {
        ok(true);
      }
    });
  }
  var wait = function (fn, ms) {
    return new Promise(function (ok, err) {
      var t0 = Date.now();
      (function loop() {
        var v = fn();
        if (v) return ok(v);
        if (Date.now() - t0 > (ms || 15000)) return err(new Error('tempo esgotado'));
        setTimeout(loop, 150);
      })();
    });
  };
  var sleep = function (ms) {
    return new Promise(function (ok) {
      setTimeout(ok, ms);
    });
  };
  var titleOf = function (u) {
    return String(u.title || u.name || 'Pregação').replace(/\.[a-z0-9]{2,4}$/i, '');
  };
  var hms = function (s) {
    s = Math.round(s || 0);
    var h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  };
  function busy(text, pct) {
    var o = document.getElementById('invb-busy');
    if (!o) {
      o = document.createElement('div');
      o.id = 'invb-busy';
      o.className = 'invb-send';
      o.innerHTML =
        '<div class="invb-card"><h2>Trazendo a pregação do Studio</h2><p class="invb-sub" id="invb-busy-t"></p><div class="invb-bar"><i></i></div></div>';
      document.body.appendChild(o);
    }
    o.querySelector('#invb-busy-t').textContent = text;
    if (pct != null) o.querySelector('.invb-bar i').style.width = Math.max(2, Math.min(100, pct)) + '%';
    return o;
  }
  function doneBusy() {
    var o = document.getElementById('invb-busy');
    if (o) o.remove();
  }
  function toast(text) {
    var n = document.getElementById('invb-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'invb-note';
      n.className = 'invb-note';
      n.setAttribute('role', 'status');
      document.body.appendChild(n);
    }
    n.textContent = text;
    n.classList.add('on');
    clearTimeout(noteT);
    noteT = setTimeout(function () {
      n.classList.remove('on');
    }, 5000);
  }
  // abre (ou cria) o projeto da pregação
  async function openPregacao(id) {
    var m = loadMap(),
      pid = m[id];
    if (pid && (await projectExists(pid))) {
      location.href = '/editor-avancado/editor?id=' + encodeURIComponent(pid);
      return;
    }
    var u;
    try {
      u = await api('/api/uploads/' + encodeURIComponent(id));
    } catch (e) {
      return toast(
        e.message === 'login' ? 'Entre no Studio primeiro e tente de novo.' : 'Não achei essa pregação no Studio.',
      );
    }
    if (u.originalGone || u.refetching)
      return toast(
        'O vídeo dessa pregação saiu do computador. No Studio, clique em "Baixar de novo" e tente outra vez.',
      );
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ id: id, title: titleOf(u), at: Date.now() }));
    } catch (e) {
      /* ok */
    }
    var b = await wait(function () {
      var bs = document.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++)
        if (/^(Novo projeto|Criar primeiro projeto)/.test(bs[i].textContent.trim())) return bs[i]; // "Novo projetoNovo": o texto curto vem junto
      return null;
    }).catch(function () {
      return null;
    });
    if (!b) return toast('Não achei o botão "Novo projeto" do editor.');
    b.click();
  }
  // no editor recém-criado: nome, vídeo do Studio e linha do tempo
  async function fillPending() {
    var p = null;
    try {
      p = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
    } catch (e) {
      /* ok */
    }
    var pid = currentProject();
    if (!p || !pid || Date.now() - p.at > 120000) return;
    sessionStorage.removeItem(PENDING);
    var m = loadMap();
    m[p.id] = pid;
    saveMap(m);
    try {
      busy('Preparando o projeto…', 2);
      // 1) nome do projeto = nome da pregação (o campo do topo vira editável ao clicar)
      var inp = await wait(function () {
        return document.querySelector('header input');
      });
      inp.click();
      await sleep(150);
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, p.title);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      inp.blur();
      // 2) o vídeo, direto do Studio (com o andamento)
      busy('Baixando o vídeo do Studio…', 3);
      var r = await fetch('/api/uploads/' + encodeURIComponent(p.id) + '/media', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('O Studio não entregou o vídeo (' + r.status + ').');
      var total = +r.headers.get('content-length') || 0,
        got = 0,
        parts = [],
        rd = r.body.getReader();
      for (;;) {
        var c = await rd.read();
        if (c.done) break;
        parts.push(c.value);
        got += c.value.length;
        busy(
          'Baixando o vídeo do Studio… ' + mb(got) + (total ? ' de ' + mb(total) : ''),
          total ? 3 + (got / total) * 80 : null,
        );
      }
      var type = r.headers.get('content-type') || 'video/mp4';
      var ext = /webm/.test(type) ? '.webm' : /quicktime/.test(type) ? '.mov' : '.mp4';
      var file = new File(parts, p.title + ext, { type: type });
      parts = null;
      busy('Colocando no projeto…', 88);
      var fin = await wait(function () {
        return document.querySelector('input[type=file]');
      });
      var dt = new DataTransfer();
      dt.items.add(file);
      fin.files = dt.files;
      fin.dispatchEvent(new Event('change', { bubbles: true }));
      // 3) arrasta a mídia para o começo da linha do tempo
      var src = await wait(function () {
        return document.querySelector('[data-selectable-item] [draggable="true"]');
      }, 120000);
      busy('Colocando na linha do tempo…', 96);
      // arrasta a mídia para o começo da faixa vazia (tracejada) da linha do tempo; confere e tenta de novo se não entrou
      var name = file.name;
      var inTimeline = function () {
        var n = 0,
          els = document.querySelectorAll('span, div, p');
        for (var k = 0; k < els.length; k++) {
          var t = els[k];
          if (t.childElementCount || (t.textContent || '').trim() !== name) continue;
          if (t.getBoundingClientRect().top > innerHeight * 0.5) n++; // a linha do tempo fica na metade de baixo
        }
        return n > 0;
      };
      var target = function () {
        var ds = document.querySelectorAll('div');
        for (var k = 0; k < ds.length; k++) {
          var r = ds[k].getBoundingClientRect();
          if (
            r.top > innerHeight * 0.5 &&
            r.width > 200 &&
            r.height > 20 &&
            getComputedStyle(ds[k]).borderTopStyle === 'dashed'
          )
            return { el: ds[k], x: r.left + 4, y: r.top + r.height / 2 };
        }
        return null;
      };
      var dtt = new DataTransfer();
      var fire = function (el, t, cx, cy) {
        el.dispatchEvent(
          new DragEvent(t, {
            bubbles: true,
            cancelable: true,
            composed: true,
            dataTransfer: dtt,
            clientX: cx,
            clientY: cy,
          }),
        );
      };
      for (var tries = 0; tries < 3 && !inTimeline(); tries++) {
        await sleep(600 + tries * 600);
        src = document.querySelector('[data-selectable-item] [draggable="true"]') || src;
        var tg = target();
        if (!tg) continue;
        // direto na faixa (o aviso "Trazendo a pregação" está por cima da tela, então não dá para mirar pelo ponto)
        var dst = tg.el;
        var sr = src.getBoundingClientRect();
        dtt = new DataTransfer();
        fire(src, 'dragstart', sr.left + 5, sr.top + 5);
        await sleep(60);
        fire(dst, 'dragenter', tg.x, tg.y);
        fire(dst, 'dragover', tg.x, tg.y);
        await sleep(60);
        fire(dst, 'drop', tg.x, tg.y);
        fire(src, 'dragend', tg.x, tg.y);
        await sleep(500);
      }
      if (!inTimeline()) {
        doneBusy();
        return toast('O vídeo está nas Mídias. Arraste ele para a linha do tempo para começar a cortar.');
      }
      doneBusy();
      toast('Pronto! Corte o louvor e os avisos e exporte. Ao exportar, escolha substituir o vídeo desta pregação.');
    } catch (e) {
      doneBusy();
      toast('Não consegui trazer a pregação: ' + e.message);
    }
  }
  // seção "Pregações do Studio" na tela de projetos
  async function drawSection() {
    if (!/\/editor-avancado\/(projects)?$/.test(location.pathname.replace(/\/$/, '/projects'))) return;
    var header = document.querySelector('header');
    if (!header || document.getElementById('invb-preg')) return;
    var sec = document.createElement('section');
    sec.id = 'invb-preg';
    sec.className = 'invb-preg';
    sec.innerHTML = '<h2>Pregações do Studio</h2><p class="invb-sub">Carregando…</p>';
    header.insertAdjacentElement('afterend', sec);
    var l;
    try {
      l = await api('/api/uploads');
    } catch (e) {
      sec.querySelector('.invb-sub').innerHTML =
        e.message === 'login'
          ? 'Entre no Studio para ver as pregações aqui. <a href="/entrar" target="_blank">Entrar</a>'
          : 'Não consegui ler as pregações do Studio.';
      return;
    }
    var map = loadMap();
    l = l
      .filter(function (u) {
        return u.kind !== 'aud' && (u.status === 'done' || u.status === 'waiting') && !u.originalGone;
      })
      .sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      })
      .slice(0, 24);
    if (!l.length) {
      sec.querySelector('.invb-sub').textContent =
        'Nenhuma pregação pronta no Studio ainda. Adicione pela página inicial do Studio.';
      return;
    }
    sec.innerHTML =
      '<h2>Pregações do Studio</h2><p class="invb-sub">Clique para abrir. Cada pregação tem um projeto só, com as edições salvas neste navegador.</p><div class="invb-grid">' +
      l
        .map(function (u) {
          var has = !!map[u.id];
          return (
            '<button type="button" class="invb-pc" data-preg="' +
            esc(u.id) +
            '"><span class="th"><img src="/api/uploads/' +
            esc(u.id) +
            '/thumb" alt="" loading="lazy" onerror="this.remove()">' +
            (u.duration ? '<em>' + hms(u.duration) + '</em>' : '') +
            '</span><b>' +
            esc(titleOf(u)) +
            '</b><small>' +
            (u.status === 'waiting'
              ? '<i class="w">Aguardando o corte</i>'
              : u.source === 'editor'
                ? 'Já cortada'
                : 'Pronta') +
            (has ? ' · projeto criado' : '') +
            '</small></button>'
          );
        })
        .join('') +
      '</div>';
    sec.querySelectorAll('[data-preg]').forEach(function (b) {
      b.onclick = function () {
        openPregacao(b.getAttribute('data-preg'));
      };
    });
  }
  // o editor troca de tela sem recarregar a página: confere o endereço de tempos em tempos
  var lastPath = '';
  async function route() {
    var here = location.pathname + location.search;
    if (here === lastPath) return;
    lastPath = here;
    if (/\/editor-avancado\/editor/.test(location.pathname)) return fillPending();
    if (/\/editor-avancado(\/projects)?\/?$/.test(location.pathname)) {
      var q = new URLSearchParams(location.search).get('pregacao');
      // o link vale uma vez por aba (voltar com o "Voltar" do navegador não abre de novo). Sem mexer no endereço:
      // o roteador do editor recarrega a tela se o endereço muda por fora dele.
      var seen = [];
      try {
        seen = JSON.parse(sessionStorage.getItem('invb-deep') || '[]');
      } catch (e) {
        /* ok */
      }
      if (q && seen.indexOf(q) < 0) {
        seen.push(q);
        try {
          sessionStorage.setItem('invb-deep', JSON.stringify(seen));
        } catch (e) {
          /* ok */
        }
        await wait(function () {
          return document.querySelector('header');
        }).catch(function () {});
        return openPregacao(q);
      }
      await wait(function () {
        return document.querySelector('header');
      }).catch(function () {});
      drawSection();
    }
  }

  /* ----- "Cortar no Studio" -----
     Exportar no navegador gera o vídeo de novo quadro por quadro: numa live inteira, horas. Quando a edição é só
     cortar o vídeo da pregação, o painel de exportar ganha o botão "Cortar no Studio": o script lê os trechos que
     ficaram na linha do tempo (o banco do editor só é lido) e o Studio corta com o ffmpeg, em segundos (cópia direta)
     ou poucos minutos (exato). Texto, música, efeito ou outro vídeo no projeto: aí precisa do Exportar normal. */
  function readProject(pid) {
    return new Promise(function (ok, bad) {
      var rq = indexedDB.open('video-editor-projects');
      rq.onerror = function () {
        bad(new Error('Não consegui ler o projeto.'));
      };
      rq.onsuccess = function () {
        var db = rq.result;
        try {
          var g = db.transaction('projects', 'readonly').objectStore('projects').get(pid);
          g.onsuccess = function () {
            db.close();
            g.result ? ok(g.result) : bad(new Error('Projeto não encontrado.'));
          };
          g.onerror = function () {
            db.close();
            bad(new Error('Não consegui ler o projeto.'));
          };
        } catch (e) {
          db.close();
          bad(e);
        }
      };
    });
  }
  var near = function (a, b) {
    return Math.abs((+a || 0) - b) < 1e-6;
  };
  // os trechos (em segundos do vídeo da pregação) ou os motivos para não dar
  function planCut(proj, duration) {
    var why = [];
    var sc =
      (proj.scenes || []).filter(function (x) {
        return x.id === proj.currentSceneId;
      })[0] || (proj.scenes || [])[0];
    if (!sc || !sc.tracks || !sc.tracks.main) return { why: ['Não consegui ler a linha do tempo deste projeto.'] };
    var tr = sc.tracks;
    var count = function (arr) {
      return (arr || []).reduce(function (n, t) {
        return n + ((t && t.elements) || []).length;
      }, 0);
    };
    if (count(tr.overlay)) why.push('tem texto, imagem ou outro vídeo por cima');
    if (count(tr.audio)) why.push('tem música ou outro áudio');
    var els = (tr.main.elements || []).filter(function (e) {
      return !e.hidden;
    });
    if (!els.length) return { why: ['a linha do tempo está vazia'] };
    var media = {};
    els.forEach(function (e) {
      media[e.mediaId] = 1;
      if (e.type !== 'video') why.push('tem algo que não é o vídeo da pregação na faixa principal');
      var p = e.params || {};
      if (
        !near(p['transform.positionX'], 0) ||
        !near(p['transform.positionY'], 0) ||
        !near(p['transform.scaleX'] == null ? 1 : p['transform.scaleX'], 1) ||
        !near(p['transform.scaleY'] == null ? 1 : p['transform.scaleY'], 1) ||
        !near(p['transform.rotate'], 0) ||
        !near(p.opacity == null ? 1 : p.opacity, 1) ||
        (p.blendMode && p.blendMode !== 'normal')
      )
        why.push('o vídeo foi movido, girado, ampliado ou ficou transparente');
      if (p.muted || !near(p.volume, 0) || e.isSourceAudioEnabled === false) why.push('o volume foi mudado');
      if ((e.effects || []).length) why.push('tem efeito no vídeo');
      if ((e.playbackRate && e.playbackRate !== 1) || (e.speed && e.speed !== 1)) why.push('a velocidade foi mudada');
    });
    if (Object.keys(media).length > 1) why.push('tem mais de um vídeo');
    if (why.length) return { why: why.filter((w, i) => why.indexOf(w) === i) };
    // o editor guarda o tempo em 1/120000 de segundo (um vídeo de 60 s tem duração 7200000)
    var unit = 120000;
    if (duration && els[0].sourceDuration && Math.abs(els[0].sourceDuration / unit - duration) > 3)
      return { why: ['o vídeo do projeto não parece ser o desta pregação (durações diferentes)'] };
    var segs = els
      .slice()
      .sort(function (a, b) {
        return a.startTime - b.startTime;
      })
      .map(function (e) {
        var a = (e.trimStart || 0) / unit;
        return [+a.toFixed(3), +(a + e.duration / unit).toFixed(3)];
      });
    var total = segs.reduce(function (n, x) {
      return n + (x[1] - x[0]);
    }, 0);
    return { segs: segs, total: total };
  }
  async function cutDialog() {
    var pid = currentProject(),
      preg = linkedPregacao();
    var box = document.createElement('div');
    box.id = 'invb-send';
    box.className = 'invb-send';
    document.body.appendChild(box);
    var close = function () {
      box.remove();
    };
    box.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    });
    var show = function (html) {
      box.innerHTML =
        '<div class="invb-card" role="dialog" aria-modal="true"><h2>Cortar no Studio</h2>' + html + '</div>';
      var x = box.querySelector('[data-x]');
      if (x) x.onclick = close;
    };
    if (!preg)
      return show(
        '<p class="invb-sub">Este projeto não veio de uma pregação do Studio. Abra a pregação pela seção <b>Pregações do Studio</b> ou use o <b>Exportar</b> normal.</p><div class="invb-act"><button class="invb-btn" data-x>Fechar</button></div>',
      );
    show('<p class="invb-sub">Lendo a linha do tempo…</p>');
    var u, plan;
    try {
      u = await api('/api/uploads/' + encodeURIComponent(preg));
      plan = planCut(await readProject(pid), u.duration);
    } catch (e) {
      return show(
        '<p class="invb-sub">' +
          esc(e.message) +
          '</p><div class="invb-act"><button class="invb-btn" data-x>Fechar</button></div>',
      );
    }
    if (plan.why)
      return show(
        '<p class="invb-sub">Este projeto não é só de cortes: ' +
          esc(plan.why.join('; ')) +
          '. Para isso, use o <b>Exportar</b> normal (gera o vídeo no navegador, mais demorado).</p><div class="invb-act"><button class="invb-btn" data-x>Fechar</button></div>',
      );
    show(
      '<p class="invb-sub">' +
        esc(titleOf(u)) +
        ' · ' +
        plan.segs.length +
        ' trecho' +
        (plan.segs.length > 1 ? 's' : '') +
        ' · fica ' +
        hms(plan.total) +
        ' de ' +
        hms(u.duration) +
        '</p>' +
        '<div class="invb-opts">' +
        '<label class="invb-opt"><input type="radio" name="invb-mode" value="fast" checked><span><b>Rápido (recomendado)</b><small>Em segundos: só recorta, sem gerar o vídeo de novo. Cada corte pode cair até ~2 s antes do ponto marcado.</small></span></label>' +
        '<label class="invb-opt"><input type="radio" name="invb-mode" value="exact"><span><b>Exato</b><small>No ponto certo, gerando de novo só o que ficou. Leva alguns minutos.</small></span></label>' +
        '</div>' +
        '<label class="invb-chk"><input type="checkbox" id="invb-cut-yt"> Depois, publicar no YouTube</label>' +
        '<p class="invb-warn">O vídeo desta pregação no Studio passa a ser a versão cortada e a transcrição é refeita' +
        (u.cuts && u.cuts.total ? ' (os cortes atuais saem)' : '') +
        '.</p>' +
        '<div class="invb-bar" hidden><i></i></div><p class="invb-msg" role="status"></p>' +
        '<div class="invb-act"><button class="invb-btn" data-x>Fechar</button><button class="invb-btn pri" data-go>Cortar no Studio</button></div>',
    );
    var $ = function (sel) {
      return box.querySelector(sel);
    };
    $('[data-go]').onclick = async function () {
      var go = this,
        msg = $('.invb-msg'),
        bar = $('.invb-bar');
      var mode = box.querySelector('input[name="invb-mode"]:checked').value;
      var thenYt = $('#invb-cut-yt').checked;
      go.disabled = true;
      bar.hidden = false;
      msg.textContent = 'Cortando no Studio…';
      var r = await send(
        '/api/uploads/' + encodeURIComponent(preg) + '/cut',
        JSON.stringify({ segments: plan.segs, mode: mode }),
        { 'x-invb': '1', 'content-type': 'application/json' },
      ).catch(function (e) {
        return { status: 0, json: { error: e.message } };
      });
      if (r.status !== 202) {
        go.disabled = false;
        return (msg.textContent = r.json.error || 'Não consegui começar o corte.');
      }
      // acompanha o andamento pela pregação
      for (;;) {
        await sleep(1000);
        var m = await api('/api/uploads/' + encodeURIComponent(preg)).catch(function () {
          return null;
        });
        if (!m) continue;
        if (m.cutError) {
          go.disabled = false;
          return (msg.textContent = '⚠ ' + m.cutError);
        }
        if (m.status === 'processing' && /^Cortando/.test(m.stage || '')) {
          bar.firstChild.style.width = Math.max(3, m.progress || 0) + '%';
          msg.textContent = 'Cortando no Studio… ' + (m.progress || 0) + '%';
          continue;
        }
        break;
      }
      bar.firstChild.style.width = '100%';
      msg.innerHTML =
        '✓ Pronto! A pregação agora é a versão cortada e o Studio está transcrevendo. <a href="/app/uploads/' +
        esc(preg) +
        '/transcription" target="_blank" rel="noopener">Abrir no Studio</a>';
      go.hidden = true;
      if (thenYt) {
        msg.innerHTML += '<br>Preparando para publicar…';
        try {
          var resp = await fetch('/api/uploads/' + encodeURIComponent(preg) + '/media', { credentials: 'same-origin' });
          if (!resp.ok) throw new Error('O Studio não entregou o vídeo cortado.');
          var vb = await resp.blob();
          close();
          offer(new File([vb], titleOf(u) + '.mp4', { type: vb.type || 'video/mp4' }), titleOf(u) + '.mp4', {
            studioDone: preg,
          });
        } catch (e) {
          msg.innerHTML += '<br>⚠ ' + esc(e.message);
        }
      }
    };
  }
  // o botão no painel de exportar (enquanto ele mostra "Exportar projeto", antes de começar)
  function cutButton() {
    var hs = document.querySelectorAll('[data-radix-popper-content-wrapper] h3');
    for (var i = 0; i < hs.length; i++) {
      if ((hs[i].textContent || '').trim() !== 'Exportar projeto') continue;
      var content = hs[i].closest('[data-radix-popper-content-wrapper]').firstElementChild;
      if (!content || content.querySelector('.invb-cutbox')) return;
      var d = document.createElement('div');
      d.className = 'invb-cutbox';
      d.innerHTML =
        '<button type="button" class="invb-btn pri">⚡ Cortar no Studio</button><small>Só cortou o vídeo da pregação? O Studio corta em segundos, sem gerar o vídeo de novo no navegador.</small>';
      d.querySelector('button').onclick = function () {
        cutDialog();
      };
      content.appendChild(d);
    }
  }
  function startRoutes() {
    route();
    setInterval(function () {
      route();
      if (/\/editor-avancado\/editor/.test(location.pathname)) cutButton();
      if (/\/editor-avancado(\/projects)?\/?$/.test(location.pathname) && !document.getElementById('invb-preg'))
        drawSection();
    }, 700);
  }
  if (document.readyState === 'complete') setTimeout(startRoutes, 400);
  else
    window.addEventListener('load', function () {
      setTimeout(startRoutes, 400);
    });
})();
