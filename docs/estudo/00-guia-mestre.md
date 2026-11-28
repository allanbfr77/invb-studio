# Guia mestre dos cortes de pregação — INVB Studio

Resumo do estudo de 6 frentes (ofício do editor, tipografia, cores, marketing, mercado brasileiro de cortes, animação e
som), feito em nov/2026 com dezenas de fontes (Galloway, Jenny Hoyos, Netflix, Material Design, NN/g, Mosseri/Instagram,
YouTube, Kapwing, Opus, Submagic, School of Motion, Butterick, coloristas, guias de igreja e de canais de cortes BR).
Os detalhes, números e fontes estão nos arquivos 01 a 06 desta pasta. Aqui ficam **as regras que a equipe e o Studio
seguem**, e o que já está automático.

> A grande lição de todas as frentes: **contenção é o que parece premium.** Amador usa tudo o que descobriu; profissional
> põe cada elemento ligado ao sentido da fala — e deixa o pregador e a mensagem serem a estrela.

## 1. O trecho (o que vira um bom corte)
- **Uma ideia por corte.** Dois pensamentos = dois cortes.
- **Começa na frase mais forte** — sem "então, igreja", "abram a Bíblia em…", saudação. Os 3 primeiros segundos decidem.
- **Termina na recompensa** (conclusão, aplicação), segura ~1 s e corta. Sem "amém, Deus abençoe", sem vinheta final.
- **30–60 s** é o padrão; histórias e testemunhos até 90 s; nunca mais de 90 (vira parte 1 e parte 2).
- **Teste dos 60 segundos:** funciona sem contexto? tem um só ponto? um estranho compartilharia? funciona no mudo?
- O que mais performa: virada/contraste, revelação bíblica explicada, história curta completa, definição citável,
  pergunta que nomeia um sentimento, confissão.
- **Fidelidade:** nada de "corte gotcha" (frase isolada que soa herética, agressiva ou zombeteira). O pregador aprovaria?
- *No Studio:* o prompt dos cortes automáticos segue tudo isso (lib/claude.js, `CUTS_SYSTEM`).

## 2. Legenda
- **Queimada, sempre** (metade assiste no mudo). Palavra por palavra (a pedido da equipe).
- Fonte **pesada (700–900)**, branca, **contorno preto** (contorno sólido lê melhor que sombra; tarja em cada palavra
  vira "etiqueta preta"). Contraste ≥ 7:1.
- **Destaque em no máximo ~1 a cada 10 palavras**; uma cor de destaque principal (amarelo/dourado), opcional uma segunda.
- **Fora das faixas que a interface cobre:** nada nos ~15% de cima, nos ~25% de baixo, nem colado na direita (botões).
- Entrada da palavra: **pop sutil de 3–8%** (~160 ms), sem bounce exagerado; o mesmo movimento o corte todo.
- **Revisar a legenda automática** (nomes, livros, capítulo e versículo).
- *No Studio:* estilos "Palavra por palavra"; a IA escolhe só os de uma palavra por vez; quique 88%→106%→100%;
  legenda no 9:16 a 28% da borda de baixo; palavras-chave limitadas a ~10%; contorno + sombra automáticos em fundo claro.

## 3. Tipografia
- **Sans pesada como base**; serifa/itálico/caligrafia **só como acento de 1–2 palavras**. Caligrafia nunca na legenda corrida.
- **Até 2 famílias por corte**, cada uma com uma função. Contrastar a classificação (sans × serifa) **ou** o peso — não
  as duas pela metade.
- **Hierarquia:** a palavra de impacto **2–3× maior** que a legenda (abaixo de 1,5× parece erro). Um elemento lido primeiro.
- Caixa alta só em blocos curtos e com tracking aberto; nunca parágrafo em maiúsculas.
- **Nunca encolher o texto para caber: reescrever ou quebrar.** Nenhum texto passa da tela.
- Pares que funcionam: Inter Black + Instrument Serif Italic (editorial premium) · Montserrat Black + Playfair Italic ·
  Anton/Bebas + Inter · League Spartan Black + Bodoni Moda Italic · Fraunces sozinha (devocional).
- *No Studio:* 40 fontes; estilos Editorial/Clássico/Cartaz com palavra-chave em segunda fonte; larguras reais das
  letras (metrics.json) garantem que nada sai da tela; frases de impacto com a palavra grande ocupando a largura.

## 4. Cor
- **Uma cor de destaque** (≈10% da tela), neutros no resto (60-30-10). 2–3 cores, no máximo.
- Em vez do amarelo-limão genérico, um **dourado da marca** (`#F2C14E`, `#FFD23F`).
- **Cartela:** nada de preto puro — preto quente `#1A1714`, café, vinho, azul-noite; texto creme `#F5EFE6`; **grão 1–5%**
  e vinheta (evita banding na recompressão).
