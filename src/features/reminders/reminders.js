/* Reminders (Settings → Today & goals → Reminders, #/reminders).
   - The reminders are worked out HERE from your timetable, mistakes, diary and exams
     (domain/reminders.js) and kept on this phone (setting "notifyPlan").
   - Your own small script in your Google account (cloud/push-script.js) gets only the times,
     and wakes the phone then; the service worker (cloud/sw-notify.js) shows the reminder.
   - Buttons pressed on a notification (✓ Done / Skipped, 🙂 Good / 😕 Tough) wait in setting
     "notifyInbox" and are saved here the next time Lakshyam opens.
   All of these settings stay on this phone (never in backups). */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { runFlow, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { copyText } from "../../core/clipboard.js";
import * as store from "../../data/store.js";
import * as db from "../../data/db.js";
import * as TT from "../../data/timetable.js";
import * as diary from "../../data/diary.js";
import * as tests from "../../data/tests.js";
import { dueMistakes } from "../../data/review.js";
import { allExams } from "../../data/exams.js";
import { upcoming, examStart } from "../../domain/exams.js";
import { localDate } from "../../domain/study.js";
import { streak } from "../../domain/habits.js";
import { isGradable, sampleRandom } from "../../domain/testing.js";
import { answerRecords, weakTopics } from "../../domain/stats.js";
import { buildPlan, normalizePrefs } from "../../domain/reminders.js";
import * as P from "../../cloud/push.js";
import { pushScriptFor, PUSH_MANIFEST, isPushScriptUrl } from "../../cloud/push-script.js";
import { blocksOn, blockTitle } from "../timetable/common.js";
import { header, backHandler } from "../library/library.js";
import { label as nameLabel } from "../../core/names.js";
import { clearForNewTest } from "../test/start-sheet.js";

const RESYNC_MS = 6 * 3600000;
const SCRIPT_NEW = "https://script.google.com/home/projects/create";
const KIND_ICON = { block: "📚", morning: "☀️", question: "❓", rescue: "🔥", review: "🌙", weekly: "📊", backup: "💾", test: "🔔" };
const MAXES = [4, 6, 8, 10, 12];
/** Errors that need you to do something (shown on Today too). */
const NEEDS_YOU = ["blocked", "key", "notfound", "notscript", "notimer", "signing", "push", "endpoint"];

export const config = () => ({ ready: false, url: "", key: "", vapid: null, endpoint: "", prefs: null, lastSync: 0, lastHash: "", lastError: "", pending: null, ...(store.setting("reminders") || {}) });
const prefsOf = (c = config()) => normalizePrefs(c.prefs || {});
const save = (patch) => store.quietly(() => store.setSetting("reminders", { ...config(), ...patch }));
const errText = (e) => t(`rem.err.${e?.kind || e || "other"}`, { detail: e?.message || "" });
const when = (ms) => new Date(ms).toLocaleString(dateLocale(), { weekday: "short", hour: "numeric", minute: "2-digit" });

export function remindersState(c = config()) {
  if (!c.ready) return "off";
  const p = prefsOf(c);
  if (!p.on) return "stopped";
  if (p.pauseUntil && p.pauseUntil > Date.now()) return "paused";
  return "on";
}

/* ---------- what the reminders are worked out from ---------- */

/** Same order all day (so a reminder doesn't change between planning and showing). */
function dayRand(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

function pickQuestions(syllabus, today, n = 21) {
  const short = (q) => isGradable(q) && String(q.text || "").length <= 260 && q.options.length <= 5;
  const due = dueMistakes(syllabus.id).filter(short);
  const chosen = sampleRandom(due, Math.min(10, due.length), dayRand(`d${today}`));
  const taken = new Set(chosen.map((q) => q.id));
  const all = store.questionsFor({ syllabusId: syllabus.id });
  const freq = new Map();
  all.forEach((q) => freq.set(q.topicId, (freq.get(q.topicId) || 0) + 1));
  const weak = new Set(weakTopics(freq, answerRecords(store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai")))
    .filter((w) => !store.topic(w.topicId)?.isFallback).slice(0, 12).map((w) => w.topicId));
  const pool = all.filter((q) => weak.has(q.topicId) && short(q) && !taken.has(q.id));
  return [...chosen, ...sampleRandom(pool, n - chosen.length, dayRand(`w${today}`))];
}

function buildInputs(now = Date.now()) {
  const syllabus = store.currentSyllabus();
  const today = localDate(now);
  const tt = syllabus ? TT.activeTimetable(syllabus.id) : null;
  const active = new Set(store.all("activity").filter((a) => (a.count || 0) > 0 || (a.questions || 0) > 0).map((a) => a.id));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i);
    const date = localDate(d.getTime());
    const log = tt ? TT.dayLog(tt.id, date) : null;
    const blocks = tt ? blocksOn(tt, date).map((b) => ({
      id: b.id, start: b.start, end: b.end, kind: b.kind, title: blockTitle(b), marked: Boolean(log?.blocks?.[b.id]?.status),
      topics: (b.topicIds || []).map((id) => nameLabel(store.topic(id))).filter(Boolean).slice(0, 3).join(", ")
    })) : [];
    return { date, ttId: tt?.id || null, blocks, studied: active.has(date), reviewed: Boolean(diary.review(date)?.mood) };
  });
  const drive = store.setting("drive") || {};
  return {
    days,
    exams: upcoming(allExams(), now).map((e) => ({ name: e.name, at: examStart(e) })),
    dueCount: syllabus ? dueMistakes(syllabus.id).length : 0,
    streak: streak(active, today).count,
    questions: syllabus ? pickQuestions(syllabus, today) : [],
    lastBackupAt: Math.max(Number(store.setting("lastBackupAt")) || 0, Number(drive.lastAt) || 0) || null
  };
}

const texts = () => ({
  safeTitle: t("rem.safeTitle"), safeBody: t("rem.safeBody"), wakeTitle: t("rem.wakeTitle"), wakeBody: t("rem.wakeBody"),
  keyTitle: t("rem.keyTitle"), answerTitle: t("rem.act.answer")
});

/* ---------- planning and talking to your script ---------- */

async function readPlan() { return (await db.get("settings", "notifyPlan"))?.value || null; }
async function writePlan(items) {
  // A test reminder sent in the last few minutes is kept until it has been shown.
  const old = await readPlan();
  const tests = (old?.items || []).filter((x) => x.kind === "test" && Date.now() - x.at < 10 * 60000);
  await db.put("settings", { id: "notifyPlan", value: { items: [...tests, ...items], texts: texts(), at: Date.now() } });
}

let planning = null;
/** Works out the reminders and, when the times changed (or every few hours), sends the times to your script. */
export function planNow(opts = {}) {
  if (planning) return planning.then(() => planNowInner(opts));
  planning = planNowInner(opts).finally(() => { planning = null; });
  return planning;
}

async function planNowInner({ force = false } = {}) {
  const c = config();
  if (!c.ready || store.isEmpty()) return [];
  const prefs = prefsOf(c);
  const now = Date.now();
  let items = [];
  try { items = buildPlan({ ...buildInputs(now), now, prefs, say: (k, v) => t(k, v) }); } catch (e) { console.warn("reminders: plan", e); }
  await writePlan(items);
  const times = items.map((x) => x.at);
  const hash = `${prefs.on ? 1 : 0}:${times.join(",")}`;
  if (P.permission() !== "granted") { if (c.lastError !== "blocked") await save({ lastError: "blocked" }); return items; }
  if (!force && hash === c.lastHash && now - (c.lastSync || 0) < RESYNC_MS && !c.lastError) return items;
  if (!navigator.onLine) return items;
  const cfg = { url: c.url, key: c.key, vapid: c.vapid };
  try {
    if (!prefs.on || !times.length) { await P.stop(cfg); await save({ lastHash: hash, lastSync: now, lastError: "" }); return items; }
    const r = await P.sendPlan(cfg, times);
    let lastError = r.timer === false ? "notimer" : "";
    // Now and then: check this phone is still connected (Chrome may renew its push address).
    if (!lastError && (force || now - (c.lastSync || 0) >= RESYNC_MS)) {
      const ping = await P.ping(cfg);
      if (!ping.subscribed) await P.subscribe(cfg);
    }
    await save({ lastHash: hash, lastSync: now, lastError });
  } catch (e) {
    await save({ lastError: e?.kind || "other" });
  }
  return items;
}

let soon = null;
/** After a change (a block marked, a review saved, a test finished): plan again a little later. */
export function syncSoon(ms = 6000) {
  if (!config().ready) return;
  clearTimeout(soon);
  soon = setTimeout(() => { planNow().catch(() => {}); }, ms);
}

/** Saves the buttons pressed on notifications (✓ Done / Skipped, 🙂 Good / 😕 Tough). */
export async function applyInbox() {
  let list;
  try { list = (await db.get("settings", "notifyInbox"))?.value; } catch { return 0; }
  if (!Array.isArray(list) || !list.length) return 0;
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  let n = 0;
  for (const x of list) {
    try {
      const d = x?.data || {};
      if ((x.action === "done" || x.action === "skipped") && isDate(d.date) && typeof d.bid === "string" && TT.getTimetable(d.ttId)) {
        await TT.setBlockStatus(d.ttId, d.date, d.bid, x.action); n++;
      } else if ((x.action === "good" || x.action === "tough") && isDate(String(x.id || "").split(":")[1])) {
        const date = String(x.id).split(":")[1];
        const prev = diary.review(date);
        await diary.saveReview(date, { mood: x.action === "good" ? 4 : 2, note: prev?.note || "", tags: prev?.tags || [] }); n++;
      }
    } catch (e) { console.warn("reminders: inbox", e); }
  }
  // Remove only what was handled here (a button pressed meanwhile stays for next time).
  const keyOf = (x) => `${x?.at}|${x?.id}|${x?.action}`;
  const handled = new Set(list.map(keyOf));
  const now = (await db.get("settings", "notifyInbox"))?.value || [];
  await db.put("settings", { id: "notifyInbox", value: now.filter((x) => !handled.has(keyOf(x))) });
  if (n) toast(t("rem.applied", { n }));
  return n;
}

/** Wired in main.js: the service worker asks the app to open a place or save a button press. */
export function listenToWorker() {
  navigator.serviceWorker?.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "lakshyam-inbox") applyInbox();
    if (m.type === "lakshyam-go" && /^#\/[a-z-]+(\?[\w=&%.-]*)?$/.test(String(m.hash || ""))) location.hash = m.hash;
  });
}

