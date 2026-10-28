/* AI help in context:
   - a question: Explain (or Explain my mistake), Related facts, Ask AI (a chat kept with it), Similar questions
   - a topic: Make practice questions (reviewed before saving, kept apart from PYQs);
     Topic strategy (the pattern of its past questions and how to prepare)
   - Still wrong: Memory tricks · Guessing: Guess coach */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody } from "../../core/sheet.js";
import { chooseAction, confirmAction } from "../../core/dialogs.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { richText, letterFor, aiText } from "../../domain/text.js";
import { isGradable } from "../../domain/testing.js";
import { answerRecords, pickByBasis, accuracyBy, guessSummary, markingInfo, isAnswered, isTimed, weakTopics } from "../../domain/stats.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import * as presets from "../../ai/presets.js";
import { ask, parseJsonLoose } from "../../ai/client.js";
import * as P from "../../ai/prompts.js";
import { ensureAi, askInSheet, errorText, askFresh, withSourcesLine } from "./ai-ui.js";
import { timeSensitive, asksAboutNow, examYear } from "../../domain/current.js";
import { flagChip, answerRef } from "./flag-ui.js";
import { topicFacts, questionLines } from "../../domain/topic-pattern.js";
import { saveStrategy, strategyFor, patternFrom, clearStrategy, restoreStrategy, noteHasStrategy } from "../../data/strategy.js";
import { can } from "../../core/entitlements.js";
import { modelOf } from "../../pdf/pdf-jobs.js";
import { applyAnswerCheck } from "../../pdf/pdf-tools.js";

const lang = async () => (await presets.getConfig()).lang || "en";

/** The question as the AI sees it (names, not IDs). */
export function plainQuestion(q) {
  const paper = q.source !== "ai" ? store.paper(q.paperId) : null;
  return { text: q.text, options: q.options, answerIndex: q.answerIndex, status: q.status, subject: store.subject(q.subjectId)?.name, topic: store.topic(q.topicId)?.name,
    exam: paper ? `${paper.name}${examYear(paper.name) ? ` (${examYear(paper.name)})` : ""}` : "" };
}

/** Look this question up on the web? (Setting on, and it is about something that changes over time.) */
export const webFor = (q, message = "") => store.setting("aiWebCurrent", true) !== false
  && Boolean(timeSensitive(q, { subject: store.subject(q.subjectId)?.name, topic: store.topic(q.topicId)?.name }) || (message && asksAboutNow(message)));

/* ---------- one question ---------- */

/** selected: the option picked in a test (index), "none" if left, or undefined.
    mode: "explain" | "facts" | "chat" | "similar" (older "note" = facts); none = choose.
    onSaved: redraws the question's card after something is kept with it (else the screen is redrawn). */
export async function aiHelp(q, { selected, mode: preset = null, onSaved = null } = {}) {
  if (!(await ensureAi())) return;
  const mistake = Number.isInteger(selected) && selected !== q.answerIndex;
  const mode = preset || await chooseAction({ title: t("ai.help"), sub: q.text.slice(0, 120), items: [
    { id: "explain", label: `🤖 ${mistake ? t("ai.explainMistake") : t("ai.explain")}` },
    { id: "facts", label: `📚 ${t("ai.facts")}`, sub: t("ai.factsSub") },
    { id: "chat", label: `💬 ${t("ai.chat")}`, sub: t("ai.chatSub") },
    { id: "similar", label: `✨ ${t("ai.similar")}` }
  ] });
  if (!mode) return;
  if (mode === "similar") return generateQuestions(store.topic(q.topicId), [q]);
  if (mode === "chat") return questionChat(q, { onSaved });
  const saved = () => (onSaved ? onSaved() : store.touch());
  const pq = plainQuestion(q);
  const kind = mode === "facts" || mode === "note" ? "facts" : "explain";
  let model = "";
  await askInSheet({
    flagKind: kind,
    web: webFor(q), // current affairs / "who is it now" questions are looked up on the web
    title: kind === "facts" ? `📚 ${t("ai.facts")}` : mistake ? t("ai.explainMistake") : t("ai.explain"), sub: q.text.slice(0, 100),
    system: (l) => P.tutorSystem(l), user: (l) => P.inLang(kind === "explain" ? P.tasks.explain(pq, selected) : P.tasks.facts(pq), l),
    onModel: (m) => { model = m || ""; },
    // Each kind is kept in its own place under the question: an explanation never replaces the facts, or the other way round.
    actions: kind === "facts" ? [
      { id: "facts", label: t("ai.saveFacts"), run: async (text) => {
        const old = store.questionState(q.id)?.ai?.facts;
        if (old?.text && !(await confirmAction({ title: t("ai.replaceFacts"), body: old.text.slice(0, 200), confirmLabel: t("ai.replace") }))) return false;
        await store.quietly(() => mut.setQuestionAi(q.id, { facts: { text: text.trim().slice(0, 8000), by: model, at: Date.now() } }));
        saved();
        toast(t("ai.savedFacts"));
        return true;
      } }
    ] : [
      { id: "expl", label: t("ai.saveExplanation"), run: async (text) => {
        const fresh = store.question(q.id);
        if (fresh.explanation && !(await confirmAction({ title: t("ai.replaceExplanation"), body: fresh.explanation.slice(0, 200), confirmLabel: t("ai.replace") }))) return false;
        await store.quietly(() => mut.saveAiExplanation(fresh, text, model));
        saved();
        toast(t("ai.savedExplanation"));
        return true;
      } }
    ]
  });
}

