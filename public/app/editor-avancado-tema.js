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
  function offer(blob, fileName) {
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
      '<label class="invb-opt"><input type="radio" name="invb-dest" value="none"><span><b>Só baixar no computador</b><small>Como antes.</small></span></label>' +
      '</div>' +
      '<div class="invb-f" data-for="new"><label for="invb-title">Nome da pregação</label><input id="invb-title" value="' +
      esc(title) +
      '"></div>' +
      '<div class="invb-f" data-for="replace" hidden><label for="invb-up">Qual pregação</label><select id="invb-up"><option value="">Carregando…</option></select><p class="invb-warn" id="invb-warn"></p></div>' +
      '<label class="invb-chk" data-for-not="none"><input type="checkbox" id="invb-dl"> Baixar também no computador</label>' +
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
      $('[data-for-not]').hidden = d === 'none';
      $('[data-go]').textContent = d === 'none' ? 'Baixar' : 'Enviar pro Studio';
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
    $('[data-go]').onclick = function () {
      var d = dest(),
        msg = $('.invb-msg');
      if (d === 'none') {
        saveLocal(blob, fileName);
        return close();
      }
      var url;
      if (d === 'new') {
        var t = ($('#invb-title').value || '').trim() || title;
        url = '/api/uploads?name=' + encodeURIComponent(t + ext);
      } else {
        var id = $('#invb-up').value;
        if (!id) return (msg.textContent = 'Escolha a pregação.');
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
      }
      if ($('#invb-dl').checked) saveLocal(blob, fileName);
      var go = $('[data-go]'),
        bar = $('.invb-bar');
      go.disabled = true;
      bar.hidden = false;
      msg.textContent = 'Enviando pro Studio…';
      var x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('x-invb', '1');
      x.upload.onprogress = function (e) {
        if (e.lengthComputable) bar.firstChild.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      };
      x.onload = function () {
        var j = {};
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {
          /* sem corpo */
        }
        if (x.status >= 200 && x.status < 300 && j.id) {
          bar.firstChild.style.width = '100%';
          msg.innerHTML =
            '✓ Enviado. O Studio está processando. <a href="/app/uploads/' +
            esc(j.id) +
            '/transcription" target="_blank" rel="noopener">Abrir no Studio</a>';
          go.hidden = true;
          return;
        }
        go.disabled = false;
        msg.textContent =
          x.status === 401
            ? 'Entre no Studio primeiro (abra o Studio e faça login) e tente de novo.'
            : j.error || 'Não consegui enviar.';
      };
      x.onerror = function () {
        go.disabled = false;
        msg.textContent = 'Não consegui falar com o Studio. Ele está aberto?';
      };
      x.send(blob);
    };
    sync();
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
  function startRoutes() {
    route();
    setInterval(function () {
      route();
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
