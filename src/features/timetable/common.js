/* Shared bits for the timetable screens: names, icons, time format, the block sheet. */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet, sheetBody, isSheetOpen } from "../../core/sheet.js";
import { go } from "../../core/router.js";
import { toast } from "../../core/toast.js";
import { label as nameLabel, nameHtml } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as tt from "../../data/timetable.js";
import { openStartTest, quickTest } from "../test/start-sheet.js";
import { isDue } from "../../domain/study.js";

export const KIND_ICON = { study: "📚", revision: "🔁", test: "📝", break: "☕", custom: "✏️" };
export const BREAK_ICON = { food: "🍽", bath: "🚿", rest: "😌", exercise: "🚶", sleep: "😴", travel: "🚌", work: "💼", other: "☕" };

export const icon = (b) => (b.kind === "break" ? BREAK_ICON[b.breakType] || "☕" : KIND_ICON[b.kind] || "•");

/** What a block is called on screen. */
export function blockTitle(b) {
  if (b.kind === "study") return b.subjectId && store.subject(b.subjectId) ? nameLabel(store.subject(b.subjectId)) : b.label || t("tt.kind.study");
  if (b.kind === "revision") return b.subjectId && store.subject(b.subjectId) ? `${t("tt.kind.revision")} · ${nameLabel(store.subject(b.subjectId))}` : b.label || t("tt.kind.revision");
  if (b.kind === "break") return b.label || t(`tt.break.${b.breakType || "rest"}`);
  return b.label || t(`tt.kind.${b.kind}`);
}
/** English title (for the calendar file, which other apps show). */
export function blockTitleEn(b) {
  const sub = b.subjectId ? store.subject(b.subjectId)?.name : null;
  if (b.kind === "study") return `📚 ${sub || b.label || "Study"}`;
  if (b.kind === "revision") return `🔁 Revision${sub ? ` · ${sub}` : ""}`;
  if (b.kind === "test") return `📝 ${b.label || "Test"}`;
  if (b.kind === "break") return `${BREAK_ICON[b.breakType] || "☕"} ${b.label || (b.breakType ? b.breakType[0].toUpperCase() + b.breakType.slice(1) : "Break")}`;
  return `✏️ ${b.label || "Other"}`;
}

/** "6:30 am". */
export function fmt(hhmm) {
  const m = T.toMin(hhmm);
  if (m === null) return hhmm;
  if (m === 1440) return t("tt.midnight");
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" }).replace(/\s?(am|pm)/i, (x) => ` ${x.trim().toLowerCase()}`);
}
export const fmtRange = (b) => `${fmt(b.start)} – ${fmt(b.end)}`;
export function fmtDuration(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? (m ? t("tt.hm", { h, m }) : t("tt.h", { h })) : t("tt.m", { m });
}
export const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) => T.parseIso(iso).toLocaleDateString(dateLocale(), opts);

export const nowMinute = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/** The plan's blocks for a date, with "running late" applied. */
export function blocksOn(timetable, date) {
  const plan = T.planFor(timetable, date);
  if (!plan) return [];
  const log = tt.dayLog(timetable.id, date);
  return T.sortBlocks(T.shiftBlocks(plan.blocks, log.shift));
}

/* ---------- topic suggestions for a study block ---------- */

/** Topics of the subject, best first: planned, due for review, weak, often asked, never studied. */
export function topicChoices(timetable, block) {
  const syllabusId = timetable.syllabusId;
  const counts = new Map();
  store.questionsFor({ syllabusId, subjectId: block.subjectId }).forEach((q) => counts.set(q.topicId, (counts.get(q.topicId) || 0) + 1));
  const wrongBy = new Map();
  const planned = new Set(block.topicIds || []);
  const now = Date.now();
  return store.topicsOf(block.subjectId).filter((x) => !x.isFallback || counts.get(x.id)).map((x) => {
    const st = store.topicStateFor(syllabusId, x.id);
    const reasons = [];
    if (planned.has(x.id)) reasons.push("planned");
    if (st && isDue(st, now)) reasons.push("due");
    if (!st?.studiedCount) reasons.push("new");
    const freq = counts.get(x.id) || 0;
    const score = (planned.has(x.id) ? 1000 : 0) + (reasons.includes("due") ? 300 : 0) + freq * (st?.studiedCount ? 1 : 2) - (st?.studiedCount || 0) * 3 + (wrongBy.get(x.id) || 0);
    return { topic: x, freq, studied: st?.studiedCount || 0, reasons, score };
  }).sort((a, b) => b.score - a.score);
}

/* ---------- the block sheet (Today card and the timetable screen) ---------- */

