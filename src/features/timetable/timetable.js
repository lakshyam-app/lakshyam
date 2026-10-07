/* Timetable.
   #/timetable?d=YYYY-MM-DD   your day (date strip, blocks, mark what you did), the week's hours
   #/tt-list                  all your timetables: follow one, open, delete
   Editing lives in tt-edit.js, creating (by hand, auto-build or AI) in tt-new.js. */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { runFlow, chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { label as nameLabel } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as tt from "../../data/timetable.js";
import { examOf, countdownText } from "../today/countdown.js";
import { blocksOn, blockTitle, blockTitleEn, icon, fmt, fmtRange, fmtDuration, fmtDate, nowMinute, openBlockSheet } from "./common.js";

const back = (label, to = "today", params = {}) => html`<div class="head-bar"><button type="button" class="back" data-action="back" data-to="${to}" data-params="${JSON.stringify(params)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${label}</span></button>
  <button type="button" class="icon-btn" data-action="menu" aria-label="${t("common.more")}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/></svg></button></div>`;
const backHandler = { back: (el) => go(el.dataset.to, JSON.parse(el.dataset.params || "{}")) };

/* ---------- main screen ---------- */

export const timetableScreen = {
  id: "timetable",
  parent: "today",
  render(container, { d, late }) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("today");
    const timetable = tt.activeTimetable(syllabus.id);
    if (!timetable) return emptyState(container, syllabus);
    const today = T.isoDate();
    const date = d && T.parseIso(d) ? d : today;
    const blocks = blocksOn(timetable, date);
    const log = tt.dayLog(timetable.id, date);
    const m = date === today ? nowMinute() : -1;
    const strip = T.dateRange(T.addDays(today, -3), T.addDays(today, 13));
    const pid = T.planIdFor(timetable, date);
    const plan = T.planFor(timetable, date);
    const mins = T.planMinutes(blocks);
    const weekFrom = T.addDays(today, -(T.weekday(today) - 1));
    const week = T.rangeMinutes(timetable, weekFrom, T.addDays(weekFrom, 6));
    const daysLeft = T.daysFrom(today, timetable.endDate);
    const exam = examOf(syllabus);

    container.innerHTML = html`<header class="screen-head">${back(t("tabs.today"))}
      <h1>${timetable.name}</h1>
      <p class="hint">${fmtDate(timetable.startDate)} – ${fmtDate(timetable.endDate)} · ${daysLeft >= 0 ? t("tt.daysLeftTt", { n: daysLeft + 1 }) : t("tt.ended")}${exam ? ` · ${countdownText(syllabus)}` : ""}</p></header>
      <div class="date-strip" id="dateStrip">${strip.map((x) => {
        const p = T.planIdFor(timetable, x);
        return html`<button type="button" class="date-chip ${x === date ? "on" : ""} ${x === today ? "is-today" : ""} ${!p || p === T.OFF ? "off" : ""}" data-action="day" data-d="${x}">
          <span class="dc-w">${T.parseIso(x).toLocaleDateString(dateLocale(), { weekday: "short" })}</span><span class="dc-d">${T.parseIso(x).getDate()}</span></button>`;
      })}</div>
      <div class="day-head"><h2>${date === today ? t("tt.today") : fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <span class="hint">${plan ? `${plan.name} · ${t("tt.focusTime", { time: fmtDuration(mins.focus) })}` : pid === T.OFF ? t("tt.dayOff") : t("tt.outOfRange")}</span></div>
      ${log.shift?.by && date === today ? html`<p class="hint">⏱ ${t("tt.shiftedBy", { m: log.shift.by })} <button type="button" class="link inline" data-action="unshift">${t("tt.unshift")}</button></p>` : ""}
      ${blocks.length ? html`<ol class="agenda">${blocks.map((b) => {
        const st = log.blocks[b.id]?.status;
        const ticks = log.blocks[b.id]?.topicIds?.length || 0;
        const isNow = m >= 0 && T.toMin(b.start) <= m && m < T.toMin(b.end);
        const past = date < today || (m >= 0 && T.toMin(b.end) <= m);
        return html`<li><button type="button" class="ag-row k-${b.kind} ${isNow ? "is-now" : ""} ${past ? "past" : ""} ${st ? `st-${st}` : ""}" data-action="block" data-id="${b.id}">
          <span class="ag-time">${fmt(b.start)}<br><span class="hint">${fmt(b.end)}</span></span>
          <span class="ag-main"><span class="ag-title">${icon(b)} ${blockTitle(b)}</span>
            ${b.topicIds?.length ? html`<span class="row-sub">${b.topicIds.map((id) => nameLabel(store.topic(id))).filter(Boolean).join(", ")}</span>` : ""}
            ${b.label && b.kind === "study" ? html`<span class="row-sub">${b.label}</span>` : ""}</span>
          <span class="ag-state">${st === "done" ? "✓" : st === "skipped" ? "–" : isNow ? t("tt.nowShort") : ""}${ticks ? html`<span class="hint"> ${ticks}📘</span>` : ""}</span></button></li>`;
      })}</ol>` : html`<p class="hint pad">${pid === T.OFF ? t("tt.dayOffHint") : t("tt.outOfRangeHint")}</p>`}
      <div class="actions-row wrap">
        ${date === today && blocks.length ? html`<button type="button" class="btn btn-quiet btn-small" data-action="late">⏱ ${t("tt.late")}</button>` : ""}
        ${plan ? html`<button type="button" class="btn btn-quiet btn-small" data-action="edit-plan" data-p="${plan.id}">✎ ${t("tt.editThisPlan")}</button>` : ""}
        <button type="button" class="btn btn-quiet btn-small" data-action="this-day">${t("tt.changeThisDay")}</button>
      </div>
      <h3 class="rows-head">${t("tt.thisWeek")}</h3>
      ${weekBlock(week, syllabus)}
      <h3 class="rows-head">${t("tt.manage")}</h3>
      <div class="rows">
        <button type="button" class="row" data-action="plans"><span class="row-main"><span class="row-title">🧩 ${t("tt.dayPlans")}</span><span class="row-sub">${timetable.dayPlans.map((p) => p.name).join(" · ")}</span></span><span class="chev-txt">›</span></button>
        <button type="button" class="row" data-action="schedule"><span class="row-main"><span class="row-title">🔁 ${t("tt.schedule")}</span><span class="row-sub">${scheduleLine(timetable)}</span></span><span class="chev-txt">›</span></button>
        <button type="button" class="row" data-action="export"><span class="row-main"><span class="row-title">📆 ${t("tt.export")}</span><span class="row-sub">${t("tt.exportSub")}</span></span><span class="chev-txt">›</span></button>
        <button type="button" class="row" data-action="new"><span class="row-main"><span class="row-title">✨ ${t("tt.newOne")}</span><span class="row-sub">${t("tt.newOneSub")}</span></span><span class="chev-txt">›</span></button>
        <button type="button" class="row" data-action="list"><span class="row-main"><span class="row-title">🗂 ${t("tt.all")}</span></span><span class="chev-txt">›</span></button>
      </div>`;

    onAction(container, {
      ...backHandler,
      day: (el) => go("timetable", { d: el.dataset.d }),
      block: (el) => { const b = blocks.find((x) => x.id === el.dataset.id); if (b) openBlockSheet(timetable, date, b, { onDone: () => store.touch() }); },
      late: () => lateSheet(timetable, date, blocks),
      unshift: async () => { await tt.setShift(timetable.id, date, 0, 0); },
      "edit-plan": (el) => go("tt-plan", { tt: timetable.id, p: el.dataset.p }),
      "this-day": () => changeDay(timetable, date),
      plans: () => go("tt-plans", { tt: timetable.id }),
      schedule: () => go("tt-schedule", { tt: timetable.id }),
      export: () => exportSheet(timetable),
      new: () => go("tt-new"),
      list: () => go("tt-list"),
      menu: () => runFlow(async () => {
        const c = await chooseAction({ title: timetable.name, items: [
          { id: "rename", label: t("tt.rename") }, { id: "plans", label: t("tt.dayPlans") }, { id: "schedule", label: t("tt.schedule") },
          { id: "export", label: t("tt.export") }, { id: "list", label: t("tt.all") }
        ] });
        if (c === "rename") return renameTt(timetable);
        if (c === "plans") return go("tt-plans", { tt: timetable.id });
        if (c === "schedule") return go("tt-schedule", { tt: timetable.id });
        if (c === "export") return exportSheet(timetable);
        if (c === "list") return go("tt-list");
      })
    });
    const chip = container.querySelector(".date-chip.on");
    if (chip) chip.scrollIntoView({ block: "nearest", inline: "center" });
    if (late === "1" && date === today) setTimeout(() => lateSheet(timetable, date, blocks), 50);
  }
};

