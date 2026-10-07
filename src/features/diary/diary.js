/* Study diary.
   - Today: a checklist that fills itself (timetable blocks you did, questions, topics, your review)
     and the last 14 days in colour (how effective each day was)
   - Review of the day: an emoji face, quick tags and a short note (evening, or next morning)
   - #/diary?m=YYYY-MM: the month in colour, each day's details, weekly and monthly reports
     (figures worked out by the app; AI writes the report and a short motivational line) */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { can } from "../../core/entitlements.js";
import { label as nameLabel } from "../../core/names.js";
import { richText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as D from "../../domain/diary.js";
import * as diary from "../../data/diary.js";
import * as presets from "../../ai/presets.js";
import { ask } from "../../ai/client.js";
import { tutorSystem } from "../../ai/prompts.js";
import { ensureAi, errorText } from "../ai/ai-ui.js";
import { blockTitle, icon, fmt, fmtDate } from "../timetable/common.js";

const TAGS = ["focused", "revised", "mock", "notes", "distracted", "tired", "phone", "late", "unwell", "busy"];

function factsOf(syllabus, date) {
  const f = diary.dayFacts(syllabus.id, date);
  const score = D.dayScore(f);
  return { f, score, level: D.dayLevel(f, score) };
}

/* ---------- Today card ---------- */

export function todayDiaryCard(syllabus) {
  if (!syllabus || store.setting("showDiary", true) === false) return "";
  const today = T.isoDate();
  const { f, score, level } = factsOf(syllabus, today);
  const list = diary.dayChecklist(syllabus.id, today);
  const r = diary.review(today);
  const hour = new Date().getHours();
  const yesterday = T.addDays(today, -1);
  const askYesterday = hour < 12 && !diary.review(yesterday) && (store.byId("activity", yesterday) || diary.dayChecklist(syllabus.id, yesterday).items.length);
  const askToday = hour >= 18 && !r;
  const strip = T.dateRange(T.addDays(today, -13), today).map((d) => ({ d, ...factsOf(syllabus, d), mood: diary.review(d)?.mood }));
  const item = (done, text, sub = "") => html`<li class="${done ? "done" : ""}"><span class="ck">${done ? "✓" : ""}</span><span class="ck-main"><span>${text}</span>${sub ? html`<span class="hint">${sub}</span>` : ""}</span></li>`;
  return html`<section class="diary-card lv-${level}">
    <div class="dc-head"><h2>${t("diary.todayTitle")}</h2><span class="score-pill lv-${level}" title="${t("diary.scoreTitle")}">${score}</span></div>
    <ul class="checklist">
      ${list.items.map((i) => item(i.done, html`${icon(i.block)} ${blockTitle(i.block)}`, `${fmt(i.block.start)}${i.topicIds.length ? ` · ${t("diary.topicsTicked", { n: i.topicIds.length })}` : i.skipped ? ` · ${t("diary.skipped")}` : ""}`))}
      ${item(f.questions >= f.goal, t("diary.questions", { n: f.questions, goal: f.goal }), f.questions ? t("diary.accuracy", { pct: Math.round((f.correct / Math.max(1, f.questions)) * 100) }) : "")}
      ${item(f.topics > 0, t("diary.topics", { n: f.topics }))}
      ${item(Boolean(r), t("diary.reviewItem"), r ? `${D.MOOD_FACE[r.mood]} ${t(`diary.mood.${r.mood}`)}` : t("diary.reviewWhen"))}
    </ul>
    ${!list.items.length ? html`<p class="hint">${t("diary.noPlanHint")}</p>` : ""}
    ${askYesterday ? moodRow(yesterday, t("diary.howYesterday")) : askToday ? moodRow(today, t("diary.howToday")) : ""}
    <button type="button" class="day-strip" data-action="diary" aria-label="${t("diary.open")}">${strip.map((x) => html`<span class="ds-cell lv-${x.level} ${x.d === today ? "is-today" : ""}" title="${fmtDate(x.d)}: ${t(`diary.level.${x.level}`)}">${x.mood ? D.MOOD_FACE[x.mood] : ""}</span>`)}</button>
    <div class="dc-foot"><span class="hint">${t("diary.last14")}</span><button type="button" class="link" data-action="diary">${t("diary.open")} ›</button></div>
  </section>`;
}

function moodRow(date, title) {
  return html`<div class="mood-ask"><p>${title}</p><div class="faces">${D.MOODS.map((m) => html`<button type="button" class="face" data-action="mood" data-d="${date}" data-m="${m}" aria-label="${t(`diary.mood.${m}`)}">${D.MOOD_FACE[m]}</button>`)}</div></div>`;
}

export const diaryHandlers = {
  diary: () => go("diary"),
  mood: (el) => openReview(el.dataset.d, Number(el.dataset.m))
};

/* ---------- review of the day ---------- */

export function openReview(date, mood0 = null) {
  const syllabus = store.currentSyllabus();
  const prev = diary.review(date);
  const s = { mood: mood0 || prev?.mood || null, note: prev?.note || "", tags: new Set(prev?.tags || []) };
  const { f, score, level } = factsOf(syllabus, date);
  const draw = () => {
    openSheet(html`<p class="tt-kicker">${fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</p>
      <h2>${date === T.isoDate() ? t("diary.howToday") : t("diary.howThatDay")}</h2>
      <div class="faces big">${D.MOODS.map((m) => html`<button type="button" class="face ${s.mood === m ? "on" : ""}" data-action="pick" data-m="${m}" aria-pressed="${String(s.mood === m)}"><span class="f-emoji">${D.MOOD_FACE[m]}</span><span class="f-label">${t(`diary.mood.${m}`)}</span></button>`)}</div>
      <div class="day-sum lv-${level}">
        <span class="score-pill lv-${level}">${score}</span>
        <span>${t(`diary.level.${level}`)}<br><span class="hint">${[f.planned ? t("diary.blocksDone", { n: f.done, of: f.planned }) : null, t("diary.questions", { n: f.questions, goal: f.goal }), t("diary.topics", { n: f.topics })].filter(Boolean).join(" · ")}</span></span>
      </div>
      <h3>${t("diary.tagsTitle")}</h3>
      <div class="chip-wrap">${TAGS.map((k) => html`<button type="button" class="pill ${s.tags.has(k) ? "on" : ""}" data-action="tag" data-k="${k}">${t(`diary.tag.${k}`)}</button>`)}</div>
      <label class="field-label">${t("diary.noteTitle")}<textarea class="field" id="dNote" rows="4" maxlength="2000" placeholder="${t("diary.notePh")}">${s.note}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="save" ${s.mood ? "" : "disabled"}>${t("common.save")}</button></div>`, {
      pick: (el) => { s.note = sheetBody().querySelector("#dNote").value; s.mood = Number(el.dataset.m); draw(); },
      tag: (el) => { s.note = sheetBody().querySelector("#dNote").value; const k = el.dataset.k; if (s.tags.has(k)) s.tags.delete(k); else s.tags.add(k); draw(); },
      close: () => closeSheet(),
      save: async () => {
        s.note = sheetBody().querySelector("#dNote").value.trim();
        await diary.saveReview(date, { mood: s.mood, note: s.note, tags: [...s.tags] });
        closeSheet();
        toast(t(s.mood >= 4 ? "diary.savedGood" : "diary.saved"));
      }
    }, { label: t("diary.howToday") });
  };
  draw();
}

/* ---------- #/diary ---------- */

export const diaryScreen = {
  id: "diary",
  parent: "today",
  render(container, { m }) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("today");
    const today = T.isoDate();
    const month = /^\d{4}-\d{2}$/.test(m || "") ? m : today.slice(0, 7);
    const first = `${month}-01`;
    const last = T.addDays(T.isoDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)), -1);
    const lead = T.weekday(first) - 1;
    const days = T.dateRange(first, last);
    const cells = days.map((d) => ({ d, ...(d <= today ? factsOf(syllabus, d) : { level: "future" }), mood: diary.review(d)?.mood }));
    const prevMonth = T.addDays(first, -1).slice(0, 7);
    const nextMonth = T.addDays(last, 1).slice(0, 7);
    const lastMonday = T.addDays(D.mondayOf(today), -7);
    const monthName = (k) => T.parseIso(`${k}-01`).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.today")}</span></button></div>
      <h1>${t("diary.title")}</h1><p class="hint">${t("diary.sub")}</p></header>
      <div class="month-nav"><button type="button" class="icon-sm" data-action="month" data-m="${prevMonth}" aria-label="${t("diary.prevMonth")}">‹</button>
        <h2>${monthName(month)}</h2>
        <button type="button" class="icon-sm" data-action="month" data-m="${nextMonth}" ${nextMonth > today.slice(0, 7) ? "disabled" : ""} aria-label="${t("diary.nextMonth")}">›</button></div>
      <div class="cal">${[1, 2, 3, 4, 5, 6, 7].map((d) => html`<span class="cal-wd">${t(`tt.wd.${d}`)}</span>`)}
        ${Array.from({ length: lead }, () => html`<span></span>`)}
        ${cells.map((c) => html`<button type="button" class="cal-day lv-${c.level} ${c.d === today ? "is-today" : ""}" data-action="day" data-d="${c.d}" ${c.level === "future" ? "disabled" : ""}>
          <span class="cd-n">${Number(c.d.slice(8))}</span><span class="cd-m">${c.mood ? D.MOOD_FACE[c.mood] : ""}</span></button>`)}</div>
      <div class="legend">${["great", "good", "fair", "low", "missed", "none"].map((l) => html`<span><i class="lv-${l}"></i>${t(`diary.level.${l}`)}</span>`)}</div>
      <p class="hint">${t("diary.scoreExplain")}</p>
      <h2 class="section-title">${t("diary.reports")}</h2>
      ${reportCard(syllabus, "week", lastMonday, T.addDays(lastMonday, 6), t("diary.lastWeek", { from: fmtDate(lastMonday, { day: "numeric", month: "short" }), to: fmtDate(T.addDays(lastMonday, 6), { day: "numeric", month: "short" }) }))}
      ${reportCard(syllabus, "week", D.mondayOf(today), today, t("diary.thisWeek"), { partial: true })}
      ${reportCard(syllabus, "month", `${prevMonth}-01`, T.addDays(first, -1), monthName(prevMonth), { key: prevMonth })}
      ${pastReports()}`;
    onAction(container, {
      back: () => go("today"),
      month: (el) => go("diary", { m: el.dataset.m }),
      day: (el) => daySheet(syllabus, el.dataset.d),
      "ai-report": (el) => writeReport(syllabus, el.dataset.kind, el.dataset.from, el.dataset.to, el.dataset.key, el),
      "old-report": (el) => { const r = store.byId("diary", el.dataset.id); if (r) showReport(r); }
    });
  }
};

function periodDays(syllabus, from, to) {
  const today = T.isoDate();
  return T.dateRange(from, to < today ? to : today).map((d) => ({ date: d, facts: diary.dayFacts(syllabus.id, d) }));
}

function statsHtml(s) {
  const face = s.avgMood ? D.MOOD_FACE[Math.round(s.avgMood)] : "–";
  return html`<div class="facts">
    <div class="fact"><span class="fact-n">${s.avgScore}</span><span class="fact-l">${t("diary.avgScore")}</span></div>
    <div class="fact"><span class="fact-n">${s.studied}/${s.days}</span><span class="fact-l">${t("diary.daysStudied")}</span></div>
    ${s.planRate !== null ? html`<div class="fact"><span class="fact-n">${s.planRate}%</span><span class="fact-l">${t("diary.planKept")}</span></div>` : ""}
    <div class="fact"><span class="fact-n">${s.questions}</span><span class="fact-l">${t("diary.questionsN")}${s.accuracy !== null ? ` · ${s.accuracy}%` : ""}</span></div>
    <div class="fact"><span class="fact-n">${s.topics}</span><span class="fact-l">${t("diary.topicsN")}</span></div>
    <div class="fact"><span class="fact-n">${face}</span><span class="fact-l">${t("diary.avgMood")}</span></div></div>`;
}

function reportCard(syllabus, kind, from, to, title, { partial = false, key = from } = {}) {
  const s = D.summarize(periodDays(syllabus, from, to));
  const saved = partial ? null : diary.getReport(kind, key);
  return html`<section class="report-card">
    <h3>${kind === "week" ? "🗓" : "📅"} ${title}</h3>
    ${statsHtml(s)}
    ${s.best && s.best.score > 0 ? html`<p class="hint">${t("diary.bestDay", { day: fmtDate(s.best.date), score: s.best.score })}</p>` : ""}
    ${saved ? reportBody(saved) : ""}
    ${!partial && !saved && !s.studied && !s.reviewed ? html`<p class="hint">${t("diary.nothingThen")}</p>` : ""}
    ${!partial && can("ai") && (s.studied || s.reviewed || saved) ? html`<button type="button" class="btn ${saved ? "btn-quiet" : ""}" data-action="ai-report" data-kind="${kind}" data-from="${from}" data-to="${to}" data-key="${key}">🤖 ${saved ? t("diary.rewrite") : t(`diary.write.${kind}`)}</button>` : ""}
    ${partial ? html`<p class="hint">${t("diary.partialHint")}</p>` : ""}
  </section>`;
}

function reportBody(r) {
  return html`<div class="report-text qtext">${richText(r.text)}</div>${r.quote ? html`<blockquote class="quote-card">“${r.quote}”</blockquote>` : ""}<p class="hint">${t("diary.writtenBy", { name: r.by || "AI", date: new Date(r.at).toLocaleDateString(dateLocale()) })}</p>`;
}

function pastReports() {
  const list = store.all("diary").filter((x) => x.kind === "report").sort((a, b) => b.key.localeCompare(a.key)).slice(0, 12);
  if (list.length < 2) return "";
  return html`<details class="old-reports"><summary>${t("diary.allReports", { n: list.length })}</summary><div class="rows">${list.map((r) => html`<button type="button" class="row" data-action="old-report" data-id="${r.id}">
    <span class="row-main"><span class="row-title">${r.period === "week" ? t("diary.weekOf", { date: fmtDate(r.key) }) : T.parseIso(`${r.key}-01`).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" })}</span><span class="row-sub">${t("diary.avgScore")}: ${r.stats?.avgScore ?? "–"}</span></span><span class="chev-txt">›</span></button>`)}</div></details>`;
}

function showReport(r) {
  openSheet(html`<h2>${r.period === "week" ? t("diary.weekOf", { date: fmtDate(r.key) }) : r.key}</h2>${r.stats ? statsHtml(r.stats) : ""}${reportBody(r)}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, { close: () => closeSheet() });
}

