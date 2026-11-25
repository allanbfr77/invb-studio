# INVB Studio

Transcrição e cortes de pregações. Roda no computador de cada pessoa; os cortes prontos vão para uma
pasta compartilhada do Google Drive, de onde a equipe pega para editar.

O visual segue a identidade da Nova Vida Botafogo (preto e dourado). Na barra lateral, embaixo, ficam o interruptor
**Claro / Noturno** e a **versão** do app neste computador (data da última atualização e código dela).

## Como a equipe trabalha

Cada culto tem um responsável, que faz sozinho da transcrição aos cortes.

| Etapa | Onde | Quem |
|---|---|---|
| 1. Transcrição | INVB Studio | Responsável pelo culto |
| 2. Sugestões de cortes | Claude | Responsável pelo culto |
| 3. Cortes (1 a 4 por pregação) | INVB Studio | Responsável pelo culto |
| 4. Cortes disponíveis para edição | Pasta do Drive | Equipe |
| 5. Edição | CapCut (projeto compartilhado) | Equipe |

## Passo a passo de um culto

1. **Cole o link** da pregação (YouTube ou Google Drive) na tela inicial. O app baixa e transcreve.
   - Se o vídeo é o culto inteiro, preencha **Só a pregação: de … até …** (ex.: `1:05:30` a `1:52:00`). Só esse
     trecho fica no computador e é transcrito, o que poupa tempo e a cota do Groq. Link do YouTube com o tempo
     marcado (`&t=...`) já sugere o início. Vale também para arquivo enviado do computador.
2. Abra **Transcrição**. O texto aparece em linhas curtas, cada uma com o seu tempo. Clicar em uma
   palavra leva o vídeo ao segundo exato dela.
3. Clique em **Copiar para o Claude**, cole no Claude e envie. A resposta vem como uma lista:
   `12:40 - 14:05 Título do corte`.
4. Abra **Cortes** e clique em **Colar minutagens**. Cole a lista e confirme: os cortes são criados
   de uma vez. Linhas que não deram certo voltam com o motivo, para corrigir.
   - Também dá para criar um corte por vez em **+ Novo corte**, ou na Transcrição com
     **Selecionar** → marque as linhas → **Criar corte da seleção**.
   - Ou marque ouvindo: com a pregação tocando, a tecla **I** marca o início e **O** marca o fim; o corte aparece em Manuais.
   - **Ajustar**, em cada corte, aumenta ou tira uma frase do começo ou do fim. Com IA, também sugere uma versão mais curta e outros títulos.
   - No editor (**Editar**), arraste as pontas da linha do tempo para acertar o começo e o fim. Cortes que repetem o mesmo trecho ganham um aviso.
5. Em cada corte, clique em **Baixar corte**, confira o trecho e exporte. A legenda vem desligada,
   porque a edição é feita no CapCut; dá para ligar no editor.
6. Com o corte exportado, clique em **Enviar ao Drive**. Ele vai para uma subpasta com o nome
   da pregação, dentro da pasta da equipe, junto com o kit de edição:
   - `Título.srt`: a legenda no tempo do corte exportado, em blocos curtos, pronta para importar no CapCut;
   - `Título - texto.txt`: título, descrição e hashtags (quando gerados com **✨ Gerar texto**), o trecho de
     onde o corte veio e a fala transcrita.

Para fazer tudo de uma vez, use **Baixar todos** ou **Enviar todos ao Drive** no alto da lista: o app exporta o que
faltar e baixa (ou envia) cada corte da aba, um por vez.

### Legenda e visual do corte (gavetas do editor)

- **Legendas**: a aba **Estilos** tem 24 estilos prontos, por categoria (Essenciais, Destaque, Com fundo, Impacto,
  Elegante). Em **Personalizar** dá para mudar tudo: fonte, tamanho, maiúsculas, itálico, como a palavra falada aparece
  (inclusive **surgindo palavra por palavra**), quantas palavras por vez, cores, contorno, sombra, brilho, fundo,
  posição e distância da borda. Em **Efeitos**: como a frase entra (pulo a cada palavra, aparece suave, sobe, zoom),
  **palavra falada cresce** e **palavras-chave da fé** (Deus, Jesus, fé, graça…) sempre numa cor à parte.
  **Salvar como meu estilo** guarda o visual com um nome (em `data/caption-styles.json`). A ★ (ou a caixa “Usar como
  padrão”) faz os cortes novos já começarem com aquele estilo.
