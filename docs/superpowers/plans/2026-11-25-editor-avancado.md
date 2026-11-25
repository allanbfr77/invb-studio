# Editor avançado — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir o invb-editor dentro do INVB Studio, pelo item **Editor avançado** da barra lateral, servido como arquivos estáticos pelo `server.js`.

**Architecture:** O invb-editor (Next.js) ganha um modo de exportação estática com `basePath: "/editor-avancado"`; o script `build:studio` gera e copia o resultado para `invb-studio/public/editor-avancado/`. O `server.js` do INVB Studio serve essa pasta com regras próprias (sem cair na SPA) e ganha a rota `GET /api/sounds/search`, que substitui a rota de servidor do editor.

**Tech Stack:** INVB Studio: Node 20+ puro, testes `node --test`. invb-editor: Next.js 16 (App Router), Bun, testes `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-25-editor-avancado-design.md` (neste repositório)

Dois repositórios: **studio** = `C:\Projetos\invb-studio` · **editor** = `C:\Projetos\invb-editor`. Cada tarefa diz em qual
roda. Os commits de cada repositório ficam no próprio repositório.

## Global Constraints

- Quem usa o INVB Studio não instala nada a mais; `install/iniciar.bat` e `iniciar.command` não mudam.
- O INVB Studio continua um único servidor Node, sem etapa de build e sem dependência nova no `package.json`.
- Endereço do editor: `/editor-avancado/` (basePath `"/editor-avancado"`). Editor: `/editor-avancado/editor?id=<id>`.
- Pasta dos arquivos exportados no studio: `public/editor-avancado/`, gerada, nunca editada à mão, com `LEIAME.txt`.
- Rota de sons: `GET /api/sounds/search`, atrás do login, mesmos parâmetros e mesmo JSON da rota atual do editor
  (`apps/web/src/app/api/sounds/search/route.ts`), sem Redis e sem limite de requisições.
- Chave: `FREESOUND_API_KEY` no `.env` do studio (vem do `equipe.env`). Sem chave: erro `"Busca de sons não configurada"`.
- Textos de interface em pt-BR. Item da barra lateral: **Editor avançado**, depois de **Pregações**, abre em aba nova.
- O `bun dev:web` do editor continua funcionando em `localhost:3000`, com a aba Sons.

## Review Focus

1. **Arquivo do editor que não existe** (`/editor-avancado/_next/static/x.js` apagado por um build novo): deve dar 404,
   nunca o `index.html` do studio com status 200. Teste na Task 1.
2. **Caminho com `..`** (`/editor-avancado/../../server.js`): não pode servir nada fora da pasta do editor. Teste na Task 1.
3. **Freesound fora do ar ou chave errada** (401/500 de lá): a aba Sons mostra erro em pt-BR e o studio não cai. Teste na Task 2.
4. **F5 dentro do editor** (`/editor-avancado/editor?id=abc`): reabre o mesmo projeto, não a lista. Teste na Task 1
   (serve `editor.html` com a busca na URL) e verificação manual na Task 7.
5. **Pasta do editor ausente** (studio clonado antes do primeiro `build:studio`): `/editor-avancado/` responde 404 com
   mensagem clara, e o resto do studio funciona. Teste na Task 1.

---

### Task 1 (studio): servir os arquivos do editor

**Files:**
- Create: `lib/editor-static.js`
- Modify: `server.js` (função `serveStatic` e `staticTypes`)
- Modify: `lib/config.js` (campo `editorDir`)
- Test: `test/server-editor-avancado.test.js`

**Interfaces:**
- Produces: `resolveEditorFile(urlPath: string, editorDir: string): { file: string, cache: 'long' | 'none' } | null`
  — `urlPath` é o pathname depois de `/editor-avancado` (ex.: `/`, `/projects`, `/_next/static/a.js`).
- Produces: `cfg.editorDir` = `path.resolve(E.INVB_EDITOR_DIR || path.join(ROOT, 'public', 'editor-avancado'))`
  (a variável existe só para os testes apontarem para uma pasta temporária).

