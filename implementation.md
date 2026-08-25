# LidoPacker v2 — Implementation Notes

Working directory: `D:\Projects\LidoPacker-v2.0`. v1 (`lido-pack-list`) is read-only reference.

## Source control

GitHub: `https://github.com/lido-alexion/LidoPacker-v2.0` (private, separate from v1 `lido-pack-list`).

## Catch-up decisions (2026-08-24)

| # | Topic | Decision |
|---|---|---|
| 1 | Smart 669-item catalog | **Done** — `src/data/catalog.json` (v1 ids `"1"`…`"669"`) + `i_*` remap |
| 2 | Trip attributes (who / transport / weather / types) | **Needed** |
| 3 | Smart list from those tags | **Needed** — do not dump an unrelated full list |
| 4 | Subcategory grouping | **Needed**, one UI level: show **subcategory as category** (no nested category→subcategory) |
| 5–8 | Clone, unpack all, remove all items, trip details | **Needed** |
| 9 | Item picker starts empty | **Needed** — v1 opt-in select |
| 10 | Open packing with nothing selected → item picker | **Needed** |
| 11 | Unique trip name | **Needed** (case-insensitive, trimmed) |
| 12 | Show/hide packed items | **Needed** |
| 13 | Lock attributes once items are selected on the trip | **Needed** — clear items first to edit tags |
| 14 | v1 `localStorage` → IndexedDB migration | **Deferred** |
| 15 | Dates | **Date required; time optional.** Date-only stored as `YYYY-MM-DD` (local midnight). Time pickers are 12-hour with minutes **00 / 15 / 30 / 45**, period **AM then PM**. |
| 16 | Name + location split | **Keep v2 behaviour** |
| 17 | Header | Link **Lido Alexion** → https://www.lidoalexion.com |
| 18 | Deploy path | **`/packer/`** |
| 19+ | v1 wishlist (luggage, item admin, export, accounts, …) | **Partial** — trip bags + packing assignment done; item admin / export / accounts still later |

### Category vs subcategory (item 4)

v1 **does** have both:

- **category:** Clothing, Hygiene, Health, Documents, Gadgets, Miscellaneous, Foods, ToDos
- **subcategory:** Essentials, Beach, Wintersport, Baby, … (often mirrors trip type)

Packing in v1: category **tabs**, items **grouped by subcategory** inside a tab.

v2 uses a single grouping key: `displayCategory = item.subcategory || item.category` (tabs and sections). No nested category→subcategory UI.

### Deferred (do not implement in this pass)

1. **v1 localStorage import** — map trip-name keys into IndexedDB `trips` / `tripItems`.
2. **v1 wishlist (item 19+)** — item admin (add/edit/delete catalog), user preferences, color themes, backup/export/import, accounts/cloud sync, login, accessibility pass. See v1 `App.tsx` future to-dos. Trip bags (optional counts of Carry / Luggage / Backpack / Personal item, packing assignment) is implemented.

### Production migration (proposed, not built)

Both jobs run **in the browser on first v2 boot**. There is no server copy of packing data. Cutover is replacing v1 at the same origin and path: `https://www.lidoalexion.com/packer/`.

v1 already uses basename `/packer/`. Its `localStorage` stays on that origin after the v2 deploy. IndexedDB `LidoPackerDB` is new, so trips must be copied once. If v2 is served from a different host or path, this import will see nothing.

Run after IndexedDB opens, **before** the router paints Home. Catalog first so imported trip rows can point at real item ids.

| Step | Job | Idempotency key | When it no-ops |
|---|---|---|---|
| 0 | `initDB` + bump schema if needed (meta store) | `DB_VERSION` | Already on current version |
| 1 | Upsert 669 catalog items; keep `custom_*` | `meta.catalogLastUpdated` | Server/bundled date not newer |
| 2 | Remap existing v2 `tripItems` off `i_*` BASE ids | leftover `i_*` rows | No `i_*` rows left (done inside `syncCatalog`) |
| 3 | Copy v1 `localStorage` trips into IndexedDB | `localStorage lidopacker_v1_import` | Flag done, or no `all_trips_list` |
| 4 | seed + `router.start` | — | Always |

**1. Smart catalog.** Done: `src/data/catalog.json` (re-port with `node scripts/port-v1-catalog.js`). v1 numeric ids as strings (`"1"`…`"669"`). Catalog sync refreshes when `last_updated` is newer; `i_*` placeholders are remapped by name.