function weekBlock(week, syllabus) {
  const rows = Object.entries(week.bySubject).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, v]) => a + v, 0) || 1;
  // How much each subject is asked in past papers, to compare with your time.
  const freq = new Map(); let all = 0;
  store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => { freq.set(q.subjectId, (freq.get(q.subjectId) || 0) + 1); all++; });
  if (!rows.length) return html`<p class="hint pad">${t("tt.noStudyWeek")}</p>`;
  return html`<p class="hint">${t("tt.weekFocus", { time: fmtDuration(week.focus), days: week.days })}</p>
    <div class="week-bars">${rows.map(([sid, min]) => {
      const share = min / total; const asked = all ? (freq.get(sid) || 0) / all : 0;
      const low = asked - share > 0.06;
      return html`<div class="wb-row"><span class="wb-name">${nameLabel(store.subject(sid)) || "—"}</span>
        <span class="wb-bar"><span class="wb-fill" style="width:${Math.round(share * 100)}%"></span>${asked ? html`<span class="wb-mark" style="left:${Math.min(100, Math.round(asked * 100))}%" title="${t("tt.askedShare")}"></span>` : ""}</span>
        <span class="wb-val">${fmtDuration(min)}${low ? " ⚠" : ""}</span></div>`;
    })}</div>
    <p class="hint">${t("tt.weekLegend")}</p>`;
}

