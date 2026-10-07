/* Every change the user makes goes through here. Each function builds the
   changed records as copies and saves them in one transaction via store.apply,
   so the screen never shows something that wasn't saved. */
import * as store from "./store.js";
import { ids, newId, nameKey } from "./ids.js";
import { FALLBACK_TOPIC } from "./taxonomy-seed.js";
import { buildPaperRecords, applyAnswerKey, applyExplanations, normText } from "./paper-json.js";
import { stepStudied, localDate } from "../domain/study.js";
import { takeSnapshot } from "./snapshots.js";

const copy = (r, patch = {}) => ({ ...r, ...patch });

/* ---------- question state (yours, separate from the question) ---------- */

function stateOf(questionId) {
  return store.questionState(questionId) || { id: questionId, questionId, flagged: false, difficulty: null, difficultySource: null };
}

export function setFlag(questionId, flagged) {
  return store.apply({ questionState: { put: [copy(stateOf(questionId), { flagged })] } });
}

export function setDifficulty(questionId, level) {
  // Any choice you make (even "no difficulty") stops automatic marking for this question.
  return store.apply({ questionState: { put: [copy(stateOf(questionId), { difficulty: level, difficultySource: "manual" })] } });
}

/* ---------- question content ---------- */

export function setAnswer(question, index) {
  const same = question.answerIndex === index && question.status === "active";
  return store.apply({ questions: { put: [copy(question, { answerIndex: same ? null : index, status: "active" })] } });
}

export function setDeletedByPsc(question, deleted) {
  return store.apply({ questions: { put: [copy(question, { status: deleted ? "deleted_by_psc" : "active", answerIndex: deleted ? null : question.answerIndex })] } });
}

export function updateQuestion(question, { text, options, explanation }) {
  const answerIndex = question.answerIndex !== null && question.answerIndex >= options.length ? null : question.answerIndex;
  return store.apply({ questions: { put: [copy(question, { text, options, explanation, answerIndex })] } });
}

export function moveQuestion(question, subjectId, topicId) {
  return store.apply({ questions: { put: [copy(question, { subjectId, topicId, topicMovedByUser: true })] } });
}

/** Removes questions; returns what's needed to undo. */
export async function deleteQuestions(questionIds) {
  const removed = questionIds.map((id) => store.question(id)).filter(Boolean);
  const states = questionIds.map((id) => store.questionState(id)).filter(Boolean);
  const papers = new Map();
  removed.forEach((q) => {
    const p = papers.get(q.paperId) || copy(store.paper(q.paperId));
    p.questionCount = Math.max(0, (p.questionCount || 0) - 1);
    papers.set(q.paperId, p);
  });
  await store.apply({
    questions: { delete: removed.map((q) => q.id) },
    questionState: { delete: states.map((s) => s.id) },
    papers: { put: [...papers.values()].filter((p) => p.id) }
  });
  return { questions: removed, questionState: states, papers: [...papers.keys()].map((id) => store.paper(id)).filter(Boolean) };
}

/** Puts back records removed earlier (used by Undo). */
export function restoreRecords(bundle) {
  const changes = {};
  Object.entries(bundle).forEach(([name, records]) => {
    if (records?.length) changes[name] = { put: records.map((r) => copy(r)) };
  });
  if (bundle.papers) {
    // recount after putting questions back
    changes.papers = { put: bundle.papers.map((p) => copy(p, { questionCount: p.questionCount + (bundle.questions || []).filter((q) => q.paperId === p.id).length })) };
  }
  return store.apply(changes);
}

/* ---------- studied counts, labels, lists, notes ---------- */

export function addStudied(syllabusId, topicId, delta) {
  const id = ids.topicState(syllabusId, topicId);
  const prev = store.byId("topicState", id);
  const next = { id, syllabusId, topicId, ...stepStudied(prev, delta) };
  const changes = { topicState: { put: [copy(prev || {}, next)] } };
  // Like the old app, marking a topic studied counts as activity for the streak.
  const day = localDate();
  const act = store.byId("activity", day) || { id: day, date: day, count: 0 };
  if (delta > 0) changes.activity = { put: [copy(act, { count: act.count + 1 })] };
  else if (act.count > 0) changes.activity = { put: [copy(act, { count: act.count - 1 })] };
  return store.apply(changes);
}

export function setLabel(syllabusId, topicId, label) {
  const id = ids.label(syllabusId, topicId);
  return label
    ? store.apply({ labels: { put: [{ id, syllabusId, topicId, name: label.name, color: label.color }] } })
    : store.apply({ labels: { delete: [id] } });
}

