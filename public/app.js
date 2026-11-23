/* INVB Studio — roteamento no cliente. Só existem o login e a área logada (app-area.js);
   qualquer outro endereço abre o login. */
(function () {
  function render(path, keep) {
    if (!(window.AppArea && AppArea.match(path))) { path = '/entrar'; if (location.pathname !== path) history.replaceState({}, '', path); }
    document.title = 'INVB Studio · Nova Vida Botafogo';
    AppArea.render(path.replace(/\/+$/, '') || '/', document.getElementById('app'));
    if (!keep) scrollTo(0, 0);
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