export function scheduleLine(timetable) {
  const s = timetable.schedule || {};
  const name = (id) => (id === T.OFF ? t("tt.off") : timetable.dayPlans.find((p) => p.id === id)?.name || "?");
  const extra = Object.keys(timetable.overrides || {}).length;
  let line;
  if (s.mode === "weekly") {
    const groups = new Map();
    for (let d = 1; d <= 7; d++) { const k = s.weekly?.[d] ?? T.OFF; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t(`tt.wd.${d}`)); }
    line = [...groups.entries()].map(([k, days]) => `${days.join(", ")}: ${name(k)}`).join(" · ");
  } else if (s.mode === "cycle") line = t("tt.cycleLine", { n: s.cycle.length, list: s.cycle.map(name).join(" → ") });
  else line = t("tt.dailyLine", { name: name(s.daily) });
  return extra ? `${line} · ${t("tt.changedDays", { n: extra })}` : line;
}

function emptyState(container, syllabus) {
  const list = tt.timetables(syllabus.id);
  container.innerHTML = html`<header class="screen-head">${back(t("tabs.today"))}<h1>${t("tt.title")}</h1><p class="hint">${t("tt.intro")}</p></header>
    <div class="actions-col">
      <button type="button" class="btn" data-action="new">✨ ${t("tt.create")}</button>
      ${list.length ? html`<button type="button" class="btn btn-quiet" data-action="list">🗂 ${t("tt.all")} (${list.length})</button>` : ""}
    </div>
    <ul class="tt-points">${["p1", "p2", "p3", "p4", "p5"].map((k) => html`<li>${t(`tt.point.${k}`)}</li>`)}</ul>`;
  onAction(container, { ...backHandler, new: () => go("tt-new"), list: () => go("tt-list"), menu: () => go("tt-list") });
}

async function renameTt(timetable) {
  const { askText } = await import("../../core/dialogs.js");
  const name = await askText({ title: t("tt.rename"), value: timetable.name });
  if (name) await tt.saveTimetable({ ...tt.getTimetable(timetable.id), name: name.slice(0, 60) });
}

/* ---------- running late ---------- */

function lateSheet(timetable, date, blocks) {
  const m = nowMinute();
  const { current } = T.blockAt(blocks, m);
  // Started late: the current block moves too; otherwise from now on.
  const from = current ? T.toMin(current.start) : m;
  openSheet(html`<h2>⏱ ${t("tt.lateTitle")}</h2><p class="hint">${t("tt.lateHint")}</p>
    <div class="chip-wrap">${[10, 15, 30, 45, 60].map((x) => html`<button type="button" class="pill" data-action="by" data-v="${x}">+${x} ${t("tt.min")}</button>`)}</div>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button></div>`, {
    by: async (el) => { await tt.setShift(timetable.id, date, from, Number(el.dataset.v)); closeSheet(); toast(t("tt.lateDone", { m: el.dataset.v })); },
    close: () => closeSheet()
  }, { label: t("tt.lateTitle") });
}

/* ---------- change one day ---------- */

