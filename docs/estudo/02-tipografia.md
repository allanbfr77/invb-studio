# Tipografia para cortes verticais (9:16, PT-BR)

Legenda: **[C]** consenso (3+ fontes) · **[F1]** fonte única ou números divergentes · **[INF]** inferência.
Quase todos os números em px para 1080×1920 vêm de blogs de ferramentas (Opus, Blitzcut, Submagic). As plataformas não publicam área segura oficial; os padrões formais são Netflix, EBU R95 e WCAG.

## 1. Área segura (1080×1920)
- TikTok (Ignite): topo 108 px, base 320 px, esquerda 60, direita 120 → ~900×1492 livres. Reels (Ignite): 220 px livres no topo, 420 na base. Shorts: sem spec (base 300–672 px).
- Regra cruzada (Reap): topo ~15%, laterais 10–15%, base 25–35%. Blitzcut: caixa central ~900×1400.
- **Caixa segura prática [INF]: x 120–920, y 290–1440.** Os botões ficam à **direita**: frase de impacto um pouco à esquerda do centro óptico.
- **Legenda:** Opus defende o centro, ~60% da altura (terço inferior rende 10–15% menos [F1]); outros, o "meio-baixo" acima da interface. **Nunca cobrir boca e olhos** [C].
- 16:9 (EBU R95): margem de 5% por lado para títulos. 1:1: mínimo 5% e checar o corte para 4:5.

## 2. Tamanhos e hierarquia
- Legenda: mínimo legível 48–55 px; padrão talking head **60–75 px**; alta energia 75–95 px; teto 100 px (bloco até 20% da altura).
- Palavra por palavra: 1–3 palavras a 70–90 px; frase curta: 3–7 palavras a 60–75 px.
- Netflix PT-BR: 42 caracteres/linha, 2 linhas, 17 caracteres/s, 5/6 s a 7 s; forma de pirâmide (linha de baixo mais longa).
- **Palavra de impacto 2–3× a legenda [INF]** (ex.: legenda 64 px → palavra 150–190 px; frase isolada 120–200 px). **Abaixo de ~1,5× parece erro, não hierarquia.**
- Hierarquia (School of Motion) [C]: UM elemento para ser lido primeiro; teste de apertar os olhos; contrastar por escala OU peso OU cor OU posição OU movimento, não tudo junto.

## 3. Legibilidade no celular
- **Peso 700–900** [C]. Pesos finos e serifas de alto contraste somem com a compressão.
- Contraste ≥ 4,5:1, ideal 7:1.
- **Caixa alta só para blocos curtos** (1–3 palavras) e sempre com **espaçamento extra de 5–12%** (Butterick) [C]; legenda corrida em caixa baixa/sentence case.
- Tracking mais aberto em caixa alta curta; mais fechado em palavras display grandes. Nunca o padrão do programa.
- Entrelinha display 0,9–1,0 [INF]; em PT-BR, abaixo de 0,9 os acentos maiúsculos (Ã, É, Ç) colidem.
- Itálico (Netflix PT-BR): voz em off, títulos, estrangeirismos. Em pregação [INF]: citação bíblica ou voz de Deus/personagem.
- Quebra de linha (Netflix) [C]: não separar artigo/substantivo, sujeito/verbo, verbo/auxiliar, nome/sobrenome; quebrar depois de pontuação ou antes de conjunção/preposição; sem palavra órfã.

## 4. Contorno, sombra, caixa
- Três soluções aceitas [C]: contorno preto grosso em texto branco; caixa/pílula (preta ou ~55–80%); sombra suave em estilos calmos.
- Kapwing: contorno colorido só em título/abertura, não em toda legenda; nada de caixas cobrindo boa parte do vídeo.

## 5. Fonte por clima
- **Sans é o padrão seguro** [C]; **serifa grande e com parcimônia — "serifas sofisticadas só em ganchos de 1–2 palavras"**.
- Geométrica: Montserrat, Inter · amigável: Poppins · condensada de impacto: Bebas Neue, Oswald, Anton (cabe mais palavra no 9:16) · editorial: Playfair Display, Instrument Serif, Fraunces, Bodoni Moda · **caligrafia: nunca na legenda, só acento pontual** [C].
- Proibido: fontes novidade/decorativas, Comic Sans.

