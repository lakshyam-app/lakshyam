/* Malayalam names: checking a names file and working out what it would change.
   Pure (no database, no screen), so it is unit-tested.

   File format (also what "Export names" writes):
   { "subjects": [ { "name": "Indian Constitution", "name_ml": "ഇന്ത്യൻ ഭരണഘടന", "status": "official",
       "topics": [ { "name": "Fundamental Rights", "name_ml": "മൗലികാവകാശങ്ങൾ" } ] } ] }
   "id" may be given instead of (or as well as) "name". status: "official" | "review".
   Matching: by ID, else by English name ignoring case, spaces and punctuation
   (old names you renamed from still match). A topic is matched inside its subject. */
import { nameKey } from "./ids.js";

export const STATUSES = ["official", "review"];
const MAX_LEN = 200;
const HAS_ML = /[ഀ-ൿ]/;

/** Trims and removes control characters; null if empty or too long. */
export function cleanMl(s) {
  if (typeof s !== "string") return null;
  const v = s.normalize("NFC").replace(/[\u0000-\u001F\u007F​﻿]/g, " ").replace(/\s+/g, " ").trim();
  return v && v.length <= MAX_LEN ? v : null;
}

const keysOf = (rec) => new Set([rec.key, nameKey(rec.name), ...(rec.aliasKeys || [])].filter(Boolean));

function finder(records) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const byKey = new Map();
  records.forEach((r) => keysOf(r).forEach((k) => { if (!byKey.has(k)) byKey.set(k, r); }));
  return (entry) => (entry.id && byId.get(entry.id)) || (entry.name && byKey.get(nameKey(entry.name))) || null;
}

/** Checks the file's shape. → { ok, error?, entries: [{ kind, entry, parent? }] } */
export function readNamesFile(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.subjects)) return { ok: false, error: "no-subjects", entries: [] };
  const entries = [];
  json.subjects.forEach((s) => {
    if (!s || typeof s !== "object") return;
    entries.push({ kind: "subject", entry: s });
    (Array.isArray(s.topics) ? s.topics : []).forEach((tp) => { if (tp && typeof tp === "object") entries.push({ kind: "topic", entry: tp, parent: s }); });
  });
  if (!entries.length) return { ok: false, error: "empty", entries };
  return { ok: true, entries };
}

/**
 * Works out the changes. opts: { replace: overwrite Malayalam names you already have,
 * official: mark everything imported as checked (otherwise the file's status, or "review") }.
 * → { subjects: [updated records], topics: [...], report }
 */
export function planNames(json, subjects, topics, { replace = false, official = false } = {}) {
  const file = readNamesFile(json);
  const report = { ok: file.ok, error: file.error || null, total: 0, filled: 0, replaced: 0, same: 0, kept: [], notFound: [], invalid: [], statusOnly: 0 };
  const out = { subjects: new Map(), topics: new Map() };
  if (!file.ok) return { subjects: [], topics: [], report };
  const findSubject = finder(subjects);
  const topicFinders = new Map();
  const findTopic = (subjectId, entry) => {
    if (!topicFinders.has(subjectId)) topicFinders.set(subjectId, finder(topics.filter((x) => x.subjectId === subjectId)));
    return topicFinders.get(subjectId)(entry);
  };
  const byIdTopic = new Map(topics.map((x) => [x.id, x]));

  file.entries.forEach(({ kind, entry, parent }) => {
    const v = cleanMl(entry.name_ml ?? entry.nameMl);
    if (v === null && (entry.name_ml ?? entry.nameMl) === undefined) return; // no Malayalam given: nothing to do
    report.total++;
    const label = parent ? `${parent.name || parent.id || "?"} › ${entry.name || entry.id || "?"}` : String(entry.name || entry.id || "?");
    if (v === null || !HAS_ML.test(v)) { report.invalid.push(label); return; }
    let rec;
    if (kind === "subject") rec = findSubject(entry);
    else {
      const sub = findSubject(parent);
      rec = (entry.id && byIdTopic.get(entry.id)) || (sub ? findTopic(sub.id, entry) : null);
    }
    if (!rec) { report.notFound.push(label); return; }
    const pool = kind === "subject" ? out.subjects : out.topics;
    const cur = pool.get(rec.id) || rec;
    const status = official ? "official" : STATUSES.includes(entry.status) ? entry.status : "review";
    const have = String(cur.nameMl || "").trim();
    if (have && have === v) {
      if ((cur.nameMlStatus || "review") !== status && (official || entry.status)) { pool.set(rec.id, { ...cur, nameMlStatus: status }); report.statusOnly++; }
      else report.same++;
      return;
    }
    if (have && !replace) { report.kept.push({ name: rec.name, have, file: v }); return; }
    if (have) report.replaced++; else report.filled++;
    pool.set(rec.id, { ...cur, nameMl: v, nameMlStatus: status });
  });
  return { subjects: [...out.subjects.values()], topics: [...out.topics.values()], report };
}

/** Your names in the same file format (only subjects/topics that have a Malayalam name). */
export function exportNames(subjects, topics) {
  const entry = (r) => ({ name: r.name, name_ml: r.nameMl, status: r.nameMlStatus || "review" });
  return {
    subjects: subjects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)).map((s) => {
      const tps = topics.filter((x) => x.subjectId === s.id && x.nameMl).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(entry);
      if (!s.nameMl && !tps.length) return null;
      return { name: s.name, ...(s.nameMl ? { name_ml: s.nameMl, status: s.nameMlStatus || "review" } : {}), topics: tps };
    }).filter(Boolean)
  };
}
