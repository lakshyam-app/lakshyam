/* Mistake review from your saved tests (see domain/review.js). The only thing saved is
   "stop reviewing this one" (questionState.reviewOffAt); everything else is worked out. */
import * as store from "./store.js";
import { answerRecords } from "../domain/stats.js";
import { mistakeQueue, dueIds } from "../domain/review.js";
import { isGradable } from "../domain/testing.js";
import { localDate } from "../domain/study.js";

let memo = { key: "", queue: new Map() };

export function reviewQueue(syllabusId) {
  const attempts = store.attemptsOf(syllabusId).filter((a) => a.status !== "in_progress");
  const offs = store.all("questionState").filter((s) => s.reviewOffAt);
  const key = `${syllabusId}|${attempts.length}|${attempts.reduce((m, a) => Math.max(m, a.submittedAt || 0), 0)}|${offs.map((s) => s.reviewOffAt).join(",")}|${store.all("questions").length}`;
  if (memo.key === key) return memo.queue;
  const offAt = new Map(offs.map((s) => [s.questionId || s.id, s.reviewOffAt]));
  const queue = mistakeQueue(answerRecords(attempts), offAt);
  for (const id of [...queue.keys()]) { const q = store.question(id); if (!q || !isGradable(q)) queue.delete(id); }
  memo = { key, queue };
  return queue;
}

export const dueMistakeIds = (syllabusId, today = localDate()) => dueIds(reviewQueue(syllabusId), today);
export const dueMistakes = (syllabusId, today) => dueMistakeIds(syllabusId, today).map((id) => store.question(id)).filter(Boolean);
export const inReview = (syllabusId, questionId) => reviewQueue(syllabusId).get(questionId) || null;

/** "I know this now": stop reviewing until you get it wrong again. */
export function stopReviewing(questionId) {
  const st = store.questionState(questionId) || { id: questionId, questionId, flagged: false };
  return store.apply({ questionState: { put: [{ ...st, reviewOffAt: Date.now() }] } });
}
