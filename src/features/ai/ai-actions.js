/* AI help in context:
   - a question: Explain (or Explain my mistake), Mnemonic, Revision note, Similar questions
   - a topic: Make practice questions (reviewed before saving, kept apart from PYQs)
   - Progress: Study plan · Still wrong: Memory tricks · Guessing: Guess coach */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody } from "../../core/sheet.js";
import { chooseAction, confirmAction } from "../../core/dialogs.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { richText, letterFor } from "../../domain/text.js";
import { isGradable } from "../../domain/testing.js";
import { answerRecords, pickByBasis, accuracyBy, guessSummary, markingInfo, isAnswered, isTimed, weakTopics } from "../../domain/stats.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import * as presets from "../../ai/presets.js";
import { ask, parseJsonLoose } from "../../ai/client.js";
import * as P from "../../ai/prompts.js";
import { ensureAi, askInSheet, errorText } from "./ai-ui.js";

const lang = async () => (await presets.getConfig()).lang || "en";

/** The question as the AI sees it (names, not IDs). */
export function plainQuestion(q) {
  return { text: q.text, options: q.options, answerIndex: q.answerIndex, status: q.status, subject: store.subject(q.subjectId)?.name, topic: store.topic(q.topicId)?.name };
}

/* ---------- one question ---------- */

/** selected: the option picked in a test (index), "none" if left, or undefined. */
export async function aiHelp(q, { selected } = {}) {
  if (!(await ensureAi())) return;
  const mistake = Number.isInteger(selected) && selected !== q.answerIndex;
  const mode = await chooseAction({ title: t("ai.help"), sub: q.text.slice(0, 120), items: [
    { id: "explain", label: mistake ? t("ai.explainMistake") : t("ai.explain") },
    { id: "mnemonic", label: t("ai.mnemonic") },
    { id: "note", label: t("ai.note") },
    { id: "similar", label: t("ai.similar") }
  ] });
  if (!mode) return;
  if (mode === "similar") return generateQuestions(store.topic(q.topicId), [q]);
  const pq = plainQuestion(q);
  const topic = store.topic(q.topicId);
  await askInSheet({
    title: t(`ai.${mode === "explain" && mistake ? "explainMistake" : mode}`), sub: q.text.slice(0, 100),
    system: P.tutorSystem(await lang()), user: mode === "explain" ? P.tasks.explain(pq, selected) : P.tasks[mode](pq),
    actions: [
      { id: "expl", label: t("ai.saveExplanation"), run: async (text) => {
        const fresh = store.question(q.id);
        if (fresh.explanation && !(await confirmAction({ title: t("ai.replaceExplanation"), body: fresh.explanation.slice(0, 200), confirmLabel: t("ai.replace") }))) return false;
        await mut.updateQuestion(fresh, { text: fresh.text, options: fresh.options, explanation: text });
        toast(t("ai.savedExplanation"));
        return true;
      } },
      topic ? { id: "note", label: t("ai.addToNote", { topic: nameLabel(topic) }), run: async (text) => {
        await mut.appendNote({ type: "topic", id: topic.id }, topic.name, `🤖 ${q.text.slice(0, 80)}\n${text}`);
        toast(t("ai.addedToNote", { topic: nameLabel(topic) }));
        return true;
      } } : null
    ].filter(Boolean)
  });
}

/* ---------- practice questions for a topic ---------- */

