/* Repeated questions for the cards and the "Most repeated" sort, worked out once per data change. */
import * as store from "./store.js";
import { repeatGroups, ruleFor } from "../domain/repeats.js";
import { examYear } from "../domain/current.js";

/** Map questionId → the ids of the same question in other papers (this one included). Past papers only. */
export const repeatIndex = () => store.derived("repeats", () => repeatGroups(store.all("questions").filter((q) => q.source !== "ai" && q.status !== "deleted_by_psc")));

/** The same question's other places: [{ q, paper, year }], oldest first; [] when it wasn't asked again. */
export function repeatsOf(questionId) {
  const ids = repeatIndex().get(questionId);
  if (!ids) return [];
  return ids.map((id) => store.question(id)).filter(Boolean).map((q) => { const paper = store.paper(q.paperId); return { q, paper, year: examYear(paper?.name) }; })
    .sort((a, b) => (a.year || 0) - (b.year || 0));
}

/** In how many different papers it was asked (1 when it wasn't repeated). */
export function timesAsked(questionId) {
  const ids = repeatIndex().get(questionId);
  if (!ids) return 1;
  return new Set(ids.map((id) => store.question(id)?.paperId).filter(Boolean)).size || 1;
}

/** Groups at a chosen likeness (see domain/repeats.js LEVELS), built once per data change and level. */
const groupsAt = (level) => (level === "std" ? repeatIndex() : store.derived(`repeats:${level}`, () => repeatGroups(store.all("questions").filter((q) => q.source !== "ai" && q.status !== "deleted_by_psc"), ruleFor(level))));
const sylOf = (q) => store.paper(q.paperId)?.syllabusId || null;

/**
 * 1.27 / 1.27.2 · Questions asked again, one per group (its newest asking in this syllabus), most-asked first.
 * other: null → asked in 2+ papers of THIS syllabus; a syllabus id → asked in this syllabus and in that one;
 *        "all" → asked in this syllabus and in any other. level: how alike the wording must be ("std", 50…100).
 * → [{ q, times (different papers among the places), places: [{ q, paper, year, syllabusId }] (oldest first) }]
 */
export function repeatedQuestions(syllabusId, { other = null, level = "std", subjectId = null } = {}) {
  const idx = groupsAt(level);
  const seen = new Set(); const out = [];
  const yearOf = (q) => examYear(store.paper(q.paperId)?.name) || 0;
  const wanted = (sid) => sid === syllabusId || (other === "all" ? Boolean(sid) : other ? sid === other : false);
  // At a chosen %, each question has its own group (itself and those alike enough to it): the biggest go first and
  // a question already shown in one isn't shown again. At "Usual", a group is shared by all its questions.
  const mine = store.questionsFor({ syllabusId, subjectId }).filter((q) => idx.has(q.id))
    .sort((a, b) => idx.get(b.id).length - idx.get(a.id).length);
  mine.forEach((q) => {
    const ids = idx.get(q.id);
    if (seen.has(q.id)) return;
    const members = ids.map((id) => store.question(id)).filter(Boolean).filter((x) => wanted(sylOf(x)));
    const here = members.filter((x) => sylOf(x) === syllabusId);
    if (!here.length) return;
    if (other && !members.some((x) => sylOf(x) !== syllabusId)) return; // must also be in the other syllabus
    const times = new Set(members.map((x) => x.paperId)).size;
    if (times < 2) return;
    const places = members.map((x) => { const paper = store.paper(x.paperId); return { q: x, paper, year: examYear(paper?.name), syllabusId: paper?.syllabusId || null }; })
      .sort((a, b) => (a.year || 0) - (b.year || 0));
    const rep = here.filter((x) => !seen.has(x.id)).sort((a, b) => yearOf(b) - yearOf(a))[0] || q; // never one already shown
    members.forEach((x) => seen.add(x.id));
    out.push({ q: rep, times, places });
  });
  return out.sort((a, b) => b.times - a.times || yearOf(b.q) - yearOf(a.q));
}