function changeDay(timetable, date) {
  return runFlow(async () => {
    const cur = T.planIdFor(timetable, date);
    const c = await chooseAction({ title: t("tt.changeThisDay"), sub: fmtDate(date, { weekday: "long", day: "numeric", month: "long" }), items: [
      ...timetable.dayPlans.map((p) => ({ id: `use:${p.id}`, label: t("tt.usePlan", { name: p.name }), current: cur === p.id })),
      { id: "off", label: `😌 ${t("tt.makeOff")}`, current: cur === T.OFF },
      cur && cur !== T.OFF ? { id: "copy", label: `✎ ${t("tt.editOnlyThisDay")}`, sub: t("tt.editOnlyThisDaySub") } : null,
      timetable.overrides?.[date] !== undefined ? { id: "reset", label: t("tt.backToSchedule") } : null
    ] });
    if (!c) return;
    const fresh = tt.getTimetable(timetable.id);
    const overrides = { ...(fresh.overrides || {}) };
    if (c === "off") overrides[date] = T.OFF;
    else if (c === "reset") delete overrides[date];
    else if (c.startsWith("use:")) overrides[date] = c.slice(4);
    else if (c === "copy") {
      const src = T.planFor(fresh, date);
      const copy = { id: tt.planId(), name: t("tt.onlyOn", { date: fmtDate(date, { day: "numeric", month: "short" }) }), forDate: date, blocks: src.blocks.map((b) => ({ ...b, id: tt.blockId() })) };
      overrides[date] = copy.id;
      await tt.saveTimetable({ ...fresh, dayPlans: [...fresh.dayPlans, copy], overrides }, { quiet: true });
      return go("tt-plan", { tt: fresh.id, p: copy.id });
    }
    await tt.saveTimetable({ ...fresh, overrides });
    toast(t("tt.dayChanged"));
  });
}

/* ---------- calendar export ---------- */

function exportSheet(timetable) {
  const today = T.isoDate();
  const s = { from: today < timetable.startDate ? timetable.startDate : today, to: timetable.endDate, breaks: false, alarm: 5 };
  const draw = () => {
    const kinds = new Set(["study", "revision", "test", "custom", ...(s.breaks ? ["break"] : [])]);
    const { count } = T.buildIcs(timetable, s.from, s.to, { kinds, alarm: s.alarm, title: blockTitleEn });
    openSheet(html`<h2>📆 ${t("tt.export")}</h2><p class="hint">${t("tt.exportHint")}</p>
      <div class="two-col"><label class="field-label">${t("tt.from")}<input class="field" type="date" id="exFrom" value="${s.from}" min="${timetable.startDate}" max="${timetable.endDate}"></label>
        <label class="field-label">${t("tt.to")}<input class="field" type="date" id="exTo" value="${s.to}" min="${timetable.startDate}" max="${timetable.endDate}"></label></div>
      <label class="switch-row"><input type="checkbox" id="exBreaks" ${s.breaks ? "checked" : ""}><span>${t("tt.exportBreaks")}</span></label>
      <h3>${t("tt.reminder")}</h3><div class="chip-wrap">${[0, 5, 10, 15, 30].map((x) => html`<button type="button" class="pill ${s.alarm === x ? "on" : ""}" data-action="alarm" data-v="${x}">${x ? t("tt.minBefore", { n: x }) : t("tt.noReminder")}</button>`)}</div>
      <p class="hint">${t("tt.exportCount", { n: count })}</p>
      <details><summary>${t("tt.howImport")}</summary><ol class="steps-small">${["s1", "s2", "s3", "s4"].map((k) => html`<li>${t(`tt.import.${k}`)}</li>`)}</ol></details>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
        ${navigator.canShare ? html`<button type="button" class="btn btn-quiet" data-action="share">${t("tt.share")}</button>` : ""}
        <button type="button" class="btn" data-action="download" ${count ? "" : "disabled"}>${t("tt.download")}</button></div>`, {
      alarm: (el) => { s.alarm = Number(el.dataset.v); draw(); },
      close: () => closeSheet(),
      download: () => { const f = file(kinds); const url = URL.createObjectURL(f); const a = document.createElement("a"); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(t("tt.downloaded")); },
      share: async () => { const f = file(kinds); try { if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: timetable.name }); else toast(t("tt.shareNo")); } catch { /* cancelled */ } }
    }, { label: t("tt.export") });
    const body = sheetBody();
    body.querySelector("#exFrom").addEventListener("change", (e) => { if (e.target.value) { s.from = e.target.value; if (s.to < s.from) s.to = s.from; draw(); } });
    body.querySelector("#exTo").addEventListener("change", (e) => { if (e.target.value) { s.to = e.target.value < s.from ? s.from : e.target.value; draw(); } });
    body.querySelector("#exBreaks").addEventListener("change", (e) => { s.breaks = e.target.checked; draw(); });
  };
  const file = (kinds) => {
    const describe = (b) => [b.topicIds?.length ? `Topics: ${b.topicIds.map((id) => store.topic(id)?.name).filter(Boolean).join(", ")}` : "", "From your Lakshyam timetable"].filter(Boolean).join("\n");
    const { text } = T.buildIcs(tt.getTimetable(timetable.id), s.from, s.to, { kinds, alarm: s.alarm, title: blockTitleEn, describe });
    return new File([text], `lakshyam-timetable-${s.from}.ics`, { type: "text/calendar" });
  };
  draw();
}

