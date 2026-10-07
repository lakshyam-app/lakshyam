/* Editing a timetable.
   #/tt-plans?tt=…              the day plans (add, rename, copy, delete)
   #/tt-plan?tt=…&p=…[&b=…]     one day plan's blocks (any times, any length; breaks, revision, tests…)
   #/tt-schedule?tt=…           which plan on which day: every day / by weekday / repeating cycle,
                                dates (up to 6 months ahead) and single changed days */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { label as nameLabel, nameHtml } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as tt from "../../data/timetable.js";
import { blockTitle, icon, fmt, fmtDuration, fmtDate, BREAK_ICON } from "./common.js";
import { scheduleLine } from "./timetable.js";

const head = (title, sub, to, params) => html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back" data-to="${to}" data-params="${JSON.stringify(params)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("common.back")}</span></button></div>
  <h1>${title}</h1>${sub ? html`<p class="hint">${sub}</p>` : ""}</header>`;
const backTo = (x) => (x.status === "draft" ? ["tt-review", { tt: x.id }] : x.status === "active" ? ["timetable", {}] : ["tt-list", {}]);
const backHandler = { back: (el) => go(el.dataset.to, JSON.parse(el.dataset.params || "{}")) };
const save = (x) => tt.saveTimetable(x);

/** Days in the timetable's range that use this plan. */
function daysUsing(x, pid) {
  return T.dateRange(x.startDate, x.endDate).filter((d) => T.planIdFor(x, d) === pid).length;
}

/* ---------- day plans ---------- */

export const ttPlansScreen = {
  id: "tt-plans",
  parent: "today",
  render(container, { tt: id }) {
    const x = tt.getTimetable(id);
    if (!x) return go("timetable");
    const [to, params] = backTo(x);
    container.innerHTML = html`${head(t("tt.dayPlans"), t("tt.dayPlansHint"), to, params)}
      <div class="rows">${x.dayPlans.map((p) => {
        const m = T.planMinutes(p.blocks);
        return html`<button type="button" class="row" data-action="open" data-p="${p.id}">
          <span class="row-main"><span class="row-title">${p.name}</span>
          <span class="row-sub">${t("tt.blocksN", { n: p.blocks.length })} · ${t("tt.focusTime", { time: fmtDuration(m.focus) })} · ${t("tt.usedDays", { n: daysUsing(x, p.id) })}</span></span><span class="chev-txt">›</span></button>`;
      })}</div>
      <div class="actions-row"><button type="button" class="btn" data-action="add">＋ ${t("tt.addPlan")}</button>
        <button type="button" class="btn btn-quiet" data-action="schedule">🔁 ${t("tt.schedule")}</button></div>`;
    onAction(container, {
      ...backHandler,
      open: (el) => go("tt-plan", { tt: id, p: el.dataset.p }),
      schedule: () => go("tt-schedule", { tt: id }),
      add: () => runFlow(async () => {
        const from = x.dayPlans.length ? await chooseAction({ title: t("tt.addPlan"), items: [{ id: "__blank", label: t("tt.blankPlan") }, ...x.dayPlans.map((p) => ({ id: p.id, label: t("tt.copyOf", { name: p.name }) }))] }) : "__blank";
        if (!from) return;
        const name = await askText({ title: t("tt.planName"), placeholder: t("tt.planNamePh"), confirmLabel: t("common.add") });
        if (!name) return;
        const src = x.dayPlans.find((p) => p.id === from);
        const p = { id: tt.planId(), name: name.slice(0, 40), blocks: src ? src.blocks.map((b) => ({ ...b, id: tt.blockId() })) : [] };
        await tt.saveTimetable({ ...tt.getTimetable(id), dayPlans: [...tt.getTimetable(id).dayPlans, p] }, { quiet: true });
        go("tt-plan", { tt: id, p: p.id });
      })
    });
  }
};

/* ---------- one day plan ---------- */

export const ttPlanScreen = {
  id: "tt-plan",
  parent: "today",
  render(container, { tt: id, p: pid, b: openBlock }) {
    const x = tt.getTimetable(id);
    const plan = x?.dayPlans.find((p) => p.id === pid);
    if (!x || !plan) return go("timetable");
    const blocks = T.sortBlocks(plan.blocks);
    const issues = T.blockIssues(blocks);
    const bad = new Map(issues.map((i) => [i.blockId, i.type]));
    const m = T.planMinutes(blocks);
    const used = daysUsing(x, pid);
    container.innerHTML = html`${head(plan.name, `${t("tt.focusTime", { time: fmtDuration(m.focus) })} · ${t("tt.usedDays", { n: used })}`, "tt-plans", { tt: id })}
      ${plan.forDate ? html`<p class="hint">${t("tt.onlyThisDayNote", { date: fmtDate(plan.forDate) })}</p>` : used > 1 ? html`<p class="hint">${t("tt.planSharedNote", { n: used })}</p>` : ""}
      ${issues.length ? html`<p class="warn-box">${t("tt.issues", { n: issues.length })}</p>` : ""}
      <ol class="agenda edit">${blocks.map((b) => html`<li><button type="button" class="ag-row k-${b.kind} ${bad.has(b.id) ? "bad" : ""}" data-action="edit" data-id="${b.id}">
        <span class="ag-time">${fmt(b.start)}<br><span class="hint">${fmt(b.end)}</span></span>
        <span class="ag-main"><span class="ag-title">${icon(b)} ${blockTitle(b)}</span>
          <span class="row-sub">${fmtDuration(T.durationMin(b))}${b.topicIds?.length ? ` · ${b.topicIds.map((tid) => nameLabel(store.topic(tid))).filter(Boolean).join(", ")}` : ""}${bad.has(b.id) ? ` · ⚠ ${t(`tt.issue.${bad.get(b.id)}`)}` : ""}</span></span>
        <span class="chev-txt">›</span></button></li>`)}</ol>
      ${blocks.length ? "" : html`<p class="hint pad">${t("tt.emptyPlan")}</p>`}
      <h3>${t("tt.addBlock")}</h3>
      <div class="chip-wrap">${T.KINDS.map((k) => html`<button type="button" class="pill" data-action="add" data-k="${k}">${k === "break" ? "☕" : ""}${k !== "break" ? `${({ study: "📚", revision: "🔁", test: "📝", custom: "✏️" })[k]} ` : " "}${t(`tt.kind.${k}`)}</button>`)}</div>
      <h3>${t("tt.planTotals")}</h3>
      <div class="facts">${T.KINDS.filter((k) => m.byKind[k]).map((k) => html`<div class="fact"><span class="fact-n">${fmtDuration(m.byKind[k])}</span><span class="fact-l">${t(`tt.kind.${k}`)}</span></div>`)}</div>
      <div class="row-actions pad">
        <button type="button" class="link" data-action="rename">${t("tt.renamePlan")}</button>
        <button type="button" class="link" data-action="copy-from">${t("tt.copyBlocks")}</button>
        <button type="button" class="link danger" data-action="delete">${t("tt.deletePlan")}</button></div>`;

    const update = async (fn) => {
      const fresh = tt.getTimetable(id);
      const dayPlans = fresh.dayPlans.map((p) => (p.id === pid ? fn(p) : p));
      await save({ ...fresh, dayPlans });
    };
    onAction(container, {
      ...backHandler,
      edit: (el) => blockEditor(x, plan, blocks.find((b) => b.id === el.dataset.id), update),
      add: (el) => {
        const last = blocks[blocks.length - 1];
        const start = last ? Math.min(1380, T.toMin(last.end) ?? 360) : 360;
        const len = { study: 60, revision: 30, test: 30, break: 15, custom: 30 }[el.dataset.k];
        blockEditor(x, plan, { id: tt.blockId(), kind: el.dataset.k, start: T.fromMin(start), end: T.fromMin(Math.min(1440, start + len)), ...(el.dataset.k === "break" ? { breakType: "rest" } : {}) }, update, true);
      },
      rename: () => runFlow(async () => { const n = await askText({ title: t("tt.renamePlan"), value: plan.name }); if (n) await update((p) => ({ ...p, name: n.slice(0, 40) })); }),
      "copy-from": () => runFlow(async () => {
        const src = await chooseAction({ title: t("tt.copyBlocks"), sub: t("tt.copyBlocksSub"), items: x.dayPlans.filter((p) => p.id !== pid).map((p) => ({ id: p.id, label: p.name, sub: t("tt.blocksN", { n: p.blocks.length }) })) });
        if (!src) return;
        const from = x.dayPlans.find((p) => p.id === src);
        await update((p) => ({ ...p, blocks: from.blocks.map((b) => ({ ...b, id: tt.blockId() })) }));
      }),
      delete: () => runFlow(async () => {
        if (x.dayPlans.length < 2) { toast(t("tt.lastPlan")); return; }
        const ok = await confirmAction({ title: t("tt.deletePlanTitle", { name: plan.name }), body: used ? t("tt.deletePlanBody", { n: used }) : "", confirmLabel: t("common.delete"), danger: true });
        if (!ok) return;
        const fresh = tt.getTimetable(id);
        const re = (v) => (v === pid ? T.OFF : v);
        const s = fresh.schedule;
        await save({ ...fresh, dayPlans: fresh.dayPlans.filter((p) => p.id !== pid),
          schedule: { ...s, daily: s.daily && re(s.daily), weekly: s.weekly && Object.fromEntries(Object.entries(s.weekly).map(([k, v]) => [k, re(v)])), cycle: s.cycle && s.cycle.map(re) },
          overrides: Object.fromEntries(Object.entries(fresh.overrides || {}).filter(([, v]) => v !== pid)) });
        go("tt-plans", { tt: id });
      })
    });
    if (openBlock) { const b = blocks.find((y) => y.id === openBlock); if (b) setTimeout(() => blockEditor(x, plan, b, update), 30); }
  }
};

/** The block sheet: kind, start/end (any time), subject and planned topics, break type, label, note. */
function blockEditor(x, plan, block0, update, isNew = false) {
  const b = { ...block0, topicIds: [...(block0.topicIds || [])] };
  const subjects = store.subjectsWithCounts(x.syllabusId).map((s) => s.subject);
  const extra = store.all("subjects").filter((s) => !subjects.some((y) => y.id === s.id));
  const allSubjects = [...subjects, ...extra];
  const draw = () => {
    const len = T.durationMin(b);
    const needsSubject = b.kind === "study" || b.kind === "revision";
    openSheet(html`<h2>${isNew ? t("tt.newBlock") : t("tt.editBlock")}</h2>
      <div class="segmented five">${T.KINDS.map((k) => html`<button type="button" class="${b.kind === k ? "on" : ""}" data-action="kind" data-v="${k}">${t(`tt.kind.${k}`)}</button>`)}</div>
      <div class="two-col">
        <label class="field-label">${t("tt.start")}<input class="field" type="time" id="bStart" value="${b.start}"></label>
        <label class="field-label">${t("tt.end")}<input class="field" type="time" id="bEnd" value="${b.end === "24:00" ? "23:59" : b.end}"></label></div>
      <div class="chip-wrap">${[15, 30, 45, 60, 90, 120, 180].map((d) => html`<button type="button" class="pill ${len === d ? "on" : ""}" data-action="len" data-v="${d}">${fmtDuration(d)}</button>`)}</div>
      ${b.kind === "break" ? html`<h3>${t("tt.breakType")}</h3><div class="chip-wrap">${T.BREAKS.map((k) => html`<button type="button" class="pill ${b.breakType === k ? "on" : ""}" data-action="brk" data-v="${k}">${BREAK_ICON[k]} ${t(`tt.break.${k}`)}</button>`)}</div>` : ""}
      ${needsSubject ? html`<label class="field-label">${t("tt.subject")}<select class="field" id="bSub">
          <option value="">${b.kind === "revision" ? t("tt.anySubjectRevision") : t("tt.pickSubject")}</option>
          ${allSubjects.map((s) => html`<option value="${s.id}" ${b.subjectId === s.id ? "selected" : ""}>${nameLabel(s)}</option>`)}</select></label>
        ${b.subjectId ? html`<button type="button" class="row" data-action="topics"><span class="row-main"><span class="row-title">${t("tt.plannedTopics")}</span>
          <span class="row-sub">${b.topicIds.length ? b.topicIds.map((tid) => nameLabel(store.topic(tid))).filter(Boolean).join(", ") : t("tt.topicsOptional")}</span></span><span class="chev-txt">›</span></button>` : ""}` : ""}
      <label class="field-label">${t("tt.label")}<input class="field" type="text" id="bLabel" value="${b.label || ""}" placeholder="${t(`tt.labelPh.${b.kind}`)}" maxlength="60"></label>
      <label class="field-label">${t("tt.note")}<input class="field" type="text" id="bNote" value="${b.note || ""}" maxlength="200"></label>
      ${isNew ? "" : html`<div class="row-actions"><button type="button" class="link" data-action="dup">${t("tt.duplicateBlock")}</button><button type="button" class="link danger" data-action="del">${t("common.delete")}</button></div>`}
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`, {
      kind: (el) => { read(); b.kind = el.dataset.v; if (b.kind === "break" && !b.breakType) b.breakType = "rest"; draw(); },
      len: (el) => { read(); const s = T.toMin(b.start) ?? 0; b.end = T.fromMin(Math.min(1440, s + Number(el.dataset.v))); draw(); },
      brk: (el) => { read(); b.breakType = el.dataset.v; draw(); },
      topics: () => { read(); topicPicker(b, draw); },
      cancel: () => closeSheet(),
      dup: async () => {
        read();
        const l = T.durationMin(b); const s = T.toMin(b.end);
        await update((p) => ({ ...p, blocks: [...p.blocks, { ...b, id: tt.blockId(), start: b.end, end: T.fromMin(Math.min(1440, s + l)) }] }));
        closeSheet();
      },
      del: async () => { await update((p) => ({ ...p, blocks: p.blocks.filter((y) => y.id !== b.id) })); closeSheet(); },
      save: async () => {
        read();
        if (T.toMin(b.start) === null || T.toMin(b.end) === null || T.toMin(b.end) <= T.toMin(b.start)) { toast(t("tt.badTimes")); return; }
        const clean = { ...b };
        if (!(clean.kind === "study" || clean.kind === "revision")) { delete clean.subjectId; delete clean.topicIds; }
        if (clean.kind !== "break") delete clean.breakType;
        if (!clean.topicIds?.length) delete clean.topicIds;
        ["label", "note"].forEach((k) => { if (!clean[k]) delete clean[k]; });
        await update((p) => ({ ...p, blocks: [...p.blocks.filter((y) => y.id !== b.id), clean] }));
        closeSheet();
        if (clean.kind === "study" && !clean.subjectId && !clean.label) toast(t("tt.noSubjectNote"));
      }
    }, { label: t("tt.editBlock") });
    function read() {
      const body = sheetBody();
      if (!body) return;
      const s = body.querySelector("#bStart")?.value; const e = body.querySelector("#bEnd")?.value;
      if (s) b.start = s;
      if (e) b.end = e === "23:59" && block0.end === "24:00" ? "24:00" : e;
      const sub = body.querySelector("#bSub");
      if (sub) { if (sub.value !== (b.subjectId || "")) b.topicIds = []; b.subjectId = sub.value || undefined; }
      b.label = body.querySelector("#bLabel")?.value.trim() || "";
      b.note = body.querySelector("#bNote")?.value.trim() || "";
    }
    sheetBody().querySelector("#bSub")?.addEventListener("change", () => { read(); draw(); });
  };
  draw();
}

function topicPicker(b, back) {
  const chosen = new Set(b.topicIds);
  const draw = () => openSheet(html`<h2>${t("tt.plannedTopics")}</h2><p class="hint">${t("tt.plannedHint")}</p>
    <div class="checks">${store.topicsOf(b.subjectId).map((x) => html`<button type="button" class="check ${chosen.has(x.id) ? "on" : ""}" data-action="tog" data-id="${x.id}">
      <span class="box">${chosen.has(x.id) ? "✓" : ""}</span><span class="row-main"><span>${nameHtml(x)}</span></span></button>`)}</div>
    <div class="sheet-actions"><button type="button" class="btn" data-action="ok">${t("common.done")}</button></div>`, {
    tog: (el) => { const id = el.dataset.id; if (chosen.has(id)) chosen.delete(id); else chosen.add(id); draw(); },
    ok: () => { b.topicIds = [...chosen]; back(); }
  });
  draw();
}

/* ---------- schedule ---------- */

export const ttScheduleScreen = {
  id: "tt-schedule",
  parent: "today",
  render(container, { tt: id }) {
    const x = tt.getTimetable(id);
    if (!x) return go("timetable");
    const [to, params] = backTo(x);
    const s = { ...x.schedule };
    const plans = x.dayPlans.filter((p) => !p.forDate);
    const opts = (v) => html`${plans.map((p) => html`<option value="${p.id}" ${v === p.id ? "selected" : ""}>${p.name}</option>`)}<option value="${T.OFF}" ${v === T.OFF ? "selected" : ""}>😌 ${t("tt.off")}</option>`;
    const cycle = s.cycle?.length ? s.cycle : [plans[0]?.id, plans[1]?.id || T.OFF];
    const today = T.isoDate();
    const overrides = Object.entries(x.overrides || {}).sort((a, b) => a[0].localeCompare(b[0]));
    container.innerHTML = html`${head(t("tt.schedule"), scheduleLine(x), to, params)}
      <label class="field-label">${t("tt.ttName")}<input class="field" id="sName" type="text" value="${x.name}" maxlength="60"></label>
      <div class="two-col">
        <label class="field-label">${t("tt.startDate")}<input class="field" type="date" id="sStart" value="${x.startDate}"></label>
        <label class="field-label">${t("tt.endDate")}<input class="field" type="date" id="sEnd" value="${x.endDate}" max="${T.maxEndDate(today)}"></label></div>
      <p class="hint">${t("tt.maxSix", { date: fmtDate(T.maxEndDate(today), { day: "numeric", month: "short", year: "numeric" }) })}</p>
      <h3>${t("tt.repeat")}</h3>
      <div class="segmented three">${["daily", "weekly", "cycle"].map((mo) => html`<button type="button" class="${(s.mode || "daily") === mo ? "on" : ""}" data-action="mode" data-v="${mo}">${t(`tt.mode.${mo}`)}</button>`)}</div>
      <p class="hint">${t(`tt.modeHint.${s.mode || "daily"}`)}</p>
      ${(s.mode || "daily") === "daily" ? html`<label class="field-label">${t("tt.everyDayUse")}<select class="field" data-slot="daily">${opts(s.daily)}</select></label>` : ""}
      ${s.mode === "weekly" ? html`<div class="slot-grid">${[1, 2, 3, 4, 5, 6, 7].map((d) => html`<label class="field-label">${t(`tt.wdLong.${d}`)}<select class="field" data-slot="w${d}">${opts(s.weekly?.[d] ?? T.OFF)}</select></label>`)}</div>
        <div class="chip-wrap"><button type="button" class="pill" data-action="preset" data-v="5-2">${t("tt.preset52")}</button><button type="button" class="pill" data-action="preset" data-v="6-1">${t("tt.preset61")}</button></div>` : ""}
      ${s.mode === "cycle" ? html`<label class="field-label">${t("tt.cycleStart")}<input class="field" type="date" id="cStart" value="${s.cycleStart || x.startDate}"></label>
        <div class="slot-grid">${cycle.map((v, i) => html`<label class="field-label">${t("tt.cycleDay", { n: i + 1 })}<select class="field" data-slot="c${i}">${opts(v)}</select></label>`)}</div>
        <div class="row-actions"><button type="button" class="link" data-action="cyc-add" ${cycle.length >= 14 ? "disabled" : ""}>＋ ${t("tt.cycleAdd")}</button>
          <button type="button" class="link" data-action="cyc-del" ${cycle.length <= 2 ? "disabled" : ""}>− ${t("tt.cycleRemove")}</button></div>` : ""}
      <h3>${t("tt.changedDaysTitle")}</h3>
      <p class="hint">${t("tt.changedDaysHint")}</p>
      ${overrides.length ? html`<div class="rows">${overrides.map(([d, v]) => html`<div class="row"><span class="row-main"><span class="row-title">${fmtDate(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        <span class="row-sub">${v === T.OFF ? t("tt.off") : x.dayPlans.find((p) => p.id === v)?.name || "?"}</span></span>
        <button type="button" class="icon-sm" data-action="ov-del" data-d="${d}" aria-label="${t("common.delete")}">✕</button></div>`)}</div>` : ""}
      <button type="button" class="btn btn-quiet" data-action="ov-add">＋ ${t("tt.addChangedDay")}</button>
      <div class="sheet-actions sticky"><button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`;

    const read = () => {
      const q = (sel) => container.querySelector(sel);
      const name = q("#sName").value.trim() || x.name;
      let start = q("#sStart").value || x.startDate; let end = q("#sEnd").value || x.endDate;
      end = T.clampEnd(start, end, today);
      const next = { ...s };
      if ((s.mode || "daily") === "daily") next.daily = q('[data-slot="daily"]')?.value || plans[0].id;
      if (s.mode === "weekly") { next.weekly = {}; for (let d = 1; d <= 7; d++) next.weekly[d] = q(`[data-slot="w${d}"]`).value; }
      if (s.mode === "cycle") { next.cycle = cycle.map((_, i) => q(`[data-slot="c${i}"]`).value); next.cycleStart = q("#cStart").value || start; }
      return { name, startDate: start, endDate: end, schedule: next };
    };
    const keep = async () => { const r = read(); await tt.saveTimetable({ ...tt.getTimetable(id), ...r }, { quiet: true }); return r; };
    onAction(container, {
      ...backHandler,
      mode: async (el) => {
        const r = read();
        const mo = el.dataset.v;
        const sched = { ...r.schedule, mode: mo };
        if (mo === "weekly" && !sched.weekly) { sched.weekly = {}; for (let d = 1; d <= 7; d++) sched.weekly[d] = sched.daily || plans[0].id; }
        if (mo === "cycle" && !sched.cycle) { sched.cycle = cycle; sched.cycleStart = r.startDate; }
        if (mo === "daily" && !sched.daily) sched.daily = plans[0].id;
        await tt.saveTimetable({ ...tt.getTimetable(id), ...r, schedule: sched });
      },
      preset: async (el) => {
        const r = read();
        const a = plans[0]?.id; const b2 = plans[1]?.id || T.OFF;
        const w = {}; for (let d = 1; d <= 7; d++) w[d] = el.dataset.v === "5-2" ? (d <= 5 ? a : b2) : (d <= 6 ? a : b2);
        await tt.saveTimetable({ ...tt.getTimetable(id), ...r, schedule: { ...r.schedule, mode: "weekly", weekly: w } });
      },
      "cyc-add": async () => { const r = await keep(); await tt.saveTimetable({ ...tt.getTimetable(id), schedule: { ...r.schedule, cycle: [...r.schedule.cycle, T.OFF] } }); },
      "cyc-del": async () => { const r = await keep(); await tt.saveTimetable({ ...tt.getTimetable(id), schedule: { ...r.schedule, cycle: r.schedule.cycle.slice(0, -1) } }); },
      "ov-del": async (el) => { await keep(); const f = tt.getTimetable(id); const o = { ...f.overrides }; delete o[el.dataset.d]; await tt.saveTimetable({ ...f, overrides: o }); },
      "ov-add": async () => {
        await keep();
        const f = tt.getTimetable(id);
        openSheet(html`<h2>${t("tt.addChangedDay")}</h2>
          <label class="field-label">${t("tt.date")}<input class="field" type="date" id="ovD" min="${f.startDate}" max="${f.endDate}" value="${today > f.startDate ? today : f.startDate}"></label>
          <label class="field-label">${t("tt.usePlanLabel")}<select class="field" id="ovP">${opts(T.OFF)}</select></label>
          <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="c">${t("common.cancel")}</button><button type="button" class="btn" data-action="ok">${t("common.add")}</button></div>`, {
          c: () => closeSheet(),
          ok: async () => {
            const d = sheetBody().querySelector("#ovD").value; const v = sheetBody().querySelector("#ovP").value;
            if (!d) return;
            const g = tt.getTimetable(id);
            closeSheet();
            await tt.saveTimetable({ ...g, overrides: { ...(g.overrides || {}), [d]: v } });
          }
        });
      },
      save: async () => {
        const r = read();
        const capped = r.endDate !== (container.querySelector("#sEnd").value || x.endDate);
        await tt.saveTimetable({ ...tt.getTimetable(id), ...r });
        toast(capped ? t("tt.endCapped") : t("tt.saved"));
        go(to, params);
      }
    });
  }
};