export async function createList(name, firstTopicId = null) {
  const list = { id: newId("list"), name: name.trim(), topicIds: firstTopicId ? [firstTopicId] : [] };
  await store.apply({ topicLists: { put: [list] } });
  return list;
}
export const renameList = (list, name) => store.apply({ topicLists: { put: [copy(list, { name: name.trim() })] } });
export const deleteList = (list) => store.apply({ topicLists: { delete: [list.id] } });
export function toggleTopicInList(list, topicId) {
  const has = list.topicIds.includes(topicId);
  return store.apply({ topicLists: { put: [copy(list, { topicIds: has ? list.topicIds.filter((x) => x !== topicId) : [...list.topicIds, topicId] })] } });
}

/** One note per listing. Empty text removes the note. */
export function saveNote(target, label, text) {
  const id = ids.note(target.type, target.id);
  const clean = String(text || "").trim();
  if (!clean) return store.apply({ notes: { delete: [id] } });
  const prev = store.byId("notes", id);
  return store.apply({ notes: { put: [copy(prev || {}, { id, target, label, text: clean })] } });
}

/* ---------- saved exam filters ---------- */

export async function saveTemplate(syllabusId, name, paperIds) {
  const tpl = { id: newId("tpl"), syllabusId, name: name.trim(), paperIds: [...paperIds] };
  await store.apply({ filterTemplates: { put: [tpl] } });
  return tpl;
}
export const deleteTemplate = (tpl) => store.apply({ filterTemplates: { delete: [tpl.id] } });

/* ---------- question banks ---------- */

export async function createBank(name) {
  const bank = { id: newId("bank"), name: name.trim(), kind: "user", questionIds: [] };
  await store.apply({ sets: { put: [bank] } });
  return bank;
}
export const renameBank = (bank, name) => store.apply({ sets: { put: [copy(bank, { name: name.trim() })] } });
export const deleteBank = (bank) => store.apply({ sets: { delete: [bank.id] } });
export function addToBank(bank, questionIds) {
  const merged = [...new Set([...bank.questionIds, ...questionIds])];
  return store.apply({ sets: { put: [copy(bank, { questionIds: merged })] } });
}
export function removeFromBank(bank, questionIds) {
  const drop = new Set(questionIds);
  return store.apply({ sets: { put: [copy(bank, { questionIds: bank.questionIds.filter((id) => !drop.has(id)) })] } });
}

/* ---------- papers ---------- */

export const renamePaper = (paper, name) => store.apply({ papers: { put: [copy(paper, { name: name.trim() })] } });
export const setPostName = (paper, postName) => store.apply({ papers: { put: [copy(paper, { postName: postName.trim() })] } });
export const movePaper = (paper, syllabusId) => store.apply({ papers: { put: [copy(paper, { syllabusId })] } });

export async function deletePaper(paper) {
  await takeSnapshot("delete");
  const questions = store.questionsOfPaper(paper.id);
  const states = questions.map((q) => store.questionState(q.id)).filter(Boolean);
  await store.apply({
    papers: { delete: [paper.id] },
    questions: { delete: questions.map((q) => q.id) },
    questionState: { delete: states.map((s) => s.id) }
  });
  return { papers: [paper], questions, questionState: states, _paperOnly: true };
}

export function restorePaper(bundle) {
  return store.apply({
    papers: { put: bundle.papers.map((p) => copy(p)) },
    questions: { put: bundle.questions.map((q) => copy(q)) },
    questionState: { put: bundle.questionState.map((s) => copy(s)) }
  });
}

/* ---------- subjects and topics ---------- */

const keysOf = (entity) => [entity.key, ...(entity.aliasKeys || [])];

export function findSubjectByName(name) {
  const key = nameKey(name);
  return store.all("subjects").find((s) => keysOf(s).includes(key)) || null;
}

export function findTopicByName(subjectId, name) {
  const key = nameKey(name || FALLBACK_TOPIC);
  return store.topicsOf(subjectId).find((t) => keysOf(t).includes(key)) || null;
}