/** On opening the app and coming back to it. */
export async function remindersOnOpen() {
  if (!config().ready) return;
  try { await applyInbox(); } catch { /* next time */ }
  await planNow().catch(() => {});
}

/* ---------- deep links from notifications and home-screen shortcuts ---------- */

/** One question from a reminder, as a 1-question test. */
export async function oneQuestion(id) {
  const syllabus = store.currentSyllabus();
  const q = store.question(id);
  if (!syllabus || !q || !isGradable(q)) { toast(t("start.noneToStart")); return; }
  if (!(await clearForNewTest())) return;
  await tests.startTest({ syllabusId: syllabus.id, scope: { type: "reminder", ref: localDate(), label: t("rem.question.title") }, questionIds: [id], timerMinutes: null, layout: "single" });
  go("test");
}

/* ---------- Today: a row only when something needs you ---------- */

export function remindersTodayRow() {
  const c = config();
  if (!c.ready || !prefsOf(c).on || !NEEDS_YOU.includes(c.lastError)) return "";
  return html`<button type="button" class="row drive-row" data-action="go" data-to="reminders">
    <span class="row-main"><span class="row-title">🔔 ${t("rem.todayRow")}</span><span class="row-sub">${errText(c.lastError)}</span></span>
    <span class="chev-txt">›</span></button>`;
}

