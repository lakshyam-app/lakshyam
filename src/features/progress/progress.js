/* Progress tab: how am I doing → what stands out → where my marks go → subjects.
   #/progress            summary (this file)
   #/history             test history grouped by what was tested
   #/tests?type=&ref=    every test of one group
   Drill-down (subject → topic) is in drill.js; detailed tables in tables.js. */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { runFlow, chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { sparkline, marksBar, accBar } from "../../core/charts.js";
import * as store from "../../data/store.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import { takeSnapshot } from "../../data/snapshots.js";
import { summarize, findInsights, accuracyBy, pickByBasis, testTrend, avgDifficulty, markingInfo, LOW_N } from "../../domain/stats.js";
import { formatDuration } from "../../domain/testing.js";
import { scoreLine } from "../test/results.js";
import { openStartTest, progressText } from "../test/start-sheet.js";
import * as tests from "../../data/tests.js";
import { difficultyOf } from "../question/card.js";
import { statsContext, finishedTests, prefs, PERIODS } from "./data.js";

export { finishedTests };
/** Tests of a listing (e.g. a topic page's "3 tests ›"). */
export const testsFor = (syllabusId, type, ref) => finishedTests(syllabusId).filter((a) => a.scope?.type === type && a.scope?.ref === ref);

const pctText = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const signed = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${formatNumber(Math.abs(Math.round(x * 10) / 10))}`;
export const dateText = (ms) => new Date(ms).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" });
const chev = html`<span class="chev-txt">›</span>`;
let subjectSort = "weak";

/* ---------- shared pieces (also used by drill.js) ---------- */

export function howBlock(ctx, records, { trendKeep = null, title = true } = {}) {
  const s = summarize(records, ctx.marking, ctx.basis);
  if (!s.n) return html`<p class="hint pad">${t("stats.noAnswersYet")}</p>`;
  const prev = ctx.period !== "all" ? summarize(trendKeep ? ctx.prevRecords.filter(trendKeep) : ctx.prevRecords, ctx.marking, ctx.basis) : null;
  const delta = prev && prev.n ? s.per100 - prev.per100 : null;
  const trend = testTrend(ctx.attempts, trendKeep || (() => true)).slice(-10)
    .map((p) => ({ ...p, title: `${dateText(p.at)}: ${pctText(p.value)}` }));
  return html`${title ? html`<h2 class="section-title">${t("stats.how")}</h2>` : ""}
    <div class="hero">
      <span class="hero-num">${formatNumber(Math.round(s.per100 * 10) / 10)}</span>
      <span class="hero-unit">${t("stats.per100")}</span>
      ${delta !== null ? html`<span class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "↑" : "↓"} ${signed(delta)} ${t("stats.vsPrev", { n: ctx.period })}</span>` : ""}
    </div>
    <details class="info"><summary>${t("stats.what")}</summary><p>${t("stats.per100Info", markingWords(ctx.marking))}</p>
      <p>${t(`stats.basisInfo.${ctx.basis}`)}</p></details>
    <p class="facts"><span><strong>${pctText(s.accuracy)}</strong> ${t("stats.accuracy")}</span>
      <span><strong>${pctText(s.attempted)}</strong> ${t("stats.attempted")}</span>
      <span><strong>${formatNumber(s.n)}</strong> ${t("stats.questionsCounted")}</span></p>
    ${trend.length >= 2 ? html`<div class="trend">${sparkline(trend, { label: t("stats.trendLabel", { n: trend.length }) })}
      <p class="hint">${t("stats.trend", { n: trend.length, first: pctText(trend[0].value), last: pctText(trend[trend.length - 1].value) })}</p></div>` : ""}`;
}

export function markingWords(m) {
  const { pen, breakEven } = markingInfo(m);
  const frac = m.negNum && m.negDen ? `${m.negNum}/${m.negDen}` : "0";
  return { pos: m.pos, pen: frac, penN: Math.round(pen * 100) / 100, be: Math.round(breakEven * 100) };
}

export function marksBlock(ctx, records) {
  const s = summarize(records, ctx.marking, ctx.basis);
  if (!s.n) return "";
  const right = Math.round((s.right / s.n) * 1000) / 10;
  return html`<h2 class="section-title">${t("stats.marksTitle")}</h2>
    ${marksBar([
      { key: "right", share: right, label: t("stats.mb.right", { n: formatNumber(s.earned100) }) },
      { key: "wrong", share: s.wrong100, label: t("stats.mb.wrong", { n: formatNumber(s.wrong100), lost: formatNumber(s.lost100) }) },
      { key: "blank", share: s.blank100, label: t("stats.mb.blank", { n: formatNumber(s.blank100) }) }
    ], t("stats.marksTitle"))}
    <p class="hint">${t("stats.mbNote", { right: formatNumber(s.earned100), lost: formatNumber(s.lost100), blank: formatNumber(s.blank100) })}</p>`;
}

/** Insight sentences with one action each. */
export function insightsBlock(ctx, records, { scope = null } = {}) {
  const counts = scope?.subjectId
    ? new Map([...ctx.countByTopic].filter(([id]) => store.topic(id)?.subjectId === scope.subjectId)) : ctx.countByTopic;
  const catchAll = new Set([...counts.keys()].filter((id) => store.topic(id)?.isFallback));
  const list = findInsights({ records, allRecords: ctx.allRecords, questionCountByTopic: counts, marking: ctx.marking, now: ctx.now, basis: ctx.basis, catchAll });
  if (!list.length) return "";
  const topicName = (id) => nameLabel(store.topic(id));
  const subName = (id) => nameLabel(store.subject(id));
  const row = (i) => {
    switch (i.kind) {
      case "weakest": return { text: t("insight.weakest", { topic: topicName(i.topicId), sub: subName(store.topic(i.topicId)?.subjectId), pct: pctText(i.pct), n: i.n }), act: "practise", id: i.topicId };
      case "slipping": return { text: t("insight.slipping", { topic: topicName(i.topicId), from: pctText(i.before), to: pctText(i.after) }), act: "see", id: i.topicId };
      case "improving": return { text: t("insight.improving", { topic: topicName(i.topicId), from: pctText(i.before), to: pctText(i.after) }), act: "see", id: i.topicId };
      case "guessing": return { text: t("insight.guessing", { subject: subName(i.subjectId), net: signed(i.net), n: i.n, acc: pctText(i.acc), be: pctText(i.breakEven) }), act: "why", id: i.subjectId };
      case "slowest": return { text: t("insight.slowest", { topic: topicName(i.topicId), time: formatDuration(i.ms), avg: formatDuration(i.avgMs) }), act: "practise", id: i.topicId };
      case "untouched": return { text: t("insight.untouched", { topic: topicName(i.topicId), sub: subName(store.topic(i.topicId)?.subjectId), n: i.count }), act: "start", id: i.topicId };
      default: return null;
    }
  };
  return html`<h2 class="section-title">${t("stats.stands")}</h2>
    <ul class="insights">${list.map(row).filter(Boolean).map((r) => html`<li><span>${r.text}</span>
      <button type="button" class="btn btn-quiet btn-small" data-action="insight" data-act="${r.act}" data-id="${r.id}">${t(`insight.act.${r.act}`)}</button></li>`)}</ul>`;
}

export function practiseTopic(topicId) {
  const syl = store.currentSyllabus();
  const topic = store.topic(topicId);
  if (!topic) return;
  return openStartTest({ scope: { type: "topic", ref: topicId, label: topic.name }, questions: store.questionsFor({ syllabusId: syl.id, topicId }), keepOrder: false });
}

export const insightHandlers = {
  insight: (el) => {
    const { act, id } = el.dataset;
    if (act === "practise" || act === "start") return practiseTopic(id);
    if (act === "see") return go("stats-topic", { id });
    if (act === "why") return go("stats-tables", { tab: "guess" });
  }
};

/** Accuracy rows (subjects or topics) with a sort. */
export function accuracyRows(ctx, records, { by, ids, sort }) {
  const acc = accuracyBy(pickByBasis(records, ctx.basis), (r) => r[by]);
  const diffOf = (id) => avgDifficulty(ctx.questions.filter((q) => q[by] === id).map((q) => difficultyOf(q)));
  const counts = by === "subjectId" ? ctx.countBySubject : ctx.countByTopic;
  const rows = ids.map((id) => {
    const a = acc[id];
    return { id, freq: counts.get(id) || 0, practised: Boolean(a), pct: a ? a.correct / a.total : null, adj: a ? a.adj : null, n: a?.total || 0, low: a ? a.total < LOW_N : false, diff: diffOf(id) };
  });
  // Not-tried rows go after the practised ones (they have no accuracy to compare).
  const adj = (r) => (r.adj === null ? 2 : r.adj);
  const adjDesc = (r) => (r.adj === null ? -1 : r.adj);
  const name = (r) => (by === "subjectId" ? store.subject(r.id)?.name : store.topic(r.id)?.name) || "";
  rows.sort({
    weak: (a, b) => adj(a) - adj(b) || b.freq - a.freq,
    strong: (a, b) => adjDesc(b) - adjDesc(a),
    most: (a, b) => b.freq - a.freq,
    hard: (a, b) => (b.diff?.avg || 0) - (a.diff?.avg || 0),
    az: (a, b) => name(a).localeCompare(name(b))
  }[sort] || ((a, b) => adj(a) - adj(b)));
  return rows;
}

export function accRow(r, { title, sub, action, extra = "" }) {
  return html`<button type="button" class="row stat-row" data-action="${action}" data-id="${r.id}">
    <span class="row-main"><span class="row-title">${title}</span>
      <span class="row-sub">${sub}</span>
      ${r.practised ? accBar(r.pct, { muted: r.low }) : ""}</span>
    <span class="stat-pct ${r.practised ? "" : "muted"}">${r.practised ? pctText(r.pct) : t("stats.notTried")}</span>${extra}${chev}
  </button>`;
}

export function rowSub(r, extra = []) {
  return [t("stats.inPapers", { n: r.freq }), r.practised ? t("stats.answered", { n: r.n }) : null,
    r.low ? t("stats.fewAnswers") : null, r.diff ? t("stats.diffAvg", { n: r.diff.avg }) : null, ...extra].filter(Boolean).join(" · ");
}

/* ---------- ⚙ settings: counting basis, start fresh ---------- */

function settingsSheet() {
  const p = prefs();
  openSheet(html`<h2>${t("stats.settings")}</h2>
    <h3>${t("stats.basisTitle")}</h3>
    <div class="menu">${["first", "latest", "all"].map((b) => html`<button type="button" class="menu-item ${p.basis === b ? "is-current" : ""}" data-action="basis" data-b="${b}">
      <span class="row-main"><span>${t(`stats.basis.${b}`)}</span><span class="row-sub">${t(`stats.basisInfo.${b}`)}</span></span>${p.basis === b ? html`<span class="tick">✓</span>` : ""}</button>`)}</div>
    <p class="hint">${t("stats.fewInfo", { n: LOW_N })}</p>
    <h3>${t("stats.freshTitle")}</h3>
    ${p.resetAt ? html`<p class="hint">${t("stats.freshSince", { date: dateText(p.resetAt) })}</p>
      <button type="button" class="link" data-action="unfresh">${t("stats.unfresh")}</button>` : ""}
    <p class="hint">${t("stats.freshInfo")}</p>
    <button type="button" class="btn btn-quiet" data-action="fresh-keep">${t("stats.freshKeep")}</button>
    <button type="button" class="link danger" data-action="fresh-delete">${t("stats.freshDelete")}</button>
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    basis: async (el) => { await store.setSetting("statsBasis", el.dataset.b); settingsSheet(); },
    unfresh: async () => { await store.setSetting("statsResetAt", 0); settingsSheet(); toast(t("stats.unfreshDone")); },
    "fresh-keep": () => runFlow(async () => {
      const ok = await confirmAction({ title: t("stats.freshKeepTitle"), body: t("stats.freshKeepBody"), confirmLabel: t("stats.freshButton") });
      if (ok) { await store.setSetting("statsResetAt", Date.now()); toast(t("stats.freshDone")); }
    }),
    "fresh-delete": () => runFlow(async () => {
      const n = store.all("attempts").filter((a) => a.status !== "in_progress").length;
      const ok = await confirmAction({ title: t("stats.freshDeleteTitle"), body: t("stats.freshDeleteBody", { n }), confirmLabel: t("stats.freshDeleteButton"), danger: true });
      if (!ok) return;
      await takeSnapshot("fresh");
      await store.apply({ attempts: { delete: store.all("attempts").filter((a) => a.status !== "in_progress").map((a) => a.id) }, settings: { put: [{ id: "statsResetAt", value: Date.now() }] } });
      toast(t("stats.freshDeleted"));
    }),
    close: () => closeSheet()
  }, { label: t("stats.settings") });
}

