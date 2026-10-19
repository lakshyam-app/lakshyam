/* Notes: every listing note in one place, with search and a link back.
   (1.26: opened from the Revise tab, which took its place in the bottom bar; #/notes still works.) */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go, goBack } from "../../core/router.js";
import { richText, noteText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { noteTarget, editNote, viewNote } from "./note-editor.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import { label as nameLabel } from "../../core/names.js";

let term = "";
/* Sort & filter (kept while the app is open). */
const view = { sort: "recent", subject: "all", kind: "all", scope: "this" }; // scope: this syllabus (default) | all syllabi
const SORTS = ["recent", "oldest", "most", "least", "az", "syllabus", "longest"];
const KINDS = ["all", "topic", "pdfnote", "subject", "paper", "question", "test", "bank", "ai", "own"];
const isAi = (n) => n.ai || n.target?.type === "pdfnote" || /🤖|^\s*#{1,4}\s/m.test(n.text || "");

/** Which syllabi a note belongs to (a Set), or null for a general note (a bank, list or your own misc note).
    Subjects and topics are shared, so their notes belong to every syllabus whose papers ask about them. */
function syllabusIndex() {
  const paperSyl = new Map(store.all("papers").map((p) => [p.id, p.syllabusId]));
  const byTopic = new Map(); const bySubject = new Map();
  const add = (m, k, v) => { if (!k || !v) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  store.all("questions").forEach((q) => { const sy = paperSyl.get(q.paperId); add(byTopic, q.topicId, sy); add(bySubject, q.subjectId, sy); });
  (store.all("flashcards") || []).forEach((c) => { add(byTopic, c.topicId, c.syllabusId); add(bySubject, c.subjectId, c.syllabusId); });
  return (n) => {
    if (n.syllabusId) return new Set([n.syllabusId]);
    const { type, id } = n.target || {};
    if (type === "question") { const q = store.question(id); return new Set([paperSyl.get(q?.paperId)].filter(Boolean)); }
    if (type === "paper") return new Set([paperSyl.get(id)].filter(Boolean));
    if (type === "topic") return byTopic.get(id) || new Set();
    if (type === "subject") return bySubject.get(id) || new Set();
    if (type === "pdfnote") return byTopic.get(n.target.topicId) || new Set();
    if (type === "test") { const a = store.byId("attempts", id); return new Set([a?.syllabusId].filter(Boolean)); }
    return null;
  };
}

/** For each note: its subject (if any), how many past-paper questions sit behind it, its name and syllabus order. */
function facts(notes) {
  const syllabus = store.currentSyllabus();
  const byTopic = new Map(); const bySubject = new Map();
  if (syllabus) store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => {
    byTopic.set(q.topicId, (byTopic.get(q.topicId) || 0) + 1);
    bySubject.set(q.subjectId, (bySubject.get(q.subjectId) || 0) + 1);
  });
  return notes.map((n) => {
    const { type, id } = n.target || {};
    let subjectId = null; let asked = 0; let order = [9999, 9999];
    if (type === "topic") { const x = store.topic(id); subjectId = x?.subjectId || null; asked = byTopic.get(id) || 0; order = [store.subject(subjectId)?.order ?? 9999, x?.order ?? 9999]; }
    else if (type === "subject") { subjectId = id; asked = bySubject.get(id) || 0; order = [store.subject(id)?.order ?? 9999, -1]; }
    else if (type === "question") { const q = store.question(id); subjectId = q?.subjectId || null; asked = q ? byTopic.get(q.topicId) || 0 : 0; order = [store.subject(subjectId)?.order ?? 9999, store.topic(q?.topicId)?.order ?? 9999]; }
    else if (type === "paper") asked = store.questionsOfPaper(id).length;
    else if (type === "pdfnote") { const x = store.topic(n.target.topicId); subjectId = x?.subjectId || null; asked = byTopic.get(n.target.topicId) || 0; order = [store.subject(subjectId)?.order ?? 9999, x?.order ?? 9999]; }
    const target = noteTarget(n);
    const kind = type === "set" || type === "list" ? "bank" : type || "other";
    return { n, target, subjectId, asked, order, kind, name: target?.name || n.label || "" };
  });
}

const SORT_FN = {
  recent: (a, b) => (b.n.updatedAt || 0) - (a.n.updatedAt || 0),
  oldest: (a, b) => (a.n.updatedAt || 0) - (b.n.updatedAt || 0),
  most: (a, b) => b.asked - a.asked,
  least: (a, b) => a.asked - b.asked,
  az: (a, b) => a.name.localeCompare(b.name),
  syllabus: (a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1],
  longest: (a, b) => (b.n.text || "").length - (a.n.text || "").length
};

/** How many notes the Notes screen shows at first (this syllabus and general ones). */
export function notesShown() {
  const syl = store.currentSyllabus();
  const relOf = syllabusIndex();
  return store.all("notes").filter((n) => { const r = relOf(n); return r === null || !syl || r.has(syl.id); }).length;
}

const backBar = () => html`<div class="head-bar"><button type="button" class="back" data-action="back">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.revise")}</span></button></div>`;

export const notesScreen = {
  id: "notes",
  parent: "revise",
  render(container) {
    const notes = store.all("notes").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!notes.length) {
      container.innerHTML = html`${backBar()}<section class="empty"><h1>${t("notes.emptyTitle")}</h1><p>${t("notes.emptyBody")}</p></section>`;
      onAction(container, { back: () => goBack("revise") });
      return;
    }
    // By default only the notes of the syllabus chosen at the top (and general ones); "All syllabi" shows every note.
    const syl = store.currentSyllabus();
    const relOf = syllabusIndex();
    const inThis = (n) => { const r = relOf(n); return r === null || !syl || r.has(syl.id); };
    const scoped = view.scope === "all" ? notes : notes.filter(inThis);
    const hiddenOther = notes.length - notes.filter(inThis).length;
    const all = facts(scoped);
    const subjectsWithNotes = [...new Set(all.map((x) => x.subjectId).filter(Boolean))].map((id) => store.subject(id)).filter(Boolean)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    if (view.subject !== "all" && view.subject !== "none" && !store.subject(view.subject)) view.subject = "all";
    container.innerHTML = html`${backBar()}<section class="notes">
      <h1 class="page-title">${t("tabs.notes")}</h1>
      <input type="search" class="search" id="noteSearch" placeholder="${t("notes.search")}" value="${term}" autocomplete="off">
      <div class="chip-wrap tf-bar" id="noteBar"></div>
      <p class="hint" id="noteCount"></p>
      <div class="note-list" id="noteRows"></div>
    </section>`;
    const rowsEl = container.querySelector("#noteRows");
    const barEl = container.querySelector("#noteBar");
    const countEl = container.querySelector("#noteCount");
    const subjName = (v) => (v === "all" ? t("notes.f.allSubjects") : v === "none" ? t("notes.f.noSubject") : nameLabel(store.subject(v)));
    const filtered = () => !(view.subject === "all" && view.kind === "all");
    const drawBar = () => {
      barEl.innerHTML = html`
        ${hiddenOther || view.scope === "all" ? html`<button type="button" class="pill ${view.scope === "all" ? "on" : ""}" data-action="n-scope">${view.scope === "all" ? t("notes.f.allSyllabi") : t("notes.f.thisSyllabus", { name: syl?.name || "" })} ▾</button>` : ""}
        <button type="button" class="pill ${view.subject !== "all" ? "on" : ""}" data-action="n-subject">${subjName(view.subject)} ▾</button>
        <button type="button" class="pill ${view.kind !== "all" ? "on" : ""}" data-action="n-kind">${t(`notes.f.kind.${view.kind}`)} ▾</button>
        <button type="button" class="pill" data-action="n-sort">↕ ${t(`notes.sort.${view.sort}`)} ▾</button>
        ${filtered() ? html`<button type="button" class="link" data-action="n-clear">${t("tables.tf.clear")}</button>` : ""}`;
    };
    const draw = () => {
      drawBar();
      const q = term.trim().toLowerCase();
      const rows = all
        .filter((x) => view.subject === "all" || (view.subject === "none" ? !x.subjectId : x.subjectId === view.subject))
        .filter((x) => view.kind === "all" || (view.kind === "ai" ? isAi(x.n) : view.kind === "own" ? !isAi(x.n) : x.kind === view.kind))
        .filter((x) => !q || `${x.n.text} ${x.name}`.toLowerCase().includes(q))
        .sort((a, b) => SORT_FN[view.sort](a, b) || (b.n.updatedAt || 0) - (a.n.updatedAt || 0));
      countEl.textContent = t("notes.count", { n: rows.length, of: all.length });
      rowsEl.innerHTML = rows.length ? html`${rows.map(({ n, target, asked }) => html`
        <article class="note-card">
          <header class="qcard-meta"><span>${target ? `${target.kind} · ${target.name}` : (n.label || t("notes.kind.other"))}${target?.sub ? ` · ${target.sub}` : ""}</span>${asked ? html`<span class="mini-chip">${t("notes.asked", { n: asked })}</span>` : ""}</header>
          <div class="note-body-btn" data-action="read" data-id="${n.id}">
            <div class="qtext note-body ai-answer ${n.text.length > 600 || n.text.split("\n").length > 10 ? "is-long" : ""}">${noteText(n.text)}</div></div>
          <div class="row-actions">
            <button type="button" class="link" data-action="read" data-id="${n.id}">📖 ${t("notes.read")}</button>
            ${target ? html`<button type="button" class="link" data-action="open" data-id="${n.id}">${t("notes.open")}</button>` : ""}
            <button type="button" class="link" data-action="edit" data-id="${n.id}">${t("common.edit")}</button>
          </div>
        </article>`)}` : html`<p class="hint pad">${term ? t("library.nothingFound", { q: term }) : t("notes.noneHere")}</p>`;
    };
    draw();
    let timer = null;
    container.querySelector("#noteSearch").addEventListener("input", (e) => { term = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 120); });
    const pick = (title, items, key) => runFlow(async () => {
      const id = await chooseAction({ title, items });
      if (id) { view[key] = id; draw(); }
    });
    onAction(container, {
      back: () => goBack("revise"),
      "n-sort": () => pick(t("notes.sortTitle"), SORTS.map((x) => ({ id: x, label: t(`notes.sort.${x}`), current: view.sort === x })), "sort"),
      "n-kind": () => pick(t("notes.f.kindTitle"), KINDS.map((x) => ({ id: x, label: t(`notes.f.kind.${x}`), sub: String(x === "all" ? all.length : all.filter((y) => (x === "ai" ? isAi(y.n) : x === "own" ? !isAi(y.n) : y.kind === x)).length), current: view.kind === x })).filter((it) => it.id === "all" || it.sub !== "0"), "kind"),
      "n-subject": () => pick(t("notes.f.subjectTitle"), [
        { id: "all", label: t("notes.f.allSubjects"), sub: String(all.length), current: view.subject === "all" },
        ...subjectsWithNotes.map((x) => ({ id: x.id, label: nameLabel(x), sub: String(all.filter((y) => y.subjectId === x.id).length), current: view.subject === x.id })),
        all.some((y) => !y.subjectId) ? { id: "none", label: t("notes.f.noSubject"), sub: String(all.filter((y) => !y.subjectId).length), current: view.subject === "none" } : null
      ].filter(Boolean), "subject"),
      "n-clear": () => { view.subject = "all"; view.kind = "all"; draw(); },
      "n-scope": () => runFlow(async () => {
        const id = await chooseAction({ title: t("notes.f.scopeTitle"), items: [
          { id: "this", label: t("notes.f.thisSyllabus", { name: syl?.name || "" }), sub: t("notes.f.thisSub", { n: notes.length - hiddenOther }), current: view.scope === "this" },
          { id: "all", label: t("notes.f.allSyllabi"), sub: t("notes.f.allSub", { n: notes.length }), current: view.scope === "all" }] });
        if (id && id !== view.scope) { view.scope = id; store.touch(); }
      }),
      read: (el) => { const n = store.byId("notes", el.dataset.id); viewNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || ""); },
      open: (el) => { const target = noteTarget(store.byId("notes", el.dataset.id)); go(target.to, target.params); },
      edit: (el) => {
        const n = store.byId("notes", el.dataset.id);
        editNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || "");
      }
    });
  }
};
