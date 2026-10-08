/* Progress → Detailed tables (the old Stats sub-tabs, one tap away).
   #/stats-tables?tab=time|difficulty|level|guess */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { formatDuration } from "../../domain/testing.js";
import { pickByBasis, isTimed, isAnswered, guessSummary, markingInfo, avgDifficulty } from "../../domain/stats.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import { difficultyOf } from "../question/card.js";
import { statsContext } from "./data.js";
import { guessCoach } from "../ai/ai-actions.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";

const TABS = ["time", "difficulty", "level", "guess"];
const LV = ["E", "M", "D"];
const guessView = { scope: "subject", sort: "net-asc" };
/* Sort & filter for the subject/topic lists and tables (kept while the app is open). */
const SORTS = {
  time: ["slow", "fast", "most", "az", "syllabus"],
  difficulty: ["hard", "easy", "most", "az", "syllabus"],
  level: ["most", "weak", "strong", "hardWeak", "az", "syllabus"]
};
const MIN_N = [0, 3, 5, 10];
const view = { syllabusId: null, subject: null, sort: { time: "slow", difficulty: "hard", level: "most" }, minN: 0, showEmpty: false };
const subjectOrder = (subjectId) => store.subject(subjectId)?.order ?? 9999;
const topicSubject = (topicId) => store.topic(topicId)?.subjectId;

/** Sorts list entries { label, v (the measure), n (answers / questions), acc, accD, sub (subject id) } by the chosen mode. */
function sortEntries(list, mode) {
  const by = {
    slow: (a, b) => b.v - a.v, fast: (a, b) => a.v - b.v,
    hard: (a, b) => b.v - a.v, easy: (a, b) => a.v - b.v,
    most: (a, b) => b.n - a.n,
    weak: (a, b) => (a.acc ?? 2) - (b.acc ?? 2), strong: (a, b) => (b.acc ?? -1) - (a.acc ?? -1),
    hardWeak: (a, b) => (a.accD ?? 2) - (b.accD ?? 2),
    az: (a, b) => String(a.label).localeCompare(String(b.label)),
    syllabus: (a, b) => subjectOrder(a.sub) - subjectOrder(b.sub) || String(a.label).localeCompare(String(b.label))
  }[mode] || ((a, b) => b.n - a.n);
  return list.slice().sort((a, b) => by(a, b) || b.n - a.n || String(a.label).localeCompare(String(b.label)));
}

const enough = (n) => n >= view.minN;
const rowHasData = (cells) => view.showEmpty || cells.some((c) => c !== "—");
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const subName = (id) => nameLabel(store.subject(id)) || "—";
const topicLabel = (id) => { const x = store.topic(id); return x ? `${nameLabel(x)} · ${subName(x.subjectId)}` : "—"; };

