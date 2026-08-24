# Lido Pack V2 – Complete Design & Implementation Document

---

# ⚠️ IMPORTANT IMPLEMENTATION INSTRUCTIONS

This document contains:

1. System Design (Sections 1–16)
2. Implementation Prompts (Appendix)

## Execution Rules (MANDATORY)

- Read full document before starting
- Execute prompts **one by one (Appendix)**
- After each prompt:
  - Verify implementation
  - Fix gaps

- Do NOT skip steps
- Completion = all prompts done + all features working

---

# 1. 🎯 Objective

Build a **mobile-first, offline-first, time-aware packing assistant** that:

- Generates smart packing lists
- Adapts to trip timing
- Works instantly without network
- Sends optional notifications

---

# 2. 🧠 Core Principles

- Offline-first
- Zero friction
- Context-aware UI
- Fast (<100ms interactions)

---

# 3. 🏗️ Architecture

## Stack

- Vanilla JS + TypeScript
- SCSS
- No framework (React-like structure)

## Structure

```
/src
  /components
  /screens
  /services
  /db
  /utils
  /styles
```

---

## Data Flow

- IndexedDB = source of truth
- UI reads local state
- Sync (future) is async

---

# 4. 🧱 Data Model

## Item

```ts
interface Item {
	id: string;
	name: string;
	category: string;
	type: "PACK" | "WEAR" | "CARRY" | "TODO";
	stage: "EARLY" | "MID" | "LAST_MINUTE" | "POST";
	defaultCount: number;
}
```

---

## Trip

```ts
interface Trip {
	id: string;
	name: string;
	location: string;
	startTime: string;
	endTime?: string;
}
```

---

## TripItem

```ts
interface TripItem {
	tripId: string;
	itemId: string;
	count: number;
	isSelected: boolean;
	isPacked: boolean;
}
```

---

# 5. ⏱️ Time Engine

```ts
function getPhase(startTime: number, now: number) {
	const diff = startTime - now;

	if (diff > 48 * 60 * 60 * 1000) return "EARLY";
	if (diff > 6 * 60 * 60 * 1000) return "MID";
	if (diff > 0) return "LAST_MINUTE";
	return "POST";
}
```

---

# 6. 🧠 State Engine

Derived:

- Remaining items
- Phase items
- Missed items

---

# 7. 🎯 UX Behavior

- Show ALL items
- Sort:
  1. Phase items
  2. Unpacked
  3. Others

---

# 8. 🔔 Notifications

- PWA Push
- FCM

---

# 9. 🔍 Search

- Global + fuzzy
- Add new item

---

# 10. ⚙️ Features

- Select/Deselect all
- Count logic
- Smart sorting

---

# 11. 🌐 Offline Strategy

- IndexedDB only
- No UI blocking

---

# 12. 📱 Modes

- Normal
- Last-minute
- Forgot

---

# 13. 🧪 Edge Cases

- Offline
- Timezone
- Notifications disabled

---

# 14. 📱 PWA

- Service worker
- Manifest
- Installable

---

# 15. 🚀 Future

- AI
- Community
- Sync

---

# 16. 🎨 UI SPEC (Component-Level)

## Theme

- Light
- Soft background

## Colors

- Primary: Blue/Teal
- Success: Green
- Warning: Amber

---

## Global Components

### Button

- 48px height
- Rounded
- Primary filled

### Card

- White
- Rounded
- Shadow

### Checkbox

- Animated
- Green when checked

---

## Screens

---

## 🏠 Home

- Header
- Trip cards
- FAB (+)

---

## ➕ Create Trip

- Location input
- Date/time
- CTA button

---

## 📦 Item Selection

- Search
- Categories
- Items:
  - Checkbox
  - Count stepper

---

## 🎒 Packing

- Progress bar
- Banner
- Item list

---

## Modes

### Last-Minute

- Only urgent items

### Forgot

- Only missed items

---

# 📌 APPENDIX – IMPLEMENTATION PROMPTS

---

## Prompt 1: Project Setup

- Setup TS + SCSS project
- Folder structure
- Basic routing system

Verify:

- App runs
- Navigation works

---

## Prompt 2: IndexedDB

- Setup DB layer
- CRUD for all entities

Verify:

- Persistence works

---

## Prompt 3: Models

- Implement interfaces
- Validation

---

## Prompt 4: Home Screen

- Trip list UI
- FAB

---

## Prompt 5: Create Trip

- Form
- Save trip

---

## Prompt 6: Item Generation

- Load base items
- Attach to trip

---

## Prompt 7: Item Selection UI

- Categories
- Select all
- Count stepper

---

## Prompt 8: Time Engine

- Phase detection
- Sorting logic

---

## Prompt 9: Packing Screen

- Checklist
- Progress

---

## Prompt 10: Context UI

- Banners
- Mode switching

---

## Prompt 11: Search

- Global search
- Add item

---

## Prompt 12: PWA

- Manifest
- Service worker

---

## Prompt 13: Notifications

- FCM setup
- Token registration

---

## Prompt 14: Notification Logic

- Pre-trip
- Last-minute
- Post-trip

---

## Prompt 15: Final QA

- Full system validation
- Fix bugs
- Optimize performance

---

# ✅ END