/** Finds a subject/topic by name, or prepares new records for them. */
function resolver(created) {
  return (subjectName, topicName) => {
    const sName = subjectName || "Unclassified";
    let subject = findSubjectByName(sName) || created.subjects.find((s) => keysOf(s).includes(nameKey(sName)));
    if (!subject) {
      const key = nameKey(sName);
      subject = { id: ids.subject(key), key, name: sName, order: 900 + created.subjects.length, fromSeed: false, source: "personal" };
      created.subjects.push(subject);
    }
    const tName = topicName || FALLBACK_TOPIC;
    const tKey = nameKey(tName);
    let topic = findTopicByName(subject.id, tName) || created.topics.find((t) => t.subjectId === subject.id && keysOf(t).includes(tKey));
    if (!topic) {
      topic = { id: ids.topic(subject.key, tKey), subjectId: subject.id, key: tKey, name: tName, order: 900 + created.topics.length, isFallback: tKey === nameKey(FALLBACK_TOPIC), fromSeed: false, source: "personal" };
      created.topics.push(topic);
    }
    return { subjectId: subject.id, topicId: topic.id };
  };
}

export async function addSubject(name) {
  const existing = findSubjectByName(name);
  if (existing) return existing;
  const created = { subjects: [], topics: [] };
  resolver(created)(name.trim(), FALLBACK_TOPIC);
  await store.apply({ subjects: { put: created.subjects }, topics: { put: created.topics } });
  return created.subjects[0];
}

export async function addTopic(subjectId, name) {
  const existing = findTopicByName(subjectId, name);
  if (existing) return existing;
  const subject = store.subject(subjectId);
  const created = { subjects: [], topics: [] };
  resolver(created)(subject.name, name.trim());
  await store.apply({ topics: { put: created.topics } });
  return created.topics[0];
}

/** Rename; if the new name matches another topic in the same subject, the two are merged. */
export async function renameTopic(topic, newName) {
  const name = newName.trim();
  const clash = findTopicByName(topic.subjectId, name);
  if (clash && clash.id !== topic.id) {
    await takeSnapshot("merge");
    await store.apply(mergeTopicChanges(topic, clash));
    return { merged: true, into: clash };
  }
  await store.apply({ topics: { put: [copy(topic, { name, aliasKeys: [...new Set([...(topic.aliasKeys || []), topic.key])], key: nameKey(name) })] } });
  return { merged: false };
}

export async function renameSubject(subject, newName) {
  const name = newName.trim();
  const clash = findSubjectByName(name);
  if (clash && clash.id !== subject.id) {
    await takeSnapshot("merge");
    await store.apply(mergeSubjectChanges(subject, clash));
    return { merged: true, into: clash };
  }
  await store.apply({ subjects: { put: [copy(subject, { name, aliasKeys: [...new Set([...(subject.aliasKeys || []), subject.key])], key: nameKey(name) })] } });
  return { merged: false };
}

/** Everything that points at `from` is moved to `to`; nothing is lost. */
function mergeTopicChanges(from, to, extra = { put: {}, del: {} }) {
  const put = (name, r) => { (extra.put[name] ||= new Map()).set(r.id, r); };
  const del = (name, id) => { (extra.del[name] ||= new Set()).add(id); };
  const current = (name, r) => extra.put[name]?.get(r.id) || r;

  store.all("questions").filter((q) => current("questions", q).topicId === from.id)
    .forEach((q) => put("questions", copy(current("questions", q), { topicId: to.id, subjectId: to.subjectId })));
  store.all("flashcards").filter((c) => c.topicId === from.id)
    .forEach((c) => put("flashcards", copy(c, { topicId: to.id, subjectId: to.subjectId })));
  store.all("attempts").forEach((a0) => {
    const a = current("attempts", a0);
    const touches = a.answers.some((r) => r.topicId === from.id) || a.scope?.ref === from.id;
    if (!touches) return;
    put("attempts", copy(a, {
      answers: a.answers.map((r) => (r.topicId === from.id ? { ...r, topicId: to.id, subjectId: to.subjectId } : r)),
      scope: a.scope?.ref === from.id ? { ...a.scope, ref: to.id } : a.scope
    }));
  });
  store.all("topicState").filter((s) => s.topicId === from.id).forEach((s) => {
    const targetId = ids.topicState(s.syllabusId, to.id);
    const target = current("topicState", store.byId("topicState", targetId) || { id: targetId, syllabusId: s.syllabusId, topicId: to.id, studiedCount: 0 });
    put("topicState", copy(target, {
      studiedCount: (target.studiedCount || 0) + (s.studiedCount || 0),
      lastStudiedAt: Math.max(target.lastStudiedAt || 0, s.lastStudiedAt || 0) || null,
      nextReviewAt: Math.min(target.nextReviewAt || Infinity, s.nextReviewAt || Infinity) === Infinity ? null : Math.min(target.nextReviewAt || Infinity, s.nextReviewAt || Infinity)
    }));
    del("topicState", s.id);
  });
  store.all("labels").filter((l) => l.topicId === from.id).forEach((l) => {
    const targetId = ids.label(l.syllabusId, to.id);
    if (!store.byId("labels", targetId)) put("labels", copy(l, { id: targetId, topicId: to.id }));
    del("labels", l.id);
  });
  store.all("topicLists").filter((l) => current("topicLists", l).topicIds.includes(from.id)).forEach((l0) => {
    const l = current("topicLists", l0);
    put("topicLists", copy(l, { topicIds: [...new Set(l.topicIds.map((x) => (x === from.id ? to.id : x)))] }));
  });
  const fromNote = store.byId("notes", ids.note("topic", from.id));
  if (fromNote) {
    const toId = ids.note("topic", to.id);
    const toNote = store.byId("notes", toId);
    put("notes", toNote ? copy(toNote, { text: `${toNote.text}\n\n${fromNote.text}` }) : copy(fromNote, { id: toId, target: { type: "topic", id: to.id } }));
    del("notes", fromNote.id);
  }
  put("topics", copy(current("topics", to), { aliasKeys: [...new Set([...(to.aliasKeys || []), ...keysOf(from)])] }));
  del("topics", from.id);
  return toChanges(extra);
}

