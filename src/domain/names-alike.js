/* Subject or topic names that look like the same thing (1.26), e.g. "Important Acts General Acts" and
   "Important Acts – General": the same words once case, dashes, "&"/"and" and repeats are ignored,
   or nearly the same words (≥ 75% shared). Pure. */

const STOP = new Set(["and", "the", "of", "in", "a", "an"]);
export const wordsOfName = (name) => new Set(String(name || "").toLowerCase().normalize("NFC").replace(/&/g, " and ")
  .replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)));

export function nameSimilarity(a, b) {
  const A = wordsOfName(a); const B = wordsOfName(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

/** records: [{ id, name }] → pairs [a, b] that look alike (best matches first). */
export function lookAlikePairs(records, min = 0.75) {
  const out = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const s = nameSimilarity(records[i].name, records[j].name);
      if (s >= min) out.push({ a: records[i], b: records[j], s });
    }
  }
  return out.sort((x, y) => y.s - x.s);
}
