/* #/diary-days?p=week|month&k=<monday | YYYY-MM>&v=list|one — every day of a week or month with what you
   wrote and did: score, mood, tags, note, questions, topics, screen time.
   "List" scrolls through them; "One day" shows one at a time (swipe left / right or ‹ ›). */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go, goBack } from "../../core/router.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as D from "../../domain/diary.js";
import * as diary from "../../data/diary.js";
import { onSwipe } from "../../core/swipe.js";
import { fmtDate } from "../timetable/common.js";
import { daySheet } from "./diary.js";
import { screenLine } from "./screen-time.js";

let oneAt = null; // the day shown in "One day" view (kept while you move between days)

function range(p, k, today) {
  if (p === "week") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(k || "") ? D.mondayOf(k) : D.mondayOf(today);
    return { from, to: T.addDays(from, 6), key: from, prev: T.addDays(from, -7), next: T.addDays(from, 7) };
  }
  const m = /^\d{4}-\d{2}$/.test(k || "") ? k : today.slice(0, 7);
  const from = `${m}-01`;
  const to = T.addDays(T.isoDate(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)), -1);
  return { from, to, key: m, prev: T.addDays(from, -1).slice(0, 7), next: T.addDays(to, 1).slice(0, 7) };
}

function dayInfo(syllabus, date) {
  const f = diary.dayFacts(syllabus.id, date);
  const score = D.dayScore(f);
  const r = diary.review(date);
  const sc = screenLine(date);
  return { date, f, score, level: D.dayLevel(f, score), r, sc, any: Boolean(r || sc || f.questions || f.topics || f.done) };
}

function dayCard(x, { big = false } = {}) {
  const { f, r } = x;
  return html`<button type="button" class="entry-card lv-${x.level} ${big ? "big" : ""} ${x.any ? "" : "no-entry"}" data-action="open" data-d="${x.date}">
    <span class="ec-head"><span class="ec-date">${fmtDate(x.date, { weekday: "short", day: "numeric", month: "short" })}</span>
      <span class="ec-right">${r ? html`<span class="ec-face">${D.MOOD_FACE[r.mood]}</span>` : ""}<span class="score-pill lv-${x.level}">${x.score}</span></span></span>
    ${x.any ? html`
      <span class="ec-facts">${[f.planned ? t("diary.blocksDone", { n: f.done, of: f.planned }) : null, t("diary.questions", { n: f.questions, goal: f.goal }), f.topics ? t("diary.topics", { n: f.topics }) : null].filter(Boolean).join(" · ")}</span>
      ${x.sc ? html`<span class="ec-screen">📱 ${x.sc}</span>` : ""}
      ${r?.tags?.length ? html`<span class="hint">${r.tags.map((k) => t(`diary.tag.${k}`)).join(" · ")}</span>` : ""}
      ${r?.note ? html`<span class="ec-note ${big ? "" : "clamp"}">${r.note}</span>` : ""}` : html`<span class="hint">${t("diary.noEntry")}</span>`}
  </button>`;
}

export const diaryDaysScreen = {
  id: "diary-days",
  parent: "diary",
  render(container, { p = "month", k = "", v = "list" }) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("today");
    const today = T.isoDate();
    const period = p === "week" ? "week" : "month";
    const view = v === "one" ? "one" : "list";
    const r = range(period, k, today);
    const days = T.dateRange(r.from, r.to < today ? r.to : today).reverse().map((d) => dayInfo(syllabus, d)); // newest first
    const withEntry = days.filter((x) => x.any);
    const title = period === "week"
      ? t("diary.weekRange", { from: fmtDate(r.from, { day: "numeric", month: "short" }), to: fmtDate(r.to, { day: "numeric", month: "short" }) })
      : T.parseIso(`${r.key}-01`).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
    const canNext = r.next <= (period === "week" ? today : today.slice(0, 7));
    const go2 = (q) => go("diary-days", { p: period, k: r.key, v: view, ...q }, { replace: true });
    if (view === "one" && (!oneAt || oneAt < r.from || oneAt > r.to || oneAt > today)) oneAt = (withEntry[0] || days[0])?.date || null;
    const idx = days.findIndex((x) => x.date === oneAt);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("diary.title")}</span></button></div>
      <h1>${t("diary.entries")}</h1><p class="hint">${t("diary.entriesSub")}</p></header>
      <div class="segmented two"><button type="button" class="${period === "week" ? "on" : ""}" data-action="period" data-p="week">${t("diary.byWeek")}</button><button type="button" class="${period === "month" ? "on" : ""}" data-action="period" data-p="month">${t("diary.byMonth")}</button></div>
      <div class="month-nav"><button type="button" class="icon-sm" data-action="move" data-k="${r.prev}" aria-label="${t("diary.prevPeriod")}">‹</button>
        <h2>${title}</h2>
        <button type="button" class="icon-sm" data-action="move" data-k="${r.next}" ${canNext ? "" : "disabled"} aria-label="${t("diary.nextPeriod")}">›</button></div>
      <div class="toolbar"><span class="hint">${t("diary.daysWithEntry", { n: withEntry.length, of: days.length })}</span>
        <div class="segmented two small"><button type="button" class="${view === "list" ? "on" : ""}" data-action="view" data-v="list">☰ ${t("diary.viewList")}</button><button type="button" class="${view === "one" ? "on" : ""}" data-action="view" data-v="one">▭ ${t("diary.viewOne")}</button></div></div>
      ${!days.length ? html`<p class="hint pad">${t("diary.noDays")}</p>` : view === "list"
        ? html`<div class="entries">${days.map((x) => dayCard(x))}</div>`
        : html`<div class="entry-one" id="entryOne">
            <div class="day-nav"><button type="button" class="icon-sm" data-action="older" ${idx < days.length - 1 ? "" : "disabled"} aria-label="${t("diary.prevDay")}">‹</button>
              <span class="hint">${t("diary.dayOf", { n: days.length - idx, of: days.length })}</span>
              <button type="button" class="icon-sm" data-action="newer" ${idx > 0 ? "" : "disabled"} aria-label="${t("diary.nextDay")}">›</button></div>
            ${dayCard(days[idx], { big: true })}
            <p class="hint center">${t("diary.swipeDays")}</p></div>`}`;
    const older = () => { if (idx < days.length - 1) { oneAt = days[idx + 1].date; go2({}); } };
    const newer = () => { if (idx > 0) { oneAt = days[idx - 1].date; go2({}); } };
    onAction(container, {
      back: () => goBack("diary"),
      period: (el) => go("diary-days", { p: el.dataset.p, k: el.dataset.p === "week" ? D.mondayOf(period === "month" ? (r.to < today ? r.to : today) : r.from) : r.from.slice(0, 7), v: view }, { replace: true }),
      move: (el) => { oneAt = null; go("diary-days", { p: period, k: el.dataset.k, v: view }, { replace: true }); },
      view: (el) => go("diary-days", { p: period, k: r.key, v: el.dataset.v }, { replace: true }),
      open: (el) => daySheet(syllabus, el.dataset.d),
      older, newer
    });
    const one = container.querySelector("#entryOne");
    if (one) onSwipe(one, { left: newer, right: older });
  }
};
