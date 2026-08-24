/**
 * Ranked fuzzy search.
 * Higher score = better match. 0 = no match.
 *
 * Scoring:
 *  - substring include
 *  - word prefix
 *  - sequential character match (query chars in order, with gap penalty)
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fuzzyScore(haystack: string, query: string): number {
  const text = haystack.toLowerCase();
  const q = normalizeQuery(query);
  if (!q) return 1;
  if (!text) return 0;

  if (text === q) return 200;
  const idx = text.indexOf(q);
  if (idx === 0) return 160 + Math.min(20, text.length);
  if (idx > 0) return 120 - Math.min(idx, 40);

  const words = text.split(/[\s/_-]+/);
  if (words.some((w) => w.startsWith(q))) return 110;

  const qWords = q.split(" ");
  if (qWords.length > 1 && qWords.every((w) => text.includes(w))) return 90;

  // sequential character match
  let ti = 0;
  let gaps = 0;
  let consecutive = 0;
  let maxConsec = 0;
  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (ch === " ") continue;
    const found = text.indexOf(ch, ti);
    if (found === -1) return 0;
    if (found === ti) consecutive++;
    else {
      consecutive = 1;
      gaps += found - ti;
    }
    maxConsec = Math.max(maxConsec, consecutive);
    ti = found + 1;
  }
  const coverage = q.replace(/ /g, "").length / Math.max(text.length, 1);
  return Math.max(1, Math.round(40 + maxConsec * 6 - gaps * 0.5 + coverage * 20));
}

export function fuzzySearchByText<T>(
  items: T[],
  query: string,
  getTexts: (item: T) => string[]
): T[] {
  const q = normalizeQuery(query);
  if (!q) return items;

  const ranked = items
    .map((item) => {
      const score = Math.max(0, ...getTexts(item).map((t) => fuzzyScore(t || "", q)));
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.map((r) => r.item);
}
