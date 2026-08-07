' Launches the daily screener refresh with no visible window.
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\GameDev\macro-monitor\screener.ps1"" -NoOpen", 0, False
