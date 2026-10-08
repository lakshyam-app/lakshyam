/* Notes tab: every listing note in one place, with search and a link back. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { richText, noteText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { noteTarget, editNote, viewNote } from "./note-editor.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import { label as nameLabel } from "../../core/names.js";

let term = "";
/* Sort & filter (kept while the app is open). */
const view = { sort: "recent", subject: "all", kind: "all" };
const SORTS = ["recent", "oldest", "most", "least", "az", "syllabus", "longest"];
const KINDS = ["all", "topic", "subject", "paper", "question", "bank", "ai", "own"];
const isAi = (n) => /🤖|^\s*#{1,4}\s/m.test(n.text || "");

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

export const notesScreen = {
  id: "notes",
  tab: 4,
  render(container) {
    const notes = store.all("notes").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!notes.length) {
      container.innerHTML = html`<section class="empty"><h1>${t("notes.emptyTitle")}</h1><p>${t("notes.emptyBody")}</p></section>`;
      return;
    }
    const all = facts(notes);
    const subjectsWithNotes = [...new Set(all.map((x) => x.subjectId).filter(Boolean))].map((id) => store.subject(id)).filter(Boolean)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    if (view.subject !== "all" && view.subject !== "none" && !store.subject(view.subject)) view.subject = "all";
    container.innerHTML = html`<section class="notes">
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
      "n-sort": () => pick(t("notes.sortTitle"), SORTS.map((x) => ({ id: x, label: t(`notes.sort.${x}`), current: view.sort === x })), "sort"),
      "n-kind": () => pick(t("notes.f.kindTitle"), KINDS.map((x) => ({ id: x, label: t(`notes.f.kind.${x}`), sub: String(x === "all" ? all.length : all.filter((y) => (x === "ai" ? isAi(y.n) : x === "own" ? !isAi(y.n) : y.kind === x)).length), current: view.kind === x })).filter((it) => it.id === "all" || it.sub !== "0"), "kind"),
      "n-subject": () => pick(t("notes.f.subjectTitle"), [
        { id: "all", label: t("notes.f.allSubjects"), sub: String(all.length), current: view.subject === "all" },
        ...subjectsWithNotes.map((x) => ({ id: x.id, label: nameLabel(x), sub: String(all.filter((y) => y.subjectId === x.id).length), current: view.subject === x.id })),
        all.some((y) => !y.subjectId) ? { id: "none", label: t("notes.f.noSubject"), sub: String(all.filter((y) => !y.subjectId).length), current: view.subject === "none" } : null
      ].filter(Boolean), "subject"),
      "n-clear": () => { view.subject = "all"; view.kind = "all"; draw(); },
      read: (el) => { const n = store.byId("notes", el.dataset.id); viewNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || ""); },
      open: (el) => { const target = noteTarget(store.byId("notes", el.dataset.id)); go(target.to, target.params); },
      edit: (el) => {
        const n = store.byId("notes", el.dataset.id);
        editNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || "");
      }
    });
  }
};