/** 💬 A chat about one question, kept with it (shown under the question; Clear removes it). */
export async function questionChat(q, { onSaved = null } = {}) {
  if (!(await ensureAi())) return;
  const saved = () => (onSaved ? onSaved() : store.touch());
  const pq = plainQuestion(q);
  const history = () => store.questionState(q.id)?.ai?.chat || [];
  const keep = (chat) => store.quietly(() => mut.setQuestionAi(q.id, { chat: chat.length ? chat.slice(-40) : null }));
  let busy = false;
  let webOn = webFor(q); // 🌐 search the web for replies (on by itself for current-affairs questions)
  let mine = null; // this chat's sheet content (another sheet opened since → don't draw over it)
  const ours = () => Boolean(mine?.isConnected);
  const draw = (status = "", draft = "") => {
    const msgs = history();
    mine = openSheet(html`<h2>💬 ${t("ai.chat")}</h2>
      <p class="hint">${q.text.slice(0, 140)}</p>
      <div class="chat-log" id="chatLog">${msgs.length ? msgs.map((m) => html`<div class="chat-msg ${m.role === "user" ? "me" : "ai"}">
          ${m.role === "user" ? html`<p>${m.text}</p>` : html`<div class="ai-answer">${aiText(m.text, { sections: false })}</div>${m.by ? html`<p class="hint">🤖 ${m.by} ${flagChip({ ref: `chat:${q.id}:${m.at}`, by: m.by, kind: "chat" })}</p>` : ""}`}</div>`)
        : html`<p class="hint">${t("ai.chatEmpty")}</p>`}
        ${status ? html`<p class="chat-status">${status}</p>` : ""}</div>
      <p class="hint">${t("ai.verify")}</p>
      <label class="field-label">${t("ai.chatAsk")}<textarea class="field" id="chatIn" rows="2" maxlength="2000" placeholder="${t("ai.chatPlaceholder")}">${draft}</textarea></label>
      <label class="switch-row small"><input type="checkbox" id="chatWeb" ${webOn ? "checked" : ""}><span>🌐 ${t("ai.web.chatToggle")}</span></label>
      <div class="sheet-actions sticky-in">
        ${msgs.length && !busy ? html`<button type="button" class="btn btn-quiet push-left" data-action="clear">🗑 ${t("ai.chatClear")}</button>` : ""}
        <button type="button" class="btn btn-quiet" data-action="close">${t("common.done")}</button>
        <button type="button" class="btn" data-action="send" ${busy ? "disabled" : ""}>${t("ai.chatSend")}</button></div>`, {
      close: () => closeSheet(),
      clear: async () => {
        if (busy) return;
        const ok = await confirmAction({ title: t("ai.chatClearTitle"), confirmLabel: t("ai.chatClear"), danger: true });
        if (ok) await keep([]);
        if (isSheetOpen()) draw(); else saved();
      },
      send: async () => {
        const box = sheetBody().querySelector("#chatIn");
        const message = box.value.trim().slice(0, 2000);
        if (!message || busy) return;
        webOn = sheetBody().querySelector("#chatWeb")?.checked ?? webOn;
        busy = true;
        const before = history();
        const mine = { role: "user", text: message, at: Date.now() };
        await keep([...before, mine]);
        draw(t("ai.thinking"));
        try {
          const useWeb = sheetBody()?.querySelector("#chatWeb")?.checked ?? webFor(q, message);
          webOn = useWeb;
          const { text, preset, sources, webNote } = await askFresh(P.tutorSystem(await lang()), P.inLang(P.chatTask(pq, store.question(q.id)?.explanation, before, message), await lang()), 1800, { web: useWeb });
          await keep([...history(), { role: "ai", text: withSourcesLine(text, sources).trim().slice(0, 6000), by: modelOf(preset), at: Date.now(), web: Boolean(sources?.length) }]);
          if (webNote) toast(t("ai.web.notSearched", { why: webNote }), { duration: 6000 });
          busy = false;
          if (ours()) draw(); else saved();
        } catch (e) {
          // Not answered: your message goes back in the box, so nothing you typed is lost.
          busy = false;
          await keep(history().filter((m) => m !== mine && !(m.role === "user" && m.at === mine.at && m.text === mine.text)));
          if (ours()) draw(`✗ ${errorText(e)}`, message); else saved();
        }
      }
    }, { label: t("ai.chat"), onClose: saved });
    typesetMath(sheetBody());
    const log = sheetBody().querySelector("#chatLog");
    log?.lastElementChild?.scrollIntoView({ block: "nearest" });
  };
  draw();
}