- [ ] **Step 1: Escrever os testes que falham** em `test/server-editor-avancado.test.js`, usando `boot(t, d, { env: { INVB_EDITOR_DIR: dir } })`
  e uma pasta temporária com `index.html` (`<p>lista</p>`), `projects.html`, `editor.html`, `_next/static/app-abc.js`
  e `wasm/core.wasm` (bytes `0x00 0x61 0x73 0x6d`):
  - `'/editor-avancado/ serve o index.html do editor'`: 200, corpo contém `lista`.
  - `'/editor-avancado (sem barra) também abre o editor'`: 200 (direto ou após redirecionar para `/editor-avancado/`).
  - `'caminho sem extensão serve o .html correspondente'`: `/editor-avancado/projects` → corpo de `projects.html`.
  - `'F5 no editor mantém a busca'`: `/editor-avancado/editor?id=abc` → 200, corpo de `editor.html`.
  - `'arquivo inexistente do editor dá 404, não a tela do studio'`: `/editor-avancado/_next/static/nao-existe.js` → 404
    e o corpo **não** contém o `<title>` do `public/index.html` do studio.
  - `'não sai da pasta do editor'`: `/editor-avancado/..%2F..%2Fserver.js` e `/editor-avancado/../../server.js` → 403 ou 404.
  - `'wasm vai com application/wasm'`: `content-type` = `application/wasm`.
  - `'arquivos de _next/static têm cache longo'`: `cache-control` contém `max-age=31536000` e `immutable`; `index.html` mantém `no-cache`.
  - `'sem a pasta do editor, responde 404 com aviso'`: `INVB_EDITOR_DIR` apontando para pasta inexistente → 404, corpo
    contém `Editor avançado não instalado`; e `/app` continua 200.
  - `'páginas do editor abrem sem login'`: `fetch` sem cookie em `/editor-avancado/` → 200.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node --test test/server-editor-avancado.test.js`
  Expected: FAIL (as rotas caem na SPA do studio).

- [ ] **Step 3: Implementar** `resolveEditorFile` em `lib/editor-static.js`: decodifica o caminho, junta com
  `editorDir`, recusa (retorna `null`) o que sair da pasta; `/` → `index.html`; sem extensão → `<caminho>.html`;
  `cache: 'long'` quando o caminho começa com `/_next/static/`. Em `server.js`, `serveStatic` trata primeiro
  `url === '/editor-avancado' || url.startsWith('/editor-avancado/')`: arquivo encontrado → 200 com o tipo de
  `staticTypes`; caminho recusado → 403; não encontrado → 404 (texto `Editor avançado não instalado. Rode o
  build:studio no invb-editor.` quando `editorDir` não existe, `Não encontrado` caso contrário). Acrescentar a
  `staticTypes`: `.wasm` `application/wasm`, `.woff2` `font/woff2`, `.woff` `font/woff`, `.otf` `font/otf`,
  `.jpg`/`.jpeg` `image/jpeg`, `.webp` `image/webp`, `.gif` `image/gif`, `.mp3` `audio/mpeg`, `.mp4` `video/mp4`,
  `.webmanifest` `application/manifest+json`, `.map` `application/json`, `.xml` `application/xml`.

- [ ] **Step 4: Rodar e ver passar**

  Run: `node --test test/server-editor-avancado.test.js` → PASS. Depois `npm test` → os testes antigos continuam passando.

- [ ] **Step 5: Commit** (studio): `git add lib/editor-static.js lib/config.js server.js test/server-editor-avancado.test.js`
  · `git commit -m "Editor avançado: servir os arquivos do editor em /editor-avancado"`

### Task 2 (studio): rota de busca de sons

**Files:**
- Create: `lib/sounds.js`
- Modify: `lib/routes.js` (despacho depois do `if (!authed(req))`)
- Modify: `lib/config.js` (campo `freesoundKey`)
- Modify: `install/equipe.env.example`
- Test: `test/sounds.test.js`

**Interfaces:**
- Produces: `searchSounds(query: URLSearchParams, { apiKey: string, base: string }): Promise<{ status: number, body: object }>`
  — `base` padrão `'https://freesound.org/apiv2'`, trocável por `E.INVB_FREESOUND_API_BASE` (só para testes, mesmo
  padrão de `INVB_GOOGLE_API_BASE` em `lib/drive.js`).
- Produces: `cfg.freesoundKey = E.FREESOUND_API_KEY || ''`.

- [ ] **Step 1: Escrever os testes que falham** em `test/sounds.test.js`, chamando `searchSounds` contra um servidor
  Freesound falso (`node:http` em porta livre) que registra a URL recebida e devolve um resultado de exemplo:
  - `'sem chave, responde que a busca não está configurada'`: `apiKey: ''` → `status 503`, `body.error === 'Busca de sons não configurada'`, e nenhuma chamada ao servidor falso.
  - `'busca de efeitos manda os filtros e transforma o resultado'`: `q=bell&type=effects&page=2` → a URL recebida tem
    `query=bell`, `page=2`, `page_size=20`, `token=<chave>`, os filtros `duration:[* TO 30.0]` e `avg_rating:[3 TO *]`,
    o filtro de licença e o de tags; a resposta tem `results[0].previewUrl` = o `preview-hq-mp3` do exemplo,
    `downloads`, `rating`, `ratingCount`, `type: 'effects'`, `page: 2`, `pageSize: 20`, `sort: 'downloads'`.
  - `'sem termo, ordena por downloads_desc; com termo e sort=score, usa score'`.
  - `'commercial_only=false tira o filtro de licença'` (a rota antiga ignorava esse parâmetro; aqui ele vale).
  - `'type=songs responde 501 com a mensagem em português'`: corpo igual ao da rota antiga (`Músicas ainda não estão disponíveis`).
  - `'parâmetro inválido responde 400'`: `page=0` ou `page_size=500` → 400, `error: 'Parâmetros inválidos'`.
  - `'Freesound com erro devolve "Falha ao buscar sons" com o mesmo status'`: servidor falso responde 401 → `status 401`.
  - `'Freesound fora do ar responde 502 sem derrubar'`: `base` para porta fechada → `status 502`, `error: 'Falha ao buscar sons'`.
  - Teste de servidor em `test/server-editor-avancado.test.js`: `'GET /api/sounds/search exige login'` → sem cookie 401;
    com `s.api('/sounds/search?q=x')` e `env: { FREESOUND_API_KEY: 'k', INVB_FREESOUND_API_BASE: <falso> }` → 200.

- [ ] **Step 2: Rodar e ver falhar** — `node --test test/sounds.test.js` → FAIL (`Cannot find module '../lib/sounds'`).

- [ ] **Step 3: Implementar** `searchSounds` em `lib/sounds.js`, portando a lógica de
  `invb-editor/apps/web/src/app/api/sounds/search/route.ts` sem zod: validação manual com os mesmos limites
  (`q` até 500 caracteres; `type` `songs|effects`; `page` 1–1000, padrão 1; `page_size` 1–150, padrão 20;
  `sort` `downloads|rating|created|score`, padrão `downloads`; `min_rating` 0–5, padrão 3; `commercial_only`
  padrão `true`, `'false'`/`'0'` desligam), mesmos `fields`, filtros e transformação. Usa `fetch` global.
  Em `lib/routes.js`: `if (a === 'sounds' && b === 'search' && method === 'GET')` → `searchSounds(q, { apiKey: cfg.freesoundKey, base })` e `send(res, r.status, r.body)`.
  Em `install/equipe.env.example`: bloco comentado `# Editor avançado: busca de sons (https://freesound.org/apiv2/apply)` com `FREESOUND_API_KEY=`.

