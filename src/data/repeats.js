/* Repeated questions for the cards and the "Most repeated" sort, worked out once per data change. */
import * as store from "./store.js";
import { repeatGroups } from "../domain/repeats.js";
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