- **Fontes**: as fontes do app ficam em `public/fonts/` (com as licenças). A prévia e o vídeo exportado usam os mesmos
  arquivos, então o que aparece no editor é o que sai no vídeo, em qualquer computador.
  **+ Adicionar fonte** (em Legendas > Personalizar e em Texto) envia um arquivo `.ttf` ou `.otf`. Ele fica em
  `data/fonts/` e passa a valer para a legenda, os textos e as artes. O nome é o que vem dentro do arquivo.
- **Templates**: 13 modelos de igreja (Pregação, Versículo, Reflexão, Impacto, Igreja), cada um com legenda e faixa de
  título. **+ Criar template com o visual deste corte** guarda a legenda e tudo o que está por cima (textos, imagens e
  artes). O ⟳ num template seu troca o visual dele pelo do corte aberto.
- **Arte**: desenhos feitos com HTML e CSS (faixas, selos, molduras, setas), com prévia ao vivo e modelos para começar.
  Ao salvar, a arte vira uma imagem PNG transparente (gerada no navegador) que vai para o vídeo como as imagens da Mídia.
  O código fica em `data/arts.json`; dá para editar depois, e o corte que já usa a arte recebe a versão nova.
  Não vão para o vídeo: animações e imagens de links externos.
- **Ganchos**: frases curtas para o começo do corte (“OUÇA ATÉ O FIM”, “UMA PALAVRA PARA VOCÊ”…), nas cores da igreja.
- **Texto**, **Mídia** e **Camadas**: texto livre por cima, imagens enviadas e a lista do que está no quadro.
- **Painel da esquerda**: formato (Original, 16:9, 9:16, 1:1, 4:5) com **enquadramento**: nos formatos que recortam,
  arraste o vídeo na prévia (ou use Esquerda/Centro/Direita) para escolher que parte fica no quadro; a exportação usa
  a mesma posição. “Usar … nos cortes novos” deixa um formato como padrão (`data/editor-prefs.json`), inclusive para
  quem exporta pela lista sem abrir o editor. Velocidade de 0,5x a 2x; sincronia em segundos.
- **Da live ao YouTube** (o fluxo recomendado):
  1. Em **Nova pregação**, cole o link da live inteira. Com **"Depois de baixar: cortar no Editor avançado antes de
     transcrever"** (o padrão, lembrado), o Studio só baixa e fica **Aguardando o editor**. "Transcrever agora"
     segue direto, como antes.
  2. No **Editor avançado**, a seção **Pregações do Studio** (ou "Abrir no Editor avançado" na pregação) abre o
     projeto dela: na primeira vez o vídeo vem sozinho do Studio para o começo da linha do tempo; depois, o mesmo
     projeto com as edições. A ligação pregação → projeto fica no navegador.
  3. **Só cortou?** No painel de exportar, use **⚡ Cortar no Studio**: o editor manda só os trechos que ficaram e o
     Studio corta com o ffmpeg (`lib/cut.js`) — **rápido** (cópia direta, segundos; o corte pode cair até ~2 s antes)
     ou **exato** (gera de novo só o que ficou, com o codificador do Mac quando houver; minutos). A pregação passa a
     ser a versão cortada e é transcrita; dá para publicar no YouTube em seguida. Exportar pelo navegador gera o
     vídeo quadro por quadro e, numa live inteira, leva horas: fica para quando há texto, música ou efeitos.
  4. Com texto, música ou efeitos, edite e **exporte**. A janela **Vídeo exportado** já sugere **substituir o vídeo
     desta pregação** (o Studio transcreve só a pregação, minutagem a partir de 0:00) e pode **publicar no YouTube**:
     título, descrição, visibilidade e **thumbnail** (modelo da igreja, quadro do vídeo ou imagem pronta).
  5. O link do YouTube fica na pregação ("Ver no YouTube"). Pública ou não listada, a versão editada volta à
     limpeza dos 7 dias (o link do YouTube vira a fonte); privada, fica guardada.
- **Configurar o YouTube (uma vez)**: no projeto do Google Cloud do `GOOGLE_CLIENT_ID` (o mesmo do Drive), ative a
  **YouTube Data API v3** e acrescente o escopo `https://www.googleapis.com/auth/youtube.upload` na tela de
  consentimento. Projetos não verificados pelo Google podem ter os vídeos limitados a **privado** até passarem pela
  auditoria gratuita do YouTube. Thumbnail personalizada exige o canal **verificado por telefone**.
