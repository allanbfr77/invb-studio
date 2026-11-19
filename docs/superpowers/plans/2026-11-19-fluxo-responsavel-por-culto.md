# Fluxo com responsável por culto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one person take a sermon from link to finished cuts in a shared Drive folder, with a transcript precise to a few seconds and a low-friction round trip to Claude.

**Architecture:** Pure logic (line splitting, cut-list parsing, clipboard text) goes in new single-purpose modules under `lib/`, unit-tested with `node:test`. `server.js` gains thin routes that call them. The front end (`public/app-area.js`) gets a line-based transcript view and three new buttons. Launch scripts for Windows and macOS live in `install/`.

**Tech Stack:** Node ≥ 20, zero npm dependencies (keep it that way), `node:test`, ffmpeg, yt-dlp, Google Drive API v3 over `fetch`, Google Identity Services token client.

**Spec:** `docs/superpowers/specs/2026-11-19-equipe-via-drive-design.md`

## Global Constraints

- No npm dependencies. `package.json` only gains `"test": "node --test test/"`.
- All user-facing text in Brazilian Portuguese, matching the existing tone.
- Transcript lines: at most about 5 seconds, break preferably at punctuation. No re-transcription.
- Original video cleanup: 7 days without use; the link stays saved.
- Cuts leave the app without burned captions by default.
- Drive calls must work for a folder in My Drive or in a shared drive (`supportsAllDrives=true`).
- Secrets (transcription key, OAuth client id, folder id) never enter the repository.
- Follow the file's existing style in `server.js` and `public/app-area.js` (dense one-liners, no framework).

## Review Focus

1. A transcript segment whose text was edited by hand, so its words no longer match its text: the line view must still show the edited text (one line for that segment), not stale words.
2. A segment with no `words` (local Whisper path or old transcript): shown as one line, no crash.
3. A pasted cut list with junk around it (markdown bullets, bold, `h:mm:ss`, en dash, "até", blank lines, prose lines): valid lines become cuts, the rest are reported back, nothing is silently dropped.
4. A cut in the list that is shorter than 3 s, reversed, or past the end of the video: rejected with the line quoted, the other cuts still created.
5. Original video already cleaned when the person clicks watch or export: the app says so and offers to download again; for `source: 'upload'` (no link) the original is never auto-cleaned.

## File Structure

| File | Responsibility |
|---|---|
| `lib/lines.js` (new) | Split transcript segments into short timed lines |
| `lib/cutlist.js` (new) | Parse pasted cut lists; build the text copied for Claude |
| `lib/drive.js` (modify) | Add folder lookup/creation and resumable upload |
| `lib/cleanup.js` (new) | Decide which originals are stale |
| `server.js` (modify) | Routes: lines in upload payload, bulk clips, send to Drive, refetch, free space, sweep |
| `public/app-area.js`, `public/app-area.css` (modify) | Line view, word click, copy for Claude, paste cuts, send to Drive, refetch |
| `install/` (new) | `iniciar.bat`, `iniciar.command`, `equipe.env.example` |
| `README.md`, `.env.example` (modify) | Setup and daily use, in Portuguese |
| `test/*.test.js` (new) | Unit tests for the `lib/` modules |

---

### Task 1: Short transcript lines (`lib/lines.js`)

**Files:** Create `lib/lines.js`, `test/lines.test.js`; modify `package.json`.

**Interfaces:**
- Produces: `splitLines(segments, opts?) -> Line[]` where `Line = { seg: number, start: number, end: number, text: string, speaker: string, words: {t: string, s: number, e: number}[] }`. `seg` is the index of the source segment. `opts.maxSec` defaults to `5`.
- Stored word shape in `transcript.json` is `{ w, s, e }` (see `server.js:238`, `:329`).

- [ ] **Step 1: Write failing tests** in `test/lines.test.js`:
  - `splits a 12 s segment into lines no longer than 5 s`: every line `end - start <= 5.01`; concatenated line texts equal the segment text (whitespace-normalised).
  - `prefers to break after punctuation`: words `"amou o mundo, que deu"` with the comma word ending at 3.8 s → first line ends with `mundo,`.
  - `segment without words becomes one line` with the segment's own start/end/text and `words: []`.
  - `edited segment falls back to one line`: segment text differs from its joined words → one line carrying `segment.text`.
  - `a single word longer than maxSec still yields a line` (no infinite loop, no empty line).
  - `empty input returns []`.
- [ ] **Step 2:** `node --test test/` → FAIL (module missing).
- [ ] **Step 3: Implement.** Greedy: accumulate words; close the line when adding the next word would pass `maxSec`; when closing, back up to the last word in the line ending in `.,;:!?…` if that word lies in the second half of the line. "Edited" check compares text and joined words after lowercasing and stripping non-letters/digits.
- [ ] **Step 4:** `node --test test/` → PASS. Add `"test": "node --test test/"` to `package.json`.
- [ ] **Step 5:** Commit `feat: quebra a transcrição em linhas curtas`.

