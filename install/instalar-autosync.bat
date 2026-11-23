@echo off
rem INVB Studio: instala a sincronia automatica (AutoSync) neste Windows. Rode uma vez, com dois cliques.
rem Cria a pasta .venv-sync com as bibliotecas (cerca de 1 GB) e baixa dois modelos pequenos (cerca de 55 MB):
rem o SyncNet, que compara a boca com o som, e um detector de rosto. Tudo roda no seu computador; nada e enviado para fora.
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."
set PYTHONIOENCODING=utf-8

echo == INVB Studio: sincronia automatica ==

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

rem Se a pasta ja existe (instalacao anterior), so atualiza: recriar falha com o app aberto usando o Python dela.
if not exist ".venv-sync\Scripts\python.exe" (
  echo Criando a pasta .venv-sync...
  %PY% -m venv .venv-sync
  if errorlevel 1 ( echo Nao consegui criar a pasta .venv-sync. & goto :fim_erro )
)

echo Baixando as bibliotecas (pode levar varios minutos)...
".venv-sync\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv-sync\Scripts\python.exe" -m pip install --quiet --index-url https://download.pytorch.org/whl/cpu torch
if errorlevel 1 ( echo A instalacao das bibliotecas falhou. Veja a mensagem acima e confira a internet. & goto :fim_erro )
".venv-sync\Scripts\python.exe" -m pip install --quiet numpy scipy opencv-python-headless python_speech_features==0.6
if errorlevel 1 ( echo A instalacao das bibliotecas falhou. Veja a mensagem acima e confira a internet. & goto :fim_erro )

echo Baixando os modelos e conferindo a assinatura de cada um...
".venv-sync\Scripts\python.exe" worker\autosync.py --install-models
if errorlevel 1 ( echo Nao consegui baixar os modelos. Confira a internet e rode este arquivo de novo. & goto :fim_erro )

".venv-sync\Scripts\python.exe" worker\autosync.py --check >nul
if errorlevel 1 ( echo A instalacao terminou, mas a verificacao falhou. Rode este arquivo de novo. & goto :fim_erro )

echo.
echo Pronto. Feche o INVB Studio e abra de novo. No editor do corte, em "Sincronia do audio", aparece o botao "Detectar automaticamente".
pause
goto :eof

:fim_erro
echo.
pause
exit /b 1