- [ ] **Step 4: Rodar e ver passar** — `node --test test/sounds.test.js test/server-editor-avancado.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit** (studio): `git commit -m "Editor avançado: busca de sons no Freesound pelo INVB Studio"`

### Task 3 (studio): item na barra lateral e README

**Files:**
- Modify: `public/app/core.js` (novo ícone `ic.wand` no objeto `ic`)
- Modify: `public/app/shell.js` (função `shell`, ramo sem `up`)
- Modify: `README.md` (seção **Editor avançado**)

**Interfaces:**
- Consumes: rota `/editor-avancado/` da Task 1.

- [ ] **Step 1: Implementar** no ramo do menu principal de `shell()`, depois de `link('/app/uploads', ic.files, 'Pregações', path)`:
  `<a class="ap-link" href="/editor-avancado/" target="_blank" rel="noopener">${ic.wand}Editor avançado</a>`
  (não usa `link()`, porque nunca fica marcado como ativo). Ícone `ic.wand`: SVG 24×24 no mesmo traço dos demais
  (`fill="none" stroke="currentColor" stroke-width="2"`), um claquete ou varinha.
- [ ] **Step 2: README:** seção **Editor avançado** depois de "Passo a passo de um culto": o que é (editor de vídeo
  livre, soma ao CapCut), onde abre (barra lateral, aba nova), que os projetos ficam no navegador daquele computador,
  que a aba Sons usa `FREESOUND_API_KEY` do `equipe.env`, e como atualizar: no invb-editor, `bun run build:studio`;
  no invb-studio, commitar `public/editor-avancado/`.
- [ ] **Step 3: Verificar** com `node server.js` (pasta do editor ainda vazia): o item aparece depois de Pregações,
  abre aba nova em `/editor-avancado/` com o aviso `Editor avançado não instalado`, e não aparece dentro de uma pregação.
- [ ] **Step 4: Commit** (studio): `git commit -m "Editor avançado: item na barra lateral e README"`

### Task 4 (editor): caminhos com o prefixo do editor

**Files:**
- Create: `apps/web/src/utils/base-path.ts`
- Modify: `apps/web/src/app/metadata.ts`, `apps/web/src/site/brand.ts`, `apps/web/src/components/ui/font-picker.tsx`,
  `apps/web/src/services/renderer/effect-preview.ts` e todo arquivo que busque `/fonts/`, `/effects/`, `/logos/`,
  `/icons/`, `/flags/`, `/shapes/`, `/stickers/`, `/platform-guides/`, `/open-graph/` por caminho absoluto
  (achar com `grep -rnE '["\x60]/(fonts|effects|logos|icons|flags|shapes|stickers|platform-guides|open-graph)/' apps/web/src`)
- Test: `apps/web/src/utils/__tests__/base-path.test.ts`

**Interfaces:**
- Produces: `BASE_PATH: string` (= `process.env.NEXT_PUBLIC_BASE_PATH ?? ""`) e `withBasePath(path: string): string`.

- [ ] **Step 1: Teste que falha:** `withBasePath("/fonts/a.json")` → `"/fonts/a.json"` com `BASE_PATH` vazio; com a
  função aceitando o prefixo explícito para teste — assinatura `withBasePath(path: string, base = BASE_PATH)` —
  `withBasePath("/fonts/a.json", "/editor-avancado")` → `"/editor-avancado/fonts/a.json"`; URL absoluta
  (`"https://x/y"`) e `"data:..."`/`"blob:..."` voltam sem mudança.
- [ ] **Step 2:** `bun test apps/web/src/utils/__tests__/base-path.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `withBasePath` e trocar os caminhos absolutos de `public/` por `withBasePath(...)`.
  Não mexer em `href`/`router.push` (o Next já aplica o basePath) nem em `/api/sounds/search` (deve ficar sem prefixo).
