' Launches the hourly refresh with no visible window.
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\GameDev\macro-monitor\run.ps1"" -NoOpen", 0, False
