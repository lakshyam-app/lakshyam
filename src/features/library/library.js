/* Library (Phase 1: read-only browsing).
   Tab:      #/library?view=subjects|topics|papers
   Screens:  #/subject?id=…  #/topic?id=…  #/paper?id=… */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { typesetMath } from "../../core/math.js";
import * as store from "../../data/store.js";
import { questionCard } from "../question/card.js";
import { startImport } from "../import/import-flow.js";

const PAGE = 30;
const VIEWS = ["subjects", "topics", "papers"];
let lastView = "subjects";
const filterText = { subjects: "", topics: "", papers: "" };

const chev = html`<svg class="chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7l5 5-5 5"/></svg>`;

function emptyLibrary(container) {
  container.innerHTML = html`<section class="empty">
    <h1>${t("library.emptyTitle")}</h1>
    <p>${t("library.emptyBody")}</p>
    <button type="button" class="btn" data-action="import">${t("today.importButton")}</button>
  </section>`;
  onAction(container, { import: startImport });
}

const matches = (q, ...texts) => !q || texts.some((s) => String(s || "").toLowerCase().includes(q));

function rowsFor(view, syllabusId, q) {
  if (view === "subjects") {
    return store.subjectsWithCounts(syllabusId).filter((x) => matches(q, x.subject.name)).map((x) => html`
      <button type="button" class="row" data-action="open" data-to="subject" data-id="${x.subject.id}">
        <span class="row-main"><span class="row-title">${x.subject.name}</span></span>
        <span class="row-count">${x.count}</span>${chev}
      </button>`);
  }
  if (view === "topics") {
    return store.topicsWithCounts(syllabusId).filter((x) => matches(q, x.topic.name, x.subject?.name))
      .sort((a, b) => b.count - a.count || a.topic.name.localeCompare(b.topic.name))
      .map((x) => html`
      <button type="button" class="row" data-action="open" data-to="topic" data-id="${x.topic.id}">
        <span class="row-main"><span class="row-title">${x.topic.name}</span>
          <span class="row-sub">${x.subject?.name || ""}</span></span>
        <span class="row-count">${x.count}</span>${chev}
      </button>`);
  }
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
    const syllabus = store.currentSyllabus();

    container.innerHTML = html`<section class="library">
      <div class="segmented" role="tablist">${VIEWS.map((v) => html`
        <button type="button" role="tab" aria-selected="${String(v === view)}" class="${v === view ? "on" : ""}"
          data-action="view" data-view="${v}">${t(`library.views.${v}`)}</button>`)}</div>
      <input type="search" class="search" id="libFilter" placeholder="${t("common.searchPlaceholder")}"
        value="${filterText[view]}" autocomplete="off">
      <div class="rows" id="libRows"></div>
    </section>`;

    const rowsEl = container.querySelector("#libRows");
    const drawRows = () => {
      const q = filterText[view].trim().toLowerCase();
      const rows = rowsFor(view, syllabus.id, q);
      rowsEl.innerHTML = rows.length ? html`${rows}` : html`<p class="hint pad">${t("library.nothingFound", { q: filterText[view] })}</p>`;
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
      open: (el) => go(el.dataset.to, { id: el.dataset.id })
    });
  }
};

/* ---------- question lists with paging ---------- */

function questionList(container, questions, { showPaper }) {
  const listEl = container.querySelector("#qList");
  let shown = 0;
  const more = container.querySelector("#qMore");
  const drawMore = () => {
    const next = questions.slice(shown, shown + PAGE);
    const holder = document.createElement("div");
    holder.innerHTML = html`${next.map((q) => questionCard(q, { showPaper }))}`;
    typesetMath(holder);
    listEl.append(...holder.children);
    shown += next.length;
    const left = questions.length - shown;
    more.hidden = left <= 0;
    more.textContent = t("common.showMore", { n: Math.min(PAGE, left) });
  };
  more.addEventListener("click", drawMore);
  if (!questions.length) listEl.innerHTML = html`<p class="hint">${t("library.noQuestions")}</p>`;
  else drawMore();
}

function header({ backTo, backParams, backLabel, title, sub }) {
  return html`<header class="screen-head">
    <button type="button" class="back" data-action="back" data-to="${backTo}" data-params="${JSON.stringify(backParams || {})}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${backLabel}</span>
    </button>
    <h1>${title}</h1>
    ${sub ? html`<p class="hint">${sub}</p>` : ""}
  </header>`;
}

const backHandler = { back: (el) => go(el.dataset.to, JSON.parse(el.dataset.params || "{}")) };

export const subjectScreen = {
  id: "subject",
  parent: "library",
  render(container, { id }) {
    const subject = store.subject(id);
    if (!subject) return go("library");
    const syllabus = store.currentSyllabus();
    const topics = store.topicsWithCounts(syllabus.id, id).sort((a, b) => a.topic.order - b.topic.order);
    const total = topics.reduce((n, x) => n + x.count, 0);
    container.innerHTML = html`${header({
      backTo: "library", backParams: { view: "subjects" }, backLabel: t("library.views.subjects"),
      title: subject.name, sub: `${t("common.questions", { n: total })} · ${t("common.topics", { n: topics.length })}`
    })}
    <div class="rows">${topics.map((x) => {
      const st = store.topicStateFor(syllabus.id, x.topic.id);
      return html`<button type="button" class="row" data-action="open" data-id="${x.topic.id}">
        <span class="row-main"><span class="row-title">${x.topic.name}</span>
          ${st?.studiedCount ? html`<span class="row-sub">${t("library.studied", { n: st.studiedCount })}</span>` : ""}</span>
        <span class="row-count">${x.count}</span>${chev}
      </button>`;
    })}</div>`;
    onAction(container, { ...backHandler, open: (el) => go("topic", { id: el.dataset.id }) });
  }
};

export const topicScreen = {
  id: "topic",
  parent: "library",
  render(container, { id }) {
    const topic = store.topic(id);
    if (!topic) return go("library");
    const subject = store.subject(topic.subjectId);
    const syllabus = store.currentSyllabus();
    const questions = store.questionsFor({ syllabusId: syllabus.id, topicId: id });
    const st = store.topicStateFor(syllabus.id, id);
    const sub = [t("common.questions", { n: questions.length }), st?.studiedCount ? t("library.studied", { n: st.studiedCount }) : null]
      .filter(Boolean).join(" · ");
    container.innerHTML = html`${header({
      backTo: "subject", backParams: { id: topic.subjectId }, backLabel: subject?.name || t("common.back"),
      title: topic.name, sub
    })}
    <div class="qlist" id="qList"></div>
    <button type="button" class="btn btn-quiet more" id="qMore" hidden></button>`;
    onAction(container, backHandler);
    questionList(container, questions, { showPaper: true });
  }
};

export const paperScreen = {
  id: "paper",
  parent: "library",
  render(container, { id }) {
    const paper = store.paper(id);
    if (!paper) return go("library", { view: "papers" });
    const questions = store.questionsOfPaper(id);
    container.innerHTML = html`${header({
      backTo: "library", backParams: { view: "papers" }, backLabel: t("library.views.papers"),
      title: paper.name, sub: [paper.postName, t("common.questions", { n: questions.length })].filter(Boolean).join(" · ")
    })}
    <div class="qlist" id="qList"></div>
    <button type="button" class="btn btn-quiet more" id="qMore" hidden></button>`;
    onAction(container, backHandler);
    questionList(container, questions, { showPaper: false });
  }
};
