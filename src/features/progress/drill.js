/* Progress drill-down: subject → topic → question.
   #/stats-subject?id=…   #/stats-topic?id=…   #/stats-topics (all topics) */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet } from "../../core/sheet.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import { typesetMath } from "../../core/math.js";
import { letterFor } from "../../domain/text.js";
import { formatDuration } from "../../domain/testing.js";
import { pickByBasis, guessSummary, isTimed, isAnswered } from "../../domain/stats.js";
import * as store from "../../data/store.js";
import { questionCard } from "../question/card.js";
import { labelFor, labelDot } from "../library/topic-actions.js";
import { statsContext } from "./data.js";
import { howBlock, insightsBlock, marksBlock, accuracyRows, accRow, rowSub, insightHandlers, practiseTopic, testsFor, dateText } from "./progress.js";

const sorts = { subject: "weak", all: "weak" };
const back = (to, label, params = {}) => html`<div class="head-bar"><button type="button" class="back" data-action="back" data-to="${to}" data-params="${JSON.stringify(params)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${label}</span></button></div>`;
const backHandler = { back: (el) => go(el.dataset.to, JSON.parse(el.dataset.params || "{}")) };
const pctText = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

function sortFlow(key, options, redraw) {
  return runFlow(async () => {
    const s = await chooseAction({ title: t("sort.title"), items: options.map((x) => ({ id: x, label: t(`stats.sort.${x}`), current: x === sorts[key] })) });
    if (s) { sorts[key] = s; redraw(); }
  });
}

function topicSub(ctx, r, { withSubject = false } = {}) {
  const st = store.topicStateFor(ctx.syllabus.id, r.id);
  const n = testsFor(ctx.syllabus.id, "topic", r.id).length;
  const extra = [st?.studiedCount ? t("library.studied", { n: st.studiedCount }) : null, n ? t("common.tests", { n }) : null];
  const sub = rowSub(r, extra);
  return withSubject ? `${store.subject(store.topic(r.id)?.subjectId)?.name || ""} · ${sub}` : sub;
}

/* ---------- subject ---------- */

export const statsSubjectScreen = {
  id: "stats-subject",
  parent: "progress",
  render(container, { id }) {
    const subject = store.subject(id);
    const syllabus = store.currentSyllabus();
    if (!subject || !syllabus) return go("progress");
    const ctx = statsContext(syllabus, { scope: { subjectId: id } });
    const topicIds = [...ctx.countByTopic.keys()];
    const rows = accuracyRows(ctx, ctx.records, { by: "topicId", ids: topicIds, sort: sorts.subject });
    container.innerHTML = html`<header class="screen-head">${back("progress", t("tabs.progress"))}
      <h1>${subject.name}</h1><p class="hint">${t("common.topics", { n: topicIds.length })} · ${t("stats.inPapers", { n: ctx.questions.length })}</p></header>
      ${howBlock(ctx, ctx.records, { trendKeep: (r) => r.subjectId === id })}
      ${insightsBlock(ctx, ctx.records, { scope: { subjectId: id } })}
      ${marksBlock(ctx, ctx.records)}
      <div class="section-row"><h2 class="section-title">${t("stats.topics")}</h2>
        <button type="button" class="pill" data-action="sort">${t(`stats.sort.${sorts.subject}`)} ▾</button></div>
      <div class="rows">${rows.map((r) => accRow(r, { title: html`${labelDot(labelFor(syllabus.id, r.id))}${store.topic(r.id)?.name || ""}`, sub: topicSub(ctx, r), action: "topic" }))}</div>
      <div class="rows links"><button type="button" class="row" data-action="library"><span class="row-main"><span class="row-title">${t("stats.openInLibrary")}</span></span><span class="chev-txt">›</span></button></div>`;
    onAction(container, {
      ...backHandler, ...insightHandlers,
      sort: () => sortFlow("subject", ["weak", "strong", "most", "hard", "az"], () => store.touch()),
      topic: (el) => go("stats-topic", { id: el.dataset.id }),
      library: () => go("subject", { id })
    });
  }
};

/* ---------- topic ---------- */

