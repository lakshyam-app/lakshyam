/* Today: the home screen, built for one tap to start.
   Greeting · streak and this week · today's goal · what to study next (Quick 10) ·
   Continue an unfinished test · due for review · Start a test · backup reminder. */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import * as tests from "../../data/tests.js";
import { downloadBackup } from "../../data/backup.js";
import { startImport } from "../import/import-flow.js";
import { localDate } from "../../domain/study.js";
import { streak, weekDots, nextSteps, daysBetween } from "../../domain/habits.js";
import { isGradable } from "../../domain/testing.js";
import { answerRecords, pickByBasis, accuracyBy, LOW_N } from "../../domain/stats.js";
import { openStartTest, progressText, quickTest } from "../test/start-sheet.js";

export const DEFAULT_GOAL = 30;
export const goal = () => Math.max(1, Number(store.setting("dailyGoal", DEFAULT_GOAL)) || DEFAULT_GOAL);
const BACKUP_DAYS = 7;
let stepIndex = 0; // "Another suggestion" moves through the list

function greetingKey(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.evening";
}

/** Goal ring: a gold arc on a quiet track. done/goal decides the arc length. */
function goalRing(done, target, celebrate) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, target ? done / target : 0) * circumference;
  return html`<svg class="goal-ring ${celebrate ? "celebrate" : ""} ${done >= target ? "met" : ""}" viewBox="0 0 120 120" role="img"
      aria-label="${t("today.goalProgress", { done, goal: target })}">
    <circle class="goal-track" cx="60" cy="60" r="${r}"/>
    ${filled > 0 ? html`<circle class="goal-arc" cx="60" cy="60" r="${r}"
      stroke-dasharray="${filled} ${circumference}" transform="rotate(-90 60 60)"/>` : ""}
    <text x="60" y="58" class="goal-num">${formatNumber(done)}</text>
    <text x="60" y="78" class="goal-of">/ ${formatNumber(target)}</text>
  </svg>`;
}

/* ---------- what to study next ---------- */

function studyCandidates(syllabus, now = Date.now()) {
  const questions = store.questionsFor({ syllabusId: syllabus.id });
  const freq = new Map(); const gradable = new Map();
  questions.forEach((q) => {
    freq.set(q.topicId, (freq.get(q.topicId) || 0) + 1);
    if (isGradable(q)) gradable.set(q.topicId, (gradable.get(q.topicId) || 0) + 1);
  });
  const due = store.all("topicState")
    .filter((s) => s.syllabusId === syllabus.id && s.studiedCount > 0 && s.nextReviewAt && s.nextReviewAt <= now && store.topic(s.topicId))
    .map((s) => ({ topicId: s.topicId, nextReviewAt: s.nextReviewAt, studiedCount: s.studiedCount, lastStudiedAt: s.lastStudiedAt }));
  const records = answerRecords(store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai"));
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.topicId);
  const weak = Object.entries(acc).filter(([id, a]) => freq.has(id) && a.total >= LOW_N)
    .map(([id, a]) => ({ topicId: id, freq: freq.get(id), accuracy: a.adj, pct: a.correct / a.total, n: a.total }));
  const touched = new Set(records.filter((r) => r.graded && r.selected !== null).map((r) => r.topicId));
  const untouched = [...freq.entries()].filter(([id]) => !touched.has(id) && !store.topic(id)?.isFallback)
    .map(([id, n]) => ({ topicId: id, freq: n }));
  return { steps: nextSteps({ due, weak, untouched, gradable }), due, freq };
}

function reasonFor(step, freq) {
  const inPapers = t("stats.inPapers", { n: freq.get(step.topicId) || 0 });
  if (step.kind === "due") {
    const days = daysBetween(step.nextReviewAt, Date.now());
    return [days > 0 ? t("next.dueDays", { n: days }) : t("next.dueToday"), t("library.studied", { n: step.studiedCount }), inPapers].join(" · ");
  }
  if (step.kind === "weak") return [t("next.weak", { pct: Math.round(step.pct * 100), n: step.n }), inPapers].join(" · ");
  return [t("next.new"), inPapers].join(" · ");
}

function nextCard(syllabus, cand) {
  if (!cand.steps.length) return "";
  const step = cand.steps[stepIndex % cand.steps.length];
  const topic = store.topic(step.topicId);
  return html`<article class="next-card">
    <p class="kicker">${t(`next.kicker.${step.kind}`)}</p>
    <h2>${nameHtml(topic)}</h2>
    <p class="hint">${nameLabel(store.subject(topic.subjectId))}</p>
    <p>${reasonFor(step, cand.freq)}</p>
    <div class="actions-row">
      <button type="button" class="btn" data-action="quick" data-id="${topic.id}">▶ ${t("next.quick")}</button>
      <button type="button" class="btn btn-quiet" data-action="topic" data-id="${topic.id}">${t("next.open")} ›</button>
    </div>
    ${cand.steps.length > 1 ? html`<button type="button" class="link" data-action="another">${t("next.another")}</button>` : ""}
  </article>`;
}

