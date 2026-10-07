/* The one place screens get data from (repository layer).
   Everything is loaded into memory at start-up for speed; writes go to
   IndexedDB first, then the in-memory copy is refreshed and listeners are told.
   Later a cloud-sync adapter can sit behind these same functions. */
import * as db from "./db.js";
import { BACKUP_STORES } from "./schema.js";

const cache = Object.fromEntries(BACKUP_STORES.map((name) => [name, new Map()]));
const listeners = new Set();
let indexes = null;

/* ---------- loading ---------- */

export async function load() {
  const all = await Promise.all(BACKUP_STORES.map((name) => db.getAll(name)));
  BACKUP_STORES.forEach((name, i) => {
    cache[name] = new Map(all[i].map((record) => [record.id, record]));
  });
  indexes = null;
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let muted = 0;
function notify() { indexes = null; if (!muted) listeners.forEach((fn) => fn()); }

/** Redraws the screen after a series of quiet changes. */
export function touch() { notify(); }

/** Runs a change without redrawing the screen (the caller updates the part it changed). */
export async function quietly(fn) {
  muted++;
  try { return await fn(); } finally { muted--; indexes = null; }
}

/** The single write path for everyday edits (used by mutations.js).
    changes = { storeName: { put?: [records], delete?: [ids] } } — one transaction.
    Records are stamped with updatedAt. */
export async function apply(changes, { silent = false } = {}) {
  const now = Date.now();
  Object.values(changes).forEach((c) => (c.put || []).forEach((r) => { r.updatedAt = now; r.createdAt ??= now; }));
  await db.writeAll(changes);
  Object.entries(changes).forEach(([name, c]) => {
    (c.delete || []).forEach((id) => cache[name].delete(id));
    (c.put || []).forEach((r) => cache[name].set(r.id, r));
  });
  if (!silent) notify();
}

/** Read-only list of every record in a store (for mutations and search). */
export const all = (storeName) => [...cache[storeName].values()];
export const byId = (storeName, id) => cache[storeName].get(id);

/** Builds look-up tables once per data change. */
function idx() {
  if (indexes) return indexes;
  const questionsByPaper = new Map();
  const questionsByTopic = new Map();
  cache.questions.forEach((q) => {
    pushTo(questionsByPaper, q.paperId, q);
    pushTo(questionsByTopic, q.topicId, q);
  });
  questionsByPaper.forEach((list) => list.sort((a, b) => a.order - b.order));
  const topicsBySubject = new Map();
  cache.topics.forEach((t) => pushTo(topicsBySubject, t.subjectId, t));
  topicsBySubject.forEach((list) => list.sort((a, b) => a.order - b.order));
  indexes = { questionsByPaper, questionsByTopic, topicsBySubject };
  return indexes;
}

function pushTo(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

/* ---------- reads ---------- */

export const isEmpty = () => cache.questions.size === 0 && cache.papers.size === 0;

export function setting(id, fallback = null) {
  const record = cache.settings.get(id);
  return record ? record.value : fallback;
}

export async function setSetting(id, value) {
  const record = { id, value };
  await db.put("settings", record);
  cache.settings.set(id, record);
  notify();
}

export const syllabi = () => [...cache.syllabi.values()].sort((a, b) => a.order - b.order);

export function currentSyllabus() {
  const id = setting("currentSyllabusId");
  return cache.syllabi.get(id) || syllabi()[0] || null;
}

export const subject = (id) => cache.subjects.get(id);
export const topic = (id) => cache.topics.get(id);
export const paper = (id) => cache.papers.get(id);
export const question = (id) => cache.questions.get(id);
export const questionState = (id) => cache.questionState.get(id);
export const topicsOf = (subjectId) => idx().topicsBySubject.get(subjectId) || [];
export const questionsOfPaper = (paperId) => idx().questionsByPaper.get(paperId) || [];

/** Papers of one syllabus. kind: "pyq" (default), "ai" or null for all. */
export function papersOf(syllabusId, kind = "pyq") {
  return [...cache.papers.values()]
    .filter((p) => p.syllabusId === syllabusId && (!kind || p.kind === kind))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Questions in a syllabus, optionally narrowed to a subject or topic.
    source "pyq" leaves out AI questions (they are always kept separate). */
export function questionsFor({ syllabusId, subjectId = null, topicId = null, source = "pyq" }) {
  const paperIds = new Set(papersOf(syllabusId, null).map((p) => p.id));
  const pool = topicId ? (idx().questionsByTopic.get(topicId) || []) : cache.questions.values();
  const out = [];
  for (const q of pool) {
    if (!paperIds.has(q.paperId)) continue;
    if (source && q.source !== source && !(source === "pyq" && q.source === "personal")) continue;
    if (subjectId && q.subjectId !== subjectId) continue;
    out.push(q);
  }
  return out;
}

/** Subjects with their question counts in a syllabus (PYQs only), most used first. */
export function subjectsWithCounts(syllabusId) {
  const counts = new Map();
  questionsFor({ syllabusId }).forEach((q) => counts.set(q.subjectId, (counts.get(q.subjectId) || 0) + 1));
  return [...counts.entries()]
    .map(([id, n]) => ({ subject: cache.subjects.get(id), count: n }))
    .filter((x) => x.subject)
    .sort((a, b) => a.subject.order - b.subject.order || a.subject.name.localeCompare(b.subject.name));
}

/** Topics with question counts in a syllabus; subjectId narrows to one subject. */
export function topicsWithCounts(syllabusId, subjectId = null) {
  const counts = new Map();
  questionsFor({ syllabusId, subjectId }).forEach((q) => counts.set(q.topicId, (counts.get(q.topicId) || 0) + 1));
  return [...counts.entries()]
    .map(([id, n]) => ({ topic: cache.topics.get(id), count: n }))
    .filter((x) => x.topic)
    .map((x) => ({ ...x, subject: cache.subjects.get(x.topic.subjectId) }));
}

export function topicStateFor(syllabusId, topicId) {
  return cache.topicState.get(`ts:${syllabusId}|${topicId}`) || null;
}

export function attemptsOf(syllabusId) {
  return [...cache.attempts.values()].filter((a) => a.syllabusId === syllabusId);
}

/** Record counts for every backed-up store. */
export function counts() {
  return Object.fromEntries(BACKUP_STORES.map((name) => [name, cache[name].size]));
}

/** Everything that goes into a backup, as plain arrays. */
export function exportRecords() {
  return Object.fromEntries(BACKUP_STORES.map((name) => [name, [...cache[name].values()]]));
}

/* ---------- bulk writes (import / restore) ---------- */

/** mode "replace": wipe the backed-up stores first. mode "merge": update matching
    IDs and keep everything else. One transaction: all or nothing. */
const DEVICE_SETTINGS = ["appLang", "theme"];

export async function commitRecords(records, mode) {
  const changes = {};
  BACKUP_STORES.forEach((name) => {
    let put = records[name] || [];
    // On merge, never overwrite the user's current settings (e.g. chosen syllabus).
    if (mode === "merge" && name === "settings") put = put.filter((r) => !cache.settings.has(r.id));
    // This phone's own choices (app language) survive a replace unless the file has them.
    if (mode === "replace" && name === "settings") {
      const keep = DEVICE_SETTINGS.map((id) => cache.settings.get(id)).filter((r) => r && !put.some((x) => x.id === r.id));
      put = [...put, ...keep];
    }
    if (mode === "replace" || put.length) changes[name] = { clear: mode === "replace", put };
  });
  await db.writeAll(changes);
  await load();
  notify();
}

/** Re-reads counts straight from the database and compares them with what
    the plan said would be there. */
export async function verifyAgainst(expectedCounts, mode, checks = null) {
  const rows = [];
  for (const name of BACKUP_STORES) {
    if (!(name in expectedCounts)) continue;
    const found = await db.count(name);
    const expected = expectedCounts[name];
    // After a merge the store may also hold older records, so "at least" is correct.
    const ok = mode === "merge" ? found >= expected : found === expected;
    rows.push({ name, expected, found, ok });
  }
  if (checks?.questionsPerPaper) {
    let wrongPapers = 0;
    for (const [paperId, n] of Object.entries(checks.questionsPerPaper)) {
      const found = await db.countByIndex("questions", "paperId", paperId);
      if (mode === "merge" ? found < n : found !== n) wrongPapers++;
    }
    rows.push({ name: "questionsPerPaper", expected: 0, found: wrongPapers, ok: wrongPapers === 0 });
  }
  if (checks && typeof checks.attemptNetTotal === "number" && mode === "replace") {
    const attempts = await db.getAll("attempts");
    const total = Math.round(attempts.reduce((n, a) => n + (a.netScore || 0), 0) * 100) / 100;
    rows.push({ name: "attemptNetTotal", expected: checks.attemptNetTotal, found: total, ok: Math.abs(total - checks.attemptNetTotal) < 0.011 });
  }
  return { ok: rows.every((r) => r.ok), rows };
}

export async function eraseEverything() {
  await db.deleteDatabase();
  BACKUP_STORES.forEach((name) => cache[name].clear());
  notify();
}
