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
                return x.kind !== 'aud' && ['done', 'error'].indexOf(x.status) >= 0;
              })
              .sort(function (a, b) {
                return (b.createdAt || 0) - (a.createdAt || 0);
              });
            $('#invb-up').innerHTML = ups.length
              ? ups
                  .map(function (x) {
                    return '<option value="' + esc(x.id) + '">' + esc(x.title || x.name) + '</option>';
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
})();
