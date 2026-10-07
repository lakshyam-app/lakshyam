/* Exam countdowns: up to MAX_EXAMS exams, each with a date (and optional start time),
   an optional link to a syllabus, and what Today shows. Pure: no storage, no screen code. */
import { examMoment } from "./habits.js";

export const MAX_EXAMS = 20;
export const LAYOUTS = ["featured", "big", "tiles", "list"];
export const MODES = ["next", "chosen"];
export const COUNTS = [1, 2, 3, 4, 6, 10];
export const DEFAULT_DISPLAY = { mode: "next", count: 1, layout: "featured", ids: [] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD (no 31 Feb, no month 13). */
export function realDate(s) {
  if (!DATE.test(String(s || ""))) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** A clean exam record, or null if it can't be used (bad date, wrong shape). */
export function normalizeExam(x) {
  if (!x || typeof x !== "object" || !realDate(x.date)) return null;
  return {
    id: typeof x.id === "string" && x.id ? x.id.slice(0, 60) : `exam:${x.date}:${String(x.name || "").slice(0, 20)}`,
    name: String(x.name || "").trim().slice(0, 80),
    date: x.date,
    time: TIME.test(String(x.time || "")) && Number(x.time.split(":")[0]) < 24 && Number(x.time.split(":")[1]) < 60 ? x.time : "",
    syllabusId: typeof x.syllabusId === "string" && x.syllabusId ? x.syllabusId : null
  };
}

export function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map(normalizeExam).filter((e) => e && !seen.has(e.id) && seen.add(e.id)).slice(0, MAX_EXAMS);
}

export function normalizeDisplay(d) {
  const x = d && typeof d === "object" ? d : {};
  return {
    mode: MODES.includes(x.mode) ? x.mode : DEFAULT_DISPLAY.mode,
    count: COUNTS.includes(Number(x.count)) ? Number(x.count) : DEFAULT_DISPLAY.count,
    layout: LAYOUTS.includes(x.layout) ? x.layout : DEFAULT_DISPLAY.layout,
    ids: Array.isArray(x.ids) ? x.ids.filter((id) => typeof id === "string").slice(0, MAX_EXAMS) : []
  };
}

/** When the countdown reaches zero (start time, or the start of the day). */
export const examStart = (e) => examMoment(e.date, e.time);

/** The end of the exam day: until then the exam still shows (as "today"). */
export function examDayEnd(e) {
  const d = examMoment(e.date);
  return d === null ? null : new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate() + 1).getTime();
}

export const isOver = (e, now = Date.now()) => now >= examDayEnd(e);

export const byDate = (a, b) => examStart(a) - examStart(b) || a.name.localeCompare(b.name);

export const upcoming = (list, now = Date.now()) => list.filter((e) => !isOver(e, now)).sort(byDate);
export const finished = (list, now = Date.now()) => list.filter((e) => isOver(e, now)).sort((a, b) => byDate(b, a));

/** The exams Today shows, in date order. */
export function forToday(list, display, now = Date.now()) {
  const d = normalizeDisplay(display);
  const next = upcoming(list, now);
  if (d.mode === "chosen") return next.filter((e) => d.ids.includes(e.id));
  return next.slice(0, d.count);
}

/** The nearest exam for a syllabus (or, if none is linked to it, the nearest of any). */
export function nearestFor(list, syllabusId, now = Date.now()) {
  const next = upcoming(list, now);
  return next.find((e) => e.syllabusId === syllabusId) || next.find((e) => !e.syllabusId) || null;
}

/** Exams saved on syllabuses before 1.3 (one per syllabus). */
export function legacyExams(syllabi) {
  return normalizeList((syllabi || []).filter((s) => s?.exam?.date).map((s) => ({ id: `exam:${s.id}`, name: s.exam.name || s.name, date: s.exam.date, time: s.exam.time, syllabusId: s.id })));
}
