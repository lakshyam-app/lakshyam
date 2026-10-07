/* Making a timetable.
   #/tt-new           tell the app your free study time; build instantly (in the app) or with AI
   #/tt-review?tt=…   look through the draft; use it, edit it, ask AI to change it, or discard
   Nothing is followed until you tap "Use this timetable". */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { confirmAction, runFlow } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { label as nameLabel } from "../../core/names.js";
import { can } from "../../core/entitlements.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as tt from "../../data/timetable.js";
import { nameKey } from "../../data/ids.js";
import { answerRecords, pickByBasis, accuracyBy } from "../../domain/stats.js";
import { isDue } from "../../domain/study.js";
import { ask, parseJsonLoose } from "../../ai/client.js";
import { ensureAi, errorText } from "../ai/ai-ui.js";
import { examOf } from "../today/countdown.js";
import { finishedTests } from "../progress/data.js";
import { blockTitle, icon, fmt, fmtDuration, fmtDate } from "./common.js";
import { scheduleLine } from "./timetable.js";

const PATTERNS = ["same", "5-2", "6-1", "alt"];
let form = null; // kept while the app is open, so a redraw never loses what you entered

/** How much time each subject deserves: its share of past-paper questions, more if you're weak in it. */
export function subjectWeights(syllabus) {
  const counts = new Map(); let all = 0;
  store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => { counts.set(q.subjectId, (counts.get(q.subjectId) || 0) + 1); all++; });
  const records = answerRecords(finishedTests(syllabus.id).filter((a) => a.kind !== "ai"));
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.subjectId);
  return [...counts.entries()].map(([id, n]) => {
    const a = acc[id];
    const weakness = a ? 1 - a.adj : 0.5;
    return { id, n, share: n / Math.max(1, all), acc: a ? a.correct / a.total : null, weight: (n / Math.max(1, all)) * (0.6 + weakness) };
  }).filter((x) => store.subject(x.id)).sort((a, b) => b.weight - a.weight);
}

function defaults(syllabus) {
  const today = T.isoDate();
  const exam = examOf(syllabus);
  const end = exam?.date && exam.date > today ? T.clampEnd(today, T.addDays(exam.date, -1), today) : T.addDays(today, 29);
  return {
    syllabusId: syllabus.id, name: t("tt.defaultName"), start: today, end, pattern: "5-2",
    windows: [[{ start: "05:30", end: "07:30" }, { start: "18:30", end: "21:30" }], [{ start: "08:00", end: "12:30" }, { start: "15:00", end: "19:30" }]],
    session: 50, gap: 10, routine: "", subjects: null, wish: ""
  };
}

const planNames = (pattern) => (pattern === "same" ? [t("tt.pn.every")] : pattern === "alt" ? [t("tt.pn.dayA"), t("tt.pn.dayB")] : [t("tt.pn.weekday"), t("tt.pn.weekend")]);

function minutesOf(windows) { return windows.reduce((a, w) => a + Math.max(0, (T.toMin(w.end) ?? 0) - (T.toMin(w.start) ?? 0)), 0); }

/* ---------- #/tt-new ---------- */

