/* Exam countdowns.
   - Today shows the nearest exam (or the ones you pick) in the layout you choose.
   - The Exams page (#/exams) lists all of them (up to 20), adds / edits / removes,
     and sets what Today shows.
   Saved in the "exams" setting, so they are in backups (see data/exams.js). */
import { html, raw, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { confirmAction, runFlow } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { examMoment, timeUntil } from "../../domain/habits.js";
import * as X from "../../domain/exams.js";
import * as exams from "../../data/exams.js";
import * as store from "../../data/store.js";
import { header, backHandler } from "../library/library.js";

/* ---------- used by the timetable and Settings ---------- */

/** The nearest exam for a syllabus (linked to it, else any). */
export const examOf = (syllabus) => (syllabus ? X.nearestFor(exams.allExams(), syllabus.id) : null);
export const examAt = (syllabus) => { const e = examOf(syllabus); return e ? X.examStart(e) : null; };

export function countdownText(syllabus, now = Date.now()) {
  const e = examOf(syllabus);
  if (!e) return "";
  const p = timeUntil(X.examStart(e), now);
  if (p.past) return t("cd.today");
  if (p.days >= 1) return t("exam.left", { d: p.days, h: p.hours });
  return t("exam.leftToday", { h: p.hours, m: p.minutes });
}

/* ---------- pieces ---------- */

const nameOf = (e) => e.name || store.byId("syllabi", e.syllabusId)?.name || t("cd.unnamed");
const whenOf = (e, long = true) => new Date(X.examStart(e)).toLocaleString(dateLocale(), long
  ? { weekday: "short", day: "numeric", month: "short", year: "numeric", ...(e.time ? { hour: "numeric", minute: "2-digit" } : {}) }
  : { day: "numeric", month: "short", ...(new Date(X.examStart(e)).getFullYear() !== new Date().getFullYear() ? { year: "2-digit" } : {}) });

function left(e, fmt, now = Date.now()) {
  const p = timeUntil(X.examStart(e), now);
  if (p.past) return fmt === "row" ? html`<b>${t("cd.todayShort")}</b>` : html`<span class="cd-today">${t("cd.today")}</span>`;
  if (fmt === "big") return p.days >= 1
    ? html`<b>${p.days}</b> ${t("exam.days", { n: p.days })} <b>${p.hours}</b> ${t("exam.hours", { n: p.hours })}`
    : html`<b>${p.hours}</b> ${t("exam.hours", { n: p.hours })} <b>${p.minutes}</b> ${t("exam.minutes", { n: p.minutes })}`;
  if (fmt === "tile") return p.days >= 1
    ? html`<b>${p.days}</b><span>${t("cd.daysLeft", { n: p.days })}</span>`
    : html`<b>${p.hours}:${String(p.minutes).padStart(2, "0")}</b><span>${t("cd.hoursLeft")}</span>`;
  return p.days >= 1 ? html`<b>${p.days}</b> ${t("cd.d")} ${p.hours} ${t("cd.h")}` : html`<b>${p.hours}</b> ${t("cd.h")} ${p.minutes} ${t("cd.m")}`;
}

const tone = (e, now = Date.now()) => {
  const p = timeUntil(X.examStart(e), now);
  return p.past ? "is-today" : p.days < 7 ? "is-close" : p.days < 30 ? "is-soon" : "";
};

function bigCard(e, { hint = true } = {}) {
  const p = timeUntil(X.examStart(e));
  return html`<button type="button" class="exam-card ${tone(e)}" data-action="exams" data-exam="${e.id}">
    <span class="exam-kicker">${nameOf(e)} · ${whenOf(e)}</span>
    <span class="exam-big" data-left="big">${left(e, "big")}</span>
    ${hint ? html`<span class="hint">${p.past ? t("exam.todayGoodLuck") : p.days >= 1 ? t("exam.weeks", { w: Math.floor(p.days / 7), d: p.days % 7 }) : t("cd.almost")}</span>` : ""}
  </button>`;
}

const tile = (e) => html`<button type="button" class="exam-tile ${tone(e)}" data-action="exams" data-exam="${e.id}">
    <span class="et-name">${nameOf(e)}</span>
    <span class="et-left" data-left="tile">${left(e, "tile")}</span>
    <span class="et-when">${whenOf(e, false)}</span></button>`;

const listCard = (list) => html`<button type="button" class="exam-list" data-action="exams">
    ${list.map((e) => html`<span class="el-row ${tone(e)}" data-exam="${e.id}"><span class="el-main"><span class="el-name">${nameOf(e)}</span><span class="el-when">${whenOf(e, false)}</span></span>
      <span class="el-left" data-left="row">${left(e, "row")}</span></span>`)}</button>`;

/** The countdowns in one layout (used on Today and as the preview on the Exams page). */
export function layoutHtml(list, layout) {
  if (!list.length) return "";
  if (layout === "list") return listCard(list);
  if (layout === "big") return html`<div class="exam-stack">${list.map((e, i) => bigCard(e, { hint: i === 0 }))}</div>`;
  if (layout === "tiles") return html`<div class="exam-tiles ${list.length === 1 ? "one" : ""}">${list.map(tile)}</div>`;
  const [first, ...rest] = list; // featured: the nearest large, the others as tiles
  return html`${bigCard(first)}${rest.length ? html`<div class="exam-tiles ${rest.length === 1 ? "one" : ""}">${rest.map(tile)}</div>` : ""}`;
}

/** What Today shows. */
export function countdownCard() {
  const all = exams.allExams();
  const next = X.upcoming(all);
  if (!all.length) return html`<button type="button" class="row exam-set" data-action="exam-add"><span class="row-main"><span class="row-title">📅 ${t("exam.set")}</span><span class="row-sub">${t("exam.setSub")}</span></span><span class="chev-txt">›</span></button>`;
  if (!next.length) return html`<button type="button" class="row exam-set" data-action="exams"><span class="row-main"><span class="row-title">📅 ${t("exam.passed")}</span><span class="row-sub">${t("exam.setNext")}</span></span><span class="chev-txt">›</span></button>`;
  const d = exams.displayPrefs();
  const shown = X.forToday(all, d);
  const list = shown.length ? shown : next.slice(0, 1); // "ones I pick" with none picked: show the nearest
  const more = next.length - list.length;
  return html`<div class="exam-block" aria-live="polite">${layoutHtml(list, d.layout)}
    ${more > 0 ? html`<button type="button" class="link exam-more" data-action="exams">${t("cd.more", { n: more })} ›</button>` : ""}</div>`;
}

/** Keeps every countdown on screen fresh. Returns a stop function. */
export function tickCountdown(root) {
  const timer = setInterval(() => {
    const els = root.querySelectorAll("[data-exam] [data-left], [data-exam][data-left]");
    if (!root.isConnected) { clearInterval(timer); return; }
    const byId = new Map(exams.allExams().map((e) => [e.id, e]));
    els.forEach((el) => {
      const e = byId.get(el.closest("[data-exam]")?.dataset.exam);
      if (e) el.innerHTML = String(left(e, el.dataset.left));
    });
  }, 30000);
  return () => clearInterval(timer);
}

/* ---------- add / edit ---------- */

const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Add (no exam) or edit an exam. */
export function editExam(exam = null) {
  const all = exams.allExams();
  if (!exam && all.length >= X.MAX_EXAMS) { toast(t("cd.full", { n: X.MAX_EXAMS })); return; }
  const e = exam || { id: exams.newExamId(), name: "", date: "", time: "", syllabusId: store.currentSyllabus()?.id || null };
  const syllabi = store.syllabi();
  const body = openSheet(html`<h2>${exam ? t("cd.editTitle") : t("cd.addTitle")}</h2>
    <label class="field-label">${t("cd.name")}<input class="field" id="exName" type="text" maxlength="80" value="${e.name || ""}" placeholder="${t("cd.namePlaceholder")}"></label>
    <div class="two-col">
      <label class="field-label">${t("exam.date")}<input class="field" id="exDate" type="date" ${exam ? "" : html`min="${todayIso()}"`} value="${e.date}"></label>
      <label class="field-label">${t("exam.time")}<input class="field" id="exTime" type="time" value="${e.time || ""}"></label>
    </div>
    <p class="hint">${t("exam.timeHint")}</p>
    ${syllabi.length ? html`<label class="field-label">${t("cd.syllabus")}<select class="field" id="exSyl">
      <option value="">${t("cd.noSyllabus")}</option>
      ${syllabi.map((s) => html`<option value="${s.id}" ${e.syllabusId === s.id ? "selected" : ""}>${s.name}</option>`)}</select></label>
      <p class="hint">${t("cd.syllabusHint")}</p>` : ""}
    ${exam ? html`<button type="button" class="link danger" data-action="remove">${t("cd.remove")}</button>` : ""}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`, {
    cancel: () => closeSheet(),
    remove: () => runFlow(async () => {
      if (!(await confirmAction({ title: t("cd.removeTitle", { name: nameOf(e) }), confirmLabel: t("cd.remove"), danger: true }))) return;
      await exams.deleteExams([e.id]);
      toast(t("exam.removed"));
    }),
    save: async () => {
      const date = body.querySelector("#exDate").value;
      const time = body.querySelector("#exTime").value;
      if (!examMoment(date, time)) { toast(t("exam.pickDate")); return; }
      const ok = await exams.saveExam({ ...e, date, time, name: body.querySelector("#exName").value.trim(), syllabusId: body.querySelector("#exSyl")?.value || null });
      if (!ok) { toast(t("cd.full", { n: X.MAX_EXAMS })); return; }
      closeSheet();
      toast(t("exam.saved"));
    }
  }, { label: exam ? t("cd.editTitle") : t("cd.addTitle") });
}

/* ---------- the Exams page ---------- */

// Small drawings of each layout (boxes = cards / tiles, lines = list rows).
const R = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
const LAYOUT_ICON = {
  featured: R(1, 1, 30, 11) + R(1, 14, 14, 9) + R(17, 14, 14, 9),
  big: R(1, 1, 30, 10) + R(1, 13, 30, 10),
  tiles: R(1, 1, 14, 10) + R(17, 1, 14, 10) + R(1, 13, 14, 10) + R(17, 13, 14, 10),
  list: R(1, 2, 30, 4) + R(1, 10, 30, 4) + R(1, 18, 30, 4)
};

export const examsScreen = {
  id: "exams",
  parent: "today",
  render(container, params = {}) {
    const all = exams.allExams();
    const next = X.upcoming(all);
    const done = X.finished(all);
    const d = exams.displayPrefs();
    const showOn = store.setting("showCountdown", true) !== false;
    const preview = X.forToday(all, d);

    const row = (e, past = false) => html`<div class="exam-row ${past ? "past" : tone(e)}" data-exam="${e.id}">
      <button type="button" class="er-main" data-action="edit" data-id="${e.id}">
        <span class="er-name">${nameOf(e)}</span>
        <span class="er-sub">${whenOf(e)}${e.syllabusId && store.byId("syllabi", e.syllabusId) ? ` · ${store.byId("syllabi", e.syllabusId).name}` : ""}</span>
        ${past ? "" : html`<span class="er-left" data-left="row">${left(e, "row")}</span>`}
      </button>
      ${!past && d.mode === "chosen" ? html`<label class="er-pin"><input type="checkbox" data-pin="${e.id}" ${d.ids.includes(e.id) ? "checked" : ""}><span>${t("cd.onToday")}</span></label>` : ""}
    </div>`;

    container.innerHTML = html`<section class="exams-page">
      ${header({ backTo: "today", backParams: {}, backLabel: t("tabs.today"), title: t("cd.title"), sub: t("cd.count", { n: all.length, max: X.MAX_EXAMS }) })}
      <button type="button" class="btn" data-action="add" ${all.length >= X.MAX_EXAMS ? "disabled" : ""}>＋ ${t("cd.add")}</button>
      <div class="group cd-today-set">
        <h2>${t("cd.todayTitle")}</h2>
        <label class="switch-row"><input type="checkbox" id="cdShow" ${showOn ? "checked" : ""}><span>${t("exam.showSetting")}</span></label>
        ${showOn ? html`
        <p class="field-label">${t("cd.which")}</p>
        <div class="segmented two" role="group">${X.MODES.map((m) => html`<button type="button" class="${d.mode === m ? "on" : ""}" data-action="mode" data-v="${m}" aria-pressed="${String(d.mode === m)}">${t(`cd.mode.${m}`)}</button>`)}</div>
        ${d.mode === "next" ? html`<p class="field-label">${t("cd.howMany")}</p>
          <div class="chip-wrap">${X.COUNTS.map((n) => html`<button type="button" class="pill ${d.count === n ? "on" : ""}" data-action="count" data-n="${n}">${n}</button>`)}</div>`
          : html`<p class="hint">${t("cd.pickHint")}</p>`}
        <p class="field-label">${t("cd.layout")}</p>
        <div class="cd-layouts" role="group">${X.LAYOUTS.map((l) => html`<button type="button" class="${d.layout === l ? "on" : ""}" data-action="layout" data-v="${l}" aria-pressed="${String(d.layout === l)}">
          <svg class="cl-icon" viewBox="0 0 32 24" aria-hidden="true">${raw(LAYOUT_ICON[l])}</svg><span>${t(`cd.layouts.${l}`)}</span></button>`)}</div>
        <p class="field-label">${t("cd.preview")}</p>
        <div class="cd-preview">${preview.length ? layoutHtml(preview, d.layout) : html`<p class="hint">${next.length ? t("cd.previewNone") : t("cd.none")}</p>`}</div>` : ""}
      </div>

      ${next.length ? html`<h3 class="rows-head">${t("cd.upcoming")}</h3><div class="exam-rows">${next.map((e) => row(e))}</div>`
        : html`<p class="hint pad">${t("cd.none")}</p>`}

      ${done.length ? html`<div class="group">
        <h3 class="rows-head">${t("cd.finished")}</h3>
        <div class="exam-rows">${done.map((e) => row(e, true))}</div>
        <button type="button" class="link danger" data-action="clear-done">${t("cd.clearDone", { n: done.length })}</button>
      </div>` : ""}
    </section>`;

    container.querySelector("#cdShow").addEventListener("change", (ev) => store.setSetting("showCountdown", ev.target.checked));
    container.querySelectorAll("[data-pin]").forEach((box) => box.addEventListener("change", () => {
      const ids = new Set(exams.displayPrefs().ids);
      if (box.checked) ids.add(box.dataset.pin); else ids.delete(box.dataset.pin);
      exams.setDisplay({ ids: [...ids] });
    }));
    // The preview is a picture of Today, not a button.
    container.querySelectorAll(".cd-preview [data-action]").forEach((el) => { el.removeAttribute("data-action"); el.tabIndex = -1; el.setAttribute("aria-hidden", "true"); });

    onAction(container, {
      ...backHandler,
      add: () => editExam(),
      edit: (el) => editExam(all.find((e) => e.id === el.dataset.id)),
      mode: (el) => {
        const patch = { mode: el.dataset.v };
        // First time picking: start with what Today shows now.
        if (el.dataset.v === "chosen" && !d.ids.some((id) => next.some((e) => e.id === id))) patch.ids = X.forToday(all, { ...d, mode: "next" }).map((e) => e.id);
        exams.setDisplay(patch);
      },
      count: (el) => exams.setDisplay({ count: Number(el.dataset.n) }),
      layout: (el) => exams.setDisplay({ layout: el.dataset.v }),
      "clear-done": () => runFlow(async () => {
        if (!(await confirmAction({ title: t("cd.clearDoneTitle", { n: done.length }), confirmLabel: t("cd.clear"), danger: true }))) return;
        await exams.deleteExams(done.map((e) => e.id));
      })
    });
    if (params.add === "1") { history.replaceState(history.state, "", "#/exams"); setTimeout(() => editExam(), 50); }
    return tickCountdown(container);
  }
};
