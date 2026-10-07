/* Progress tab. Phase 3: Test history (the old Attempts tab).
   Summary, insights and drill-down arrive in Phase 4.
   #/progress                     history grouped by what was tested
   #/tests?type=…&ref=…           every test of one group */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import * as store from "../../data/store.js";
import { scoreLine } from "../test/results.js";
import { openStartTest, progressText } from "../test/start-sheet.js";
import * as tests from "../../data/tests.js";

const GROUPS = ["all", "paper", "subject", "topic", "bank", "other", "ai"];
const OTHER = new Set(["mock", "weak", "wrong", "flagged", "review", "search", "subject-all", "listing", "wrong-review"]);
const state = { group: "all", sort: "recent", term: "" };

const groupOf = (a) => (a.kind === "ai" ? "ai" : ["paper", "subject", "topic", "bank"].includes(a.scope?.type) ? a.scope.type : "other");
const keyOf = (a) => `${a.scope?.type || "x"}|${a.scope?.ref || a.scope?.label || ""}`;
const pct = (a) => (a.counts?.total ? a.counts.correct / a.counts.total : 0);

export function finishedTests(syllabusId) {
  return store.attemptsOf(syllabusId).filter((a) => a.status !== "in_progress");
}

/** Tests of a listing (e.g. a topic page's "3 tests ›"). */
export const testsFor = (syllabusId, type, ref) => finishedTests(syllabusId).filter((a) => a.scope?.type === type && a.scope?.ref === ref);

export const progressScreen = {
  id: "progress",
  tab: 3,
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) {
      container.innerHTML = html`<section class="empty"><h1>${t("progress.emptyTitle")}</h1><p>${t("progress.emptyBody")}</p></section>`;
      return;
    }
    const all = finishedTests(syllabus.id);
    const active = tests.activeTest();
    const present = new Set(all.map(groupOf));
    const groups = GROUPS.filter((g) => g === "all" || present.has(g));
    if (!groups.includes(state.group)) state.group = "all";

    const map = new Map();
    all.filter((a) => state.group === "all" || groupOf(a) === state.group).forEach((a) => {
      const k = keyOf(a);
      if (!map.has(k)) map.set(k, { key: k, type: a.scope?.type, ref: a.scope?.ref, label: a.scope?.label || "", list: [] });
      map.get(k).list.push(a);
    });
    let rows = [...map.values()].map((g) => {
      g.list.sort((x, y) => y.submittedAt - x.submittedAt);
      g.latest = g.list[0];
      g.label = g.latest.scope?.label || g.label;
      g.avg = g.list.reduce((s, a) => s + pct(a), 0) / g.list.length;
      return g;
    });
    const q = state.term.trim().toLowerCase();
    if (q) rows = rows.filter((g) => g.label.toLowerCase().includes(q));
    rows.sort({
      recent: (x, y) => y.latest.submittedAt - x.latest.submittedAt,
      az: (x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }),
      best: (x, y) => y.avg - x.avg,
      worst: (x, y) => x.avg - y.avg
    }[state.sort]);

    container.innerHTML = html`<section class="progress">
      <h1 class="page-title">${t("tabs.progress")}</h1>
      ${active ? html`<button type="button" class="continue-card" data-action="continue">
        <span class="row-main"><span class="row-title">${t("today.continue", { label: active.scope?.label || "" })}</span>
        <span class="row-sub">${progressText(active)}</span></span><span class="chev-txt">›</span></button>` : ""}
      <div class="actions-row"><button type="button" class="btn" data-action="start">${t("today.startTest")}</button></div>
      <p class="hint">${t("progress.soon")}</p>
      <h2 class="section-title">${t("history.title")} <span class="count">${all.length}</span></h2>
      ${all.length ? html`
        <div class="chip-row">${groups.map((g) => html`<button type="button" class="pill ${state.group === g ? "on" : ""}" data-action="group" data-g="${g}">${t(`history.group.${g}`)}</button>`)}</div>
        <input type="search" class="search" id="hSearch" placeholder="${t("history.search")}" value="${state.term}" autocomplete="off">
        <div class="toolbar"><button type="button" class="pill" data-action="sort">${t(`history.sort.${state.sort}`)} ▾</button></div>
        <div class="rows" id="hRows">${rows.length ? rows.map((g) => html`
          <button type="button" class="row" data-action="open" data-key="${g.key}">
            <span class="row-main"><span class="row-title">${g.label}</span>
              <span class="row-sub">${t("history.groupSub", { n: g.list.length, avg: Math.round(g.avg * 100), when: dateText(g.latest.submittedAt) })}</span></span>
            <span class="row-count">${formatNumber(g.latest.netScore)}</span><span class="chev-txt">›</span>
          </button>`) : html`<p class="hint pad">${t("library.nothingFound", { q: state.term })}</p>`}</div>`
        : html`<p class="hint pad">${t("history.none")}</p>`}
    </section>`;

    const input = container.querySelector("#hSearch");
    let timer = null;
    input?.addEventListener("input", () => { state.term = input.value; clearTimeout(timer); timer = setTimeout(() => go("progress"), 300); });
    onAction(container, {
      continue: () => go("test"),
      start: () => openStartTest(),
      group: (el) => { state.group = el.dataset.g; go("progress"); },
      sort: () => runFlow(async () => {
        const s = await chooseAction({ title: t("sort.title"), items: ["recent", "az", "best", "worst"].map((x) => ({ id: x, label: t(`history.sort.${x}`), current: x === state.sort })) });
        if (s) { state.sort = s; go("progress"); }
      }),
      open: (el) => {
        const g = map.get(el.dataset.key);
        if (g.list.length === 1) go("result", { id: g.list[0].id });
        else go("tests", { type: g.type || "", ref: g.ref || g.label });
      }
    });
    if (state.term && input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
};

export function dateText(ms) {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const testsScreen = {
  id: "tests",
  parent: "progress",
  render(container, { type, ref }) {
    const syllabus = store.currentSyllabus();
    const list = finishedTests(syllabus.id).filter((a) => (a.scope?.type || "") === type && (a.scope?.ref || a.scope?.label) === ref)
      .sort((x, y) => y.submittedAt - x.submittedAt);
    if (!list.length) return go("progress");
    container.innerHTML = html`<header class="screen-head">
      <div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("history.title")}</span></button></div>
      <h1>${list[0].scope?.label || ""}</h1><p class="hint">${t("common.tests", { n: list.length })}</p></header>
      <div class="rows">${list.map((a) => html`<button type="button" class="row" data-action="open" data-id="${a.id}">
        <span class="row-main"><span class="row-title">${new Date(a.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
        <span class="row-sub">${t("history.testSub", { right: a.counts.correct, wrong: a.counts.wrong, blank: a.counts.unanswered })}${a.timerMinutes ? ` · ${t("results.timed", { n: a.timerMinutes })}` : ""}${a.autoSubmitted ? ` · ${t("results.autoSubmitted")}` : ""}</span></span>
        <span class="row-count">${scoreLine(a)}</span><span class="chev-txt">›</span></button>`)}</div>`;
    onAction(container, { back: () => go("progress"), open: (el) => go("result", { id: el.dataset.id }) });
  }
};
