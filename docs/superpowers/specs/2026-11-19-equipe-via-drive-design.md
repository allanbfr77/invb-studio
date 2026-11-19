# INVB Studio — fluxo de cortes com um responsável por culto

Data: 2026-11-19 · Estado: aguardando aprovação
Substitui a versão anterior deste documento (projetos sincronizados pelo Drive,
com trava de edição), descartada pela equipe.

## Intenção

Três pessoas produzem cortes das pregações. A equipe decidiu que várias
pessoas avaliando o mesmo projeto atrapalha: depender de alguém entrar, ver e
confirmar leva tempo. Por isso cada culto tem um responsável, que faz sozinho
da transcrição aos cortes prontos. A colaboração acontece só depois, na
edição.

## Fluxo

| Etapa | Ferramenta | Quem |
|---|---|---|
| 1. Transcrição | INVB Studio | Responsável pelo culto |
| 2. Sugestões de cortes | Claude / IA | Responsável pelo culto |
| 3. Cortes (1 a 4 por pregação) | INVB Studio | Responsável pelo culto |
| 4. Cortes disponíveis para edição | Pasta compartilhada do Drive | Equipe |
| 5. Edição | CapCut (projeto compartilhado) | Equipe |

## Objetivos

- O responsável vai do link da pregação aos cortes no Drive sem depender de
  ninguém.
- A transcrição permite localizar um trecho com precisão de poucos segundos.
- Levar a transcrição ao Claude e trazer as sugestões de volta dá pouco
  trabalho.
- Com a pregação baixada, dá para fazer quantos cortes quiser sem novo
  download.
- Instalar e abrir o app não exige conhecimento técnico.

## Fora do escopo

- Compartilhar projetos, transcrição ou minutagem entre os computadores.
- Trava de edição, junção de alterações, lista de projetos da equipe.
- Hospedar o app como site.
- Guardar a pregação inteira: fica salvo só o link.
- Edição final (legenda, efeitos): é feita no CapCut.
- Integração com o CapCut.

## O que seria um fracasso, mesmo funcionando

- O responsável precisar esperar outra pessoa para concluir os cortes.
- Precisar baixar a pregação de novo a cada corte.
- Um colega não conseguir abrir o app no próprio computador.

## Abordagens consideradas

| | Abordagem | Situação |
|---|---|---|
| A | Site hospedado | Descartada: custo mensal de armazenamento |
| B | Um computador como servidor, com túnel | Descartada: depende de uma máquina ligada |
| C | Local, com projetos sincronizados pelo Drive e trava | Descartada: a revisão cruzada atrasa o fluxo |
| D | Local, um responsável por culto, só os cortes no Drive | **Escolhida pela equipe** |

## Mudanças no app

1. **Transcrição em linhas curtas.** Hoje a tela mostra os blocos que o
   serviço de transcrição devolve, com um tempo só no início. O transcript já
   guarda o tempo de cada palavra (`words` em cada segmento), mas o servidor
   remove esse dado antes de enviar à tela. Quebrar em linhas de até cerca de
   5 segundos, de preferência em pontuação. Clicar numa palavra leva o vídeo
   ao segundo dela. Não exige transcrever de novo.
2. **Copiar transcrição com tempos** no formato das linhas curtas, pronta para
   colar no Claude. Parte dos botões já existentes ("Copiar formato YouTube",
   "Baixar TXT").
2b. **Colar minutagens:** um campo que aceita uma lista como
   `12:40 - 14:05 Título do corte` (uma por linha) e cria os cortes de uma
   vez. O texto copiado na mudança 2 já pede ao Claude a resposta nesse
   formato.
3. **Enviar cortes para a pasta do Drive** pelo app, numa subpasta por culto.
   Usa o login Google que o navegador já faz, com permissão de escrita.
4. **Limpeza do vídeo original:** apagado do computador após 7 dias sem uso,
   com botão "liberar espaço". O link fica salvo para baixar de novo.
5. **Instalador** de um clique, com Node, ffmpeg e yt-dlp, que atualiza o
   yt-dlp ao abrir.

## Decisões tomadas por mim (não pelo usuário)

- Tamanho das linhas (5 s) e prazo de limpeza (7 dias): sugeridos, ainda não
  confirmados.
- Envio ao Drive pelo app em vez de upload manual.
- Os cortes saem do app sem legenda queimada por padrão, já que a edição é no
  CapCut.
- A etapa 2 fica em copiar e colar. A análise com IA embutida no app
  (`ANALYSIS_LLM`) continua desligada.

## O que fica para quem for construir

- Regra exata de quebra das linhas e textos da tela.
- Nome e organização das subpastas por culto.
- Configuração do projeto no Google Cloud para o login.

## Respondido pelo usuário

- **Sistemas:** Windows e Mac. O instalador precisa cobrir os dois.
- **Pasta dos cortes:** uma pasta compartilhada do Drive. As chamadas à API
  devem funcionar tanto para pasta em Meu Drive quanto em drive compartilhado
  (`supportsAllDrives`).
- **Criar cortes:** as duas formas. Marcar um a um, como hoje, e um campo para
  colar a lista de minutagens sugerida pelo Claude e criar todos de uma vez.
