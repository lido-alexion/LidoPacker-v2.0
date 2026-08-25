import { getPhase, formatCountdown, parseTripInstant, isDateOnly, combineDateAndTime, toDateInputValue, toTimeInputValue, snapToQuarterHour, hhmmToClockParts, clockPartsToHhmm } from "../utils/timeEngine";
import { fuzzyScore, fuzzySearchByText } from "../utils/search";
import { computeProgress, derivePackingState, sortTripItems, sortCategoryItems } from "../utils/packingLogic";
import { validateItem, validateTrip, validateTripItem } from "../utils/validation";
import { Packable } from "../utils/packingLogic";
import { isKnownPath, pathFor, routeFromPath, normalizePath } from "../utils/routes";
import { displayCategory, itemMatchesTrip } from "../utils/tripFilter";
import { isTripNameTaken, uniqueCloneName } from "../utils/tripNames";
import { isCatalogNewer, mergeCatalogItems, parseCatalogFile, remapLegacyBaseItems, typeAndStageForV1Category } from "../utils/catalogSync";
import { Item, Trip, TripItem } from "../utils/types";
import catalogFile from "../data/catalog.json";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error("FAIL:", msg);
}

function item(stage: string, packed = false, selected = true): Packable {
  return { isPacked: packed, isSelected: selected, item: { stage } };
}

// --- Time engine ---
const h = 60 * 60 * 1000;
const now = 1_700_000_000_000;
assert(getPhase(now + 49 * h, now) === "EARLY", "phase EARLY > 48h");
assert(getPhase(now + 48 * h, now) === "MID", "phase MID at 48h");
assert(getPhase(now + 7 * h, now) === "MID", "phase MID 7h");
assert(getPhase(now + 6 * h, now) === "LAST_MINUTE", "phase LAST_MINUTE at 6h");
assert(getPhase(now + 1, now) === "LAST_MINUTE", "phase LAST_MINUTE soon");
assert(getPhase(now, now) === "POST", "phase POST at start");
assert(getPhase(now - 1, now) === "POST", "phase POST after start");
assert(formatCountdown(Date.now() - 1000).includes("started"), "countdown started");

// --- Sort: phase items first, then unpacked ---
const sorted = sortTripItems(
  [item("EARLY", true), item("MID", false), item("MID", true), item("EARLY", false)],
  "MID"
);
assert(sorted[0].item.stage === "MID" && !sorted[0].isPacked, "sort: matching unpacked first");
assert(sorted[1].item.stage === "MID" && sorted[1].isPacked, "sort: matching packed second");
assert(sorted[2].item.stage === "EARLY" && !sorted[2].isPacked, "sort: other unpacked next");

const sunk = sortCategoryItems(
  [item("EARLY", true), item("MID", false), item("MID", true), item("EARLY", false)],
  "MID",
  true
);
assert(!sunk[0].isPacked && !sunk[1].isPacked, "category sink: unpacked first");
assert(sunk[2].isPacked && sunk[3].isPacked, "category sink: packed last");
assert(sunk[0].item.stage === "MID", "category sink: unpacked still phase-sorted");

// --- Progress ---
const prog = computeProgress([
  item("EARLY", true, true),
  item("EARLY", false, true),
  item("EARLY", false, false),
]);
assert(prog.total === 2 && prog.packed === 1 && prog.percent === 50, "progress 50% of selected");

// --- State engine ---
const derived = derivePackingState(
  [item("LAST_MINUTE", false), item("EARLY", false), item("EARLY", true), item("MID", false, false)],
  "LAST_MINUTE"
);
assert(derived.remaining.length === 2, "remaining = selected unpacked");
assert(derived.phaseItems.length === 1 && derived.phaseItems[0].item.stage === "LAST_MINUTE", "phase items");
assert(derived.missed.length === 0, "missed empty before POST");
const post = derivePackingState([item("EARLY", false)], "POST");
assert(post.missed.length === 1, "missed items in POST");