export const statsTopicScreen = {
  id: "stats-topic",
  parent: "progress",
  render(container, { id }) {
    const topic = store.topic(id);
    const syllabus = store.currentSyllabus();
    if (!topic || !syllabus) return go("progress");
    const subject = store.subject(topic.subjectId);
    const ctx = statsContext(syllabus, { scope: { topicId: id } });
    const whole = statsContext(syllabus);
    const recs = ctx.records;

    // Time: this topic vs your average.
    const timed = pickByBasis(recs, ctx.basis, isTimed);
    const allTimed = pickByBasis(whole.records, whole.basis, isTimed);
    const avg = (xs) => (xs.length ? xs.reduce((s, r) => s + r.timeMs, 0) / xs.length : null);
    const myAvg = avg(timed); const overall = avg(allTimed);
    const g = guessSummary(pickByBasis(recs, ctx.basis, (r) => r.guessed && isAnswered(r)), ctx.marking);
    // Right / answered by difficulty.
    const answered = pickByBasis(recs, ctx.basis);
    const levels = ["E", "M", "D"].map((d) => {
      const xs = answered.filter((r) => r.difficulty === d);
      return { d, n: xs.length, right: xs.filter((r) => r.isCorrect).length };
    }).filter((x) => x.n);
    // Questions whose latest answer is wrong or blank.
    const latest = new Map();
    ctx.allRecords.filter((r) => r.graded).forEach((r) => latest.set(r.questionId, r));
    const wrong = [...latest.values()].filter((r) => !r.isCorrect).map((r) => store.question(r.questionId)).filter(Boolean);
    const st = store.topicStateFor(syllabus.id, id);
    const nTests = testsFor(syllabus.id, "topic", id);

    container.innerHTML = html`<header class="screen-head">${back("stats-subject", subject?.name || t("tabs.progress"), { id: topic.subjectId })}
      <h1>${labelDot(labelFor(syllabus.id, id))}${topic.name}</h1>
      <p class="hint">${[t("stats.inPapers", { n: ctx.questions.length }), st?.studiedCount ? t("library.studied", { n: st.studiedCount }) : null, nTests.length ? t("common.tests", { n: nTests.length }) : null].filter(Boolean).join(" · ")}</p></header>
      <div class="actions-row">
        <button type="button" class="btn" data-action="practise">▶ ${t("practice.button")}</button>
        <button type="button" class="btn btn-quiet" data-action="library">${t("stats.openInLibrary")}</button>
      </div>
      ${howBlock(ctx, recs, { trendKeep: (r) => r.topicId === id })}
      ${marksBlock(ctx, recs)}
      ${myAvg || g.n || levels.length ? html`<h2 class="section-title">${t("stats.details")}</h2>
      <table class="counts"><tbody>
        ${myAvg ? html`<tr><th>${t("stats.avgTime")}<span class="row-sub">${t("stats.yourAvg", { time: formatDuration(overall) })}</span></th><td>${formatDuration(myAvg)}</td></tr>` : ""}
        ${g.n ? html`<tr><th>${t("stats.guesses")}<span class="row-sub">${t("stats.guessSub", { right: g.right, n: g.n })}</span></th><td>${g.net > 0 ? "+" : ""}${formatNumber(g.net)}</td></tr>` : ""}
        ${levels.map((l) => html`<tr><th>${t(`question.difficulty.${l.d}`)}<span class="row-sub">${t("stats.levelSub", { right: l.right, n: l.n })}</span></th><td>${pctText(l.right / l.n)}</td></tr>`)}
      </tbody></table>` : ""}
      <h2 class="section-title">${t("stats.wrongList")} <span class="count">${wrong.length}</span></h2>
      ${wrong.length ? html`<div class="rows" id="wrongRows">${wrong.map((q) => html`<button type="button" class="row" data-action="question" data-id="${q.id}">
        <span class="row-main"><span class="clamp">${q.text}</span><span class="row-sub">${store.paper(q.paperId)?.name || ""}</span></span><span class="chev-txt">›</span></button>`)}</div>`
        : html`<p class="hint">${t("stats.noWrong")}</p>`}`;
    onAction(container, {
      ...backHandler,
      practise: () => practiseTopic(id),
      library: () => go("topic", { id }),
      question: (el) => questionHistory(el.dataset.id, ctx.allRecords)
    });
  }
};

/** A question with every answer you gave it in tests. */
function questionHistory(qid, records) {
  const q = store.question(qid);
  const mine = records.filter((r) => r.questionId === qid).slice().reverse();
  const body = openSheet(html`${questionCard(q, { showPaper: true })}
    <h3>${t("stats.pastAnswers")}</h3>
    <ul class="issues">${mine.map((r) => html`<li><p>${dateText(r.at)} · ${r.selected === null ? t("review.blank") : `${letterFor(r.selected)} · ${r.isCorrect ? t("review.right") : t("review.wrong")}`}${r.guessed ? ` · 🤔` : ""}${r.timeMs ? ` · ${formatDuration(r.timeMs)}` : ""}</p></li>`)}</ul>`, {}, { label: t("question.preview") });
  body.querySelectorAll(".qcard-badges").forEach((el) => el.remove());
  typesetMath(body);
}

/* ---------- all topics ---------- */

export const statsTopicsScreen = {
  id: "stats-topics",
  parent: "progress",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const ctx = statsContext(syllabus);
    const rows = accuracyRows(ctx, ctx.records, { by: "topicId", ids: [...ctx.countByTopic.keys()], sort: sorts.all });
    container.innerHTML = html`<header class="screen-head">${back("progress", t("tabs.progress"))}
      <h1>${t("stats.allTopics")}</h1><p class="hint">${t("common.topics", { n: rows.length })}</p></header>
      <div class="toolbar"><button type="button" class="pill" data-action="sort">${t(`stats.sort.${sorts.all}`)} ▾</button></div>
      <div class="rows">${rows.map((r) => accRow(r, { title: html`${labelDot(labelFor(syllabus.id, r.id))}${store.topic(r.id)?.name || ""}`, sub: topicSub(ctx, r, { withSubject: true }), action: "topic" }))}</div>`;
    onAction(container, {
      ...backHandler,
      sort: () => sortFlow("all", ["weak", "strong", "most", "hard", "az"], () => store.touch()),
      topic: (el) => go("stats-topic", { id: el.dataset.id })
    });
  }
};