export async function generateQuestions(topic, seedQs = null) {
  if (!topic || !(await ensureAi())) return;
  const subject = store.subject(topic.subjectId);
  const syllabus = store.currentSyllabus();
  const s = { n: 8, lang: subject?.name === "Malayalam" ? "ml" : "en", difficulty: "mixed" };
  const pills = (key, values, label) => html`<div class="chip-wrap">${values.map((v) => html`<button type="button" class="pill ${s[key] === v ? "on" : ""}" data-action="set" data-k="${key}" data-v="${v}">${label(v)}</button>`)}</div>`;
  const draw = () => openSheet(html`<h2>${t("ai.genTitle")}</h2>
    <p class="hint">${nameLabel(subject)} · ${nameLabel(topic)}${seedQs?.length === 1 ? ` · ${t("ai.genSimilar")}` : ""}</p>
    <h3>${t("ai.genCount")}</h3>${pills("n", [5, 8, 10, 15], (v) => v)}
    <h3>${t("ai.genLang")}</h3>${pills("lang", ["en", "ml"], (v) => t(`ai.langs.${v}`))}
    <h3>${t("ai.genDiff")}</h3>${pills("difficulty", ["mixed", "E", "M", "D"], (v) => (v === "mixed" ? t("ai.mixed") : t(`question.difficulty.${v}`)))}
    <p class="hint">${t("ai.genNote")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("ai.generate")}</button></div>`, {
    set: (el) => { s[el.dataset.k] = el.dataset.k === "n" ? Number(el.dataset.v) : el.dataset.v; draw(); },
    cancel: () => closeSheet(),
    go: () => run()
  }, { label: t("ai.genTitle") });
  draw();

  async function run() {
    openSheet(html`<h2>${t("ai.genTitle")}</h2><p class="sheet-status">${t("ai.generating")}</p>`, {});
    const examples = (seedQs?.length ? seedQs : store.questionsFor({ syllabusId: syllabus.id, topicId: topic.id }).slice(0, 5)).map((q) => ({ text: q.text, options: q.options }));
    try {
      const { text } = await ask(P.GENERATE_SYSTEM, P.generateTask({ subject: subject?.name || "", topic: topic.name, n: s.n, lang: s.lang, difficulty: s.difficulty, examples }), 4000);
      const items = P.cleanGenerated(parseJsonLoose(text));
      if (!items.length) throw new Error(t("ai.err.noQuestions"));
      if (isSheetOpen()) review(items);
    } catch (e) {
      if (isSheetOpen()) openSheet(html`<h2>${t("ai.genTitle")}</h2><p class="warn-box pre">${errorText(e)}</p>
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="back">${t("common.back")}</button>
        <button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { back: draw, close: () => closeSheet() });
    }
  }

  function review(items) {
    const keep = new Set(items.map((_, i) => i));
    const drawReview = () => {
      openSheet(html`<h2>${t("ai.reviewTitle")}</h2>
        <p class="warn-box">${t("ai.reviewNote")}</p>
        ${items.map((x, i) => html`<article class="qcard gen ${keep.has(i) ? "" : "off"}">
          <label class="switch-row"><input type="checkbox" data-i="${i}" ${keep.has(i) ? "checked" : ""}><strong>${t("ai.genQ", { n: i + 1 })}</strong></label>
          <div class="qtext">${richText(x.text)}</div>
          <ol class="options">${x.options.map((o, j) => html`<li class="${j === x.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === x.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>
          ${x.explanation ? html`<p class="hint">${richText(x.explanation)}</p>` : ""}
        </article>`)}
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("ai.discard")}</button>
          <button type="button" class="btn" data-action="save">${t("ai.saveN", { n: keep.size })}</button></div>`, {
        close: () => closeSheet(),
        save: async () => {
          const chosen = items.filter((_, i) => keep.has(i));
          if (!chosen.length) { toast(t("ai.nothingChosen")); return; }
          await mut.saveAiQuestions(syllabus, topic.subjectId, topic.id, chosen);
          closeSheet();
          toast(t("ai.savedN", { n: chosen.length }));
        }
      }, { label: t("ai.reviewTitle") });
      sheetBody().querySelectorAll("input[data-i]").forEach((c) => c.addEventListener("change", () => {
        const i = Number(c.dataset.i);
        if (c.checked) keep.add(i); else keep.delete(i);
        c.closest(".qcard").classList.toggle("off", !c.checked);
        sheetBody().querySelector('[data-action="save"]').textContent = t("ai.saveN", { n: keep.size });
      }));
      typesetMath(sheetBody());
    };
    drawReview();
  }
}

/* ---------- Progress: study plan ---------- */

function statsForAi(syllabus) {
  const attempts = store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai");
  const records = answerRecords(attempts);
  const counts = new Map();
  store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => counts.set(q.topicId, (counts.get(q.topicId) || 0) + 1));
  const name = (id) => { const x = store.topic(id); return x ? `${store.subject(x.subjectId)?.name} › ${x.name}` : null; };
  const acc = accuracyBy(pickByBasis(records), (r) => r.topicId);
  const ranked = weakTopics(counts, records);
  const weak = ranked.filter((w) => w.accuracy !== null && acc[w.topicId] && acc[w.topicId].correct / acc[w.topicId].total < 0.6).slice(0, 10)
    .map((w) => `${name(w.topicId)}: ${Math.round((acc[w.topicId].correct / acc[w.topicId].total) * 100)}% accuracy, ${w.freq} questions in papers`);
  const untried = ranked.filter((w) => w.accuracy === null).slice(0, 10).map((w) => `${name(w.topicId)}: ${w.freq} questions, not practised`);
  const timed = pickByBasis(records, "first", isTimed);
  const byT = new Map(); timed.forEach((r) => { if (!byT.has(r.topicId)) byT.set(r.topicId, []); byT.get(r.topicId).push(r.timeMs); });
  const slow = [...byT.entries()].filter(([, a]) => a.length >= 2).map(([id, a]) => ({ id, s: a.reduce((x, y) => x + y, 0) / a.length / 1000 }))
    .sort((a, b) => b.s - a.s).slice(0, 6).map((x) => `${name(x.id)}: ${Math.round(x.s)}s per question`);
  const mk = markingInfo(syllabus.marking);
  const byG = new Map(); records.filter((r) => r.guessed).forEach((r) => { if (!byG.has(r.topicId)) byG.set(r.topicId, []); byG.get(r.topicId).push(r); });
  const guess = [...byG.entries()].map(([id, rs]) => ({ id, g: guessSummary(rs, syllabus.marking) })).filter((x) => x.g.n && x.g.net < 0)
    .sort((a, b) => a.g.net - b.g.net).slice(0, 6).map((x) => `${name(x.id)}: guessed ${x.g.n}, ${x.g.right} right, net ${x.g.net} marks`);
  const due = store.all("topicState").filter((s) => s.syllabusId === syllabus.id && s.nextReviewAt && s.nextReviewAt <= Date.now())
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt).slice(0, 8).map((s) => name(s.topicId)).filter(Boolean);
  return { weak, untried, slow, guess, due, marking: mk, records };
}

