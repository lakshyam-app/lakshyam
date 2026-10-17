/* The "Next steps" of a test's AI analysis, done in the app when you ask:
   [FACTS] a fact sheet (saved to Notes, with its sources), [QUESTIONS] new practice questions,
   [CARDS] flashcards (both reviewed before saving), [REVISE] the wrong and blank questions again.
   AI looks the facts up on the web (Gemini or Groq gpt-oss presets can), told to use only trustworthy
   sources; each source is shown with a ✓ trusted / ⚠ check mark. With a preset that can't search,
   you are told so and can choose the AI's own knowledge instead (marked as not checked on the web).
   Questions are also answered again by a second, independent AI pass; disagreements start unticked. */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, isSheetOpen } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { aiText, letterFor, richText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import * as tests from "../../data/tests.js";
import * as presets from "../../ai/presets.js";
import { ask, parseJsonLoose, aiControl } from "../../ai/client.js";
import { askWeb, webPreset, domainOf, trustOf } from "../../ai/web.js";
import { flagChip, answerRef } from "../ai/flag-ui.js";
import * as P from "../../ai/prompts.js";
import { applyAnswerCheck } from "../../pdf/pdf-tools.js";
import { ensureAi, errorText, waitingBox, paintWaiting, watchWaiting, sourceChip, sourcesList } from "../ai/ai-ui.js";
import { openStartTest } from "./start-sheet.js";

const FLAG_KIND = { facts: "factSheet", questions: "questions", cards: "cards" }; // what a 🚩 counts as

/** A fact sheet starts with its first "## " section (the AI is told: no introduction). Anything before it
    is the AI talking to itself (some models write out their plan) and is dropped. */
export function dropPreamble(text) {
  const s = String(text || "").trim();
  const at = s.search(/^##\s/m);
  return at > 0 ? s.slice(at).trim() : s;
}

const TAG = /\[(FACTS|QUESTIONS|CARDS|REVISE)\]\s*/i;
const KIND = { FACTS: "facts", QUESTIONS: "questions", CARDS: "cards", REVISE: "revise" };
const ICON = { facts: "📄", questions: "❓", cards: "🃏", revise: "▶" };

/** The tagged next steps in an analysis → [{ kind, text }] (none in analyses written before 1.20). */
export function parseSteps(text) {
  const out = [];
  String(text || "").split("\n").forEach((line) => {
    const m = TAG.exec(line);
    if (!m) return;
    const rest = line.slice(m.index + m[0].length).replace(/\*\*/g, "").replace(/^[\s:–-]+/, "").trim();
    out.push({ kind: KIND[m[1].toUpperCase()], text: rest.slice(0, 400) });
  });
  return out.slice(0, 6);
}
export const stripTags = (text) => String(text || "").replace(/\[(FACTS|QUESTIONS|CARDS|REVISE)\]\s*/gi, "");

/** Steps to offer: the analysis's own, or (older analyses) one of each kind. */
export const stepsOf = (a) => { const s = parseSteps(a?.analysis?.text); return s.length ? s : ["facts", "questions", "cards", "revise"].map((kind) => ({ kind, text: "" })); };

/** The part of the analysis card with a "Do it" button for each step. */
export function stepsBlock(a) {
  const steps = stepsOf(a);
  const wrongN = a.answers.filter((r) => r.graded && !r.isCorrect).length;
  return html`<div class="ns-block"><h3>🤖 ${t("ns.title")}</h3><p class="hint">${t("ns.hint")}</p>
    <div class="rows">${steps.map((s, i) => (s.kind === "revise" && !wrongN ? "" : html`<button type="button" class="row ns-row" data-action="ns-do" data-i="${i}">
      <span class="row-main"><span class="row-title">${ICON[s.kind]} ${t(`ns.kind.${s.kind}`)}</span>${s.text ? html`<span class="row-sub clamp">${s.text}</span>` : ""}</span><span class="chev-txt">›</span></button>`))}</div></div>`;
}

/** What the AI is told about the test: its weak topics (keys T1…) and the missed questions. */
export function contextOf(a, { questionOf = (id) => store.question(id), topicOf = (id) => store.topic(id), subjectOf = (id) => store.subject(id) } = {}) {
  const wrong = a.answers.filter((r) => r.graded && !r.isCorrect).map((r) => ({ r, q: questionOf(r.questionId) })).filter((x) => x.q);
  const pool = wrong.length ? wrong : a.answers.map((r) => ({ r, q: questionOf(r.questionId) })).filter((x) => x.q);
  const count = new Map(); pool.forEach(({ q }) => count.set(q.topicId, (count.get(q.topicId) || 0) + 1));
  const topics = [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([id], i) => {
    const tp = topicOf(id);
    return { key: `T${i + 1}`, topicId: id, subjectId: tp?.subjectId || null, path: `${subjectOf(tp?.subjectId)?.name || "?"} › ${tp?.name || "?"}` };
  });
  const keyOf = new Map(topics.map((x) => [x.topicId, x.key]));
  const missed = wrong.slice(0, 25).map(({ q, r }) => `- [${keyOf.get(q.topicId) || "?"}] ${String(q.text).replace(/\s+/g, " ").slice(0, 200)} → right answer: ${q.options[r.correct ?? q.answerIndex] ?? "?"}${r.selected === null || r.selected === undefined ? " (left blank)" : ""}`);
  return { topics, missed };
}

const langOf = async () => (await presets.getConfig()).lang || "en";
const jsonLang = (user, lang) => (lang === "ml" ? `${user}\n\nLANGUAGE: write the text in Malayalam (keep names, Acts and years accurate). Keep the JSON keys in English.\n${P.ML_GUIDE}` : user);

/** One item's source: kept only when it is one of the pages actually found (or, without that list, as given). */
function itemSource(url, found) {
  if (!url || !/^https?:\/\//.test(String(url))) return null;
  const domain = domainOf(url);
  if (!found.length) return { url: String(url).slice(0, 500), domain, trust: trustOf(domain) };
  // With Google's list, the link kept is the page Google actually found on that site (the AI's own link could be made up).
  const hit = found.find((s) => s.domain === domain);
  return hit ? { url: hit.url, domain, trust: hit.trust } : null;
}

/** Does one next step (from the result screen). */
export async function runStep(a, step) {
  if (!a || !step) return;
  if (step.kind === "revise") return revise(a);
  if (!(await ensureAi())) return;
  const ctx = contextOf(a);
  const title = `${ICON[step.kind]} ${t(`ns.kind.${step.kind}`)}`;
  const head = html`<h2>${title}</h2>${step.text ? html`<p class="hint">${step.text}</p>` : ""}`;
  const wp = await webPreset();

  const start = async (web) => {
    const control = aiControl(() => paintWaiting(box, control));
    const box = openSheet(html`${head}${web ? html`<p class="hint center">🌐 ${t("ns.searchingWeb")}</p>` : ""}${waitingBox()}`, {
      skip: () => control.skip(), stop: () => { control.cancel(); closeSheet(); } }, { label: title });
    watchWaiting(box, () => control);
    const lang = await langOf();
    const n = step.kind === "questions" ? 10 : 12;
    const task = step.kind === "facts" ? P.inLang(P.factSheetTask({ step: step.text, ...ctx, web }), lang)
      : jsonLang((step.kind === "questions" ? P.webQuestionsTask : P.webCardsTask)({ step: step.text, ...ctx, n, web }), lang);
    const system = step.kind === "facts" ? P.tutorSystem(lang, `${P.SECTIONED} ${web ? P.WEB_RULES : ""}`) : `${step.kind === "questions" ? P.GENERATE_SYSTEM : "You make revision flashcards for Kerala PSC exams. Output ONLY a JSON array."} ${web ? P.WEB_RULES : ""}`.trim();
    const max = lang === "en" ? 4000 : 8000;
    let r;
    try {
      if (web) r = await askWeb(system, task, max, { control });
      else { const x = await ask(system, task, max, { control }); r = { text: x.text, sources: [], by: x.preset?.model || x.preset?.name || "", preset: x.preset }; }
    } catch (e) {
      if (!isSheetOpen() || e.cancelled || !box.isConnected) return;
      if (e.noWeb) return noWebSheet();
      // A failed web search can still be done from the AI's own knowledge (normal answers have their own limits).
      openSheet(html`${head}${web && e.limit ? html`<p class="hint">${t("ns.webLimit")}</p>` : ""}<p class="warn-box pre">${errorText(e)}</p><div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
        ${web ? html`<button type="button" class="btn btn-quiet" data-action="own">${t("ns.useOwn")}</button>` : ""}
        <button type="button" class="btn" data-action="again">${t("ai.tryAgain")}</button></div>`, { close: () => closeSheet(), again: () => start(web), own: () => start(false) }, { label: title });
      return;
    }
    if (!isSheetOpen() || !box.isConnected) return;
    r.web = web;
    r.fref = answerRef(FLAG_KIND[step.kind] || "answer");
    if (step.kind === "facts") return showFacts(r);
    let raw = [];
    try { raw = parseJsonLoose(r.text); } catch { raw = []; }
    if (!Array.isArray(raw)) raw = raw?.questions || raw?.cards || [];
    if (step.kind === "questions") return reviewQuestions(r, raw);
    return reviewCards(r, raw);
  };

  const noWebSheet = () => openSheet(html`${head}<p class="warn-box">${t("ns.noWeb")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      <button type="button" class="btn" data-action="own">${t("ns.useOwn")}</button></div>`, { close: () => closeSheet(), own: () => start(false) }, { label: title });

  const madeLine = (r) => html`<p class="made-with">🤖 ${r.by}${r.web ? ` · 🌐 ${t("ns.fromWeb")}` : ` · ⚠ ${t("ns.notWeb")}`} ${flagChip({ ref: r.fref, by: r.by, kind: FLAG_KIND[step.kind], presetId: r.preset?.id || "" })}</p>`;
  const topicFor = (key) => ctx.topics.find((x) => x.key === key) || ctx.topics[0];

  function showFacts(r) {
    const body = dropPreamble(r.text);
    let saved = false;
    const draw = () => {
      openSheet(html`${head}${madeLine(r)}<div class="ai-answer">${aiText(body)}</div>${sourcesList(r.sources)}
        <p class="hint">${t("ai.verify")}</p>
        <div class="sheet-actions sticky-in"><button type="button" class="btn btn-quiet" data-action="close">${t("common.done")}</button>
          <button type="button" class="btn" data-action="save" ${saved ? "disabled" : ""}>${saved ? "✓ " : ""}${t("ns.saveNote")}</button></div>`, {
        close: () => closeSheet(),
        save: async () => {
          if (saved) return;
          const date = new Date().toLocaleDateString(dateLocale());
          const src = r.sources.length ? `\n\n${t("ns.sourcesHead")}\n${r.sources.map((s) => `- ${s.title || s.domain} — ${s.url} (${s.trust === "trusted" ? "✓" : s.trust === "fair" ? "≈" : "⚠"})`).join("\n")}` : `\n\n⚠ ${t("ns.notWeb")}`;
          const text = `📄 ${t("ns.factSheet")} — ${date} · 🤖 ${r.by}${step.text ? `\n${step.text}` : ""}\n\n${body}${src}`;
          await store.quietly(() => mut.appendNote({ type: "test", id: a.id }, a.scope?.label || t("test.title"), text));
          const id = `note:test:${a.id}`;
          const note = store.all("notes").find((x) => x.target?.type === "test" && x.target.id === a.id);
          if (note) await store.quietly(() => mut.setNoteExtras(note.id || id, { syllabusId: a.syllabusId, ai: true }));
          store.touch();
          saved = true; toast(t("ns.savedNote")); draw();
        }
      }, { label: title });
      typesetMath(document.querySelector("#sheetRoot .sheet-body"));
    };
    draw();
  }

  async function reviewQuestions(r, raw) {
    const items = raw.map((x) => {
      const c = P.cleanGenerated([x])[0];
      if (!c) return null;
      const tp = topicFor(String(x.topic || ""));
      const src = itemSource(x.source, r.web ? r.sources : []);
      return { ...c, topicId: tp?.topicId, subjectId: tp?.subjectId, src };
    }).filter((x) => x && x.topicId).slice(0, 15);
    if (!items.length) return emptySheet();
    openSheet(html`${head}<p class="sheet-status">${t("ns.checking")}</p>`, {}, { label: title });
    let checkedBy = "";
    try { const c = await ask(P.GENERAL_CHECK_SYSTEM, P.generalCheckTask(items), 400 + items.length * 40); applyAnswerCheck(items, parseJsonLoose(c.text)); checkedBy = c.preset?.model || c.preset?.name || ""; }
    catch { items.forEach((x) => { x.check = "none"; }); }
    if (!isSheetOpen()) return;
    const keep = new Set(items.map((x, i) => (x.check === "disagree" || x.check === "unclear" ? -1 : i)).filter((i) => i >= 0));
    let savedQs = null;
    const draw = () => {
      openSheet(html`${head}${madeLine(r)}${checkedBy ? html`<p class="hint">✓ ${t("ai.checkedByList", { list: checkedBy })}</p>` : ""}
        <p class="hint">${t("ns.reviewHint")}</p>
        ${items.map((x, i) => html`<article class="qcard ns-item ${keep.has(i) ? "" : "off"}"><label class="switch-row"><input type="checkbox" data-i="${i}" ${keep.has(i) ? "checked" : ""} ${savedQs ? "disabled" : ""}><span>${t("ai.genQ", { n: i + 1 })}</span></label>
          <div class="qtext">${richText(x.text)}</div><ol class="options">${x.options.map((o, j) => html`<li class="${j === x.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === x.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>
          ${x.check === "agree" ? html`<span class="badge ok">✓ ${t("pdf.checkAgree")}</span>` : x.check === "disagree" ? html`<span class="badge bad">⚠ ${t("pdf.checkDisagree", { letter: letterFor(x.checkAnswer) })}</span>` : x.check === "unclear" ? html`<span class="badge warn">⚠ ${t("ai.checkNotSure")}</span>` : ""}
          ${x.explanation ? html`<p class="hint">${x.explanation}</p>` : ""}${x.src ? html`<p class="hint">${sourceChip(x.src)}</p>` : ""}
          <p class="hint">${store.topic(x.topicId)?.name || ""}</p></article>`)}
        ${sourcesList(r.sources)}
        <div class="sheet-actions sticky-in">${savedQs ? html`<button type="button" class="btn btn-quiet" data-action="close">${t("common.done")}</button>
            <button type="button" class="btn" data-action="practise">▶ ${t("ns.practise", { n: savedQs.length })}</button>`
          : html`<button type="button" class="btn btn-quiet" data-action="close">${t("ai.discard")}</button>
            <button type="button" class="btn" data-action="save" ${keep.size ? "" : "disabled"}>${t("ai.saveN", { n: keep.size })}</button>`}</div>`, {
        close: () => closeSheet(),
        save: async () => {
          const syl = store.syllabi().find((s) => s.id === a.syllabusId) || store.currentSyllabus();
          const chosen = items.filter((_, i) => keep.has(i));
          const groups = new Map(); chosen.forEach((x) => { const k = x.topicId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
          savedQs = [];
          for (const [topicId, list] of groups) {
            const subjectId = list[0].subjectId;
            const out = await store.quietly(() => mut.saveAiQuestions(syl, subjectId, topicId, list.map((x) => ({
              ...x, sourceRef: x.src ? { web: [x.src] } : (r.web && r.sources.length ? { web: r.sources.slice(0, 3).map(({ url, domain, trust }) => ({ url, domain, trust })) } : null),
              aiModel: { by: r.by, ...(checkedBy ? { checkedBy } : {}), ...(r.web ? { web: true } : {}) }
            }))));
            savedQs.push(...out);
          }
          store.touch();
          toast(t("ai.savedN", { n: savedQs.length }));
          draw();
        },
        practise: () => { closeSheet(); setTimeout(() => openStartTest({ scope: { type: "ai", ref: a.id, label: t("ns.practiseLabel", { label: a.scope?.label || "" }) }, questions: savedQs, keepOrder: false }), 60); }
      }, { label: title });
      document.querySelectorAll("#sheetRoot input[data-i]").forEach((c) => c.addEventListener("change", () => { const i = Number(c.dataset.i); if (c.checked) keep.add(i); else keep.delete(i); draw(); }));
      typesetMath(document.querySelector("#sheetRoot .sheet-body"));
    };
    draw();
  }

  function reviewCards(r, raw) {
    const items = raw.filter((x) => x && String(x.front || "").trim() && String(x.back || "").trim()).map((x) => {
      const tp = topicFor(String(x.topic || ""));
      return { front: String(x.front).trim().slice(0, 300), back: String(x.back).trim().slice(0, 400), topicId: tp?.topicId, subjectId: tp?.subjectId, src: itemSource(x.source, r.web ? r.sources : []) };
    }).filter((x) => x.topicId).slice(0, 20);
    if (!items.length) return emptySheet();
    const keep = new Set(items.map((_, i) => i));
    let saved = false;
    const draw = () => {
      openSheet(html`${head}${madeLine(r)}<p class="hint">${t("ns.reviewCards")}</p>
        ${items.map((x, i) => html`<article class="qcard ns-item ${keep.has(i) ? "" : "off"}"><label class="switch-row"><input type="checkbox" data-i="${i}" ${keep.has(i) ? "checked" : ""} ${saved ? "disabled" : ""}><span><strong>${x.front}</strong></span></label>
          <p>${x.back}</p>${x.src ? html`<p class="hint">${sourceChip(x.src)}</p>` : ""}<p class="hint">${store.topic(x.topicId)?.name || ""}</p></article>`)}
        ${sourcesList(r.sources)}
        <div class="sheet-actions sticky-in"><button type="button" class="btn btn-quiet" data-action="close">${saved ? t("common.done") : t("ai.discard")}</button>
          ${saved ? "" : html`<button type="button" class="btn" data-action="save" ${keep.size ? "" : "disabled"}>${t("ai.saveN", { n: keep.size })}</button>`}</div>`, {
        close: () => closeSheet(),
        save: async () => {
          const chosen = items.filter((_, i) => keep.has(i));
          const groups = new Map(); chosen.forEach((x) => { if (!groups.has(x.topicId)) groups.set(x.topicId, []); groups.get(x.topicId).push(x); });
          for (const [topicId, list] of groups) {
            await store.quietly(() => mut.saveCards(a.syllabusId, list[0].subjectId, topicId, list.map((x) => ({ front: x.front, back: x.back,
              sourceRef: x.src ? { web: [x.src] } : null, aiModel: { by: r.by, ...(r.web ? { web: true } : {}) } })), "ai"));
          }
          store.touch();
          saved = true; toast(t("ns.savedCards", { n: chosen.length })); draw();
        }
      }, { label: title });
      document.querySelectorAll("#sheetRoot input[data-i]").forEach((c) => c.addEventListener("change", () => { const i = Number(c.dataset.i); if (c.checked) keep.add(i); else keep.delete(i); draw(); }));
    };
    draw();
  }

  function emptySheet() {
    openSheet(html`${head}<p class="warn-box">${t("ai.err.noQuestions")}</p><div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button>
      <button type="button" class="btn" data-action="again">${t("ai.tryAgain")}</button></div>`, { close: () => closeSheet(), again: () => start(Boolean(wp)) }, { label: title });
  }

  if (wp) start(true); else noWebSheet();
}

/** [REVISE]: the wrong and blank questions of this test again (no AI). */
async function revise(a) {
  if (tests.activeTest()) return openStartTest();
  const ids = a.answers.filter((r) => r.graded && !r.isCorrect).map((r) => r.questionId);
  if (!ids.length) return;
  await tests.retake(a, { onlyIds: ids, label: t("results.wrongLabel", { label: a.scope?.label || "" }) });
  go("test");
}
