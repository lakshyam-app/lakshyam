/* 1.26 · 🗞 Current affairs quiz: questions on one month's news, made from a web search (a Google Gemini preset,
   or Groq with an openai/gpt-oss model) — never from the AI's memory, which doesn't know recent news.
   Checked before you see them: the event's date must be in the month asked for, each question needs a source
   page, and a second pass answers every question on its own from its own web search. A question that fails
   any check starts unticked. You review and save; saved questions go with your AI questions (Current Affairs
   subject, the topic the AI picked), never with your past papers, each with its month and source.
   Practise at once, or later from the same sheet ("Saved quizzes"). */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody, whenBackDone } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { letterFor, richText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { nameKey } from "../../data/ids.js";
import { TAXONOMY_SEED } from "../../data/taxonomy-seed.js";
import * as presets from "../../ai/presets.js";
import { parseJsonLoose, aiControl } from "../../ai/client.js";
import { askWeb, webPreset, sourceFor } from "../../ai/web.js";
import * as P from "../../ai/prompts.js";
import { applyAnswerCheck } from "../../pdf/pdf-tools.js";
import { ensureAi, errorText, waitingBox, paintWaiting, watchWaiting, sourceChip, sourcesList } from "./ai-ui.js";
import { flagChip, answerRef } from "./flag-ui.js";
import { openStartTest } from "../test/start-sheet.js";
import { CA_COUNTS, CA_REGIONS, REGION_TOPIC, isCaSubject, monthChoices, monthRange, monthName, realDay, dateCheck, regionOf,
  textKey, startsTicked, salvageObjects, caGroups } from "../../domain/ca-quiz.js";

const SUBJECT_NAME = "Current Affairs";
const MAX_TOPICS = 16;
const pick = { month: null, regions: new Set(CA_REGIONS), n: CA_COUNTS[0] }; // remembered while the app is open

/** The Current Affairs subject: the one this syllabus uses, else any (null: made when you save). */
export function caSubject(syllabusId) {
  return store.subjectsWithCounts(syllabusId).map((x) => x.subject).find(isCaSubject) || store.all("subjects").find(isCaSubject) || null;
}

/** The topics the AI may file questions under: yours (most-used first), then the usual ones not there yet. */
function topicPlan(syllabusId) {
  const subject = caSubject(syllabusId);
  const used = subject ? store.topicsWithCounts(syllabusId, subject.id).filter((x) => !x.topic.isFallback).sort((a, b) => b.count - a.count).map((x) => x.topic) : [];
  const rest = subject ? store.topicsOf(subject.id).filter((x) => !x.isFallback && !used.includes(x)) : [];
  const list = [...used, ...rest].slice(0, MAX_TOPICS).map((x) => ({ name: x.name, topicId: x.id }));
  [...(TAXONOMY_SEED[SUBJECT_NAME] || []), ...Object.values(REGION_TOPIC)].forEach((name) => {
    if (!list.some((x) => nameKey(x.name) === nameKey(name))) list.push({ name, topicId: null });
  });
  return { subject, topics: list.map((x, i) => ({ ...x, key: `T${i + 1}` })) };
}

const caQuestions = (syllabusId) => store.questionsFor({ syllabusId, source: "ai" }).filter((q) => q.sourceRef?.ca);
const shortDate = (d) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" }); };
const langOf = async () => (await presets.getConfig()).lang || "en";
const inLang = (user, lang) => (lang === "ml" ? `${user}\n\nLANGUAGE: write the questions, options and explanations in Malayalam (keep names, Acts and years accurate). Keep the JSON keys, and the "date", "region", "topic" and "source" values, exactly as asked.\n${P.ML_GUIDE}` : user);

/** Library → Banks → 🗞 Current affairs quiz (and the Current Affairs subject's ⋯ menu). */
export async function openCaQuiz() {
  if (!(await ensureAi())) return;
  const syllabus = store.currentSyllabus();
  if (!syllabus) return;
  const months = monthChoices();
  if (!months.some((m) => m.key === pick.month)) pick.month = months[1].key; // last month: its news is complete
  const wp = await webPreset();
  const saved = caGroups(caQuestions(syllabus.id));
  const subject = caSubject(syllabus.id);
  const title = `🗞 ${t("ca.title")}`;
  const on = (yes) => (yes ? "on" : "");
  openSheet(html`<h2>${title}</h2>
    <p class="hint">${t("ca.hint")}</p>
    ${wp ? "" : html`<p class="warn-box">${t("ca.noWeb")}</p>`}
    <h3>${t("ca.month")}</h3>
    <div class="chip-row wrap ca-months">${months.map((m) => html`<button type="button" class="pill ${on(m.key === pick.month)}" data-action="month" data-v="${m.key}" aria-pressed="${String(m.key === pick.month)}">${monthName(m.key, dateLocale())}${m.partial ? ` · ${t("ca.soFar")}` : ""}</button>`)}</div>
    <h3>${t("ca.from")}</h3>
    <div class="chip-row wrap ca-regions">${CA_REGIONS.map((r) => html`<button type="button" class="pill ${on(pick.regions.has(r))}" data-action="region" data-v="${r}" aria-pressed="${String(pick.regions.has(r))}">${t(`ca.region.${r}`)}</button>`)}</div>
    <h3>${t("ca.count")}</h3>
    <div class="segmented two">${CA_COUNTS.map((n) => html`<button type="button" class="${on(pick.n === n)}" data-action="count" data-v="${n}">${n}</button>`)}</div>
    ${saved.length ? html`<h3>${t("ca.saved")}</h3>
      <div class="rows">${saved.map((g) => html`<button type="button" class="row" data-action="practise-month" data-v="${g.key}">
        <span class="row-main"><span class="row-title">▶ ${monthName(g.key, dateLocale())}</span><span class="row-sub">${t("ca.practiseSub")}</span></span>
        <span class="row-count">${g.questions.length}</span></button>`)}</div>
      ${subject ? html`<p class="hint"><button type="button" class="link" data-action="see-all">${t("ca.seeAll")}</button></p>` : ""}` : ""}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      ${wp ? html`<button type="button" class="btn" data-action="make" ${pick.regions.size ? "" : "disabled"}>${t("ca.make")}</button>`
        : html`<button type="button" class="btn" data-action="settings">${t("ca.aiSettings")}</button>`}</div>`, {
    close: () => closeSheet(),
    // Choices change in place (no redraw), so the sheet doesn't jump back to the top.
    month: (el) => { pick.month = el.dataset.v; paintChoice(".ca-months", (b) => b.dataset.v === pick.month); },
    region: (el) => {
      const r = el.dataset.v;
      if (pick.regions.has(r)) pick.regions.delete(r); else pick.regions.add(r);
      paintChoice(".ca-regions", (b) => pick.regions.has(b.dataset.v));
      const make = sheetBody()?.querySelector('[data-action="make"]'); if (make) make.disabled = !pick.regions.size;
    },
    count: (el) => { pick.n = Number(el.dataset.v); sheetBody()?.querySelectorAll('[data-action="count"]').forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === pick.n)); },
    "practise-month": (el) => practiseMonth(syllabus, el.dataset.v),
    "see-all": () => { closeSheet(); whenBackDone(() => go("subject", { id: subject.id, mode: "ai" })); },
    settings: () => { closeSheet(); whenBackDone(() => go("settings", { section: "ai", open: "1" })); },
    make: () => { if (pick.regions.size) make(syllabus); }
  }, { label: title });
}

