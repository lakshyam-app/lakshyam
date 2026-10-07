/* Exam countdowns are kept in the "exams" setting (so they are in backups), and what
   Today shows in "examDisplay". Before 1.3 each syllabus held one exam; those are read
   as the list until the first change, which moves them here and clears the old field. */
import * as store from "./store.js";
import { normalizeList, normalizeDisplay, legacyExams, MAX_EXAMS, normalizeExam } from "../domain/exams.js";

export const migrated = () => Array.isArray(store.setting("exams"));

export function allExams() {
  return migrated() ? normalizeList(store.setting("exams")) : legacyExams(store.syllabi());
}

export const displayPrefs = () => normalizeDisplay(store.setting("examDisplay"));

async function writeList(list) {
  const settings = { put: [{ id: "exams", value: normalizeList(list) }] };
  if (migrated()) return store.apply({ settings });
  // First change: move the old per-syllabus exams over in the same write.
  const old = store.syllabi().filter((s) => s.exam);
  return store.apply({ settings, syllabi: { put: old.map((s) => ({ ...s, exam: null })) } });
}

/** Adds or replaces one exam. Returns false if the list is full. */
export async function saveExam(exam) {
  const clean = normalizeExam(exam);
  if (!clean) return false;
  const list = allExams();
  const i = list.findIndex((e) => e.id === clean.id);
  if (i < 0 && list.length >= MAX_EXAMS) return false;
  if (i < 0) list.push(clean); else list[i] = clean;
  await writeList(list);
  return true;
}

export async function deleteExams(ids) {
  const gone = new Set(ids);
  const d = displayPrefs();
  await writeList(allExams().filter((e) => !gone.has(e.id)));
  if (d.ids.some((id) => gone.has(id))) await setDisplay({ ids: d.ids.filter((id) => !gone.has(id)) });
}

export const setDisplay = (patch) => store.setSetting("examDisplay", normalizeDisplay({ ...displayPrefs(), ...patch }));

export const newExamId = () => `exam:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
