$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:3000"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-AppReady)) {
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "run dev" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $projectRoot "server.log") `
    -RedirectStandardError (Join-Path $projectRoot "server.err.log")

  for ($i = 0; $i -lt 45; $i++) {
    if (Test-AppReady) {
      break
    }
    Start-Sleep -Seconds 1
  }
}

Start-Process $url
