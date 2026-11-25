# INVB Studio — Editor avançado

Data: 2026-11-25 · Estado: aguardando aprovação

## Intenção

O INVB Studio faz transcrição e cortes das pregações. A edição dos cortes continua no CapCut. A equipe quer, além
disso, um editor de vídeo livre dentro do próprio app: abrir, importar um vídeo qualquer do computador e editar
normalmente (timeline, textos, legendas, sons, efeitos, exportar).

Esse editor já existe como projeto separado: o **invb-editor** (`C:\Projetos\invb-editor`,
`github.com/allanbfr77/invb-editor`), um fork do OpenCut classic, traduzido para pt-BR e sem banco de dados, login
nem site de divulgação. Falta colocá-lo dentro do INVB Studio.

O editor **soma**, não substitui: o fluxo de cortes e a edição no CapCut continuam como estão.

## Objetivos

- Um item **Editor avançado** na barra lateral do INVB Studio abre o editor.
- Quem usa o INVB Studio não instala nada a mais: o `iniciar.bat` / `iniciar.command` continua igual.
- O editor se atualiza junto com o app, pelo `git pull` que o `iniciar` já faz.
- O INVB Studio continua sendo um único servidor Node, sem etapa de build para quem usa.
- A aba **Sons** do editor funciona com a chave do Freesound distribuída pelo `equipe.env`.

## Fora do escopo (agora)

- Abrir um corte do INVB Studio direto no editor ("Abrir no editor"). Pode vir depois, por cima desta integração.
- Biblioteca compartilhada de sons, imagens e vídeos (conversa à parte).
- Trocar o visual do editor para a identidade preto e dourado do INVB Studio.
- Sincronizar projetos do editor entre computadores. Eles ficam no navegador de quem editou.

## Anti-objetivos

- Pedir para a equipe instalar Bun, Docker ou qualquer ferramenta nova.
- Deixar o INVB Studio mais lento para abrir ou dependente do editor para funcionar.
- Dois servidores ou duas portas para a equipe lidar.

## Como funciona hoje

**INVB Studio** (`C:\Projetos\invb-studio`): `server.js` em Node puro, sem build. Entrega `public/` como arquivos
estáticos (arquivo inexistente cai em `public/index.html`, a SPA do app) e encaminha `/api/*` para `lib/routes.js`.
Toda rota de `/api` exige o cookie de login (`authed(req)` em `lib/http.js`), exceto `/api/me` e o login. Abre em
`127.0.0.1:4321` (porta do `.env`). A barra lateral é montada em `public/app/shell.js`, função `shell()`; fora de
uma pregação ela mostra **+ Nova pregação**, **Início** e **Pregações**. Os tipos de arquivo estáticos conhecidos
ficam em `staticTypes` no `server.js` (hoje: html, css, js, svg, json, png, ico, ttf, txt).

**invb-editor**: Next.js 16 (App Router) com Bun, monorepo (`apps/web`). Projetos e mídias ficam no navegador
(IndexedDB/OPFS). Rotas: `/` (redireciona para `/projects`), `/projects` (lista), `/editor/[project_id]` (editor,
lê o id com `useParams`). Rotas de servidor: `/api/sounds/search` (busca no Freesound com a chave do `.env.local`) e
`/api/health`. Carrega arquivos da pasta `public` por caminho absoluto (`/fonts/...`, `/effects/preview.jpg`,
`/logos/...`, `/icons/...`) e usa um pacote WASM (`opencut-wasm`). Em desenvolvimento, o `layout.tsx` carrega o
React Scan; também carrega o script de analytics Databuddy e o `BotIdClient` (proteção anti-bot da Vercel).

## Abordagens consideradas

