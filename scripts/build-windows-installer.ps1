$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot "output"
$stagingRoot = Join-Path $outputRoot "windows-package"
$expectedStagingRoot = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $projectRoot "output") "windows-package"))
$resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRoot)

if ($resolvedStagingRoot -ne $expectedStagingRoot -or -not $resolvedStagingRoot.StartsWith([System.IO.Path]::GetFullPath($outputRoot) + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "安装包暂存目录必须位于项目 output 目录中。"
}

$packageInfo = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$electronDist = Join-Path $projectRoot "node_modules\electron\dist"
$electronVersionFile = Join-Path $electronDist "version"
$electronExecutable = Join-Path $electronDist "electron.exe"
$innoCompiler = Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 7\ISCC.exe"

if (-not (Test-Path -LiteralPath $electronVersionFile) -or -not (Test-Path -LiteralPath $electronExecutable)) {
  throw "Electron 运行时尚未下载完成，请先完成 npm install。"
}

$electronVersion = (Get-Content -LiteralPath $electronVersionFile -Raw -Encoding UTF8).Trim() -replace "^v", ""
if ($electronVersion -ne $packageInfo.devDependencies.electron) {
  throw "Electron 运行时版本不匹配，预期 $($packageInfo.devDependencies.electron)，实际为 $electronVersion。"
}

if (-not (Test-Path -LiteralPath $innoCompiler)) {
  throw "找不到 Inno Setup 编译器：$innoCompiler"
}

$previousPackageBuildFlag = $env:QUESTION_BANK_WINDOWS_PACKAGE

Push-Location $projectRoot
try {
  $env:QUESTION_BANK_WINDOWS_PACKAGE = "1"

  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Next.js 生产构建失败，退出码 $LASTEXITCODE。"
  }

  node scripts\prepare-windows-package.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "安装包文件准备失败，退出码 $LASTEXITCODE。"
  }

  & $innoCompiler "/DAppVersion=$($packageInfo.version)" installer\question-bank.iss
  if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup 编译失败，退出码 $LASTEXITCODE。"
  }
} finally {
  if ($null -eq $previousPackageBuildFlag) {
    Remove-Item Env:QUESTION_BANK_WINDOWS_PACKAGE -ErrorAction SilentlyContinue
  } else {
    $env:QUESTION_BANK_WINDOWS_PACKAGE = $previousPackageBuildFlag
  }

  Pop-Location
}
