/**
 * One-shot (re-runnable) port of v1 items-data.tsx → src/data/catalog.json.
 * v1 is read-only; this script does not modify it.
 */
const fs = require("fs");
const path = require("path");

const V1_PATH = path.resolve(__dirname, "../../lido-pack-list/src/services/items-data.tsx");
const OUT_PATH = path.resolve(__dirname, "../src/data/catalog.json");

function canonicalCategory(category) {
  // v1 source typo
  if (category === "Documants") return "Documents";
  return category;
}

function typeAndStage(category) {
  if (category === "ToDos") return { type: "TODO", stage: "EARLY" };
  if (category === "Documents") return { type: "CARRY", stage: "LAST_MINUTE" };
  if (category === "Clothing") return { type: "PACK", stage: "EARLY" };
  if (category === "Hygiene" || category === "Health") return { type: "PACK", stage: "MID" };
  return { type: "PACK", stage: "MID" };
}

function mapItem(raw) {
  const category = canonicalCategory(String(raw.category || "").trim());
  const { type, stage } = typeAndStage(category);
  const item = {
    id: String(raw.id),
    name: String(raw.name || "").trim(),
    category,
    type,
    stage,
    defaultCount: raw.defaultCount >= 1 && Number.isFinite(raw.defaultCount) ? raw.defaultCount : 1,
  };
  if (raw.subcategory && String(raw.subcategory).trim()) {
    item.subcategory = String(raw.subcategory).trim();
  }
  if (Array.isArray(raw.types) && raw.types.length) item.types = [...raw.types];
  if (Array.isArray(raw.travellers) && raw.travellers.length) item.travellers = [...raw.travellers];
  if (Array.isArray(raw.weathers) && raw.weathers.length) item.weathers = [...raw.weathers];
  if (Array.isArray(raw.vehicles) && raw.vehicles.length) item.vehicles = [...raw.vehicles];
  return item;
}

function loadV1Items() {
  const src = fs.readFileSync(V1_PATH, "utf8");
  const start = src.indexOf("return [");
  const end = src.lastIndexOf("];");
  if (start < 0 || end < 0) throw new Error("Could not find items array in v1 items-data.tsx");
  const arrSrc = src.slice(start + "return ".length, end + 1);
  // items-data.tsx is a plain JS object literal (no TS types in the array).
  // eslint-disable-next-line no-eval
  const items = eval(arrSrc);
  if (!Array.isArray(items) || !items.length) throw new Error("v1 items array is empty");
  return items;
}

function main() {
  const raw = loadV1Items();
  const items = raw.map(mapItem);
  const ids = items.map((i) => i.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) throw new Error("Duplicate ids: " + [...new Set(dup)].join(", "));
  const missing = items.filter((i) => !i.id || !i.name || !i.category);
  if (missing.length) throw new Error("Items missing id/name/category: " + missing.length);

  const out = {
    last_updated: "2026-08-25T16:00:00.000Z",
    items,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");

  const cats = {};
  for (const item of items) cats[item.category] = (cats[item.category] || 0) + 1;
  console.log(`Wrote ${items.length} items to ${OUT_PATH}`);
  console.log("ids", items[0].id, "…", items[items.length - 1].id);
  console.log("categories", cats);
}

main();
