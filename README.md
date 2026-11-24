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

### A pregação inteira não fica guardada

Fica salvo só o link. O vídeo baixado continua no computador enquanto você estiver usando, então dá
para fazer quantos cortes quiser sem baixar de novo. Depois de 7 dias sem uso ele é apagado; a
transcrição, a minutagem e os cortes prontos continuam. Se precisar do vídeo outra vez, o app mostra
um aviso com o botão **Baixar de novo**.

- Para apagar antes: em **Pregações**, menu `⋮` do envio → **Liberar espaço**.
- Arquivos enviados direto do computador (sem link) nunca são apagados automaticamente.
- Se o vídeo sair do ar na origem, os cortes já feitos continuam, mas não dá para baixar de novo.

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
- Lógica testável em `lib/`: `lines.js` (linhas curtas), `cutlist.js` (ida e volta com o Claude),
  `drive.js` (importar e enviar), `kit.js` (legenda e texto do corte), `cleanup.js` (limpeza do original), `claude.js` (IA), `autosync.js` (sincronia automática), `analyze.js`.
- O projeto e o plano desta mudança estão em `docs/superpowers/`.