| | Como | Ganha | Perde |
|---|---|---|---|
| **A (escolhida)** | Compilar o editor como arquivos estáticos (`output: "export"`), copiar para dentro do invb-studio e servir pelo `server.js` em `/editor-avancado`. A busca do Freesound vira uma rota do INVB Studio. | Um servidor só, nada a instalar, atualiza com o `git pull`. | Ajustes no editor para funcionar sem servidor Next; alguém roda o build e commita o resultado a cada mudança no editor. |
| B | Compilar o editor com o servidor do Next (`output: "standalone"`) e o `iniciar` subir um segundo processo na porta 4322. | Quase nenhuma mudança no editor. | Dois servidores, duas portas, pasta muito maior no repositório. |
| C | Instalar Bun em cada computador e rodar o editor a partir do código. | — | Lento, pesado e frágil para a equipe. Descartada. |

A escolha da **A** foi do Alan, na recomendação.

## Decisões

### No INVB Studio

1. **Barra lateral:** item **Editor avançado** em `shell()`, logo depois de **Pregações**, só no menu principal
   (fora de uma pregação). Ícone novo no mesmo estilo dos demais (`ic.*`).
2. **Abre em uma aba nova** (`target="_blank"`), em `/editor-avancado/`. *(Decisão do construtor, proposta:)* o
   editor ocupa a tela inteira e tem cabeçalho próprio; numa aba nova, o INVB Studio continua aberto atrás.
3. **Onde ficam os arquivos:** `public/editor-avancado/`, versionados no repositório. Gerados, nunca editados à mão
   (um `LEIAME.txt` na pasta diz de onde vêm e qual commit do invb-editor gerou).
4. **Servir os arquivos do editor (`server.js`):**
   - Em `/editor-avancado/...`, um caminho sem extensão serve o `.html` correspondente da exportação
     (`/editor-avancado/projects` → `projects.html`; `/editor-avancado/` → `index.html`).
   - Arquivo inexistente dentro de `/editor-avancado/` responde **404**, e não a SPA do INVB Studio.
   - Adicionar a `staticTypes` os tipos que a exportação usa, no mínimo: `.wasm` (`application/wasm`, necessário para
     compilar o WASM em streaming), `.woff2`, `.woff`, `.jpg`/`.jpeg`, `.webp`, `.mp3`, `.mp4`, `.webmanifest`,
     `.map`. O construtor confere a lista final pelo que a exportação gerar.
   - Os arquivos com hash em `/_next/static/` podem ir com cache longo; o resto mantém `no-cache` como hoje.
5. **Login:** as páginas do editor são estáticas e abrem sem login, como os arquivos de `public/` hoje (o app só
   escuta em `127.0.0.1`). A rota de sons fica atrás do login como as demais de `/api`; o cookie vai junto porque o
   editor está na mesma origem.
6. **Rota de sons:** `GET /api/sounds/search` em `lib/routes.js` (ou um `lib/routes-sounds.js`), com a mesma
   entrada e saída da rota atual do editor (`apps/web/src/app/api/sounds/search/route.ts` no invb-editor):
   parâmetros `q`, `type`, `page`, `page_size`, `sort`, `min_rating`, `commercial_only`; resposta no mesmo formato
   JSON; mesmas mensagens de erro em pt-BR. Sem Redis e sem limite de requisições.
7. **Chave do Freesound:** `FREESOUND_API_KEY` no `.env` (vem do `equipe.env`). `FREESOUND_CLIENT_ID` não é usado
   pela busca e não precisa ir. Sem chave, a rota responde um erro claro ("Busca de sons não configurada") e o resto
   do editor funciona. Documentar em `install/equipe.env.example` e no README.
8. **README:** seção curta **Editor avançado**: o que é, onde abre, que os projetos ficam no navegador do computador,
   e como atualizar os arquivos do editor (comando do item 12).

### No invb-editor

9. **Exportação estática:** `next.config.ts` com `output: "export"`, `basePath: "/editor-avancado"`,
   `images.unoptimized: true` e `trailingSlash: false`. Ativado só no build para o INVB Studio (por variável de
   ambiente, por exemplo `INVB_STUDIO_EXPORT=1`), para o `bun dev:web` continuar funcionando como hoje.
