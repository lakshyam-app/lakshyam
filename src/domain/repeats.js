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

/** 1.27.2 · How alike the wording must be: "std" (the rule above) or at least 50 / 60 / 75 / 90 / 100 % of the words shared. */
export const LEVELS = ["std", 50, 60, 75, 90, 100];
export function ruleFor(level) {
  if (level === "std" || level === undefined || level === null) return { same: SAME, sameAnswer: SAME_ANSWER };
  const p = Math.max(0.3, Math.min(1, Number(level) / 100));
  return { same: p, sameAnswer: null, chain: false };
}

/** How alike two questions' wording is: the share of their distinct words (3+ letters) they have in common, 0–1. */
export function similarity(a, b) {
  const wa = new Set(wordsOf(a)); const wb = new Set(wordsOf(b));
  if (!wa.size || !wb.size) return 0;
  let n = 0; wa.forEach((w) => { if (wb.has(w)) n++; });
  return n / (wa.size + wb.size - n);
}

/**
 * questions: [{ id, text, options, answerIndex, subjectId, paperId }]. rule: { same, sameAnswer } (see ruleFor).
 * Returns Map(questionId → [ids of the group, this one included]) for questions asked in 2+ different papers.
 */
export function repeatGroups(questions, { same = SAME, sameAnswer = SAME_ANSWER, chain = true } = {}) {
  // chain: false (1.27.2, a chosen %): each question's group is itself and the questions alike enough to IT, so a
  // loose likeness can't string different questions together (A like B, B like C, but A not like C).
  const direct = chain ? null : new Map();
  const bySubject = new Map();
  questions.forEach((q) => { const k = q.subjectId || "?"; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(q); });
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const list of bySubject.values()) {
    const items = list.map((q) => { const w = wordsOf(q.text); return { q, w, set: new Set(w), a: answerOf(q) }; }).filter((x) => x.w.length >= 3);
    items.forEach((x) => parent.set(x.q.id, x.q.id));
    // word → items that have it. Only questions sharing an uncommon word (in at most a quarter of the subject) are
    // compared; the likeness itself is then worked out on all their words (1.27.2: exact, so "100 %" means the same words).
    const index = new Map();
    items.forEach((x, i) => x.w.forEach((w) => { if (!index.has(w)) index.set(w, []); index.get(w).push(i); }));
    const tooCommon = Math.max(8, items.length / 4);
    items.forEach((x, i) => {
      const cand = new Set();
      x.w.forEach((w) => { const l = index.get(w); if (l.length > tooCommon) return; l.forEach((j) => { if (j > i) cand.add(j); }); });
      cand.forEach((j) => {
        const y = items[j];
        if (x.q.paperId === y.q.paperId) return; // the same paper: not "asked again"
        // A quick bound first: two lists of very different length can't be alike enough.
        const lo = Math.min(x.w.length, y.w.length); const hi = Math.max(x.w.length, y.w.length);
        if (lo / hi < Math.min(same, sameAnswer ?? same)) return;
        let n = 0; x.w.forEach((w) => { if (y.set.has(w)) n++; });
        const jac = n / (x.w.length + y.w.length - n);
        if (!(jac >= same - 1e-9 || (sameAnswer !== null && jac >= sameAnswer && x.a && x.a === y.a))) return;
        if (chain) join(x.q.id, y.q.id);
        else { [[x, y], [y, x]].forEach(([u, v]) => { if (!direct.has(u.q.id)) direct.set(u.q.id, [u.q.id]); direct.get(u.q.id).push(v.q.id); }); }
      });
    });
  }
  if (!chain) return direct;
  const groups = new Map();
  parent.forEach((_, id) => { const r = find(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); });
  const out = new Map();
  groups.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => out.set(id, ids)); });
  return out;
}
