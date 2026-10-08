/* Results of a finished test (#/result?id=…), also used for any past test.
   Score in plain words, filters (right / wrong / left / guessed right / guessed wrong),
   sort (test order, slowest, fastest, hardest), review cards, Retake, Practise the
   wrong ones, delete with Undo. */
import { backFrom } from "../../core/back.js";
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { markingText } from "../../domain/scoring.js";
import { maxScore, formatDuration } from "../../domain/testing.js";
import * as store from "../../data/store.js";
import * as tests from "../../data/tests.js";
import { questionCard, difficultyOf } from "../question/card.js";
import { mountCards, forgetPlace } from "../question/pager.js";
import { bindCardActions, listLayout, difficultyOn } from "../question/list.js";
import { copyQuestions } from "../question/copy.js";
import { openStartTest } from "./start-sheet.js";

const filterBy = new Map(); // attempt id → filter
const sortBy = new Map();   // attempt id → sort
const RANK = { E: 1, M: 2, D: 3 };

const stateOf = (r) => (!r.graded ? "ungraded" : r.selected === null ? "blank" : r.isCorrect ? "right" : "wrong");

export function scoreLine(a) {
  const c = a.counts || { correct: 0, wrong: 0, unanswered: 0, total: 0 };
  return t("results.short", { score: formatNumber(a.netScore ?? 0), max: formatNumber(maxScore(c, a.marking)) });
}

/** The Back label: the group's name, the topic's name, or "Test history". */
function backLabel(to, params) {
  if (to === "topic") return store.topic(params.id)?.name || t("history.title");
  if (to === "tests") {
    const a = store.all("attempts").find((x) => x.scope?.type === params.type && (x.scope?.ref || x.scope?.label) === params.ref);
    return a?.scope?.label || t("history.title");
  }
  if (to === "today") return t("tabs.today");
  return t("history.title");
}

