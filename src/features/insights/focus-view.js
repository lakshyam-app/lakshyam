/* Smart insights → "When you focus best": your accuracy by time of day (compared with your usual
   on the same topics) and how often you leave the app during tests (focus check).
   Also used by the timetable (best time hint, AI prompt) and the diary report. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { formatDuration } from "../../domain/testing.js";
import { answerRecords, pickByBasis } from "../../domain/stats.js";
import { bestTime, focusSummary, SLOTS, SLOT_MIN_ANSWERS, SLOT_MIN_TESTS } from "../../domain/focus.js";
import { localDate } from "../../domain/study.js";
import * as store from "../../data/store.js";
import { finishedTests } from "../progress/data.js";

const pyqTests = (syllabus) => finishedTests(syllabus.id).filter((a) => a.kind !== "ai");
const isPyq = (r) => { const q = store.question(r.questionId); return q && q.source !== "ai"; };

/** Accuracy by time of day, from first tries (the hour the test was started). */
export function bestTimeFor(syllabus) {
  const tests = pyqTests(syllabus);
  const hourOf = new Map(tests.map((a) => [a.id, new Date(a.startedAt || a.submittedAt).getHours()]));
  const recs = pickByBasis(answerRecords(tests).filter(isPyq), "first").map((r) => ({ ...r, hour: hourOf.get(r.attemptId) }));
  return bestTime(recs);
}

export function focusFor(syllabus, { from = null, to = null } = {}) {
  let tests = pyqTests(syllabus);
  if (from) tests = tests.filter((a) => { const d = localDate(a.submittedAt); return d >= from && d <= to; });
  const recs = pickByBasis(answerRecords(tests).filter(isPyq), "all");
  return focusSummary(tests, recs);
}

const slotName = (id) => t(`focus.slot.${id}`);
const pts = (x) => { const v = Math.round(x * 100); return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`; };

/** One plain line for the diary's AI report (English, for the AI). */
export function focusReportLine(syllabus, from, to) {
  const f = focusFor(syllabus, { from, to });
  if (!f.tests) return "";
  return `Focus check: left the app ${f.leaves} time(s) during ${f.testsLeft} of ${f.tests} tests (${Math.round(f.awayMs / 60000)} min away in total).`;
}

/** The best slot, if it is clearly better (for the timetable). */
export function clearBestSlot(syllabus) {
  const b = bestTimeFor(syllabus);
  return b.clear ? SLOTS.find((s) => s.id === b.best.id) : null;
}

export function focusSection(syllabus, num) {
  const b = bestTimeFor(syllabus);
  const f = focusFor(syllabus);
  const checkOn = store.setting("focusCheck", true) !== false;
  const order = SLOTS.map((s) => s.id);
  const rows = b.slots.slice().sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
  const verdict = b.best
    ? (b.clear ? html`<p class="ok-box">🌅 ${t("focus.bestClear", { slot: slotName(b.best.id), d: pts(b.best.vsUsual - b.worst.vsUsual), worst: slotName(b.worst.id) })}</p>`
      : html`<p class="hint">${t("focus.bestUnclear")}</p>`)
    : html`<p class="hint">${t("focus.bestNeed", { n: SLOT_MIN_ANSWERS, tests: SLOT_MIN_TESTS })}</p>`;
  return html`<section class="ins-block">
    <h2 class="section-title">${num} · ${t("focus.title")}</h2>
    <h3>${t("focus.bestTitle")}</h3>
    <p class="hint">${t("focus.bestHint")}</p>
    ${verdict}
    ${rows.length ? html`<div class="rows">${rows.map((s) => html`<div class="row static ${b.best && b.clear && s.id === b.best.id ? "is-best" : ""}">
      <span class="row-main"><span class="row-title">${slotName(s.id)}</span>
        <span class="row-sub">${t("focus.slotLine", { acc: Math.round(s.acc * 100), n: s.n })}${s.sec ? ` · ${Math.round(s.sec)} s` : ""}${s.enough ? "" : ` · ${t("focus.few")}`}</span></span>
      <span class="stat-pct">${s.enough ? pts(s.vsUsual) : "…"}</span></div>`)}</div>
      <p class="hint">${t("focus.ptsHint")}</p>` : ""}
    <h3>${t("focus.leaveTitle")}</h3>
    ${!checkOn ? html`<p class="hint">${t("focus.off")}</p>` : ""}
    ${f.tests ? html`<div class="facts">
        <div class="fact"><span class="fact-n">${f.leaves}</span><span class="fact-l">${t("focus.leaves")}</span></div>
        <div class="fact"><span class="fact-n">${f.testsLeft}/${f.tests}</span><span class="fact-l">${t("focus.testsLeft")}</span></div>
        <div class="fact"><span class="fact-n">${formatDuration(f.awayMs)}</span><span class="fact-l">${t("focus.away")}</span></div></div>
      ${f.enough ? html`<p class="${f.clear && f.stayed.vsUsual > f.left.vsUsual ? "warn-box" : "hint"}">${t(f.clear ? "focus.cmpClear" : "focus.cmpUnclear", { stayed: pts(f.stayed.vsUsual), left: pts(f.left.vsUsual) })}</p>`
        : html`<p class="hint">${t("focus.cmpNeed", { n: 3 })}</p>`}
      <p class="hint">${t("focus.leaveHint")}</p>`
      : checkOn ? html`<p class="hint">${t("focus.noneYet")}</p>` : ""}
  </section>`;
}