export function openBlockSheet(timetable, date, block, { onDone } = {}) {
  const today = T.isoDate();
  const canMark = date <= today;
  let showAll = false;
  const draw = () => {
    const log = tt.dayLog(timetable.id, date);
    const rec = log.blocks[block.id] || {};
    const ticked = new Set(rec.topicIds || []);
    const subj = block.subjectId ? store.subject(block.subjectId) : null;
    let topicsHtml = "";
    if (canMark && subj && (block.kind === "study" || block.kind === "revision")) {
      const all = topicChoices(timetable, block);
      const list = showAll ? all : all.slice(0, 8);
      topicsHtml = html`<h3>${t("tt.studiedWhich")}</h3><p class="hint">${t("tt.studiedHint")}</p>
        <div class="checks">${list.map((x) => {
          const on = ticked.has(x.topic.id);
          return html`<button type="button" class="check ${on ? "on" : ""}" data-action="topic" data-id="${x.topic.id}" aria-pressed="${String(on)}">
            <span class="box">${on ? "✓" : ""}</span><span class="row-main"><span>${nameHtml(x.topic)}</span>
            <span class="row-sub">${[...x.reasons.map((r) => t(`tt.why.${r}`)), x.freq ? t("tt.inPapers", { n: x.freq }) : null, x.studied ? t("library.studied", { n: x.studied }) : null].filter(Boolean).join(" · ")}</span></span></button>`;
        })}</div>
        ${all.length > list.length ? html`<button type="button" class="link" data-action="all">${t("tt.allTopics", { n: all.length })}</button>` : ""}`;
    }
    const due = block.kind === "revision" && !subj ? store.all("topicState").filter((s) => s.syllabusId === timetable.syllabusId && isDue(s)).slice(0, 12) : [];
    openSheet(html`<p class="tt-kicker">${fmtDate(date)} · ${fmtRange(block)}${block.shifted ? ` · ${t("tt.shifted")}` : ""}</p>
      <h2>${icon(block)} ${blockTitle(block)}</h2>
      ${block.topicIds?.length && !canMark ? html`<p class="hint">${t("tt.planned")}: ${block.topicIds.map((id) => nameLabel(store.topic(id))).filter(Boolean).join(", ")}</p>` : ""}
      ${block.note ? html`<p>${block.note}</p>` : ""}
      ${topicsHtml}
      ${due.length ? html`<h3>${t("tt.dueNow")}</h3><div class="rows">${due.map((s) => html`<button type="button" class="row" data-action="open-topic" data-id="${s.topicId}"><span class="row-main"><span class="row-title">${nameHtml(store.topic(s.topicId))}</span></span><span class="chev-txt">›</span></button>`)}</div>` : ""}
      <div class="actions-col">
        ${subj && canMark ? html`<button type="button" class="btn btn-quiet" data-action="quick">▶ ${t("tt.quickSubject", { subject: nameLabel(subj) })}</button>` : ""}
        ${block.kind === "test" && canMark ? html`<button type="button" class="btn" data-action="test">▶ ${t("tt.startTest")}</button>` : ""}
      </div>
      ${canMark && block.kind !== "break" ? html`<div class="segmented three status-pick">${["done", "skipped", null].map((st) => html`<button type="button" class="${(rec.status || null) === st ? "on" : ""}" data-action="status" data-v="${st || ""}">${t(`tt.status.${st || "none"}`)}</button>`)}</div>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="edit">${t("tt.editBlock")}</button>
        <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
      topic: async (el) => { const id = el.dataset.id; await tt.toggleTopic(timetable, date, block.id, id, !ticked.has(id)); draw(); },
      all: () => { showAll = true; draw(); },
      status: async (el) => { await tt.setBlockStatus(timetable.id, date, block.id, el.dataset.v || null); draw(); },
      quick: () => {
        const qs = store.questionsFor({ syllabusId: timetable.syllabusId, subjectId: block.subjectId });
        const tids = block.topicIds?.length ? new Set(block.topicIds) : null;
        const pool = tids ? qs.filter((q) => tids.has(q.topicId)) : qs;
        if (block.topicIds?.length === 1) return quickTest(block.topicIds[0]);
        openStartTest({ scope: { type: "subject", ref: block.subjectId, label: subj.name }, questions: pool.length ? pool : qs, keepOrder: false });
      },
      test: () => weekTest(timetable, date),
      "open-topic": (el) => go("topic", { id: el.dataset.id }),
      edit: () => {
        const plan = T.planFor(timetable, date);
        go("tt-plan", { tt: timetable.id, p: plan?.id || "", b: block.id, d: date });
      },
      close: () => closeSheet()
    }, { label: blockTitle(block), onClose: () => onDone?.() });
  };
  draw();
}

/** A test on the topics you ticked in the last 7 days (or the whole syllabus if none). */
export function weekTest(timetable, date) {
  const topics = tt.studiedBetween(timetable.id, T.addDays(date, -6), date);
  const qs = topics.size ? store.questionsFor({ syllabusId: timetable.syllabusId }).filter((q) => topics.has(q.topicId)) : [];
  if (!qs.length) { toast(t("tt.weekTestNone")); return openStartTest(); }
  return openStartTest({ scope: { type: "timetable", ref: timetable.id, label: t("tt.weekTestLabel") }, questions: qs, keepOrder: false });
}

export { isSheetOpen, sheetBody };