/* ---------- one day ---------- */

function daySheet(syllabus, date) {
  const { f, score, level } = factsOf(syllabus, date);
  const list = diary.dayChecklist(syllabus.id, date);
  const r = diary.review(date);
  const act = store.byId("activity", date) || {};
  const topicNames = [...new Set(act.topics || [])].map((id) => nameLabel(store.topic(id))).filter(Boolean);
  openSheet(html`<p class="tt-kicker">${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
    <div class="day-sum lv-${level}"><span class="score-pill lv-${level}">${score}</span><span>${t(`diary.level.${level}`)}</span></div>
    ${list.items.length ? html`<h3>${t("diary.plan")}</h3><ul class="checklist">${list.items.map((i) => html`<li class="${i.done ? "done" : ""}"><span class="ck">${i.done ? "✓" : i.skipped ? "–" : ""}</span><span class="ck-main"><span>${icon(i.block)} ${blockTitle(i.block)}</span><span class="hint">${fmt(i.block.start)}${i.topicIds.length ? ` · ${i.topicIds.map((x) => nameLabel(store.topic(x))).filter(Boolean).join(", ")}` : ""}</span></span></li>`)}</ul>` : ""}
    <p>${t("diary.questions", { n: f.questions, goal: f.goal })}${f.questions ? ` · ${t("diary.accuracy", { pct: Math.round((f.correct / f.questions) * 100) })}` : ""}</p>
    ${topicNames.length ? html`<p>${t("diary.topics", { n: topicNames.length })}: <span class="hint">${topicNames.join(", ")}</span></p>` : ""}
    ${r ? html`<div class="review-show"><span class="f-emoji">${D.MOOD_FACE[r.mood]}</span><div>${r.tags?.length ? html`<p class="hint">${r.tags.map((k) => t(`diary.tag.${k}`)).join(" · ")}</p>` : ""}${r.note ? html`<p class="pre">${r.note}</p>` : ""}</div></div>` : ""}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      <button type="button" class="btn" data-action="rev">${r ? t("diary.editReview") : t("diary.addReview")}</button></div>`, {
    close: () => closeSheet(),
    rev: () => openReview(date)
  }, { label: fmtDate(date) });
}