/* ---------- Progress tab ---------- */

export const progressScreen = {
  id: "progress",
  tab: 3,
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) {
      container.innerHTML = html`<section class="empty"><h1>${t("progress.emptyTitle")}</h1><p>${t("progress.emptyBody")}</p></section>`;
      return;
    }
    const ctx = statsContext(syllabus);
    const active = tests.activeTest();
    const subjectIds = [...ctx.countBySubject.keys()];
    const rows = accuracyRows(ctx, ctx.records, { by: "subjectId", ids: subjectIds, sort: subjectSort });
    const hasData = ctx.records.some((r) => r.graded);
    const history = finishedTests(syllabus.id).length;

    container.innerHTML = html`<section class="progress">
      <div class="prog-head">
        <h1>${t("tabs.progress")}</h1>
        <button type="button" class="icon-btn" data-action="settings" aria-label="${t("stats.settings")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
        </button>
      </div>
      <div class="toolbar">
        <div class="segmented two mini"><button type="button" class="${ctx.mode === "pyq" ? "on" : ""}" data-action="mode" data-m="pyq">${t("stats.pyq")}</button>
          <button type="button" class="${ctx.mode === "ai" ? "on" : ""}" data-action="mode" data-m="ai">${t("stats.ai")}</button></div>
        <button type="button" class="pill" data-action="period">${t(`stats.period.${ctx.period}`)} ▾</button>
      </div>
      ${ctx.resetAt ? html`<p class="hint">${t("stats.freshSince", { date: dateText(ctx.resetAt) })}</p>` : ""}
      ${active ? html`<button type="button" class="continue-card" data-action="continue">
        <span class="row-main"><span class="row-title">${t("today.continue", { label: active.scope?.label || "" })}</span>
        <span class="row-sub">${progressText(active)}</span></span>${chev}</button>` : ""}
      ${hasData ? html`
        ${howBlock(ctx, ctx.records)}
        ${insightsBlock(ctx, ctx.records)}
        ${marksBlock(ctx, ctx.records)}` : html`<p class="hint pad">${ctx.mode === "ai" ? t("stats.noAi") : t("stats.noTests")}</p>`}
      ${rows.length ? html`<div class="section-row"><h2 class="section-title">${t("stats.subjects")}</h2>
        <button type="button" class="pill" data-action="sort">${t(`stats.sort.${subjectSort}`)} ▾</button></div>
      <div class="rows">${rows.map((r) => accRow(r, { title: nameHtml(store.subject(r.id)), sub: rowSub(r), action: "subject" }))}</div>` : ""}
      <div class="rows links">
        <button type="button" class="row" data-action="go" data-to="stats-topics"><span class="row-main"><span class="row-title">${t("stats.allTopics")}</span></span>${chev}</button>
        <button type="button" class="row" data-action="go" data-to="history"><span class="row-main"><span class="row-title">${t("history.title")}</span><span class="row-sub">${t("common.tests", { n: history })}</span></span>${chev}</button>
        <button type="button" class="row" data-action="go" data-to="stats-tables"><span class="row-main"><span class="row-title">${t("stats.tables")}</span><span class="row-sub">${t("stats.tablesSub")}</span></span>${chev}</button>
      </div>
      <button type="button" class="btn wide" data-action="start">${t("today.startTest")}</button>
      ${ctx.mode === "pyq" ? html`<div class="actions-col"><button type="button" class="btn wide" data-action="insights">🔎 ${t("insights.button")}</button>
        <button type="button" class="btn btn-quiet wide" data-action="timetable">🗓 ${t("tt.fromProgress")}</button></div>` : ""}
    </section>`;

    onAction(container, {
      ...insightHandlers,
      settings: settingsSheet,
      mode: (el) => store.setSetting("statsMode", el.dataset.m),
      period: () => runFlow(async () => {
        const p = await chooseAction({ title: t("stats.periodTitle"), items: PERIODS.map((x) => ({ id: x, label: t(`stats.period.${x}`), current: x === ctx.period })) });
        if (p) await store.setSetting("statsPeriod", p);
      }),
      sort: () => runFlow(async () => {
        const s = await chooseAction({ title: t("sort.title"), items: ["weak", "strong", "most", "hard"].map((x) => ({ id: x, label: t(`stats.sort.${x}`), current: x === subjectSort })) });
        if (s) { subjectSort = s; store.touch(); }
      }),
      subject: (el) => go("stats-subject", { id: el.dataset.id }),
      go: (el) => go(el.dataset.to),
      continue: () => go("test"),
      start: () => openStartTest(),
      insights: () => go("insights"),
      timetable: () => go("timetable")
    });
  }
};

