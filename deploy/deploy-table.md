# LidoPacker v2 - upload table

**Release:** `2ff1fbc`
**Live URL:** https://www.lidoalexion.com/packer/
**Prepared:** 2026-08-25 23:27

## Main bundles (smoke-test these names in the page source)

- **JS:** `main.a58912e3bef76490e9be.js`
- **CSS:** `main.f7e88b89d5e69c329ee4.css`

## Upload

Replace the **entire** `packer` folder on the server with the staged copy (19 files).

| Local (this PC) | Server (cPanel File Manager) |
|---|---|
| `deploy/staging/packer/` (all files) | `/home/p7xatiz6j0mk/public_html/packer/` |

Do not merge into the old v1 files. Delete the existing `packer` contents first, then upload this folder, so leftover CRA chunks and the old service worker cannot mix with v2.

`.htaccess` must be in the uploaded folder (File Manager: enable "Show Hidden Files").

## After upload

1. Open https://www.lidoalexion.com/packer/ and hard-refresh (Ctrl+Shift+R).
2. Confirm page source includes `main.a58912e3bef76490e9be.js` and `main.f7e88b89d5e69c329ee4.css`.
3. Create a trip, open packing, refresh - you should stay on that trip, not bounce home.
4. Open a long item list and confirm the toolbar does not collapse to a sliver.

Do not delete `public_html/packer-data/` when replacing the packer folder (user item suggestions live there).

No MySQL. Packing data lives in the browser (IndexedDB). v1 `localStorage` trips are **not** imported yet (deferred).