// --- Fuzzy search ---
assert(fuzzyScore("Toothbrush", "tooth") > fuzzyScore("Toothbrush", "xyz"), "fuzzy substring beats miss");
assert(fuzzyScore("Phone Charger", "pchr") > 0, "fuzzy sequential chars");
assert(fuzzyScore("Passport", "zzzz") === 0, "fuzzy no match");
const found = fuzzySearchByText(
  [{ item: { name: "T-Shirts", category: "Clothing" } }, { item: { name: "Passport", category: "Documents" } }],
  "pass",
  (t) => [t.item.name, t.item.category]
);
assert(found.length === 1 && found[0].item.name === "Passport", "fuzzySearchByText ranks/filters");

// --- Validation ---
assert(validateTrip({ id: "1", name: "", location: "Paris", startTime: new Date().toISOString() }) !== null, "trip name required");
assert(validateTrip({ id: "1", name: "Go", location: "Paris", startTime: new Date().toISOString() }) === null, "valid trip");
assert(validateTrip({
  id: "1",
  name: "Go",
  location: "Paris",
  startTime: "2026-08-24T10:00:00.000Z",
  endTime: "2026-08-23T10:00:00.000Z",
}) !== null, "end before start invalid");
assert(validateTrip({
  id: "1",
  name: "Go",
  location: "Paris",
  startTime: "2026-08-24",
  endTime: "2026-08-24",
}) === null, "same-day date-only trip valid");
assert(validateTrip({
  id: "1",
  name: "Go",
  location: "Paris",
  startTime: "2026-08-24",
  endTime: "2026-08-23",
}) !== null, "date-only end before start invalid");
assert(validateItem({ id: "i", name: "X", category: "C", type: "PACK", stage: "MID", defaultCount: 1 }) === null, "valid item");
assert(validateItem({ id: "i", name: "X", category: "C", type: "PACK", stage: "MID", defaultCount: 0 }) !== null, "count < 1");
assert(validateTripItem({ tripId: "t", itemId: "i", count: 2, isSelected: true, isPacked: false }) === null, "valid trip item");

// --- Router paths ---
assert(normalizePath("/trips/abc/") === "/trips/abc", "normalize trailing slash");
assert(normalizePath("/index.html") === "/", "normalize index.html");
assert(pathFor({ name: "home" }) === "/packer", "path home");
assert(pathFor({ name: "create-trip" }) === "/packer/new", "path create");
assert(pathFor({ name: "packing", tripId: "trip_1" }) === "/packer/trips/trip_1", "path packing");
assert(pathFor({ name: "item-selection", tripId: "trip_1" }) === "/packer/trips/trip_1/items", "path items");
assert(pathFor({ name: "edit-trip", tripId: "trip_1" }) === "/packer/trips/trip_1/edit", "path edit");
assert(pathFor({ name: "clone-trip", tripId: "trip_1" }) === "/packer/trips/trip_1/clone", "path clone");
assert(routeFromPath("/packer").name === "home", "parse home");
assert(routeFromPath("/packer/new").name === "create-trip", "parse create");
assert(routeFromPath("/packer/trips/trip_1").name === "packing", "parse packing");
assert((routeFromPath("/packer/trips/trip_1") as { tripId: string }).tripId === "trip_1", "parse packing id");
assert(routeFromPath("/packer/trips/trip_1/items").name === "item-selection", "parse items");
assert(routeFromPath("/packer/trips/trip_1/edit").name === "edit-trip", "parse edit");
assert(routeFromPath("/packer/trips/trip_1/clone").name === "clone-trip", "parse clone");
assert(routeFromPath("/nope").name === "home", "unknown path → home");
assert(isKnownPath("/packer/trips/abc/items") === true, "known items path");
assert(isKnownPath("/packer/trips/abc/clone") === true, "known clone path");
assert(isKnownPath("/nope") === false, "unknown path not known");
assert(isKnownPath("/") === false, "root without basename not known");
assert(pathFor(routeFromPath("/packer/trips/a%2Fb/items")) === "/packer/trips/a%2Fb/items", "encode round-trip");

