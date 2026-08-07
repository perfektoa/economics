' Starts the local dashboard server with no visible window. Resolves its own
' folder, so it works wherever the repo was cloned.
Dim fso, here
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("Wscript.Shell").Run "cmd /c cd /d """ & here & """ && node server.mjs", 0, False
