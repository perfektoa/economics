# Refreshes screener data (20h cache per ticker) and rebuilds screener.html.
# Usage: .\screener.ps1 [-Force] [-NoOpen]
param([switch]$Force, [switch]$NoOpen)
$here = $PSScriptRoot
Set-Location $here
if ($Force) { node fetch-screener.mjs --force } else { node fetch-screener.mjs }
node build-screener.mjs
node fetch-fts.mjs
node fetch-news.mjs
node build-screener.mjs
if ($? -and -not $NoOpen) { Start-Process "$here\screener.html" }
