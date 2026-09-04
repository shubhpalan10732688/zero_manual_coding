@echo off
setlocal EnableExtensions

rem  Double-click launcher for the whole local stack.
rem
rem  A .cmd rather than a .sh because the point of it is to be double-clicked in Explorer,
rem  and Windows has no handler that runs a .sh. It orchestrates only: every step below is
rem  a script that already exists in package.json, so nothing here can drift away from what
rem  `npm run` does.
rem
rem    start-local.cmd            start everything, reusing the existing local database
rem    start-local.cmd fresh      discard the local database first and re-seed from scratch

title Zero Manual Coding - local stack
cd /d "%~dp0"

set "DB_PORT=5433"
set "WEB_PORT=3000"
set "DB_ARGS="
if /i "%~1"=="fresh" set "DB_ARGS= -- --fresh"

echo.
echo   Zero Manual Coding - local stack
echo   --------------------------------
echo.

rem ---------------------------------------------------------------- node
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not on PATH.
  echo   Install Node 22 or newer from https://nodejs.org and run this again.
  goto :stop
)
for /f "delims=" %%v in ('node --version') do echo   Node %%v

rem ---------------------------------------------------------------- config
rem  Both files are gitignored, so a fresh clone has neither. The values written here are
rem  the local ones: the app talks to the PGlite dev server on DB_PORT, not to a real
rem  Postgres, and the encryption key is generated once so stored credentials survive
rem  restarts.
if not exist ".env" (
  echo   Creating .env from .env.example
  copy /y ".env.example" ".env" >nul
  powershell -NoProfile -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $k='ENCRYPTION_KEY=' + [Convert]::ToBase64String($b); $t = Get-Content .env; if ($t -match '^ENCRYPTION_KEY=') { $t -replace '^ENCRYPTION_KEY=.*', $k | Set-Content .env } else { Add-Content .env $k }"
  powershell -NoProfile -Command "$u='DATABASE_URL=postgres://postgres:postgres@127.0.0.1:%DB_PORT%/postgres'; $t = Get-Content .env; if ($t -match '^DATABASE_URL=') { $t -replace '^DATABASE_URL=.*', $u | Set-Content .env } else { Add-Content .env $u }"
  echo   Generated an ENCRYPTION_KEY and pointed DATABASE_URL at the local database.
)

if not exist "web\.env.local" (
  echo   Creating web\.env.local for the local database
  >  "web\.env.local" echo DATABASE_URL=postgres://postgres:postgres@127.0.0.1:%DB_PORT%/postgres
  >> "web\.env.local" echo PG_POOL_MAX=1
  >> "web\.env.local" echo PG_IDLE_TIMEOUT_MS=500
  >> "web\.env.local" echo ALLOW_DEV_SESSION=true
)

rem ---------------------------------------------------------------- dependencies
if not exist "node_modules" (
  echo   Installing root dependencies. First run only, and it takes a few minutes.
  call npm install
  if errorlevel 1 goto :failed
)
if not exist "web\node_modules" (
  echo   Installing web dependencies.
  call npm install --prefix web
  if errorlevel 1 goto :failed
)

rem ---------------------------------------------------------------- database
rem  PGlite serves one client at a time and holds a lock on .pglite, so a second instance
rem  cannot start. Reusing a database that is already up is both faster and the only thing
rem  that works if this script is run twice.
call :port_open %DB_PORT%
if "%PORT_OPEN%"=="1" (
  if defined DB_ARGS (
    echo   A database is already running on port %DB_PORT%.
    echo   Close its window first if you want to reset it with "fresh".
    goto :stop
  )
  echo   Database already running on port %DB_PORT%, reusing it.
) else (
  echo   Starting the database, applying migrations and loading the seed...
  start "ZMC database" cmd /k "npm run dev:db%DB_ARGS%"
  call :wait_port %DB_PORT% 120
  if errorlevel 1 (
    echo   The database did not come up within two minutes.
    echo   Look at the "ZMC database" window for the reason.
    goto :stop
  )
  echo   Database listening on port %DB_PORT%.
)

rem ---------------------------------------------------------------- web
call :port_open %WEB_PORT%
if "%PORT_OPEN%"=="1" (
  echo   Something is already serving port %WEB_PORT%, reusing it.
) else (
  echo   Starting the Next.js dev server...
  start "ZMC web" cmd /k "npm run dev --prefix web"
)

rem  /api/health does a real query, so a 200 means the app is up *and* can reach the
rem  database. Waiting on the port alone would open the browser onto a compile error.
echo   Waiting for the app to compile...
call :wait_health %WEB_PORT% 240
if errorlevel 1 (
  echo   The app did not answer on port %WEB_PORT% within four minutes.
  echo   Look at the "ZMC web" window for the reason.
  goto :stop
)

start "" "http://localhost:%WEB_PORT%/"

echo.
echo   Ready.
echo.
echo     Landing page      http://localhost:%WEB_PORT%/
echo     Sign in           http://localhost:%WEB_PORT%/login
echo     Workspace         http://localhost:%WEB_PORT%/app/board
echo.
echo   Sign in with any email on a seeded account - ada@corp.test or grace@corp.test -
echo   and leave the Cursor API key blank to see the shared-only workspace.
echo.
echo   Two windows are now running the stack: "ZMC database" and "ZMC web".
echo   Close both to stop it. This window can be closed at any time.
echo.
goto :stop

rem ---------------------------------------------------------------- helpers

rem  Sets PORT_OPEN to 1 if something is listening on %1, otherwise 0.
:port_open
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %1); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (set "PORT_OPEN=0") else (set "PORT_OPEN=1")
goto :eof

rem  Blocks until port %1 accepts a connection, giving up after %2 seconds.
:wait_port
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(%2); while ((Get-Date) -lt $deadline) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %1); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 400 } }; exit 1" >nul 2>&1
goto :eof

rem  Blocks until the app answers its health probe on port %1, giving up after %2 seconds.
:wait_health
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(%2); while ((Get-Date) -lt $deadline) { try { $r = Invoke-WebRequest -Uri ('http://localhost:%1/api/health') -UseBasicParsing -TimeoutSec 10; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Seconds 2 }; exit 1" >nul 2>&1
goto :eof

:failed
echo.
echo   Setup failed. The output above says where.

:stop
echo.
pause
endlocal
