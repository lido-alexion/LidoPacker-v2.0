# Prepare a cPanel upload folder for LidoPacker v2 (run from repo root).
# Output: deploy/staging/packer/ and deploy/deploy-table.md

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$staging = Join-Path $PSScriptRoot 'staging\packer'
$dist = Join-Path $root 'dist'
$table = Join-Path $PSScriptRoot 'deploy-table.md'

Set-Location $root

Write-Host 'Running unit tests...'
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed; aborting deploy package.' }

Write-Host 'Building production bundle...'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed; aborting deploy package.' }

if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item -Path (Join-Path $dist '*') -Destination $staging -Recurse -Force

# CopyWebpackPlugin can miss dotfiles; keep .htaccess in the upload folder.
$htaccess = Join-Path $root 'public\.htaccess'
if (Test-Path $htaccess) {
    Copy-Item $htaccess (Join-Path $staging '.htaccess') -Force
}

# Browser-only payload: drop TS declarations, source maps, and leftover dirs.
Get-ChildItem $staging -Recurse -File | Where-Object {
    $_.Name -like '*.d.ts' -or $_.Extension -eq '.map'
} | Remove-Item -Force
foreach ($dir in @('components', 'db', 'screens', 'services', 'utils')) {
    $p = Join-Path $staging $dir
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

$index = Get-Content (Join-Path $staging 'index.html') -Raw
$jsMatch = [regex]::Match($index, 'main\.[a-z0-9]+\.js')
$cssMatch = [regex]::Match($index, 'main\.[a-z0-9]+\.css')
$js = if ($jsMatch.Success) { $jsMatch.Value } else { '(not found)' }
$css = if ($cssMatch.Success) { $cssMatch.Value } else { '(not found)' }
$commit = (git rev-parse --short HEAD).Trim()
$files = Get-ChildItem $staging -Recurse -File | Measure-Object | Select-Object -ExpandProperty Count

@"
# LidoPacker v2 - upload table

**Release:** ``$commit``
**Live URL:** https://www.lidoalexion.com/packer/
**Prepared:** $(Get-Date -Format 'yyyy-MM-dd HH:mm')

## Main bundles (smoke-test these names in the page source)

- **JS:** ``$js``
- **CSS:** ``$css``

## Upload (FTP)

Replace the **entire** ``packer`` folder on the server with the staged copy ($files files). Full FileZilla steps: [DEPLOY.md](DEPLOY.md).

| Local (this PC) | Server (FTP) |
|---|---|
| ``deploy/staging/packer/`` (all files, including hidden ``.htaccess``) | ``public_html/packer/`` |

1. FileZilla: **Server -> Force showing hidden files**.
2. Open the **server** folder ``public_html/packer/``. Delete its contents (do **not** delete ``public_html/packer-data/`` next door).
3. Upload everything from the local folder above into that empty ``packer`` folder.
4. Confirm ``index.html`` is in ``public_html/packer/``, not in a nested ``packer/packer/``.

Do not merge into leftover v1 files.

## After upload

1. Open https://www.lidoalexion.com/packer/ and hard-refresh (Ctrl+Shift+R).
2. Confirm page source includes ``$js`` and ``$css``.
3. Create a trip, open packing, refresh - you should stay on that trip, not bounce home.
4. Item picker: **+** to add an item; Create/edit trip: optional bags.

Do not delete ``public_html/packer-data/`` when replacing the packer folder (user item suggestions live there).

No MySQL. Packing data lives in the browser (IndexedDB). v1 ``localStorage`` trips are **not** imported yet (deferred).
"@ | Set-Content -Path $table -Encoding utf8

Write-Host "Staged $files files to $staging"
Write-Host "Wrote $table"
Write-Host "JS $js / CSS $css"