- Upsert every catalog row by id. Overwrite name, tags, category, subcategory from the shipped file so tag fixes land on existing devices.
- Preserve rows whose id starts with `custom_`.
- v1 has no `type` / `stage`: ToDos → `TODO` / `EARLY`; Documents → `CARRY` / `LAST_MINUTE`; Clothing → `PACK` / `EARLY`; Hygiene / Health → `PACK` / `MID`; else `PACK` / `MID`. Missing `defaultCount` → 1. Untagged travellers/weathers/vehicles stay omitted (same as v1).
- Devices that already ran v2: remap `tripItems` from `i_*` onto catalog rows by normalised name. Unmatched `i_*` items stay as custom so packed state is not dropped.
- **Do not** call `generateTripItems` on catalog upgrade. Existing v2 trips keep their `tripItems`; only ids are rewritten.

**2. v1 localStorage → IndexedDB.** v1 has no item master in `localStorage`. Copy the trip index plus each trip’s selected items.

| v1 key | Shape | v2 destination |
|---|---|---|
| `all_trips_list` | Trip[] (name is the key) | `trips` store |
| `<trip.name>` | Selected item copies + `state` | `tripItems` (+ `items` if unknown id) |
| `categoriesMasterList` | Category strings | Skip — derived from catalog |

Field map:

| v1 | v2 | Rule |
|---|---|---|
| `id` (number, 1–1000) | `id` string | `trip_v1_<id>_<slug(name)>` — v1 ids collide |
| `name` | `name` | Trim. If taken by an existing v2 trip, append `(imported)` |
| (none) | `location` | Copy name — v2 requires a destination |
| `startDate` `YYYYMMDD` | `startTime` `YYYY-MM-DD` | Insert hyphens. Missing → skip trip, log it |
| `endDate` `YYYYMMDD` | `endTime` `YYYY-MM-DD` | Omit if empty |
| travellers / vehicles / weathers | same | Keep ids (`man`, `other transport`, …) |
| `types` (often lowercased) | `types` | Map back to catalog labels: `essentials` → `Essentials` |
| `isArchived` | `isArchived` | Pass through |
| item `state` packed / selected | `isPacked` / `isSelected` | packed → both true; selected → selected only |
| item `id` number | `itemId` string | `String(id)` into catalog; else `custom_<id>` |
| item `defaultCount` | `count` | At least 1 |

Do **not** call `generateTripItems` on an imported trip (v1 stored opt-in items only). Do **not** delete v1 `localStorage` on success — keep it as a one-release backup.

A thrown error must not block the app (log, toast, retry next launch). Never overwrite an existing v2 trip id. QuotaExceeded: leave the import flag unset and skip ids already written.

Will not migrate: other browsers/devices, private mode, v1 data on a different host, trips with no `startDate`.

**Cutover**

1. Check in ported items as `src/data/catalog.json`; bump `last_updated`; catalog sync already seeds from that file.
2. Unit-test date map, type case-fold, packed/selected, custom id, name clash.
3. QA three profiles on staging `/packer/`: v1-only, v2-only (45 items), both (v1 keys + `LidoPackerDB`).
4. Deploy v2 `dist/` as `/packer/` with SPA fallback. Confirm origin matches live v1.
5. First-load toast: `Imported N trips`. Leave v1 keys in place for one release.
6. Later release: optional wipe of `all_trips_list` and per-trip keys after a successful import flag.

Flags: IndexedDB `meta.catalogLastUpdated`; `localStorage lidopacker_v1_import` with imported/skipped counts (trip import still deferred).

Document any new deferrals here.

## Smart generation (current)

- AND across dimensions, OR within a dimension (v1 `fetchAllItems`).
- If an item omits a dimension, that dimension does not exclude it.
- Matching items are written as trip items with **`isSelected: false`**.
- After **Remove all items**, the matching list is regenerated from current attributes.
- Custom items inherit the current trip’s tags so they keep matching.

`src/data/catalog.json` is the v1 669-item catalog (numeric ids `"1"`…`"669"`), tagged the same way as v1 so Beach / International / Business / baby filters are not a no-op.

## Master item catalog (server → IndexedDB)

