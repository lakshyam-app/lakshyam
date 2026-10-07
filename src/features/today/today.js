/* Today: the home screen. Greeting, today's goal (questions answered in tests),
   Continue an unfinished test, Start a test, and a short data summary.
   Next-best-step, streak and quick tests arrive in Phase 5. */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import * as store from "../../data/store.js";
import { startImport } from "../import/import-flow.js";
import { localDate } from "../../domain/study.js";
import * as tests from "../../data/tests.js";
import { openStartTest, progressText } from "../test/start-sheet.js";

const DAILY_GOAL = 30; // becomes a setting in Phase 5

function greetingKey(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.evening";
}

/** Goal ring: a gold arc on a quiet track. done/goal decides the arc length. */
function goalRing(done, goal) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, goal ? done / goal : 0) * circumference;
  return html`<svg class="goal-ring" viewBox="0 0 120 120" role="img"
      aria-label="${t("today.goalProgress", { done, goal })}">
    <circle class="goal-track" cx="60" cy="60" r="${r}"/>
    ${filled > 0 ? html`<circle class="goal-arc" cx="60" cy="60" r="${r}"
      stroke-dasharray="${filled} ${circumference}" transform="rotate(-90 60 60)"/>` : ""}
    <text x="60" y="58" class="goal-num">${formatNumber(done)}</text>
    <text x="60" y="78" class="goal-of">/ ${formatNumber(goal)}</text>
  </svg>`;
}

function dataPanel() {
  if (store.isEmpty()) {
    return html`<div class="panel">
      <h2>${t("today.welcomeTitle")}</h2>
      <p>${t("today.welcomeBody")}</p>
      <button type="button" class="btn" data-action="import">${t("today.importButton")}</button>
    </div>`;
  }
  const syllabus = store.currentSyllabus();
  const active = tests.activeTest();
  const testBlock = html`${active ? html`<button type="button" class="continue-card" data-action="continue">
      <span class="row-main"><span class="row-title">${t("today.continue", { label: active.scope?.label || "" })}</span>
      <span class="row-sub">${progressText(active)}</span></span><span class="chev-txt">›</span></button>` : ""}
    <button type="button" class="btn wide" data-action="start">${t("today.startTest")}</button>`;
  const papers = store.papersOf(syllabus.id).length;
  const questions = store.questionsFor({ syllabusId: syllabus.id }).length;
  return html`${testBlock}<div class="panel">
    <h2>${t("today.readyTitle")}</h2>
    <p>${t("today.readyBody", { papers: t("common.papers", { n: papers }), questions: t("common.questions", { n: questions }), syllabus: syllabus.name })}</p>
    <button type="button" class="btn btn-quiet" data-action="library">${t("today.openLibrary")}</button>
  </div>`;
}

export const todayScreen = {
  id: "today",
  tab: 1,
  render(container) {
    // Questions answered in tests today (on the phone's own date).
    const done = store.byId("activity", localDate())?.questions || 0;
    container.innerHTML = html`
      <section class="today">
        <h1 class="greeting">${t(greetingKey())}</h1>
        <div class="goal">
          ${goalRing(done, DAILY_GOAL)}
          <div class="goal-text">
            <p class="goal-label">${t("today.goalLabel")}</p>
            <p class="goal-sub">${t("today.goalProgress", { done, goal: DAILY_GOAL })}</p>
          </div>
        </div>
        ${dataPanel()}
      </section>`;
    onAction(container, {
      import: startImport,
      library: () => go("library"),
      continue: () => go("test"),
      start: () => openStartTest()
    });
  }
};