function mergeSubjectChanges(from, to) {
  const acc = { put: {}, del: {} };
  store.topicsOf(from.id).forEach((topic) => {
    const twin = store.topicsOf(to.id).find((t) => keysOf(t).some((k) => keysOf(topic).includes(k)));
    if (twin) mergeTopicChanges(topic, twin, acc);
    else {
      (acc.put.topics ||= new Map()).set(topic.id, copy(topic, { subjectId: to.id }));
      store.all("questions").filter((q) => q.topicId === topic.id).forEach((q) => {
        const cur = acc.put.questions?.get(q.id) || q;
        (acc.put.questions ||= new Map()).set(q.id, copy(cur, { subjectId: to.id }));
      });
      store.all("attempts").forEach((a0) => {
        const a = acc.put.attempts?.get(a0.id) || a0;
        if (!a.answers.some((r) => r.topicId === topic.id)) return;
        (acc.put.attempts ||= new Map()).set(a.id, copy(a, { answers: a.answers.map((r) => (r.topicId === topic.id ? { ...r, subjectId: to.id } : r)) }));
      });
    }
  });
  store.all("attempts").forEach((a0) => {
    const a = acc.put.attempts?.get(a0.id) || a0;
    if (a.scope?.ref === from.id) (acc.put.attempts ||= new Map()).set(a.id, copy(a, { scope: { ...a.scope, ref: to.id } }));
  });
  const fromNote = store.byId("notes", ids.note("subject", from.id));
  if (fromNote) {
    const toId = ids.note("subject", to.id);
    const toNote = store.byId("notes", toId);
    (acc.put.notes ||= new Map()).set(toId, toNote ? copy(toNote, { text: `${toNote.text}\n\n${fromNote.text}` }) : copy(fromNote, { id: toId, target: { type: "subject", id: to.id } }));
    (acc.del.notes ||= new Set()).add(fromNote.id);
  }
  (acc.put.subjects ||= new Map()).set(to.id, copy(to, { aliasKeys: [...new Set([...(to.aliasKeys || []), ...keysOf(from)])] }));
  (acc.del.subjects ||= new Set()).add(from.id);
  return toChanges(acc);
}

function toChanges(acc) {
  const changes = {};
  Object.entries(acc.put).forEach(([name, map]) => { changes[name] = { put: [...map.values()] }; });
  Object.entries(acc.del).forEach(([name, set]) => {
    changes[name] ||= {};
    changes[name].delete = [...set].filter((id) => !acc.put[name]?.has(id));
  });
  return changes;
}

/* ---------- adding papers, answer keys, explanations ---------- */

/** Prepares (does not save) a paper from JSON. Call savePaper(plan) to save it. */
export function planPaper(json, syllabusId) {
  const oldId = String(json.paper.id);
  const existingPaper = store.paper(ids.paper(oldId)) || null;
  const existingQuestions = new Map(existingPaper ? store.questionsOfPaper(existingPaper.id).map((q) => [q.oldId, q]) : []);
  const otherTexts = new Map();
  store.all("questions").forEach((q) => {
    if (q.paperId === existingPaper?.id || q.source === "ai") return;
    const key = normText(q.text);
    if (key.length >= 10 && !otherTexts.has(key)) otherTexts.set(key, store.paper(q.paperId)?.name || "");
  });
  const created = { subjects: [], topics: [] };
  const built = buildPaperRecords(json, { syllabusId, existingPaper, existingQuestions, resolveTopic: resolver(created), otherTexts });
  return { ...built, created };
}

