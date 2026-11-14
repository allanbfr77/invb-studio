# INVB Studio

Transcrição, capítulos, cortes e roteiros para vídeo e áudio. Feito para uso próprio, em servidor, com IA via API na nuvem. Sem dependências npm.

## Deploy (servidor)

Precisa de: Node 20+, **ffmpeg** no servidor (o `Dockerfile` já instala), um **disco persistente** em `DATA_DIR` e HTTPS na frente (qualquer plataforma faz isso).

Variáveis de ambiente (ver `.env.example`):

| Variável | Para quê |
|---|---|
| `INVB_PASSWORD` | **Obrigatória** (mín. 10 caracteres). Sem ela o servidor se recusa a subir exposto na rede. Trocar o valor troca a senha. |
| `OPENAI_API_KEY` | Transcrição por API (compatível com a da OpenAI; `OPENAI_BASE_URL` muda o endpoint). É a única parte que usa IA hoje. |
| `GROQ_API_KEY` | **Transcrição pela Groq** (Whisper, camada gratuita com limite de áudio por hora). Usada automaticamente quando existe; `GROQ_WHISPER_MODEL` troca o modelo. Reaproveitada do projeto Transcritor. |
| `GOOGLE_CLIENT_ID` | Link do Google Drive: só para arquivos **privados** (login do Google no navegador). Arquivos “qualquer pessoa com o link” baixam sem login. A origem do app precisa estar nas “Origens JavaScript autorizadas” do cliente OAuth. |
| `ANALYSIS_LLM=1` | Reativa a análise com LLM (emoções, capítulos e cortes com IA). Desativada por padrão. |
| `DATA_DIR` | Pasta de arquivos e resultados (`/data` no Docker). |
| `TRUST_PROXY=1`, `COOKIE_SECURE=1` | Atrás de proxy HTTPS (já definidos no Dockerfile). |

```bash
docker build -t invb-studio .
docker run -p 8080:8080 -v invb-data:/data \
  -e INVB_PASSWORD='uma-senha-forte' -e OPENAI_API_KEY='sk-...' invb-studio
```
Health check: `GET /healthz`. Rode **uma única instância** (fila e arquivos ficam em memória/disco local).

## Entrada
Não há página inicial pública: `/` (e qualquer endereço fora da área logada) abre direto em `/entrar`. Depois do login o app segue em `/app`; se você já está logado, `/entrar` pula para `/app`. Os arquivos do antigo site público continuam em `public/` (`app.js`, `data.js`, `styles.css`), mas não são mais servidos como páginas.

## Limites da Groq (plano gratuito)
O app divide o áudio em blocos de 20 min (~7 MB). Quando a API responde 429 (limite de áudio por hora/dia), ele **espera o tempo informado** (com contagem regressiva na tela, até 4 h no total) e repete o mesmo bloco. O progresso é gravado a cada bloco (`partial.json`): se der erro ou o servidor reiniciar, “Tentar de novo” retoma do bloco em que parou. Os limites valem por organização Groq (outros apps com a mesma chave contam junto).

## Editor “Baixar corte”
Mesma organização do original: configurações à esquerda (formato de saída, preto e branco, preservar qualidade, remover pausas), prévia com barra de ferramentas (desfazer, refazer, ímã, raio-X, eixos, régua, centralizar, atalhos), drawer de painéis e trilho à direita. Tudo é aplicado pelo ffmpeg do servidor (`renderClip`).

- **Legendas:** 235 estilos em 22 categorias (nomes e contagens do original; a aparência é aproximada), busca, favoritos, “sem legenda”. Fonte, Efeitos e Tradução só liberam depois de escolher um estilo. Modos reais: linha inteira, uma palavra, duas, destaque na palavra falada, marca-texto e varredura (karaokê), com o tempo de cada palavra.
- **Templates:** meus (salvos) e 48 prontos em 10 categorias (aplicam legenda + faixa de título; não são as molduras gráficas do original).
- **Mídia:** biblioteca de imagens (PNG/JPEG/WebP, 8 MB) e imagens sobre o corte: arrastar, redimensionar, opacidade, quando aparecem. **Texto:** textos sobre o corte com fonte, cor, tarja, contorno e tempo. **Ganchos:** 17 ganchos de texto. **Camadas:** ordem (arrastar), ocultar, excluir.
- **Transcrição:** título, intervalo (h:m:s e slider), clicar numa palavra ajusta início/fim, remover palavras do vídeo, editar o texto da legenda, baixar segmento.
- **Tradução** (aba Legendas): 9 idiomas via modelo de linguagem da Groq (`GROQ_API_KEY`; opcional `GROQ_CHAT_MODEL`).
- **Não existe:** Divisão e Fundos (desativados, como no original), “Mais ações” dos cartões, estilos com emoji, molduras gráficas dos templates.

## O que é real
Login por senha, upload, transcrição por API (em blocos de 20 min), capítulos e cortes sugeridos por heurística local (a análise com LLM está desativada, ver `ANALYSIS_LLM`), edição de texto e falantes, renderização de cortes com ffmpeg (9:16 por recorte central + legenda queimada), roteiros, projetos, exportação TXT/SRT/VTT.

## Limites conhecidos
- Sem separação automática de falantes (tudo "Pessoa 1"; renomeie).
- Sem `OPENAI_API_KEY` a transcrição falha com mensagem clara. Emoções ficam indisponíveis enquanto o LLM estiver desativado.
- Arquivos ficam no disco do servidor (não há S3 ainda). Render de vídeo usa CPU do servidor.
- Templates e Biblioteca ainda não entram nos cortes. Importação do YouTube exige `yt-dlp` no servidor (não incluído).
- Não testado: transcrição/LLM com chave real, imagem Docker (Docker não estava disponível no ambiente de teste), arquivos muito grandes.

## Local (opcional)
`node server.js` em http://127.0.0.1:4321. Transcrição local com `faster-whisper` é opcional: `TRANSCRIBE_PROVIDER=local` (usa `worker/transcribe.py`).
