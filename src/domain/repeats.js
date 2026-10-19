/* Questions PSC asked again (1.26): nearly the same question in more than one paper.
   Compared within a subject (a repeat is often filed under a different topic, e.g. "Other"),
   with the same rule the AI strategy uses: ≥ 70% of the words shared, or ≥ 50% with the same answer.
   A word index keeps it fast: only questions that share uncommon words are compared. Pure. */

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC")
  .replace(/\$[^$]*\$/g, " ").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").replace(/\s+/g, " ").trim();
const wordsOf = (s) => [...new Set(norm(s).split(" ").filter((w) => w.length > 2))];
const answerOf = (q) => (Number.isInteger(q.answerIndex) && q.options?.[q.answerIndex] !== undefined ? norm(q.options[q.answerIndex]) : "");

export const SAME = 0.7;      // words shared (Jaccard) for "the same question"
export const SAME_ANSWER = 0.5; // … or this much with the same answer

/**
 * questions: [{ id, text, options, answerIndex, subjectId, paperId }].
 * Returns Map(questionId → [ids of the group, this one included]) for questions asked in 2+ different papers.
 */
export function repeatGroups(questions) {
  const bySubject = new Map();
  questions.forEach((q) => { const k = q.subjectId || "?"; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(q); });
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const list of bySubject.values()) {
    const items = list.map((q) => ({ q, w: wordsOf(q.text), a: answerOf(q) })).filter((x) => x.w.length >= 3);
    items.forEach((x) => parent.set(x.q.id, x.q.id));
    // word → items that have it (very common words — in over a quarter of the subject — are skipped)
    const index = new Map();
    items.forEach((x, i) => x.w.forEach((w) => { if (!index.has(w)) index.set(w, []); index.get(w).push(i); }));
    const tooCommon = Math.max(8, items.length / 4);
    items.forEach((x, i) => {
      const shared = new Map();
      x.w.forEach((w) => { const l = index.get(w); if (l.length > tooCommon) return; l.forEach((j) => { if (j > i) shared.set(j, (shared.get(j) || 0) + 1); }); });
      shared.forEach((n, j) => {
        const y = items[j];
        if (x.q.paperId === y.q.paperId) return; // the same paper: not "asked again"
        const jac = n / (x.w.length + y.w.length - n);
        if (jac >= SAME || (jac >= SAME_ANSWER && x.a && x.a === y.a)) join(x.q.id, y.q.id);
      });
    });
  }
  const groups = new Map();
  parent.forEach((_, id) => { const r = find(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); });
  const out = new Map();
  groups.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => out.set(id, ids)); });
  return out;
}