export const resultScreen = {
  id: "result",
  parent: "progress",
  render(container, { id, fresh, bt, bp }) {
    // Where Back goes: the screen this result was opened from (a group of tests, a topic), else Test history.
    const { to: backTo, params: backParams, keep } = backFrom({ bt, bp }, ["tests", "topic", "history", "today"], "history");
    const a = store.byId("attempts", id);
    if (!a || a.status === "in_progress") return go("history");
    const c = a.counts;
    const recs = a.answers.map((r) => ({ r, q: store.question(r.questionId) })).filter((x) => x.q);
    const missing = a.answers.length - recs.length;
    const filter = filterBy.get(id) || "all";
    const sort = sortBy.get(id) || "test";
    const mk = markingText(a.marking);
    const graded = c.correct + c.wrong + c.unanswered;
    const attemptedPct = graded ? Math.round(((c.correct + c.wrong) / graded) * 100) : 0;
    const accuracy = c.correct + c.wrong ? Math.round((c.correct / (c.correct + c.wrong)) * 100) : 0;
    const totalMs = a.answers.reduce((s, r) => s + (r.timeMs || 0), 0);
    const guesses = a.answers.filter((r) => r.guessed && r.graded && r.selected !== null);
    const guessRight = guesses.filter((r) => r.isCorrect).length;
    const guessNet = Math.round((guessRight * a.marking.pos - (guesses.length - guessRight) * (a.marking.negNum / a.marking.negDen)) * 100) / 100;
    const counts = {
      all: recs.length,
      right: recs.filter((x) => stateOf(x.r) === "right").length,
      wrong: recs.filter((x) => stateOf(x.r) === "wrong").length,
      blank: recs.filter((x) => stateOf(x.r) === "blank").length,
      "guess-right": recs.filter((x) => x.r.guessed && x.r.isCorrect).length,
      "guess-wrong": recs.filter((x) => x.r.guessed && x.r.graded && x.r.selected !== null && !x.r.isCorrect).length
    };
    let shown = recs.filter((x) => filter === "all" || (filter === "guess-right" ? x.r.guessed && x.r.isCorrect
      : filter === "guess-wrong" ? x.r.guessed && x.r.graded && x.r.selected !== null && !x.r.isCorrect : stateOf(x.r) === filter));
    if (sort !== "test") {
      shown = shown.slice().sort((x, y) => (sort === "slow" ? (y.r.timeMs || 0) - (x.r.timeMs || 0)
        : sort === "fast" ? (x.r.timeMs || Infinity) - (y.r.timeMs || Infinity)
          : (RANK[difficultyOf(y.q)] || 0) - (RANK[difficultyOf(x.q)] || 0)));
    }
    const when = new Date(a.submittedAt).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" });
    const pill = (f) => html`<button type="button" class="pill ${filter === f ? "on" : ""} f-${f}" data-action="filter" data-f="${f}" ${counts[f] || f === "all" ? "" : "disabled"}>
      ${t(`results.filter.${f}`)} <span class="count">${counts[f]}</span></button>`;

    const layout = store.setting("resultLayout", null) || listLayout(); // results remember their own layout
    container.innerHTML = html`<header class="screen-head">
        <div class="head-bar"><button type="button" class="back" data-action="back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${backLabel(backTo, backParams)}</span></button>
          <button type="button" class="icon-btn" data-action="menu" aria-label="${t("common.more")}">⋯</button></div>
        <h1>${a.scope?.label || t("test.title")}</h1>
        <p class="hint">${[when, a.timerMinutes ? t("results.timed", { n: a.timerMinutes }) : t("results.untimed"), a.autoSubmitted ? t("results.autoSubmitted") : null].filter(Boolean).join(" · ")}</p>
      </header>
      <section class="score-panel">
        <div class="score-big"><span class="score-num">${formatNumber(a.netScore)}</span><span class="score-max">/ ${formatNumber(maxScore(c, a.marking))}</span></div>
        <p class="score-words">${t("results.breakdown", { right: c.correct, plus: formatNumber(c.correct * a.marking.pos), wrong: c.wrong, minus: formatNumber(Math.round(c.wrong * (a.marking.negNum / a.marking.negDen) * 100) / 100), blank: c.unanswered })}</p>
        <p class="hint">${t("results.marking", { right: mk.right, wrong: mk.wrong })}</p>
        <div class="score-facts">
          <span><strong>${accuracy}%</strong> ${t("results.accuracy")}</span>
          <span><strong>${attemptedPct}%</strong> ${t("results.attempted")}</span>
          ${totalMs ? html`<span><strong>${formatDuration(totalMs)}</strong> ${t("results.time")}</span>` : ""}
        </div>
        ${guesses.length ? html`<p class="hint">${t("results.guessLine", { n: guesses.length, right: guessRight, net: (guessNet >= 0 ? "+" : "") + formatNumber(guessNet) })}</p>` : ""}
        ${a.timingRemoved ? html`<p class="hint">${t("results.timingRemoved")}</p>` : ""}
        ${missing ? html`<p class="hint">${t("results.missing", { n: missing })}</p>` : ""}
        ${graded < c.total ? html`<p class="hint">${t("results.ungraded", { n: c.total - graded })}</p>` : ""}
      </section>
      <div class="actions-row">
        <button type="button" class="btn" data-action="retake">${t("results.retake")}</button>
        ${counts.wrong + counts.blank ? html`<button type="button" class="btn btn-quiet" data-action="wrong-again">${t("results.practiseWrong", { n: counts.wrong + counts.blank })}</button>` : ""}
      </div>
      <div class="chip-row">${["all", "right", "wrong", "blank"].map(pill)}${counts["guess-right"] + counts["guess-wrong"] ? html`${pill("guess-right")}${pill("guess-wrong")}` : ""}</div>
      <div class="toolbar"><button type="button" class="pill" data-action="sort">${t(`results.sort.${sort}`)} ▾</button>
        <div class="segmented two compact" role="group" aria-label="${t("layout.title")}">${["scroll", "single"].map((l) => html`<button type="button" class="${layout === l ? "on" : ""}" data-action="layout" data-v="${l}" aria-pressed="${String(layout === l)}">${t(`layout.${l}Short2`)}</button>`)}</div></div>
      <div id="rHost"></div>`;

    const order = new Map(a.answers.map((r, i) => [r.questionId, i]));
    const recFor = new Map(recs.map((x) => [x.q.id, x.r]));
    const card = (q0) => questionCard(store.question(q0.id) || q0, { showPaper: true, review: recFor.get(q0.id), n: order.get(q0.id) + 1, showDifficulty: difficultyOn() });
    const view = mountCards(container.querySelector("#rHost"), {
      key: `result:${id}:${filter}:${sort}`, items: shown.map((x) => x.q), card, layout,
      marks: (q) => stateOf(recFor.get(q.id)), empty: t("results.noneHere")
    });
    bindCardActions(container, { view, selectedFor: (q) => { const r = recFor.get(q.id); return r ? (r.selected === null ? "none" : r.selected) : undefined; } });

    onAction(container, {
      back: () => go(backTo, backParams),
      layout: (el) => { if (el.dataset.v !== layout) store.setSetting("resultLayout", el.dataset.v); },
      filter: (el) => { filterBy.set(id, el.dataset.f); forgetPlace(`result:${id}`); go("result", { id, ...keep }); },
      sort: () => runFlow(async () => {
        const s = await chooseAction({ title: t("sort.title"), items: ["test", "slow", "fast", "hard"].map((x) => ({ id: x, label: t(`results.sort.${x}`), current: x === sort })) });
        if (s) { sortBy.set(id, s); go("result", { id, ...keep }); }
      }),
      retake: () => startAgain(a, null),
      "wrong-again": () => startAgain(a, recs.filter((x) => ["wrong", "blank"].includes(stateOf(x.r))).map((x) => x.q.id)),
      menu: () => runFlow(async () => {
        const choice = await chooseAction({ title: a.scope?.label || t("test.title"), items: [
          { id: "copy-wrong", label: t("results.copyWrong") },
          { id: "delete", label: t("results.delete"), danger: true }
        ] });
        if (choice === "copy-wrong") return copyQuestions(recs.filter((x) => ["wrong", "blank"].includes(stateOf(x.r))).map((x) => x.q), `${a.scope?.label} — ${t("results.filter.wrong")}`);
        if (choice === "delete") {
          const ok = await confirmAction({ title: t("results.deleteTitle"), body: t("results.deleteBody"), confirmLabel: t("common.delete"), danger: true });
          if (!ok) return;
          const removed = await store.quietly(() => tests.deleteAttempt(a));
          toast(t("results.deleted"), { actionLabel: t("common.undo"), onAction: () => tests.restoreAttempt(removed), duration: 8000 });
          go("history");
        }
      })
    });
    if (fresh) window.scrollTo(0, 0);
    return undefined;
  }
};

async function startAgain(a, onlyIds) {
  if (tests.activeTest()) return openStartTest(); // asks what to do with the unfinished one
  await tests.retake(a, onlyIds ? { onlyIds, label: t("results.wrongLabel", { label: a.scope?.label || "" }) } : {});
  go("test");
}
