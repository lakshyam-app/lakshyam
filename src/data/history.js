/* Your record with each question across all your tests (1.26), for the question cards:
   "Your tries: ✗ 5 Oct · ✓ 12 Oct", and "stubborn" questions you keep missing.
   Blanks you never opened aren't tries. Built once per data change (store.derived). */
import * as store from "./store.js";
import { notOpened } from "../domain/stats.js";

/** Missed this many times (and still not right) = a stubborn question: worth a memory trick. */
export const STUBBORN = 3;

/** Map questionId → your tries, oldest first: [{ at, right, blank, guessed }]. */
export function answerHistory() {
  return store.derived("answerHistory", () => {
    const m = new Map();
    store.all("attempts").filter((a) => a.status === "submitted")
      .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
      .forEach((a) => (a.answers || []).forEach((r) => {
        if (!r.graded || notOpened(r, a)) return;
        const list = m.get(r.questionId) || [];
        list.push({ at: a.submittedAt, right: Boolean(r.isCorrect), blank: r.selected === null || r.selected === undefined, guessed: Boolean(r.guessed) });
        m.set(r.questionId, list);
      }));
    return m;
  });
}

export const triesOf = (questionId) => answerHistory().get(questionId) || [];

/** How many times you answered it wrong (blanks aren't counted). */
export const missedTimes = (tries) => tries.filter((x) => !x.right && !x.blank).length;

/** Wrong STUBBORN times or more, and not right on the last try. */
export const isStubborn = (tries) => missedTimes(tries) >= STUBBORN && !tries.at(-1)?.right;