export const ttNewScreen = {
  id: "tt-new",
  parent: "today",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("today");
    if (!form || form.syllabusId !== syllabus.id) form = defaults(syllabus);
    const weights = subjectWeights(syllabus);
    if (!form.subjects) form.subjects = weights.map((w) => w.id);
    const names = planNames(form.pattern);
    const chosen = weights.filter((w) => form.subjects.includes(w.id));
    const wsum = chosen.reduce((a, w) => a + w.weight, 0) || 1;
    const today = T.isoDate();
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tt.title")}</span></button></div>
      <h1>${t("tt.create")}</h1><p class="hint">${t("tt.newHint")}</p></header>
      <label class="field-label">${t("tt.ttName")}<input class="field" type="text" data-f="name" value="${form.name}" maxlength="60"></label>
      <div class="two-col">
        <label class="field-label">${t("tt.startDate")}<input class="field" type="date" data-f="start" value="${form.start}" min="${today}" max="${T.maxEndDate(today)}"></label>
        <label class="field-label">${t("tt.endDate")}<input class="field" type="date" data-f="end" value="${form.end}" min="${today}" max="${T.maxEndDate(today)}"></label></div>
      <p class="hint">${t("tt.maxSix", { date: fmtDate(T.maxEndDate(today), { day: "numeric", month: "short", year: "numeric" }) })}${examOf(syllabus) ? ` ${t("tt.untilExam")}` : ""}</p>
      <h3>${t("tt.patternQ")}</h3>
      <div class="chip-wrap">${PATTERNS.map((p) => html`<button type="button" class="pill ${form.pattern === p ? "on" : ""}" data-action="pattern" data-v="${p}">${t(`tt.pattern.${p}`)}</button>`)}</div>
      <p class="hint">${t("tt.patternMore")}</p>
      ${names.map((nm, pi) => html`<section class="win-box"><h3>${nm}: ${t("tt.studyWindows")}</h3>
        ${form.windows[pi].map((w, wi) => html`<div class="win-row">
          <input class="field" type="time" data-w="${pi}:${wi}:start" value="${w.start}" aria-label="${t("tt.from")}"><span>–</span>
          <input class="field" type="time" data-w="${pi}:${wi}:end" value="${w.end}" aria-label="${t("tt.to")}">
          <button type="button" class="icon-sm" data-action="win-del" data-p="${pi}" data-i="${wi}" aria-label="${t("common.delete")}" ${form.windows[pi].length < 2 ? "disabled" : ""}>✕</button></div>`)}
        <button type="button" class="link" data-action="win-add" data-p="${pi}">＋ ${t("tt.addWindow")}</button>
        <p class="hint">${t("tt.windowTotal", { time: fmtDuration(minutesOf(form.windows[pi])) })}</p></section>`)}
      <h3>${t("tt.sessionLen")}</h3>
      <div class="chip-wrap">${[30, 45, 50, 60, 75, 90].map((v) => html`<button type="button" class="pill ${form.session === v ? "on" : ""}" data-action="session" data-v="${v}">${fmtDuration(v)}</button>`)}</div>
      <h3>${t("tt.breakLen")}</h3>
      <div class="chip-wrap">${[5, 10, 15].map((v) => html`<button type="button" class="pill ${form.gap === v ? "on" : ""}" data-action="gap" data-v="${v}">${fmtDuration(v)}</button>`)}</div>
      <h3>${t("tt.subjectsQ")}</h3>
      <p class="hint">${t("tt.subjectsHint")}</p>
      <div class="checks">${weights.map((w) => {
        const on = form.subjects.includes(w.id);
        return html`<button type="button" class="check ${on ? "on" : ""}" data-action="sub" data-id="${w.id}"><span class="box">${on ? "✓" : ""}</span>
          <span class="row-main"><span>${nameLabel(store.subject(w.id))}</span><span class="row-sub">${t("tt.weightLine", { share: Math.round(w.share * 100), acc: w.acc === null ? t("stats.notTried") : `${Math.round(w.acc * 100)}%`, time: on ? Math.round((w.weight / wsum) * 100) : 0 })}</span></span></button>`;
      })}</div>
      ${can("ai") ? html`<h3>${t("tt.routine")}</h3><p class="hint">${t("tt.routineHint")}</p>
        <textarea class="field" rows="3" data-f="routine" placeholder="${t("tt.routinePh")}">${form.routine}</textarea>
        <label class="field-label">${t("tt.wish")}<input class="field" type="text" data-f="wish" value="${form.wish}" placeholder="${t("tt.wishPh")}" maxlength="300"></label>` : ""}
      <div class="actions-col">
        ${can("ai") ? html`<button type="button" class="btn" data-action="ai">✨ ${t("tt.buildAi")}</button>` : ""}
        <button type="button" class="btn ${can("ai") ? "btn-quiet" : ""}" data-action="auto">⚡ ${t("tt.buildAuto")}</button>
        <button type="button" class="link" data-action="blank">${t("tt.buildBlank")}</button>
      </div>
      <p class="hint">${t("tt.buildNote")}</p>
      <div id="aiStatus"></div>`;

    container.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("input", () => { form[el.dataset.f] = el.value; }));
    container.querySelectorAll("[data-w]").forEach((el) => el.addEventListener("input", () => { const [pi, wi, k] = el.dataset.w.split(":"); form.windows[pi][wi][k] = el.value; }));
    const redraw = () => store.touch();
    onAction(container, {
      back: () => go(tt.activeTimetable(syllabus.id) ? "timetable" : "today"),
      pattern: (el) => { form.pattern = el.dataset.v; redraw(); },
      session: (el) => { form.session = Number(el.dataset.v); redraw(); },
      gap: (el) => { form.gap = Number(el.dataset.v); redraw(); },
      sub: (el) => { const id = el.dataset.id; form.subjects = form.subjects.includes(id) ? form.subjects.filter((x) => x !== id) : [...form.subjects, id]; redraw(); },
      "win-add": (el) => { const w = form.windows[el.dataset.p]; const last = w[w.length - 1]; const s = Math.min(1380, T.toMin(last?.end) ?? 1080); w.push({ start: T.fromMin(s + 30 > 1410 ? s : s + 30), end: T.fromMin(Math.min(1440, s + 120)) }); redraw(); },
      "win-del": (el) => { form.windows[el.dataset.p].splice(Number(el.dataset.i), 1); redraw(); },
      auto: () => { const x = buildAuto(syllabus, weights); if (x) save(x); },
      blank: async () => { const x = tt.blankTimetable(syllabus.id, form.name || t("tt.defaultName")); x.startDate = form.start; x.endDate = T.clampEnd(form.start, form.end); x.source = "blank"; await tt.saveTimetable(x, { quiet: true }); go("tt-plan", { tt: x.id, p: x.dayPlans[0].id }); },
      ai: async () => {
        if (!check()) return;
        if (!(await ensureAi())) return;
        const status = container.querySelector("#aiStatus");
        const btn = container.querySelector('[data-action="ai"]');
        btn.disabled = true;
        status.innerHTML = html`<p class="sheet-status">${t("tt.aiWorking")}</p>`;
        try {
          const x = await buildWithAi(syllabus, weights);
          await save(x);
        } catch (e) {
          if (status.isConnected) status.innerHTML = html`<p class="warn-box pre">${errorText(e)}</p><p class="hint">${t("tt.aiFallback")}</p>`;
          btn.disabled = false;
        }
      }
    });
  }
};

function check() {
  if (!form.subjects.length) { toast(t("tt.pickSubjects")); return false; }
  const n = planNames(form.pattern).length;
  for (let i = 0; i < n; i++) {
    if (!form.windows[i].some((w) => T.toMin(w.end) > T.toMin(w.start))) { toast(t("tt.needWindow")); return false; }
  }
  if (!T.parseIso(form.start) || !T.parseIso(form.end)) { toast(t("tt.pickDates")); return false; }
  return true;
}

function scheduleFor(pattern, ids) {
  if (pattern === "same") return { mode: "daily", daily: ids[0] };
  if (pattern === "alt") return { mode: "cycle", cycle: [ids[0], ids[1]], cycleStart: form.start };
  const w = {}; for (let d = 1; d <= 7; d++) w[d] = pattern === "5-2" ? (d <= 5 ? ids[0] : ids[1]) : (d <= 6 ? ids[0] : ids[1]);
  return { mode: "weekly", weekly: w };
}

function buildAuto(syllabus, weights) {
  if (!check()) return null;
  const subs = weights.filter((w) => form.subjects.includes(w.id)).map((w) => ({ id: w.id, weight: w.weight }));
  const names = planNames(form.pattern);
  const dayPlans = names.map((nm, i) => {
    // Rotate subjects between plans, so a weekend plan doesn't start with the same subject.
    const order = i ? [...subs.slice(i % subs.length), ...subs.slice(0, i % subs.length)] : subs;
    return { id: tt.planId(), name: nm, blocks: T.autoBlocks({ windows: form.windows[i], session: form.session, gap: form.gap, subjects: order, newId: tt.blockId }) };
  });
  return finish(syllabus, dayPlans, scheduleFor(form.pattern, dayPlans.map((p) => p.id)), { source: "auto" });
}

function finish(syllabus, dayPlans, schedule, extra) {
  const start = form.start;
  return { id: tt.ttId(), syllabusId: syllabus.id, name: (form.name || t("tt.defaultName")).slice(0, 60), status: "draft", startDate: start, endDate: T.clampEnd(start, form.end),
    dayPlans, schedule: { ...schedule, cycleStart: schedule.mode === "cycle" ? start : undefined }, overrides: {}, builder: JSON.parse(JSON.stringify(form)), ...extra };
}

async function save(x) {
  await tt.saveTimetable(x, { quiet: true });
  go("tt-review", { tt: x.id });
}

/* ---------- AI ---------- */

const AI_SYSTEM = "You plan study timetables for Kerala PSC aspirants. Reply with ONLY a JSON object, no commentary. Use only the subject and topic names given, spelled exactly. Times are 24-hour HH:MM within one day (00:00–24:00); blocks must not overlap.";

function aiFacts(syllabus, weights) {
  const records = answerRecords(finishedTests(syllabus.id).filter((a) => a.kind !== "ai"));
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.topicId);
  const counts = new Map(); store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => counts.set(q.topicId, (counts.get(q.topicId) || 0) + 1));
  const due = new Set(store.all("topicState").filter((s) => s.syllabusId === syllabus.id && isDue(s)).map((s) => s.topicId));
  const chosen = weights.filter((w) => form.subjects.includes(w.id));
  const wsum = chosen.reduce((a, w) => a + w.weight, 0) || 1;
  return chosen.map((w) => {
    const s = store.subject(w.id);
    const topics = store.topicsOf(w.id).filter((x) => !x.isFallback).map((x) => ({ x, n: counts.get(x.id) || 0, a: acc[x.id] })).filter((r) => r.n);
    const focus = topics.map((r) => ({ ...r, score: r.n * (r.a ? 1 - r.a.adj : 0.8) + (due.has(r.x.id) ? 5 : 0) })).sort((a, b) => b.score - a.score).slice(0, 8);
    return `- ${s.name} (aim for about ${Math.round((w.weight / wsum) * 100)}% of study time; ${Math.round(w.share * 100)}% of past-paper questions; accuracy ${w.acc === null ? "not practised" : `${Math.round(w.acc * 100)}%`})\n  Priority topics: ${focus.map((r) => `${r.x.name}${due.has(r.x.id) ? " [due for revision]" : ""}${r.a ? ` [${Math.round((r.a.correct / r.a.total) * 100)}% right]` : " [not practised]"}`).join("; ") || "any"}`;
  }).join("\n");
}

function aiPrompt(syllabus, weights, feedback = "", previous = null) {
  const names = planNames(form.pattern);
  const exam = examOf(syllabus);
  const days = T.daysFrom(form.start, form.end) + 1;
  const pat = { same: "one plan used every day", "5-2": `"${names[0]}" Monday–Friday and "${names[1]}" Saturday–Sunday`, "6-1": `"${names[0]}" Monday–Saturday and "${names[1]}" on Sunday`, alt: `"${names[0]}" and "${names[1]}" on alternate days` }[form.pattern];
  const windows = names.map((n, i) => `"${n}": study time ${form.windows[i].map((w) => `${w.start}–${w.end}`).join(", ")}`).join("\n");
  const schedule = form.pattern === "same" ? `{"mode":"daily"}` : form.pattern === "alt" ? `{"mode":"cycle","cycle":["${names[0]}","${names[1]}"]}` : `{"mode":"weekly","weekly":{"monday":"${names[0]}",…,"sunday":"${names[1]}"}}`;
  return `Make a timetable for ${days} days (${form.start} to ${form.end})${exam ? `; the exam is on ${exam.date}` : ""}.
Pattern: ${pat}.
Free time for study, per day plan:
${windows}
${form.routine ? `Daily routine (keep these as break blocks, and never put study over them): ${form.routine}\n` : ""}Preferred study session: about ${form.session} minutes, with ${form.gap}-minute breaks.
${form.wish ? `Student's wishes: ${form.wish}\n` : ""}
Subjects (share the study time roughly as given; weaker, frequently-asked subjects get more):
${aiFacts(syllabus, weights)}

Rules:
- Study blocks only inside the free study time. Add short breaks between sessions.
- Every day plan ends its study time with a 20–30 minute "revision" block (subject optional).
- ${form.pattern === "same" ? "Once a week is not possible with one plan, so add a 30-minute \"test\" block at the end of the day." : `Put one 45–60 minute "test" block in "${names[names.length - 1]}".`}
- For each study block pick 1–3 topics from that subject's priority list; spread the topics across the plans.
- Never schedule the same subject twice in a row.
- block kinds: "study", "revision", "test", "break" (with break_type one of food, bath, rest, exercise, sleep, travel, work, other), "custom".
${feedback ? `\nThe student reviewed your previous draft and asks: "${feedback}"\nPrevious draft:\n${JSON.stringify(previous)}\nChange it accordingly, keeping everything else that was fine.\n` : ""}
Return exactly this JSON shape:
{"day_plans":[{"name":"${names[0]}","blocks":[{"start":"05:30","end":"06:20","kind":"study","subject":"…","topics":["…"],"label":"optional short note"},{"start":"06:20","end":"06:30","kind":"break","break_type":"rest"}]}${names.length > 1 ? `,{"name":"${names[1]}","blocks":[…]}` : ""}],
 "schedule":${schedule},
 "notes":"2-3 short sentences: how you balanced the subjects and why"}`;
}

function finder(syllabusId) {
  const subjects = store.all("subjects");
  const byKey = new Map(); subjects.forEach((s) => [s.key, nameKey(s.name), ...(s.aliasKeys || [])].forEach((k) => k && !byKey.has(k) && byKey.set(k, s.id)));
  return {
    newId: () => tt.blockId(),
    subject: (name) => byKey.get(nameKey(name)) || null,
    topic: (sid, name) => {
      const k = nameKey(name);
      const tp = store.topicsOf(sid).find((x) => x.key === k || nameKey(x.name) === k || (x.aliasKeys || []).includes(k));
      return tp?.id || null;
    },
    syllabusId
  };
}

async function buildWithAi(syllabus, weights, feedback = "", previous = null) {
  const { text, preset } = await ask(AI_SYSTEM, aiPrompt(syllabus, weights, feedback, previous), 7000);
  const json = parseJsonLoose(text);
  const find = finder(syllabus.id);
  const draft = T.readAiDraft(json, find);
  if (!draft.dayPlans.length || !draft.dayPlans.some((p) => p.blocks.some((b) => b.kind === "study"))) throw new Error(t("tt.aiEmpty"));
  // Plans get plan ids (readAiDraft used block ids for both); fix the references.
  const remap = new Map(draft.dayPlans.map((p) => [p.id, tt.planId()]));
  const re = (v) => (v === T.OFF ? v : remap.get(v) || v);
  const dayPlans = draft.dayPlans.map((p) => ({ ...p, id: remap.get(p.id) }));
  const s = draft.schedule;
  const schedule = { mode: s.mode, daily: s.daily && re(s.daily), weekly: s.weekly && Object.fromEntries(Object.entries(s.weekly).map(([k, v]) => [k, re(v)])), cycle: s.cycle && s.cycle.map(re) };
  return finish(syllabus, dayPlans, schedule, { source: "ai", aiNotes: String(json.notes || "").slice(0, 600), aiIssues: draft.issues, aiBy: preset.name });
}

/* ---------- #/tt-review ---------- */

export const ttReviewScreen = {
  id: "tt-review",
  parent: "today",
  render(container, { tt: id }) {
    const x = tt.getTimetable(id);
    const syllabus = store.currentSyllabus();
    if (!x || !syllabus) return go("timetable");
    const weekFrom = x.startDate;
    const week = T.rangeMinutes(x, weekFrom, T.addDays(weekFrom, 6));
    const rows = Object.entries(week.bySubject).sort((a, b) => b[1] - a[1]);
    const issues = x.dayPlans.flatMap((p) => T.blockIssues(p.blocks));
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tt.title")}</span></button></div>
      <h1>${t("tt.reviewTitle")}</h1><p class="hint">${x.name} · ${fmtDate(x.startDate)} – ${fmtDate(x.endDate)} · ${scheduleLine(x)}</p></header>
      ${x.status !== "draft" ? html`<p class="ok-box">${t("tt.alreadyUsing")}</p>` : html`<p class="warn-box">${t(x.source === "ai" ? "tt.reviewAi" : "tt.reviewAuto")}</p>`}
      ${x.aiNotes ? html`<p class="ai-note">🤖 ${x.aiNotes}${x.aiBy ? html` <span class="hint">(${x.aiBy})</span>` : ""}</p>` : ""}
      ${x.aiIssues?.length ? html`<p class="hint">${t("tt.aiFixed", { list: x.aiIssues.map((k) => t(`tt.aiIssue.${k}`)).join(", ") })}</p>` : ""}
      ${issues.length ? html`<p class="warn-box">${t("tt.issues", { n: issues.length })}</p>` : ""}
      <h3 class="rows-head">${t("tt.firstWeek")}</h3>
      <p class="hint">${t("tt.weekFocus", { time: fmtDuration(week.focus), days: week.days })}</p>
      <div class="week-bars">${rows.map(([sid, min]) => html`<div class="wb-row"><span class="wb-name">${nameLabel(store.subject(sid))}</span><span class="wb-bar"><span class="wb-fill" style="width:${Math.round((min / Math.max(1, rows[0][1])) * 100)}%"></span></span><span class="wb-val">${fmtDuration(min)}</span></div>`)}</div>
      ${x.dayPlans.map((p) => html`<section class="plan-preview"><h3>${p.name} <span class="hint">· ${t("tt.focusTime", { time: fmtDuration(T.planMinutes(p.blocks).focus) })}</span></h3>
        <ol class="agenda compact">${T.sortBlocks(p.blocks).map((b) => html`<li><div class="ag-row k-${b.kind}"><span class="ag-time">${fmt(b.start)}</span>
          <span class="ag-main"><span class="ag-title">${icon(b)} ${blockTitle(b)}</span>${b.topicIds?.length ? html`<span class="row-sub">${b.topicIds.map((tid) => nameLabel(store.topic(tid))).filter(Boolean).join(", ")}</span>` : ""}</span>
          <span class="hint">${fmtDuration(T.durationMin(b))}</span></div></li>`)}</ol>
        <button type="button" class="link" data-action="edit-plan" data-p="${p.id}">✎ ${t("tt.editThisPlan")}</button></section>`)}
      ${x.source === "ai" && x.status === "draft" ? html`<h3>${t("tt.askChange")}</h3>
        <textarea class="field" rows="2" id="fb" placeholder="${t("tt.askChangePh")}"></textarea>
        <button type="button" class="btn btn-quiet" data-action="redo">🤖 ${t("tt.redo")}</button><div id="redoStatus"></div>` : ""}
      <div class="sheet-actions sticky">
        ${x.status === "draft" ? html`<button type="button" class="btn btn-quiet" data-action="discard">${t("ai.discard")}</button>` : ""}
        <button type="button" class="btn btn-quiet" data-action="schedule">🔁 ${t("tt.schedule")}</button>
        ${x.status !== "active" ? html`<button type="button" class="btn" data-action="use">✓ ${t("tt.useThis")}</button>` : ""}</div>`;
    typesetMath(container);
    onAction(container, {
      back: () => go(tt.activeTimetable(syllabus.id) ? "timetable" : "tt-new"),
      "edit-plan": (el) => go("tt-plan", { tt: id, p: el.dataset.p }),
      schedule: () => go("tt-schedule", { tt: id }),
      use: async () => {
        const prev = tt.activeTimetable(syllabus.id);
        if (prev && prev.id !== id) {
          const ok = await confirmAction({ title: t("tt.replaceTitle"), body: t("tt.replaceBody", { name: prev.name }), confirmLabel: t("tt.useThis") });
          if (!ok) return;
        }
        await tt.activate(tt.getTimetable(id));
        form = null;
        toast(t("tt.nowFollowing", { name: x.name }));
        go("timetable");
      },
      discard: () => runFlow(async () => {
        const ok = await confirmAction({ title: t("tt.discardTitle"), confirmLabel: t("ai.discard"), danger: true });
        if (!ok) return;
        await tt.deleteTimetable(x);
        go("tt-new");
      }),
      redo: async (el) => {
        const fb = container.querySelector("#fb").value.trim();
        if (!fb) { toast(t("tt.askChangeEmpty")); return; }
        if (!(await ensureAi())) return;
        const status = container.querySelector("#redoStatus");
        el.disabled = true;
        status.innerHTML = html`<p class="sheet-status">${t("tt.aiWorking")}</p>`;
        try {
          form = { ...(x.builder || form || defaults(syllabus)) };
          const previous = { day_plans: x.dayPlans.map((p) => ({ name: p.name, blocks: T.sortBlocks(p.blocks).map((b) => ({ start: b.start, end: b.end, kind: b.kind, subject: b.subjectId ? store.subject(b.subjectId)?.name : undefined, topics: b.topicIds?.map((tid) => store.topic(tid)?.name).filter(Boolean), break_type: b.breakType, label: b.label })) })) };
          const next = await buildWithAi(syllabus, subjectWeights(syllabus), fb, previous);
          await tt.deleteTimetable(x);
          await save(next);
        } catch (e) {
          if (status.isConnected) status.innerHTML = html`<p class="warn-box pre">${errorText(e)}</p>`;
          el.disabled = false;
        }
      }
    });
  }
};