export async function studyPlan() {
  if (!(await ensureAi())) return;
  const syllabus = store.currentSyllabus();
  const s = { days: 7, hours: 3 };
  const last = store.byId("notes", "note:misc:ai-plan");
  const draw = () => openSheet(html`<h2>${t("ai.planTitle")}</h2>
    <p class="hint">${t("ai.planHint")}</p>
    <h3>${t("ai.planDays")}</h3><div class="chip-wrap">${[3, 7, 14].map((d) => html`<button type="button" class="pill ${s.days === d ? "on" : ""}" data-action="days" data-v="${d}">${t("ai.daysN", { n: d })}</button>`)}</div>
    <h3>${t("ai.planHours")}</h3><div class="chip-wrap">${[1, 2, 3, 4, 6].map((h) => html`<button type="button" class="pill ${s.hours === h ? "on" : ""}" data-action="hours" data-v="${h}">${t("ai.hoursN", { n: h })}</button>`)}</div>
    ${last ? html`<p class="hint">${t("ai.lastPlan")}</p>` : ""}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("ai.makePlan")}</button></div>`, {
    days: (el) => { s.days = Number(el.dataset.v); draw(); },
    hours: (el) => { s.hours = Number(el.dataset.v); draw(); },
    cancel: () => closeSheet(),
    go: async () => {
      const data = statsForAi(syllabus);
      if (!data.weak.length && !data.untried.length) { toast(t("ai.planNoData")); return; }
      await askInSheet({
        title: t("ai.planTitle"), sub: t("ai.planSub", { days: s.days, hours: s.hours }), maxTokens: 3500,
        system: P.tutorSystem(await lang()), user: P.planTask({ days: s.days, hours: s.hours, s: data }),
        actions: [{ id: "save", label: t("ai.saveToNotes"), run: async (text) => {
          await mut.saveNote({ type: "misc", id: "ai-plan" }, t("ai.planNoteLabel"), `${t("ai.planNoteHead", { date: new Date().toLocaleDateString("en-IN"), days: s.days, hours: s.hours })}\n\n${text}`);
          toast(t("ai.savedToNotes")); return true;
        } }]
      });
    }
  }, { label: t("ai.planTitle") });
  draw();
}

/* ---------- Still wrong: memory tricks ---------- */

