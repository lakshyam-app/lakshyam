/* 📱 Screen time: read from your Digital Wellbeing (or Samsung "Screen time") screenshot by your AI preset,
   checked by you, then one tap per app for how much of it was study. Apps under 20 minutes are left out.
   Shown with the day in the Study diary, on the Today card and in the weekly report.
   The screenshot itself is never kept (only app names and minutes). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { askText, confirmAction, runFlow } from "../../core/dialogs.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as S from "../../domain/screen-time.js";
import * as st from "../../data/screen-time.js";
import { ask, parseJsonLoose, aiControl } from "../../ai/client.js";
import { ensureAi, errorText, waitingBox, paintWaiting, watchWaiting } from "../ai/ai-ui.js";
import { fmtDate } from "../timetable/common.js";

const MAX_FILES = 4;
const SHOT_SYSTEM = `You read Android screen-time screenshots: Google "Digital Wellbeing" (App activity details / Dashboard) or Samsung "Screen time".
Output ONLY JSON: {"date": "YYYY-MM-DD" or null, "apps": [{"name": "YouTube", "time": "1 hr, 20 mins"}]}.
- One entry for every app row you can see, in order; "name" exactly as shown, "time" exactly as shown next to it.
- "date": the day the screenshot is about, if it is shown (e.g. "Fri, 16 Oct", "Today", "Yesterday"); otherwise null.
- Do not include the screen's title, totals, buttons, notification counts or website lists. Never guess anything that is not visible.`;

const shotUser = (today) => `Today is ${today} (${T.parseIso(today).toLocaleDateString("en-GB", { weekday: "long" })}). Read these screenshot(s).`;

/* ---------- files → page pictures ---------- */

function pickShots() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*,application/pdf,.pdf"; input.multiple = true; input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => { const files = [...(input.files || [])]; input.remove(); resolve(files); }, { once: true });
    input.click();
  });
}

/** A picture made smaller (about 1080 px wide JPEG): enough to read, fewer tokens. */
async function imageUrl(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const url = c.toDataURL("image/jpeg", 0.8); c.width = c.height = 0;
  return url;
}

async function pictures(files) {
  const out = [];
  for (const f of files) {
    if (out.length >= MAX_FILES) break;
    if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) {
      const { openStoredPdf, renderPageJpeg } = await import("../../pdf/pdf-reader.js");
      const doc = await openStoredPdf({ blob: f });
      try { for (let n = 1; n <= doc.numPages && out.length < MAX_FILES; n++) out.push(await renderPageJpeg(doc, n, { width: 1080, quality: 0.8 })); }
      finally { try { await doc.destroy(); } catch { /* ignore */ } }
    } else if (/^image\//i.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)) out.push(await imageUrl(f));
  }
  return out;
}

/* ---------- add / edit ---------- */

/** 📱 Add screen time: pick screenshot(s) or a PDF → AI reads → you check and answer → saved for the day. */
export async function addScreenTime(dateHint = null) {
  if (!(await ensureAi())) return;
  const files = await pickShots();
  if (!files.length) return;
  const title = `📱 ${t("screen.title")}`;
  const control = aiControl(() => paintWaiting(box, control));
  const box = openSheet(html`<h2>${title}</h2><p class="hint">${t("screen.reading", { n: files.length })}</p>${waitingBox()}`, {
    skip: () => control.skip(), stop: () => { control.cancel(); closeSheet(); } }, { label: title });
  watchWaiting(box, () => control);
  let imgs;
  try { imgs = await pictures(files); } catch { imgs = []; }
  if (!imgs.length) { if (box.isConnected) failSheet(title, t("screen.noPictures")); return; }
  const today = T.isoDate();
  let reply;
  try { reply = await ask(SHOT_SYSTEM, shotUser(today), 1500, { images: imgs, control }); } catch (e) {
    if (e.cancelled || !box.isConnected) return;
    return failSheet(title, errorText(e));
  }
  if (!box.isConnected) return;
  let data;
  try { data = S.readReply(parseJsonLoose(reply.text)); } catch { data = { date: null, apps: [] }; }
  const all = S.mergeApps([data.apps]);
  if (!all.length) return failSheet(title, t("screen.nothingRead"));
  // The day: the one in the screenshot (if shown and not in the future), else the one you were looking at, else today / yesterday.
  const guess = data.date && data.date <= today ? data.date : dateHint || (new Date().getHours() < 12 ? T.addDays(today, -1) : today);
  reviewSheet({ date: guess, all, by: reply.preset?.model || reply.preset?.name || "", dateFromShot: Boolean(data.date && data.date <= today) });
}