/* ---------- Test history ---------- */

const GROUPS = ["all", "paper", "subject", "topic", "bank", "other", "ai"];
const hist = { group: "all", sort: "recent", term: "" };
const groupOf = (a) => (a.kind === "ai" ? "ai" : ["paper", "subject", "topic", "bank"].includes(a.scope?.type) ? a.scope.type : "other");
const keyOf = (a) => `${a.scope?.type || "x"}|${a.scope?.ref || a.scope?.label || ""}`;
const pct = (a) => (a.counts?.total ? a.counts.correct / a.counts.total : 0);

export const historyScreen = {
  id: "history",
  parent: "progress",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const all = finishedTests(syllabus.id);
    const present = new Set(all.map(groupOf));
    const groups = GROUPS.filter((g) => g === "all" || present.has(g));
    if (!groups.includes(hist.group)) hist.group = "all";
    const map = new Map();
    all.filter((a) => hist.group === "all" || groupOf(a) === hist.group).forEach((a) => {
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
    const q = hist.term.trim().toLowerCase();
    if (q) rows = rows.filter((g) => g.label.toLowerCase().includes(q));
    rows.sort({
      recent: (x, y) => y.latest.submittedAt - x.latest.submittedAt,
      az: (x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }),
      best: (x, y) => y.avg - x.avg,
      worst: (x, y) => x.avg - y.avg
    }[hist.sort]);

    container.innerHTML = html`<header class="screen-head">
      <div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.progress")}</span></button></div>
      <h1>${t("history.title")}</h1><p class="hint">${t("common.tests", { n: all.length })}</p></header>
      ${all.length ? html`
        <div class="chip-row">${groups.map((g) => html`<button type="button" class="pill ${hist.group === g ? "on" : ""}" data-action="group" data-g="${g}">${t(`history.group.${g}`)}</button>`)}</div>
        <input type="search" class="search" id="hSearch" placeholder="${t("history.search")}" value="${hist.term}" autocomplete="off">
        <div class="toolbar"><button type="button" class="pill" data-action="sort">${t(`history.sort.${hist.sort}`)} ▾</button></div>
        <div class="rows" id="hRows">${rows.length ? rows.map((g) => html`
          <button type="button" class="row" data-action="open" data-key="${g.key}">
            <span class="row-main"><span class="row-title">${g.label}</span>
              <span class="row-sub">${t("history.groupSub", { n: g.list.length, avg: Math.round(g.avg * 100), when: dateText(g.latest.submittedAt) })}</span></span>
            <span class="row-count">${formatNumber(g.latest.netScore)}</span>${chev}
          </button>`) : html`<p class="hint pad">${t("library.nothingFound", { q: hist.term })}</p>`}</div>`
        : html`<p class="hint pad">${t("history.none")}</p>`}`;

    const input = container.querySelector("#hSearch");
    let timer = null;
    input?.addEventListener("input", () => { hist.term = input.value; clearTimeout(timer); timer = setTimeout(() => go("history"), 300); });
    onAction(container, {
      back: () => go("progress"),
      group: (el) => { hist.group = el.dataset.g; go("history"); },
      sort: () => runFlow(async () => {
        const s = await chooseAction({ title: t("sort.title"), items: ["recent", "az", "best", "worst"].map((x) => ({ id: x, label: t(`history.sort.${x}`), current: x === hist.sort })) });
        if (s) { hist.sort = s; go("history"); }
      }),
      open: (el) => {
        const g = map.get(el.dataset.key);
        if (g.list.length === 1) go("result", { id: g.list[0].id });
        else go("tests", { type: g.type || "", ref: g.ref || g.label });
      }
    });
    if (hist.term && input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
};

export const testsScreen = {
  id: "tests",
  parent: "progress",
  render(container, { type, ref }) {
    const syllabus = store.currentSyllabus();
    const list = finishedTests(syllabus.id).filter((a) => (a.scope?.type || "") === type && (a.scope?.ref || a.scope?.label) === ref)
      .sort((x, y) => y.submittedAt - x.submittedAt);
    if (!list.length) return go("history");
    container.innerHTML = html`<header class="screen-head">
      <div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("history.title")}</span></button></div>
      <h1>${list[0].scope?.label || ""}</h1><p class="hint">${t("common.tests", { n: list.length })}</p></header>
      <div class="rows">${list.map((a) => html`<button type="button" class="row" data-action="open" data-id="${a.id}">
        <span class="row-main"><span class="row-title">${new Date(a.submittedAt).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" })}</span>
        <span class="row-sub">${t("history.testSub", { right: a.counts.correct, wrong: a.counts.wrong, blank: a.counts.unanswered })}${a.timerMinutes ? ` · ${t("results.timed", { n: a.timerMinutes })}` : ""}${a.autoSubmitted ? ` · ${t("results.autoSubmitted")}` : ""}</span></span>
        <span class="row-count">${scoreLine(a)}</span>${chev}</button>`)}</div>`;
    onAction(container, { back: () => go("history"), open: (el) => go("result", { id: el.dataset.id }) });
  }
};
