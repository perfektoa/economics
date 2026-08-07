# One-time setup. Run it by double-clicking setup.bat.
# Asks for the one key it needs, wires up the automatic updates, builds the
# dashboard, and puts a shortcut on the desktop. Safe to re-run any time -
# it skips whatever is already done.
param()
$here = $PSScriptRoot
Set-Location $here
$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "=== Macro Monitor setup ===" -ForegroundColor Cyan
Write-Host ""

# -- 1. Node -----------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is not installed (or not on PATH)." -ForegroundColor Red
    Write-Host "Install it from https://nodejs.org (click through the installer, defaults are fine),"
    Write-Host "then double-click setup.bat again."
    Read-Host "Press Enter to close"
    exit 1
}
Write-Host ("Node.js found: " + (node --version)) -ForegroundColor Green

# -- 2. Dependencies ---------------------------------------------------------
if (-not (Test-Path "$here\node_modules")) {
    Write-Host "Installing dependencies (one minute)..."
    npm install --no-fund --no-audit | Out-Null
}
Write-Host "Dependencies OK" -ForegroundColor Green

# -- 3. Config: the one key --------------------------------------------------
if (-not (Test-Path "$here\config.json")) {
    Write-Host ""
    Write-Host "You need one free API key, from FRED (US economic data)." -ForegroundColor Yellow
    Write-Host "Get it here (takes about a minute, instant email):"
    Write-Host "    https://fred.stlouisfed.org/docs/api/api_key.html" -ForegroundColor Cyan
    Write-Host ""
    $key = Read-Host "Paste your FRED API key here"
    $key = $key.Trim()
    # Quick live test so a typo fails now, not silently at 3am.
    $test = node -e "fetch('https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=$key&file_type=json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "That key was rejected by FRED - check for missing characters and re-run setup.bat." -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit 1
    }
    Write-Host "Key works." -ForegroundColor Green
    Write-Host ""
    Write-Host "Optional: phone alerts (Fed moves, regime changes). Install the free ntfy app,"
    Write-Host "subscribe to a topic name you invent (long and random - it acts as a password),"
    Write-Host "and enter the same name here. Or just press Enter to skip."
    $topic = (Read-Host "ntfy topic (Enter to skip)").Trim()
    $cfg = @{ fredApiKey = $key }
    if ($topic) { $cfg.ntfyTopic = $topic }
    $cfg | ConvertTo-Json | Out-File -Encoding utf8 "$here\config.json"
    Write-Host "config.json written (this file stays on your PC - it is never uploaded anywhere)." -ForegroundColor Green
} else {
    Write-Host "config.json already exists - keeping it" -ForegroundColor Green
}

# -- 4. Automatic updates (dashboard only - screener decided separately) ------
Write-Host ""
$auto = Read-Host "Keep the dashboard updated automatically, every hour? (Y/n)"
if ($auto -eq '' -or $auto -match '^[yY]') {
    schtasks /create /f /tn "MacroMonitor" /sc hourly /tr "wscript.exe `"$here\silent.vbs`"" | Out-Null
    Write-Host "Scheduled. Remove any time in Task Scheduler (task name: MacroMonitor)." -ForegroundColor Green
} else {
    Write-Host "Skipped. Re-run setup.bat later if you change your mind, or run run.ps1 by hand."
}

# -- 5. First build ----------------------------------------------------------
Write-Host ""
Write-Host "Fetching data and building the dashboard (2-3 minutes the first time)..."
& "$here\run.ps1" -NoOpen
if (Test-Path "$here\dashboard.html") {
    Write-Host "Dashboard built." -ForegroundColor Green
} else {
    Write-Host "Dashboard build failed - scroll up for the error." -ForegroundColor Red
}

# -- 6. Desktop shortcut -----------------------------------------------------
$lnk = [Environment]::GetFolderPath('Desktop') + "\Macro Monitor.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = "$here\dashboard.html"
$sc.Save()
Write-Host "Desktop shortcut created: Macro Monitor" -ForegroundColor Green

# -- 7. Screener: entirely optional ------------------------------------------
Write-Host ""
Write-Host "OPTIONAL: the stock screener. It scores ~4,500 US stocks on value, quality"
Write-Host "and momentum - but that means downloading data for 4,500 companies: the"
Write-Host "first build takes 1-2 hours, then a daily refresh keeps it current."
Write-Host "If you only want the macro dashboard, say n - nothing screener-related"
Write-Host "will ever run or download."
$scr = Read-Host "Set up the screener? (y/n)"
if ($scr -match '^[yY]') {
    schtasks /create /f /tn "MacroScreener" /sc daily /st 08:10 /tr "wscript.exe `"$here\silent-screener.vbs`"" | Out-Null
    Write-Host "Daily refresh scheduled for 8:10 (task name: MacroScreener)." -ForegroundColor Green
    $now = Read-Host "Start the first 1-2 hour build now, in the background? Otherwise it happens at the next 8:10 (y/N)"
    if ($now -match '^[yY]') {
        Start-Process wscript.exe "`"$here\silent-screener.vbs`""
        Write-Host "Running in the background. screener.html will appear in this folder when done." -ForegroundColor Green
    }
} else {
    Write-Host "Skipped entirely - no screener downloads will happen. Re-run setup.bat any time to add it."
}

Write-Host ""
Write-Host "=== Done. Double-click 'Macro Monitor' on your desktop. ===" -ForegroundColor Cyan
Read-Host "Press Enter to close"