### Task 2: Line view in the app

**Files:** Modify `server.js` (`publicUpload`, ~line 500), `public/app-area.js` (`segsOf` line 59, transcript page ~244–262, player highlight line 91), `public/app-area.css`.

**Interfaces:**
- Consumes: `splitLines` from Task 1.
- Produces: `GET /api/uploads/:id` adds `transcript.lines` (`Line[]` from Task 1). `transcript.segments` stays as today (without `words`). Front-end state `S.lines`.

- [ ] **Step 1:** In `publicUpload`, compute `lines` from the full segments before `words` is stripped.
- [ ] **Step 2:** Transcript page renders one row per line: time (`tm(start)`), then each word as a `<span data-s>`; lines without words render plain text. Clicking a word seeks to its `s`; clicking the time seeks to the line start. Search and speaker filter operate on lines.
- [ ] **Step 3:** "Editar fala" and "Renomear falante" keep working on the parent segment via `line.seg`; after saving, reload the upload so lines are recomputed.
- [ ] **Step 4:** Player highlight follows the current line; TXT export and "Selecionar → copiar" use lines. SRT/VTT keep using segments.
- [ ] **Step 5: Verify in the running app** with a real short video: lines ≤ 5 s, word click seeks, edit still saves. Commit `feat: transcrição em linhas curtas com clique na palavra`.

### Task 3: Round trip to Claude (`lib/cutlist.js`)

**Files:** Create `lib/cutlist.js`, `test/cutlist.test.js`; modify `server.js` (clips routes ~612), `public/app-area.js` (transcript toolbar, clips page line 204/297).

**Interfaces:**
- Produces: `buildPrompt(name, lines) -> string`; `parseCutList(text, duration) -> { cuts: {start: number, end: number, title: string}[], rejected: {line: string, reason: string}[] }`.
- Produces: `POST /api/uploads/:id/clips/bulk` body `{ text }` → `201 { created: Clip[], rejected: [...] }`.

- [ ] **Step 1: Write failing tests:**
  - `parses "12:40 - 14:05 Título"` → `{ start: 760, end: 845, title: 'Título' }`.
  - Accepts `1:02:03`, en/em dash, `até`, `a`, `→`, leading `- `, `* `, `1. `, `**bold**`, brackets `[12:40]`, and a `|` or `:` before the title.
  - Title missing → `'Corte 1'`, `'Corte 2'`… by position.
  - Prose line with no two timestamps → in `rejected` with reason `'Não encontrei início e fim.'`; blank lines ignored.
  - End ≤ start, length < 3 s, or start ≥ duration → `rejected` with the reason; end past duration is clamped.
  - `buildPrompt` output starts with the instruction block, contains every line as `[mm:ss] text` (`h:mm:ss` past one hour), and names the answer format `MM:SS - MM:SS Título`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Prompt header, fixed copy:

  ```
  Esta é a transcrição da pregação "<name>", com o tempo de cada trecho.
  Sugira de 1 a 4 cortes de 30 a 90 segundos que funcionem sozinhos, sem depender do resto da pregação.
  Responda só com uma lista, um corte por linha, neste formato:
  MM:SS - MM:SS Título do corte
  ```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Add the bulk route inside the existing `clips` lock; each created clip has the same shape as the manual clip at `server.js:617`.
- [ ] **Step 6:** UI: transcript toolbar gets "Copiar para o Claude" (clipboard, with the existing download fallback). Clips page gets "Colar minutagens" beside "+ Novo corte": a modal with a textarea; after submit, toast `N cortes criados` and, if any, list the rejected lines with their reasons inside the modal instead of closing it.
- [ ] **Step 7:** Verify in the app. Commit `feat: copiar para o Claude e colar minutagens`.

### Task 4: Send cuts to the Drive folder

**Files:** Modify `lib/drive.js`, `server.js`, `public/app-area.js` (`googleToken` line 137, clip card line 279), `.env.example`; create `test/drive-upload.test.js`.

**Interfaces:**
- Produces in `lib/drive.js`: `ensureFolder(token, parentId, name) -> Promise<string>` (returns folder id, reusing an existing non-trashed folder of that name); `uploadFile(token, { folderId, name, filePath, mime }) -> Promise<{ id: string, webViewLink: string }>` (resumable upload, streams from disk). Both accept an optional last argument `fetchImpl` for tests.
- Produces: `POST /api/uploads/:id/clips/:cid/drive`, header `x-google-token`, → `200 { webViewLink }`; `409` if the clip is not rendered; `501` if `DRIVE_CUTS_FOLDER_ID` is unset.
- Config: `DRIVE_CUTS_FOLDER_ID` and existing `GOOGLE_CLIENT_ID`. `GET /api/status` adds `driveCuts: boolean`.