/* ---------- setup ---------- */

async function setupSheet() {
  let c = config();
  if (!c.pending?.key || !c.pending?.vapid?.d) { await save({ pending: { key: P.newKey(), vapid: await P.newVapid() } }); c = config(); }
  const { key, vapid } = c.pending;
  const stepRow = (n, title, body) => html`<li class="rs-step"><span class="rs-n">${n}</span><div><b>${title}</b>${body}</div></li>`;
  const body = openSheet(html`<h2>🔔 ${t("rem.setupTitle")}</h2>
    <p class="hint">${t("rem.setupIntro")}</p>
    <p class="hint">${t("rem.setupOnce")}</p>
    <ol class="rs-steps">
      ${stepRow(1, t("rem.s1"), html`<p class="hint">${t("rem.s1h")}</p><a class="btn btn-quiet btn-small" href="${SCRIPT_NEW}" target="_blank" rel="noopener">${t("rem.s1b")} ↗</a>`)}
      ${stepRow(2, t("rem.s2"), html`<p class="hint">${t("rem.s2h")}</p><button type="button" class="btn btn-quiet btn-small" data-action="copy-script">📋 ${t("rem.s2b")}</button>`)}
      ${stepRow(3, t("rem.s3"), html`<p class="hint">${t("rem.s3h")}</p><button type="button" class="btn btn-quiet btn-small" data-action="copy-manifest">📋 ${t("rem.s3b")}</button>`)}
      ${stepRow(4, t("rem.s4"), html`<p class="hint">${t("rem.s4h")}</p>`)}
      ${stepRow(5, t("rem.s5"), html`<p class="hint">${t("rem.s5h")}</p>`)}
      ${stepRow(6, t("rem.s6"), html`<p class="hint">${t("rem.s6h")}</p>
        <label class="field-label">${t("rem.url")}<input class="field" id="rmUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${c.url || ""}"></label>`)}
    </ol>
    <p class="warn-box" id="rmMsg" hidden aria-live="polite"></p>
    <p class="hint">${t("rem.safety")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="test">${t("rem.test")}</button></div>`, {
    close: () => closeSheet(),
    "copy-script": () => copyText(pushScriptFor({ key, vapid })),
    "copy-manifest": () => copyText(PUSH_MANIFEST),
    test: async (el) => {
      const url = body.querySelector("#rmUrl").value.trim();
      const msg = body.querySelector("#rmMsg");
      const say = (text, ok = false) => { msg.hidden = false; msg.textContent = text; msg.classList.toggle("ok-box", ok); };
      if (!isPushScriptUrl(url)) { say(t("rem.badUrl")); return; }
      if (!P.supported()) { say(t("rem.err.unsupported")); return; }
      el.disabled = true; el.textContent = t("rem.testing");
      const cfg = { url, key, vapid };
      try {
        // Permission first, while the tap still counts (Chrome may hide the prompt later).
        say(t("rem.step.perm"), true);
        const p = await Notification.requestPermission();
        if (p !== "granted") throw new P.RelayError(p === "denied" ? "blocked" : "notallowed");
        say(t("rem.step.ping"), true);
        const r = await P.ping(cfg);
        if (!r.timer) throw new P.RelayError("notimer");
        say(t("rem.step.sign"), true);
        await P.checkSigning(cfg);
        say(t("rem.step.sub"), true);
        const endpoint = await P.subscribe(cfg);
        await save({ ready: true, url, key, vapid, endpoint, pending: null, prefs: { ...prefsOf(c), on: true, pauseUntil: null }, lastHash: "", lastSync: 0, lastError: "" });
        say(t("rem.step.push"), true);
        await sendTest(cfg);
        closeSheet();
        toast(t("rem.saved"), { duration: 5000 });
        await planNow({ force: true });
        store.touch();
      } catch (e) {
        el.disabled = false; el.textContent = t("rem.test");
        say(errText(e));
      }
    }
  }, { label: t("rem.setupTitle") });
}

