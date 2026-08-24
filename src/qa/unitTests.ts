import { getPhase, formatCountdown, parseTripInstant, isDateOnly, combineDateAndTime, toDateInputValue, toTimeInputValue } from "../utils/timeEngine";
import { fuzzyScore, fuzzySearchByText } from "../utils/search";
import { computeProgress, derivePackingState, sortTripItems } from "../utils/packingLogic";
import { validateItem, validateTrip, validateTripItem } from "../utils/validation";
import { Packable } from "../utils/packingLogic";
import { isKnownPath, pathFor, routeFromPath, normalizePath } from "../utils/routes";
import { displayCategory, itemMatchesTrip } from "../utils/tripFilter";
import { isTripNameTaken, uniqueCloneName } from "../utils/tripNames";
import { Item, Trip } from "../utils/types";

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

assert(isDateOnly("2026-08-24") === true, "date-only flag");
assert(isDateOnly("2026-08-24T10:00:00.000Z") === false, "iso not date-only");
assert(combineDateAndTime("2026-08-24", "") === "2026-08-24", "omit time stores date-only");
assert(combineDateAndTime("2026-08-24", "10:00").includes("T"), "time produces datetime");
assert(toDateInputValue("2026-08-24") === "2026-08-24", "date input from date-only");
assert(toTimeInputValue("2026-08-24") === "", "time input empty for date-only");
const localMs = parseTripInstant("2026-08-24");
assert(!Number.isNaN(localMs) && new Date(localMs).getHours() === 0, "date-only is local midnight");

const nameTrips: Trip[] = [{ id: "a", name: "Paris", location: "FR", startTime: "2026-08-24" }];
assert(isTripNameTaken("paris", nameTrips) === true, "name unique is case-insensitive");
assert(isTripNameTaken("Paris", nameTrips, "a") === false, "exclude self on edit");
assert(uniqueCloneName("Paris", nameTrips) === "Paris copy", "clone name suffix");
assert(uniqueCloneName("Paris", [...nameTrips, { id: "b", name: "Paris copy", location: "FR", startTime: "2026-08-24" }]) === "Paris copy 2", "clone name increments");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
