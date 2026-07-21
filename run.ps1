# Refreshes data and rebuilds the dashboard, then opens it.
# Usage: .\run.ps1          (uses <20h cache when available)
#        .\run.ps1 -Force   (refetch everything)
param([switch]$Force, [switch]$NoOpen)
$here = $PSScriptRoot
Set-Location $here
if ($Force) { node fetch-data.mjs --force } else { node fetch-data.mjs }
if (-not $?) { Write-Host "fetch had errors - building with cached data anyway" -ForegroundColor Yellow }
node fetch-calendar.mjs
node fetch-debt.mjs
node check-forecasts.mjs
node generate-questions.mjs
node build-dashboard.mjs
if ($?) { node check-alerts.mjs }
node check-trump.mjs
# Always make sure the dashboard server is alive (journal buttons need it) —
# this runs on the hourly task too, so a crashed/rebooted server self-heals.
$srv = $false
try { $r = Invoke-WebRequest -Uri "http://localhost:8787/" -Method Head -TimeoutSec 2 -UseBasicParsing; $srv = $true } catch {}
if (-not $srv) { Start-Process wscript.exe "`"$here\silent-server.vbs`""; Start-Sleep -Seconds 2 }
if (-not $NoOpen) {
    Start-Process "http://localhost:8787/"
}
