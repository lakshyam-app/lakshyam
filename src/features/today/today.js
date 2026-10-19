/* Today: the home screen, built for one tap to start (1.26: one big button, one suggestion, one card for the day).
   Greeting · backup warning (only when overdue) · exam countdown · Continue an unfinished test ·
   Today's session (mistakes due + a focus topic, with Open / Quick 10 / Another topic) · timetable now ·
   the day's card (goal ring, streak, checklist, screen time, last 14 days) · quiet rows: Start a test,
   revise today (3 due topics a day, the rest wait their turn), plan a timetable · reminders · backup status. */
import { html, onAction } from "../../core/dom.js";
import { t, locale, LANGUAGES, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import { countdownCard, tickCountdown } from "./countdown.js";
import { sessionPlan, sessionCard, startSession } from "./session.js";
import { driveTodayRow, driveHandlers, driveConfig } from "../settings/drive.js";
import { timetableNow, nowHandlers, nowTick } from "../timetable/now-card.js";
import { todayDiaryCard, diaryHandlers, openReview } from "../diary/diary.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import * as tests from "../../data/tests.js";
import { downloadBackup } from "../../data/backup.js";
import { setupPanel, setupHandlers } from "../import/setup.js";
import { localDate } from "../../domain/study.js";
import { streak, weekDots, nextSteps, daysBetween, rankDue, REVIEW_CAP } from "../../domain/habits.js";
import { isGradable } from "../../domain/testing.js";
import { answerRecords, pickByBasis, accuracyBy, LOW_N } from "../../domain/stats.js";
import { openStartTest, progressText, quickTest } from "../test/start-sheet.js";
import { oneQuestion, remindersTodayRow } from "../reminders/reminders.js";
import { presetDeck } from "../ai/content.js";
import { openedFrom } from "../../core/back.js";

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

/** Topics you marked studied whose review day has come. */
const dueRecords = (syllabus, now) => store.all("topicState")
  .filter((s) => s.syllabusId === syllabus.id && s.studiedCount > 0 && s.nextReviewAt && s.nextReviewAt <= now && store.topic(s.topicId))
  .map((s) => ({ topicId: s.topicId, nextReviewAt: s.nextReviewAt, studiedCount: s.studiedCount, lastStudiedAt: s.lastStudiedAt }));

/** 1.26 (Revise tab): the due topics in Today's order, and each topic's count in past papers. */
export function revisionDue(syllabus, now = Date.now()) {
  const freq = new Map();
  store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => freq.set(q.topicId, (freq.get(q.topicId) || 0) + 1));
  return { due: rankDue(dueRecords(syllabus, now), freq, now), freq };
}

