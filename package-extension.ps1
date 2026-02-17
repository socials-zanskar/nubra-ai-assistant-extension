$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$manifestPath = Join-Path $root "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Could not read version from manifest.json"
}

$outputDir = Join-Path $root "dist"
$bundleDir = Join-Path $outputDir "nubra-ai-extension-$version"
$zipPath = Join-Path $outputDir "nubra-ai-extension-$version.zip"

if (Test-Path $bundleDir) {
  Remove-Item $bundleDir -Recurse -Force
}
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

$itemsToCopy = @(
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "popup.css",
  "icons"
)

foreach ($item in $itemsToCopy) {
  $source = Join-Path $root $item
  if (-not (Test-Path $source)) {
    throw "Required extension file/folder missing: $item"
  }
  Copy-Item -Path $source -Destination $bundleDir -Recurse -Force
}

Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force

Write-Host "Packaged extension version $version"
Write-Host "Unpacked folder: $bundleDir"
Write-Host "ZIP file: $zipPath"
