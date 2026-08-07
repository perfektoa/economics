# Refreshes screener data (20h cache per ticker) and rebuilds screener.html.
# Usage: .\screener.ps1 [-Force] [-NoOpen]
param([switch]$Force, [switch]$NoOpen)
# Refuse to overlap. The first screener fetch runs 1-2 HOURS, so the collision
# is not hypothetical: setup can kick one off in the background and the daily
# 8:10 task can fire while it is still going. Same mutex pattern as run.ps1.
$mtx = New-Object System.Threading.Mutex($false, 'Global\MacroScreenerRun')
$got = $false
try { $got = $mtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if (-not $got) { Write-Host "Another screener update is already running - skipping this one."; exit 0 }
$here = $PSScriptRoot
Set-Location $here
if ($Force) { node fetch-screener.mjs --force } else { node fetch-screener.mjs }
node build-screener.mjs
node fetch-fts.mjs
node fetch-news.mjs
node build-screener.mjs
if ($? -and -not $NoOpen) { Start-Process "$here\screener.html" }