/* ---------- AI report ---------- */

async function writeReport(syllabus, kind, from, to, key, btn) {
  if (!(await ensureAi())) return;
  const days = periodDays(syllabus, from, to);
  const s = D.summarize(days);
  const span = T.daysFrom(from, to) + 1;
  const before = D.summarize(periodDays(syllabus, T.addDays(from, -span), T.addDays(from, -1)));
  const lines = days.map(({ date, facts }) => {
    const r = diary.review(date);
    const sc = D.dayScore(facts);
    return `${date} (${T.parseIso(date).toLocaleDateString("en-GB", { weekday: "short" })}): score ${sc}/100${facts.planned ? `, timetable blocks ${facts.done}/${facts.planned}` : ""}, questions ${facts.questions}${facts.questions ? ` (${Math.round((facts.correct / facts.questions) * 100)}% right)` : ""}, topics ${facts.topics}${r ? `, mood ${r.mood}/5${r.tags?.length ? `, tags: ${r.tags.join(", ")}` : ""}${r.note ? `, note: "${r.note.slice(0, 300)}"` : ""}` : ", no review"}`;
  });
  const user = `Here is a Kerala PSC aspirant's study diary for ${kind === "week" ? "a week" : "a month"} (${from} to ${to}). Scores are worked out by the app (0-100: keeping to the timetable counts most, then questions against a daily goal of ${days[0]?.facts.goal || 30}, then topics studied).

Totals: average score ${s.avgScore}, studied on ${s.studied} of ${s.days} days, ${s.missed} planned day(s) missed, timetable kept ${s.planRate ?? "–"}%, ${s.questions} questions${s.accuracy !== null ? ` at ${s.accuracy}% accuracy` : ""}, ${s.topics} topics, average mood ${s.avgMood ?? "not rated"}.
The period before: average score ${before.avgScore}, studied ${before.studied}/${before.days} days, ${before.questions} questions.

Day by day:
${kind === "week" ? lines.join("\n") : lines.filter((l) => !/score 0\/100.*no review/.test(l)).slice(-31).join("\n")}

Write a short report:
1. **How effective it was**: 2-3 sentences, honest and kind, using the figures (compare with the period before).
2. **What worked**: up to 3 bullets.
3. **Fix next ${kind}**: up to 3 specific, doable actions.
Then, on the last line by itself, one short original motivational line that fits THIS ${kind} (at most 20 words, not attributed to anyone), starting with "Quote:".`;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = t("ai.thinking");
  try {
    const lang = (await presets.getConfig()).lang || "en";
    const { text, preset } = await ask(tutorSystem(lang), user, 1800);
    const m = /\n?\s*\**Quote:?\**\s*[:\-–]?\s*(.+)\s*$/i.exec(text.trim());
    const quote = m ? m[1].replace(/^["“”*\s]+|["“”*\s]+$/g, "").slice(0, 200) : "";
    const body = m ? text.trim().slice(0, m.index).trim() : text.trim();
    await diary.saveReport(kind, key, { text: body, quote, by: preset.name, stats: s, from, to });
    store.touch();
  } catch (e) {
    toast(errorText(e), { duration: 6000 });
    if (btn.isConnected) { btn.disabled = false; btn.textContent = old; }
  }
}
