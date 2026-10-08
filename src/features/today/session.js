/* Today's session: one button that builds a short mixed test so you don't have to decide.
   1. Mistakes due for review (up to 15), most overdue first.
   2. A focus topic (up to 10 questions, unseen ones first): the topic your timetable has
      for now / later today, otherwise the app's "what to study next" suggestion.
   Flashcards due are shown beside it (they are studied in the Cards view). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { toast } from "../../core/toast.js";
import { nameHtml } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as tests from "../../data/tests.js";
import * as tt from "../../data/timetable.js";
import * as T from "../../domain/timetable.js";
import { dueMistakes } from "../../data/review.js";
import { isGradable, sampleRandom, suggestedMinutes } from "../../domain/testing.js";
import { isDue as cardDue } from "../../domain/cards.js";
import { localDate } from "../../domain/study.js";
import { blocksOn, nowMinute } from "../timetable/common.js";
import { cardsOf } from "../ai/content.js";
import { clearForNewTest, defaults } from "../test/start-sheet.js";

export const MAX_MISTAKES = 15;
export const MAX_FOCUS = 10;

/** Topics your timetable has today: the block running now first, then later ones still to do. */
function timetableTopics(syllabus) {
  const timetable = tt.activeTimetable(syllabus.id);
  if (!timetable) return [];
  const date = T.isoDate();
  const blocks = blocksOn(timetable, date).filter((b) => b.kind !== "break" && b.topicIds?.length);
  const log = tt.dayLog(timetable.id, date);
  const m = nowMinute();
  const open = blocks.filter((b) => log.blocks[b.id]?.status !== "done" && T.toMin(b.end) > m)
    .sort((a, b) => T.toMin(a.start) - T.toMin(b.start));
  return [...new Set(open.flatMap((b) => b.topicIds))].filter((id) => store.topic(id));
}

/** steps: Today's "what to study next" list ({ topicId, kind }). */
export function sessionPlan(syllabus, steps = []) {
  const allDue = dueMistakes(syllabus.id);
  const mistakes = allDue.slice(0, MAX_MISTAKES);
  const taken = new Set(mistakes.map((q) => q.id));
  const answered = new Set(store.attemptsOf(syllabus.id).flatMap((a) => (a.answers || []).filter((r) => r.selected !== null && r.selected !== undefined).map((r) => r.questionId)));
  const pick = (topicId) => {
    const pool = store.questionsFor({ syllabusId: syllabus.id, topicId }).filter((q) => isGradable(q) && !taken.has(q.id));
    const fresh = pool.filter((q) => !answered.has(q.id));
    const chosen = sampleRandom(fresh, MAX_FOCUS);
    return chosen.length >= MAX_FOCUS ? chosen : [...chosen, ...sampleRandom(pool.filter((q) => answered.has(q.id)), MAX_FOCUS - chosen.length)];
  };
  let focus = null;
  for (const id of timetableTopics(syllabus)) { const qs = pick(id); if (qs.length) { focus = { topic: store.topic(id), why: "timetable", questions: qs }; break; } }
  if (!focus) for (const s of steps) { const qs = pick(s.topicId); if (qs.length) { focus = { topic: store.topic(s.topicId), why: s.kind, questions: qs }; break; } }
  const cards = cardsOf(syllabus.id).filter((c) => cardDue(store.byId("flashcardState", c.id) || {})).length;
  const n = mistakes.length + (focus?.questions.length || 0);
  return { mistakes, dueTotal: allDue.length, focus, cards, n, minutes: suggestedMinutes(n) };
}

export function sessionCard(plan) {
  if (!plan.n && !plan.cards) return "";
  const parts = [];
  if (plan.mistakes.length) parts.push(html`<li><span class="ss-ic" aria-hidden="true">🔁</span><span>${plan.dueTotal > plan.mistakes.length ? t("session.mistakesOf", { n: plan.mistakes.length, of: plan.dueTotal }) : t("session.mistakes", { n: plan.mistakes.length })}</span></li>`);
  if (plan.focus) parts.push(html`<li><span class="ss-ic" aria-hidden="true">🎯</span><span>${t(`session.focus.${plan.focus.why}`, { n: plan.focus.questions.length })}: <b>${nameHtml(plan.focus.topic)}</b></span></li>`);
  if (plan.cards) parts.push(html`<li><span class="ss-ic" aria-hidden="true">🃏</span><span><button type="button" class="link inline" data-action="session-cards">${t("session.cards", { n: plan.cards })}</button></span></li>`);
  return html`<article class="session-card">
    <p class="kicker">${t("session.kicker")}</p>
    ${plan.n ? html`<h2>${t("session.title", { n: plan.n, m: plan.minutes })}</h2>` : html`<h2>${t("session.onlyCards")}</h2>`}
    <ul class="ss-list">${parts}</ul>
    ${plan.n ? html`<button type="button" class="btn wide" data-action="session-start">▶ ${t("session.start")}</button>` : ""}
  </article>`;
}

export async function startSession(syllabus, plan) {
  const questions = [...plan.mistakes, ...(plan.focus?.questions || [])];
  if (!questions.length) { toast(t("start.noneToStart")); return; }
  if (!(await clearForNewTest())) return;
  const d = defaults();
  await tests.startTest({
    syllabusId: syllabus.id,
    scope: { type: "session", ref: localDate(), label: t("session.label", { n: questions.length }) },
    questionIds: questions.map((q) => q.id), timerMinutes: d.timerOn ? suggestedMinutes(questions.length) : null, layout: d.layout
  });
  go("test");
}
