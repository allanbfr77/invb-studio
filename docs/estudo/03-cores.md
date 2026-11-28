# Cores para cortes verticais de pregação

Legenda: **[C]** consenso (3+ fontes independentes) · **[F]** fonte única / fornecedor · **[Calc]** contraste WCAG calculado.

## 1. Texto sobre vídeo em movimento
- WCAG: 4,5:1 texto comum, 3:1 texto grande [C]. Legenda de Reels é "grande", mas o vídeo é comprimido e visto no sol: **meta da equipe ≥ 7:1**.
- **Medir no pior quadro, não na média** [C]: o ponto mais claro na área do texto; conferir o arquivo exportado no tamanho do celular.
- Proteção, da mais forte para a mais fraca [C]:
  1. **Caixa/pílula** (preto 50–70% de opacidade). Ex.: branco sobre cinza médio vai de 3,35:1 para 11,71:1 com superfície preta a 60%.
  2. **Contorno** 2–4 px em cor contrastante, com fonte de peso ≥ 700. (Contorno em toda legenda polui — Kapwing.)
  3. **Sombra** sozinha é a mais fraca (falha em fundo claro, fonte fina e depois da compressão). Só reforço.
- **Scrim/gradiente/vinheta** [C]: camada preta em gradiente atrás do texto, 0% no rosto, subindo até a borda do texto (15–25% do quadro). A vinheta ainda segura o olhar no pregador.
- **Escala** [F]: título de 60 px visto a 1/3 vira ~20 px e o contorno afina junto — preferir fundo mais opaco ou letra mais grossa.

## 2. Palavra destacada na legenda
- Padrão que funciona [C]: base branca `#FFFFFF`, contorno preto, **uma cor de destaque** nas palavras-chave.
- **Amarelo** é a cor saturada mais clara: `#FFD400` sobre preto = 14,7:1 [Calc]; sobre branco ≈ 1,07:1 → só com contorno ou fundo escuro.
- Verde neon `#02FB23` = marca do nicho fitness, em queda. Vermelho `#FF3B30` sobre preto = 5,25:1 → palavra solta, nunca base [F].
- **O visual Hormozi completo está saturado** [F]: a mecânica vale, o visual genérico não diferencia → trocar o amarelo-limão por um **dourado claro da marca** (`#F2C14E` / `#FFE14D`).
- Evitar: 3+ cores vivas na mesma linha, fonte fina, pastel/tons médios como base, texto escuro sobre vídeo escuro.

## 3. Paleta
- **60-30-10** [C]: 60% dominante (fundo/neutro), 30% secundária, 10% destaque. Referência, não fórmula.
- **2–3 cores** (máx. 4–5 com neutros) [C]; variar com tons claros/escuros da mesma cor, não com matizes novas.
- Harmonias [C]: monocromática (mais segura), análoga (1 base + 2 apoio), complementar (uma só como destaque).
- Cores fortes só no destaque, cercadas de neutros; paletas mais suaves parecem mais premium. Cor da moda só como secundária.

## 4. Psicologia da cor em conteúdo de fé
- [C, cultural] azul = paz/confiança; vermelho = paixão/urgência; amarelo = esperança/energia; verde = renovação; roxo = espiritualidade.
- **Dourado** = divino/luz; para não ficar brega, **dourados profundos e dessaturados** (`#D4AF37`, `#C9A227`, `#9B6A21`) com marinho, verde profundo, vinho, preto, creme ou café `#3E2723`.
- Acolhimento/graça → quente (âmbar, creme). Confronto/arrependimento → profundos (vinho, marinho, preto). *(extrapolação)*

## 5. Consistência numa série
- Kit de marca (2–3 cores, fontes, logo) + templates fixos de legenda, cartela e abertura/encerramento [C].
- **Sugestão:** neutros e cor da legenda fixos da igreja + **1 cor de destaque por série**.

## 6. Cartelas (tela cheia)
- **Evitar preto puro e branco puro** [C] (halação, rastro em OLED): usar `#121212`, `#1A1714` (preto quente), marinho `#0F2236`, com texto off-white `#F5EFE6`.
- Gradientes com matizes vizinhas; **sempre grão/ruído 1–5%** (até 8% em gradiente suave) contra banding na recompressão [C]. Grão só no fundo.
- Vinheta leve e textura de papel/filme dão profundidade sem competir com o texto.

## 7. Cor do pregador e das imagens de apoio
- Ordem [C]: exposição → balanço de branco → saturação → look.
- **Pele na linha do vectorscope** (≈ 10h30–11h); vermelha demais = "afogueado", amarela/dessaturada = "doente"; tirar magenta pondo verde.
- Teal-orange [C]: teal nos fundos/sombras, laranja longe do rosto; sutil. Preservar calor em peles escuras.
- Filme quente: calor sobretudo nas altas luzes; LUT sozinho não faz o look; grão vale mais que LUT pesado.
- Imagens de apoio: igualar exposição e temperatura ao plano do pregador.

## 8. Paletas (contraste conferido)
1. **Graça (quente):** fundo `#1A1714` · texto `#F5EFE6` (15,6:1) · destaque `#E6B84C`/`#D4AF37` · apoio `#3E2723`.
2. **Majestade (frio + ouro):** fundo `#0F2236` · texto `#F5EFE6` (14,1:1) · destaque `#C9A227` · apoio `#1B1A2E`.
3. **Sangue/Cruz:** fundo `#121212` · texto `#FFFFFF` · faixa `#7A1E2C` com branco (10,3:1) · destaque `#FFE14D`. *(Vermelho `#B23A2E` como texto sobre preto = 3,2:1 — não usar.)*
4. **Legenda universal:** `#FFFFFF` + contorno `#000000` 3 px + destaque `#FFD400` ou dourado da marca.

## FAÇA / NÃO FAÇA
**FAÇA:** base branca com contorno/caixa · uma cor de destaque · testar no pior quadro e no celular · gradiente/vinheta atrás do texto · fundos quase-pretos quentes ou marinho · grão em gradiente · pele na linha do vectorscope · paleta fixa por série.

**NÃO FAÇA:** laranja sobre fundo claro (`#FF8C00` sobre branco = 2,3:1) · branco sobre dourado (2,1:1) ou cinza médio (3,5:1) · neon em fundo claro · vermelho com azul saturado lado a lado · 3+ cores vivas · saturação no máximo · sombra como única proteção · teal-orange pesado no rosto · LUT sem ajuste · gradiente sem grão.

## Fontes
blitzcutai.com (best-caption-colors-tiktok; caption-background-vs-outline-vs-shadow) · kapwing.com (social-media-captions-styles; brand-kit) · open-design.ai/blog/text-over-moving-backgrounds · smashingmagazine.com (accessible text over images) · fstoppers.com · designshack.net · lottiefiles.com (color theory for motion design) · adobe.com (common color theory mistakes; orange-teal grading; correct skin tones) · blog.frame.io (skin tones in Resolve) · beverlyboy.com · premiumbeat.com · provideocoalition.com (banding) · mixinglight.com · uxmovement.com (pure black) · get.tithe.ly · ministrypass.com · churchtrac.com · sharefaith.com · designyourway.net (gold palettes)

*Não há fonte específica sobre cortes de pregação de igrejas brasileiras; a psicologia aplicada a esse público é extrapolação.*
