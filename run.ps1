# Refreshes data and rebuilds the dashboard, then opens it.
# Usage: .\run.ps1          (uses <20h cache when available)
#        .\run.ps1 -Force   (refetch everything)
param([switch]$Force, [switch]$NoOpen)
# Refuse to overlap: if another dashboard update is mid-run (slow network, or a
# manual run colliding with the hourly task), exit quietly instead of racing it
# for the same files. Task Scheduler's own overlap policy cannot help here - the
# .vbs launcher detaches and exits instantly, so the task always looks finished.
# A named mutex is held by the OS and dies with its process; it cannot go stale.
$mtx = New-Object System.Threading.Mutex($false, 'Global\MacroMonitorRun')
$got = $false
try { $got = $mtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if (-not $got) { Write-Host "Another dashboard update is already running - skipping this one."; exit 0 }
$here = $PSScriptRoot
Set-Location $here
if ($Force) { node fetch-data.mjs --force } else { node fetch-data.mjs }
if (-not $?) { Write-Host "fetch had errors - building with cached data anyway" -ForegroundColor Yellow }
node fetch-calendar.mjs
node fetch-debt.mjs
node fetch-margin.mjs
node fetch-compare.mjs
node fetch-intl.mjs
node build-dashboard.mjs
if ($?) { node check-alerts.mjs }
node check-trump.mjs
# Always make sure the dashboard server is alive —
# this runs on the hourly task too, so a crashed/rebooted server self-heals.
$srv = $false
try { $r = Invoke-WebRequest -Uri "http://localhost:8787/" -Method Head -TimeoutSec 2 -UseBasicParsing; $srv = $true } catch {}
if (-not $srv) { Start-Process wscript.exe "`"$here\silent-server.vbs`""; Start-Sleep -Seconds 2 }
if (-not $NoOpen) {
    Start-Process "http://localhost:8787/"
}
