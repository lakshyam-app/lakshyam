/* Library.
   Tab:      #/library?view=subjects|topics|papers|banks[&list=…]
   Screens:  #/subject?id=…  #/subject-all?id=…  #/topic?id=…  #/paper?id=…
   (Banks live in banks.js.) */
import { openedFrom } from "../../core/back.js";
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet } from "../../core/sheet.js";
import { onLongPress } from "../../core/longpress.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { startImport } from "../import/import-flow.js";
import { mountQuestions, visibleQuestions } from "../question/list.js";
import { copyQuestions } from "../question/copy.js";
import { noteBlock, editNote, openNote } from "../notes/note-editor.js";
import { topicMenu, labelFor, labelDot, LABELS, renameTopicFlow, renameSubjectFlow, markStudied } from "./topic-actions.js";
import { addPaperFlow, answerKeyFlow } from "./paper-files.js";
import { banksRows } from "./banks.js";
import { openStartTest } from "../test/start-sheet.js";
import { contentSwitch, contentHandler, renderAiPanel, renderCardsPanel, aiQuestions, cardsOf } from "../ai/content.js";
import { generateQuestions, topicStrategy } from "../ai/ai-actions.js";
import { testsFor } from "../progress/progress.js";
import { pdfMenuItem } from "../pdfs/pdfs.js";
import { can } from "../../core/entitlements.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";

/** ▶ Practice from a listing: the questions as shown (exam filter and sort applied). */
export function practice(key, questions, scope, keepOrder = false) {
  return openStartTest({ scope, questions: visibleQuestions(key, questions), keepOrder });
}
const playIcon = "▶";

const VIEWS = ["subjects", "topics", "papers", "banks"];
let lastView = "subjects";
const filterText = { subjects: "", topics: "", papers: "", banks: "" };
// Topics view: chip ("all" or a list ID), sort, studied filter, label filter
const topicView = { chip: "all", sort: "freq", studied: "all", labels: null };

