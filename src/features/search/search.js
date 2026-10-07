/* Search (🔍): subjects, topics, papers and questions (text and options),
   in this syllabus or all. Tap or long-press a question to preview it;
   "View all as list" shows every match as full cards.
   #/search?q=…&scope=this|all[&list=1] */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { onLongPress } from "../../core/longpress.js";
import * as store from "../../data/store.js";
import { mountQuestions, addToBankFlow, visibleQuestions } from "../question/list.js";
import { openStartTest } from "../test/start-sheet.js";
import { previewQuestion } from "../library/banks.js";
import { runFlow } from "../../core/dialogs.js";
import { chev } from "../library/library.js";

const state = { q: "", scope: "this" };
const SHOW = 20;

function search(term, scope) {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return null;
  const syllabi = scope === "all" ? store.syllabi() : [store.currentSyllabus()].filter(Boolean);
  const has = (s) => String(s || "").toLowerCase().includes(q);
  const questions = []; const subjectIds = new Set(); const topicIds = new Set(); const papers = [];
  syllabi.forEach((syl) => {
    store.questionsFor({ syllabusId: syl.id }).forEach((x) => {
      subjectIds.add(x.subjectId); topicIds.add(x.topicId);
      if (has(x.text) || x.options.some(has) || has(x.explanation)) questions.push(x);
    });
    store.papersOf(syl.id).forEach((p) => { if (has(p.name) || has(p.postName)) papers.push(p); });
  });
  return {
    subjects: [...subjectIds].map((id) => store.subject(id)).filter((s) => s && has(s.name)),
    topics: [...topicIds].map((id) => store.topic(id)).filter((x) => x && has(x.name)),
    papers, questions
  };
}

export const searchScreen = {
  id: "search",
  render(container, params) {
    if (params.q !== undefined) state.q = params.q;
    if (params.scope) state.scope = params.scope;
    const asList = params.list === "1";
    const multi = store.syllabi().length > 1;

    if (asList) {
      const r = search(state.q, state.scope);
      const questions = r?.questions || [];
      container.innerHTML = html`<header class="screen-head">
        <div class="head-bar"><button type="button" class="back" data-action="back-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("search.title")}</span></button></div>
        <h1>“${state.q}”</h1><p class="hint">${t("common.questions", { n: questions.length })}</p></header>
        <div class="actions-row"><button type="button" class="btn" data-action="practice">▶ ${t("practice.button")}</button>
          <button type="button" class="btn btn-quiet" data-action="bank-all">${t("search.addAllToBank")}</button></div>
        <div id="qHost"></div>`;
      onAction(container, {
        "back-search": () => go("search", { q: state.q, scope: state.scope }),
        "bank-all": () => runFlow(() => addToBankFlow(questions.map((q) => q.id))),
        practice: () => openStartTest({ scope: { type: "search", ref: state.q, label: t("search.testLabel", { q: state.q }) }, questions: visibleQuestions(`search:${state.scope}:${state.q}`, questions), keepOrder: false })
      });
      mountQuestions(container.querySelector("#qHost"), { key: `search:${state.scope}:${state.q}`, questions, showPaper: true });
      return;
    }

    container.innerHTML = html`<section class="search-screen">
      <input type="search" class="search big" id="searchInput" placeholder="${t("search.placeholder")}" value="${state.q}" autocomplete="off" enterkeyhint="search">
      ${multi ? html`<div class="segmented two">${["this", "all"].map((s) => html`
        <button type="button" class="${state.scope === s ? "on" : ""}" data-action="scope" data-s="${s}">${s === "this" ? store.currentSyllabus()?.name : t("search.allSyllabi")}</button>`)}</div>` : ""}
      <div id="results"></div>
    </section>`;
    const results = container.querySelector("#results");
    const draw = () => {
      const r = search(state.q, state.scope);
      if (!r) { results.innerHTML = html`<p class="hint pad">${t("search.hint")}</p>`; return; }
      const total = r.subjects.length + r.topics.length + r.papers.length + r.questions.length;
      if (!total) { results.innerHTML = html`<p class="hint pad">${t("library.nothingFound", { q: state.q })}</p>`; return; }
      const section = (title, rows) => (rows.length ? html`<h3 class="rows-head">${title}</h3><div class="rows">${rows}</div>` : "");
      results.innerHTML = html`
        ${section(t("library.views.subjects"), r.subjects.map((s) => html`<button type="button" class="row" data-action="open" data-to="subject" data-id="${s.id}">
          <span class="row-main"><span class="row-title">${s.name}</span></span>${chev}</button>`))}
        ${section(t("library.views.topics"), r.topics.slice(0, SHOW).map((x) => html`<button type="button" class="row" data-action="open" data-to="topic" data-id="${x.id}">
          <span class="row-main"><span class="row-title">${x.name}</span><span class="row-sub">${store.subject(x.subjectId)?.name || ""}</span></span>${chev}</button>`))}
        ${section(t("library.views.papers"), r.papers.slice(0, SHOW).map((p) => html`<button type="button" class="row" data-action="open" data-to="paper" data-id="${p.id}">
          <span class="row-main"><span class="row-title">${p.name}</span><span class="row-sub">${p.postName || ""}</span></span>${chev}</button>`))}
        ${r.questions.length ? html`<h3 class="rows-head">${t("search.questions", { n: formatNumber(r.questions.length) })}</h3>
          <div class="rows" id="qRows">${r.questions.slice(0, SHOW).map((q) => html`<button type="button" class="row" data-action="preview" data-id="${q.id}" data-lp="1">
            <span class="row-main"><span class="clamp">${q.text}</span>
            <span class="row-sub">${[store.paper(q.paperId)?.name, store.topic(q.topicId)?.name].filter(Boolean).join(" · ")}</span></span></button>`)}</div>
          <button type="button" class="btn btn-quiet more" data-action="as-list">${t("search.viewAll", { n: formatNumber(r.questions.length) })}</button>` : ""}`;
    };
    draw();
    const input = container.querySelector("#searchInput");
    let timer = null;
    input.addEventListener("input", () => { state.q = input.value; clearTimeout(timer); timer = setTimeout(draw, 250); });
    if (!state.q) setTimeout(() => input.focus(), 50);
    const preview = (id) => {
      const q = store.question(id);
      previewQuestion(q, {
        actions: html`<div class="sheet-actions">
          <button type="button" class="btn btn-quiet" data-action="go-topic">${t("search.openTopic")}</button>
          <button type="button" class="btn" data-action="go-paper">${t("search.openPaper")}</button></div>`,
        handlers: { "go-topic": () => go("topic", { id: q.topicId }), "go-paper": () => go("paper", { id: q.paperId }) }
      });
    };
    onAction(container, {
      scope: (el) => { state.scope = el.dataset.s; draw(); container.querySelectorAll("[data-action=scope]").forEach((b) => b.classList.toggle("on", b === el)); },
      open: (el) => go(el.dataset.to, { id: el.dataset.id }),
      preview: (el) => preview(el.dataset.id),
      "as-list": () => go("search", { q: state.q, scope: state.scope, list: "1" })
    });
    onLongPress(results, (el) => preview(el.dataset.id));
  }
};
