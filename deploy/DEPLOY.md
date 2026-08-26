# LidoPacker v2 — production deploy (GoDaddy / cPanel)

**Live URL:** `https://www.lidoalexion.com/packer/`  
**Account:** `/home/p7xatiz6j0mk/public_html/packer/` (same host as Portfolio)

This app is mostly static files. PHP is used only for item suggestions (`api/suggest-item.php` and `/packer/admin/`). There is no MySQL step.

## 1. Prepare (from this repo)

```powershell
powershell -ExecutionPolicy Bypass -File deploy/prepare-upload.ps1
```

That runs tests, `npm run build`, copies `dist/` to `deploy/staging/packer/`, and writes `deploy/deploy-table.md`.

## 2. Upload with FTP (FileZilla)

Use the **same FTP login** you already use for lidoalexion.com.

| Setting | Typical value |
|---|---|
| Protocol | FTP or **FTPS** (explicit TLS) if the host offers it |
| Host | `ftp.lidoalexion.com` (or the FTP host shown in cPanel) |
| Port | `21` |
| User / password | cPanel FTP user |
| Remote folder | `public_html/packer/` |

**Do not delete** `public_html/packer-data/`. That folder sits **next to** `packer/`, not inside it. Suggestions live there.

### Steps

1. In FileZilla: **Server → Force showing hidden files** so `.htaccess` is visible and will upload.
2. Left side (local): open `D:\Projects\LidoPacker-v2.0\deploy\staging\packer\`
3. Right side (server): open `public_html/packer/`
4. In the **server** `packer` folder only: select all files and folders, then delete them. Wait until the deletes finish.
5. From the **local** `packer` folder: select all files and folders (including `.htaccess`, `admin`, `api`, `php`, `icons`) and upload into the empty server `packer` folder.
6. Confirm you did **not** create `public_html/packer/packer/` (a nested extra folder). The live site must see `index.html` directly in `public_html/packer/`.

Do not merge into leftover v1 files. A mixed folder will serve the wrong JavaScript.

## 3. Server behaviour

| Need | How |
|---|---|
| Asset URLs | Webpack `publicPath: '/packer/'` |
| Deep links (`/packer/trips/:id`) | `public/.htaccess` rewrites missing paths to `index.html` |
| Returning visitors | `sw.js` cache name bump (`lidopacker-v2-cache-v9` for this release) drops the old Cache Storage |
| Master item list | `catalog.json` (network-first). Bump `last_updated` when adding/editing items. |
| Item suggestions | JSON file at `public_html/packer-data/suggestions.json` (created on first suggest). **Do not delete that folder** when replacing `packer/`. |
| Suggestion admin | https://www.lidoalexion.com/packer/admin/ — password only. File `{cPanel home}/lidopacker-admin-password.php` (above `public_html`). Default `PackReview26!` until you edit that file via FTP. |

## 4. Smoke test

1. https://www.lidoalexion.com/packer/ loads (hard-refresh: Ctrl+Shift+R).
2. View source: hashed `main.*.js` / `main.*.css` from `deploy/deploy-table.md`.
3. Create a trip → packing → refresh stays on that URL.
4. Item picker: long list, toolbar stays usable; checkbox toggle does not jump scroll.
5. **+** FAB: add an item (category/subcategory pills, Add another). After deploy, a copy of the name should appear on `/packer/admin/`.
6. Create/edit trip: optional bags; packing shows a bag dropdown only when there is more than one bag slot.

## 5. Data note

Browser-only. IndexedDB `LidoPackerDB` stores trips and a copy of the master catalog. The live catalog file is `catalog.json` (`last_updated` compared on each boot) with the 669 v1 items. v1 trip `localStorage` import is still deferred — see `implementation.md`.