/** A test reminder: added to the plan first, so the phone knows what to show when it's woken. */
async function sendTest(cfg) {
  const old = await readPlan();
  const item = { id: `test:${Date.now()}`, at: Date.now(), kind: "test", title: t("rem.testTitle"), body: t("rem.testBody"), actions: [], url: "#/reminders", data: {} };
  await db.put("settings", { id: "notifyPlan", value: { items: [item, ...(old?.items || []).filter((x) => x.kind !== "test")], texts: texts(), at: Date.now() } });
  await P.pushNow(cfg);
}

async function disconnect() {
  const ok = await confirmAction({ title: t("rem.disconnectTitle"), body: t("rem.disconnectBody"), confirmLabel: t("rem.disconnect"), danger: true });
  if (!ok) return;
  const c = config();
  try { await P.stop({ url: c.url, key: c.key }); } catch { /* the script may be gone already */ }
  await P.unsubscribe();
  await save({ ready: false, url: "", key: "", vapid: null, endpoint: "", pending: null, lastHash: "", lastSync: 0, lastError: "", prefs: { ...prefsOf(c), on: false } });
  await db.put("settings", { id: "notifyPlan", value: { items: [], texts: texts(), at: Date.now() } });
  toast(t("rem.disconnected"));
  store.touch();
}

/* ---------- the screen ---------- */

function statusLine(c) {
  const p = prefsOf(c);
  if (c.lastError) return html`<p class="warn-box">${errText(c.lastError)}</p>`;
  if (!p.on) return html`<p class="hint">${t("rem.status.off")}</p>`;
  if (p.pauseUntil && p.pauseUntil > Date.now()) return html`<p class="hint">⏸ ${t("rem.status.paused", { when: when(p.pauseUntil) })}</p>`;
  return html`<p class="ok-line">✓ ${c.lastSync ? t("rem.status.on", { when: when(c.lastSync) }) : t("rem.status.onNever")}</p>`;
}

