@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "URL=http://localhost:3000"
set "READY="

for /f %%S in ('curl.exe -s -o NUL -w "%%{http_code}" --max-time 2 "%URL%" 2^>NUL') do set "READY=%%S"

if not "%READY:~0,1%"=="2" if not "%READY:~0,1%"=="3" if not "%READY:~0,1%"=="4" (
  start "QuestionBankServer" /min cmd.exe /d /c "cd /d "%PROJECT_ROOT%" && npm.cmd run dev >> server.log 2>> server.err.log"
  timeout /t 3 /nobreak >NUL
)

start "" "%URL%"
exit /b 0