10. **Rota do editor sem parâmetro dinâmico:** `/editor/[project_id]` vira `/editor` com o id na busca
    (`/editor?id=<id>`), lido com `useSearchParams` (dentro de `Suspense`, como o Next exige na exportação). Trocar
    os links e `router.push/replace` para o formato novo: `app/projects/page.tsx` (3 lugares),
    `components/providers/editor-provider.tsx` (1). A raiz `/` passa a redirecionar no cliente para `/projects`
    (`redirect()` de servidor não existe na exportação).
11. **Caminhos absolutos de `public/`:** prefixar com o `basePath` tudo que é buscado por caminho absoluto
    (`/fonts/...`, `/effects/preview.jpg`, `/logos/...`, ícones de `metadata.ts`), por uma constante única
    (`process.env.NEXT_PUBLIC_BASE_PATH`). `next/link` e `router` já recebem o `basePath` sozinhos; `fetch`, `src`
    em `<img>` comum, `new Image()`, CSS `url()` e o `metadata` não.
12. **Comando de build:** script `build:studio` no `package.json` da raiz, que compila com a exportação e copia a
    pasta `out/` para `<invb-studio>/public/editor-avancado/` (apaga a anterior antes) e grava o `LEIAME.txt` com o
    commit atual. O caminho do invb-studio vem de um argumento ou variável, com padrão `../invb-studio`.
13. **Rotas de servidor do editor:** `app/api/sounds/search` e `app/api/health` não entram na exportação (a busca
    passa para o INVB Studio). O código do editor continua chamando `/api/sounds/search` por caminho absoluto, sem
    `basePath`, e cai na rota do INVB Studio. Para o `bun dev:web` continuar tendo sons, a rota pode ficar no
    invb-editor desde que fique fora da exportação; o construtor escolhe como (ex.: mover para fora de `app/` no
    build de exportação, ou deixar a busca de sons sem servidor só no modo de desenvolvimento).
14. **Remover do build exportado:** React Scan (só existe em desenvolvimento, já fica de fora), script Databuddy
    (analytics do OpenCut) e `BotIdClient`/`withBotId` (dependem do servidor da Vercel). Remover de vez é aceitável:
    nenhum dos três serve à equipe.

## Custos conhecidos

- A pasta exportada deve ficar na casa de dezenas de MB (só o WASM tem ~3 MB; fontes e bandeiras, ~5 MB). Cada
  atualização do editor soma ao histórico do repositório e ao `git pull` da equipe. Aceitável no ritmo previsto de
  atualizações; se crescer demais, dá para passar a distribuir o editor como download separado.
- `FREESOUND_CLIENT_ID` é exigido hoje pelo `env/web.ts` do invb-editor, mas não é usado pela busca. O construtor
  pode torná-lo opcional.

## O que fica para o construtor

- Os detalhes da exportação que só aparecem ao rodar o build (páginas que precisam de `"use client"`, `Suspense`,
  avisos do Next), desde que o resultado abra e edite em `/editor-avancado/` servido pelo `server.js`.
- Ícone do item na barra lateral.
- Organização da rota de sons dentro de `lib/`.
- Como manter a busca de sons no `bun dev:web` (item 13).

## Como saber que deu certo

- No INVB Studio aberto pelo `iniciar`, **Editor avançado** abre o editor numa aba nova, em português.
- Criar projeto, importar um vídeo, cortar, pôr um texto e **Exportar** funcionam, e o vídeo baixa.
- Recarregar a página do editor (F5) em `/editor-avancado/editor?id=...` reabre o mesmo projeto.
- A aba **Sons** busca e toca efeitos com a chave do `equipe.env`; sem a chave, mostra o erro e o resto funciona.
- Nenhum pedido do editor cai na SPA do INVB Studio (nenhum 200 com o `index.html` do app para arquivo do editor).
- O `bun dev:web` do invb-editor continua funcionando em `localhost:3000`.
- Atualizar o editor é: rodar `build:studio` no invb-editor e commitar `public/editor-avancado/` no invb-studio.