export async function wrongTricks(questions) {
  if (!(await ensureAi())) return;
  const pool = questions.filter(isGradable);
  if (!pool.length) { toast(t("ai.noWrong")); return; }
  const n = Math.min(8, pool.length);
  const batch = pool.slice().sort(() => Math.random() - 0.5).slice(0, n);
  openSheet(html`<h2>${t("ai.tricksTitle")}</h2><p class="sheet-status">${t("ai.thinking")}</p>`, {});
  try {
    const { text } = await ask(P.tutorSystem("en"), P.tricksTask(batch.map(plainQuestion), await lang()), 3500);
    const arr = parseJsonLoose(text);
    const rows = (Array.isArray(arr) ? arr : []).filter((x) => batch[Number(x.n) - 1]).map((x) => ({ q: batch[Number(x.n) - 1], fact: String(x.fact || ""), trick: String(x.mnemonic || "") }));
    if (!rows.length) throw new Error(t("ai.err.badJson"));
    if (!isSheetOpen()) return;
    const save = (r) => mut.appendNote({ type: "misc", id: "ai-tricks" }, t("ai.tricksNoteLabel"), `🧠 ${store.subject(r.q.subjectId)?.name || ""} › ${store.topic(r.q.topicId)?.name || ""}: ${r.fact}${r.trick ? `\n${r.trick}` : ""}`);
    openSheet(html`<h2>${t("ai.tricksTitle")}</h2><p class="hint">${t("ai.verify")}</p>
      ${rows.map((r, i) => html`<article class="qcard"><div class="qtext clamp">${r.q.text}</div>
        <p><strong>${t("ai.fact")}:</strong> ${richText(r.fact)}</p>${r.trick ? html`<p><strong>${t("ai.trick")}:</strong> ${richText(r.trick)}</p>` : ""}
        <button type="button" class="btn btn-quiet btn-small" data-action="one" data-i="${i}">${t("ai.saveToNotes")}</button></article>`)}
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
        <button type="button" class="btn" data-action="all">${t("ai.saveAll")}</button></div>`, {
      one: async (el) => { await store.quietly(() => save(rows[Number(el.dataset.i)])); el.disabled = true; el.textContent = `✓ ${t("ai.saved")}`; },
      all: async () => { for (const r of rows) await store.quietly(() => save(r)); store.touch(); closeSheet(); toast(t("ai.savedToNotes")); },
      close: () => closeSheet()
    });
    typesetMath(sheetBody());
  } catch (e) {
    if (isSheetOpen()) openSheet(html`<h2>${t("ai.tricksTitle")}</h2><p class="warn-box pre">${errorText(e)}</p>
      <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
  }
}

/* ---------- guessing coach ---------- */

export async function guessCoach() {
  if (!(await ensureAi())) return;
  const syllabus = store.currentSyllabus();
  const { records } = statsForAi(syllabus);
  const mk = markingInfo(syllabus.marking);
  const all = guessSummary(records, syllabus.marking);
  if (!all.n) { toast(t("ai.noGuesses")); return; }
  const tName = (id) => { const x = store.topic(id); return x ? `${store.subject(x.subjectId)?.name} › ${x.name}` : "?"; };
  const byT = new Map(); records.filter((r) => r.guessed).forEach((r) => { if (!byT.has(r.topicId)) byT.set(r.topicId, []); byT.get(r.topicId).push(r); });
  const byTopic = [...byT.entries()].map(([id, rs]) => ({ id, g: guessSummary(rs, syllabus.marking) })).filter((x) => x.g.n)
    .sort((a, b) => a.g.net - b.g.net).slice(0, 12).map((x) => `${tName(x.id)}: guessed ${x.g.n}, right ${x.g.right}, wrong ${x.g.wrong}, net ${x.g.net}`);
  const byDiff = ["E", "M", "D"].map((d) => { const g = records.filter((r) => r.guessed && isAnswered(r) && r.difficulty === d); return g.length ? `${t(`question.difficulty.${d}`)}: ${g.filter((r) => r.isCorrect).length}/${g.length} right` : null; }).filter(Boolean);
  const recentWrong = records.filter((r) => r.guessed && isAnswered(r) && !r.isCorrect).slice(-8)
    .map((r) => { const q = store.question(r.questionId); return q ? `- [${tName(q.topicId)}] ${q.text.slice(0, 110)}` : null; }).filter(Boolean);
  await askInSheet({
    title: t("ai.coachTitle"), sub: t("ai.coachSub", { be: Math.round(mk.breakEven * 100), right: all.right, wrong: all.wrong, net: all.net }), maxTokens: 2000,
    system: P.tutorSystem(await lang()), user: P.guessCoachTask({ ...all, breakEven: mk.breakEven, pos: mk.pos, pen: mk.pen, byTopic, byDiff, recentWrong }),
    actions: [{ id: "save", label: t("ai.saveToNotes"), run: async (text) => { await mut.appendNote({ type: "misc", id: "ai-tricks" }, t("ai.tricksNoteLabel"), `🎓 ${text}`); toast(t("ai.savedToNotes")); return true; } }]
  });
}

