/* "Start a test": one sheet for every kind of test.
   What:      this listing · Mock · Weak areas · Still wrong · Flagged · a bank
   How many:  10 / 25 / 50 / 100 / All
   Timer:     off, or on with minutes (0.9 min per question suggested)
   Layout:    one at a time, or scroll
   Your last choices are remembered. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { chooseAction, runFlow } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import * as tests from "../../data/tests.js";
import { isGradable, pickQuestions, sampleRandom, shuffle, suggestedMinutes, distributeProportionally, clock } from "../../domain/testing.js";
import { answerRecords, weakTopics } from "../../domain/stats.js";
import { flaggedQuestions, stillWrongQuestions } from "../library/banks.js";
import { pickExams } from "../question/exam-filter.js";

const SIZES = [10, 25, 50, 100];
const WEAK_TOPICS = 8;

const defaults = () => ({ timerOn: false, layout: "single", count: 25, ...(store.setting("testDefaults") || {}) });

/**
 * preset (optional): { scope: { type, ref, label }, questions, keepOrder }
 * — the listing the sheet was opened from.
 */
export async function openStartTest(preset = null) {
  if (await clearForNewTest()) startSheet(preset);
}

/** If a test is unfinished, asks to continue it or discard it. True = OK to start a new one. */
async function clearForNewTest() {
  const active = tests.activeTest();
  if (!active) return true;
  const choice = await runFlow(() => chooseAction({ title: t("start.unfinishedTitle"), sub: active.scope?.label, items: [
    { id: "continue", label: t("start.continue"), sub: progressText(active) },
    { id: "discard", label: t("start.discardAndNew"), danger: true }
  ] }));
  if (choice === "continue") { go("test"); return false; }
  if (choice !== "discard") return false;
  await tests.discardTest(active);
  return true;
}

/** Quick 10: starts at once on one topic, with your remembered timer and layout. */
export async function quickTest(topicId, n = 10) {
  const syllabus = store.currentSyllabus();
  const topic = store.topic(topicId);
  const pool = store.questionsFor({ syllabusId: syllabus.id, topicId }).filter(isGradable);
  if (!topic || !pool.length) { toast(t("start.noneToStart")); return; }
  if (!(await clearForNewTest())) return;
  const questions = sampleRandom(pool, n);
  const d = defaults();
  await tests.startTest({
    syllabusId: syllabus.id, scope: { type: "topic", ref: topicId, label: topic.name },
    questionIds: questions.map((q) => q.id), timerMinutes: d.timerOn ? suggestedMinutes(questions.length) : null, layout: d.layout
  });
  go("test");
}

export function progressText(attempt) {
  const run = attempt.run;
  const answered = Object.keys(run.answers).length;
  const parts = [t("start.answeredOf", { n: answered, of: run.questionIds.length })];
  if (run.remainingMs !== null) parts.push(t("start.timeLeft", { time: clock(run.remainingMs) }));
  return parts.join(" · ");
}