- [ ] **Step 1: Failing tests** with a fake `fetchImpl`: `ensureFolder` returns the existing id when the list call finds one and creates otherwise; every request URL carries `supportsAllDrives=true`; `uploadFile` sends the bytes of a temp file and returns the parsed result; a 403 becomes an Error whose message mentions permission on the folder.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Route: subfolder name is the upload's `name`; file name is the clip title plus extension, sanitised like `server.js:637`. Record `clip.drive = { link, at }` in `clips.json`.
- [ ] **Step 6:** UI: change the token scope to `https://www.googleapis.com/auth/drive` (the narrower `drive.file` cannot write into a folder another person created) and update the comment at line 136. Add "Enviar para o Drive" on rendered clips; after success show "No Drive" linking to `webViewLink`. Hide the button when `driveCuts` is false.
- [ ] **Step 7:** Confirm a newly created clip renders without burned captions unless the person turns them on in the editor; change the editor default if it does not.
- [ ] **Step 8:** Commit `feat: envia cortes para a pasta do Drive`. Real Drive call needs the team's OAuth client and folder: record in the README that this path was tested only against a fake.

### Task 5: Keep only the link (cleanup and refetch)

**Files:** Create `lib/cleanup.js`, `test/cleanup.test.js`; modify `server.js` (YouTube route ~553, Drive route ~575, media route line 601, `renderClip` ~400, startup ~722), `public/app-area.js`.

**Interfaces:**
- Produces: `staleOriginals(metas, now, maxAgeMs) -> string[]` (ids). Stale means: `source` is `'youtube'` or `'drive'`, `status === 'done'`, `originalGone` falsy, and `(lastUsedAt || createdAt) < now - maxAgeMs`.
- Meta gains `lastUsedAt: number`, `originalGone: boolean`; Drive-sourced meta must store its `url` like YouTube already does.
- Produces: `POST /api/uploads/:id/free` (delete original now), `POST /api/uploads/:id/refetch` (download again, no re-transcription).
- Config: `KEEP_ORIGINAL_DAYS` default `7`.

- [ ] **Step 1: Failing tests** for `staleOriginals`: 8-day-old YouTube upload is stale; 6-day-old is not; `source: 'upload'` never is; `lastUsedAt` yesterday keeps a 30-day-old upload; already-gone and still-processing uploads are skipped.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Touch `lastUsedAt` on media serve (at most once a minute) and on render start. Sweep at startup and every 6 h: remove `original.*`, set `originalGone`.
- [ ] **Step 6:** Extract the YouTube and Drive download bodies into functions reused by `refetch`, which skips `pipeline` and only restores the file. Media and render routes answer `410 { error, canRefetch }` when the original is gone.
- [ ] **Step 7:** UI: on 410 show "A pregação saiu deste computador. Baixar de novo?" with a button; upload menu gets "Liberar espaço" for link-sourced uploads.
- [ ] **Step 8:** Verify by setting `KEEP_ORIGINAL_DAYS=0` locally. Commit `feat: guarda só o link e baixa a pregação de novo quando precisar`.

### Task 6: One-click start on Windows and macOS

**Files:** Create `install/iniciar.bat`, `install/iniciar.command`, `install/equipe.env.example`; modify `README.md`, `.env.example`, `.gitignore` (ignore `equipe.env`).

- [ ] **Step 1:** Each script: check for Node ≥ 20, ffmpeg, yt-dlp; install what is missing (`winget` on Windows, Homebrew on macOS, with a clear Portuguese message if the package manager itself is missing); update yt-dlp; copy `equipe.env` to `.env` if `.env` is absent; start `node server.js`; open `http://127.0.0.1:4321`.
- [ ] **Step 2:** `equipe.env.example` lists `GROQ_API_KEY`, `TRANSCRIBE_PROVIDER=groq`, `GOOGLE_CLIENT_ID`, `DRIVE_CUTS_FOLDER_ID`, each with a one-line explanation.
- [ ] **Step 3:** README in Portuguese: the five-step flow, first-time setup per system, the one-time Google Cloud setup (OAuth client, authorised origin `http://127.0.0.1:4321`, the three people as test users), how to get the folder id.
- [ ] **Step 4:** Run `shellcheck`-style read-through of the `.command` script on Linux (`bash -n`). State in the README and in the hand-off that neither script was run on a real Windows or macOS machine.
- [ ] **Step 5:** Commit `feat: scripts de início para Windows e Mac`.
