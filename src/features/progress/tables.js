/* Progress → Detailed tables (the old Stats sub-tabs, one tap away).
   #/stats-tables?tab=time|difficulty|level|guess */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { formatDuration } from "../../domain/testing.js";
import { pickByBasis, isTimed, isAnswered, guessSummary, markingInfo, avgDifficulty } from "../../domain/stats.js";
import * as store from "../../data/store.js";
import { difficultyOf } from "../question/card.js";
import { statsContext } from "./data.js";
import { guessCoach } from "../ai/ai-actions.js";

const TABS = ["time", "difficulty", "level", "guess"];
const LV = ["E", "M", "D"];
const guessView = { scope: "subject", sort: "net-asc" };
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const subName = (id) => store.subject(id)?.name || "—";
const topicLabel = (id) => { const x = store.topic(id); return x ? `${x.name} · ${subName(x.subjectId)}` : "—"; };

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
  const entries = (m, label) => [...m.entries()].map(([k, xs]) => ({ label: label(k), v: avgMs(xs), text: formatDuration(avgMs(xs)) })).sort((a, b) => b.v - a.v);
  return html`<p class="facts"><span><strong>${formatDuration(avgMs(timed))}</strong> ${t("tables.avgPerQ")}</span>
      <span><strong>${formatNumber(timed.length)}</strong> ${t("tables.timedAnswers")}</span></p>
    <h3>${t("tables.timeByDiff")}</h3>${bars(LV.filter((d) => byDiff.has(d)).map((d) => ({ label: `${t(`question.difficulty.${d}`)} (${byDiff.get(d).length})`, v: avgMs(byDiff.get(d)), text: formatDuration(avgMs(byDiff.get(d))) })))}
    <h3>${t("tables.timeBySubject")}</h3>${bars(entries(bySub, subName))}
    <h3>${t("tables.timeByTopic")}</h3>${bars(entries(byTop, topicLabel))}
    <h3>${t("tables.timeDiffSubject")}</h3>${table(["", ...LV.map((d) => t(`question.difficulty.${d}`))], [...bySub.entries()].map(([k, xs]) => [subName(k), ...LV.map((d) => cell(xs, d))]))}
    <h3>${t("tables.timeDiffTopic")}</h3>${table(["", ...LV.map((d) => t(`question.difficulty.${d}`))], [...byTop.entries()].map(([k, xs]) => [topicLabel(k), ...LV.map((d) => cell(xs, d))]))}`;
}

