/* Exam countdown: set your exam date (and start time) for a syllabus; Today shows
   the days and hours left, updating every minute. Saved on the syllabus, so it is
   in backups. */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { examMoment, timeUntil } from "../../domain/habits.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";

export const examOf = (syllabus) => (syllabus?.exam?.date ? syllabus.exam : null);
export const examAt = (syllabus) => { const e = examOf(syllabus); return e ? examMoment(e.date, e.time) : null; };

function parts(syllabus, now = Date.now()) {
  const at = examAt(syllabus);
  return at ? timeUntil(at, now) : null;
}

export function countdownText(syllabus, now = Date.now()) {
  const p = parts(syllabus, now);
  if (!p) return "";
  if (p.past) return t("exam.passed");
  if (p.days >= 1) return t("exam.left", { d: p.days, h: p.hours });
  return t("exam.leftToday", { h: p.hours, m: p.minutes });
}

/** The card on Today (or a small "Set your exam date" link). */
export function countdownCard(syllabus) {
  const e = examOf(syllabus);
  if (!e) return html`<button type="button" class="row exam-set" data-action="exam"><span class="row-main"><span class="row-title">📅 ${t("exam.set")}</span><span class="row-sub">${t("exam.setSub")}</span></span><span class="chev-txt">›</span></button>`;
  const p = parts(syllabus);
  const when = new Date(examAt(syllabus)).toLocaleString(dateLocale(), { weekday: "short", day: "numeric", month: "short", year: "numeric", ...(e.time ? { hour: "numeric", minute: "2-digit" } : {}) });
  const urgent = !p.past && p.days < 30;
  return html`<button type="button" class="exam-card ${urgent ? "urgent" : ""} ${p.past ? "past" : ""}" data-action="exam" aria-live="polite">
    <span class="exam-kicker">${e.name || syllabus.name} · ${when}</span>
    ${p.past ? html`<span class="exam-big">${t("exam.passed")}</span><span class="hint">${t("exam.setNext")}</span>`
      : html`<span class="exam-big" id="examLeft">${p.days >= 1 ? html`<b>${p.days}</b> ${t("exam.days", { n: p.days })} <b>${p.hours}</b> ${t("exam.hours", { n: p.hours })}` : html`<b>${p.hours}</b> ${t("exam.hours", { n: p.hours })} <b>${p.minutes}</b> ${t("exam.minutes", { n: p.minutes })}`}</span>
      <span class="hint">${p.days >= 1 ? t("exam.weeks", { w: Math.floor(p.days / 7), d: p.days % 7 }) : t("exam.todayGoodLuck")}</span>`}
  </button>`;
}

/** Keeps the numbers fresh while Today is open. Returns a stop function. */
export function tickCountdown(root, syllabus) {
  if (!examOf(syllabus)) return () => {};
  const timer = setInterval(() => {
    const el = root.querySelector("#examLeft");
    if (!el?.isConnected) { clearInterval(timer); return; }
    const p = parts(syllabus);
    if (!p || p.past) { clearInterval(timer); return; }
    el.innerHTML = String(p.days >= 1 ? html`<b>${p.days}</b> ${t("exam.days", { n: p.days })} <b>${p.hours}</b> ${t("exam.hours", { n: p.hours })}` : html`<b>${p.hours}</b> ${t("exam.hours", { n: p.hours })} <b>${p.minutes}</b> ${t("exam.minutes", { n: p.minutes })}`);
  }, 30000);
  return () => clearInterval(timer);
}

const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function editExam(syllabus = store.currentSyllabus()) {
  if (!syllabus) return;
  const e = examOf(syllabus) || { date: "", time: "", name: "" };
  const body = openSheet(html`<h2>${t("exam.title")}</h2>
    <p class="hint">${t("exam.hint", { syllabus: syllabus.name })}</p>
    <label class="field-label">${t("exam.name")}<input class="field" id="exName" type="text" value="${e.name || ""}" placeholder="${syllabus.name}"></label>
    <div class="two-col">
      <label class="field-label">${t("exam.date")}<input class="field" id="exDate" type="date" min="${todayIso()}" value="${e.date}"></label>
      <label class="field-label">${t("exam.time")}<input class="field" id="exTime" type="time" value="${e.time || ""}"></label>
    </div>
    <p class="hint">${t("exam.timeHint")}</p>
    ${examOf(syllabus) ? html`<button type="button" class="link danger" data-action="remove">${t("exam.remove")}</button>` : ""}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`, {
    cancel: () => closeSheet(),
    remove: async () => { await mut.updateSyllabus(syllabus, { exam: null }); closeSheet(); toast(t("exam.removed")); },
    save: async () => {
      const date = body.querySelector("#exDate").value;
      const time = body.querySelector("#exTime").value;
      if (!examMoment(date, time)) { toast(t("exam.pickDate")); return; }
      await mut.updateSyllabus(syllabus, { exam: { date, time: time || "", name: body.querySelector("#exName").value.trim().slice(0, 80) } });
      closeSheet();
      toast(t("exam.saved"));
    }
  }, { label: t("exam.title") });
}
