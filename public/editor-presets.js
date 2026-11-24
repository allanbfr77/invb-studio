/* Presets do editor do corte: templates prontos (estilo de legenda + faixa de título), ganchos de texto e idiomas da
   tradução. Voltados a pregações; o estilo de cada template é um dos estilos prontos de public/caption-styles.js. */
(function (root) {
  // cores das faixas: dourado e azul-marinho da igreja, preto e branco
  const C = { ouro: '#f0b93a', marinho: '#231c47', preto: '#111111', branco: '#ffffff', vinho: '#7a1f2b' };
  // [categoria, nome, texto da faixa no alto ('' = sem faixa), estilo de legenda, cor da faixa]
  const T = [
    ['Pregação', 'Palavra de hoje', 'PALAVRA DE HOJE', 'Destaque/Destaque dourado', 'marinho'],
    ['Pregação', 'Mensagem', 'MENSAGEM', 'Essenciais/Clássica', 'ouro'],
    ['Pregação', 'Série de mensagens', 'NOME DA SÉRIE', 'Impacto/Título', 'preto'],
    ['Pregação', 'Pregador', 'PR. NOME', 'Com fundo/Faixa escura', 'ouro'],
    ['Versículo', 'Versículo', '', 'Elegante/Versículo', 'marinho'],
    ['Versículo', 'Versículo com referência', 'JOÃO 3:16', 'Elegante/Versículo itálico', 'ouro'],
    ['Reflexão', 'Reflexão', 'REFLEXÃO', 'Com fundo/Faixa escura', 'marinho'],
    ['Reflexão', 'Pergunta', 'VOCÊ JÁ PENSOU NISSO?', 'Destaque/Marca-texto', 'branco'],
    ['Impacto', 'Frase de impacto', '', 'Impacto/Uma palavra', 'preto'],
    ['Impacto', 'Não desista', 'NÃO DESISTA', 'Impacto/Impacto', 'vinho'],
    ['Igreja', 'Culto de domingo', 'CULTO DE DOMINGO', 'Elegante/Marca da igreja', 'marinho'],
    ['Igreja', 'Convite', 'VENHA NOS VISITAR', 'Com fundo/Etiqueta dourada', 'marinho'],
    ['Igreja', 'Minimalista', '', 'Essenciais/Limpa', 'preto'],
  ];
  const TEMPLATES = T.map(([cat, name, text, style, cor], i) => ({
    id: `pronto-${i}`,
    cat,
    name,
    style,
    text,
    bg: C[cor],
    fg: cor === 'ouro' || cor === 'branco' ? '#111111' : '#ffffff', // texto escuro nas faixas claras
  }));
  const TEMPLATE_CATS = [...new Set(T.map((t) => t[0]))].map((c) => ({
    id: c,
    count: T.filter((t) => t[0] === c).length,
  }));
  // ganchos: texto curto nos primeiros segundos do corte, para prender quem está rolando a tela
  const HOOKS = [
    'OUÇA ATÉ O FIM',
    'UMA PALAVRA PARA VOCÊ',
    'VOCÊ PRECISA OUVIR ISSO',
    'PARA QUEM ESTÁ CANSADO',
    'NÃO DESISTA',
    'DEUS NÃO TERMINOU',
    'ISSO VAI MUDAR SUA SEMANA',
    'PALAVRA DE HOJE',
    'REFLEXÃO',
    'COMPARTILHE COM ALGUÉM',
  ];
  const HOOK_COLORS = [C.ouro, C.marinho, C.preto, C.vinho];
  const LANGS = ['Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano', 'Japonês', 'Coreano', 'Chinês', 'Russo'];
  root.EditorPresets = { TEMPLATES, TEMPLATE_CATS, HOOKS, LANGS, COLORS: HOOK_COLORS };
})(window);
