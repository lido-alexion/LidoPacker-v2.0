# LidoPacker v2 — Implementation Notes

Working directory: `D:\Projects\LidoPacker-v2.0`. v1 (`lido-pack-list`) is read-only reference.

## Catch-up decisions (2026-08-24)

| # | Topic | Decision |
|---|---|---|
| 1 | Smart 669-item catalog | **Deferred** — data migration; keep tagged `BASE_ITEMS` until then |
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
| 15 | Dates | **Date required; time optional.** Date-only stored as `YYYY-MM-DD` (local midnight) |
| 16 | Name + location split | **Keep v2 behaviour** |
| 17 | Header | Link **Lido Alexion** → https://www.lidoalexion.com |
| 18 | Deploy path | **`/packer/`** |
| 19+ | v1 wishlist (luggage, item admin, export, accounts, …) | **Later pass** |

### Category vs subcategory (item 4)

v1 **does** have both:

- **category:** Clothing, Hygiene, Health, Documents, Gadgets, Miscellaneous, Foods, ToDos
- **subcategory:** Essentials, Beach, Wintersport, Baby, … (often mirrors trip type)

Packing in v1: category **tabs**, items **grouped by subcategory** inside a tab.

v2 uses a single grouping key: `displayCategory = item.subcategory || item.category` (tabs and sections). No nested category→subcategory UI.

### Deferred (do not implement in this pass)

1. **Smart catalog (~669 items)** — port `items-data.tsx` + migration of existing IndexedDB catalogs.
2. **v1 localStorage import** — map trip-name keys into IndexedDB `trips` / `tripItems`.
3. **v1 wishlist (item 19+)** — luggage on items, item admin (add/edit/delete catalog), user preferences, color themes, backup/export/import, accounts/cloud sync, login, accessibility pass. See v1 `App.tsx` future to-dos.

### Production migration (proposed, not built)

Both jobs run **in the browser on first v2 boot**. There is no server copy of packing data. Cutover is replacing v1 at the same origin and path: `https://www.lidoalexion.com/packer/`.

v1 already uses basename `/packer/`. Its `localStorage` stays on that origin after the v2 deploy. IndexedDB `LidoPackerDB` is new, so trips must be copied once. If v2 is served from a different host or path, this import will see nothing.

Run after IndexedDB opens, **before** the router paints Home. Catalog first so imported trip rows can point at real item ids.

| Step | Job | Idempotency key | When it no-ops |
|---|---|---|---|
| 0 | `initDB` + bump schema if needed (meta store) | `DB_VERSION` | Already on current version |
| 1 | Upsert 669 catalog items; keep `custom_*` | `meta.catalogVersion` | Version already applied |
| 2 | Remap existing v2 `tripItems` off `i_*` BASE ids | `meta.baseItemRemapVersion` | No `i_*` rows left |
| 3 | Copy v1 `localStorage` trips into IndexedDB | `localStorage lidopacker_v1_import` | Flag done, or no `all_trips_list` |
| 4 | seed + `router.start` | — | Always |

**1. Smart catalog.** Port `items-data.tsx` as a static module. Keep v1 numeric ids as strings (`"1"`…`"669"`) so a later trip import is a 1:1 join. Stop writing the 45 `BASE_ITEMS` (`i_tshirts`, …) on every launch.

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

1. Check in ported `items-data` as TypeScript; add `catalogVersion = 1`; stop seeding `BASE_ITEMS`.
2. Unit-test date map, type case-fold, packed/selected, custom id, name clash.
3. QA three profiles on staging `/packer/`: v1-only, v2-only (45 items), both (v1 keys + `LidoPackerDB`).
4. Deploy v2 `dist/` as `/packer/` with SPA fallback. Confirm origin matches live v1.
5. First-load toast: `Imported N trips`. Leave v1 keys in place for one release.
6. Later release: optional wipe of `all_trips_list` and per-trip keys after a successful import flag.

Flags: IndexedDB `meta.catalogVersion`, `meta.baseItemRemapVersion`; `localStorage lidopacker_v1_import` with imported/skipped counts.

Document any new deferrals here.

## Smart generation (current)

- AND across dimensions, OR within a dimension (v1 `fetchAllItems`).
- If an item omits a dimension, that dimension does not exclude it.
- Matching items are written as trip items with **`isSelected: false`**.
- After **Remove all items**, the matching list is regenerated from current attributes.
- Custom items inherit the current trip’s tags so they keep matching.

`BASE_ITEMS` are tagged so Beach / International / Business / weather filters are not a no-op while the 669 catalog is deferred.

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

## Design-doc pass (already done)

Ranked search, select all, custom items, packing search rebind, notification UX, IndexedDB reminders, timezone, offline banner, FAB, validation, unit tests.
