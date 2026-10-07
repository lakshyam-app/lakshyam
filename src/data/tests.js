/* Saving tests: start, auto-save while answering, submit, discard, delete.
   An unfinished test is an attempt with status "in_progress" and a `run`
   (question order, answers, guesses, time per question, time left). */
import * as store from "./store.js";
import { newId } from "./ids.js";
import { DEFAULT_MARKING } from "../domain/scoring.js";
import { gradeTest, autoDifficulty, isGradable, AUTO_DIFF_DEFAULT, validThresholds, planAutoDifficulty } from "../domain/testing.js";
import { takeSnapshot } from "./snapshots.js";
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
      const level = autoDifficulty(r.timeMs, autoTimes());
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
    activity: { put: [{ ...act, count: (act.count || 0) + 1, questions: (act.questions || 0) + answered, correct: (act.correct || 0) + (graded.counts.correct || 0) }] }
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

/* ---------- automatic difficulty times ---------- */

/** The times you set (seconds), or the defaults 26 / 50. */
export function autoTimes() {
  const th = store.setting("autoDifficulty", null);
  return validThresholds(th) ? { medium: Number(th.medium), hard: Number(th.hard) } : { ...AUTO_DIFF_DEFAULT };
}

/** What re-marking past tests with these times would change (nothing is saved). */
export function previewAutoDifficulty(th) {
  const attempts = store.all("attempts").filter((a) => a.status === "submitted");
  return planAutoDifficulty(attempts, (id) => store.questionState(id), (id) => store.question(id)?.difficultyHint || null, th);
}

/** Saves the times; with past = true also re-marks past tests. Returns an undo function. */
export async function saveAutoTimes(th, { past = false } = {}) {
  const value = { medium: Number(th.medium), hard: Number(th.hard) };
  if (!validThresholds(value)) throw new Error("bad-times");
  if (!past) { await store.setSetting("autoDifficulty", value); return null; }
  const before = store.setting("autoDifficulty", null);
  const { changes } = previewAutoDifficulty(value);
  await takeSnapshot("difficulty");
  const byQ = new Map(changes.map((c) => [c.questionId, c]));
  const prevStates = []; const created = []; const states = [];
  changes.forEach((c) => {
    const st = store.questionState(c.questionId);
    if (st) prevStates.push({ ...st }); else created.push(c.questionId);
    states.push({ ...(st || { id: c.questionId, questionId: c.questionId, flagged: false }), difficulty: c.to, difficultySource: "auto" });
  });
  // Answers in past tests carry the difficulty they had; update the automatic ones too.
  const prevAttempts = []; const attempts = [];
  store.all("attempts").filter((a) => a.status === "submitted").forEach((a) => {
    let touched = false;
    const answers = a.answers.map((r) => {
      const c = byQ.get(r.questionId);
      if (!c || (r.difficulty && r.difficulty !== c.from)) return r;
      touched = true;
      return { ...r, difficulty: c.to };
    });
    if (touched) { prevAttempts.push(a); attempts.push({ ...a, answers }); }
  });
  await store.apply({ settings: { put: [{ id: "autoDifficulty", value }] }, questionState: { put: states }, attempts: { put: attempts } });
  return () => store.apply({
    questionState: { put: prevStates, delete: created },
    attempts: { put: prevAttempts },
    settings: before ? { put: [{ id: "autoDifficulty", value: before }] } : { delete: ["autoDifficulty"] }
  });
}