There is no item API. The server list is static file **`/packer/catalog.json`** (built from `src/data/catalog.json`). Re-port from v1 with `node scripts/port-v1-catalog.js`. Shape:

```json
{ "last_updated": "2026-08-25T16:00:00.000Z", "items": [ /* 669 Item rows */ ] }
```

v1 had no `type` / `stage`. Port mapping: ToDos → `TODO`/`EARLY`; Documents (v1 typo `Documants` normalised) → `CARRY`/`LAST_MINUTE`; Clothing → `PACK`/`EARLY`; Hygiene / Health → `PACK`/`MID`; else `PACK`/`MID`. Missing `defaultCount` → 1. Untagged travellers/weathers/vehicles stay omitted.

IndexedDB schema is **`DB_VERSION` 4** so devices that already opened v3 without a `meta` store still get one (v3-without-meta made catalog boot throw Storage Error). `meta` keeps `catalogLastUpdated`. Boot in `main.ts`: `initDB` then `syncCatalog` (before the router paints). Catalog sync failures are logged and do not block Home. If the server fetch fails, a newer **bundled** copy of `catalog.json` still applies so existing v2 devices pick up the 669-item list from the JS payload.

| Visit | What happens |
|---|---|
| First (empty `items` store) | Fetch `/packer/catalog.json`. Write items + `last_updated`. If the fetch fails, seed the bundled copy. |
| Later | Read the catalog from IndexedDB. Refresh the `items` store **only if** server (or bundled) `last_updated` is later than `meta.catalogLastUpdated`. |
| Later, offline / fetch fail | Keep IndexedDB unless the bundled file is newer (then apply bundled). |

On refresh: upsert server items; keep `custom_*`; keep removed catalog ids that a trip still references; delete unused removed catalog ids.

**v2 → v1 id remap.** Devices that already ran the 45-item `i_*` catalog: match leftover `i_*` rows onto the 669 list by normalised name (aliases: T-Shirts→Polo Shirts, Soap / Body Wash→Soap, etc.). Baby-only v1 rows are not used as a match for adult placeholders. Unmatched `i_*` items become `custom_i_*` so packed state is not dropped. Existing trips are **not** filled with the full matching 669-item list (`generateTripItems` / add-missing is skipped on that remap). New trips, and **Remove all items**, generate from the full catalog. Incremental catalog adds after that remap still join existing trips as unselected.

**To ship catalog edits:** change `src/data/catalog.json` **and bump `last_updated`** to a later ISO UTC timestamp (or re-run the port script and bump the date). Clients that already have the old date will not refresh if the timestamp is unchanged. You can also replace only `catalog.json` on the host (no JS rebuild) as long as `last_updated` is newer. Service worker uses network-first for that file; Apache sends `Cache-Control: no-cache`.

## User-added items and suggestion review

Item-selection shows a small primary **+** FAB (same green as Add trip on Home, `z-index` 30 so it stays above sticky section headers). The list has bottom padding so the last row is not covered. Search text still pre-fills the name.

The add dialog collects the same fields a catalog item has: name, category, subcategory, type (Pack / Wear / Carry / Task), packing time (Early / Mid / Last minute / After), preferred quantity (or **N/A** for tasks — stored as `defaultCount` / trip `count` `0`), default luggage type (Carry / Luggage / Backpack / Personal item / Wear; catalog rows omit this), and tags (who, travel mode, weather, trip types). Category and subcategory are single-select pills taken from items already on the trip (no Custom, no free typing). **Add** and **Add another** stay disabled until name, category, and subcategory are set. **Add another** saves, keeps the rest of the form, and clears only the name. Tags start unselected; empty groups mean “match any trip”.

## Trip bags

Create/edit trip has an optional **Bags you're taking** list (type + count). Types: Carry (default packing bag), Luggage, Backpack, Personal item. Omit the section to skip bag assignment.

Stored on the trip as `bags: [{ type, count }]`. Each packing row gets `bagId` like `carry:1` or `luggage:2`. New trip items default to Carry if that type exists, else the item’s default luggage type, else the first bag.

Packing: if the trip has **more than one bag slot**, each item shows a dropdown (Carry, Luggage 1, Luggage 2, …). A type with count 1 is not numbered. A trip with only one bag total has no dropdown. Changing bags on Edit remaps existing `bagId`s (overflow slots clamp down; removed types fall back to Carry). Clone copies bags and assignments.