- **Editor avançado → Studio**: ao exportar no Editor avançado, abre a janela **Vídeo exportado** com três saídas:
  enviar pro Studio como **pregação nova**, **substituir o vídeo de uma pregação** (a versão editada vira a base da
  transcrição e dos cortes, a minutagem começa no início dela, e os cortes antigos saem) ou **só baixar**. A versão
  editada fica marcada como vinda do editor e não entra na limpeza dos 7 dias (não há link para baixá-la de novo).
  Isso fica em `public/app/editor-avancado-tema.js` (o mesmo script que dá ao editor a cara do Studio) e na rota
  `POST /api/uploads/<id>/edited`.
- **Barra da prévia**: Ímã, Raio-X (X), Guias (G: centro, terços e, no 9:16, a área que o Instagram/TikTok cobre) e
  Centralizar. A legenda se arrasta direto no vídeo.

### A pregação inteira não fica guardada

Fica salvo só o link. O vídeo baixado continua no computador enquanto você estiver usando, então dá
para fazer quantos cortes quiser sem baixar de novo. Depois de 7 dias sem uso ele é apagado; a
transcrição, a minutagem e os cortes prontos continuam. Se precisar do vídeo outra vez, o app mostra
um aviso com o botão **Baixar de novo**.

- Para apagar antes: em **Pregações**, menu `⋮` do envio → **Liberar espaço**.
- Arquivos enviados direto do computador (sem link) nunca são apagados automaticamente.
- Se o vídeo sair do ar na origem, os cortes já feitos continuam, mas não dá para baixar de novo.

## Editor avançado

Um editor de vídeo livre, para quando alguém quiser editar um vídeo qualquer: importar mídias, montar na linha do
tempo, pôr textos, legendas, sons e efeitos, e exportar. Ele soma ao fluxo de cortes; a edição dos cortes continua no
CapCut.

- Abre pelo item **Editor avançado** na barra lateral, numa aba nova (`/editor-avancado/`).
- Os projetos e as mídias ficam salvos no navegador daquele computador. Não vão para o Drive nem para outros
  computadores; o vídeo exportado é baixado como qualquer arquivo.
- A aba **Sons** busca efeitos sonoros no Freesound com a chave `FREESOUND_API_KEY` do `equipe.env`. Sem a chave, só
  essa aba fica sem busca.