function paintChoice(sel, isOn) {
  sheetBody()?.querySelectorAll(`${sel} [data-v]`).forEach((b) => { const yes = isOn(b); b.classList.toggle("on", yes); b.setAttribute("aria-pressed", String(yes)); });
}

function practiseMonth(syllabus, key) {
  const qs = caQuestions(syllabus.id).filter((q) => q.sourceRef.ca === key);
  if (!qs.length) return;
  closeSheet();
  setTimeout(() => openStartTest({ scope: { type: "ai", ref: `ca:${key}`, label: t("ca.practiseLabel", { month: monthName(key, dateLocale()) }) }, questions: qs, keepOrder: false }), 60);
}

/** Asks for the quiz, checks it (in code, then a second web pass), and shows it for review. */
async function make(syllabus) {
  const key = pick.month;
  const regions = CA_REGIONS.filter((r) => pick.regions.has(r));
  const n = pick.n;
  const range = monthRange(key);
  const month = monthName(key, "en-IN"); // the prompt is in English
  const shown = monthName(key, dateLocale());
  const partial = key === monthChoices()[0].key;
  const title = `🗞 ${t("ca.title")} · ${shown}`;
  const head = html`<h2>${title}</h2>`;
  const plan = topicPlan(syllabus.id);
  const already = caQuestions(syllabus.id);
  const have = new Set(store.questionsFor({ syllabusId: syllabus.id, source: "ai" }).map((q) => textKey(q.text)));
  const avoid = already.filter((q) => q.sourceRef.ca === key).slice(-40).map((q) => String(q.text).replace(/\s+/g, " ").slice(0, 140));
  const lang = await langOf();

  const waiting = (line) => {
    const control = aiControl(() => paintWaiting(box, control));
    const box = openSheet(html`${head}<p class="hint center">🌐 ${line}</p>${waitingBox()}`, {
      skip: () => control.skip(), stop: () => { control.cancel(); closeSheet(); } }, { label: title });
    watchWaiting(box, () => control);
    return { control, box };
  };

  const failed = (e) => openSheet(html`${head}${e?.noWeb ? html`<p class="warn-box">${t("ca.noWeb")}</p>` : html`${e?.webFailed && e.limit ? html`<p class="hint">${t("ca.webLimit")}</p>` : ""}<p class="warn-box pre">${errorText(e)}</p>`}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      ${e?.noWeb ? "" : html`<button type="button" class="btn" data-action="again">${t("ai.tryAgain")}</button>`}</div>`,
  { close: () => closeSheet(), again: () => make(syllabus) }, { label: title });

  // 1. The quiz, from this month's news on the web.
  let r;
  const ask1 = waiting(t("ca.searching", { month: shown }));
  try {
    const task = inLang(P.caQuizTask({ month, from: range.from, to: range.to, partial, regions, topics: plan.topics, n, avoid }), lang);
    r = await askWeb(P.CA_SYSTEM, task, lang === "en" ? 6000 : 8000, { control: ask1.control });
  } catch (e) {
    if (!isSheetOpen() || e.cancelled || !ask1.box.isConnected) return;
    return failed(e);
  }
  if (!isSheetOpen() || !ask1.box.isConnected) return;

  // 2. Checks in code: well-formed, not a repeat, a date in the month, a source page Google really found.
  let raw = [];
  let cut = false;
  try { raw = parseJsonLoose(r.text); } catch { raw = []; }
  if (!Array.isArray(raw)) raw = Array.isArray(raw?.questions) ? raw.questions : [];
  if (!raw.length) { raw = salvageObjects(r.text); cut = raw.length > 0; }
  const seen = new Set();
  const byKey = new Map(plan.topics.map((x) => [x.key, x]));
  const byName = (name) => plan.topics.find((x) => nameKey(x.name) === nameKey(name));
  const items = raw.map((x) => {
    const c = P.cleanGenerated([x])[0];
    const k = c && textKey(c.text);
    if (!c || !k || seen.has(k) || have.has(k)) return null;
    seen.add(k);
    const region = regionOf(x.region);
    const topic = byKey.get(String(x.topic || "").trim().toUpperCase()) || byName(REGION_TOPIC[region || "india"]);
    return { ...c, date: realDay(x.date), dateCheck: dateCheck(x.date, range), region, topic, src: sourceFor(x.source, r.sources) };
  }).filter(Boolean).slice(0, CA_COUNTS.at(-1) + 5);
  if (!items.length) {
    return openSheet(html`${head}<p class="warn-box">${t("ca.none", { month: shown })}</p><div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      <button type="button" class="btn" data-action="again">${t("ai.tryAgain")}</button></div>`, { close: () => closeSheet(), again: () => make(syllabus) }, { label: title });
  }

  // 3. A second pass answers each question on its own, from its own web search.
  let checkedBy = ""; let checkFailed = false;
  const ask2 = waiting(t("ca.checking"));
  try {
    const c = await askWeb(P.CA_CHECK_SYSTEM, P.caCheckTask(items, month), 800 + items.length * 60, { control: ask2.control });
    applyAnswerCheck(items, parseJsonLoose(c.text));
    checkedBy = c.by || "";
  } catch (e) {
    if (!isSheetOpen() || e.cancelled || !ask2.box.isConnected) return;
    items.forEach((x) => { x.check = "none"; });
    checkFailed = true;
  }
  if (!isSheetOpen() || !ask2.box.isConnected) return;
  review({ syllabus, key, shown, title, head, plan, items, r, checkedBy, checkFailed, cut });
}

