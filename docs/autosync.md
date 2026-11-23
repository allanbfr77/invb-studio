# AutoSync: sincronia automática entre fala e boca

Mede o atraso **fixo** entre o som e o movimento da boca de quem fala e corrige deslocando o som. Não gera boca,
não mexe no rosto e não dubla: só acha o deslocamento no tempo.

## Como funciona

1. `worker/autosync.py` escolhe até 10 janelas de 8 s espalhadas pelo trecho (num corte curto, duas metades).
2. Em cada janela, o detector de rosto **YuNet** (OpenCV) acha e acompanha os rostos, quadro a quadro, a 25 fps.
3. O **SyncNet** (Chung e Zisserman, 2016) compara cada grupo de 5 quadros da boca com 0,2 s de som, em todos os
   deslocamentos de −2000 a +2000 ms, de 40 em 40 ms, com refinamento abaixo de 1 quadro. O deslocamento com a menor
   distância é o atraso da janela; a confiança é a do próprio SyncNet (distância mediana menos a mínima).
4. `lib/autosync.js` decide com as janelas medidas (função `decide`, sem modelo, testável):
   - janela só conta com confiança ≥ 3,5 (≥ 5 quando o trecho tem uma janela só) e sem o mínimo na borda da busca;
   - é preciso que pelo menos 2 janelas, e 60% das aceitas, concordem a até 60 ms da mediana;
   - até 45 ms é **sincronizado**; acima disso, **corrigir**;
   - janelas aceitas que discordam com tendência no tempo, ou em dois grupos, viram **variável** (não corrige); com 4
     janelas ou mais, uma tendência muito clara (correlação ≥ 0,9) acima de 80 ms já basta (deriva lenta);
   - sem janela aceita: **sem rosto**, **sem fala** ou **inconclusivo**, conforme o motivo predominante.
5. A correção (`applyShift`) usa `ffmpeg -itsoffset` com `-c copy`: imagem e som não são recodificados, o original
   nunca é sobrescrito (grava em temporário e renomeia; recusa saída igual à entrada).

Convenção: `offsetMs > 0` = som atrasado (a boca mexe antes do som). `shiftSec = −offsetMs/1000`, no mesmo formato do
ajuste "Sincronia do áudio" do editor (positivo atrasa o som).

## No aplicativo

- **Pregação inteira:** em **Cortes**, botão **🔊 Sincronia** → **✨ Detectar no vídeo inteiro** → **Salvar**. O ajuste
  fica salvo na pregação (`meta.audioShift`) e vale para todos os cortes, inclusive os já criados; cortes já exportados
  voltam a "novo" para sair de novo com o som no lugar. Também dá para digitar o ajuste à mão (até ±5 s). O vídeo
  original não é alterado.
- Editor do corte → **Sincronia do áudio** → **✨ Detectar automaticamente**. Mede o trecho do corte; quando a medida
   é segura, põe no controle o que falta além da sincronia da pregação (a exportação soma os dois) e sugere conferir
  com **Testar**. Nos outros
  casos explica o motivo e não mexe em nada.
- API: `POST /api/uploads/:id/sync` com `{ audioShift }` grava a sincronia da pregação. `POST /api/uploads/:id/autosync` com `{ start, end, apply }`. Devolve `status`, `offsetMs`, `shiftSec`,
  `needsCorrection`, `message`, `evidence` (janelas medidas, aceitas, que concordam, confiança mediana, mais de um
  rosto) e `windows` (medida de cada janela). Com `apply: true` e correção necessária, grava `sincronizado.mp4` ao
  lado do original e devolve `file` (`GET /api/uploads/:id/autosync/file`). Uma análise por vez.
- Linha de comando: `node lib/autosync.js video.mp4 [--start S] [--end E] [--apply]` (grava `video.sincronizado.mp4`).

## Instalação

`install/instalar-autosync.bat` (Windows) ou `install/instalar-autosync.command` (Mac), uma vez por computador:

- pasta `.venv-sync` com `torch` (CPU), `opencv-python-headless`, `scipy`, `numpy` e `python_speech_features==0.6`
  (cerca de 1 GB no Windows);
- `models/autosync/` com `syncnet_v2.model` (52 MB) e `face_detection_yunet_2023mar.onnx` (230 kB). O download confere
  a assinatura SHA-256 de cada arquivo, e o worker confere de novo antes de carregar. Os pesos do SyncNet são lidos
  com `torch.load(weights_only=True)`, que não executa código do arquivo.

Independe da transcrição (Whisper) e da remoção de música (Demucs). Sem a instalação, o botão não aparece e a rota
responde 501 com a instrução.

Origem e licenças: arquitetura do SyncNet copiada de `joonson/syncnet_python` (MIT, aviso em
`worker/syncnet_model.py`); pesos publicados pelos autores (Oxford VGG), baixados da cópia idêntica no Hugging Face
(`ByteDance/LatentSync`) com o endereço de Oxford como reserva; YuNet do OpenCV Zoo (MIT).

## Alternativas avaliadas