const jacket: Item = {
  id: "j", name: "Jacket", category: "Clothing", subcategory: "Essentials",
  type: "PACK", stage: "MID", defaultCount: 1,
  travellers: ["man", "woman"], types: ["Essentials"], weathers: ["cold", "snowy"],
};
const swim: Item = {
  id: "s", name: "Swimwear", category: "Clothing", subcategory: "Beach",
  type: "PACK", stage: "MID", defaultCount: 1,
  travellers: ["man", "woman"], types: ["Beach", "Swimming"],
};
const tee: Item = {
  id: "t", name: "T-Shirts", category: "Clothing", subcategory: "Essentials",
  type: "PACK", stage: "EARLY", defaultCount: 1,
  travellers: ["man", "woman"], types: ["Essentials"],
};
const defaultTrip: Trip = {
  id: "1", name: "Go", location: "Paris", startTime: "2026-08-24",
  travellers: ["man", "woman"], vehicles: ["other transport"], weathers: ["pleasant-weather"], types: ["Essentials", "other transport"],
};
const beachTrip: Trip = { ...defaultTrip, types: ["Beach", "other transport"], weathers: ["hot"] };
assert(itemMatchesTrip(tee, defaultTrip) === true, "essentials item matches default trip");
assert(itemMatchesTrip(jacket, defaultTrip) === false, "cold jacket excluded from pleasant trip");
assert(itemMatchesTrip(swim, defaultTrip) === false, "beach item excluded from essentials-only trip");
assert(itemMatchesTrip(swim, beachTrip) === true, "beach item matches beach trip");
assert(displayCategory(swim) === "Beach", "displayCategory uses subcategory");
assert(displayCategory(tee) === "Essentials", "displayCategory falls back to subcategory/category");
assert(displayCategory({ ...tee, subcategory: undefined }) === "Clothing", "displayCategory falls back to category");

// Trip-aware displayCategory: only surface a tag-driven subcategory (e.g.
// "Beach") when the trip actually selected that tag — otherwise fall back
// to the broader category so unrelated tabs don't appear in the picker.
assert(displayCategory(swim, defaultTrip) === "Clothing", "unselected tag-driven subcategory falls back to category");
assert(displayCategory(swim, beachTrip) === "Beach", "selected tag-driven subcategory is kept");
assert(displayCategory(tee, defaultTrip) === "Essentials", "non-tag-driven (generic) subcategory always shown");

assert(isDateOnly("2026-08-24") === true, "date-only flag");
assert(isDateOnly("2026-08-24T10:00:00.000Z") === false, "iso not date-only");
assert(combineDateAndTime("2026-08-24", "") === "2026-08-24", "omit time stores date-only");
assert(combineDateAndTime("2026-08-24", "10:00").includes("T"), "time produces datetime");
assert(toDateInputValue("2026-08-24") === "2026-08-24", "date input from date-only");
assert(toTimeInputValue("2026-08-24") === "", "time input empty for date-only");
assert(snapToQuarterHour("10:07") === "10:00", "quarter snap down");
assert(snapToQuarterHour("10:08") === "10:15", "quarter snap up");
assert(snapToQuarterHour("23:53") === "00:00", "quarter snap wraps midnight");
assert(hhmmToClockParts("00:00")?.hour === "12" && hhmmToClockParts("00:00")?.period === "AM", "midnight is 12 AM");
assert(hhmmToClockParts("12:00")?.hour === "12" && hhmmToClockParts("12:00")?.period === "PM", "noon is 12 PM");
assert(hhmmToClockParts("13:15")?.hour === "1" && hhmmToClockParts("13:15")?.period === "PM", "1:15 PM");
assert(clockPartsToHhmm("12", "00", "AM") === "00:00", "12 AM is 00:00");
assert(clockPartsToHhmm("12", "00", "PM") === "12:00", "12 PM is 12:00");
assert(clockPartsToHhmm("1", "15", "PM") === "13:15", "1 PM is 13:15");
const localMs = parseTripInstant("2026-08-24");
assert(!Number.isNaN(localMs) && new Date(localMs).getHours() === 0, "date-only is local midnight");