## 6. Pares
- **1–2 fontes, nunca mais de 3** [C]. Comece com UMA família (os pesos dão alcance); a segunda só para resolver um contraste claro.
- Contrastar a classificação (sans × serifa) **ou** o peso (Black × Regular Italic) — não as duas pela metade (Google Fonts). Cada fonte com uma função.
- Pares gratuitos para pregação:
  1. Montserrat Black + Playfair Display Italic (clássico, versículos)
  2. Poppins ExtraBold + Playfair Display Italic
  3. **Inter Black + Instrument Serif Italic** (o look editorial 2025–26, sóbrio e premium)
  4. Anton/Bebas Neue (impacto) + Inter Medium (legenda) — energia de culto/avivamento
  5. League Spartan Black + Bodoni Moda Italic (dramático, cartelas)
  6. Archivo Black (gancho) + Instrument Serif (citações)
  7. Só Fraunces (itálico expressivo) — tom contemplativo e devocional

## 7. Layouts cinéticos
- Palavra-chave: ampliar, mudar a cor **ou** trocar de família [C]; marcar as palavras-chave no roteiro antes de animar.
- Padrões: palavra falada amarela com contorno preto; palavra-chave numa pílula levemente inclinada; "Split Stage" (sans bold + palavra-chave em Playfair Italic); uma palavra gigante por vez; karaokê; marca-texto.
- Animar com parcimônia; se o texto não se lê no primeiro segundo, troque. Fade ~0,3 s.

## 8. Tendência 2025–26: "editorial premium"
- Volta das serifas e do itálico como ênfase.
- Na legenda: serifa itálica na palavra de acento; 1ª linha redonda e 2ª itálica; "magazine": caixa alta numa faixa preta com a palavra-chave em itálico.
- O que faz parecer premium [F1]: sentence case; serifa + sans discreta; quase-preto sobre creme e **UM** acento de cor; pouco movimento, ease-out suave, **sem mola, sem tremor, sem inclinação**, cortes secos; rótulos em sans pequena, caixa alta, tracking aberto, 55% de opacidade.
- É padrão observado, não estatística.

## FAÇA / NÃO FAÇA
**FAÇA:** peso 700–900, legenda 60–75 px · impacto 2–3× a legenda · contorno/caixa/sombra sempre, ≥ 4,5:1 · até 2 famílias com papéis fixos · caixa segura ~900×1400, nada à direita perto dos botões · quebrar a linha pelo sentido · mesmo estilo na série · testar no celular com a interface por cima.

**NÃO FAÇA:** pesos Light/Thin sobre vídeo · serifa fina ou caligrafia em legenda corrida · parágrafo em caixa alta ou caixa alta sem tracking · mais de 3 fontes ou duas sans parecidas · texto no topo, base ou direita (interface cobre) · letra abaixo de 48 px · efeito diferente em cada palavra · cobrir o rosto · **encolher o texto para caber: reescreva ou quebre** · contorno colorido em toda legenda · palavra órfã · kerning/tracking/entrelinha padrão sem ajuste.

## Fontes
ignitesocialmedia.com (safe zones) · reap.video (safe zones) · blitzcutai.com (caption size 2026) · opus.pro (caption design placement) · submagic.co (Hormozi captions) · kapwing.com (caption styles) · partnerhelp.netflixstudios.com (Brazilian Portuguese timed text; general requirements) · practicaltypography.com (all caps, letterspacing, line length) · schoolofmotion.com (tiny typography decisions; fonts for motion) · adobe.com (13 rules bad font choices) · madegooddesigns.com (best fonts for reels) · versely.studio (caption styles) · github hsingh-aai/video-edit-fonts-styles. Só por resumo de busca: Google Fonts Knowledge, Creative Boom, TypeType, Pangram Pangram, EBU R95, BBC, fluxnote, VidPros, Filmora, FlexClip, Vyond, Wyzowl.
