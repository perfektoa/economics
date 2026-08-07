' Launches the hourly refresh with no visible window. Resolves its own folder,
' so it works wherever the repo was cloned.
Dim fso, here
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\run.ps1"" -NoOpen", 0, False
