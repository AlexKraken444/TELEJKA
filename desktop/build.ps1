$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
 node desktop/icon.mjs
 if ($LASTEXITCODE -ne 0) { throw 'Icon build failed' }
 $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 & $compiler /nologo /target:winexe /optimize+ /platform:anycpu /win32icon:desktop\telejka.ico /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /out:public\downloads\TELEJKA-Setup.exe desktop\Telejka.cs
 if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
 Get-FileHash public/downloads/TELEJKA-Setup.exe -Algorithm SHA256
} finally { Pop-Location }