export async function savePaper(plan) {
  if (plan.isUpdate) await takeSnapshot("paper");
  await store.apply({
    subjects: { put: plan.created.subjects },
    topics: { put: plan.created.topics },
    papers: { put: [plan.paper] },
    questions: { put: plan.questions }
  });
}

export function planAnswerKey(paper, json) { return applyAnswerKey(json, store.questionsOfPaper(paper.id)); }
export function planExplanations(paper, json) { return applyExplanations(json, store.questionsOfPaper(paper.id)); }
export const saveQuestionUpdates = (updates) => store.apply({ questions: { put: updates } });

/** A question typed by hand. toPool: also show it under Subjects/Topics of the syllabus. */
export async function typeQuestion({ bank, syllabusId, toPool, text, options, answerIndex, explanation, subjectId, topicId }) {
  const paperId = toPool ? `pap:typed-${syllabusId}` : `pap:typed-bank-${bank.id}`;
  const paper = store.paper(paperId) || {
    id: paperId, oldId: paperId.slice(4), kind: toPool ? "typed" : "bank-import",
    syllabusId: toPool ? syllabusId : null, name: toPool ? "My typed questions" : `Typed: ${bank.name}`,
    postName: "", source: "personal", questionCount: 0
  };
  const n = (paper.questionCount || 0) + 1;
  const q = {
    id: newId("q"), paperId, oldId: `t${n}`, order: n, number: `T-${n}`, text, options,
    answerIndex, status: "active", explanation: explanation || "", subjectId, topicId,
    lang: /[ഀ-ൿ]/.test(text) ? "ml" : "en", difficultyHint: null, source: "personal", sourceRef: null
  };
  await store.apply({
    papers: { put: [copy(paper, { questionCount: n })] },
    questions: { put: [q] },
    sets: { put: [copy(bank, { questionIds: [...bank.questionIds, q.id] })] }
  });
  return q;
}

/** A paper-format JSON imported straight into a bank (hidden from Papers). */
export async function importIntoBank(bank, plan) {
  plan.paper.kind = "bank-import";
  plan.paper.syllabusId = null;
  await savePaper(plan);
  const fresh = store.byId("sets", bank.id);
  await addToBank(fresh, plan.questions.map((q) => q.id));
}

/* ---------- syllabuses ---------- */

export async function addSyllabus(name) {
  const order = Math.max(-1, ...store.syllabi().map((s) => s.order)) + 1;
  const syl = { id: newId("syl"), name: name.trim(), marking: { pos: 1, negNum: 1, negDen: 3 }, pattern: null, stage: null, order, source: "personal" };
  await store.apply({ syllabi: { put: [syl] } });
  return syl;
}

/** Name, marking and the optional exam pattern. Past tests keep the marking they were scored with. */
export const updateSyllabus = (syllabus, patch) => store.apply({ syllabi: { put: [copy(syllabus, patch)] } });

/** What still belongs to a syllabus (it can only be deleted when this is all zero). */
export function syllabusUse(syllabusId) {
  return {
    papers: store.all("papers").filter((p) => p.syllabusId === syllabusId).length,
    tests: store.all("attempts").filter((a) => a.syllabusId === syllabusId).length
  };
}

export async function deleteSyllabus(syllabus) {
  const changes = {
    syllabi: { delete: [syllabus.id] },
    topicState: { delete: store.all("topicState").filter((x) => x.syllabusId === syllabus.id).map((x) => x.id) },
    labels: { delete: store.all("labels").filter((x) => x.syllabusId === syllabus.id).map((x) => x.id) },
    filterTemplates: { delete: store.all("filterTemplates").filter((x) => x.syllabusId === syllabus.id).map((x) => x.id) }
  };
  await takeSnapshot("syllabus");
  if (store.setting("currentSyllabusId") === syllabus.id) {
    const other = store.syllabi().find((s) => s.id !== syllabus.id);
    changes.settings = { put: [{ id: "currentSyllabusId", value: other?.id ?? null }] };
  }
  await store.apply(changes);
}