function failSheet(title, msg) {
  openSheet(html`<h2>${title}</h2><p class="warn-box pre">${msg}</p><p class="hint">${t("screen.tips")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      <button type="button" class="btn" data-action="again">${t("screen.tryOther")}</button></div>`, { close: () => closeSheet(), again: () => addScreenTime() });
}

/** Opens a saved day to change its times or answers. */
export function editScreenTime(date) {
  const e = st.screenOn(date);
  if (!e) return addScreenTime(date);
  reviewSheet({ date, all: e.apps.map((a) => ({ ...a })), ignored: e.ignored || 0, ignoredMin: e.ignoredMin || 0, editing: true });
}

/**
 * Check what was read, fix a time if needed, and answer for each app (your usual answer is filled in).
 * all: every app read (those under 20 minutes are left out here).
 */
function reviewSheet({ date, all, by = "", dateFromShot = false, ignored = null, ignoredMin = null, editing = false }) {
  const defaults = st.screenDefaults();
  const split = editing ? { kept: all, ignored, ignoredMin } : S.keepBig(all);
  const s = {
    date,
    apps: split.kept.map((a) => {
      const key = a.key || S.appKey(a.name);
      const usual = S.usualShare(defaults, key) || (key === "lakshyam" ? "all" : null);
      return { name: a.name, key, min: a.min, share: a.share || usual, usual: !a.share && Boolean(usual) };
    })
  };
  const title = `📱 ${t("screen.title")}`;
  const today = T.isoDate();
  const draw = () => {
    const missing = s.apps.filter((a) => !a.share).length;
    const exists = !editing && st.screenOn(s.date);
    openSheet(html`<h2>${title}</h2>
      <label class="field-label">${t("screen.day")}<input type="date" class="field" id="scDate" value="${s.date}" max="${today}"></label>
      ${dateFromShot ? html`<p class="hint">${t("screen.dateFromShot")}</p>` : ""}
      ${exists ? html`<p class="warn-box">${t("screen.replaces")}</p>` : ""}
      ${by ? html`<p class="made-with">🤖 ${t("screen.readBy", { name: by })} · ${t("screen.checkTimes")}</p>` : ""}
      ${s.apps.length ? html`<p class="hint">${t("screen.askHow")}</p>
      <div class="sc-list">${s.apps.map((a, i) => html`<div class="sc-app">
        <div class="sc-head"><span class="sc-name">${a.name}</span>
          <label class="sc-min"><input type="number" class="field" inputmode="numeric" min="0" max="1440" data-min="${i}" value="${a.min}" aria-label="${t("screen.minutesOf", { name: a.name })}"> <span>${t("screen.minShort")}</span></label></div>
        <div class="sc-choices" role="radiogroup" aria-label="${a.name}">${S.SHARES.map((k) => html`<button type="button" class="sc-pick ${a.share === k ? "on" : ""} sc-${k}" data-action="share" data-i="${i}" data-k="${k}" aria-pressed="${String(a.share === k)}">${S.SHARE_ICON[k]} ${t(`screen.share.${k}`)}</button>`)}</div>
        ${a.usual && a.share ? html`<p class="hint sc-usual">${t("screen.usual")}</p>` : ""}
      </div>`)}</div>` : html`<p class="hint">${t("screen.noneBig", { n: S.MIN_MINUTES })}</p>`}
      ${split.ignored ? html`<p class="hint">${t("screen.ignored", { n: split.ignored, min: S.hm(split.ignoredMin), limit: S.MIN_MINUTES })}</p>` : ""}
      <div class="sheet-actions sticky-in"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="save" ${missing ? "disabled" : ""}>${missing ? t("screen.answerAll", { n: missing }) : t("common.save")}</button></div>`, {
      share: (el) => { keepInputs(); const a = s.apps[Number(el.dataset.i)]; a.share = el.dataset.k; a.usual = false; draw(); },
      close: () => closeSheet(),
      save: async () => {
        keepInputs();
        if (s.date > today) s.date = today;
        await st.saveScreen(s.date, { apps: s.apps, ignored: split.ignored, ignoredMin: split.ignoredMin, from: by });
        resultSheet(s.date);
      }
    }, { label: title });
    sheetBody().querySelector("#scDate")?.addEventListener("change", (e) => { keepInputs(); if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { s.date = e.target.value; draw(); } });
  };
  const keepInputs = () => {
    const b = sheetBody(); if (!b) return;
    b.querySelectorAll("[data-min]").forEach((inp) => { const v = Math.round(Number(inp.value)); if (Number.isFinite(v) && v >= 0) s.apps[Number(inp.dataset.min)].min = Math.min(1440, v); });
    const d = b.querySelector("#scDate")?.value; if (/^\d{4}-\d{2}-\d{2}$/.test(d || "")) s.date = d;
  };
  draw();
}