function studyCandidates(syllabus, now = Date.now()) {
  const questions = store.questionsFor({ syllabusId: syllabus.id });
  const freq = new Map(); const gradable = new Map();
  questions.forEach((q) => {
    freq.set(q.topicId, (freq.get(q.topicId) || 0) + 1);
    if (isGradable(q)) gradable.set(q.topicId, (gradable.get(q.topicId) || 0) + 1);
  });
  const due = dueRecords(syllabus, now);
  const records = answerRecords(store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai"));
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.topicId);
  const weak = Object.entries(acc).filter(([id, a]) => freq.has(id) && a.total >= LOW_N)
    .map(([id, a]) => ({ topicId: id, freq: freq.get(id), accuracy: a.adj, pct: a.correct / a.total, n: a.total }));
  const touched = new Set(records.filter((r) => r.graded && r.selected !== null).map((r) => r.topicId));
  const untouched = [...freq.entries()].filter(([id]) => !touched.has(id) && !store.topic(id)?.isFallback)
    .map(([id, n]) => ({ topicId: id, freq: n }));
  return { steps: nextSteps({ due, weak, untouched, gradable, freq, now }), due: rankDue(due, freq, now), freq };
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

/** Due topics: today's few (asked most × most overdue) first, then the ones waiting their turn. */
export function dueSheet(due, freq) {
  const row = (d) => {
    const topic = store.topic(d.topicId);
    const days = daysBetween(d.nextReviewAt, Date.now());
    return html`<button type="button" class="row" data-action="topic" data-id="${d.topicId}">
      <span class="row-main"><span class="row-title">${nameHtml(topic)}</span>
      <span class="row-sub">${nameLabel(store.subject(topic.subjectId))} · ${t("library.studied", { n: d.studiedCount })} · ${days > 0 ? t("next.dueDays", { n: days }) : t("next.dueToday")} · ${t("stats.inPapers", { n: freq.get(d.topicId) || 0 })}</span></span>
      <span class="chev-txt">›</span></button>`;
  };
  const first = due.slice(0, REVIEW_CAP); const rest = due.slice(REVIEW_CAP);
  openSheet(html`<h2>${t("next.dueTitle", { n: due.length })}</h2>
    <p class="hint">${t("next.dueHint")} ${t("next.dueCapHint")}</p>
    <h3 class="rows-head">${t("next.dueTodayHead")}</h3><div class="rows">${first.map(row)}</div>
    ${rest.length ? html`<h3 class="rows-head">${t("next.dueWaitHead")} (${rest.length})</h3><div class="rows">${rest.map(row)}</div>` : ""}`,
  { topic: (el) => go("topic", { id: el.dataset.id }) }, { label: t("next.dueTitle", { n: due.length }) });
}

/* ---------- screen ---------- */

function welcome() {
  return html`<div class="segmented two lang-pick" role="group">${LANGUAGES.map((l) => html`<button type="button" class="${locale() === l.code ? "on" : ""}" data-action="app-lang" data-v="${l.code}" lang="${l.code}">${l.name}</button>`)}</div>
  ${setupPanel()}`;
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

/** Backup: with Google Drive, its status line (bottom of Today). Without it, a warning at the top
    when nothing has been backed up yet or the last backup is a week old or more. */
function backupStatus() {
  if (store.isEmpty() || !driveConfig().connected) return "";
  return driveTodayRow();
}
function backupWarning() {
  if (store.isEmpty() || driveConfig().connected) return "";
  const last = store.setting("lastBackupAt");
  if (last && daysBetween(last, Date.now()) < BACKUP_DAYS) return "";
  return html`<div class="backup-warn" role="status"><p>💾 ${last ? t("today.backupWarnAgo", { n: daysBetween(last, Date.now()) }) : t("today.backupWarnNever")}</p>
    <div class="actions-row"><button type="button" class="btn btn-small" data-action="backup">${t("settings.backupNow")}</button>
    <button type="button" class="link" data-action="backup-auto">${t("today.backupDrive")} ›</button></div></div>`;
}

export const todayScreen = {
  id: "today",
  tab: 1,
  render(container, params = {}) {
    const today = localDate();
    const name = String(store.setting("userName", "") || "").trim();
    const greet = name ? t("today.greetName", { greeting: t(greetingKey()), name }) : t(greetingKey());
    if (store.isEmpty()) {
      container.innerHTML = html`<section class="today"><h1 class="greeting">${greet}</h1>${welcome()}</section>`;
      onAction(container, { ...setupHandlers, "app-lang": (el) => store.setSetting("appLang", el.dataset.v) });
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
    // "Another topic" moves the session's focus through the suggestions.
    const k = cand.steps.length ? stepIndex % cand.steps.length : 0;
    const steps = [...cand.steps.slice(k), ...cand.steps.slice(0, k)];
    const plan = sessionPlan(syllabus, steps);
    const focusStep = plan.focus ? steps.find((x) => x.topicId === plan.focus.topic.id) : null;
    const session = sessionCard(plan, { reason: focusStep ? reasonFor(focusStep, cand.freq) : "", canChange: plan.focus?.why !== "timetable" && cand.steps.length > 1 });
    const nowSlot = timetableNow(); // the timetable's current block (or, without one, a row to plan one)
    const nowCard = String(nowSlot).includes("now-card") ? nowSlot : "";
    const planRow = nowCard ? "" : nowSlot;
    const goalStreak = showStreak || showGoal ? html`${showGoal ? html`<div class="goal">
          ${goalRing(done, target, celebrate)}
          <div class="goal-text">
            <p class="goal-label">${t("today.goalLabel")}</p>
            <p class="goal-sub">${done >= target ? t("today.goalMet") : t("today.goalProgress", { done, goal: target })}</p>
            <button type="button" class="link" data-action="goal">${t("today.changeGoal")}</button>
          </div>
        </div>` : ""}
        ${showStreak ? habitsRow(today) : ""}` : "";
    const dayCard = todayDiaryCard(syllabus, { top: goalStreak, goalShown: showGoal });
    const dueToday = cand.due.slice(0, REVIEW_CAP);

    container.innerHTML = html`<section class="today">
      <h1 class="greeting">${greet}</h1>
      ${backupWarning()}
      ${store.setting("showCountdown", true) !== false ? countdownCard() : ""}
      ${active ? html`<button type="button" class="continue-card" data-action="continue">
        <span class="row-main"><span class="row-title">${t("today.continue", { label: tests.testLabel(active) })}</span>
        <span class="row-sub">${progressText(active)}</span></span><span class="chev-txt">›</span></button>` : ""}
      ${session}
      ${nowCard}
      ${dayCard || (goalStreak ? html`<div class="today-strip">${goalStreak}</div>` : "")}
      <div class="rows today-rows">
        <button type="button" class="row" data-action="start"><span class="row-main"><span class="row-title">📝 ${t("today.startTest")}</span><span class="row-sub">${t("today.startTestSub")}</span></span><span class="chev-txt">›</span></button>
        ${cand.due.length ? html`<button type="button" class="row due-row" data-action="due">
          <span class="row-main"><span class="row-title">🔁 ${t("next.dueTodayN", { n: dueToday.length })}</span>
          <span class="row-sub">${dueToday.map((d) => nameLabel(store.topic(d.topicId))).filter(Boolean).join(", ")}${cand.due.length > REVIEW_CAP ? ` · ${t("next.dueWaiting", { n: cand.due.length - REVIEW_CAP })}` : ""}</span></span>
          <span class="chev-txt">›</span></button>` : ""}
        ${planRow}
      </div>
      ${session ? "" : html`<button type="button" class="btn wide" data-action="start">${t("today.startTest")}</button>`}
      ${remindersTodayRow()}
      ${backupStatus()}
    </section>`;

    onAction(container, {
      quick: (el) => quickTest(el.dataset.id),
      topic: (el) => go("topic", { id: el.dataset.id }),
      another: () => { stepIndex++; store.touch(); },
      due: () => dueSheet(cand.due, cand.freq),
      "backup-auto": () => go("settings", { section: "data" }),
      continue: () => go("test"),
      "session-start": () => startSession(syllabus, plan),
      "session-cards": () => { presetDeck({}, "due"); go("cards", openedFrom("today")); }, // 1.26: the due cards as one deck
      start: () => openStartTest(),
      goal: () => go("settings", { section: "today" }),
      exams: () => go("exams"),
      "exam-add": () => go("exams", { add: "1" }),
      ...nowHandlers,
      ...driveHandlers,
      ...diaryHandlers,
      backup: async () => {
        await store.setSetting("lastBackupAt", Date.now());
        downloadBackup();
        toast(t("settings.backupSaved"));
      }
    });
    // From a reminder or a home-screen shortcut: #/today?go=session|quick|review|q&id=…
    // (done once: the request is taken out of the address first).
    if (params.go) {
      history.replaceState(history.state, "", "#/today");
      const first = plan.focus?.topic?.id || cand.steps[0]?.topicId;
      setTimeout(() => {
        if (params.go === "session") startSession(syllabus, plan);
        else if (params.go === "quick") { if (first) quickTest(first); else openStartTest(); }
        else if (params.go === "review") openReview(today);
        else if (params.go === "q" && params.id) oneQuestion(params.id);
      }, 60);
    }
    const stopExam = tickCountdown(container);
    const stopNow = nowTick(container);
    return () => { stopExam(); stopNow(); };
  }
};