function difficultyTab(ctx) {
  if (store.setting("difficultyEnabled", true) === false) return html`<p class="hint pad">${t("tables.diffOff")}</p>`;
  const qs = ctx.questions.map((q) => ({ q, d: difficultyOf(q) }));
  const overall = avgDifficulty(qs.map((x) => x.d));
  const dist = Object.fromEntries(LV.map((d) => [d, qs.filter((x) => x.d === d).length]));
  const answered = pickByBasis(ctx.records, ctx.basis).filter((r) => r.difficulty);
  const avgRows = (key, label) => [...groupBy(qs, (x) => key(x.q)).entries()]
    .map(([k, xs]) => ({ k, a: avgDifficulty(xs.map((x) => x.d)) })).filter((x) => x.a)
    .map((x) => ({ label: `${label(x.k)} (${x.a.count}/${x.a.total})`, v: x.a.avg, text: `${x.a.avg}/9`, cls: `lv-${x.a.avg <= 4 ? "E" : x.a.avg <= 7 ? "M" : "D"}` }))
    .sort((a, b) => b.v - a.v);
  return html`<p class="hint">${t("tables.diffScale")}</p>
    <p class="facts"><span><strong>${overall ? `${overall.avg}/9` : "—"}</strong> ${t("tables.avgDiff")}</span>
      <span><strong>${overall ? overall.count : 0}/${qs.length}</strong> ${t("tables.marked")}</span></p>
    <h3>${t("tables.qByDiff")}</h3>${bars(LV.map((d) => ({ label: t(`question.difficulty.${d}`), v: dist[d], text: formatNumber(dist[d]), cls: `lv-${d}` })))}
    <h3>${t("tables.accByDiff")}</h3>${answered.length ? bars(LV.map((d) => {
      const xs = answered.filter((r) => r.difficulty === d);
      return { label: `${t(`question.difficulty.${d}`)} (${xs.length})`, v: xs.length ? xs.filter((r) => r.isCorrect).length / xs.length : 0, text: xs.length ? pct(xs.filter((r) => r.isCorrect).length, xs.length) : "—", cls: `lv-${d}` };
    })) : html`<p class="hint">${t("tables.takeMarked")}</p>`}
    <h3>${t("tables.diffBySubject")}</h3>${bars(avgRows((q) => q.subjectId, subName))}
    <h3>${t("tables.diffByTopic")}</h3>${bars(avgRows((q) => q.topicId, topicLabel))}
    <h3>${t("tables.diffByExam")}</h3>${bars(avgRows((q) => q.paperId, (id) => store.paper(id)?.name || id))}`;
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
  const cell = (xs, d) => { const x = xs.filter((r) => r.difficulty === d); if (!x.length) return "—"; const c = count(x); return `${c.r}/${c.w} · ${pct(c.r, c.n)}`; };
  const cross = (key, label) => table(["", ...LV.map((d) => t(`question.difficulty.${d}`))],
    [...groupBy(recs, key).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => [label(k), ...LV.map((d) => cell(xs, d))]));
  return html`<p class="hint">${t(`stats.basisInfo.${ctx.basis}`)}</p>
    <h3>${t("tables.rwByDiff")}</h3>${table([t("tables.level"), t("tables.right"), t("tables.wrong"), t("tables.rightPct"), t("tables.wrongPct")], rows)}
    <h3>${t("tables.bySubjectRW")}</h3>${cross((r) => r.subjectId, subName)}
    <h3>${t("tables.byTopicRW")}</h3>${cross((r) => r.topicId, topicLabel)}`;
}

function guessTab(ctx) {
  const mk = markingInfo(ctx.marking);
  const recs = pickByBasis(ctx.records, ctx.basis, (r) => r.guessed && isAnswered(r));
  const all = guessSummary(recs, ctx.marking);
  const head = html`<p class="hint">${t("tables.breakEven", { pos: mk.pos, pen: Math.round(mk.pen * 100) / 100, be: Math.round(mk.breakEven * 1000) / 10 })}</p>
    ${ctx.mode === "pyq" ? html`<button type="button" class="btn btn-quiet" data-action="coach">🎓 ${t("ai.coachTitle")}</button>` : ""}`;
  if (!all.n) return html`${head}<p class="hint pad">${t("tables.noGuesses")}</p>`;
  const groups = groupBy(recs, (r) => (guessView.scope === "subject" ? r.subjectId : r.topicId));
  const rows = [...groups.entries()].map(([k, xs]) => ({ k, ...guessSummary(xs, ctx.marking) }))
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

export const statsTablesScreen = {
  id: "stats-tables",
  parent: "progress",
  render(container, { tab }) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const cur = TABS.includes(tab) ? tab : "time";
    const ctx = statsContext(syllabus);
    const body = { time: timeTab, difficulty: difficultyTab, level: levelTab, guess: guessTab }[cur](ctx);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.progress")}</span></button></div>
      <h1>${t("stats.tables")}</h1>
      <p class="hint">${[t(`stats.mode.${ctx.mode}`), t(`stats.period.${ctx.period}`), t(`stats.basis.${ctx.basis}`)].join(" · ")}</p></header>
      <div class="chip-row">${TABS.map((x) => html`<button type="button" class="pill ${x === cur ? "on" : ""}" data-action="tab" data-t="${x}">${t(`tables.tab.${x}`)}</button>`)}</div>
      <section class="tables">${body}</section>`;
    onAction(container, {
      back: () => go("progress"),
      tab: (el) => go("stats-tables", { tab: el.dataset.t }),
      coach: () => guessCoach(),
      "g-scope": (el) => { guessView.scope = el.dataset.v; go("stats-tables", { tab: "guess" }); },
      "g-sort": () => { const order = ["net-asc", "net-desc", "count"]; guessView.sort = order[(order.indexOf(guessView.sort) + 1) % order.length]; go("stats-tables", { tab: "guess" }); }
    });
  }
};
