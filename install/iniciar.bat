@echo off
rem INVB Studio no Windows: de dois cliques neste arquivo.
rem Instala o que faltar (Node, ffmpeg, yt-dlp), atualiza o yt-dlp e abre o app no navegador.
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo == INVB Studio ==

set FALTA=
set VERSAO=
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
  echo Se a instalacao acima terminou sem erro, falta so um passo: o Windows so enxerga os programas
  echo novos em uma janela nova. Feche esta janela e de dois cliques em iniciar.bat outra vez.
  echo Se apareceu algum erro, anote a mensagem e mostre a quem configurou o INVB Studio.
  goto :fim_erro
)

rem O YouTube muda com frequencia: yt-dlp desatualizado para de baixar.
echo Atualizando o yt-dlp...
winget upgrade -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements >nul 2>nul
if errorlevel 1 yt-dlp -U >nul 2>nul

for /f "usebackq" %%v in (`node -p "process.versions.node.split(String.fromCharCode(46))[0]"`) do set VERSAO=%%v
if "!VERSAO!"=="" set VERSAO=0
if !VERSAO! LSS 20 (
  echo.
  echo O Node instalado e antigo ^(versao !VERSAO!^). E preciso a versao 20 ou mais nova.
  echo Rode no Prompt de Comando: winget upgrade -e --id OpenJS.NodeJS.LTS
  goto :fim_erro
)

rem Atualizacao automatica: quando a pasta veio do GitHub (git clone), busca a versao nova antes de abrir.
rem Depois de atualizar, este arquivo e executado de novo do comeco, ja na versao nova.
if not defined INVB_ATUALIZADO if exist ".git" (
  where git >nul 2>nul
  if not errorlevel 1 (
    echo Procurando atualizacao do app...
    rem O npm as vezes reescreve o package-lock.json sozinho, e isso barrava a atualizacao. Volta ao original antes de atualizar.
    git checkout -- package-lock.json >nul 2>nul
    git pull --ff-only --quiet >nul 2>nul
    if errorlevel 1 echo Nao deu para atualizar agora. Abrindo a versao atual.
    set INVB_ATUALIZADO=1
    "%~f0"
    exit /b
  )
)

rem O equipe.env e a fonte da configuracao: sempre que ele mudar, a mudanca vale no proximo inicio.
if exist "install\equipe.env" (
  fc /b "install\equipe.env" ".env" >nul 2>nul
  if errorlevel 1 (
    copy /y "install\equipe.env" ".env" >nul
    echo Configuracao da equipe aplicada.
  )
)
if not exist ".env" (
  echo.
  echo Falta o arquivo de configuracao da equipe.
  echo Peca o arquivo equipe.env a quem configurou o INVB Studio e coloque na pasta install.
  echo Depois de dois cliques neste arquivo de novo.
  goto :fim_erro
)

rem Biblioteca do Claude: so e usada por quem tem a chave na configuracao pessoal.
if not exist "node_modules\@anthropic-ai\sdk" (
  echo Instalando bibliotecas do app...
  call npm install --omit=dev --no-audit --no-fund --no-package-lock >nul 2>nul
  if errorlevel 1 echo Aviso: nao consegui instalar as bibliotecas. O app abre normalmente, so sem os recursos de IA.
)

set PORTA=4321
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set PORTA=%%b

echo Abrindo http://127.0.0.1:!PORTA!
echo Deixe esta janela aberta enquanto usa o app. Para encerrar, feche a janela.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process http://127.0.0.1:!PORTA!"
set NODE_ENV=
set HOST=127.0.0.1
node server.js
if errorlevel 1 (
  echo.
  echo O INVB Studio parou com um erro. A mensagem acima diz o motivo.
  pause
)
goto :eof

:fim_erro
echo.
pause
exit /b 1
