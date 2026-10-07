/* Today: "Now" card from your timetable — the block running now (with time left)
   and what comes next. Tap to mark topics studied. Nothing shows without a timetable. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import * as store from "../../data/store.js";
import * as T from "../../domain/timetable.js";
import * as tt from "../../data/timetable.js";
import { blocksOn, blockTitle, icon, fmt, fmtDuration, nowMinute, openBlockSheet } from "./common.js";

function state() {
  const syllabus = store.currentSyllabus();
  const timetable = syllabus ? tt.activeTimetable(syllabus.id) : null;
  if (!timetable) return null;
  const date = T.isoDate();
  const blocks = blocksOn(timetable, date);
  const m = nowMinute();
  const { current, next } = T.blockAt(blocks, m);
  return { timetable, date, blocks, current, next, m };
}

function inner(s) {
  if (!s.blocks.length) {
    const inRange = s.date >= s.timetable.startDate && s.date <= s.timetable.endDate;
    return html`<span class="now-kicker">🗓 ${t("tt.title")}</span><span class="now-title">${inRange ? t("tt.dayOff") : t("tt.outOfRange")}</span>`;
  }
  const log = tt.dayLog(s.timetable.id, s.date);
  const doneN = s.blocks.filter((b) => b.kind !== "break" && log.blocks[b.id]?.status === "done").length;
  const planned = s.blocks.filter((b) => b.kind !== "break").length;
  const tail = html`<span class="now-sub">${s.next ? html`${t("tt.next")}: ${icon(s.next)} ${blockTitle(s.next)} · ${fmt(s.next.start)}` : t("tt.lastBlock")} · ${t("tt.doneOf", { n: doneN, of: planned })}</span>`;
  if (s.current) {
    const left = T.toMin(s.current.end) - s.m;
    return html`<span class="now-kicker">${t("tt.now")} · ${fmt(s.current.start)}–${fmt(s.current.end)}</span>
      <span class="now-title">${icon(s.current)} ${blockTitle(s.current)}</span>
      ${s.current.topicIds?.length ? html`<span class="now-sub">${s.current.topicIds.map((id) => store.topic(id)?.name).filter(Boolean).slice(0, 3).join(", ")}</span>` : ""}
      <span class="now-left" id="nowLeft">${t("tt.left", { time: fmtDuration(left) })}</span>${tail}`;
  }
  if (s.next) return html`<span class="now-kicker">${t("tt.freeNow")}</span><span class="now-title">${t("tt.startsIn", { what: blockTitle(s.next), time: fmtDuration(T.toMin(s.next.start) - s.m) })}</span>${tail}`;
  return html`<span class="now-kicker">🗓 ${t("tt.title")}</span><span class="now-title">${t("tt.dayDone")}</span><span class="now-sub">${t("tt.doneOf", { n: doneN, of: planned })}</span>`;
}

export function timetableNow() {
  const s = state();
  if (!s) {
    const syllabus = store.currentSyllabus();
    if (!syllabus || tt.timetables(syllabus.id).length || store.setting("hideTtHint", false)) return "";
    return html`<button type="button" class="row exam-set" data-action="tt-open"><span class="row-main"><span class="row-title">🗓 ${t("tt.hintRow")}</span><span class="row-sub">${t("tt.hintRowSub")}</span></span><span class="chev-txt">›</span></button>`;
  }
  return html`<div class="now-card" id="nowCard"><button type="button" class="now-main" data-action="tt-now">${inner(s)}</button>
    <div class="now-actions"><button type="button" class="link" data-action="tt-open">${t("tt.openFull")} ›</button>
    ${s.current && s.current.kind !== "break" ? html`<button type="button" class="link" data-action="tt-late">⏱ ${t("tt.late")}</button>` : ""}</div></div>`;
}

export const nowHandlers = {
  "tt-now": () => {
    const s = state();
    if (!s) return;
    const b = s.current || s.next;
    if (b) openBlockSheet(s.timetable, s.date, b, { onDone: () => store.touch() }); else go("timetable");
  },
  "tt-open": () => go("timetable"),
  "tt-late": () => { const s = state(); if (s?.current) go("timetable", { late: "1" }); }
};

/** Refreshes the card every 30 s while Today is open. */
export function nowTick(root) {
  const timer = setInterval(() => {
    const card = root.querySelector("#nowCard");
    if (!card?.isConnected) { clearInterval(timer); return; }
    const s = state();
    const main = card.querySelector(".now-main");
    if (s && main) main.innerHTML = String(inner(s));
  }, 30000);
  return () => clearInterval(timer);
}
