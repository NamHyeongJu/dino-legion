# Copies the game into an Artifact-ready folder: the page body without <html>/<head>/<body>
# (the viewer adds its own skeleton) plus the supporting files it references.
# Usage: powershell -ExecutionPolicy Bypass -File tools\build-artifact.ps1 -Out <folder>
param([Parameter(Mandatory = $true)][string]$Out)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force (Join-Path $Out 'js'), (Join-Path $Out 'css'), (Join-Path $Out 'assets\creatures'), (Join-Path $Out 'assets\fonts') | Out-Null

Copy-Item (Join-Path $root 'js\*.js') (Join-Path $Out 'js')
Copy-Item (Join-Path $root 'assets\creatures\*.png') (Join-Path $Out 'assets\creatures')
Copy-Item (Join-Path $root 'assets\fonts\*.ttf') (Join-Path $Out 'assets\fonts')
# The viewer already pads :root by the safe-area insets, so the bars drop their own inset padding.
$css = (Get-Content -Raw -Encoding UTF8 (Join-Path $root 'css\style.css')) + @'

/* artifact viewer: :root is already padded by the safe-area insets */
#topbar { padding-top: 6px; }
#nav { padding-bottom: 6px; }
'@
[IO.File]::WriteAllText((Join-Path $Out 'css\style.css'), $css, (New-Object Text.UTF8Encoding $false))

$html = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'index.html')
$title = [regex]::Match($html, '<title>.*?</title>').Value
$body = [regex]::Match($html, '(?s)<body>(.*)</body>').Groups[1].Value.Trim()
$page = @"
$title
<meta name="theme-color" content="#2a1d12">
<link rel="stylesheet" href="css/style.css">
$body
"@
[IO.File]::WriteAllText((Join-Path $Out 'index.html'), $page, (New-Object Text.UTF8Encoding $false))
Get-ChildItem -Recurse -File $Out | ForEach-Object { $_.FullName.Substring($Out.Length + 1).Replace('\', '/') } | Where-Object { $_ -ne 'index.html' }
