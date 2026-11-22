#!/bin/bash
# INVB Studio: instala a remoção de música (isolamento de voz por IA) neste Mac. Rode uma vez, com dois cliques.
# Baixa um modelo de separação de voz (Demucs) para a pasta .venv-voz do projeto: cerca de 1 GB, alguns minutos.
# Tudo roda no seu computador; nenhum áudio é enviado para fora.
cd "$(dirname "$0")/.." || exit 1

parar() { echo; echo "$1"; echo; read -r -p "Aperte Enter para fechar." _; exit 1; }

echo "== INVB Studio: remoção de música =="

for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then eval "$("$b" shellenv)"; break; fi
done

# O modelo precisa de Python 3.10 ou mais novo.
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

echo "Criando a pasta do modelo (.venv-voz)..."
"$py" -m venv .venv-voz || parar "Não consegui criar a pasta .venv-voz."

echo "Baixando as bibliotecas (cerca de 1 GB; pode levar vários minutos)..."
.venv-voz/bin/python -m pip install --quiet --upgrade pip
.venv-voz/bin/python -m pip install --quiet torch torchaudio demucs soundfile || parar "A instalação das bibliotecas falhou. Veja a mensagem acima e confira a internet."

echo "Baixando o modelo de separação de voz..."
.venv-voz/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs')" || parar "Não consegui baixar o modelo. Confira a internet e rode este arquivo de novo."

.venv-voz/bin/python -m demucs --help >/dev/null 2>&1 || parar "A instalação terminou, mas o modelo não respondeu. Rode este arquivo de novo."

echo
echo "Pronto. Feche o INVB Studio, abra de novo, e a chave \"Remover música\" fica disponível no editor do corte, na seção Áudio."
read -r -p "Aperte Enter para fechar." _