/* ---------- after saving: honest, kind feedback ---------- */

function resultSheet(date) {
  const e = st.screenOn(date);
  const d = S.daySummary(e);
  const lim = st.screenLimit()?.min || null;
  const before = st.recentScreen(8, T.addDays(date, -1)).slice(-7);
  const usual = S.periodSummary(before);
  const plan = st.screenPlan();
  const verdict = lim ? (d.wasted <= lim ? t("screen.underLimit", { lim: S.hm(lim) }) : t("screen.overLimit", { over: S.hm(d.wasted - lim), lim: S.hm(lim) })) : "";
  const vsUsual = usual.days >= 3 ? (d.wasted < usual.avgWasted ? t("screen.lessThanUsual", { n: S.hm(usual.avgWasted - d.wasted) }) : d.wasted > usual.avgWasted ? t("screen.moreThanUsual", { n: S.hm(d.wasted - usual.avgWasted) }) : t("screen.sameAsUsual")) : "";
  openSheet(html`<h2>✓ ${t("screen.saved")}</h2><p class="tt-kicker">${fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</p>
    ${dayBars(d)}
    ${verdict ? html`<p class="${lim && d.wasted > lim ? "warn-box" : "ok-box"}">${verdict}</p>` : ""}
    ${vsUsual ? html`<p>${vsUsual}</p>` : ""}
    ${d.top[0] ? html`<p class="hint">${t("screen.topWaste", { list: d.top.map((x) => `${x.name} ${S.hm(x.min)}`).join(", ") })}</p>` : ""}
    ${plan ? html`<p class="plan-box">🎯 ${plan.text}</p>` : ""}
    ${lim && d.wasted > lim ? html`<p class="hint">${t("screen.kind")}</p>` : ""}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, { close: () => { closeSheet(); store.touch(); } });
}

/** Study · needed · wasted as one bar with figures. */
export function dayBars(d) {
  const tot = Math.max(1, d.study + d.needed + d.wasted + d.unsorted);
  const w = (n) => `${Math.round((n / tot) * 1000) / 10}%`;
  return html`<div class="sc-bar" role="img" aria-label="${t("screen.barLabel", { s: S.hm(d.study), n: S.hm(d.needed), w: S.hm(d.wasted) })}">
      <span class="b-study" style="width:${w(d.study)}"></span><span class="b-needed" style="width:${w(d.needed)}"></span><span class="b-wasted" style="width:${w(d.wasted)}"></span><span class="b-unsorted" style="width:${w(d.unsorted)}"></span></div>
    <div class="sc-legend"><span><i class="b-study"></i>${t("screen.study")} <b>${S.hm(d.study)}</b></span><span><i class="b-needed"></i>${t("screen.needed")} <b>${S.hm(d.needed)}</b></span><span><i class="b-wasted"></i>${t("screen.wasted")} <b>${S.hm(d.wasted)}</b></span></div>`;
}

/* ---------- in the diary's day sheet ---------- */

export function screenDayBlock(date) {
  const e = st.screenOn(date);
  if (!e) return html`<div class="sc-day"><h3>📱 ${t("screen.title")}</h3><button type="button" class="btn btn-quiet" data-action="sc-add" data-d="${date}">${t("screen.addFor")}</button></div>`;
  const d = S.daySummary(e);
  const lim = st.screenLimit()?.min || null;
  return html`<div class="sc-day"><h3>📱 ${t("screen.title")}${lim ? html` <span class="badge ${d.wasted <= lim ? "ok" : "bad"}">${d.wasted <= lim ? t("screen.badgeUnder") : t("screen.badgeOver")}</span>` : ""}</h3>
    ${dayBars(d)}
    <ul class="sc-apps">${e.apps.map((a) => html`<li><span>${S.SHARE_ICON[a.share] || "•"} ${a.name}</span><span class="hint">${S.hm(a.min)} · ${a.share ? t(`screen.share.${a.share}`) : t("screen.unsorted")}</span></li>`)}</ul>
    ${e.ignored ? html`<p class="hint">${t("screen.ignoredShort", { n: e.ignored, limit: S.MIN_MINUTES })}</p>` : ""}
    <div class="row-actions"><button type="button" class="link" data-action="sc-edit" data-d="${date}">${t("common.edit")}</button>
      <button type="button" class="link danger" data-action="sc-del" data-d="${date}">${t("common.delete")}</button></div></div>`;
}

/** One-line summary for lists (diary entries, Today). */
export function screenLine(date) {
  const e = st.screenOn(date);
  if (!e) return "";
  const d = S.daySummary(e);
  return t("screen.line", { s: S.hm(d.study), w: S.hm(d.wasted) });
}

export const screenHandlers = (after) => ({
  "sc-add": (el) => addScreenTime(el.dataset.d || null),
  "sc-edit": (el) => editScreenTime(el.dataset.d),
  "sc-del": async (el) => {
    const date = el.dataset.d;
    if (!(await confirmAction({ title: t("screen.deleteTitle"), confirmLabel: t("common.delete"), danger: true }))) { after?.(date); return; }
    const prev = await st.deleteScreen(date);
    toast(t("screen.deleted"), { actionLabel: t("common.undo"), duration: 8000, onAction: () => prev && st.restoreScreen(prev) });
    after?.(date);
  }
});

/* ---------- Today card ---------- */

export function todayScreenRow() {
  const today = T.isoDate();
  const y = T.addDays(today, -1);
  const e = st.screenOn(today);
  const lim = st.screenLimit()?.min || null;
  const plan = st.screenPlan();
  if (e) {
    const d = S.daySummary(e);
    return html`<div class="sc-today"><button type="button" class="row" data-action="sc-edit" data-d="${today}"><span class="row-main"><span class="row-title">📱 ${t("screen.todayTitle")}</span>
      <span class="row-sub">${t("screen.line", { s: S.hm(d.study), w: S.hm(d.wasted) })}${lim ? ` · ${t("screen.limitShort", { lim: S.hm(lim) })}` : ""}</span></span><span class="chev-txt">›</span></button>${plan ? html`<p class="plan-box small">🎯 ${plan.text}</p>` : ""}</div>`;
  }
  const missingY = !st.screenOn(y) && new Date().getHours() < 14;
  return html`<div class="sc-today"><button type="button" class="btn btn-quiet wide" data-action="sc-add" data-d="${missingY ? y : today}">📱 ${missingY ? t("screen.addYesterday") : t("screen.addToday")}</button>${plan ? html`<p class="plan-box small">🎯 ${plan.text}</p>` : ""}</div>`;
}

/* ---------- weekly report part ---------- */

/** Screen time for a week: figures vs the week before, your limit, your biggest time-waster, a timer and a plan. */
export function screenReport(from, to, { current = false } = {}) {
  const today = T.isoDate();
  const end = to < today ? to : today;
  const entries = st.screenBetween(from, end);
  const lim = st.screenLimit()?.min || null;
  const p = S.periodSummary(entries, lim);
  const span = T.daysFrom(from, to) + 1;
  const prev = S.periodSummary(st.screenBetween(T.addDays(from, -span), T.addDays(from, -1)));
  if (!p.days) return current ? html`<div class="sc-week"><h4>📱 ${t("screen.title")}</h4><p class="hint">${t("screen.weekNone")}</p></div>` : "";
  const change = prev.days ? p.avgWasted - prev.avgWasted : null;
  const top = p.apps[0];
  const timer = S.timerFor(top);
  const plan = st.screenPlan();
  const recent = st.recentScreen(S.BASELINE_DAYS, end);
  const sug = S.suggestLimit(recent, lim);
  const daysLeft = Math.max(0, S.BASELINE_DAYS - recent.length);
  return html`<div class="sc-week"><h4>📱 ${t("screen.title")}</h4>
    <div class="facts">
      <div class="fact"><span class="fact-n">${S.hmShort(p.avgStudy)}</span><span class="fact-l">${t("screen.avgStudy")}</span></div>
      <div class="fact"><span class="fact-n">${S.hmShort(p.avgWasted)}</span><span class="fact-l">${t("screen.avgWasted")}${change !== null ? html` · <span class="${change <= 0 ? "good" : "bad"}">${change <= 0 ? "▼" : "▲"} ${S.hm(Math.abs(change))}</span>` : ""}</span></div>
      <div class="fact"><span class="fact-n">${p.studyShare ?? "–"}%</span><span class="fact-l">${t("screen.studyShare")}</span></div>
      ${lim ? html`<div class="fact"><span class="fact-n">${p.underLimit}/${p.days}</span><span class="fact-l">${t("screen.daysUnder", { lim: S.hm(lim) })}</span></div>` : ""}
    </div>
    <p class="hint">${t("screen.weekDays", { n: p.days })}</p>
    ${current ? limitBlock(lim, sug, daysLeft, recent) : ""}
    ${top ? html`<p>${t("screen.biggest", { name: top.name, n: S.hm(top.avgWasted) })}</p>` : ""}
    ${timer ? html`<p class="hint">⏳ ${t("screen.timerTip", { name: top.name, n: S.hm(timer), avg: S.hm(top.avgTotal) })}</p>` : ""}
    ${current && top ? html`${plan ? html`<p class="plan-box">🎯 ${plan.text}</p>` : ""}<button type="button" class="btn btn-quiet" data-action="sc-plan" data-app="${top.name}">✍ ${plan ? t("screen.planEdit") : t("screen.planMake", { name: top.name })}</button>` : ""}
  </div>`;
}

function limitBlock(lim, sug, daysLeft, recent) {
  if (!lim && !sug) return html`<p class="hint">🎯 ${t("screen.limitLater", { n: daysLeft, of: S.BASELINE_DAYS })}</p>`;
  if (!lim) {
    const usual = Math.round(recent.map((e) => S.daySummary(e).wasted).sort((a, b) => a - b)[Math.floor(recent.length / 2)] || 0);
    return html`<p>🎯 ${t("screen.limitSuggest", { n: S.hm(sug), usual: S.hm(usual) })}</p><div class="actions-row"><button type="button" class="btn" data-action="sc-limit" data-v="${sug}">${t("screen.limitUse")}</button><button type="button" class="btn btn-quiet" data-action="sc-limit-own">${t("screen.limitOwn")}</button></div>`;
  }
  if (sug && sug < lim) return html`<p>🎯 ${t("screen.limitLower", { lim: S.hm(lim), n: S.hm(sug) })}</p><div class="actions-row"><button type="button" class="btn" data-action="sc-limit" data-v="${sug}">${t("screen.limitYes")}</button><button type="button" class="btn btn-quiet" data-action="sc-limit-own">${t("screen.limitOwn")}</button></div>`;
  return html`<p class="hint">🎯 ${t("screen.limitNow", { lim: S.hm(lim) })} <button type="button" class="link" data-action="sc-limit-own">${t("common.edit")}</button></p>`;
}

export const reportHandlers = (redraw) => ({
  "sc-limit": async (el) => { await st.setScreenLimit(Number(el.dataset.v)); toast(t("screen.limitSet", { n: S.hm(Number(el.dataset.v)) })); redraw(); },
  "sc-limit-own": () => runFlow(async () => {
    const cur = st.screenLimit()?.min || "";
    const v = await askText({ title: t("screen.limitTitle"), hint: t("screen.limitHint"), value: String(cur), inputMode: "numeric", allowEmpty: true });
    if (v === null) return;
    const n = Math.round(Number(v));
    await st.setScreenLimit(Number.isFinite(n) && n > 0 ? Math.min(600, n) : null);
    redraw();
  }),
  "sc-plan": (el) => runFlow(async () => {
    const name = el.dataset.app;
    const prev = st.screenPlan();
    const v = await askText({ title: t("screen.planTitle"), hint: t("screen.planHint"), value: prev?.text || t("screen.planDefault", { name }), multiline: true, allowEmpty: true });
    if (v === null) return;
    await st.setScreenPlan(v.trim() ? { app: name, text: v.trim().slice(0, 300) } : null);
    redraw();
  })
});

/** How many days of a period have screen time (so a week with only screen time still gets a report). */
export const screenDays = (from, to) => st.screenBetween(from, to < T.isoDate() ? to : T.isoDate()).length;

/** For the AI weekly report: one paragraph of screen-time figures (or ""). */
export function screenReportLine(from, to) {
  const p = S.periodSummary(st.screenBetween(from, to), st.screenLimit()?.min || null);
  if (!p.days) return "";
  const lim = st.screenLimit()?.min;
  return `Phone screen time (from the student's own Digital Wellbeing, apps used 20+ min a day; the student marked how much of each was study): ${p.days} day(s) recorded, per day on average ${p.avgStudy} min study, ${p.avgWasted} min wasted, ${p.avgNeeded} min needed (not study); study share ${p.studyShare ?? "–"}%.${lim ? ` Daily wasted-time limit ${lim} min, kept on ${p.underLimit} of ${p.days} days.` : ""} Biggest time-wasters: ${p.apps.slice(0, 3).map((a) => `${a.name} (${a.avgWasted} min/day wasted)`).join(", ") || "none"}.${st.screenPlan() ? ` Their if-then plan: "${st.screenPlan().text}".` : ""} In the report, mention screen time briefly and kindly with one practical tip.`;
}