/* ---------- 🧠 memory tricks for a revision note made from a study PDF ---------- */

/** Tricks for the note's hard-to-remember points, kept with the note (never inside its text). */
export async function noteTricks(note, { onSaved = null } = {}) {
  if (!note?.text || !(await ensureAi())) return;
  let model = "";
  await askInSheet({
    flagKind: "tricks",
    title: `🧠 ${t("ai.pnTricks")}`, sub: note.label || "",
    system: (l) => P.tutorSystem(l), user: (l) => P.inLang(P.noteTricksTask(note.text), l),
    maxTokens: (l) => (l === "en" ? 2000 : 4500), onModel: (m) => { model = m || ""; },
    actions: [{ id: "keep", label: t("ai.pnTricksSave"), run: async (text) => {
      const fresh = store.byId("notes", note.id);
      if (!fresh) return false;
      if (fresh.tricks?.text && !(await confirmAction({ title: t("ai.pnTricksReplace"), body: fresh.tricks.text.slice(0, 200), confirmLabel: t("ai.replace") }))) return false;
      await store.quietly(() => mut.setNoteExtras(note.id, { tricks: { text: text.trim().slice(0, 8000), by: model, at: Date.now() } }));
      if (onSaved) onSaved(); else store.touch();
      toast(t("ai.pnTricksSaved"));
      return true;
    } }]
  });
}

/* ---------- practice questions for a topic ---------- */

/** "1 Choose → 2 Writing → 3 Check & save" (same as the study-PDF screens). */
const steps3 = (at) => html`<ol class="steps3">${["choose", "writing", "review"].map((k, i) => html`<li class="${i + 1 === at ? "on" : i + 1 < at ? "done" : ""}"><span class="n">${i + 1 < at ? "✓" : i + 1}</span>${t(`pdf.steps.${k}`)}</li>`)}</ol>`;