- [ ] **Step 4:** `bun test` → mesmas 5 falhas conhecidas do WASM e o resto passando; `npx tsc --noEmit -p apps/web` → 0 erros;
  `bun dev:web` → fontes do seletor e prévias de efeito carregam em `localhost:3000`.
- [ ] **Step 5: Commit** (editor): `git commit -m "Caminhos de arquivos com o prefixo do editor (basePath)"`

### Task 5 (editor): rota do editor sem parâmetro dinâmico

**Files:**
- Move: `apps/web/src/app/editor/[project_id]/page.tsx` → `apps/web/src/app/editor/page.tsx`
- Modify: `apps/web/src/app/projects/page.tsx` (links e `router.push` para o editor, 3 lugares),
  `apps/web/src/components/providers/editor-provider.tsx` (`router.replace`), `apps/web/src/app/page.tsx`

**Interfaces:**
- Produces: `editorHref(projectId: string): string` = `` `/editor?id=${encodeURIComponent(projectId)}` `` em
  `apps/web/src/project/editor-href.ts`, usado por todos os links para o editor.

- [ ] **Step 1: Teste que falha** `apps/web/src/project/__tests__/editor-href.test.ts`: `editorHref("abc")` → `"/editor?id=abc"`;
  `editorHref("a b")` → `"/editor?id=a%20b"`.
- [ ] **Step 2:** `bun test apps/web/src/project/__tests__/editor-href.test.ts` → FAIL.
- [ ] **Step 3: Implementar:** a página do editor lê o id com `useSearchParams().get("id")`, dentro de `<Suspense>`;
  sem id, volta para `/projects`. Todos os pontos que montavam `` `/editor/${id}` `` passam a usar `editorHref`.
  `app/page.tsx` vira componente cliente que faz `router.replace("/projects")` (sem `redirect()` de servidor).
- [ ] **Step 4:** `bun test` (mesmas 5 falhas conhecidas), `tsc` 0 erros, e no `bun dev:web`: criar projeto abre
  `/editor?id=...`; F5 reabre o mesmo projeto; "Sair do projeto" volta à lista; `/` vai para `/projects`.
