#!/bin/bash
# INVB Studio no Mac: dê dois cliques neste arquivo.
# Instala o que faltar (Node, ffmpeg, yt-dlp), atualiza o yt-dlp e abre o app no navegador.
cd "$(dirname "$0")/.." || exit 1

parar() { echo; echo "$1"; echo; read -r -p "Aperte Enter para fechar." _; exit 1; }

echo "== INVB Studio =="

# O Homebrew pode estar instalado sem estar no PATH desta janela.
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then eval "$("$b" shellenv)"; break; fi
done

falta=""
command -v node >/dev/null 2>&1 || falta="$falta node"
command -v ffmpeg >/dev/null 2>&1 || falta="$falta ffmpeg"
command -v yt-dlp >/dev/null 2>&1 || falta="$falta yt-dlp"

if [ -n "$falta" ]; then
  command -v brew >/dev/null 2>&1 || parar "Falta instalar:$falta
Para instalar automaticamente é preciso o Homebrew. Abra https://brew.sh, copie o comando da página
inicial, cole no Terminal e, quando terminar, dê dois cliques neste arquivo de novo."
  echo "Instalando:$falta (só na primeira vez; pode levar alguns minutos)"
  # shellcheck disable=SC2086
  brew install $falta || parar "Não consegui instalar:$falta. Veja a mensagem acima."
else
  # O YouTube muda com frequência: yt-dlp desatualizado para de baixar.
  if command -v brew >/dev/null 2>&1 && brew list yt-dlp >/dev/null 2>&1; then
    echo "Atualizando o yt-dlp..."
    brew upgrade yt-dlp >/dev/null 2>&1 || true
  else
    yt-dlp -U >/dev/null 2>&1 || true
  fi
fi

versao=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
[ "${versao:-0}" -ge 20 ] || parar "O Node instalado é antigo (versão ${versao:-desconhecida}). É preciso a versão 20 ou mais nova.
No Terminal, rode: brew upgrade node"

if [ ! -f .env ]; then
  if [ -f install/equipe.env ]; then
    cp install/equipe.env .env
    echo "Configuração da equipe copiada para .env"
  else
    parar "Falta o arquivo de configuração da equipe.
Peça o arquivo equipe.env a quem configurou o INVB Studio e coloque na pasta install.
Depois dê dois cliques neste arquivo de novo."
  fi
fi

porta=$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')
porta=${porta:-4321}

echo "Abrindo http://127.0.0.1:$porta"
echo "Deixe esta janela aberta enquanto usa o app. Para encerrar, feche a janela."
(sleep 2; open "http://127.0.0.1:$porta") &
NODE_ENV= HOST=127.0.0.1 exec node server.js
