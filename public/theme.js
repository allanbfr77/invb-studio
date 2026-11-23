// Modo claro ou noturno. Roda antes de a página aparecer, para não piscar na cor errada.
// A escolha fica guardada neste navegador; sem escolha, segue o que o computador estiver usando.
(function () {
  var KEY = 'invb-tema';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* navegação privada: segue o sistema */ }
  var system = function () { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; };
  var apply = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0a0a0b' : '#f6f3ec');
  };
  var current = saved === 'dark' || saved === 'light' ? saved : system();
  apply(current);
  window.InvbTheme = {
    get: function () { return current; },
    set: function (t) {
      current = t === 'dark' ? 'dark' : 'light';
      // transição suave só na troca feita pela pessoa
      var r = document.documentElement; r.classList.add('th-anim'); apply(current); setTimeout(function () { r.classList.remove('th-anim'); }, 350);
      try { localStorage.setItem(KEY, current); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
    },
    toggle: function () { this.set(current === 'dark' ? 'light' : 'dark'); return current; },
  };
})();
