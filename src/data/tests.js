/* Saving tests: start, auto-save while answering, submit, discard, delete.
   An unfinished test is an attempt with status "in_progress" and a `run`
   (question order, answers, guesses, time per question, time left). */
import * as store from "./store.js";
import { newId } from "./ids.js";
import { DEFAULT_MARKING } from "../domain/scoring.js";
import { gradeTest, autoDifficulty, isGradable } from "../domain/testing.js";
import { localDate } from "../domain/study.js";

/** The unfinished test, if any (only one at a time). */
export function activeTest() {
  return store.all("attempts").find((a) => a.status === "in_progress") || null;
}

/**
 * spec: { syllabusId, scope: { type, ref, label }, questionIds, timerMinutes|null, layout }
 */
export async function startTest(spec) {
  const syllabus = store.syllabi().find((s) => s.id === spec.syllabusId);
  const questions = spec.questionIds.map((id) => store.question(id)).filter(Boolean);
  const attempt = {
    id: newId("att"), syllabusId: spec.syllabusId,
    kind: questions.length && questions.every((q) => q.source === "ai") ? "ai" : "pyq",
    scope: spec.scope, status: "in_progress",
    startedAt: Date.now(), submittedAt: null,
    marking: { ...(syllabus?.marking || DEFAULT_MARKING) }, markingWasRecorded: true,
    timerMinutes: spec.timerMinutes || null, autoSubmitted: false, layout: spec.layout || "single",
    counts: null, netScore: null, answers: [],
    run: {
      questionIds: questions.map((q) => q.id), answers: {}, guesses: {}, timeSpent: {}, index: 0,
      remainingMs: spec.timerMinutes ? spec.timerMinutes * 60000 : null, paused: false
    }
  };
  await store.quietly(() => store.apply({ attempts: { put: [attempt] } }));
  return attempt;
}

/** Saves progress without redrawing the screen. */
export function saveRun(attempt, run) {
  return store.quietly(() => store.apply({ attempts: { put: [{ ...attempt, run: structuredClone(run) }] } }));
}

export function discardTest(attempt) {
  return store.apply({ attempts: { delete: [attempt.id] } });
}

/** Grades and saves. Also sets automatic difficulty from your time (if that's on) and today's activity. */
export async function submitTest(attempt, run, { auto = false } = {}) {
  const questions = run.questionIds.map((id) => store.question(id)).filter(Boolean);
  const diffOn = store.setting("difficultyEnabled", true) !== false;
  const diffOf = (q) => store.questionState(q.id)?.difficulty || q.difficultyHint || null;
  const graded = gradeTest(questions, run, attempt.marking, diffOf);

  const states = [];
  if (diffOn) {
    graded.answers.forEach((r) => {
      if (r.selected === null || !r.timeMs) return;
      const q = store.question(r.questionId);
      const st = store.questionState(r.questionId);
      if (st?.difficulty || st?.difficultySource === "manual" || q.difficultyHint) return;
      const level = autoDifficulty(r.timeMs);
      states.push({ ...(st || { id: q.id, questionId: q.id, flagged: false }), difficulty: level, difficultySource: "auto" });
      r.difficulty = level;
    });
  }
  const answered = graded.answers.filter((r) => r.selected !== null).length;
  const day = localDate();
  const act = store.byId("activity", day) || { id: day, date: day, count: 0 };
  const done = {
    ...attempt, status: "submitted", submittedAt: Date.now(), autoSubmitted: auto,
    answers: graded.answers, counts: graded.counts, netScore: graded.netScore,
    layout: attempt.layout, run: undefined
  };
  delete done.run;
  await store.quietly(() => store.apply({
    attempts: { put: [done] },
    questionState: { put: states },
    activity: { put: [{ ...act, count: (act.count || 0) + 1, questions: (act.questions || 0) + answered }] }
  }));
  return done;
}

/** Same questions again, as a new test with the same settings. onlyIds narrows it (e.g. the wrong ones). */
export function retake(attempt, { onlyIds = null, label = null } = {}) {
  const ids = (onlyIds || attempt.answers.map((r) => r.questionId)).filter((id) => {
    const q = store.question(id);
    return q && isGradable(q);
  });
  return startTest({
    syllabusId: attempt.syllabusId,
    scope: label ? { type: "review", ref: attempt.id, label } : attempt.scope,
    questionIds: ids,
    timerMinutes: attempt.timerMinutes ? Math.max(1, Math.round(attempt.timerMinutes * ids.length / Math.max(1, attempt.answers.length))) : null,
    layout: attempt.layout || "single"
  });
}

/** Deletes one finished test; returns it for Undo. */
export async function deleteAttempt(attempt) {
  await store.apply({ attempts: { delete: [attempt.id] } });
  return attempt;
}
export const restoreAttempt = (attempt) => store.apply({ attempts: { put: [{ ...attempt }] } });