- **Nunca:** laranja/amarelo sobre fundo claro sem contorno, branco sobre dourado, neon em fundo claro, 3+ cores vivas.
- Pele do pregador natural (nem vermelha, nem amarela); looks sutis.
- *No Studio:* paletas curadas na IA; cartela com vinheta e grão; o brilho deixou de puxar para o rosa.

## 5. Movimento, zoom, imagens de apoio
- **Corte seco por padrão**; transição só quando muda tempo, lugar ou assunto.
- **Zoom de ênfase: 5–10%, 2–3 por minuto no máximo**, em palavra-chave/virada. Zoom a cada frase = edição mecânica.
  (A equipe não quer zoom automático periódico.)
- **Imagens de apoio: menos do que parece.** 10–25% do corte, **1–3 s cada**, ilustrando **literalmente** a palavra dita,
  entrando nas pausas, **nunca nos 3 primeiros segundos nem sobre a frase de impacto/clímax**. Sem imagem boa, nenhuma.
- Animação de texto: 100–500 ms; **saída mais curta que a entrada**; ease-out na entrada; mesmas direções o vídeo todo.
- *No Studio:* sem gancho fixo e sem mini zooms automáticos; zoom de ênfase 8%; até 3 imagens, 1–3 s, a partir dos 3 s,
  conferidas pelo Claude vendo as miniaturas; cartão arredondado sobre fundo desfocado.

## 6. Som
- **Áudio limpo vale mais que imagem bonita**: direto da mesa, nunca o mic da câmera.
- **Música instrumental 18–24 dB abaixo da voz**, sem letra, sem louvor gravado (bloqueio de direitos); se a sala tem
  muita reverberação, talvez sem música.
- Ducking: release longo (200–700 ms) para não "bombear".
- **Efeitos sonoros: 1–3 num corte de 30–60 s**, cada um ligado a algo visível; nunca whoosh em todo corte.
- Volume final de referência: −14 LUFS, pico −1 dBTP.
- *No Studio:* música padrão a 0,12 (~−18 dB) com ducking; no máximo 3 efeitos automáticos, com 2 s entre eles.

## 7. Publicação e marketing
- O que as plataformas recompensam: **tempo assistido, envios por DM, curtidas por alcance** (Instagram);
  **"escolheram assistir" ≥ 70%** (Shorts); **originalidade** (exportar sem marca d'água de outro app).
- **Texto do post:** palavra-chave do tema no título/fala/legenda; a descrição continua a ideia ou faz uma pergunta real;
  **"envie para alguém que precisa ouvir isso"**; convite para o culto no máximo 1 a cada 4–5 posts.
- **Hashtags: 0–3 específicas** (o Instagram limita a 5; ajudam a busca, não o alcance; nada de #reels/#explore).
- Capa: rosto expressivo + 3–5 palavras, mesmo template na série.
- **Frequência:** 2–4 cortes por semana com constância > muitos de uma vez. Se um estourar, poste um relacionado em 1–2 dias.
- Testar ganchos com **Trial Reels**; olhar retenção aos 3 s, gráfico de retenção e envios toda semana.
- **Ética:** aprovação do pregador nos trechos sensíveis; não cortar oração íntima, avisos, piadas internas.
- *No Studio:* o texto de publicação gerado pela IA segue essas regras (2–4 hashtags específicas, sem genéricas, no máx. 5).

## Divergências e escolhas da equipe
- **Título-gancho no topo:** todo o mercado recomenda (5–8 palavras nos 3 primeiros segundos). A equipe preferiu não usar —
  fica como opção à mão (gaveta Texto) se quiser testar num Trial Reel.
- **Zoom periódico (estilo Hormozi):** serve para conteúdo didático de alta energia; em pregação soa agressivo. Fora.
- **Duração:** fontes vão de 15 s a 3 min; o consenso é que a retenção manda — 30–60 s como padrão.
- **Legenda no centro x embaixo:** a Opus defende ~60% da altura; outros, o "meio-baixo". O Studio usa o meio-baixo
  (28% da borda), acima da interface.

## Arquivos
- [01 — O ofício do editor](01-oficio-do-editor.md)
- [02 — Tipografia](02-tipografia.md)
- [03 — Cores](03-cores.md)
- [04 — Marketing](04-marketing.md)
- [05 — Mercado de cortes no Brasil](05-mercado-de-cortes-br.md)
- [06 — Animação e som](06-animacao-e-som.md)
