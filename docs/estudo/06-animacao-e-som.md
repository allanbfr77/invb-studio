# Animação de texto e som

Legenda: **[C]** consenso (3+ fontes) · **[F]** fonte única/fornecedor · **[I]** inferência.

## 1. Animação de texto

### Durações
- **Faixa útil 100–500 ms** [C: NN/g, Val Head, Material]. Perto de 500 ms "arrasta"; erra-se mais por longo que por curto. Abaixo de ~200 ms pode nem ser percebido.
- Material (mobile): entrada 225 ms, saída 195 ms, padrão ~300 ms; > 400 ms parece lento.
- **Saída mais curta que a entrada** [C] (ex.: entra 300 ms, sai 200–250 ms).
- **O que aparece toda hora (cada palavra da legenda) deve ser mais curto e sutil** [F: NN/g].
- Valores para código (30 fps) [I]: pop de palavra 100–160 ms; entrada de cartela/título 250–350 ms; saída 150–250 ms; fade de legenda 100–200 ms.

### Curvas (cubic-bezier)
- Material: standard (0.4,0,0.2,1) · entrada (0,0,0.2,1) · saída (0.4,0,1,1). Material 3 entrada enfática (0.05,0.7,0.1,1), saída (0.3,0,0.8,0.15).
- **Entrada com ease-out, saída com ease-in** [C]; sem easing é o "sinal nº 1 de iniciante".
- Overshoot (easeOutBack ~10%): (0.34,1.56,0.64,1) [I]. Spring da Apple: bounce 0 = suave (padrão), 0,15 = vivo, 0,3 = bounce visível, > 0,4 = exagerado.

### Legenda palavra por palavra
- Template oficial do Remotion (Popping Word Captions) [F]: escala da palavra ativa **1,00 → 1,03** (só 3%), mola sem bounce, entrada em ≤ 4 quadros, origem embaixo no centro; fonte 80 px peso 700, contorno = tamanho/7; páginas de palavras a cada 800 ms.
- Estilo Hormozi [C, fornecedores]: bold maiúsculo, palavra ativa amarela/verde, contorno preto. Os "110–115%" virais não estão documentados.
- **Para pregação [I]: pop de 3–8% com mola sem bounce (ou bounce ≤ 0,15).**
- Quebra a cada 3–7 palavras em fala de conversa [F].

### Sincronia
- Broadcast (BBC): entra no início da fala, tolerância 2–3 quadros, sem antecipar. Opus: antecipar 0,5–1 s. Fontes divergem.
- Recomendação [I]: destaque da palavra 0–80 ms antes do início dela; bloco de texto ~100–200 ms antes da 1ª palavra; sai ~300 ms depois da fala.

### Stagger (palavras entrando em sequência)
- Bibliotecas: 40–100 ms por palavra. **Para mensagem séria, animar por palavra/linha, não por letra** [C]. Sugestão: 50–80 ms entre palavras.

### Tempo de leitura
- Netflix: 17–20 caracteres/s, 42 por linha, máx. 2 linhas, mín. 5/6 s, máx. 7 s. BBC: 160–180 palavras/min (~0,3 s por palavra).
- **Fórmula [C+I]: duração = máx(0,83 s; caracteres/17 + tempo da animação), teto 6–7 s.** Versículo: 15 caracteres/s e tempo para ler duas vezes.

### Transições e hierarquia
- Direções consistentes: entrou por baixo, sai por cima — no vídeo inteiro [C].
- Hierarquia por **uma** variável (tamanho OU peso OU cor) [F: School of Motion].

### Cara de amador [C]
Usar todos os efeitos; bounce em todo texto; transição diferente em cada cartela; tudo animado ao mesmo tempo; texto que some antes de ser lido; sem easing; mais de 2 fontes; cinco pesos e três cores no mesmo quadro.

## 2. Som

### Volume final
- YouTube ~−14 LUFS integrado, −1 dBTP (só abaixa) [C]. TikTok/Instagram/Facebook sem alvo oficial; −14 LUFS é o padrão sensato [C].
- **Entrega: −14 LUFS, pico −1 dBTP, LRA ≤ 11** → `loudnorm=I=-14:TP=-1:LRA=11` (duas passadas).
- Fala soa mais alta que música no mesmo LUFS (AES TD1008).