function startSheet(preset) {
  const syllabus = store.currentSyllabus();
  const d = defaults();
  const s = {
    what: preset ? "listing" : "mock", bankId: null,
    count: preset ? "all" : d.count, timerOn: d.timerOn, minutes: null, layout: d.layout,
    mixed: preset ? !preset.keepOrder : true, saveBank: false,
    mockCounts: null, mockExams: null, more: false
  };

  const banks = () => store.all("sets").filter((b) => b.kind === "user" && b.questionIds.length).sort((a, b) => a.name.localeCompare(b.name));
  const all = () => store.questionsFor({ syllabusId: syllabus.id }).filter(isGradable);

  /* ---- the question pool for each choice ---- */
  function pool() {
    switch (s.what) {
      case "listing": return preset.questions.filter(isGradable);
      case "wrong": return stillWrongQuestions(syllabus.id).filter(isGradable);
      case "flagged": return flaggedQuestions(syllabus.id).filter(isGradable);
      case "bank": { const b = store.byId("sets", s.bankId); return b ? b.questionIds.map((id) => store.question(id)).filter((q) => q && isGradable(q)) : []; }
      case "mock": return s.mockExams ? all().filter((q) => s.mockExams.has(q.paperId)) : all();
      case "weak": return all();
      default: return [];
    }
  }
  const skipped = () => (s.what === "listing" ? preset.questions.length - pool().length : 0);

  function subjectsOf(list) {
    const by = new Map();
    list.forEach((q) => { if (!by.has(q.subjectId)) by.set(q.subjectId, []); by.get(q.subjectId).push(q); });
    return [...by.entries()].map(([id, qs]) => ({ id, subject: store.subject(id), qs }))
      .filter((x) => x.subject).sort((a, b) => a.subject.order - b.subject.order || a.subject.name.localeCompare(b.subject.name));
  }

  function wanted(size) { return s.count === "all" ? size : Math.min(s.count, size); }

  function mockPlan() {
    const subs = subjectsOf(pool());
    const n = wanted(pool().length);
    const auto = distributeProportionally(subs.map((x) => ({ key: x.id, freq: x.qs.length })), n);
    const counts = s.mockCounts || auto;
    return { subs, counts, total: subs.reduce((sum, x) => sum + Math.min(counts[x.id] || 0, x.qs.length), 0) };
  }

  function weakPlan() {
    const records = answerRecords(store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai"));
    const byTopic = new Map();
    pool().forEach((q) => byTopic.set(q.topicId, (byTopic.get(q.topicId) || 0) + 1));
    return weakTopics(byTopic, records).slice(0, WEAK_TOPICS).map((w) => ({ ...w, topic: store.topic(w.topicId) })).filter((w) => w.topic);
  }

  /** The questions the test will have, in order. */
  function build() {
    const list = pool();
    if (s.what === "mock") {
      const { subs, counts } = mockPlan();
      return subs.flatMap((x) => sampleRandom(x.qs, counts[x.id] || 0));
    }
    if (s.what === "weak") {
      const topics = weakPlan();
      const n = wanted(list.length);
      const per = Math.max(1, Math.ceil(n / Math.max(1, topics.length)));
      const out = [];
      topics.forEach((w) => out.push(...sampleRandom(list.filter((q) => q.topicId === w.topicId), per)));
      return out.slice(0, n);
    }
    const n = wanted(list.length);
    return s.what === "listing" ? pickQuestions(list, n, { keepOrder: !s.mixed }) : (n >= list.length ? shuffle(list) : sampleRandom(list, n));
  }

  function plannedCount() {
    if (s.what === "mock") return mockPlan().total;
    if (s.what === "weak") {
      const topics = weakPlan(); const list = pool(); const n = wanted(list.length);
      const per = Math.max(1, Math.ceil(n / Math.max(1, topics.length)));
      return Math.min(n, topics.reduce((sum, w) => sum + Math.min(per, list.filter((q) => q.topicId === w.topicId).length), 0));
    }
    return wanted(pool().length);
  }

  function minutesFor(n) {
    const p = syllabus.pattern;
    if (s.minutes !== null) return s.minutes;
    if (s.what === "mock" && p?.minutes && p?.questions && n === p.questions) return p.minutes;
    return suggestedMinutes(n);
  }

  /* ---- drawing ---- */
  function whatPills() {
    const items = [
      preset ? { id: "listing", label: t(`start.what.${preset.scope.type}`, {}), n: preset.questions.filter(isGradable).length } : null,
      { id: "mock", label: t("start.what.mock") },
      { id: "weak", label: t("start.what.weak") },
      { id: "wrong", label: t("start.what.wrong"), n: stillWrongQuestions(syllabus.id).filter(isGradable).length },
      { id: "flagged", label: t("start.what.flagged"), n: flaggedQuestions(syllabus.id).filter(isGradable).length },
      banks().length ? { id: "bank", label: t("start.what.bank") } : null
    ].filter(Boolean);
    return html`<div class="chip-wrap">${items.map((it) => html`<button type="button" class="pill ${s.what === it.id ? "on" : ""}" data-action="what" data-id="${it.id}" ${it.n === 0 ? "disabled" : ""}>
      ${it.label}${it.n !== undefined ? html` <span class="count">${it.n}</span>` : ""}</button>`)}</div>`;
  }

  function draw() {
    const size = pool().length;
    const n = plannedCount();
    const bank = s.what === "bank" ? store.byId("sets", s.bankId) : null;
    const sizes = SIZES.filter((x) => x < size);
    const pattern = syllabus.pattern;
    openSheet(html`<h2>${t("start.title")}</h2>
      <p class="hint">${preset && s.what === "listing" ? preset.scope.label : syllabus.name}</p>

      <h3>${t("start.whatTitle")}</h3>
      ${whatPills()}
      ${s.what === "bank" ? html`<button type="button" class="row" data-action="pick-bank">
        <span class="row-main"><span class="row-title">${bank ? bank.name : t("start.pickBank")}</span>
        ${bank ? html`<span class="row-sub">${t("common.questions", { n: size })}</span>` : ""}</span><span class="chev-txt">›</span></button>` : ""}
      ${whatHint(size)}

      ${size ? html`<h3>${t("start.howMany")}</h3>
      <div class="chip-wrap">
        ${sizes.map((x) => html`<button type="button" class="pill ${s.count === x ? "on" : ""}" data-action="count" data-n="${x}">${x}</button>`)}
        <button type="button" class="pill ${s.count === "all" || s.count >= size ? "on" : ""}" data-action="count" data-n="all">${t("start.all", { n: size })}</button>
        ${s.what === "mock" && pattern?.questions && pattern.questions < size && !SIZES.includes(pattern.questions) ? html`<button type="button" class="pill ${s.count === pattern.questions ? "on" : ""}" data-action="count" data-n="${pattern.questions}">${t("start.pattern", { n: pattern.questions })}</button>` : ""}
      </div>
      ${skipped() ? html`<p class="hint">${t("start.skipped", { n: skipped() })}</p>` : ""}

      <h3>${t("start.timer")}</h3>
      <div class="segmented two"><button type="button" class="${!s.timerOn ? "on" : ""}" data-action="timer" data-on="0">${t("start.timerOff")}</button>
        <button type="button" class="${s.timerOn ? "on" : ""}" data-action="timer" data-on="1">${t("start.timerOn")}</button></div>
      ${s.timerOn ? html`<div class="stepper">
        <button type="button" class="btn btn-quiet" data-action="min" data-d="-5">−5</button>
        <button type="button" class="btn btn-quiet" data-action="min" data-d="-1">−1</button>
        <span class="stepper-val">${t("start.minutes", { n: minutesFor(n) })}</span>
        <button type="button" class="btn btn-quiet" data-action="min" data-d="1">+1</button>
        <button type="button" class="btn btn-quiet" data-action="min" data-d="5">+5</button>
      </div>
      <p class="hint">${t("start.timerHint", { n: suggestedMinutes(n) })}</p>` : ""}

      <h3>${t("start.layout")}</h3>
      <div class="segmented two"><button type="button" class="${s.layout === "single" ? "on" : ""}" data-action="layout" data-l="single">${t("layout.single")}</button>
        <button type="button" class="${s.layout === "scroll" ? "on" : ""}" data-action="layout" data-l="scroll">${t("layout.scroll")}</button></div>

      <button type="button" class="link" data-action="more">${s.more ? "▾" : "▸"} ${t("start.more")}</button>
      ${s.more ? moreOptions() : ""}` : ""}

      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="start" ${n ? "" : "disabled"}>${t("start.start", { n })}</button>
      </div>`, handlers, { label: t("start.title") });
  }

  function whatHint(size) {
    if (s.what === "mock") return html`<p class="hint">${t("start.hint.mock")}</p>`;
    if (s.what === "weak") {
      const topics = weakPlan();
      return html`<p class="hint">${t("start.hint.weak", { n: topics.length })}</p>
        <p class="examples">${topics.map((w) => `${w.topic.name} (${store.subject(w.topic.subjectId)?.name || ""})`).join(" · ")}</p>`;
    }
    if (s.what === "wrong") return html`<p class="hint">${size ? t("start.hint.wrong") : t("start.hint.wrongNone")}</p>`;
    if (s.what === "flagged") return html`<p class="hint">${size ? t("start.hint.flagged") : t("start.hint.flaggedNone")}</p>`;
    if (s.what === "listing" && !size) return html`<p class="warn-box">${t("start.noGradable")}</p>`;
    return "";
  }

  function moreOptions() {
    if (s.what === "mock") {
      const { subs, counts, total } = mockPlan();
      return html`<div class="more-box">
        <button type="button" class="pill ${s.mockExams ? "on" : ""}" data-action="mock-exams">${s.mockExams ? t("exams.some", { n: s.mockExams.size, of: store.papersOf(syllabus.id).length }) : t("exams.all", { n: store.papersOf(syllabus.id).length })} ▾</button>
        <p class="hint">${t("start.perSubject", { n: total })}${s.mockCounts ? html` · <button type="button" class="link inline" data-action="mock-auto">${t("start.autoSplit")}</button>` : ""}</p>
        <div class="subject-counts">${subs.map((x) => html`<div class="sc-row">
          <span class="row-main"><span>${x.subject.name}</span><span class="row-sub">${t("start.available", { n: x.qs.length })}</span></span>
          <button type="button" class="icon-sm" data-action="mock-step" data-id="${x.id}" data-d="-1" aria-label="−">−</button>
          <span class="sc-n">${Math.min(counts[x.id] || 0, x.qs.length)}</span>
          <button type="button" class="icon-sm" data-action="mock-step" data-id="${x.id}" data-d="1" aria-label="+">+</button>
        </div>`)}</div></div>`;
    }
    if (s.what === "weak") {
      return html`<div class="more-box"><label class="switch-row"><input type="checkbox" id="saveBank" ${s.saveBank ? "checked" : ""}>
        <span>${t("start.saveAsBank")}</span></label></div>`;
    }
    if (s.what === "listing") {
      return html`<div class="more-box"><label class="switch-row"><input type="checkbox" id="mixed" ${s.mixed ? "checked" : ""}>
        <span>${t("start.mixed")}<span class="row-sub">${t("start.mixedHint")}</span></span></label></div>`;
    }
    return html`<div class="more-box"><p class="hint">${t("start.noMore")}</p></div>`;
  }

  const readChecks = () => {
    const body = document.querySelector("#sheetRoot .sheet-body");
    const sb = body?.querySelector("#saveBank"); if (sb) s.saveBank = sb.checked;
    const mx = body?.querySelector("#mixed"); if (mx) s.mixed = mx.checked;
  };

  const handlers = {
    what: async (el) => {
      readChecks();
      s.what = el.dataset.id; s.mockCounts = null; s.minutes = null;
      if (s.what === "listing") s.count = "all";
      else if (s.count === "all") s.count = defaults().count;
      if (s.what === "bank" && !s.bankId) return pickBank();
      draw();
    },
    "pick-bank": () => pickBank(),
    count: (el) => { readChecks(); s.count = el.dataset.n === "all" ? "all" : Number(el.dataset.n); s.mockCounts = null; s.minutes = null; draw(); },
    timer: (el) => { readChecks(); s.timerOn = el.dataset.on === "1"; draw(); },
    min: (el) => { readChecks(); s.minutes = Math.max(1, minutesFor(plannedCount()) + Number(el.dataset.d)); draw(); },
    layout: (el) => { readChecks(); s.layout = el.dataset.l; draw(); },
    more: () => { readChecks(); s.more = !s.more; draw(); },
    "mock-step": (el) => {
      const { subs, counts } = mockPlan();
      const next = { ...counts };
      const x = subs.find((y) => y.id === el.dataset.id);
      next[x.id] = Math.max(0, Math.min(x.qs.length, (next[x.id] || 0) + Number(el.dataset.d)));
      s.mockCounts = next; s.minutes = null;
      draw();
    },
    "mock-auto": () => { s.mockCounts = null; draw(); },
    "mock-exams": async () => {
      const papers = store.papersOf(syllabus.id).map((p) => ({ id: p.id, name: p.name, postName: p.postName, count: p.questionCount }));
      const result = await pickExams({ papers, selected: s.mockExams });
      if (result !== undefined) { s.mockExams = result; s.mockCounts = null; }
      draw();
    },
    cancel: () => closeSheet(),
    start: () => { readChecks(); start(); }
  };

  async function pickBank() {
    const id = await chooseAction({ title: t("start.pickBank"), items: banks().map((b) => ({ id: b.id, label: b.name, sub: t("common.questions", { n: b.questionIds.length }), current: b.id === s.bankId })) });
    if (id) { s.bankId = id; s.what = "bank"; }
    else if (!s.bankId) s.what = preset ? "listing" : "mock";
    if (document.querySelector("#sheetRoot .sheet-body")) draw(); // the sheet may have been closed
  }

  async function start() {
    const questions = build();
    if (!questions.length) { toast(t("start.noneToStart")); return; }
    const n = questions.length;
    await store.quietly(() => store.setSetting("testDefaults", { timerOn: s.timerOn, layout: s.layout, count: s.what === "listing" ? defaults().count : (s.count === "all" ? defaults().count : s.count) }));
    const bank = s.what === "bank" ? store.byId("sets", s.bankId) : null;
    const scope = s.what === "listing" ? preset.scope
      : s.what === "bank" ? { type: "bank", ref: bank.id, label: bank.name }
      : { type: s.what, ref: syllabus.id, label: t(`start.label.${s.what}`, { n }) };
    if (s.what === "weak" && s.saveBank) {
      const created = await store.quietly(() => mut.createBank(t("start.weakBankName", { date: new Date().toLocaleDateString("en-IN") })));
      await store.quietly(() => mut.addToBank(store.byId("sets", created.id), questions.map((q) => q.id)));
      toast(t("start.bankSaved", { name: created.name }));
    }
    await tests.startTest({
      syllabusId: syllabus.id, scope, questionIds: questions.map((q) => q.id),
      timerMinutes: s.timerOn ? minutesFor(n) : null, layout: s.layout
    });
    go("test");
  }

  draw();
}
