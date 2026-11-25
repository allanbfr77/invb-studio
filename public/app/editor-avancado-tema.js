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
})();
