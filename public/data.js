// Conteúdo e dados FICTÍCIOS de demonstração. Nada aqui vem de processamento real de IA.
window.D = {
  brand: 'INVB Studio',

  nav: {
    produto: [
      { t: 'Transcrever e entender', items: [
        ['transcricao', 'Transcrição e falantes', 'Cada palavra com tempo e com dono'],
        ['capitulos', 'Capítulos e momentos', 'O material longo com estrutura'],
        ['deteccao-de-emocoes', 'Falas e emoções', 'O tom de cada fala, marcado'],
        ['ganchos-narrativos', 'Ganchos narrativos', 'As frases mais fortes, com nota'],
        ['timeline-narrativa', 'Timeline narrativa', 'Texto, emoções e ganchos numa linha só'],
        ['diagramas-e-mapas-mentais', 'Diagramas e mapas', 'Mapa mental, fluxo e linha do tempo'],
        ['traducao-de-legendas', 'Tradução', 'Legenda e texto em 9 idiomas'] ] },
      { t: 'Cortar e legendar', items: [
        ['cortes-automaticos', 'Cortes automáticos', 'Os melhores trechos, com nota'],
        ['legendas-animadas', 'Legendas animadas', '235 estilos, 54 fontes'],
        ['video-vertical', 'Vídeo vertical', 'A câmera segue quem fala'],
        ['textos-logo-e-imagens', 'Textos, logo e imagens', 'A sua marca em cada corte'] ] },
      { t: 'Levar para onde precisa', items: [
        ['exportar-para-editores', 'Exportar para editores', 'Premiere, DaVinci e Final Cut'],
        ['baixar-trechos', 'Baixar trechos', 'As falas que importam, em arquivo'],
        ['conector-para-ia', 'Conector para IA', 'Peça pelo ChatGPT, Claude ou Gemini'],
        ['plugin-davinci-resolve', 'Plugin para DaVinci Resolve', 'O plugin dentro do DaVinci Resolve Studio', 'Beta fechado'] ] },
    ],
    basico: [
      ['video-e-youtube', 'Vídeo e YouTube'], ['formatos-de-arquivo', 'Formatos de arquivo'],
      ['idiomas', 'Idiomas'], ['tipos-de-conteudo', 'Tipos de conteúdo'], ['pastas-e-projetos', 'Projetos'],
    ],
    usos: [
      { t: 'Fé', items: ['pregacao', 'estudo-biblico', 'devocional', 'testemunho-de-fe'] },
      { t: 'Conversas', items: ['podcast', 'entrevista', 'depoimento', 'mentoria', 'reuniao', 'atendimento'] },
      { t: 'Eventos', items: ['casamento', 'palestra', 'evento-corporativo', 'cerimonia', 'evento-social'] },
      { t: 'Ensino', items: ['aula', 'narracao', 'treinamento', 'workshop', 'audiobook'] },
    ],
    recursos: [
      ['/guias', 'Guias', 'Decupagem, legendas, cortes e edição'], ['/academia', 'Academia', 'Vídeos curtos de cada recurso'],
      ['/tutorial', 'Tutorial', 'Do primeiro envio ao primeiro corte'], ['/perguntas-frequentes', 'Perguntas frequentes', 'Limites e formatos'],
      ['/depoimentos', 'Depoimentos', 'Quem usa, contando'], ['/afiliados', 'Afiliados', 'Indique e ganhe'],
    ],
    ajuda: ['Começar', 'Transcrição', 'Cortes', 'Legendas', 'Narrativa', 'Exportar e conectar', 'Plugin no DaVinci Resolve'],
  },

  usoLabels: {
    pregacao: 'Pregação', 'estudo-biblico': 'Estudo bíblico', devocional: 'Devocional', 'testemunho-de-fe': 'Testemunho de fé',
    podcast: 'Podcast', entrevista: 'Entrevista', depoimento: 'Depoimento', mentoria: 'Mentoria', reuniao: 'Reunião',
    atendimento: 'Atendimento', casamento: 'Casamento', palestra: 'Palestra', 'evento-corporativo': 'Evento corporativo',
    cerimonia: 'Cerimônia', 'evento-social': 'Evento social', aula: 'Aula', narracao: 'Narração', treinamento: 'Treinamento',
    workshop: 'Workshop', audiobook: 'Audiobook', personalizado: 'Personalizado',
  },

  // Passos do fluxo (home): [num, título, texto vídeo, texto áudio, links]
  fluxo: [
    ['01', 'Envie', 'Arquivo de vídeo de qualquer duração, ou um link do YouTube, inclusive de live. Escolha só o trecho que importa.',
      'Arquivo de áudio de qualquer duração, ou um link do YouTube. Escolha só o trecho que importa.',
      [['video-e-youtube', 'Vídeo e YouTube'], ['formatos-de-arquivo', 'Formatos de arquivo']]],
    ['02', 'Encontre', 'Cada palavra com tempo e com o nome de quem falou. Capítulos, momentos, emoções e ganchos já marcados.',
      'Cada palavra com tempo e com o nome de quem falou. Capítulos, momentos, emoções e ganchos já marcados.',
      [['transcricao', 'Transcrição e falantes'], ['capitulos', 'Capítulos e momentos'], ['ganchos-narrativos', 'Ganchos narrativos']]],
    ['03', 'Corte', 'Os melhores trechos com nota de 0 a 100, ou os seus, escolhidos palavra por palavra. Na vertical, seguindo quem fala.',
      'Os melhores trechos com nota de 0 a 100, ou os seus, escolhidos palavra por palavra. Em áudio, trechos prontos para baixar.',
      [['cortes-automaticos', 'Cortes automáticos'], ['video-vertical', 'Vídeo vertical'], ['textos-logo-e-imagens', 'Textos, logo e imagens']]],
    ['04', 'Legende', '235 estilos e 54 fontes, do clássico de TV ao animado. Tradução para 9 idiomas.',
      'Legenda em SRT e tradução para 9 idiomas para publicar o áudio com texto.',
      [['legendas-animadas', 'Legendas animadas'], ['traducao-de-legendas', 'Tradução']]],
    ['05', 'Entregue', 'Baixe os cortes prontos para postar, na qualidade original. Leve SRT, capítulos e texto e, a timeline para o editor.',
      'Baixe trechos em MP3, o texto e o SRT. Leve tudo também para o seu assistente de IA.',
      [['baixar-trechos', 'Baixar trechos'], ['exportar-para-editores', 'Exportar para editores'], ['conector-para-ia', 'Conector para IA']]],
  ],

  casos: [
    ['Pregação em cortes e capítulos', 'pregacao', '32:10 Momento · 92', 'A mensagem, com capítulos, o texto completo e cortes com legenda para as redes.', 'A mensagem de domingo chega a quem não estava lá.', 'Cole o link da live ou envie o arquivo. Pule o louvor escolhendo o trecho. A equipe de mídia recebe capítulos e cortes verticais prontos.', 'Pregação →'],
    ['Cortes de podcast', 'podcast', '18:42 Momento · 88', 'Cortes com nota, capítulos para a descrição e a transcrição para o site.', 'O episódio inteiro vira uma semana de conteúdo.', 'Envie o episódio e receba os melhores trechos com nota, já na vertical, com legenda animada e capítulos para o YouTube.', 'Podcast →'],
    ['Decupar um casamento', 'casamento', '00:18:52 Votos · 95', 'Votos, discursos e falas separados por pessoa, prontos para decupar.', 'Horas de cerimônia, separadas em minutos.', 'A transcrição marca quem falou e quando. Busque “promessa” ou o nome dos noivos e vá direto ao ponto da gravação.', 'Casamento →'],
    ['Palestra em trechos', 'palestra', '14:05 Momento · 90', 'Os pontos fortes da palestra em trechos curtos, com minutagem.', 'A palestra de uma hora em cinco trechos que valem o post.', 'Veja os ganchos com nota, escolha os que combinam com a sua marca e baixe cortes verticais legendados.', 'Palestra →'],
    ['Entrevista em texto', 'entrevista', '07:30 Citação · 84', 'Transcrição com falantes e minutagem para citar com segurança.', 'Cada pergunta e cada resposta, com o nome de quem falou.', 'Filtre a transcrição por pessoa, copie a citação com o tempo e exporte em TXT, PDF ou SRT.', 'Entrevista →'],
    ['Aula em texto e capítulos', 'aula', '22:18 Conceito · 86', 'Apostila em texto e capítulos para os alunos navegarem.', 'A videoaula vira material de estudo.', 'Capítulos por assunto, texto pesquisável e legenda para quem assiste sem som.', 'Aula →'],
    ['Depoimento de cliente em corte', 'depoimento', '02:11 Prova · 93', 'O melhor trecho de cada depoimento, pronto para a página de vendas.', 'O depoimento de dez minutos em quinze segundos que convencem.', 'Marque o trecho, deixe a legenda destacar as palavras-chave e baixe em 9:16 ou 16:9.', 'Depoimento →'],
    ['Evento corporativo em destaques', 'evento-corporativo', '41:20 Destaque · 89', 'Falas do evento em destaques com legenda e nome de cada palestrante.', 'O evento inteiro vira um aftermovie de falas.', 'Transcreva as falas, escolha as melhores e entregue cortes para as redes e a timeline para o editor.', 'Evento corporativo →'],
    ['Montar a timeline no editor', 'exportar-para-editores', 'Timeline · .xml', 'Timeline cortada pronta para abrir no Premiere, DaVinci ou Final Cut.', 'Abra no editor já cortado.', 'Escolha as falas que ficam e exporte a timeline. Você continua a edição no editor que já usa.', 'Exportar para editores →'],
  ],

  pedidos: [
    'Me dá os 5 melhores trechos sobre fé', 'Corta em até 60 segundos', 'Roteiro de 3 minutos com os votos e o beijo',
    'Tira os “né” e as pausas longas', 'Legenda em inglês e o SRT', 'Só as partes em que o convidado fala',
    'Capítulos para a descrição do YouTube', 'Monta a timeline no Premiere com os favoritos', 'Os momentos mais emocionantes da cerimônia',
    'Três cortes da pregação para o Reels', 'Quem falou isso e em que minuto?', 'Traduz a legenda para espanhol', 'Segue o rosto de quem está falando',
  ],

  // Depoimentos FICTÍCIOS (a original usa depoimentos reais; aqui são exemplos claramente marcados).
  depoimentos: [
    ['Decupagem', '“Exemplo fictício: separar as falas da cerimônia levava a tarde toda. Com a ferramenta, o primeiro mapa sai em minutos.”', 'Estúdio Exemplo', 'Videomaker'],
    ['Roteiro', '“Exemplo fictício: o roteiro de falas já chega organizado por pessoa e por assunto.”', 'Pessoa Exemplo A', 'Editor'],
    ['Tempo', '“Exemplo fictício: tenho uma visão geral do evento antes de abrir o editor.”', 'Pessoa Exemplo B', 'Videomaker'],
    ['Podcast', '“Exemplo fictício: os capítulos saem prontos para a descrição do episódio.”', 'Pessoa Exemplo C', 'Produtor'],
    ['Cortes', '“Exemplo fictício: escolho o trecho palavra por palavra e a legenda acompanha.”', 'Pessoa Exemplo D', 'Roteirista'],
    ['Legendas', '“Exemplo fictício: a mesma correção vale para o texto, a legenda e a exportação.”', 'Pessoa Exemplo E', 'Editor'],
  ],

  faqHome: [
    ['O que é o INVB Studio?', 'É uma ferramenta online de transcrição, cortes e legendas para vídeo e áudio. Você envia o arquivo ou cola o link do YouTube e recebe o texto com minutagem e falantes, capítulos, cortes verticais com legenda, SRT e e a timeline para o editor. (Este é um protótipo: nada é processado de verdade.)'],
    ['O que eu posso enviar?', 'Arquivos de áudio e vídeo nos formatos mais comuns (MP3, WAV, M4A, MP4, MOV, MKV e outros) ou um link do YouTube. Você pode escolher só o trecho que interessa.'],
    ['Qual a diferença entre enviar áudio e vídeo?', 'Com vídeo você recebe cortes verticais com legenda queimada. Com áudio, recebe transcrição, capítulos, trechos em MP3 e legenda em SRT.'],
    ['Serve para quem edita profissionalmente?', 'Sim. A timeline cortada abre no Premiere Pro, no DaVinci Resolve e no Final Cut Pro, e você segue editando no programa que já usa.'],
    ['E se eu quiser fazer tudo na mão?', 'Dá para editar o texto, ajustar o corte palavra por palavra e arrastar a legenda. A correção na transcrição vale para legenda e corte.'],
  ],

  explore: [
    ['/ferramentas', 'Ferramentas grátis', 'Converta, corte e ajuste legendas, áudios e vídeos.'], ['/guias', 'Guias', 'Passo a passo de transcrição, cortes e legendas.'],
    ['/central-de-ajuda', 'Central de ajuda', 'Cada tela do app, com prints.'], ['/glossario', 'Glossário', 'O que é SRT, timecode, 9:16 e outros termos.'],
    ['/estilos-de-legenda', 'Estilos de legenda', 'Estilos de legenda animada para Reels, Shorts e TikTok.'], ['/exemplos', 'Exemplos', 'Transcrição, SRT, capítulos, roteiro e decupagem para baixar.'],
    ['/integracoes', 'Integrações', 'No editor de vídeo, no YouTube e nos assistentes.'], ['/academia', 'Academia', 'Vídeos curtos sobre cada função.'],
  ],

  footer: {
    produto: [['transcricao', 'Transcrição e falantes'], ['capitulos', 'Capítulos e momentos'], ['deteccao-de-emocoes', 'Falas e emoções'], ['ganchos-narrativos', 'Ganchos narrativos'], ['timeline-narrativa', 'Timeline narrativa'], ['traducao-de-legendas', 'Tradução'], ['cortes-automaticos', 'Cortes automáticos'], ['legendas-animadas', 'Legendas animadas'], ['video-vertical', 'Vídeo vertical'], ['exportar-para-editores', 'Exportar para editores'], ['baixar-trechos', 'Baixar trechos'], ['conector-para-ia', 'Conector para IA']],
    empresa: [['/sobre', 'Quem somos'], ['/central-de-ajuda', 'Central de ajuda'], ['/guias', 'Guias'], ['/academia', 'Academia'], ['/tutorial', 'Tutorial'], ['/depoimentos', 'Depoimentos'], ['/perguntas-frequentes', 'Perguntas frequentes'], ['/afiliados', 'Afiliados']],
    guias: ['Como fazer cortes de pregação', 'Como transcrever vídeo em texto', 'Como transcrever vídeo do YouTube', 'Como fazer cortes de podcast', 'Como legendar vídeo automaticamente', 'Como fazer decupagem de vídeo', 'Como importar SRT no Premiere', 'Vídeo horizontal para vertical', 'Como colocar capítulos no YouTube', 'Como traduzir legenda'],
  },

  ferramentas: {
    'Legendas': ['Conversor de legendas', 'Sincronizar legenda', 'Verificador de legenda', 'Editor de legenda online', 'Juntar legendas'],
    'Áudio': ['Extrair áudio de vídeo', 'Cortar áudio online', 'Aumentar volume do áudio', 'Gravador de voz online', 'Remover silêncio do áudio'],
    'Vídeo e imagem': ['Cortar vídeo online', 'Comprimir vídeo', 'Redimensionar vídeo', 'Converter vídeo para MP4', 'Extrair frame de vídeo'],
    'Texto e roteiro': ['Palavras para minutos', 'Contador de palavras', 'Teleprompter online', 'Limpar transcrição'],
    'Para o editor': ['SRT para Premiere Pro', 'SRT para DaVinci Resolve', 'SRT para Final Cut Pro', 'Calculadora de timecode', 'Conversor de fps'],
  },

  // Demo local: falantes e falas FICTÍCIOS.
  sample: [
    { s: 'Ana', t: 724, w: 'O segredo foi parar de planejar demais e começar a gravar.', sc: 96 },
    { s: 'Léo', t: 731, w: 'E como você sabia a hora de parar de ensaiar?', sc: 71 },
    { s: 'Ana', t: 735, w: 'Eu travei na frente de mil pessoas. Foi ali que eu entendi que ninguém espera perfeição.', sc: 91 },
    { s: 'Léo', t: 748, w: 'Isso mudou a forma como você escreve os roteiros?', sc: 62 },
    { s: 'Ana', t: 755, w: 'Totalmente. Hoje eu escrevo a primeira frase e deixo o resto acontecer.', sc: 84 },
    { s: 'Léo', t: 770, w: 'E o medo, ele some em algum momento?', sc: 58 },
    { s: 'Ana', t: 778, w: 'O medo não some. Ele só deixa de decidir por você.', sc: 94 },
  ],
  sampleTr: {
    en: ['The secret was to stop over-planning and start recording.', 'And how did you know when to stop rehearsing?', 'I froze in front of a thousand people. That is when I understood nobody expects perfection.', 'Did that change how you write your scripts?', 'Completely. Today I write the first sentence and let the rest happen.', 'And does the fear ever go away?', 'The fear does not go away. It just stops making decisions for you.'],
    es: ['El secreto fue dejar de planificar de más y empezar a grabar.', '¿Y cómo supiste cuándo dejar de ensayar?', 'Me bloqueé frente a mil personas. Ahí entendí que nadie espera perfección.', '¿Eso cambió tu forma de escribir los guiones?', 'Totalmente. Hoy escribo la primera frase y dejo que el resto suceda.', '¿Y el miedo desaparece en algún momento?', 'El miedo no desaparece. Solo deja de decidir por ti.'],
    fr: ['Le secret a été d’arrêter de trop planifier et de commencer à enregistrer.', 'Et comment as-tu su quand arrêter de répéter ?', 'Je me suis figée devant mille personnes. C’est là que j’ai compris que personne n’attend la perfection.', 'Cela a-t-il changé ta façon d’écrire tes scripts ?', 'Complètement. Aujourd’hui j’écris la première phrase et je laisse le reste venir.', 'Et la peur disparaît-elle un jour ?', 'La peur ne disparaît pas. Elle cesse simplement de décider à ta place.'],
  },
  capitulosAmostra: [[0, 'Começo da carreira'], [724, 'Gancho · o palco'], [1910, 'Dinheiro e medo']],
  estilos: [
    ['Viral', 'font-weight:900;color:#fff;text-transform:uppercase;text-shadow:0 3px 0 #4f46e5,0 0 12px rgba(0,0,0,.4)'],
    ['Caixa', 'font-weight:700;color:#fff;background:#0b0b12;padding:.15em .5em;border-radius:6px'],
    ['Karaokê', 'font-weight:800;color:#facc15;text-shadow:0 2px 0 #000'],
    ['Clássica de TV', 'font-weight:500;color:#fff;background:rgba(0,0,0,.7);padding:.1em .4em'],
    ['Neon', 'font-weight:800;color:#c4b5fd;text-shadow:0 0 8px #8b5cf6,0 0 18px #8b5cf6'],
    ['Minimal', 'font-weight:500;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)'],
  ],
};

