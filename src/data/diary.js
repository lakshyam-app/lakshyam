/* Study diary data: what happened on a day (from your tests, ticked topics and timetable),
   your own review of the day, and saved weekly / monthly reports.
   Store "diary" (in backups): "day:YYYY-MM-DD" { mood 1–5, note, tags }, "report:week:<monday>" / "report:month:YYYY-MM". */
import * as store from "./store.js";
import * as T from "../domain/timetable.js";
import { timetables, dayLog } from "./timetable.js";

const DEFAULT_GOAL = 30;
const goal = () => Math.max(1, Number(store.setting("dailyGoal", DEFAULT_GOAL)) || DEFAULT_GOAL);
const FOCUS = new Set(["study", "revision", "test"]);

export const review = (date) => store.byId("diary", `day:${date}`) || null;

/** The timetable that applied on a date: one with a record that day, else the one you follow. */
function timetableOn(syllabusId, date) {
  const list = timetables(syllabusId);
  return list.find((x) => store.byId("ttLog", `ttlog:${x.id}:${date}`)) || list.find((x) => x.status === "active" && T.planIdFor(x, date)) || null;
}

/** The plan's focus blocks that day, each with whether you did it. */
export function dayChecklist(syllabusId, date) {
  const x = timetableOn(syllabusId, date);
  if (!x) return { timetable: null, items: [] };
  const plan = T.planFor(x, date);
  if (!plan) return { timetable: x, items: [] };
  const log = dayLog(x.id, date);
  const blocks = T.sortBlocks(T.shiftBlocks(plan.blocks, log.shift)).filter((b) => FOCUS.has(b.kind));
  return {
    timetable: x,
    items: blocks.map((b) => {
      const rec = log.blocks[b.id] || {};
      const done = rec.status === "done" || (rec.topicIds?.length > 0 && rec.status !== "skipped");
      return { block: b, done, skipped: rec.status === "skipped", topicIds: rec.topicIds || [] };
    })
  };
}

export function dayFacts(syllabusId, date) {
  const act = store.byId("activity", date) || {};
  const list = dayChecklist(syllabusId, date);
  const r = review(date);
  return {
    planned: list.items.length,
    done: list.items.filter((i) => i.done).length,
    questions: act.questions || 0,
    correct: act.correct || 0,
    topics: new Set(act.topics || []).size,
    goal: goal(),
    mood: r?.mood || null
  };
}

export function saveReview(date, { mood, note, tags }) {
  const prev = review(date) || { id: `day:${date}`, kind: "day", date };
  return store.apply({ diary: { put: [{ ...prev, mood, note: String(note || "").slice(0, 2000), tags: (tags || []).slice(0, 12), at: Date.now() }] } });
}

export const reportId = (kind, key) => `report:${kind}:${key}`;
export const getReport = (kind, key) => store.byId("diary", reportId(kind, key)) || null;
export function saveReport(kind, key, data) {
  return store.quietly(() => store.apply({ diary: { put: [{ id: reportId(kind, key), kind: "report", period: kind, key, ...data, at: Date.now() }] } }));
}
