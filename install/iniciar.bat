@echo off
rem INVB Studio no Windows: de dois cliques neste arquivo.
rem Instala o que faltar (Node, ffmpeg, yt-dlp), atualiza o yt-dlp e abre o app no navegador.
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo == INVB Studio ==

set FALTA=
where node >nul 2>nul || set FALTA=!FALTA! node
where ffmpeg >nul 2>nul || set FALTA=!FALTA! ffmpeg
where yt-dlp >nul 2>nul || set FALTA=!FALTA! yt-dlp

if not "!FALTA!"=="" (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Falta instalar:!FALTA!
    echo Para instalar automaticamente e preciso o "Instalador de Aplicativo" da Microsoft Store ^(winget^).
    echo Abra a Microsoft Store, procure por "Instalador de Aplicativo", instale e abra este arquivo de novo.
    goto :fim_erro
  )
  echo Instalando:!FALTA! ^(so na primeira vez; pode levar alguns minutos^)
  where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  where yt-dlp >nul 2>nul || winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
  echo.
  echo Instalacao concluida. O Windows so enxerga os programas novos em uma janela nova:
  echo feche esta janela e de dois cliques em iniciar.bat outra vez.
  goto :fim_erro
)

rem O YouTube muda com frequencia: yt-dlp desatualizado para de baixar.
echo Atualizando o yt-dlp...
winget upgrade -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements >nul 2>nul
if errorlevel 1 yt-dlp -U >nul 2>nul

for /f "usebackq" %%v in (`node -p "process.versions.node.split(String.fromCharCode(46))[0]"`) do set VERSAO=%%v
if !VERSAO! LSS 20 (
  echo.
  echo O Node instalado e antigo ^(versao !VERSAO!^). E preciso a versao 20 ou mais nova.
  echo Rode no Prompt de Comando: winget upgrade -e --id OpenJS.NodeJS.LTS
  goto :fim_erro
)

if not exist ".env" (
  if exist "install\equipe.env" (
    copy /y "install\equipe.env" ".env" >nul
    echo Configuracao da equipe copiada para .env
  ) else (
    echo.
    echo Falta o arquivo de configuracao da equipe.
    echo Peca o arquivo equipe.env a quem configurou o INVB Studio e coloque na pasta install.
    echo Depois de dois cliques neste arquivo de novo.
    goto :fim_erro
  )
)

set PORTA=4321
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set PORTA=%%b

echo Abrindo http://127.0.0.1:!PORTA!
echo Deixe esta janela aberta enquanto usa o app. Para encerrar, feche a janela.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process http://127.0.0.1:!PORTA!"
set NODE_ENV=
set HOST=127.0.0.1
node server.js
goto :eof

:fim_erro
echo.
pause
exit /b 1