const timeInput = (id, value, on = true) => html`<input type="time" class="field rem-time" data-time="${id}" value="${value}" ${on ? "" : "disabled"} aria-label="${t("rem.at")}">`;
const kindRow = (k, on, extra = "") => html`<div class="rem-kind">
  <label class="switch-row"><input type="checkbox" data-kind="${k}" ${on ? "checked" : ""}><span>${KIND_ICON[k]} ${t(`rem.k.${k}`)}<span class="row-sub">${t(`rem.k.${k}Hint`)}</span></span></label>
  ${extra}</div>`;

function controls(c) {
  const p = prefsOf(c);
  const paused = p.pauseUntil && p.pauseUntil > Date.now();
  const qn = p.kinds.question;
  return html`
    <div class="group">
      <label class="switch-row"><input type="checkbox" id="remOn" ${p.on ? "checked" : ""}><span><b>🔔 ${t("rem.master")}</b><span class="row-sub">${t("rem.masterHint")}</span></span></label>
      <div id="remStatus">${statusLine(c)}</div>
      ${p.on ? html`<p class="field-label">${t("rem.pause")}</p>
        <div class="chip-wrap">${paused ? html`<button type="button" class="pill on" data-action="rem-resume">▶ ${t("rem.resume")}</button>`
          : [1, 3, 7].map((d) => html`<button type="button" class="pill" data-action="rem-pause" data-d="${d}">⏸ ${t(`rem.pause${d}`)}</button>`)}</div>` : ""}
    </div>
    ${p.on ? html`<div class="group">
      <h3>${t("rem.kindsHead")}</h3>
      ${kindRow("block", p.kinds.block)}
      ${kindRow("morning", p.kinds.morning, timeInput("morning", p.times.morning, p.kinds.morning))}
      <div class="rem-kind">
        <p class="switch-row-like">${KIND_ICON.question} ${t("rem.k.question")}<span class="row-sub">${t("rem.k.questionHint")}</span></p>
        <div class="chip-wrap"><span class="hint">${t("rem.perDay")}</span>${[0, 1, 2, 3].map((n) => html`<button type="button" class="pill ${qn === n ? "on" : ""}" data-action="rem-qn" data-n="${n}">${n}</button>`)}</div>
        ${qn ? html`<div class="rem-times">${p.times.questions.slice(0, qn).map((v, i) => timeInput(`q${i}`, v))}</div>` : ""}
      </div>
      ${kindRow("rescue", p.kinds.rescue, timeInput("rescue", p.times.rescue, p.kinds.rescue))}
      ${kindRow("review", p.kinds.review, timeInput("review", p.times.review, p.kinds.review))}
      ${kindRow("weekly", p.kinds.weekly, timeInput("weekly", p.times.weekly, p.kinds.weekly))}
      ${kindRow("backup", p.kinds.backup, timeInput("backup", p.times.backup, p.kinds.backup))}
    </div>
    <div class="group">
      <h3>${t("rem.quiet")}</h3>
      <div class="rem-times"><label class="field-label">${t("rem.from")}${timeInput("quietFrom", p.quiet.from)}</label>
        <label class="field-label">${t("rem.to")}${timeInput("quietTo", p.quiet.to)}</label></div>
      <p class="hint">${t("rem.quietHint")}</p>
      <p class="field-label">${t("rem.max")}</p>
      <div class="chip-wrap">${MAXES.map((n) => html`<button type="button" class="pill ${p.max === n ? "on" : ""}" data-action="rem-max" data-n="${n}">${n}</button>`)}</div>
      <p class="hint">${t("rem.maxHint")}</p>
    </div>
    <div class="group">
      <h3>${t("rem.upcoming")}</h3>
      <div id="remUpcoming"><p class="hint">…</p></div>
      <p class="hint">${t("rem.upcomingHint")}</p>
    </div>` : ""}
    <div class="group">
      <button type="button" class="btn btn-quiet" data-action="rem-test">🔔 ${t("rem.testBtn")}</button>
      <button type="button" class="link" data-action="rem-setup">${t("rem.again")}</button>
      <button type="button" class="link danger" data-action="rem-disconnect">${t("rem.disconnect")}</button>
    </div>`;
}

function upcomingHtml(items) {
  const list = (items || []).filter((x) => x.kind !== "test" && x.at > Date.now()).slice(0, 8);
  if (!list.length) return html`<p class="hint">${t("rem.upcomingNone")}</p>`;
  return html`<ul class="rem-list">${list.map((x) => html`<li><span class="rem-when">${when(x.at)}</span><span class="rem-what">${x.title}</span></li>`)}</ul>`;
}

