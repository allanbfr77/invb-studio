@echo off
rem INVB Studio: instala a remocao de musica (isolamento de voz por IA) neste Windows. Rode uma vez, com dois cliques.
rem Baixa um modelo de separacao de voz (Demucs) para a pasta .venv-voz do projeto: cerca de 1 GB, alguns minutos.
rem Tudo roda no seu computador; nenhum audio e enviado para fora.
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo == INVB Studio: remocao de musica ==

set PY=
where py >nul 2>nul && set PY=py -3
if "!PY!"=="" ( where python >nul 2>nul && set PY=python )
if "!PY!"=="" (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo E preciso o Python 3.10 ou mais novo. Instale em https://www.python.org/downloads/ e rode este arquivo de novo.
    goto :fim_erro
  )
  echo Instalando o Python...
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  echo.
  echo Se a instalacao acima terminou sem erro, feche esta janela e de dois cliques neste arquivo outra vez.
  goto :fim_erro
)

%PY% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
  echo O Python instalado e antigo. E preciso a versao 3.10 ou mais nova: https://www.python.org/downloads/
  goto :fim_erro
)

echo Criando a pasta do modelo (.venv-voz)...
%PY% -m venv .venv-voz
if errorlevel 1 ( echo Nao consegui criar a pasta .venv-voz. & goto :fim_erro )

echo Baixando as bibliotecas (cerca de 1 GB; pode levar varios minutos)...
".venv-voz\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv-voz\Scripts\python.exe" -m pip install --quiet --index-url https://download.pytorch.org/whl/cpu torch torchaudio
if errorlevel 1 ( echo A instalacao das bibliotecas falhou. Veja a mensagem acima e confira a internet. & goto :fim_erro )
".venv-voz\Scripts\python.exe" -m pip install --quiet demucs soundfile
if errorlevel 1 ( echo A instalacao das bibliotecas falhou. Veja a mensagem acima e confira a internet. & goto :fim_erro )

echo Baixando o modelo de separacao de voz...
".venv-voz\Scripts\python.exe" -c "from demucs.pretrained import get_model; get_model('htdemucs')"
if errorlevel 1 ( echo Nao consegui baixar o modelo. Confira a internet e rode este arquivo de novo. & goto :fim_erro )

echo.
echo Pronto. Feche o INVB Studio, abra de novo, e a chave "Remover musica" fica disponivel no editor do corte, na secao Audio.
pause
goto :eof

:fim_erro
echo.
pause
exit /b 1
