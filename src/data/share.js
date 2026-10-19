/* 1.26 · Share papers with another phone (e.g. the second user's).
   The file holds only question papers: syllabuses (names and marking), subjects and topics (with Malayalam
   names), papers, and their questions with answer keys and explanations. Never tests, diary, notes,
   screen time, banks, flags, studied counts, settings, AI keys or AI-made questions.
   Adding a file on the other phone only ADDS what isn't there yet: nothing already on that phone is
   changed or replaced. Same-named syllabuses are matched, so papers land in the one you already have. */
import * as store from "./store.js";
import { checksum } from "./backup.js";
import { APP_VERSION } from "../core/version.js";
import { nameKey } from "./ids.js";

export const PAPERS_FORMAT = "lakshyam-papers";
const STORES = ["syllabi", "subjects", "topics", "papers", "questions"];
// Fields that are about the person, not the paper: left out of a shared question.
const PERSONAL_Q = ["topicMovedByUser", "updatedAt", "createdAt"];

export const isPapersPack = (json) => Boolean(json && typeof json === "object" && json.format === PAPERS_FORMAT);

/** The file for the chosen syllabuses (past papers only, not AI-made ones). */
export function makePapersPack(syllabusIds) {
  const want = new Set(syllabusIds);
  const syllabi = store.syllabi().filter((s) => want.has(s.id)).map((s) => ({ id: s.id, name: s.name, marking: s.marking, pattern: s.pattern ?? null, stage: s.stage ?? null, order: s.order ?? 0 }));
  const papers = store.all("papers").filter((p) => want.has(p.syllabusId) && (p.kind || "pyq") === "pyq").map((p) => ({ ...p }));
  const paperIds = new Set(papers.map((p) => p.id));
  const questions = store.all("questions").filter((q) => paperIds.has(q.paperId) && q.source !== "ai").map((q) => {
    const c = { ...q }; PERSONAL_Q.forEach((k) => delete c[k]); return c;
  });
  const subjectIds = new Set(questions.map((q) => q.subjectId));
  const subjects = store.all("subjects").filter((s) => subjectIds.has(s.id)).map((s) => ({ ...s }));
  const topics = store.all("topics").filter((x) => subjectIds.has(x.subjectId)).map((x) => ({ ...x }));
  const data = { syllabi, subjects, topics, papers, questions };
  return {
    format: PAPERS_FORMAT, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(STORES.map((k) => [k, data[k].length])), checksum: checksum(JSON.stringify(data)), data
  };
}

/** Checks a shared file. → { ok, error?, data, damaged } */
export function readPapersPack(json) {
  if (!isPapersPack(json)) return { ok: false, error: "not-papers" };
  if (!json.data || typeof json.data !== "object") return { ok: false, error: "damaged" };
  const data = {};
  for (const k of STORES) {
    const seen = new Set();
    data[k] = (Array.isArray(json.data[k]) ? json.data[k] : []).filter((r) => r && typeof r === "object" && typeof r.id === "string" && !seen.has(r.id) && seen.add(r.id));
  }
  // Questions must look like questions (text and at least 2 options); papers need a syllabus in the file.
  data.questions = data.questions.filter((q) => typeof q.text === "string" && Array.isArray(q.options) && q.options.length >= 2 && typeof q.paperId === "string");
  const syl = new Set(data.syllabi.map((s) => s.id));
  data.papers = data.papers.filter((p) => syl.has(p.syllabusId));
  const damaged = checksum(JSON.stringify(Object.fromEntries(STORES.map((k) => [k, json.data[k] || []])))) !== json.checksum;
  return { ok: true, data, damaged };
}

/**
 * What adding the file would do on this phone (pure: `have` gives this phone's records).
 * have: { syllabi: [...], ids: { subjects:Set, topics:Set, papers:Set, questions:Set } }
 * → { add: { syllabi, subjects, topics, papers, questions }, already: { papers }, mappedSyllabi }
 */
export function planPapersAdd(data, have) {
  const byName = new Map(have.syllabi.map((s) => [nameKey(s.name), s.id]));
  const haveSyl = new Set(have.syllabi.map((s) => s.id));
  const sylMap = new Map(); const newSyllabi = [];
  data.syllabi.forEach((s) => {
    if (haveSyl.has(s.id)) sylMap.set(s.id, s.id);
    else if (byName.has(nameKey(s.name))) sylMap.set(s.id, byName.get(nameKey(s.name)));
    else { sylMap.set(s.id, s.id); newSyllabi.push(s); }
  });
  const papers = data.papers.filter((p) => !have.ids.papers.has(p.id)).map((p) => ({ ...p, syllabusId: sylMap.get(p.syllabusId) }));
  const newPaperIds = new Set(papers.map((p) => p.id));
  const questions = data.questions.filter((q) => newPaperIds.has(q.paperId) && !have.ids.questions.has(q.id));
  const usedSubjects = new Set(questions.map((q) => q.subjectId));
  const subjects = data.subjects.filter((s) => usedSubjects.has(s.id) && !have.ids.subjects.has(s.id));
  const topics = data.topics.filter((x) => usedSubjects.has(x.subjectId) && !have.ids.topics.has(x.id));
  return {
    add: { syllabi: newSyllabi.filter((s) => papers.some((p) => p.syllabusId === s.id)), subjects, topics, papers, questions },
    already: { papers: data.papers.length - papers.length },
    mappedSyllabi: [...sylMap.entries()].filter(([a, b]) => a !== b).length
  };
}

/** This phone's records, for planPapersAdd. */
export function thisPhone() {
  const set = (name) => new Set(store.all(name).map((r) => r.id));
  return { syllabi: store.syllabi(), ids: { subjects: set("subjects"), topics: set("topics"), papers: set("papers"), questions: set("questions") } };
}

/** Saves the plan in one go (nothing on this phone is overwritten: only new records are written). */
export async function addPapers(plan) {
  const changes = {};
  STORES.forEach((k) => { if (plan.add[k].length) changes[k] = { put: plan.add[k].map((r) => ({ ...r })) }; });
  // A paper's question count, as the app keeps it on the paper.
  (changes.papers?.put || []).forEach((p) => { p.questionCount = plan.add.questions.filter((q) => q.paperId === p.id).length || p.questionCount || 0; });
  await store.apply(changes);
}