export async function generateQuestions(topic, seedQs = null) {
  if (!topic || !(await ensureAi())) return;
  const subject = store.subject(topic.subjectId);
  const syllabus = store.currentSyllabus();
  const strategy = strategyFor(topic.id);
  const s = { n: 8, lang: subject?.name === "Malayalam" ? "ml" : "en", difficulty: "mixed", usePattern: Boolean(strategy), check: true };
  const pills = (key, values, label) => html`<div class="chip-wrap">${values.map((v) => html`<button type="button" class="pill ${s[key] === v ? "on" : ""}" data-action="set" data-k="${key}" data-v="${v}">${label(v)}</button>`)}</div>`;
  const draw = () => openSheet(html`<h2>${t("ai.genTitle")}</h2>${steps3(1)}
    <p class="hint">${nameLabel(subject)} · ${nameLabel(topic)}${seedQs?.length === 1 ? ` · ${t("ai.genSimilar")}` : ""}</p>
    <h3>${t("ai.genCount")}</h3>${pills("n", [5, 8, 10, 15], (v) => v)}
    <h3>${t("ai.genLang")}</h3>${pills("lang", ["en", "ml"], (v) => t(`ai.langs.${v}`))}
    <h3>${t("ai.genDiff")}</h3>${pills("difficulty", ["mixed", "E", "M", "D"], (v) => (v === "mixed" ? t("ai.mixed") : t(`question.difficulty.${v}`)))}
    ${strategy ? html`<div class="checks"><button type="button" class="check ${s.usePattern ? "on" : ""}" data-action="pattern" aria-pressed="${String(s.usePattern)}"><span class="box">${s.usePattern ? "✓" : ""}</span>
      <span class="row-main"><span>🎯 ${t("ai.usePattern")}</span><span class="row-sub">${t("ai.usePatternHint", { date: `${strategy.at ? new Date(strategy.at).toLocaleDateString(dateLocale()) : "—"}${strategy.by ? ` · 🤖 ${strategy.by}` : ""}` })}</span></span></button></div>`
      : html`<p class="hint">💡 ${t("ai.noPatternYet")}</p>`}
    <div class="checks"><button type="button" class="check ${s.check ? "on" : ""}" data-action="check" aria-pressed="${String(s.check)}"><span class="box">${s.check ? "✓" : ""}</span>
      <span class="row-main"><span>${t("pdf.check")}</span><span class="row-sub">${t("ai.genCheckHint")}</span></span></button></div>
    <p class="hint">${t("ai.genNote")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("ai.generate")}</button></div>`, {
    set: (el) => { s[el.dataset.k] = el.dataset.k === "n" ? Number(el.dataset.v) : el.dataset.v; draw(); },
    cancel: () => closeSheet(),
    pattern: () => { s.usePattern = !s.usePattern; draw(); },
    check: () => { s.check = !s.check; draw(); },
    go: () => run()
  }, { label: t("ai.genTitle") });
  draw();

  async function run() {
    openSheet(html`<h2>${t("ai.genTitle")}</h2>${steps3(2)}<p class="sheet-status">${t("ai.generating")}</p>`, {});
    const examples = (seedQs?.length ? seedQs : store.questionsFor({ syllabusId: syllabus.id, topicId: topic.id }).slice(0, 5)).map((q) => ({ text: q.text, options: q.options }));
    try {
      const { text, preset } = await ask(P.GENERATE_SYSTEM, P.generateTask({ subject: subject?.name || "", topic: topic.name, n: s.n, lang: s.lang, difficulty: s.difficulty, examples, pattern: s.usePattern && strategy ? patternFrom(strategy.text) : "" }), 4000);
      const items = P.cleanGenerated(parseJsonLoose(text));
      if (!items.length) throw new Error(t("ai.err.noQuestions"));
      const by = modelOf(preset);
      // Second, independent pass: the answer key is checked (there is no PDF to check against).
      let cb = null;
      if (s.check && isSheetOpen()) {
        try {
          const { text: reply, preset: cp } = await ask(P.GENERAL_CHECK_SYSTEM, P.generalCheckTask(items), 400 + items.length * 40);
          applyAnswerCheck(items, parseJsonLoose(reply));
          cb = modelOf(cp);
        } catch { items.forEach((x) => { x.check = "none"; }); }
      }
      items.forEach((x) => { x.aiModel = by ? (cb ? { by, checkedBy: cb } : { by }) : null; });
      if (isSheetOpen()) review(items, by, cb);
    } catch (e) {
      if (isSheetOpen()) openSheet(html`<h2>${t("ai.genTitle")}</h2><p class="warn-box pre">${errorText(e)}</p>
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="back">${t("common.back")}</button>
        <button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { back: draw, close: () => closeSheet() });
    }
  }

  function review(items, by = null, cb = null) {
    const fref = answerRef("questions");
    // A question the second pass answered differently (or couldn't answer) starts unticked.
    const keep = new Set(items.map((x, i) => (x.check === "disagree" || x.check === "unclear" ? -1 : i)).filter((i) => i >= 0));
    const badge = (x) => (x.check === "agree" ? html`<div class="badges"><span class="badge ok">✓ ${t("pdf.checkAgree")}</span></div>`
      : x.check === "disagree" ? html`<div class="badges"><span class="badge bad">⚠ ${t("pdf.checkDisagree", { letter: letterFor(x.checkAnswer) })}</span></div>`
        : x.check === "unclear" ? html`<div class="badges"><span class="badge warn">⚠ ${t("ai.checkNotSure")}</span></div>` : "");
    const drawReview = () => {
      openSheet(html`<h2>${t("ai.reviewTitle")}</h2>${steps3(3)}
        ${by ? html`<p class="made-with">🤖 ${t("ai.madeWith", { list: by })}${cb ? html` · ${t("ai.checkedByList", { list: cb })}` : ""} ${flagChip({ ref: fref, by: String(by).split(",")[0].trim(), kind: "questions" })}</p>` : ""}
        <p class="warn-box">${t("ai.reviewNote")}</p>
        ${items.map((x, i) => html`<article class="qcard gen ${keep.has(i) ? "" : "off"}">
          <label class="switch-row"><input type="checkbox" data-i="${i}" ${keep.has(i) ? "checked" : ""}><strong>${t("ai.genQ", { n: i + 1 })}</strong></label>
          <div class="qtext">${richText(x.text)}</div>
          <ol class="options">${x.options.map((o, j) => html`<li class="${j === x.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === x.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>
          ${badge(x)}
          ${x.explanation ? html`<p class="hint">${richText(x.explanation)}</p>` : ""}
        </article>`)}
        <div class="sheet-actions sticky-in"><button type="button" class="btn btn-quiet" data-action="close">${t("ai.discard")}</button>
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

/* ---------- a topic: pattern of past questions + preparation strategy ---------- */

export async function topicStrategy(topic) {
  if (!topic || !(await ensureAi())) return;
  const syllabus = store.currentSyllabus();
  const subject = store.subject(topic.subjectId);
  const questions = store.questionsFor({ syllabusId: syllabus.id, topicId: topic.id });
  if (questions.length < 3) { toast(t("ai.strategyFew")); return; }
  const f = topicFacts(questions, (id) => store.paper(id));
  const { lines, shown, total } = questionLines(questions, (id) => store.paper(id));
  // The student's own results here (first tries), so the plan fits them.
  const recs = pickByBasis(answerRecords(store.attemptsOf(syllabus.id).filter((a) => a.kind !== "ai")).filter((r) => r.topicId === topic.id), "first");
  const right = recs.filter((r) => r.isCorrect).length;
  const timed = recs.filter((r) => r.timeMs > 0);
  const g = guessSummary(recs.filter((r) => r.guessed), syllabus.marking);
  const mine = recs.length
    ? `${recs.length} of ${total} questions tried, ${Math.round((right / recs.length) * 100)}% right${timed.length ? `, ${Math.round(timed.reduce((a, r) => a + r.timeMs, 0) / timed.length / 1000)} s per question` : ""}${g.n ? `, guessed ${g.n} (${g.right} right, net ${g.net} marks)` : ""}.`
    : "not practised yet.";
  const mk = markingInfo(syllabus.marking);
  const label = `${nameLabel(subject)} · ${nameLabel(topic)}`;
  await askInSheet({
    flagKind: "strategy",
    // Kept for the question makers (AI questions, questions from a PDF) to follow this pattern (each answer, also one asked again).
    onAnswer: async (text, by) => { if (!text) return; await saveStrategy(topic.id, { text, by, lang: await lang() }); store.touch(); toast(t("ai.strategyKept")); },
    title: `🤖 ${t("ai.strategyTitle")}`, sub: `${label} · ${t("ai.strategySub", { n: total, papers: f.papers })}`,
    // Malayalam takes several times more tokens than English: give it room so it isn't cut off.
    maxTokens: (l) => (l === "en" ? 4500 : 9000), system: (l) => P.tutorSystem(l, P.SECTIONED),
    user: (l) => P.inLang(P.topicStrategyTask({ subject: subject?.name || "", topic: topic.name, f, lines, shown, total, mine, marking: mk }), l)
    // 1.26.5: no "Add to the note" here: the strategy stays the topic's own AI strategy block (read / new / clear).
  });
}

/** The topic's saved AI strategy: read it, make a new one, or clear it (Undo for a few seconds). */
export function viewStrategy(topic) {
  const st = topic ? strategyFor(topic.id) : null;
  if (!st) return;
  const meta = [st.at ? new Date(st.at).toLocaleDateString(dateLocale()) : "", st.by ? `🤖 ${st.by}` : "", st.from === "note" ? t("ai.strategyFromNote") : ""].filter(Boolean).join(" · ");
  openSheet(html`<h2>🎯 ${t("ai.strategyTitle")}</h2><p class="hint">${nameLabel(topic)}${meta ? ` · ${meta}` : ""} ${st.by ? flagChip({ ref: `strat:${topic.id}:${st.at || ""}`, by: st.by, kind: "strategy" }) : ""}</p>
    <div class="ai-answer">${aiText(st.text)}</div>
    <div class="sheet-actions sticky-in">
      <button type="button" class="btn btn-quiet push-left" data-action="clear">🗑 ${t("ai.strategyClear")}</button>
      ${can("ai") ? html`<button type="button" class="btn btn-quiet" data-action="new">${t("ai.strategyNew")}</button>` : ""}
      <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    close: () => closeSheet(),
    new: () => topicStrategy(topic),
    clear: async () => {
      const body = `${t("ai.strategyClearBody")}${noteHasStrategy(topic.id) ? ` ${t("ai.strategyClearNote")}` : ""}`;
      const ok = await confirmAction({ title: t("ai.strategyClearTitle"), body, confirmLabel: t("common.clear"), danger: true });
      if (!ok) { if (isSheetOpen()) viewStrategy(topic); return; }
      const prev = await clearStrategy(topic.id);
      closeSheet();
      store.touch();
      toast(t("ai.strategyCleared"), { actionLabel: t("common.undo"), duration: 8000, onAction: async () => { await restoreStrategy(topic.id, prev); store.touch(); } });
    }
  }, { label: t("ai.strategyTitle") });
  typesetMath(sheetBody());
}

/* ---------- shared figures for AI (guess coach) ---------- */

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
  // Guesses after crossing out options (tests from 1.4 on record how many were crossed out).
  const byStruck = [[0, 1], [2, 9]].map(([lo, hi]) => { const g = records.filter((r) => r.guessed && isAnswered(r) && r.struck !== undefined && r.struck >= lo && r.struck <= hi); return g.length ? `${lo === 0 ? "0–1" : "2+"} options crossed out: ${g.filter((r) => r.isCorrect).length}/${g.length} right` : null; }).filter(Boolean);
  if (byStruck.length) byDiff.push(...byStruck.map((x) => `Elimination — ${x}`));
  const recentWrong = records.filter((r) => r.guessed && isAnswered(r) && !r.isCorrect).slice(-8)
    .map((r) => { const q = store.question(r.questionId); return q ? `- [${tName(q.topicId)}] ${q.text.slice(0, 110)}` : null; }).filter(Boolean);
  await askInSheet({
    title: t("ai.coachTitle"), sub: t("ai.coachSub", { be: Math.round(mk.breakEven * 100), right: all.right, wrong: all.wrong, net: all.net }), maxTokens: 2000,
    system: (l) => P.tutorSystem(l), user: (l) => P.inLang(P.guessCoachTask({ ...all, breakEven: mk.breakEven, pos: mk.pos, pen: mk.pen, byTopic, byDiff, recentWrong }), l),
    actions: [{ id: "save", label: t("ai.saveToNotes"), run: async (text) => { await mut.appendNote({ type: "misc", id: "ai-tricks" }, t("ai.tricksNoteLabel"), `🎓 ${text}`); toast(t("ai.savedToNotes")); return true; } }]
  });
}