function intro() {
  const standalone = matchMedia("(display-mode: standalone)").matches;
  return html`<div class="group">
      <p>${t("rem.intro")}</p>
      <h3>${t("rem.what")}</h3>
      <ul class="rem-what-list">${t("rem.whatList").split("\n").map((l) => html`<li>${l}</li>`)}</ul>
      <p class="hint">${t("rem.rules", { max: prefsOf().max })}</p>
      ${P.supported() ? html`<p class="hint">${t("rem.setupOnce")}</p>
        <button type="button" class="btn" data-action="rem-setup">🔔 ${t("rem.setupBtn")}</button>` : html`<p class="warn-box">${t("rem.unsupported")}</p>`}
      ${standalone ? "" : html`<p class="hint">${t("rem.notInstalled")}</p>`}
    </div>`;
}

export const remindersScreen = {
  id: "reminders",
  parent: "settings",
  render(container) {
    const c = config();
    container.innerHTML = html`<section class="settings set-page reminders">
      ${header({ backTo: "settings", backParams: { section: "today" }, backLabel: t("setx.back"), title: `🔔 ${t("rem.title")}` })}
      ${c.ready ? controls(c) : intro()}
      <p class="hint rem-short">📌 ${t("rem.shortcuts")}</p>
    </section>`;

    const repaint = async (items) => {
      const up = container.querySelector("#remUpcoming");
      if (up) up.innerHTML = upcomingHtml(items || (await readPlan())?.items);
      const st = container.querySelector("#remStatus");
      if (st) st.innerHTML = statusLine(config());
    };
    const setPrefs = async (patch, redraw = false) => {
      const p = prefsOf();
      await save({ prefs: normalizePrefs({ ...p, ...patch, kinds: { ...p.kinds, ...(patch.kinds || {}) }, times: { ...p.times, ...(patch.times || {}) }, quiet: { ...p.quiet, ...(patch.quiet || {}) } }) });
      if (redraw) store.touch();
      const items = await planNow();
      repaint(items);
    };

    if (c.ready) {
      readPlan().then((plan) => repaint(plan?.items));
      planNow().then((items) => repaint(items)).catch(() => {});
      container.querySelector("#remOn")?.addEventListener("change", (e) => setPrefs({ on: e.target.checked }, true));
      container.querySelectorAll("[data-kind]").forEach((box) => box.addEventListener("change", () => {
        const row = box.closest(".rem-kind")?.querySelector("[data-time]");
        if (row) row.disabled = !box.checked;
        setPrefs({ kinds: { [box.dataset.kind]: box.checked } });
      }));
      container.querySelectorAll("[data-time]").forEach((inp) => inp.addEventListener("change", () => {
        const id = inp.dataset.time; const v = inp.value;
        if (!/^\d{2}:\d{2}$/.test(v)) return;
        const p = prefsOf();
        if (id === "quietFrom") setPrefs({ quiet: { from: v } });
        else if (id === "quietTo") setPrefs({ quiet: { to: v } });
        else if (/^q\d$/.test(id)) { const qs = p.times.questions.slice(); qs[Number(id[1])] = v; setPrefs({ times: { questions: qs } }); }
        else setPrefs({ times: { [id]: v } });
      }));
    }

    onAction(container, {
      ...backHandler,
      go: (el) => go(el.dataset.to),
      "rem-setup": () => setupSheet(),
      "rem-disconnect": () => runFlow(disconnect),
      "rem-pause": (el) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + Number(el.dataset.d)); setPrefs({ pauseUntil: d.getTime() }, true); },
      "rem-resume": () => setPrefs({ pauseUntil: null }, true),
      "rem-qn": (el) => setPrefs({ kinds: { question: Number(el.dataset.n) } }, true),
      "rem-max": (el) => setPrefs({ max: Number(el.dataset.n) }, true),
      "rem-test": async (el) => {
        const cfg = config();
        el.disabled = true;
        try {
          if (P.permission() !== "granted") throw new P.RelayError("blocked");
          await sendTest({ url: cfg.url, key: cfg.key });
          toast(t("rem.testSent"));
          if (cfg.lastError) { await save({ lastError: "" }); repaint(); }
        } catch (e) { toast(errText(e), { duration: 6000 }); } finally { el.disabled = false; }
      }
    });
  }
};