### Música x voz
- **Música 18–24 dB abaixo da voz** [C]. Emocional com música esparsa: 15–20 dB; conteúdo denso: 22–30 dB.
- Para pregação [I]: voz ~−16 LUFS, cama 18–20 LU abaixo; sem fala, a música pode subir.

### Ducking
- Melhor: a cama já no volume certo + 3–6 dB a mais de redução durante a fala [F: OverseerOS]. (Premiere sugere −18 dB; −6 a −12 = dip suave.)
- Attack 10–20 ms; **release 200–700 ms** (mais longo evita "bombear" nas pausas); ratio 2:1–4:1. Ex.: `sidechaincompress=threshold=0.05:ratio=4:attack=15:release=500`.
- Muitas pausas: automação de volume é melhor que ducking [F: Sound On Sound].

### Escolha da música
- **Sem letra sob a fala**; sem melodia brilhante, caixa agressiva, prato constante [C]. Pads e piano contido, bem baixos.
- **Áudio com muita reverb da igreja: talvez sem música** (não embolar).
- BPM lento em momento emocional; cortar em frases musicais, não em batidas. Opcional: tirar 1–4 kHz da música (onde a voz é inteligível).

### Efeitos sonoros
- Whoosh: movimento rápido (corte, swipe, zoom), duração ≈ duração do movimento. Dissolve lento pede swell/riser, não whoosh.
- Hit tonal no tom da música para revelação. **Riser e hit só nos momentos-chave** [C].
- **"A maioria dos cortes deve ser silenciosa"**; na revisão, apague metade dos efeitos (Sonilo). Para pregação [I]: **1–3 efeitos num corte de 30–60 s**.
- Abaixar a música 3–6 dB sob o efeito. Erros: repetir o mesmo whoosh (cara de template); empilhar impacto+whoosh+brilho+grave; "se o som é notado antes da imagem, está alto demais".

### Voz de pregação gravada na igreja (ordem)
1. Passa-alta 80–100 Hz · 2. redução de ruído leve (−12 dB costuma bastar) · 3. de-reverb leve se precisar · 4. EQ: cortar 200–500 Hz (250 Hz, Q ~0,7), presença 2–5 kHz até +2–3 dB · 5. compressor 2:1–4:1 · 6. de-esser 5–8 kHz (3–6 dB) · 7. limitador · 8. loudnorm.
- ffmpeg [I]: `highpass=f=90,afftdn=nr=10,equalizer=f=300:t=q:w=1:g=-3,equalizer=f=3500:t=q:w=1:g=2,acompressor=ratio=3:attack=5:release=100,deesser,alimiter,loudnorm`

## FAÇA / NÃO FAÇA
**FAÇA:** um só sistema de movimento (2–3 curvas, mesmas direções) · saída mais curta que a entrada · pop sutil 3–8% · duração do texto por caracteres/s · música instrumental 18–24 dB abaixo da voz · −14 LUFS / −1 dBTP.

**NÃO FAÇA:** animação > 500 ms · bounce > 0,4 · efeito aleatório por palavra · música com letra sob a fala · whoosh em todo corte · redução de ruído agressiva (som "aquático").

## Fontes
m1.material.io (duration-easing) · nngroup.com (animation-duration) · valhead.com · learn.microsoft.com (timing-and-easing) · developer.apple.com WWDC23 10158 · remotion.dev (popping-word-captions) · partnerhelp.netflixstudios.com (English timed text) · opus.pro (captions readability) · schoolofmotion.com (tiny typography decisions) · Derek Lieu (25 tricks motion graphics) · forasoft.com (LUFS targets 2026) · soundonsound.com (duck tales) · overseeros.com (music under voiceover) · sonilo.com (transition sound) · prosoundweb.com (church sermon podcasts). Só por trechos de busca: vindral, izotope, reachright, avid, resumos BBC/Netflix, tutsplus.