function groupBy(list, key) {
  const m = new Map();
  list.forEach((x) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

/** Plain bars: label, bar, value text (the value is always written out). */
function bars(entries, { cls = "" } = {}) {
  if (!entries.length) return html`<p class="hint">${t("tables.noData")}</p>`;
  const max = Math.max(...entries.map((e) => e.v), 1e-9);
  return html`<div class="hbars ${cls}">${entries.map((e) => html`<div class="hbar">
    <span class="hbar-label">${e.label}</span>
    <span class="hbar-track"><span class="hbar-fill ${e.cls || ""}" style="width:${Math.max(2, Math.round((100 * e.v) / max))}%"></span></span>
    <span class="hbar-val">${e.text}</span></div>`)}</div>`;
}

function table(head, rows) {
  if (!rows.length) return html`<p class="hint">${t("tables.noRows")}</p>`;
  return html`<div class="table-wrap"><table class="grid"><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody></table></div>`;
}

const avgMs = (xs) => xs.reduce((s, r) => s + r.timeMs, 0) / xs.length;

function timeTab(ctx) {
  const timed = pickByBasis(ctx.records, ctx.basis, isTimed);
  if (!timed.length) return html`<p class="hint pad">${t("tables.noTime")}</p>`;
  const byDiff = groupBy(timed.filter((r) => r.difficulty), (r) => r.difficulty);
  const bySub = groupBy(timed, (r) => r.subjectId);
  const byTop = groupBy(timed, (r) => r.topicId);
  const cell = (xs, d) => { const x = (xs || []).filter((r) => r.difficulty === d); return x.length ? formatDuration(avgMs(x)) : "—"; };
  const entries = (m, label, subOf) => sortEntries([...m.entries()].filter(([, xs]) => enough(xs.length))
    .map(([k, xs]) => ({ label: label(k), v: avgMs(xs), n: xs.length, sub: subOf(k), text: `${formatDuration(avgMs(xs))}` })), view.sort.time)
    .map((e) => ({ ...e, text: view.sort.time === "most" ? `${e.text} · ${t("tables.tf.nAns", { n: e.n })}` : e.text }));
  const crossRows = (m, label, subOf) => sortEntries([...m.entries()].filter(([, xs]) => enough(xs.length))
    .map(([k, xs]) => ({ label: label(k), v: avgMs(xs), n: xs.length, sub: subOf(k), cells: LV.map((d) => cell(xs, d)) }))
    .filter((e) => rowHasData(e.cells)), view.sort.time).map((e) => [e.label, ...e.cells]);
  return html`<p class="facts"><span><strong>${formatDuration(avgMs(timed))}</strong> ${t("tables.avgPerQ")}</span>
      <span><strong>${formatNumber(timed.length)}</strong> ${t("tables.timedAnswers")}</span></p>
    <h3>${t("tables.timeByDiff")}</h3>${bars(LV.filter((d) => byDiff.has(d)).map((d) => ({ label: `${t(`question.difficulty.${d}`)} (${byDiff.get(d).length})`, v: avgMs(byDiff.get(d)), text: formatDuration(avgMs(byDiff.get(d))) })))}
    ${view.subject ? "" : html`<h3>${t("tables.timeBySubject")}</h3>${bars(entries(bySub, subName, (k) => k))}`}
    <h3>${t("tables.timeByTopic")}</h3>${bars(entries(byTop, topicLabel, topicSubject))}
    ${view.subject ? "" : html`<h3>${t("tables.timeDiffSubject")}</h3>${table(["", ...LV.map((d) => t(`question.difficulty.${d}`))], crossRows(bySub, subName, (k) => k))}`}
    <h3>${t("tables.timeDiffTopic")}</h3>${table(["", ...LV.map((d) => t(`question.difficulty.${d}`))], crossRows(byTop, topicLabel, topicSubject))}`;
}

function difficultyTab(ctx) {
  if (store.setting("difficultyEnabled", true) === false) return html`<p class="hint pad">${t("tables.diffOff")}</p>`;
  const qs = ctx.questions.map((q) => ({ q, d: difficultyOf(q) }));
  const overall = avgDifficulty(qs.map((x) => x.d));
  const dist = Object.fromEntries(LV.map((d) => [d, qs.filter((x) => x.d === d).length]));
  const answered = pickByBasis(ctx.records, ctx.basis).filter((r) => r.difficulty);
  const avgRows = (key, label, subOf) => sortEntries([...groupBy(qs, (x) => key(x.q)).entries()]
    .map(([k, xs]) => ({ k, a: avgDifficulty(xs.map((x) => x.d)) })).filter((x) => x.a && enough(x.a.count))
    .map((x) => ({ label: `${label(x.k)} (${x.a.count}/${x.a.total})`, v: x.a.avg, n: x.a.count, sub: subOf(x.k), text: `${x.a.avg}/9`, cls: `lv-${x.a.avg <= 4 ? "E" : x.a.avg <= 7 ? "M" : "D"}` })), view.sort.difficulty);
  return html`<p class="hint">${t("tables.diffScale")}</p>
    <p class="facts"><span><strong>${overall ? `${overall.avg}/9` : "—"}</strong> ${t("tables.avgDiff")}</span>
      <span><strong>${overall ? overall.count : 0}/${qs.length}</strong> ${t("tables.marked")}</span></p>
    <h3>${t("tables.qByDiff")}</h3>${bars(LV.map((d) => ({ label: t(`question.difficulty.${d}`), v: dist[d], text: formatNumber(dist[d]), cls: `lv-${d}` })))}
    <h3>${t("tables.accByDiff")}</h3>${answered.length ? bars(LV.map((d) => {
      const xs = answered.filter((r) => r.difficulty === d);
      return { label: `${t(`question.difficulty.${d}`)} (${xs.length})`, v: xs.length ? xs.filter((r) => r.isCorrect).length / xs.length : 0, text: xs.length ? pct(xs.filter((r) => r.isCorrect).length, xs.length) : "—", cls: `lv-${d}` };
    })) : html`<p class="hint">${t("tables.takeMarked")}</p>`}
    ${view.subject ? "" : html`<h3>${t("tables.diffBySubject")}</h3>${bars(avgRows((q) => q.subjectId, subName, (k) => k))}`}
    <h3>${t("tables.diffByTopic")}</h3>${bars(avgRows((q) => q.topicId, topicLabel, topicSubject))}
    <h3>${t("tables.diffByExam")}</h3>${bars(avgRows((q) => q.paperId, (id) => store.paper(id)?.name || id, () => null))}`;
}

function levelTab(ctx) {
  if (store.setting("difficultyEnabled", true) === false) return html`<p class="hint pad">${t("tables.diffOff")}</p>`;
  const recs = pickByBasis(ctx.records, ctx.basis);
  if (!recs.length) return html`<p class="hint pad">${t("tables.noAnswers")}</p>`;
  const count = (xs) => { const r = xs.filter((x) => x.isCorrect).length; return { r, w: xs.length - r, n: xs.length }; };
  const grp = groupBy(recs, (r) => r.difficulty || "U");
  let tr = 0; let tw = 0;
  const rows = [...LV, "U"].map((k) => {
    const c = count(grp.get(k) || []); tr += c.r; tw += c.w;
    if (k === "U" && !c.n) return null;
    return [`${k === "U" ? t("tables.notMarked") : t(`question.difficulty.${k}`)}${c.n ? ` (${c.n})` : ""}`, c.r, c.w, pct(c.r, c.n), pct(c.w, c.n)];
  }).filter(Boolean);
  rows.push([t("tables.all"), tr, tw, pct(tr, tr + tw), pct(tw, tr + tw)]);
  // A cell: right % on top, right/wrong underneath (fits a phone without sideways scrolling).
  const cell = (xs, d) => { const x = xs.filter((r) => r.difficulty === d); if (!x.length) return "—"; const c = count(x); return html`<b>${pct(c.r, c.n)}</b><small>${c.r}/${c.w}</small>`; };
  const accOf = (xs) => (xs.length ? xs.filter((r) => r.isCorrect).length / xs.length : null);
  const allCell = (xs) => { const c = count(xs); return html`<b>${pct(c.r, c.n)}</b><small>${c.r}/${c.w}</small>`; };
  // Columns: Easy, Medium, Hard, then All (every answer, marked or not), which the weak/strong sorts use.
  const cross = (key, label, subOf) => table(["", ...LV.map((d) => t(`question.difficulty.${d}`)), t("tables.all")],
    sortEntries([...groupBy(recs, key).entries()].filter(([, xs]) => enough(xs.length))
      .map(([k, xs]) => ({ label: label(k), n: xs.length, acc: accOf(xs), accD: accOf(xs.filter((r) => r.difficulty === "D")), sub: subOf(k), cells: LV.map((d) => cell(xs, d)), all: allCell(xs) }))
      , view.sort.level).map((e) => [e.label, ...e.cells, e.all]));
  return html`<p class="hint">${t(`stats.basisInfo.${ctx.basis}`)}</p>
    <h3>${t("tables.rwByDiff")}</h3>${table([t("tables.level"), t("tables.right"), t("tables.wrong"), t("tables.rightPct"), t("tables.wrongPct")], rows)}
    ${view.subject ? "" : html`<h3>${t("tables.bySubjectRW")}</h3>${cross((r) => r.subjectId, subName, (k) => k)}`}
    <h3>${t("tables.byTopicRW")}</h3>${cross((r) => r.topicId, topicLabel, topicSubject)}`;
}

function guessTab(ctx) {
  const mk = markingInfo(ctx.marking);
  const recs = pickByBasis(ctx.records, ctx.basis, (r) => r.guessed && isAnswered(r));
  const all = guessSummary(recs, ctx.marking);
  const head = html`<p class="hint">${t("tables.breakEven", { pos: mk.pos, pen: Math.round(mk.pen * 100) / 100, be: Math.round(mk.breakEven * 1000) / 10 })}</p>
    ${ctx.mode === "pyq" ? html`<button type="button" class="btn btn-quiet" data-action="coach">🎓 ${t("ai.coachTitle")}</button>` : ""}`;
  if (!all.n) return html`${head}<p class="hint pad">${t("tables.noGuesses")}</p>`;
  const groups = groupBy(recs, (r) => (guessView.scope === "subject" ? r.subjectId : r.topicId));
  const rows = [...groups.entries()].filter(([, xs]) => enough(xs.length)).map(([k, xs]) => ({ k, ...guessSummary(xs, ctx.marking) }))
    .sort({ "net-asc": (a, b) => a.net - b.net, "net-desc": (a, b) => b.net - a.net, count: (a, b) => b.n - a.n }[guessView.sort]);
  const sign = (x) => `${x > 0 ? "+" : ""}${formatNumber(x)}`;
  return html`${head}
    <p class="facts"><span><strong>${all.n}</strong> ${t("tables.guessed")}</span><span><strong>${pct(all.right, all.n)}</strong> ${t("tables.guessAcc")}</span>
      <span><strong>${sign(all.net)}</strong> ${t("tables.netMarks")}</span></p>
    <p>${all.acc >= mk.breakEven ? t("tables.guessPays") : t("tables.guessCosts")} ${t("tables.gainedLost", { gained: formatNumber(Math.round(all.right * mk.pos * 100) / 100), lost: formatNumber(Math.round(all.wrong * mk.pen * 100) / 100) })}</p>
    <div class="toolbar">
      <div class="segmented two mini">${["subject", "topic"].map((s) => html`<button type="button" class="${guessView.scope === s ? "on" : ""}" data-action="g-scope" data-v="${s}">${t(`tables.by.${s}`)}</button>`)}</div>
      <button type="button" class="pill" data-action="g-sort">${t(`tables.gsort.${guessView.sort}`)} ▾</button>
    </div>
    <div class="rows">${rows.map((r) => html`<div class="row static">
      <span class="row-main"><span class="row-title">${guessView.scope === "subject" ? subName(r.k) : topicLabel(r.k)}</span>
        <span class="row-sub">${t("tables.guessRow", { n: r.n, right: r.right, wrong: r.wrong, acc: pct(r.right, r.n) })} · ${r.acc >= mk.breakEven ? t("tables.above") : t("tables.below")}</span></span>
      <span class="stat-pct">${sign(r.net)}</span></div>`)}</div>`;
}

function toolbar(cur) {
  if (cur === "guess") return view.subject ? html`<div class="chip-wrap tf-bar"><button type="button" class="pill on" data-action="tf-subject">${nameLabel(store.subject(view.subject))} ▾</button></div>` : html`<div class="chip-wrap tf-bar"><button type="button" class="pill" data-action="tf-subject">${t("tables.tf.allSubjects")} ▾</button></div>`;
  const extra = view.minN || (cur === "time" && view.showEmpty);
  return html`<div class="chip-wrap tf-bar">
    <button type="button" class="pill ${view.subject ? "on" : ""}" data-action="tf-subject">${view.subject ? nameLabel(store.subject(view.subject)) : t("tables.tf.allSubjects")} ▾</button>
    <button type="button" class="pill" data-action="tf-sort">↕ ${t(`tables.tf.sort.${view.sort[cur]}`)} ▾</button>
    <button type="button" class="pill ${extra ? "on" : ""}" data-action="tf-more">⚙ ${view.minN ? t("tables.tf.minN", { n: view.minN }) : t("tables.tf.filters")} ▾</button>
    ${view.subject || extra ? html`<button type="button" class="link" data-action="tf-clear">${t("tables.tf.clear")}</button>` : ""}
  </div>`;
}

export const statsTablesScreen = {
  id: "stats-tables",
  parent: "progress",
  render(container, { tab }) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const cur = TABS.includes(tab) ? tab : "time";
    if (view.syllabusId !== syllabus.id || (view.subject && !store.subject(view.subject))) { view.subject = null; view.syllabusId = syllabus.id; }
    const ctx = statsContext(syllabus, { scope: view.subject ? { subjectId: view.subject } : null });
    const body = { time: timeTab, difficulty: difficultyTab, level: levelTab, guess: guessTab }[cur](ctx);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.progress")}</span></button></div>
      <h1>${t("stats.tables")}</h1>
      <p class="hint">${[t(`stats.mode.${ctx.mode}`), t(`stats.period.${ctx.period}`), t(`stats.basis.${ctx.basis}`)].join(" · ")}</p></header>
      <div class="chip-row">${TABS.map((x) => html`<button type="button" class="pill ${x === cur ? "on" : ""}" data-action="tab" data-t="${x}">${t(`tables.tab.${x}`)}</button>`)}</div>
      ${toolbar(cur)}
      <section class="tables">${body}</section>`;
    onAction(container, {
      back: () => go("progress"),
      tab: (el) => go("stats-tables", { tab: el.dataset.t }),
      coach: () => guessCoach(),
      "tf-subject": () => runFlow(async () => {
        const subs = [...new Set(statsContext(syllabus).questions.map((q) => q.subjectId))].map((id) => store.subject(id)).filter(Boolean)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
        const id = await chooseAction({ title: t("tables.tf.subjectTitle"), items: [{ id: "__all", label: t("tables.tf.allSubjects"), current: !view.subject }, ...subs.map((x) => ({ id: x.id, label: nameLabel(x), current: view.subject === x.id }))] });
        if (id) { view.subject = id === "__all" ? null : id; store.touch(); }
      }),
      "tf-sort": () => runFlow(async () => {
        const id = await chooseAction({ title: t("tables.tf.sortTitle"), items: SORTS[cur].map((x) => ({ id: x, label: t(`tables.tf.sort.${x}`), current: view.sort[cur] === x })) });
        if (id) { view.sort[cur] = id; store.touch(); }
      }),
      "tf-more": () => runFlow(async () => {
        const id = await chooseAction({ title: t("tables.tf.moreTitle"), items: [
          ...MIN_N.map((n) => ({ id: `n${n}`, label: n ? t("tables.tf.minN", { n }) : t("tables.tf.anyN"), sub: n ? t("tables.tf.minNHint") : "", current: view.minN === n })),
          // Only the time tables can have rows with no data at all.
          cur === "time" ? { id: "empty", label: view.showEmpty ? t("tables.tf.hideEmpty") : t("tables.tf.showEmpty") } : null
        ].filter(Boolean) });
        if (!id) return;
        if (id === "empty") view.showEmpty = !view.showEmpty; else view.minN = Number(id.slice(1));
        store.touch();
      }),
      "tf-clear": () => { view.subject = null; view.minN = 0; view.showEmpty = false; store.touch(); },
      "g-scope": (el) => { guessView.scope = el.dataset.v; go("stats-tables", { tab: "guess" }); },
      "g-sort": () => { const order = ["net-asc", "net-desc", "count"]; guessView.sort = order[(order.indexOf(guessView.sort) + 1) % order.length]; go("stats-tables", { tab: "guess" }); }
    });
  }
};