The item is written to IndexedDB as `custom_*`, selected on the current trip. Catalog sync already keeps `custom_*` rows when `/packer/catalog.json` updates.

A copy of the name is POSTed to `/packer/api/suggest-item.php` (fire-and-forget; packing still works if PHP is down or you are on webpack-dev-server). Suggestions are **not** MySQL. They append to JSON at `{public_html}/packer-data/suggestions.json` (sibling of `packer/`, so a full folder replace of `packer/` does not wipe them). Same name is counted, not duplicated. Max 80 characters, 3000 unique names.

Admin (lightweight, one page): https://www.lidoalexion.com/packer/admin/

- Password only (no username). Default password `PackReview26!` is written on first visit to `{cPanel home}/lidopacker-admin-password.php` — three levels above `packer/php/`, i.e. next to `public_html`, so FTP/File Manager can edit it and the web server will not list or serve it.
- To change the password: open that file via FTP, edit the `return '...';` line, save.
- List is A–Z by item name, with times-suggested and first/last seen.
- **Clear all** empties the JSON file.

No per-row approve/merge into `catalog.json` yet — copy names you want into the master list by hand, then bump `last_updated`. A DB-backed suggestion inbox is deferred until volume needs it.

## Router

Basename **`/packer`**. Paths:

| Path | Screen |
|---|---|
| `/packer` | home |
| `/packer/new` | create-trip |
| `/packer/trips/:id` | packing |
| `/packer/trips/:id/items` | item-selection |
| `/packer/trips/:id/edit` | edit-trip |
| `/packer/trips/:id/clone` | clone-trip |

Webpack `publicPath: '/packer/'`. Production: serve `dist/` as the `/packer/` directory and fall back unknown paths under `/packer/` to `index.html` (same as v1). Dev server rewrites `/packer/trips/...` to `/packer/index.html`.

## How to run

```bash
npm run dev    # http://localhost:3005/packer/
npm test
npm run build
```

- Notification permission is requested on the click itself (before IndexedDB work). `Notification.requestPermission()` after `await` can hang in Chrome. Enable and Create both use a 12s timeout so the UI cannot freeze.

## Production deploy

Same GoDaddy/cPanel host as Portfolio. Serve `dist/` as `/packer/`.

```powershell
powershell -ExecutionPolicy Bypass -File deploy/prepare-upload.ps1
```

Upload `deploy/staging/packer/` over `public_html/packer/` (replace the whole folder, including hidden `.htaccess`). Details: [deploy/DEPLOY.md](deploy/DEPLOY.md). This release bumps the service-worker cache to `lidopacker-v2-cache-v7`.

### Storage Error on the dashboard (2026-08-25)

Local Chrome could show **Storage Error / Could not initialize local storage** after the 669-item catalog landed. Typical causes: IndexedDB already at version 3 without `meta`; `syncCatalog` sharing `initDB`’s try/catch so a catalog write took the app down; dev-server SPA fallback serving `index.html` as `/packer/catalog.json`. Fixes: schema 4 + create missing stores; keep Home up if catalog refresh fails; reject HTML catalog responses; do not SPA-fallback `fetch()` requests. Private browsing with storage blocked still shows Storage Error, now with the browser’s message and a Try again button.

## Design-doc pass (already done)

Ranked search, select all, custom items, packing search rebind, notification UX, IndexedDB reminders, offline banner, FAB, validation, unit tests.

Timezone is stored on trips for date math but is not shown in packing, item selection, create/edit, or trip details. Home dashboard has a small footer hint: device clock + zone name.

Create/edit: Flight / Car / Bike / Others appear only under “How are you travelling?” — not again under “What are you packing for?”. Vehicle ids are still stored on `types` for catalog matching.

## GitHub issue fixes (2026-08-25)

Fixed `lido-alexion/LidoPacker-v2.0` issues #1, #3, #4, #6 and best-effort #2/#5 (real-estate optimisation, explicitly flagged "if possible" in those issues).