function review({ syllabus, key, shown, title, head, plan, items, r, checkedBy, checkFailed, cut }) {
  const keep = new Set(items.map((x, i) => (startsTicked(x) ? i : -1)).filter((i) => i >= 0));
  const fref = answerRef("questions");
  let saving = false;
  let practiseList = null;
  const badges = (x) => [
    x.check === "agree" ? html`<span class="badge ok">✓ ${t("pdf.checkAgree")}</span>` : x.check === "disagree" ? html`<span class="badge bad">⚠ ${t("pdf.checkDisagree", { letter: letterFor(x.checkAnswer) })}</span>` : x.check === "unclear" ? html`<span class="badge warn">⚠ ${t("ai.checkNotSure")}</span>` : "",
    x.dateCheck === "off" ? html`<span class="badge warn">${t("ca.dateOff", { date: shortDate(x.date), month: shown })}</span>` : x.dateCheck === "none" ? html`<span class="badge warn">${t("ca.noDate")}</span>` : "",
    x.src ? "" : html`<span class="badge warn">${t("ca.noSource")}</span>`
  ].filter(Boolean);
  const where = (x) => [x.date ? `🗓 ${shortDate(x.date)}` : "", x.topic?.name || "", x.region ? t(`ca.region.${x.region}`) : ""].filter(Boolean).join(" · ");
  const body = openSheet(html`${head}
    <p class="made-with">🤖 ${r.by} · 🌐 ${t("ns.fromWeb")} ${flagChip({ ref: fref, by: r.by, kind: "questions", presetId: r.preset?.id || "" })}</p>
    ${checkedBy ? html`<p class="hint">✓ ${t("ai.checkedByList", { list: checkedBy })}</p>` : ""}
    ${checkFailed ? html`<p class="warn-box">${t("ca.checkFailed")}</p>` : ""}
    ${cut ? html`<p class="hint">${t("ca.cut", { n: items.length })}</p>` : ""}
    <p class="hint">${t("ca.reviewHint")}</p>
    ${items.map((x, i) => html`<article class="qcard ns-item ${keep.has(i) ? "" : "off"}"><label class="switch-row"><input type="checkbox" data-i="${i}" ${keep.has(i) ? "checked" : ""}><span>${t("ai.genQ", { n: i + 1 })}</span></label>
      <div class="qtext">${richText(x.text)}</div><ol class="options">${x.options.map((o, j) => html`<li class="${j === x.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === x.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>
      ${badges(x).length ? html`<div class="badges">${badges(x)}</div>` : ""}
      ${x.explanation ? html`<p class="hint">${x.explanation}</p>` : ""}${x.src ? html`<p class="hint">${sourceChip(x.src)}</p>` : ""}
      <p class="hint">${where(x)}</p></article>`)}
    ${sourcesList(r.sources)}
    <div class="sheet-actions sticky-in" data-ca-actions><button type="button" class="btn btn-quiet" data-action="close">${t("ai.discard")}</button>
      <button type="button" class="btn" data-action="save" ${keep.size ? "" : "disabled"}>${t("ai.saveN", { n: keep.size })}</button></div>`, {
    close: () => closeSheet(),
    save: async () => {
      if (saving || !keep.size) return;
      saving = true;
      const chosen = items.filter((_, i) => keep.has(i));
      let savedQs;
      try { savedQs = await store.quietly(() => saveChosen(syllabus, key, plan, chosen, r, checkedBy)); } catch (e) { saving = false; toast(errorText(e)); return; }
      store.touch();
      toast(t("ai.savedN", { n: savedQs.length }));
      if (!isSheetOpen()) return;
      sheetBody()?.querySelectorAll("input[data-i]").forEach((c) => { c.disabled = true; });
      const bar = sheetBody()?.querySelector("[data-ca-actions]");
      if (bar) bar.innerHTML = html`<button type="button" class="btn btn-quiet" data-action="close">${t("common.done")}</button>
        <button type="button" class="btn" data-action="practise">▶ ${t("ns.practise", { n: savedQs.length })}</button>`;
      practiseList = savedQs;
    },
    practise: () => {
      if (!practiseList?.length) return;
      const qs = practiseList; closeSheet();
      setTimeout(() => openStartTest({ scope: { type: "ai", ref: `ca:${key}`, label: t("ca.practiseLabel", { month: shown }) }, questions: qs, keepOrder: false }), 60);
    }
  }, { label: title });
  // Ticks change in place (no redraw), so the list doesn't jump back to the top.
  body.querySelectorAll("input[data-i]").forEach((c) => c.addEventListener("change", () => {
    const i = Number(c.dataset.i);
    if (c.checked) keep.add(i); else keep.delete(i);
    c.closest(".ns-item")?.classList.toggle("off", !c.checked);
    const btn = sheetBody()?.querySelector('[data-action="save"]');
    if (btn) { btn.textContent = t("ai.saveN", { n: keep.size }); btn.disabled = !keep.size; }
  }));
  typesetMath(body);
}

/** Saves the ticked questions with your AI questions: Current Affairs subject (made if missing), the topic the
    AI picked (made if missing), each with its month and source. → the saved questions */
async function saveChosen(syllabus, key, plan, chosen, r, checkedBy) {
  const subject = (plan.subject && store.subject(plan.subject.id)) || await mut.addSubject(SUBJECT_NAME);
  const made = new Map(); // topic name → id, for topics made now
  const groups = new Map();
  for (const x of chosen) {
    let topicId = x.topic?.topicId && store.topic(x.topic.topicId)?.subjectId === subject.id ? x.topic.topicId : null;
    if (!topicId) {
      const name = x.topic?.name || REGION_TOPIC[x.region || "india"];
      if (!made.has(nameKey(name))) made.set(nameKey(name), (await mut.addTopic(subject.id, name)).id);
      topicId = made.get(nameKey(name));
    }
    if (!groups.has(topicId)) groups.set(topicId, []);
    groups.get(topicId).push(x);
  }
  const out = [];
  for (const [topicId, list] of groups) {
    out.push(...await mut.saveAiQuestions(syllabus, subject.id, topicId, list.map((x) => ({
      text: x.text, options: x.options, answerIndex: x.answerIndex, explanation: x.explanation, difficulty: x.difficulty,
      sourceRef: { ca: key, ...(x.date ? { date: x.date } : {}), ...(x.src ? { web: [x.src] } : {}) },
      aiModel: { by: r.by, ...(checkedBy ? { checkedBy } : {}), web: true }
    }))));
  }
  return out;
}
