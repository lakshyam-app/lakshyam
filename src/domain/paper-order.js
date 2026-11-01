/* 1.27 · The order of your papers in Library → Papers: by year, then paper code, until you drag them into your own order.
   Pure (unit-tested in tests/paper-order.test.mjs). */
import { examYear } from "./current.js";

/** The paper code: the number before "/year" ("060/2023" → 60, "15_060/2023-M" → 60); null if none. */
export function paperCode(name) {
  const m = /(\d+)\s*\/\s*(?:\d{4}|\d{2})(?!\d)/.exec(String(name || ""));
  return m ? Number(m[1]) : null;
}

/** Oldest year first, then the lower code, then the name (papers without a year last). */
export function byYearAndCode(a, b) {
  const ya = examYear(a.name) ?? 9999; const yb = examYear(b.name) ?? 9999;
  if (ya !== yb) return ya - yb;
  const ca = paperCode(a.name) ?? Infinity; const cb = paperCode(b.name) ?? Infinity;
  if (ca !== cb) return ca - cb;
  return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
}

/**
 * Your saved order (paper ids) applied to the papers: papers you placed keep their places; a paper added since
 * goes where the year-and-code order puts it among them; ids of papers no longer there are dropped.
 */
export function arrangePapers(papers, saved) {
  const byYear = papers.slice().sort(byYearAndCode);
  if (!Array.isArray(saved) || !saved.length) return byYear;
  const byId = new Map(papers.map((p) => [p.id, p]));
  const out = saved.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const placed = new Set(out.map((p) => p.id));
  byYear.filter((p) => !placed.has(p.id)).forEach((p) => {
    const at = out.findIndex((x) => byYearAndCode(p, x) < 0);
    if (at < 0) out.push(p); else out.splice(at, 0, p);
  });
  return out;
}
