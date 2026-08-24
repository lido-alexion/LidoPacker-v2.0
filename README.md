# LidoPacker v2

Mobile-first, offline-first packing assistant PWA.

See [implementation.md](implementation.md) for design-doc status and working notes.

---

## Quick Reference

### Run dev server
```bash
npm run dev
```
Opens at `http://localhost:3005/packer/`

### Build for production
```bash
npm run build
```
Output goes to `dist/`

### Unit tests
```bash
npm test
```

### Generate PWA icons
```bash
npm run generate-icons
```
Writes PNG icons to `public/icons/`. Install the `canvas` package first for proper icons; otherwise placeholder 1×1 PNGs are created.

---

## Project Structure

```
src/
  main.ts                    # App entry — DB init, routing, SW, offline bar
  index.html                 # Shell HTML (single <div id="app">)
  components/
    toast.ts                 # Singleton toast notification
  db/
    database.ts              # IndexedDB (items, trips, tripItems, scheduledNotifications)
  screens/
    homeScreen.ts            # Trip list, FAB, reminders banner, delete confirm
    createTripScreen.ts      # Create trip form with validation
    editTripScreen.ts        # Edit name, destination, datetimes
    itemSelectionScreen.ts   # Global fuzzy search, select all, steppers, add item
    cloneTripScreen.ts       # Clone trip with a unique name
    packingScreen.ts         # Checklist, progress, modes, show packed, live countdown
  services/
    itemService.ts           # Base items seed, trip item generation
    notificationService.ts   # Permission, IndexedDB schedule, SW fire, FCM stub
  styles/
    _variables.scss          # Lido Alexion design tokens
    main.scss                # Component styles (BEM)
  utils/
    router.ts                # In-memory router
    timeEngine.ts            # Phase, countdown, timezone-aware dates
    packingLogic.ts          # Sort, progress, derived remaining/phase/missed
    search.ts                # Ranked fuzzy search
    validation.ts            # Item / Trip / TripItem validation
    routes.ts                # URL path ↔ route mapping
    router.ts                # History API router (back/forward, refresh)
    types.ts                 # TypeScript interfaces
    offline.ts               # Online/offline listeners
  qa/
    unitTests.ts             # Phase, sort, search, validation tests

public/
  manifest.json
  sw.js                      # Cache, push handler, due-notification scan
  icons/
```

---

## Data Model

| Type | Key fields |
|---|---|
| `Item` | `id`, `name`, `category`, `subcategory?`, `type`, `stage`, `defaultCount`, tag arrays |
| `Trip` | `id`, `name`, `location`, `startTime` (ISO or `YYYY-MM-DD`), `endTime?`, `timezone?`, `isArchived?`, tag arrays |
| `TripItem` | `tripId`, `itemId`, `count`, `isSelected`, `isPacked` |
| `ScheduledNotification` | `id`, `tripId`, `kind`, `fireAt`, `title`, `body`, `fired` |

IndexedDB stores: `items`, `trips`, `tripItems` (composite key `[tripId, itemId]`), `scheduledNotifications`.

---

## Time Engine & Phases

| Phase | Condition |
|---|---|
| `EARLY` | > 48 hours away |
| `MID` | 6–48 hours away |
| `LAST_MINUTE` | 0–6 hours away |
| `POST` | Trip has started |

Phase drives item sort order (phase-matched items first, then unpacked), UI banners, and badge colors. Trip times are stored as UTC ISO and displayed in the trip's IANA timezone.

---

## Screens & Navigation

```
/                         home
/new                      create-trip
/trips/:id                packing
/trips/:id/items          item-selection
/trips/:id/edit           edit-trip
```

The router uses the History API (`pushState` / `popstate`). Refresh, bookmarks, and the browser back/forward buttons keep the current screen. Unknown paths replace to `/`.

```
home  →  /new  →  /trips/:id/items  →  /trips/:id
         (back)     (back→home)          (back→home, Items→/items)
```

---

## Packing Modes

| Mode | Shows |
|---|---|
| All Items | Every selected item |
| Last Minute | Unpacked items with stage `LAST_MINUTE` |
| Forgot | Unpacked selected items (missed list in POST) |

---

## PWA & Offline

- Service worker: **network-first** navigation, **cache-first** assets, plus due-reminder scan.
- All data lives in IndexedDB — works offline after first load.
- An offline banner appears when the network drops.
- Manifest supports install-to-homescreen (`display: standalone`).

---

## Notifications

Permission is requested from the home banner or the create-trip reminder checkbox. If blocked, the UI shows a disabled/blocked state.

After permission is granted, reminders are stored in IndexedDB and fired via the service worker (and in-session timers while the app is open):

- 48 hours before departure
- 6 hours before departure
- At departure
- Post-trip: unpacked items (`checkMissedItems` on packing screen in POST)

To enable FCM / Web Push, set `VAPID_PUBLIC_KEY` in `notificationService.ts` and send the resulting subscription to your server. Empty key = local reminders only.

---

## Design Tokens (SCSS)

Lido Alexion overlay in [src/styles/_variables.scss](src/styles/_variables.scss):

- **Primary**: `#00cfff` (cyan)
- **Success**: `#16a34a` (green)
- **Warning**: `#d97706` (amber)
- **Danger**: `#dc2626` (red)
- **Cards**: `#FFE4C4` (bisque)
- **Header**: `#000000`

---

## Design Doc Verification

See [implementation.md](implementation.md). Section 15 (AI / Community / Sync) is future work. FCM delivery requires a backend and a VAPID key.
