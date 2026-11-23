#!/bin/bash
# INVB Studio: instala a sincronia automática (AutoSync) neste Mac. Rode uma vez, com dois cliques.
# Cria a pasta .venv-sync com as bibliotecas (cerca de 1 GB) e baixa dois modelos pequenos (cerca de 55 MB):
# o SyncNet, que compara a boca com o som, e um detector de rosto. Tudo roda no seu computador; nada é enviado para fora.
cd "$(dirname "$0")/.." || exit 1

parar() { echo; echo "$1"; echo; read -r -p "Aperte Enter para fechar." _; exit 1; }

echo "== INVB Studio: sincronia automática =="

for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then eval "$("$b" shellenv)"; break; fi
done

py=""
for c in python3.12 python3.11 python3.13 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then py="$c"; break; fi
done
if [ -z "$py" ]; then
  command -v brew >/dev/null 2>&1 || parar "É preciso o Python 3.10 ou mais novo. Instale o Homebrew em https://brew.sh e rode este arquivo de novo."
  echo "Instalando o Python..."
  brew install python@3.12 || parar "Não consegui instalar o Python. Veja a mensagem acima."
  py="python3.12"
fi
echo "Usando $($py --version)"

# Se a pasta já existe (instalação anterior), só atualiza.
if [ ! -x .venv-sync/bin/python ]; then
  echo "Criando a pasta .venv-sync..."
  "$py" -m venv .venv-sync || parar "Não consegui criar a pasta .venv-sync."
fi

echo "Baixando as bibliotecas (pode levar vários minutos)..."
.venv-sync/bin/python -m pip install --quiet --upgrade pip
.venv-sync/bin/python -m pip install --quiet torch numpy scipy opencv-python-headless python_speech_features==0.6 || parar "A instalação das bibliotecas falhou. Veja a mensagem acima e confira a internet."

echo "Baixando os modelos e conferindo a assinatura de cada um..."
.venv-sync/bin/python worker/autosync.py --install-models || parar "Não consegui baixar os modelos. Confira a internet e rode este arquivo de novo."

.venv-sync/bin/python worker/autosync.py --check >/dev/null || parar "A instalação terminou, mas a verificação falhou. Rode este arquivo de novo."

echo
echo "Pronto. Feche o INVB Studio e abra de novo. No editor do corte, em \"Sincronia do áudio\", aparece o botão \"Detectar automaticamente\"."
read -r -p "Aperte Enter para fechar." _