- [ ] **Step 5: Commit** (editor): `git commit -m "Editor em /editor?id= (compatível com exportação estática)"`

### Task 6 (editor): exportação estática e build:studio

**Files:**
- Modify: `apps/web/next.config.ts`
- Rename: `apps/web/src/app/api/sounds/search/route.ts` → `route.server.ts`; `apps/web/src/app/api/health/route.ts` → `route.server.ts`
- Modify: `apps/web/src/app/layout.tsx` (sai o script Databuddy e o `BotIdClient`)
- Modify: `apps/web/src/env/web.ts` (`FREESOUND_CLIENT_ID` opcional)
- Modify: `apps/web/package.json` (sai `botid` com `bun remove botid`)
- Create: `scripts/build-studio.ts`
- Modify: `package.json` da raiz (script `"build:studio": "bun scripts/build-studio.ts"`)

**Interfaces:**
- Consumes: `withBasePath` (Task 4), `editorHref` (Task 5).
- Produces: `bun run build:studio [caminho-do-invb-studio]` → apaga e recria `<studio>/public/editor-avancado/` com a
  exportação e um `LEIAME.txt`. Caminho padrão: `../invb-studio` (relativo à raiz do invb-editor); também aceita
  `INVB_STUDIO_DIR`.

- [ ] **Step 1: next.config.ts.** Com `INVB_STUDIO_EXPORT=1`: `output: "export"`, `basePath: "/editor-avancado"`,
  `images: { unoptimized: true }`, `trailingSlash: false`, `env: { NEXT_PUBLIC_BASE_PATH: "/editor-avancado" }`,
  `pageExtensions: ["tsx", "ts"]`. Sem a variável: config de hoje com `pageExtensions: ["tsx", "ts", "server.ts"]`
  (é isso que tira as rotas `route.server.ts` da exportação e mantém a aba Sons no `bun dev:web`). Tirar o `withBotId`.
- [ ] **Step 2: Remover** o `<Script>` do Databuddy e o `<BotIdClient>` do `layout.tsx`; `bun remove botid` em `apps/web`.
- [ ] **Step 3: scripts/build-studio.ts:** roda `next build` em `apps/web` com `INVB_STUDIO_EXPORT=1`; falha com
  mensagem clara se a pasta do studio não tiver `server.js`; apaga `<studio>/public/editor-avancado/`, copia
  `apps/web/out/` para lá e grava `LEIAME.txt`:
  `Arquivos gerados pelo invb-editor (bun run build:studio). Não edite à mão.` + linha `Commit: <git rev-parse --short HEAD>` + `Gerado em: <data ISO>`.
- [ ] **Step 4: Verificar:** `bun run build:studio` termina sem erro; `<studio>/public/editor-avancado/` tem `index.html`,
  `projects.html`, `editor.html`, `_next/static/` e nenhum `api/`; `bun dev:web` ainda abre e a aba Sons ainda busca.
- [ ] **Step 5: Commit** (editor): `git commit -m "Exportação estática para o INVB Studio (build:studio)"`

### Task 7 (studio): publicar o editor e conferir de ponta a ponta

**Files:**
- Create: `public/editor-avancado/**` (gerado pela Task 6)

- [ ] **Step 1:** No editor, `bun run build:studio`. No studio, conferir o tamanho: `du -sh public/editor-avancado`
  (esperado: dezenas de MB; se passar de 100 MB, parar e avisar antes de commitar).
- [ ] **Step 2: Conferir com o studio aberto pelo `node server.js`** (com `FREESOUND_API_KEY` no `.env`), cada item
  de "Como saber que deu certo" do spec:
  - **Editor avançado** abre o editor numa aba nova, em português.
  - Criar projeto, importar um vídeo, dividir, pôr um texto e **Exportar**: o vídeo baixa.
  - F5 em `/editor-avancado/editor?id=...` reabre o mesmo projeto.
  - Aba **Sons** busca e toca; com `FREESOUND_API_KEY` vazio, mostra `Busca de sons não configurada` e o resto funciona.
  - No console e na aba de rede do navegador, nenhum pedido do editor volta 404 nem com o HTML do studio.
- [ ] **Step 3:** `npm test` → PASS.
- [ ] **Step 4: Commit** (studio): `git add public/editor-avancado` · `git commit -m "Editor avançado: arquivos do invb-editor <commit>"`
