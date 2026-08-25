# LidoPacker v2 - upload table

**Release:** `316ba67` plus local deploy packaging (SPA `.htaccess`, service-worker cache `v4`)
**Live URL:** https://www.lidoalexion.com/packer/
**Prepared:** 2026-08-25 19:50

## Main bundles (smoke-test these names in the page source)

- **JS:** `main.3ff77061b754b75ca254.js`
- **CSS:** `main.31b4d26ac42786fb6bbb.css`

## Upload

Replace the **entire** `packer` folder on the server with the staged copy (14 files).

| Local (this PC) | Server (cPanel File Manager) |
|---|---|
| `deploy/staging/packer/` (all files) | `/home/p7xatiz6j0mk/public_html/packer/` |

Do not merge into the old v1 files. Delete the existing `packer` contents first, then upload this folder, so leftover CRA chunks and the old service worker cannot mix with v2.

`.htaccess` must be in the uploaded folder (File Manager: enable "Show Hidden Files").

A ready-to-extract zip is at `deploy/LidoPacker-v2-upload.zip` (includes `.htaccess`).

## After upload

1. Open https://www.lidoalexion.com/packer/ and hard-refresh (Ctrl+Shift+R).
2. Confirm page source includes `main.3ff77061b754b75ca254.js` and `main.31b4d26ac42786fb6bbb.css`.
3. Create a trip, open packing, refresh - you should stay on that trip, not bounce home.
4. Open a long item list and confirm the toolbar does not collapse to a sliver.

No database migrate. Packing data lives in the browser (IndexedDB). v1 `localStorage` trips are **not** imported yet (deferred).