- O editor é o projeto [invb-editor](https://github.com/allanbfr77/invb-editor) (baseado no OpenCut). Os arquivos
  dele ficam prontos em `public/editor-avancado/`, gerados, nunca editados à mão. Para atualizar: no invb-editor, rode
  `bun run build:studio` (com o invb-studio na pasta ao lado); depois commite `public/editor-avancado/` aqui.

## Instalação em cada computador

1. Baixe o projeto (botão **Code → Download ZIP** no GitHub) e descompacte.
2. Coloque o arquivo `equipe.env`, recebido de quem configurou, dentro da pasta `install`.
3. Dê dois cliques em:
   - **Windows:** `install\iniciar.bat`
   - **Mac:** `install/iniciar.command`
     (na primeira vez o Mac pode bloquear: clique com o botão direito → **Abrir**)
     Se o Mac disser que o arquivo não pode ser executado, ele perdeu a permissão no caminho (acontece
     com ZIP criado no Windows ou pasta sincronizada). Abra o Terminal, digite `chmod +x ` (com o
     espaço no fim), arraste o arquivo `iniciar.command` para a janela e aperte Enter.

Na primeira vez o arquivo instala o que faltar (Node, ffmpeg e yt-dlp). No Windows ele pede para
fechar a janela e abrir de novo depois de instalar. Nas vezes seguintes ele atualiza o yt-dlp e
abre o app no navegador. Se a pasta veio do GitHub por `git clone`, ele também busca a versão nova do app sozinho. Deixe a janela preta aberta enquanto usa.

Se a configuração da equipe mudar, basta trocar o `equipe.env` na pasta `install`: o arquivo de início
aplica a versão nova na próxima vez que for aberto. Por isso, não edite o `.env` à mão quando houver
um `equipe.env`; a alteração seria substituída.

Pré-requisitos do instalador automático: **winget** no Windows (já vem no Windows 11 e no 10
atualizado) e **Homebrew** no Mac (https://brew.sh).

> Estes dois arquivos de início ainda não foram executados em um Windows nem em um Mac de verdade.
> Na primeira instalação, se algo falhar, a mensagem na janela diz o que faltou.

## Configuração única da equipe

Feita uma vez, por uma pessoa. O resultado é o arquivo `install/equipe.env`
(modelo em `install/equipe.env.example`), repassado aos colegas por um canal privado.

1. **Senha do app:** escolha uma com pelo menos 10 caracteres (`INVB_PASSWORD`).
2. **Transcrição:** crie uma chave gratuita em https://console.groq.com/keys (`GROQ_API_KEY`).
3. **Pasta dos cortes:** crie a pasta no Drive, compartilhe com a equipe como **Editor** e copie o
   final do link (`https://drive.google.com/drive/folders/ESTE_TRECHO`) para `DRIVE_CUTS_FOLDER_ID`.
4. **Login do Google** (https://console.cloud.google.com):
   1. Crie um projeto.
   2. Em **APIs e serviços → Biblioteca**, ative a **Google Drive API**.
   3. Em **Tela de permissão OAuth**, escolha **Interno** se todos usam contas da mesma organização
      Google Workspace. Caso contrário, escolha **Externo**, deixe em modo de teste e adicione os
      e-mails da equipe como **usuários de teste**.
   4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, tipo **Aplicativo da Web**.
      Em **Origens JavaScript autorizadas**, adicione `http://127.0.0.1:4321`.
   5. Copie o **ID do cliente** para `GOOGLE_CLIENT_ID`.

O envio ao Drive pede acesso completo ao Drive da conta, porque a permissão mais restrita do Google
não deixa gravar em uma pasta criada por outra pessoa. O acesso vale só enquanto a aba está aberta
e não fica salvo em disco.

> O envio real ao Drive foi testado apenas contra uma simulação da API do Google. Faça um envio de
> teste depois de configurar.

## Recursos de IA (opcional, por computador)

Quem tiver uma chave da API do Claude ou da OpenAI pode ativar os recursos de IA só no próprio computador.
O app usa a que tiver chave; com as duas, vale o Claude, e `AI_PROVIDER=openai` troca.

1. Copie `install/pessoal.env.example` para `install/pessoal.env`.
2. Preencha `ANTHROPIC_API_KEY` (Claude) ou `OPENAI_API_KEY` (OpenAI) com a sua chave.
3. Feche e abra o app.

Com a chave, os cortes da aba **Automáticos** passam a ser escolhidos pelo Claude logo depois da
transcrição: até 6 trechos, cada um com uma nota de 0 a 100 pela força como pregação. A IA procura momentos
de ensino, exortação e reflexão sobre a Palavra, e não escolhe oração, louvor, avisos nem ofertas. Os trechos
de texto pré-feito da análise local deixam de aparecer; se a IA falhar, a aba fica vazia e a tela mostra o
motivo com o botão **Tentar de novo com IA**. A aba **Manuais** guarda só os cortes que você cria.

A página **Cortes** ganha também o botão **✨ Sugerir cortes com IA**: o Claude lê a transcrição e
acrescenta mais cortes à aba Automáticos, cada um com título, nota e o motivo da escolha. Cada corte ganha também o botão
**✨ Gerar texto**, que escreve título, descrição e hashtags para a publicação, a partir do que foi dito
naquele trecho; dá para ajustar, copiar tudo ou pedir outra versão. Sem a chave, esses botões não aparecem.

- O `pessoal.env` é só seu: não vai para o GitHub e não deve ser repassado junto com o `equipe.env`.
- Cada pregação processada faz uma chamada ao Claude, cobrada na conta dona da chave, mesmo que você não
  use os cortes. Cada "Sugerir cortes", "Gerar texto" e "Tentar de novo" é outra chamada. O modelo usado é o Claude Opus 5.5.
- A transcrição da pregação é enviada à API da Anthropic para ser analisada.

## Remover música (opcional, por computador)

No editor do corte, na seção **Áudio**, a chave **Remover música** usa um modelo de IA que separa a voz da
música e roda no próprio computador, sem enviar áudio para fora e sem custo por uso.

Para liberar essa opção, rode uma vez, com dois cliques:

- **Mac:** `install/instalar-voz-ia.command`
- **Windows:** `install\instalar-voz-ia.bat`

Ele baixa cerca de 1 GB para a pasta `.venv-voz` do projeto. Depois, feche e abra o app. A exportação com
**Remover música** demora mais: nos testes, perto de 12 segundos para um corte de 20 segundos.

## Sincronia automática (opcional, por computador)

Quando o som do vídeo vem adiantado ou atrasado em relação à boca, o editor do corte acha e corrige sozinho: na
seção **Sincronia do áudio**, clique em **✨ Detectar automaticamente**; para a pregação inteira (vale para todos os cortes), use o botão **🔊 Sincronia** na página **Cortes**. O app compara o movimento da boca com o som
(modelo SyncNet, no próprio computador) e, se a medida for segura, já deixa o ajuste no controle; confira com
**Testar** e exporte. Se não der para medir (rosto pequeno ou de lado, microfone na frente da boca, sem fala, atraso
que muda ao longo do vídeo), ele explica o motivo e não mexe em nada.

Para liberar o botão, rode uma vez, com dois cliques:

- **Mac:** `install/instalar-autosync.command`
- **Windows:** `install\instalar-autosync.bat`

Baixa cerca de 1 GB para a pasta `.venv-sync` e dois modelos (55 MB) para `models/autosync`. Depois, feche e abra o
app. Cada análise leva de 25 a 45 segundos. Detalhes, testes e limitações em `docs/autosync.md`.

## Para quem desenvolve

- Uma única dependência npm, o SDK oficial da Anthropic, carregada só quando há chave. `npm start` sobe o servidor; `npm test` roda os testes (`node --test`).
- Variáveis de ambiente: veja `.env.example`.
- Onde fica cada coisa no servidor:
  - `server.js`: só liga o app (telas de `public/`, encaminha `/api`, preparação ao abrir).
  - `lib/config.js`: configuração, chaves, serviços de transcrição e de IA, versão.
  - `lib/store.js`: dados das pregações em disco, execução de programas (ffmpeg, yt-dlp) e a fila de trabalhos.
  - `lib/http.js`: login e respostas (JSON, corpo do pedido, envio de arquivos).
  - `lib/media.js`: o vídeo original (YouTube, Drive, cópia de prévia, capa, limpeza).
  - `lib/transcribe.js`: transcrição local ou na nuvem e o passo a passo de uma pregação nova.
  - `lib/render.js`: exportação do corte com o ffmpeg.
  - `lib/routes.js`: as rotas da API. As do vídeo e da sincronia ficam em `lib/routes-media.js`; as de cortes e IA, em `lib/routes-clips.js`.
- Onde fica cada tela (`public/app/`, carregadas nessa ordem pelo `index.html`; conversam pelo objeto `window.INVB`):
  - `core.js`: atalhos de DOM, ícones, estado, chamadas ao servidor, avisos, janelas e menus.
  - `shell.js`: o vídeo e o player de baixo, o menu lateral e os atalhos I/O.
  - `home.js`: início, lista de pregações, envio do link ou arquivo, resumo e a tela de entrada.
  - `transcript.js`: transcrição. `clips.js` e `clips-actions.js`: cortes. `extras.js`: capítulos, emoções e diagramas.
  - `public/app.js`: o roteador (qual endereço abre qual tela).
- O editor do corte (`public/editor/`): `editor.js` (estado, estrutura, salvar e exportar), `preview.js` (prévia, teste de
  sincronia, linha do tempo e imagens por cima), `left.js` (painel da esquerda) e `drawers.js` (gavetas da direita). As
  partes dividem o objeto `shared`.
- Testes do servidor: `test/server-*.test.js`, por assunto, com os ajudantes em `test/helpers.js`.
- Formato do código: o JavaScript segue o Prettier, com as regras de `.prettierrc.json`. Para reformatar depois de mexer:
  `npx prettier --write .` (o CSS e os arquivos de texto ficam de fora, pelo `.prettierignore`).
- Estilos (`public/css/`, nessa ordem): `base.css` (variáveis e o básico), `app.css` (as telas), `editor.css` (o editor do
  corte) e `theme.css` (identidade da igreja e os modos claro e noturno).
- Legenda: `public/caption-styles.js` é a fonte única dos estilos e das fontes, usada pela prévia (navegador) e pela
  exportação (`lib/render.js`). `public/css/fonts.css` carrega as fontes de `public/fonts/`; as da equipe estão em `lib/fonts.js` (servidor) e em
  `public/editor/arte.js` (editor, junto com a gaveta Arte).
- Lógica testável em `lib/`: `lines.js` (linhas curtas), `cutlist.js` (ida e volta com o Claude),
  `drive.js` (importar e enviar), `kit.js` (legenda e texto do corte), `cleanup.js` (limpeza do original), `claude.js` (IA), `autosync.js` (sincronia automática), `analyze.js`.
- O projeto e o plano desta mudança estão em `docs/superpowers/`.
