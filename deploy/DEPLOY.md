# LidoPacker v2 — production deploy (GoDaddy / cPanel)

**Live URL:** `https://www.lidoalexion.com/packer/`  
**Account:** `/home/p7xatiz6j0mk/public_html/packer/` (same host as Portfolio)

This app is mostly static files. PHP is used only for item suggestions (`api/suggest-item.php` and `/packer/admin/`). There is no MySQL step.

## 1. Prepare (from this repo)

```powershell
powershell -ExecutionPolicy Bypass -File deploy/prepare-upload.ps1
```

That runs tests, `npm run build`, copies `dist/` to `deploy/staging/packer/`, and writes `deploy/deploy-table.md`.

## 2. Upload

Replace **all** files under `public_html/packer/` with `deploy/staging/packer/`.

- Enable **Show Hidden Files** in cPanel File Manager so `.htaccess` is uploaded.
- Do not leave v1 CRA files next to v2. A mixed folder will serve the wrong JS.

## 3. Server behaviour

| Need | How |
|---|---|
| Asset URLs | Webpack `publicPath: '/packer/'` |
| Deep links (`/packer/trips/:id`) | `public/.htaccess` rewrites missing paths to `index.html` |
| Returning visitors | `sw.js` cache name bump (`lidopacker-v2-cache-v7` for this release) drops the old Cache Storage |
| Master item list | `catalog.json` (network-first). Bump `last_updated` when adding/editing items. |
| Item suggestions | JSON file at `public_html/packer-data/suggestions.json` (created on first suggest). **Do not delete that folder** when replacing `packer/`. |
| Suggestion admin | https://www.lidoalexion.com/packer/admin/ — password only. File `{cPanel home}/lidopacker-admin-password.php` (above `public_html`). Default `PackReview26!` until you edit that file via FTP. |

## 4. Smoke test

1. https://www.lidoalexion.com/packer/ loads (hard-refresh).
2. View source: hashed `main.*.js` / `main.*.css` from `deploy/deploy-table.md`.
3. Create a trip → packing → refresh stays on that URL.
4. Item picker: long list, toolbar stays usable; checkbox toggle does not jump scroll.

5. Open item picker: **+ Add item** saves locally; after deploy, confirm a row appears on `/packer/admin/`.

## 5. Data note

Browser-only. IndexedDB `LidoPackerDB` stores trips and a copy of the master catalog. The live catalog file is `catalog.json` (`last_updated` compared on each boot) with the 669 v1 items. v1 trip `localStorage` import is still deferred — see `implementation.md`.