/* ---------- all timetables ---------- */

export const ttListScreen = {
  id: "tt-list",
  parent: "today",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("today");
    const list = tt.timetables(syllabus.id);
    container.innerHTML = html`<header class="screen-head">${back(t("tt.title"), "timetable")}<h1>${t("tt.all")}</h1><p class="hint">${t("tt.allHint", { syllabus: syllabus.name })}</p></header>
      <div class="rows">${list.map((x) => html`<div class="row tt-row">
        <span class="row-main"><span class="row-title">${x.name} ${x.status === "active" ? html`<span class="mini-chip">${t("tt.following")}</span>` : x.status === "draft" ? html`<span class="mini-chip r-nonotes">${t("tt.draft")}</span>` : ""}</span>
        <span class="row-sub">${fmtDate(x.startDate)} – ${fmtDate(x.endDate)} · ${t("tt.plansN", { n: x.dayPlans.length })}</span></span>
        <button type="button" class="icon-sm" data-action="more" data-id="${x.id}" aria-label="${t("common.more")}">⋯</button></div>`)}</div>
      ${list.length ? "" : html`<p class="hint pad">${t("tt.noneYet")}</p>`}
      <button type="button" class="btn" data-action="new">✨ ${t("tt.create")}</button>`;
    onAction(container, {
      ...backHandler,
      new: () => go("tt-new"),
      menu: () => {},
      more: (el) => runFlow(async () => {
        const x = tt.getTimetable(el.dataset.id);
        const c = await chooseAction({ title: x.name, items: [
          x.status !== "active" ? { id: "follow", label: `✓ ${t("tt.follow")}` } : null,
          x.status === "draft" ? { id: "review", label: t("tt.review") } : null,
          { id: "plans", label: t("tt.dayPlans") }, { id: "schedule", label: t("tt.schedule") },
          { id: "dup", label: t("tt.duplicate") },
          x.status === "active" ? { id: "stop", label: t("tt.stopFollowing") } : null,
          { id: "delete", label: t("tt.delete"), danger: true }
        ] });
        if (c === "follow") { await tt.activate(x); toast(t("tt.nowFollowing", { name: x.name })); return go("timetable"); }
        if (c === "review") return go("tt-review", { tt: x.id });
        if (c === "plans") return go("tt-plans", { tt: x.id });
        if (c === "schedule") return go("tt-schedule", { tt: x.id });
        if (c === "dup") {
          const map = new Map(x.dayPlans.map((p) => [p.id, tt.planId()]));
          const re = (id) => (id === T.OFF ? id : map.get(id) || id);
          const s = x.schedule;
          const copy = { ...x, id: tt.ttId(), name: `${x.name} (2)`, status: "saved",
            dayPlans: x.dayPlans.map((p) => ({ ...p, id: map.get(p.id), blocks: p.blocks.map((b) => ({ ...b, id: tt.blockId() })) })),
            schedule: { ...s, daily: s.daily && re(s.daily), weekly: s.weekly && Object.fromEntries(Object.entries(s.weekly).map(([k, v]) => [k, re(v)])), cycle: s.cycle && s.cycle.map(re) },
            overrides: Object.fromEntries(Object.entries(x.overrides || {}).map(([k, v]) => [k, re(v)])) };
          delete copy.createdAt; delete copy.updatedAt;
          await tt.saveTimetable(copy); toast(t("tt.duplicated")); return;
        }
        if (c === "stop") { await tt.saveTimetable({ ...x, status: "saved" }); toast(t("tt.stopped")); return; }
        if (c === "delete") {
          const ok = await confirmAction({ title: t("tt.deleteTitle", { name: x.name }), body: t("tt.deleteBody"), confirmLabel: t("common.delete"), danger: true });
          if (!ok) return;
          const bundle = await tt.deleteTimetable(x);
          toast(t("tt.deleted"), { actionLabel: t("common.undo"), onAction: () => store.apply({ timetables: { put: bundle.timetables }, ttLog: { put: bundle.ttLog } }), duration: 8000 });
        }
      })
    });
  }
};

export { fmtRange };