// Recursos: slug -> dados da página
(function () {
  const R = {};
  const add = (slug, kind, title, hi, intro, bullets, steps) => { R[slug] = { slug, kind, title, hi, intro, bullets, steps }; };
  const gen = [
    ['Cada palavra', 'com tempo e com dono.'],
  ];
  add('transcricao', 'transcricao', 'Transcrever áudio e vídeo em texto.', 'Cada palavra com tempo e com dono.',
    'Transcrever áudio e vídeo em texto é transformar a fala de uma gravação em texto para ler, buscar e editar. Você envia o arquivo ou cola o link do YouTube e a transcrição sai palavra por palavra, com minutagem e falantes separados, em mais de 90 idiomas.',
    ['Minutagem em cada fala e tempo em cada palavra', 'Clique no texto e o player vai para aquele ponto', 'Idioma detectado sozinho, entre mais de 90 idiomas', 'Funciona com áudio e com vídeo, do arquivo ou do link do YouTube'],
    [['Envie o arquivo ou cole o link', 'Áudio ou vídeo em MP3, WAV, M4A, MP4, MOV, MKV e outros formatos, ou um link do YouTube. Escolha só o trecho que interessa.'], ['Transcrevemos', 'Detectamos o idioma, separamos quem fala e marcamos o tempo de cada palavra.'], ['Revise e exporte', 'Corrija o que precisar, busque as falas que importam e baixe em TXT, PDF, SRT ou MP3.']]);
  add('capitulos', 'capitulos', 'Capítulos e momentos para vídeos longos.', 'O material com estrutura.',
    'O material longo é dividido por assunto, com título e minutagem prontos para colar na descrição do YouTube. Dentro de cada capítulo aparecem os momentos que merecem destaque.',
    ['Título e tempo de cada capítulo', 'Formato pronto para a descrição do YouTube', 'Momentos marcados dentro de cada capítulo', 'Clique no capítulo e vá direto ao trecho'],
    [['Envie o material', 'Arquivo ou link do YouTube.'], ['Dividimos por assunto', 'Cada mudança de tema vira um capítulo com título.'], ['Copie ou exporte', 'Capítulos em texto, SRT ou marcadores do editor.']]);
  add('deteccao-de-emocoes', 'generico', 'Falas e emoções em cada trecho.', 'O tom de cada fala, marcado.', 'Cada fala recebe a marca da emoção predominante, e você filtra o material para achar o trecho que toca.', ['Emoção marcada em cada fala', 'Filtro por emoção', 'Combina com os cortes automáticos'], [['Envie', 'Arquivo ou link.'], ['Marcamos', 'Emoção por fala.'], ['Filtre', 'Ache os trechos que emocionam.']]);
  add('ganchos-narrativos', 'cortes', 'Ganchos narrativos com nota.', 'As frases mais fortes.', 'As frases com mais poder de prender a atenção aparecem com nota de impacto, para você abrir o corte com a melhor.', ['Nota de impacto de 0 a 100', 'Tipo de momento: gancho, história, opinião', 'Roteiro a partir dos ganchos'], [['Envie', 'Arquivo ou link.'], ['Pontuamos', 'Cada trecho recebe nota e tipo.'], ['Escolha', 'Use o gancho no início do corte.']]);
  add('timeline-narrativa', 'generico', 'Timeline narrativa de ponta a ponta.', 'Tudo numa linha só.', 'Texto, emoções e ganchos aparecem numa linha do tempo única, para ver o formato da história de uma vez.', ['Texto, emoções e ganchos juntos', 'Navegação por clique', 'Exportação para o editor'], [['Envie', 'Arquivo ou link.'], ['Montamos', 'A linha do tempo da história.'], ['Navegue', 'Clique e vá ao trecho.']]);
  add('diagramas-e-mapas-mentais', 'generico', 'Diagramas e mapas mentais da fala.', 'Mapa, fluxo e linha do tempo.', 'A conversa vira mapa mental, fluxo ou linha do tempo, para estudar, apresentar ou planejar a edição.', ['Mapa mental do assunto', 'Fluxo e linha do tempo', 'Exportação em imagem'], [['Envie', 'Arquivo ou link.'], ['Geramos', 'O diagrama a partir da transcrição.'], ['Baixe', 'Em imagem.']]);
  add('traducao-de-legendas', 'traducao', 'Tradução de legendas e textos.', 'Para 9 idiomas.', 'A legenda e o texto são traduzidos para 9 idiomas, mantendo a minutagem para você publicar sem refazer o tempo.', ['Tradução para 9 idiomas', 'Minutagem preservada', 'SRT traduzido pronto para o YouTube'], [['Transcreva', 'Gere a transcrição no idioma original.'], ['Escolha o idioma', 'Selecione o destino.'], ['Baixe o SRT', 'Com o tempo original.']]);
  add('cortes-automaticos', 'cortes', 'Cortes automáticos de vídeo.', 'Os melhores trechos, com nota.', 'Os trechos com mais potencial aparecem com nota de 0 a 100. Você aceita, descarta ou ajusta cada corte palavra por palavra.', ['Nota de 0 a 100 em cada trecho', 'Início e fim ajustáveis palavra por palavra', 'Remover pausas e vícios de fala', 'Duração dos cortes à sua escolha'], [['Envie e escolha a duração', 'Por exemplo, de 30 a 59 segundos.'], ['Receba os candidatos', 'Cada corte com nota e tipo.'], ['Ajuste e baixe', 'Legenda, formato e download.']]);
  add('legendas-animadas', 'legendas', 'Legendas animadas para Reels, Shorts e TikTok.', '235 estilos, 54 fontes.', 'Escolha um estilo de legenda, com destaque automático das palavras-chave, fonte e posição. A correção do texto vale para a legenda.', ['235 estilos e 54 fontes', 'Estilo por palavra e posição livre', 'Destaque automático de palavra-chave', 'Salve como template'], [['Escolha o estilo', 'Do clássico de TV ao animado.'], ['Ajuste', 'Fonte, cor e posição.'], ['Baixe', 'Corte com a legenda queimada.']]);
  add('video-vertical', 'cortes', 'Vídeo vertical que segue quem fala.', 'A câmera acompanha.', 'Em 9:16, o enquadramento acompanha quem está falando, para o rosto não ficar fora de quadro.', ['Formato 9:16', 'Enquadramento que segue a fala', 'Ajuste manual do enquadramento'], [['Envie o vídeo', 'Horizontal.'], ['Reenquadramos', 'Seguindo quem fala.'], ['Baixe', 'Pronto para postar.']]);
  add('textos-logo-e-imagens', 'legendas', 'Textos, logo e imagens nos cortes.', 'A sua marca em cada corte.', 'Coloque título, logo e imagens nos cortes e salve como template para os próximos.', ['Título do corte', 'Logo e imagens', 'Fonte da marca', 'Templates reutilizáveis'], [['Escolha o template', 'Ou crie o seu.'], ['Adicione marca', 'Logo, fonte e imagens.'], ['Baixe', 'Todos os cortes com a mesma marca.']]);
  add('exportar-para-editores', 'exportar', 'Exportar para Premiere, DaVinci e Final Cut.', 'Abra já cortado.', 'As falas escolhidas viram uma timeline que abre cortada no editor.', ['Premiere Pro (.xml)', 'DaVinci Resolve (.xml)', 'Final Cut Pro (.fcpxml)', 'SRT e marcadores de capítulo'], [['Escolha as falas', 'Favoritas ou cortes aprovados.'], ['Exporte', 'Escolha o editor.'], ['Importe', 'Continue a edição.']]);
  add('baixar-trechos', 'exportar', 'Baixar trechos e falas em arquivo.', 'As falas que importam.', 'Baixe só o que importa, em vídeo na qualidade original, em MP3 ou em texto.', ['Vídeo na qualidade original', 'MP3 do trecho', 'Texto e SRT do trecho'], [['Selecione', 'Falas ou cortes.'], ['Escolha o formato', 'Vídeo, MP3, TXT ou SRT.'], ['Baixe', 'Sem marca d\'água.']]);
  add('conector-para-ia', 'conector', 'Conector para assistentes de IA.', 'Peça ao ChatGPT, Claude ou Gemini.', 'Seu material fica disponível para o assistente que você já usa. Ele consulta o material, devolve trechos, capítulos e cortes e, se você permitir, organiza e gera por você.', ['ChatGPT, Claude e Gemini', 'Você decide o que o assistente pode fazer', 'Funciona com editores de código por MCP'], [['Conecte', 'Autorize o assistente.'], ['Peça', 'Em linguagem natural.'], ['Revise', 'O resultado é sempre seu para ajustar.']]);
  add('plugin-davinci-resolve', 'generico', 'Plugin para o DaVinci Resolve Studio.', 'Dentro do editor (beta fechado).', 'O plugin traz transcrição e cortes para dentro do DaVinci Resolve Studio. Está em beta fechado.', ['Transcrição na timeline', 'Marcadores de capítulos', 'Beta fechado'], [['Instale', 'Plugin do Agency.'], ['Conecte', 'Sua conta.'], ['Use', 'Dentro do editor.']]);
  add('video-e-youtube', 'generico', 'Vídeo e YouTube.', 'Arquivo ou link, inclusive de live.', 'Envie o arquivo ou cole o link. Para lives, o processamento acontece quando o replay fica disponível.', ['Arquivo de qualquer duração', 'Link do YouTube, Shorts e live', 'Escolha só o trecho que importa'], [['Envie ou cole', 'Arquivo ou link.'], ['Marque o trecho', 'Só ele conta na cota.'], ['Processe', 'Receba o resultado.']]);
  add('formatos-de-arquivo', 'tabela', 'Formatos de arquivo aceitos.', 'MP4, MOV, MP3, WAV e mais.', 'Áudio e vídeo nos formatos mais usados.', ['Áudio: MP3, WAV, M4A, AAC, OGG, OPUS', 'Vídeo: MP4, MOV, AVI, MKV, WEBM'], [['Envie', 'Qualquer formato aceito.'], ['Processe', 'Sem conversão manual.'], ['Exporte', 'TXT, PDF, SRT, FCPXML, MP3.']]);
  add('idiomas', 'generico', 'Transcrição em mais de 90 idiomas.', 'Com detecção automática.', 'Você não precisa informar o idioma antes de enviar. A tradução cobre 9 idiomas.', ['90+ idiomas na transcrição', 'Detecção automática', 'Tradução para 9 idiomas'], [['Envie', 'Sem escolher idioma.'], ['Detectamos', 'Automaticamente.'], ['Traduza', 'Se precisar.']]);
  add('tipos-de-conteudo', 'generico', 'Tipos de conteúdo.', 'Pregação, podcast, casamento e mais.', 'Escolha o tipo de conteúdo e a configuração já vem ajustada: duração dos cortes, tipos de momento e capítulos.', ['Pregação, podcast, casamento, aula', 'Configuração já ajustada', 'Tipo personalizado'], [['Escolha o tipo', 'Na hora do envio.'], ['Receba ajustado', 'Cortes e capítulos.'], ['Refine', 'Do seu jeito.']]);
  add('pastas-e-projetos', 'generico', 'Pastas e projetos.', 'Tudo organizado por cliente.', 'Agrupe os arquivos por cliente ou evento e veja tudo junto.', ['Projetos por cliente', 'Busca no projeto inteiro', 'Equipe'], [['Crie um projeto', 'Nome do cliente.'], ['Envie', 'Vários arquivos.'], ['Navegue', 'Tudo junto.']]);
  window.D.recursos = R;

  // Usos
  const U = {};
  const base = {
    pregacao: ['Cortes e capítulos da pregação', 'A mensagem de domingo chega a quem não estava lá.', ['Capítulos da mensagem', 'Cortes para as redes', 'Transcrição completa', 'Legenda SRT para o YouTube', 'Timeline para o editor']],
    podcast: ['Cortes e transcrição de podcast', 'O episódio inteiro vira uma semana de conteúdo.', ['Cortes com nota', 'Capítulos para a descrição', 'Transcrição para o site', 'Legenda SRT']],
    casamento: ['Decupagem de casamento', 'Horas de cerimônia, separadas em minutos.', ['Votos e discursos separados', 'Transcrição por pessoa', 'Planilha de decupagem', 'Cortes para o teaser']],
  };
  Object.entries(D.usoLabels).forEach(([slug, label]) => {
    const b = base[slug];
    U[slug] = { slug, label, title: b ? b[0] : `${label} em texto, cortes e legendas`, hi: b ? b[1] : `Do arquivo ao resultado.`,
      intro: `Para ${label.toLowerCase()}, você envia o arquivo ou cola o link do YouTube e recebe transcrição com falantes e minutagem, capítulos, cortes com legenda e exportação para o editor. Esta página é uma réplica de estudo: o texto foi reescrito e os exemplos são fictícios.`,
      receive: b ? b[2] : ['Capítulos', 'Cortes para as redes', 'Transcrição completa', 'Legenda SRT'] };
  });
  window.D.usos = U;
})();