| Opção | Por que não (na 1ª versão) |
|---|---|
| Correlação de volume do som × abertura da boca | Sem comprovação de precisão; sensível a microfone na frente da boca, música e pausas. |
| Pipeline original do SyncNet (S3FD + PySceneDetect) | Mesmo modelo, mas detector de rosto mais pesado e mais dependências; o YuNet faz o papel com 230 kB. |
| SyncNet do Wav2Lip (`lipsync_expert.pth`) | Licença não comercial. |
| SyncNet do LatentSync (`stable_syncnet`) | Treinado para o próprio gerador de boca do LatentSync; mais pesado, sem vantagem comprovada para atraso fixo em vídeo real. |
| Synchformer / SparseSync | Classifica deslocamentos em passos de 200 ms em ±2 s: grosso demais. |
| Serviço externo | Fora do escopo: envio de vídeo e custo por uso. |

## Testes

- `test/autosync.test.js` (no `npm test`): decisão (atrasado, adiantado, sincronizado, baixa confiança, discordância,
  variável em degrau e em deriva, sem rosto, sem fala, atraso acima do máximo, vários rostos, trecho curto); correção
  com mídia sintética (clarão + bipe) em +300, −300, +40 e −520 ms, com precisão de amostra, mesmos codecs e original
  intacto; recusa de sobrescrever; falha do ffmpeg sem deixar arquivo pela metade; worker real com vídeo sem rosto e
  sem som. Com `AUTOSYNC_BENCH_VIDEO=<vídeo>` roda também detecção e correção de ponta a ponta num vídeo real.
- `test/server.test.js`: rota sem instalação (501), só áudio, trecho curto, e análise real sem rosto sem alterar o
  original.
- `scripts/autosync-bench.js`: avaliação de precisão com vídeos reais (resultado abaixo).

## Precisão medida

Medido em 23/11/2026 neste computador (CPU, sem placa de vídeo), com `scripts/autosync-bench.js`, em 6 trechos de 60 s
de duas pregações reais (plano médio e plano aberto, microfone de mão e de lapela). Cada trecho foi reencodado, medido
(referência) e depois deslocado com atrasos conhecidos por cópia direta; o esperado é a referência + o atraso.

| Teste | Resultado |
|---|---|
| Atrasos de −500 a +500 ms (48 casos, busca de ±1 s) | 48 de 48 medidos; erro médio 1,9 ms, máximo 8 ms; 44 de 44 que pediam correção foram para "corrigir", os 4 restantes (≤ 45 ms) ficaram "sincronizado" |
| Atrasos de ±900 e ±1600 ms (12 casos, busca de ±2 s, a usada no app) | 12 de 12; erro médio 2,9 ms, máximo 10 ms |
| Ponta a ponta (estraga ±250 ms, detecta, corrige, mede de novo) | 12 de 12 voltaram a "sincronizado", com sobra de −8 a +2 ms |
| Controles negativos (imagem de um trecho com som de outro), 9 casos | 0 correções; maior confiança 2,5 (o limite é 3,5); todos "inconclusivo" |
| Atraso variável: degrau de +300 ms no meio, e deriva contínua (atempo 0,997), 12 casos | 12 de 12 "variável" depois do ajuste da regra de deriva (antes, 1 deriva lenta virava "corrigir") |
| Exemplo oficial do SyncNet (`example.avi`) | 3 quadros e confiança 10,2–10,4; os autores publicam 3 e 10,0 |
| Tempo por análise | 25 a 45 s (6 a 7 janelas de 8 s) |

As duas pregações originais já vinham com o som atrasado de forma constante: 165–196 ms numa e 103–143 ms na outra.
Não há referência externa para esse valor absoluto; a precisão acima é relativa (deslocamentos conhecidos).

O que ainda depende de uso real: outros palcos, câmeras e enquadramentos (os limites foram calibrados nestes dois
vídeos), instalação limpa no Windows e no Mac, e vídeos com atraso acima de 2 s.

## Limitações

- Atraso fixo apenas. Atraso que muda ao longo do vídeo é reconhecido (status `variavel`) e não é corrigido.
- Faixa de ±2000 ms. Fora disso o mínimo cai na borda e a análise diz que o atraso passa do que ela mede.
- Num corte que começa no segundo 0 da pregação, um ajuste positivo não tem som anterior para usar (limitação que já
  existia no ajuste manual).
- Precisa de rosto de frente, com pelo menos ~40 px de altura em 720p, falando. Microfone de mão na frente da boca,
  rosto de perfil, plateia ou só música levam a "inconclusivo" ou "sem rosto" (é o comportamento esperado: não corrige).
- O SyncNet trabalha a 25 fps; o refinamento entre quadros foi medido nos vídeos de teste, mas não em todo tipo de
  material.
- Os limites de confiança foram calibrados com duas pregações do mesmo palco (mesma iluminação e enquadramento).
  Outros ambientes podem pedir recalibração com `scripts/autosync-bench.js`.
- Leva de 25 a 45 s por análise num processador comum (sem placa de vídeo). O vídeo inteiro usa até 10 janelas, então leva o mesmo tempo.
- O instalador do Windows foi executado neste computador (reaproveitando a pasta existente); o do Mac não foi
  executado em um Mac real.