export const chev = html`<svg class="chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7l5 5-5 5"/></svg>`;
const dotsIcon = html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/></svg>`;

function emptyLibrary(container) {
  container.innerHTML = html`<section class="empty">
    <h1>${t("library.emptyTitle")}</h1>
    <p>${t("library.emptyBody")}</p>
    <button type="button" class="btn" data-action="import">${t("today.importButton")}</button>
  </section>`;
  onAction(container, { import: startImport });
}

const matches = (q, ...texts) => !q || texts.some((s) => String(s || "").toLowerCase().includes(q));

/* ---------- Topics view ---------- */

/** Filters and sorts topic rows ({ topic, count, studied, label }) by a view's choices. */
function filterTopicRows(rows, { studied, labels, sort }) {
  if (studied === "0") rows = rows.filter((r) => r.studied === 0);
  if (studied === "1") rows = rows.filter((r) => r.studied >= 1);
  if (studied === "3") rows = rows.filter((r) => r.studied >= 3);
  if (labels) rows = rows.filter((r) => labels.has(r.label?.name || "__none"));
  if (!sort) return rows;
  const byName = (a, b) => a.topic.name.localeCompare(b.topic.name);
  const labelRank = (r) => { const i = LABELS.findIndex((l) => l.name === r.label?.name); return i < 0 ? 99 : i; };
  return rows.slice().sort({
    freq: (a, b) => b.count - a.count || byName(a, b),
    az: byName,
    syllabus: (a, b) => (a.topic.order ?? 0) - (b.topic.order ?? 0) || b.count - a.count,
    most: (a, b) => b.studied - a.studied || b.count - a.count || byName(a, b),
    least: (a, b) => a.studied - b.studied || b.count - a.count || byName(a, b),
    label: (a, b) => labelRank(a) - labelRank(b) || b.count - a.count || byName(a, b)
  }[sort] || byName);
}

// Inside a subject: most-asked topics first by default (same sort & filter sheet as the Topics view).
const subjectView = { sort: "freq", studied: "all", labels: null };

function topicEntries(syllabusId) {
  const list = topicView.chip !== "all" ? store.byId("topicLists", topicView.chip) : null;
  const counts = new Map(store.topicsWithCounts(syllabusId).map((x) => [x.topic.id, x.count]));
  const ids = list ? list.topicIds : [...counts.keys()];
  let rows = ids.map((id) => store.topic(id)).filter(Boolean).map((topic) => ({
    topic, subject: store.subject(topic.subjectId), count: counts.get(topic.id) || 0,
    studied: store.topicStateFor(syllabusId, topic.id)?.studiedCount || 0,
    label: labelFor(syllabusId, topic.id)
  }));
  if (list && topicView.sort === "freq") return filterTopicRows(rows, { ...topicView, sort: null }); // a list keeps its own order unless you sort it
  return filterTopicRows(rows, topicView);
}

function topicRow(r) {
  const sub = [nameLabel(r.subject), r.studied ? t("library.studied", { n: r.studied }) : null].filter(Boolean).join(" · ");
  return html`<button type="button" class="row" data-action="open" data-to="topic" data-id="${r.topic.id}" data-lp="1">
    <span class="row-main"><span class="row-title">${labelDot(r.label)}${nameHtml(r.topic)}</span>
      <span class="row-sub">${sub}</span></span>
    <span class="row-count">${r.count}</span>${chev}
  </button>`;
}

function topicChips() {
  const lists = store.all("topicLists").sort((a, b) => a.name.localeCompare(b.name));
  if (topicView.chip !== "all" && !lists.some((l) => l.id === topicView.chip)) topicView.chip = "all";
  const filtered = topicView.sort !== "freq" || topicView.studied !== "all" || topicView.labels;
  return html`<div class="chip-row">
    <button type="button" class="pill ${topicView.chip === "all" ? "on" : ""}" data-action="chip" data-id="all">${t("topics.all")}</button>
    ${lists.map((l) => html`<button type="button" class="pill ${topicView.chip === l.id ? "on" : ""}" data-action="chip" data-id="${l.id}">📌 ${l.name}</button>`)}
    <button type="button" class="pill" data-action="new-list">${t("lists.newShort")}</button>
  </div>
  <div class="toolbar">
    <button type="button" class="pill ${filtered ? "on" : ""}" data-action="topic-sort">${t("topics.sortFilter")} ▾</button>
    ${topicView.chip !== "all" ? html`<button type="button" class="pill" data-action="list-menu">${t("lists.menu")} ▾</button>` : ""}
  </div>
  ${topicView.chip !== "all" ? noteBlock("list", topicView.chip) : ""}`;
}

function topicSortSheet(view = topicView, sorts = ["freq", "az", "most", "least", "label"]) {
  const topicView = view; // the same sheet works for any view object
  return new Promise((resolve) => {
    const opt = (group, value, label, on) => html`<button type="button" class="pill ${on ? "on" : ""}" data-action="set" data-g="${group}" data-v="${value}">${label}</button>`;
    const draw = () => openSheet(html`<h2>${t("topics.sortFilter")}</h2>
      <h3>${t("topics.sortBy")}</h3>
      <div class="chip-wrap">${sorts.map((s) => opt("sort", s, t(`topics.sort.${s}`), topicView.sort === s))}</div>
      <h3>${t("topics.studiedFilter")}</h3>
      <div class="chip-wrap">${["all", "0", "1", "3"].map((s) => opt("studied", s, t(`topics.studied.${s}`), topicView.studied === s))}</div>
      <h3>${t("labels.title")}</h3>
      <div class="chip-wrap">
        ${opt("labels", "__all", t("topics.all"), !topicView.labels)}
        ${LABELS.map((l) => html`<button type="button" class="pill ${topicView.labels?.has(l.name) ? "on" : ""}" data-action="set" data-g="labels" data-v="${l.name}"><span class="dot" style="background:${l.color}"></span>${t(`labels.${l.name}`)}</button>`)}
        ${opt("labels", "__none", t("labels.none"), topicView.labels?.has("__none"))}
      </div>
      <p class="hint">${t("topics.labelHint")}</p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="reset">${t("topics.reset")}</button>
        <button type="button" class="btn" data-action="done">${t("common.done")}</button>
      </div>`, {
      set: (el) => {
        const { g, v } = el.dataset;
        if (g !== "labels") topicView[g] = v;
        else if (v === "__all") topicView.labels = null;
        else {
          const s = new Set(topicView.labels || []);
          if (s.has(v)) s.delete(v); else s.add(v);
          topicView.labels = s.size ? s : null;
        }
        draw();
      },
      reset: () => { Object.assign(topicView, { sort: "freq", studied: "all", labels: null }); draw(); },
      done: () => resolve()
    }, { label: t("topics.sortFilter"), onClose: () => resolve() });
    draw();
  });
}

function addTopicsToList(list, syllabusId) {
  return new Promise((resolve) => {
    let term = "";
    const chosen = new Set(list.topicIds);
    const all = store.topicsWithCounts(syllabusId).sort((a, b) => b.count - a.count);
    const body = openSheet(html`<h2>${t("lists.addTopics")}</h2><p class="hint">${list.name}</p>
      <input type="search" class="search" id="ltSearch" placeholder="${t("common.searchPlaceholder")}" autocomplete="off">
      <div class="checks" id="ltRows"></div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="save">${t("common.save")}</button>
      </div>`, {
      toggle: (el) => { const id = el.dataset.id; if (chosen.has(id)) chosen.delete(id); else chosen.add(id); draw(); },
      cancel: () => resolve(null),
      save: () => resolve(chosen)
    }, { onClose: () => resolve(null) });
    const draw = () => {
      const q = term.toLowerCase();
      body.querySelector("#ltRows").innerHTML = html`${all.filter((x) => matches(q, x.topic.name, x.topic.nameMl, x.subject?.name, x.subject?.nameMl)).slice(0, 200).map((x) => html`
        <button type="button" class="check ${chosen.has(x.topic.id) ? "on" : ""}" data-action="toggle" data-id="${x.topic.id}">
          <span class="box">${chosen.has(x.topic.id) ? "✓" : ""}</span>
          <span class="row-main"><span>${nameHtml(x.topic)}</span><span class="row-sub">${nameLabel(x.subject)} · ${x.count}</span></span>
        </button>`)}`;
    };
    body.querySelector("#ltSearch").addEventListener("input", (e) => { term = e.target.value; draw(); });
    draw();
  });
}

function listMenu(listId, syllabusId) {
  const list = store.byId("topicLists", listId);
  return runFlow(async () => {
    const id = await chooseAction({ title: list.name, items: [
      { id: "add", label: t("lists.addTopics") },
      { id: "rename", label: t("lists.rename") },
      { id: "note", label: t("notes.myNote") },
      { id: "delete", label: t("lists.delete"), danger: true }
    ] });
    if (id === "add") {
      const chosen = await addTopicsToList(list, syllabusId);
      if (!chosen) return;
      const kept = list.topicIds.filter((x) => chosen.has(x));
      await store.apply({ topicLists: { put: [{ ...list, topicIds: [...kept, ...[...chosen].filter((x) => !kept.includes(x))] }] } });
    } else if (id === "rename") {
      const name = await askText({ title: t("lists.rename"), value: list.name });
      if (name) await mut.renameList(list, name);
    } else if (id === "note") {
      return openNote("list", list.id, list.name);
    } else if (id === "delete") {
      const ok = await confirmAction({ title: t("lists.deleteTitle", { name: list.name }), body: t("lists.deleteBody"), confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      const copy = { ...list };
      topicView.chip = "all";
      await mut.deleteList(list);
      toast(t("lists.deleted"), { actionLabel: t("common.undo"), onAction: () => store.apply({ topicLists: { put: [copy] } }) });
    }
  });
}

/* ---------- Library tab ---------- */

function rowsFor(view, syllabusId, q) {
  if (view === "subjects") {
    return store.subjectsWithCounts(syllabusId).filter((x) => matches(q, x.subject.name, x.subject.nameMl)).map((x) => html`
      <button type="button" class="row" data-action="open" data-to="subject" data-id="${x.subject.id}">
        <span class="row-main"><span class="row-title">${nameHtml(x.subject)}</span></span>
        <span class="row-count">${x.count}</span>${chev}
      </button>`);
  }
  if (view === "topics") {
    return topicEntries(syllabusId).filter((r) => matches(q, r.topic.name, r.topic.nameMl, r.subject?.name, r.subject?.nameMl)).map(topicRow);
  }
  if (view === "banks") return banksRows(syllabusId, q);
  return store.papersOf(syllabusId).filter((p) => matches(q, p.name, p.postName)).map((p) => html`
    <button type="button" class="row" data-action="open" data-to="paper" data-id="${p.id}">
      <span class="row-main"><span class="row-title">${p.name}</span>
        ${p.postName ? html`<span class="row-sub">${p.postName}</span>` : ""}</span>
      <span class="row-count">${p.questionCount}</span>${chev}
    </button>`);
}

export const libraryScreen = {
  id: "library",
  tab: 2,
  render(container, params) {
    if (store.isEmpty()) return emptyLibrary(container);
    const view = VIEWS.includes(params.view) ? params.view : lastView;
    lastView = view;
    if (params.list && store.byId("topicLists", params.list)) topicView.chip = params.list;
    const syllabus = store.currentSyllabus();

    container.innerHTML = html`<section class="library">
      <div class="segmented four" role="tablist">${VIEWS.map((v) => html`
        <button type="button" role="tab" aria-selected="${String(v === view)}" class="${v === view ? "on" : ""}"
          data-action="view" data-view="${v}">${t(`library.views.${v}`)}</button>`)}</div>
      <input type="search" class="search" id="libFilter" placeholder="${t("common.searchPlaceholder")}"
        value="${filterText[view]}" autocomplete="off">
      ${view === "topics" ? topicChips() : ""}
      ${view === "papers" ? html`<button type="button" class="btn btn-quiet add-btn" data-action="add-paper">${t("addPaper.button")}</button>` : ""}
      ${view === "banks" ? html`<button type="button" class="btn btn-quiet add-btn" data-action="new-bank">${t("banks.newBank")}</button>` : ""}
      <div class="rows" id="libRows"></div>
      ${view === "topics" ? html`<p class="hint pad">${t("topics.tip")}</p>` : ""}
    </section>`;

    const rowsEl = container.querySelector("#libRows");
    const drawRows = () => {
      const q = filterText[view].trim().toLowerCase();
      const rows = rowsFor(view, syllabus.id, q);
      rowsEl.innerHTML = rows.length ? html`${rows}`
        : html`<p class="hint pad">${q ? t("library.nothingFound", { q: filterText[view] }) : t(`library.emptyView.${view}`)}</p>`;
    };
    drawRows();

    let timer = null;
    container.querySelector("#libFilter").addEventListener("input", (e) => {
      filterText[view] = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(drawRows, 120);
    });
    onAction(container, {
      view: (el) => go("library", { view: el.dataset.view }),
      open: (el) => go(el.dataset.to, { id: el.dataset.id }),
      chip: (el) => { topicView.chip = el.dataset.id; go("library", { view: "topics" }); },
      "new-list": () => runFlow(async () => {
        const name = await askText({ title: t("lists.newList"), placeholder: t("lists.namePlaceholder"), confirmLabel: t("common.create") });
        if (!name) return;
        const list = await store.quietly(() => mut.createList(name));
        topicView.chip = list.id;
        store.touch();
      }),
      "topic-sort": () => topicSortSheet().then(() => runFlow(async () => store.touch())),
      "list-menu": () => listMenu(topicView.chip, syllabus.id),
      "note-edit": () => openNote("list", topicView.chip, store.byId("topicLists", topicView.chip)?.name || ""),
      "add-paper": () => addPaperFlow(),
      "new-bank": () => runFlow(async () => {
        const name = await askText({ title: t("banks.newBank"), placeholder: t("banks.namePlaceholder"), confirmLabel: t("common.create") });
        if (!name) return;
        const bank = await store.quietly(() => mut.createBank(name));
        go("bank", { id: bank.id });
      })
    });
    if (view === "topics") {
      onLongPress(rowsEl, (el) => {
        const topic = store.topic(el.dataset.id);
        if (topic) topicMenu(topic, { listId: topicView.chip !== "all" ? topicView.chip : null });
      });
    }
  }
};

/* ---------- shared header ---------- */

export function header({ backTo, backParams, backLabel, title, sub, menu = false }) {
  return html`<header class="screen-head">
    <div class="head-bar">
      <button type="button" class="back" data-action="back" data-to="${backTo}" data-params="${JSON.stringify(backParams || {})}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${backLabel}</span>
      </button>
      ${menu ? html`<button type="button" class="icon-btn" data-action="menu" aria-label="${t("common.more")}">${dotsIcon}</button>` : ""}
    </div>
    <h1>${title}</h1>
    ${sub ? html`<p class="hint">${sub}</p>` : ""}
  </header>`;
}

export const backHandler = { back: (el) => go(el.dataset.to, JSON.parse(el.dataset.params || "{}")) };

/* ---------- Subject ---------- */

export const subjectScreen = {
  id: "subject",
  parent: "library",
  render(container, { id, mode = "pyq" }) {
    const subject = store.subject(id);
    if (!subject) return go("library");
    const syllabus = store.currentSyllabus();
    const allTopics = store.topicsWithCounts(syllabus.id, id);
    const total = allTopics.reduce((n, x) => n + x.count, 0);
    const topics = filterTopicRows(allTopics.map((x) => ({ ...x, studied: store.topicStateFor(syllabus.id, x.topic.id)?.studiedCount || 0, label: labelFor(syllabus.id, x.topic.id) })), subjectView);
    const filtered = subjectView.sort !== "freq" || subjectView.studied !== "all" || subjectView.labels;
    const counts = { pyq: total, ai: aiQuestions(syllabus.id, { subjectId: id }).length, cards: cardsOf(syllabus.id, { subjectId: id }).length };
    const head = html`${header({
      backTo: "library", backParams: { view: "subjects" }, backLabel: t("library.views.subjects"),
      title: nameHtml(subject), sub: `${t("common.questions", { n: total })} · ${t("common.topics", { n: allTopics.length })}`, menu: mode === "pyq"
    })}${contentSwitch(mode, counts, "subject", { id })}`;
    if (mode !== "pyq") {
      container.innerHTML = html`${head}<div id="aiHost"></div>`;
      onAction(container, { ...backHandler, ...contentHandler });
      const host = container.querySelector("#aiHost");
      if (mode === "ai") renderAiPanel(host, { syllabus, scope: { subjectId: id }, label: subject.name });
      else renderCardsPanel(host, { syllabus, scope: { subjectId: id } });
      return;
    }
    container.innerHTML = html`${head}
    ${total ? html`<div class="actions-row"><button type="button" class="btn" data-action="practice">${playIcon} ${t("practice.button")}</button></div>` : ""}
    ${noteBlock("subject", id)}
    <div class="toolbar"><button type="button" class="pill ${filtered ? "on" : ""}" data-action="sub-sort">${t(`topics.sort.${subjectView.sort}`)}${filtered && (subjectView.studied !== "all" || subjectView.labels) ? ` · ${t("topics.filtered")}` : ""} ▾</button>
      ${topics.length < allTopics.length ? html`<span class="hint">${t("topics.showingOf", { n: topics.length, of: allTopics.length })}</span>` : ""}</div>
    <div class="rows" id="subRows">
      ${total ? html`<button type="button" class="row" data-action="all">
        <span class="row-main"><span class="row-title">${t("subject.allQuestions")}</span></span>
        <span class="row-count">${total}</span>${chev}</button>` : ""}
      ${topics.map((x) => {
        const st = store.topicStateFor(syllabus.id, x.topic.id);
        const label = labelFor(syllabus.id, x.topic.id);
        return html`<button type="button" class="row" data-action="open" data-id="${x.topic.id}" data-lp="1">
          <span class="row-main"><span class="row-title">${labelDot(label)}${nameHtml(x.topic)}</span>
            ${st?.studiedCount ? html`<span class="row-sub">${t("library.studied", { n: st.studiedCount })}</span>` : ""}</span>
          <span class="row-count">${x.count}</span>${chev}
        </button>`;
      })}
    </div>`;
    onAction(container, {
      ...backHandler, ...contentHandler,
      open: (el) => go("topic", { id: el.dataset.id }),
      all: () => go("subject-all", { id }),
      "sub-sort": () => topicSortSheet(subjectView, ["freq", "syllabus", "az", "most", "least", "label"]).then(() => runFlow(async () => store.touch())),
      practice: () => practice(`subject-all:${id}`, store.questionsFor({ syllabusId: syllabus.id, subjectId: id }), { type: "subject", ref: id, label: subject.name }),
      "note-edit": () => openNote("subject", id, subject.name),
      menu: () => runFlow(async () => {
        const choice = await chooseAction({ title: nameLabel(subject), items: [
          { id: "rename", label: t("subjectMenu.rename") },
          { id: "copy", label: t("listing.copy") },
          { id: "note", label: t("notes.myNote") },
          can("pdfs") ? { id: "pdfs", label: `📄 ${t("pdf.title")}` } : null
        ] });
        if (choice === "pdfs") return go("pdfs", { type: "subject", id });
        if (choice === "rename") return renameSubjectFlow(subject);
        if (choice === "copy") return copyQuestions(visibleQuestions(`subject-all:${id}`, store.questionsFor({ syllabusId: syllabus.id, subjectId: id })), subject.name);
        if (choice === "note") return openNote("subject", id, subject.name);
      })
    });
    onLongPress(container.querySelector("#subRows"), (el) => { const topic = store.topic(el.dataset.id); if (topic) topicMenu(topic); });
  }
};

export const subjectAllScreen = {
  id: "subject-all",
  parent: "library",
  render(container, { id }) {
    const subject = store.subject(id);
    if (!subject) return go("library");
    const syllabus = store.currentSyllabus();
    const questions = store.questionsFor({ syllabusId: syllabus.id, subjectId: id })
      .sort((a, b) => (store.topic(a.topicId)?.order ?? 0) - (store.topic(b.topicId)?.order ?? 0));
    container.innerHTML = html`${header({
      backTo: "subject", backParams: { id }, backLabel: nameLabel(subject),
      title: t("subject.allQuestions"), sub: t("common.questions", { n: questions.length })
    })}
    ${questions.length ? html`<div class="actions-row"><button type="button" class="btn" data-action="practice">${playIcon} ${t("practice.button")}</button></div>` : ""}
    <div id="qHost"></div>`;
    onAction(container, { ...backHandler, practice: () => practice(`subject-all:${id}`, questions, { type: "subject", ref: id, label: subject.name }) });
    mountQuestions(container.querySelector("#qHost"), { key: `subject-all:${id}`, questions, showPaper: true });
  }
};

/* ---------- Topic ---------- */

export const topicScreen = {
  id: "topic",
  parent: "library",
  render(container, { id, mode = "pyq" }) {
    const topic = store.topic(id);
    if (!topic) return go("library");
    const subject = store.subject(topic.subjectId);
    const syllabus = store.currentSyllabus();
    const questions = store.questionsFor({ syllabusId: syllabus.id, topicId: id });
    const st = store.topicStateFor(syllabus.id, id);
    const label = labelFor(syllabus.id, id);
    const done = testsFor(syllabus.id, "topic", id).sort((a, b) => b.submittedAt - a.submittedAt);
    const sub = [t("common.questions", { n: questions.length }), st?.studiedCount ? t("library.studied", { n: st.studiedCount }) : t("library.notStudied")]
      .filter(Boolean).join(" · ");
    const counts = { pyq: questions.length, ai: aiQuestions(syllabus.id, { topicId: id }).length, cards: cardsOf(syllabus.id, { topicId: id }).length };
    const head = html`${header({
      backTo: "subject", backParams: { id: topic.subjectId }, backLabel: nameLabel(subject) || t("common.back"),
      title: html`${labelDot(label)}${nameHtml(topic)}`, sub, menu: true
    })}${contentSwitch(mode, counts, "topic", { id })}`;
    const aiItem = { id: "ai-gen", label: t("ai.makeQuestions"), run: () => { generateQuestions(topic); } };
    const pdfItem = can("pdfs") ? pdfMenuItem("topic", id) : null;
    if (mode !== "pyq") {
      container.innerHTML = html`${head}<div id="aiHost"></div>`;
      onAction(container, { ...backHandler, ...contentHandler, menu: () => topicMenu(topic, { onPage: true, extra: [aiItem, pdfItem].filter(Boolean) }) });
      const host = container.querySelector("#aiHost");
      if (mode === "ai") renderAiPanel(host, { syllabus, scope: { topicId: id }, topic, label: topic.name });
      else renderCardsPanel(host, { syllabus, scope: { topicId: id } });
      return;
    }
    container.innerHTML = html`${head}
    ${done.length ? html`<button type="button" class="link" data-action="tests">${t("practice.testsDone", { n: done.length, last: Math.round((done[0].counts.correct / Math.max(1, done[0].counts.total)) * 100) })} ›</button>` : ""}
    <div class="actions-row">
      ${questions.length ? html`<button type="button" class="btn" data-action="practice">${playIcon} ${t("practice.button")}</button>` : ""}
      <button type="button" class="btn btn-quiet" data-action="studied">${t("studied.button")}</button>
      ${can("ai") && questions.length >= 3 ? html`<button type="button" class="btn btn-quiet" data-action="strategy">🤖 ${t("ai.strategyButton")}</button>` : ""}
    </div>
    ${noteBlock("topic", id)}
    <div id="qHost"></div>`;
    const key = `topic:${id}`;
    onAction(container, {
      ...backHandler, ...contentHandler,
      studied: () => markStudied(syllabus.id, topic),
      strategy: () => topicStrategy(topic),
      practice: () => practice(key, questions, { type: "topic", ref: id, label: topic.name }),
      tests: () => (done.length === 1 ? go("result", { id: done[0].id, ...openedFrom("topic", { id }) }) : go("tests", { type: "topic", ref: id, ...openedFrom("topic", { id }) })),
      "note-edit": () => openNote("topic", id, topic.name),
      menu: () => topicMenu(topic, { onPage: true, extra: [
        st?.studiedCount ? { id: "minus", label: t("studied.minus", { n: st.studiedCount }), run: () => mut.addStudied(syllabus.id, id, -1) } : null,
        { id: "copy", label: t("listing.copy"), run: () => copyQuestions(visibleQuestions(key, questions), `${subject?.name} — ${topic.name}`) },
        { id: "note", label: t("notes.myNote"), run: () => openNote("topic", id, topic.name) },
        aiItem,
        pdfItem
      ].filter(Boolean) })
    });
    mountQuestions(container.querySelector("#qHost"), { key, questions, showPaper: true });
  }
};

/* ---------- Paper ---------- */

// Per paper: show only one subject (and optionally one topic). Kept while the app is open.
const paperFilter = new Map();

export const paperScreen = {
  id: "paper",
  parent: "library",
  render(container, { id }) {
    const paper = store.paper(id);
    if (!paper) return go("library", { view: "papers" });
    const all = store.questionsOfPaper(id);
    const f = paperFilter.get(id) || {};
    const questions = all.filter((q) => (!f.subjectId || q.subjectId === f.subjectId) && (!f.topicId || q.topicId === f.topicId));
    const key = `paper:${id}${f.subjectId ? `:${f.subjectId}` : ""}${f.topicId ? `:${f.topicId}` : ""}`;
    const filterLabel = f.topicId ? nameLabel(store.topic(f.topicId)) : f.subjectId ? nameLabel(store.subject(f.subjectId)) : t("paperFilter.all");
    container.innerHTML = html`${header({
      backTo: "library", backParams: { view: "papers" }, backLabel: t("library.views.papers"),
      title: paper.name, sub: [paper.postName, t("common.questions", { n: all.length })].filter(Boolean).join(" · "), menu: true
    })}
    ${all.length ? html`<div class="toolbar"><button type="button" class="pill ${f.subjectId ? "on" : ""}" data-action="pfilter">${t("paperFilter.label", { what: filterLabel })} ▾</button>
      ${f.subjectId ? html`<span class="hint">${t("exams.showing", { n: questions.length, of: all.length })}</span>` : ""}</div>` : ""}
    ${questions.length ? html`<div class="actions-row"><button type="button" class="btn" data-action="practice">${playIcon} ${t("practice.button")}</button></div>` : ""}
    ${noteBlock("paper", id)}
    <div id="qHost"></div>`;
    onAction(container, {
      ...backHandler,
      practice: () => practice(key, questions, { type: "paper", ref: id, label: paper.name }, true),
      "note-edit": () => openNote("paper", id, paper.name),
      menu: () => paperMenu(paper, questions, key),
      pfilter: () => runFlow(async () => {
        const bySub = new Map(); all.forEach((q) => bySub.set(q.subjectId, (bySub.get(q.subjectId) || 0) + 1));
        const sid = await chooseAction({ title: t("paperFilter.title"), items: [
          { id: "__all", label: t("paperFilter.all"), sub: t("common.questions", { n: all.length }), current: !f.subjectId },
          ...[...bySub.entries()].sort((a, b) => b[1] - a[1]).map(([sId, n]) => ({ id: sId, label: nameLabel(store.subject(sId)) || "—", sub: t("common.questions", { n }), current: f.subjectId === sId && !f.topicId }))
        ] });
        if (!sid) return;
        if (sid === "__all") { paperFilter.delete(id); store.touch(); return; }
        const byTop = new Map(); all.filter((q) => q.subjectId === sid).forEach((q) => byTop.set(q.topicId, (byTop.get(q.topicId) || 0) + 1));
        let tid = null;
        if (byTop.size > 1) {
          tid = await chooseAction({ title: nameLabel(store.subject(sid)), sub: t("paperFilter.topicSub"), items: [
            { id: "__all", label: t("paperFilter.allTopics"), sub: t("common.questions", { n: [...byTop.values()].reduce((a, b) => a + b, 0) }) },
            ...[...byTop.entries()].sort((a, b) => b[1] - a[1]).map(([tId, n]) => ({ id: tId, label: nameLabel(store.topic(tId)) || "—", sub: t("common.questions", { n }), current: f.topicId === tId }))
          ] });
          if (!tid) return;
        }
        paperFilter.set(id, { subjectId: sid, topicId: tid && tid !== "__all" ? tid : null });
        store.touch();
      })
    });
    mountQuestions(container.querySelector("#qHost"), { key, questions, showPaper: false, examFilter: false });
  }
};

function paperMenu(paper, questions, key) {
  return runFlow(async () => {
    const choice = await chooseAction({ title: paper.name, sub: paper.postName, items: [
      { id: "key", label: t("paperMenu.answerKey") },
      { id: "explain", label: t("paperMenu.explanations") },
      { id: "rename", label: t("paperMenu.rename") },
      { id: "post", label: t("paperMenu.postName") },
      store.syllabi().length > 1 ? { id: "move", label: t("paperMenu.move") } : null,
      { id: "copy", label: t("listing.copy") },
      { id: "note", label: t("notes.myNote") },
      { id: "delete", label: t("paperMenu.delete"), danger: true }
    ] });
    switch (choice) {
      case "key": return answerKeyFlow(paper, "key");
      case "explain": return answerKeyFlow(paper, "explain");
      case "rename": { const name = await askText({ title: t("paperMenu.rename"), value: paper.name }); if (name) await mut.renamePaper(paper, name); return; }
      case "post": { const post = await askText({ title: t("paperMenu.postName"), value: paper.postName || "", allowEmpty: true }); if (post !== null) await mut.setPostName(paper, post); return; }
      case "move": {
        const target = await chooseAction({ title: t("paperMenu.move"), items: store.syllabi().map((s) => ({ id: s.id, label: s.name, current: s.id === paper.syllabusId })) });
        if (!target || target === paper.syllabusId) return;
        await mut.movePaper(paper, target);
        toast(t("paperMenu.moved", { syllabus: store.syllabi().find((s) => s.id === target)?.name }));
        return go("library", { view: "papers" });
      }
      case "copy": return copyQuestions(visibleQuestions(key, questions), paper.name);
      case "note": return openNote("paper", paper.id, paper.name);
      case "delete": {
        const ok = await confirmAction({ title: t("paperMenu.deleteTitle", { name: paper.name }), body: t("paperMenu.deleteBody", { n: questions.length }), confirmLabel: t("common.delete"), danger: true });
        if (!ok) return;
        const bundle = await store.quietly(() => mut.deletePaper(paper));
        toast(t("paperMenu.deleted"), { actionLabel: t("common.undo"), onAction: () => mut.restorePaper(bundle), duration: 10000 });
        return go("library", { view: "papers" });
      }
    }
  });
}