const nameTrips: Trip[] = [{ id: "a", name: "Paris", location: "FR", startTime: "2026-08-24" }];
assert(isTripNameTaken("paris", nameTrips) === true, "name unique is case-insensitive");
assert(isTripNameTaken("Paris", nameTrips, "a") === false, "exclude self on edit");
assert(uniqueCloneName("Paris", nameTrips) === "Paris copy", "clone name suffix");
assert(uniqueCloneName("Paris", [...nameTrips, { id: "b", name: "Paris copy", location: "FR", startTime: "2026-08-24" }]) === "Paris copy 2", "clone name increments");

// --- Catalog last_updated / merge ---
assert(isCatalogNewer("2026-08-26T00:00:00.000Z", undefined) === true, "missing local catalog date refreshes");
assert(isCatalogNewer("2026-08-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z") === true, "newer server catalog refreshes");
assert(isCatalogNewer("2026-08-25T00:00:00.000Z", "2026-08-25T00:00:00.000Z") === false, "same catalog date keeps IndexedDB");
assert(isCatalogNewer("2026-08-24T00:00:00.000Z", "2026-08-25T00:00:00.000Z") === false, "older server catalog is ignored");
assert(isCatalogNewer("not-a-date", "2026-08-25T00:00:00.000Z") === false, "invalid server date does not refresh");

const parsed = parseCatalogFile({
  last_updated: "2026-08-25T15:30:00.000Z",
  items: [
    { id: "i_ok", name: "Ok", category: "C", type: "PACK", stage: "MID", defaultCount: 1 },
    { id: "bad", name: "", category: "C", type: "PACK", stage: "MID", defaultCount: 1 },
  ],
});
assert(parsed.items.length === 1 && parsed.items[0].id === "i_ok", "parseCatalogFile keeps valid items only");
let parseThrew = false;
try {
  parseCatalogFile({ last_updated: "2026-08-25T15:30:00.000Z", items: [] });
} catch {
  parseThrew = true;
}
assert(parseThrew, "empty catalog file is rejected");
assert(
  validateItem({ id: 1 as unknown as string, name: "X", category: "C", type: "PACK", stage: "MID", defaultCount: 1 }) === "Item id is required.",
  "numeric catalog id is invalid without throwing"
);
assert(
  parseCatalogFile({
    default: {
      last_updated: "2026-08-25T15:30:00.000Z",
      items: [{ id: "i_ok", name: "Ok", category: "C", type: "PACK", stage: "MID", defaultCount: 1 }],
    },
  }).items[0].id === "i_ok",
  "parseCatalogFile unwraps JSON module default"
);

const catalogItem = (id: string): Item => ({
  id, name: id, category: "C", type: "PACK", stage: "MID", defaultCount: 1,
});
const merged = mergeCatalogItems(
  [catalogItem("i_old"), catalogItem("custom_keep"), catalogItem("i_packed_gone")],
  [catalogItem("i_new"), catalogItem("i_old")],
  new Set(["i_packed_gone"])
);
assert(merged.toPut.some((i) => i.id === "i_new"), "merge upserts new server items");
assert(merged.toPut.some((i) => i.id === "custom_keep"), "merge keeps custom items");
assert(merged.toPut.some((i) => i.id === "i_packed_gone"), "merge keeps catalog items still used on a trip");
assert(merged.toDelete.includes("i_old") === false, "merge does not delete ids still on the server");
assert(merged.toDelete.length === 0, "merge deletes only unreferenced removed catalog ids");
const dropped = mergeCatalogItems(
  [catalogItem("i_unused_old")],
  [catalogItem("i_new")],
  new Set()
);
assert(dropped.toDelete.includes("i_unused_old"), "unreferenced removed catalog ids are deleted");

