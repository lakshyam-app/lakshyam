/* Collects what the Progress screens need, following your Progress settings:
   PYQ or AI questions, period (all / 7 / 30 / 90 days), counting basis, and
   "start fresh" (tests before that moment are left out but kept in history). */
import * as store from "../../data/store.js";
import { answerRecords } from "../../domain/stats.js";
import { difficultyOf } from "../question/card.js";

export const PERIODS = ["all", "7", "30", "90"];
const DAY = 86400000;

export const prefs = () => ({
  mode: store.setting("statsMode", "pyq") === "ai" ? "ai" : "pyq",
  period: PERIODS.includes(String(store.setting("statsPeriod", "all"))) ? String(store.setting("statsPeriod", "all")) : "all",
  basis: ["first", "latest", "all"].includes(store.setting("statsBasis")) ? store.setting("statsBasis") : "first",
  resetAt: Number(store.setting("statsResetAt", 0)) || 0
});

export function finishedTests(syllabusId) {
  return store.attemptsOf(syllabusId).filter((a) => a.status !== "in_progress");
}

/** Everything for one syllabus. scope (optional): { subjectId } or { topicId } narrows the records. */
export function statsContext(syllabus, { now = Date.now(), scope = null } = {}) {
  const p = prefs();
  const isAi = p.mode === "ai";
  const base = finishedTests(syllabus.id).filter((a) => (a.kind === "ai") === isAi && a.submittedAt >= p.resetAt);
  const from = p.period === "all" ? 0 : now - Number(p.period) * DAY;
  const prevFrom = p.period === "all" ? null : from - Number(p.period) * DAY;
  const inScope = (r) => (!scope || (scope.subjectId ? r.subjectId === scope.subjectId : r.topicId === scope.topicId));

  // Each answer carries the difficulty it had in the test, else the question's current one.
  const fill = (recs) => recs.filter(inScope).map((r) => {
    if (r.difficulty) return r;
    const q = store.question(r.questionId);
    return q ? { ...r, difficulty: difficultyOf(q) } : r;
  });
  const attempts = base.filter((a) => a.submittedAt >= from);
  const prevAttempts = prevFrom === null ? [] : base.filter((a) => a.submittedAt >= prevFrom && a.submittedAt < from);

  const questions = store.questionsFor({ syllabusId: syllabus.id, source: isAi ? "ai" : "pyq" })
    .filter((q) => !scope || (scope.subjectId ? q.subjectId === scope.subjectId : q.topicId === scope.topicId));
  const countByTopic = new Map(); const countBySubject = new Map();
  questions.forEach((q) => {
    countByTopic.set(q.topicId, (countByTopic.get(q.topicId) || 0) + 1);
    countBySubject.set(q.subjectId, (countBySubject.get(q.subjectId) || 0) + 1);
  });

  return {
    ...p, syllabus, now, marking: syllabus.marking,
    attempts, prevAttempts, allAttempts: base,
    records: fill(answerRecords(attempts)),
    prevRecords: fill(answerRecords(prevAttempts)),
    allRecords: fill(answerRecords(base)),
    questions, countByTopic, countBySubject
  };
}