| # | Issue | Fix |
|---|---|---|
| 1 | Scrollbar on narrow content body, dead zone on wide screens | **Follow-up (2026-08-25):** page-level scroll on `html`/`body` so the scrollbar sits on the window. The app column (`#app`, site header, screens) is a centred 500px card — chrome bars, dividers, and lists all stay in that column (not full-bleed). FAB is `position: fixed` against the column edge. `scrollChrome.ts` listens to `window` scroll. |
| 3 | Selecting an item scrolls the item-selection pane back to top | `itemSelectionScreen.ts` fully re-renders `innerHTML` on every toggle, which reset `scrollTop`. `renderUI` now takes `{ scrollTop }` and every mutating call site captures/restores it via `currentScrollTop()`. |
| 4 | Item-selection categories don't match the trip's selected tags; unrelated tabs (e.g. Beach/Hiking) appear | Root cause: `displayCategory` grouped by `item.subcategory` regardless of *why* the item matched the trip (an item can carry several `types` tags but only one subcategory, e.g. Swimwear is tagged Beach+Swimming but its subcategory is "Beach"). `tripFilter.ts#displayCategory(item, trip?)` now falls back to the item's broader `category` when the subcategory is tag-driven but that specific tag wasn't selected on the trip. Threaded the optional `trip` through `itemService.ts` (`getCategories`, `fuzzySearch`) and both screens that render tabs/groups. Note: the "too few items" / "no kid or bike-specific items" part of this issue was a data-catalog gap; the 669-item v1 catalog is now ported (see item 1 in the Catch-up decisions table). Baby-tagged rows still require the Baby traveller (and overlapping types) to show. |
| 6 | Edit-trip lock message easy to miss; tags don't look disabled; no way to unlock without leaving the screen; Save always enabled | `attributePicker.ts`: lock note is now a `banner--warning` with a 🔒 icon. `main.scss`: `.attr-fieldset:disabled` greys out `.chip`/`.chip--selected` explicitly instead of relying on opacity alone. `editTripScreen.ts`: added a "Remove all items to edit tags" button (reuses `replaceTripItems`, same semantics as the home-screen "Remove all items" action) that re-renders the screen unlocked; Save Changes starts disabled and only enables once a normalised snapshot (name/location/dates/attrs, array-sorted) of the form differs from the initial one. |
| 2, 5 | Real-estate optimisation on item-selection / packing screens | ... Packing controls (follow-up): short viewports (`max-height: 719px`) keep the compact 3-icon mode switch and a search *button* that expands in-row (hiding the other controls). Taller screens show three labelled buttons (All items / Last minute / Forgot) and a persistent search field. Show-packed is an icon toggle (🙈 hidden / 👁️ shown). A second toggle (☰ / ⬇️) sinks packed rows to the bottom of each category. |

Unit tests: added trip-aware `displayCategory` cases in `qa/unitTests.ts` (tag-driven subcategory only shown when its tag is selected on the trip; non-tag-driven "Essentials" bucket always shown).

### Follow-up fixes found via manual/computer-use regression testing

Post-implementation manual testing (see PR walkthrough video) surfaced two regressions introduced by the auto-hide-on-scroll feature above, root-caused with the Debug subagent using runtime instrumentation (not guessable from code alone):

1. **Scroll position drifted upward on every checkbox toggle on the item-selection screen.** Two compounding causes: (a) clicking a checkbox's own input bubbles a native `click` *and* `change` event — the row's `click` handler was missing an `input`-target guard, so it fired too and double-toggled/double-rendered per click; (b) the browser's default `overflow-anchor` scroll-anchoring heuristic was "correcting" the layout shift from our own deliberate scrollTop restore, fighting it and drifting further each render. Fixed with an `input` guard in the row click handler (`itemSelectionScreen.ts`) and `overflow-anchor: none` on `.screen` (`main.scss`).
2. **The item-selection toolbar (and by extension any `.chrome-collapsible` element) collapsed to near-zero height on long lists even without scrolling**, but stayed correctly sized on short lists. Root cause: `.chrome-collapsible` sets `overflow: hidden`, and per the flexbox spec a flex item's *automatic minimum size* only floors at its content size when `overflow` is `visible` — with `overflow: hidden` it floors at 0 instead. Once the sibling item list overflowed the screen's height, flexbox squeezed the toolbar down to fill the gap instead of leaving that to the screen's own `overflow-y: auto`. Fixed with `flex-shrink: 0` on `.chrome-collapsible`.

Also disabled the CSS transition for the very first `apply()` after a fresh render (`scrollChrome.ts`), so a screen re-render reflects its correct collapsed/expanded state instantly instead of visibly animating through it every time.