assert(typeAndStageForV1Category("ToDos").type === "TODO" && typeAndStageForV1Category("ToDos").stage === "EARLY", "ToDos → TODO/EARLY");
assert(typeAndStageForV1Category("Documents").type === "CARRY", "Documents → CARRY");
assert(typeAndStageForV1Category("Documants").type === "CARRY", "Documants typo → Documents CARRY");
assert(typeAndStageForV1Category("Clothing").stage === "EARLY", "Clothing → EARLY");
assert(typeAndStageForV1Category("Hygiene").stage === "MID" && typeAndStageForV1Category("Health").type === "PACK", "Hygiene/Health → PACK/MID");
assert(typeAndStageForV1Category("Gadgets").type === "PACK" && typeAndStageForV1Category("Gadgets").stage === "MID", "other categories → PACK/MID");

const ported = parseCatalogFile(catalogFile);
assert(ported.items.length === 669, "ported catalog has 669 items");
assert(ported.items[0].id === "1" && ported.items[0].name === "Buy present", "first v1 item id 1");
assert(ported.items.some((i) => i.id === "669" && i.name === "Glasses"), "last v1 item id 669");
assert(ported.items.filter((i) => i.category === "Documents").every((i) => i.type === "CARRY"), "Documents are CARRY");
assert(ported.items.filter((i) => i.category === "Documants").length === 0, "Documants category is normalised");

const mk = (partial: Partial<Item> & Pick<Item, "id" | "name">): Item => ({
  category: "C", type: "PACK", stage: "MID", defaultCount: 1, travellers: ["man", "woman"], ...partial,
});
const v1Catalog = [
  mk({ id: "434", name: "Toothbrush" }),
  mk({ id: "537", name: "Polo Shirts" }),
  mk({ id: "586", name: "Pants", travellers: ["baby"] }),
];
const legacyItems = [
  mk({ id: "i_toothbrush", name: "Toothbrush" }),
  mk({ id: "i_tshirts", name: "T-Shirts" }),
  mk({ id: "i_pants", name: "Pants" }),
  mk({ id: "i_mystery", name: "Unobtainium Widget" }),
];
const legacyTrip: TripItem[] = [
  { tripId: "t1", itemId: "i_toothbrush", count: 2, isSelected: true, isPacked: true },
  { tripId: "t1", itemId: "i_pants", count: 1, isSelected: true, isPacked: false },
  { tripId: "t1", itemId: "i_mystery", count: 1, isSelected: true, isPacked: true },
];
const remapped = remapLegacyBaseItems(legacyItems, legacyTrip, v1Catalog);
assert(remapped.remapped, "legacy i_* remap runs");
assert(remapped.tripItemsToPut.some((r) => r.itemId === "434" && r.isPacked && r.count === 2), "matched name rewrites trip item id");
assert(remapped.itemIdsToDelete.includes("i_toothbrush"), "matched placeholder item is dropped");
assert(remapped.itemsToPut.some((i) => i.id === "custom_i_pants"), "baby-only name match stays custom");
assert(!remapped.itemsToPut.some((i) => i.id === "custom_i_tshirts"), "T-Shirts aliases onto Polo Shirts");
assert(remapped.itemIdsToDelete.includes("i_tshirts"), "T-Shirts placeholder is dropped");
assert(remapped.itemsToPut.some((i) => i.id === "custom_i_mystery"), "unmatched i_* becomes custom");
assert(remapped.tripItemsToPut.some((r) => r.itemId === "custom_i_mystery" && r.isPacked), "unmatched packed state is kept on custom id");
assert(remapLegacyBaseItems([mk({ id: "434", name: "Toothbrush" })], [], v1Catalog).remapped === false, "numeric catalog ids are not remapped");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
