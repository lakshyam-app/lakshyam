/* Saving timetables and what you did each day.
   Stores: "timetables" (your plans; status "active" | "saved" | "draft") and
   "ttLog" (one record per timetable per date: block status, topics studied, "running late").
   Both are in backups. Ticking a topic in a block also counts it as studied
   (the same as "Studied +1" on the topic page), so streaks and reviews stay in step. */
import * as store from "./store.js";
import { newId } from "./ids.js";
import { addStudied } from "./mutations.js";
import { isoDate, addDays, clampEnd } from "../domain/timetable.js";

export const ttId = () => newId("tt");
export const blockId = () => newId("b");
export const planId = () => newId("dp");

export const timetables = (syllabusId) => store.all("timetables").filter((x) => !syllabusId || x.syllabusId === syllabusId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
export const activeTimetable = (syllabusId) => timetables(syllabusId).find((x) => x.status === "active") || null;
export const getTimetable = (id) => store.byId("timetables", id) || null;

/** A new, empty timetable: one plan, every day, for 30 days. */
export function blankTimetable(syllabusId, name) {
  const p = { id: planId(), name: "Every day", blocks: [] };
  const start = isoDate();
  return { id: ttId(), syllabusId, name, status: "draft", startDate: start, endDate: clampEnd(start, addDays(start, 30)), dayPlans: [p], schedule: { mode: "daily", daily: p.id }, overrides: {} };
}

export function saveTimetable(tt, { quiet = false } = {}) {
  const fixed = { ...tt, endDate: clampEnd(tt.startDate, tt.endDate) };
  const run = () => store.apply({ timetables: { put: [fixed] } });
  return quiet ? store.quietly(run) : run();
}

/** Makes this the timetable you follow (the previous one is kept, as "saved"). */
export async function activate(tt) {
  const others = timetables(tt.syllabusId).filter((x) => x.id !== tt.id && x.status === "active").map((x) => ({ ...x, status: "saved" }));
  await store.apply({ timetables: { put: [...others, { ...tt, status: "active", endDate: clampEnd(tt.startDate, tt.endDate) }] } });
}

export async function deleteTimetable(tt) {
  const logs = store.all("ttLog").filter((l) => l.ttId === tt.id);
  await store.apply({ timetables: { delete: [tt.id] }, ttLog: { delete: logs.map((l) => l.id) } });
  return { timetables: [tt], ttLog: logs };
}

/* ---------- the day's record ---------- */

const logId = (tid, date) => `ttlog:${tid}:${date}`;
export const dayLog = (tid, date) => store.byId("ttLog", logId(tid, date)) || { id: logId(tid, date), ttId: tid, date, blocks: {}, shift: null };

function putLog(log) { return store.quietly(() => store.apply({ ttLog: { put: [log] } })); }

/** status: "done" | "skipped" | null (clears). */
export function setBlockStatus(tid, date, bid, status) {
  const log = dayLog(tid, date);
  const b = { ...(log.blocks[bid] || { topicIds: [] }), status, at: Date.now() };
  return putLog({ ...log, blocks: { ...log.blocks, [bid]: b } });
}

/** Ticks / unticks a topic studied in a block (also Studied +1 / −1 on the topic). */
export async function toggleTopic(tt, date, bid, topicId, on) {
  const log = dayLog(tt.id, date);
  const b = { ...(log.blocks[bid] || { topicIds: [] }) };
  const has = (b.topicIds || []).includes(topicId);
  if (on === has) return;
  b.topicIds = on ? [...(b.topicIds || []), topicId] : b.topicIds.filter((x) => x !== topicId);
  if (on && !b.status) b.status = "done";
  b.at = Date.now();
  await putLog({ ...log, blocks: { ...log.blocks, [bid]: b } });
  await store.quietly(() => addStudied(tt.syllabusId, topicId, on ? 1 : -1));
}

/** "Running late": today's blocks from `from` (minutes) move by `by` minutes. 0 clears. */
export function setShift(tid, date, from, by) {
  const log = dayLog(tid, date);
  return store.apply({ ttLog: { put: [{ ...log, shift: by ? { from: log.shift ? Math.min(log.shift.from, from) : from, by: (log.shift?.by || 0) + by } : null }] } });
}

/** Topics ticked in this timetable between two dates (for "studied this week"). */
export function studiedBetween(tid, from, to) {
  const out = new Set();
  store.all("ttLog").filter((l) => l.ttId === tid && l.date >= from && l.date <= to)
    .forEach((l) => Object.values(l.blocks || {}).forEach((b) => (b.topicIds || []).forEach((x) => out.add(x))));
  return out;
}