function dueSheet(due) {
  openSheet(html`<h2>${t("next.dueTitle", { n: due.length })}</h2>
    <p class="hint">${t("next.dueHint")}</p>
    <div class="rows">${due.sort((a, b) => a.nextReviewAt - b.nextReviewAt).map((d) => {
      const topic = store.topic(d.topicId);
      const days = daysBetween(d.nextReviewAt, Date.now());
      return html`<button type="button" class="row" data-action="topic" data-id="${d.topicId}">
        <span class="row-main"><span class="row-title">${nameHtml(topic)}</span>
        <span class="row-sub">${nameLabel(store.subject(topic.subjectId))} · ${t("library.studied", { n: d.studiedCount })} · ${days > 0 ? t("next.dueDays", { n: days }) : t("next.dueToday")}</span></span>
        <span class="chev-txt">›</span></button>`;
    })}</div>`, { topic: (el) => go("topic", { id: el.dataset.id }) }, { label: t("next.dueTitle", { n: due.length }) });
}

/* ---------- screen ---------- */

function welcome() {
  return html`<div class="panel">
    <h2>${t("today.welcomeTitle")}</h2>
    <p>${t("today.welcomeBody")}</p>
    <button type="button" class="btn" data-action="import">${t("today.importButton")}</button>
  </div>`;
}

function habitsRow(today) {
  const days = new Set(store.all("activity").filter((a) => (a.count || 0) > 0 || (a.questions || 0) > 0).map((a) => a.id));
  const s = streak(days, today);
  const dots = weekDots(days, today);
  const message = s.todayDone ? t("habits.doneToday") : s.alive ? t("habits.keepGoing") : s.missedYesterday ? t("habits.getBack") : t("habits.start");
  return html`<div class="habits">
    <span class="streak" aria-label="${t("habits.streakLabel", { n: s.count })}">🔥 ${t("habits.days", { n: s.count })}</span>
    <span class="week" role="img" aria-label="${t("habits.weekLabel", { n: dots.filter((d) => d.active).length })}">
      ${dots.map((d) => html`<span class="wd ${d.active ? "on" : ""} ${d.isToday ? "is-today" : ""} ${d.future ? "future" : ""}" title="${d.date}">${t(`habits.dow.${dots.indexOf(d)}`)}</span>`)}
    </span>
    <p class="hint">${message}</p>
  </div>`;
}

function backupReminder() {
  if (store.isEmpty()) return "";
  const last = store.setting("lastBackupAt");
  if (last && daysBetween(last, Date.now()) < BACKUP_DAYS) return "";
  return html`<p class="backup-line"><span>${last ? t("today.backupAgo", { n: daysBetween(last, Date.now()) }) : t("today.backupNever")}</span>
    <button type="button" class="link" data-action="backup">${t("settings.backupNow")}</button></p>`;
}

export const todayScreen = {
  id: "today",
  tab: 1,
  render(container) {
    const today = localDate();
    const name = String(store.setting("userName", "") || "").trim();
    const greet = name ? t("today.greetName", { greeting: t(greetingKey()), name }) : t(greetingKey());
    if (store.isEmpty()) {
      container.innerHTML = html`<section class="today"><h1 class="greeting">${greet}</h1>${welcome()}</section>`;
      onAction(container, { import: startImport });
      return;
    }
    const syllabus = store.currentSyllabus();
    const target = goal();
    const done = store.byId("activity", today)?.questions || 0;
    // A small celebration the first time the goal is met each day.
    const celebrate = done >= target && store.setting("goalCelebratedOn") !== today;
    if (celebrate) store.quietly(() => store.setSetting("goalCelebratedOn", today));
    const showStreak = store.setting("showStreak", true) !== false;
    const showGoal = store.setting("showGoal", true) !== false;
    const active = tests.activeTest();
    const cand = studyCandidates(syllabus);

    container.innerHTML = html`<section class="today">
      <h1 class="greeting">${greet}</h1>
      ${showStreak ? habitsRow(today) : ""}
      ${showGoal ? html`<div class="goal">
        ${goalRing(done, target, celebrate)}
        <div class="goal-text">
          <p class="goal-label">${t("today.goalLabel")}</p>
          <p class="goal-sub">${done >= target ? t("today.goalMet") : t("today.goalProgress", { done, goal: target })}</p>
          <button type="button" class="link" data-action="goal">${t("today.changeGoal")}</button>
        </div>
      </div>` : ""}
      ${active ? html`<button type="button" class="continue-card" data-action="continue">
        <span class="row-main"><span class="row-title">${t("today.continue", { label: active.scope?.label || "" })}</span>
        <span class="row-sub">${progressText(active)}</span></span><span class="chev-txt">›</span></button>` : ""}
      ${nextCard(syllabus, cand)}
      ${cand.due.length ? html`<button type="button" class="row due-row" data-action="due">
        <span class="row-main"><span class="row-title">${t("next.dueTitle", { n: cand.due.length })}</span>
        <span class="row-sub">${cand.due.slice(0, 3).map((d) => nameLabel(store.topic(d.topicId))).filter(Boolean).join(", ")}${cand.due.length > 3 ? "…" : ""}</span></span>
        <span class="chev-txt">›</span></button>` : ""}
      <button type="button" class="btn wide" data-action="start">${t("today.startTest")}</button>
      ${backupReminder()}
    </section>`;

    onAction(container, {
      quick: (el) => quickTest(el.dataset.id),
      topic: (el) => go("topic", { id: el.dataset.id }),
      another: () => { stepIndex++; store.touch(); },
      due: () => dueSheet(cand.due),
      continue: () => go("test"),
      start: () => openStartTest(),
      goal: () => go("settings", { section: "today" }),
      backup: async () => {
        await store.setSetting("lastBackupAt", Date.now());
        downloadBackup();
        toast(t("settings.backupSaved"));
      }
    });
  }
};
