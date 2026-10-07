/* Today: the home screen. Phase 0 shows the greeting, an empty goal ring
   and what comes next. Next-best-step, streak and tests arrive later. */
import { html } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";

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

export const todayScreen = {
  id: "today",
  tab: 1,
  render(container) {
    container.innerHTML = html`
      <section class="today">
        <h1 class="greeting">${t(greetingKey())}</h1>
        <div class="goal">
          ${goalRing(0, DAILY_GOAL)}
          <div class="goal-text">
            <p class="goal-label">${t("today.goalLabel")}</p>
            <p class="goal-sub">${t("today.goalProgress", { done: 0, goal: DAILY_GOAL })}</p>
          </div>
        </div>
        <div class="panel">
          <h2>${t("today.welcomeTitle")}</h2>
          <p>${t("today.welcomeBody")}</p>
          <p class="hint">${t("today.offlineReady")}</p>
        </div>
      </section>`;
  }
};
