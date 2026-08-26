# LidoPacker v2 - upload table

**Release:** `76f54f9`
**Live URL:** https://www.lidoalexion.com/packer/
**Prepared:** 2026-08-26 16:28

## Main bundles (smoke-test these names in the page source)

- **JS:** `main.e0c0b456021484cff34a.js`
- **CSS:** `main.6e2033e1b8a5e0436e63.css`

## Upload (FTP)

Replace the **entire** `packer` folder on the server with the staged copy (19 files). Full FileZilla steps: [DEPLOY.md](DEPLOY.md).

| Local (this PC) | Server (FTP) |
|---|---|
| `deploy/staging/packer/` (all files, including hidden `.htaccess`) | `public_html/packer/` |

1. FileZilla: **Server -> Force showing hidden files**.
2. Open the **server** folder `public_html/packer/`. Delete its contents (do **not** delete `public_html/packer-data/` next door).
3. Upload everything from the local folder above into that empty `packer` folder.
4. Confirm `index.html` is in `public_html/packer/`, not in a nested `packer/packer/`.

Do not merge into leftover v1 files.

## After upload

1. Open https://www.lidoalexion.com/packer/ and hard-refresh (Ctrl+Shift+R).
2. Confirm page source includes `main.e0c0b456021484cff34a.js` and `main.6e2033e1b8a5e0436e63.css`.
3. Create a trip, open packing, refresh - you should stay on that trip, not bounce home.
4. Item picker: **+** to add an item; Create/edit trip: optional bags.

Do not delete `public_html/packer-data/` when replacing the packer folder (user item suggestions live there).

No MySQL. Packing data lives in the browser (IndexedDB). v1 `localStorage` trips are **not** imported yet (deferred).
