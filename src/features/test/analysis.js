/* 🤖 AI analysis of one finished test: written automatically after a test (Settings → AI can turn that off)
   or on request, and kept with the test (attempt.analysis = { text, by, at, lang }), so it is in backups.
   The figures are worked out in code; the AI only explains them. */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { can } from "../../core/entitlements.js";
import { confirmAction, runFlow } from "../../core/dialogs.js";
import { aiText } from "../../domain/text.js";
import { analysisInput } from "../../domain/test-analysis.js";
import { stepsBlock, stepsOf, stripTags, runStep } from "./next-steps.js";
import { maxScore } from "../../domain/testing.js";
import * as store from "../../data/store.js";
import * as presets from "../../ai/presets.js";
import { ask } from "../../ai/client.js";
import * as P from "../../ai/prompts.js";
import { errorText } from "../ai/ai-ui.js";
import { flagChip } from "../ai/flag-ui.js";

const MIN_ANSWERS = 3;   // a 1–2 question test (e.g. from a reminder) isn't worth an analysis
const running = new Map(); // attempt id → { error } while writing (error set if it failed)
const hiddenIds = new Set(); // tests whose analysis you folded away (while the app is open)

export const autoAnalysisOn = () => store.setting("aiAutoAnalysis", true) !== false;
export const analysisState = (id) => running.get(id) || null;
export const canAnalyse = (a) => (a?.answers || []).filter((r) => r.graded).length >= MIN_ANSWERS;

function earlierTries(a) {
  return store.all("attempts")
    .filter((x) => x.id !== a.id && x.status === "submitted" && x.submittedAt < a.submittedAt && x.syllabusId === a.syllabusId
      && x.scope?.type === a.scope?.type && (x.scope?.ref ?? x.scope?.label) === (a.scope?.ref ?? a.scope?.label))
    .sort((x, y) => y.submittedAt - x.submittedAt).slice(0, 3)
    .map((x) => ({ date: new Date(x.submittedAt).toISOString().slice(0, 10), score: x.netScore, max: maxScore(x.counts, x.marking) }));
}

/** Right after a test: once per test (clearing it later doesn't start it again). */
const autoTried = new Set();
export function autoAnalyse(a) {
  if (!a || autoTried.has(a.id)) return;
  autoTried.add(a.id);
  if (autoAnalysisOn() && !a.analysis && !analysisState(a.id) && canAnalyse(a)) makeAnalysis(a, { quiet: true });
}

/** Writes (or writes again) the analysis and keeps it with the test. quiet: no setup prompt (automatic run). */
export async function makeAnalysis(attempt, { quiet = false } = {}) {
  if (!attempt || running.has(attempt.id) && !running.get(attempt.id).error) return;
  if (!can("ai") || !(await presets.hasPreset())) { if (!quiet) toast(t("ai.err.noPreset")); return; }
  running.set(attempt.id, {});
  changed(attempt.id);
  try {
    const lang = (await presets.getConfig()).lang || "en";
    const topicName = (id) => store.topic(id)?.name || "";
    const { facts, lines } = analysisInput(attempt, { questionOf: (id) => store.question(id), topicOf: topicName, earlier: earlierTries(attempt) });
    const { text, preset } = await ask(P.tutorSystem(lang, P.SECTIONED), P.inLang(P.testAnalysisTask(facts, lines), lang), lang === "en" ? 2600 : 5500);
    const fresh = store.byId("attempts", attempt.id);
    if (fresh) await store.quietly(() => store.apply({ attempts: { put: [{ ...fresh, analysis: { text: text.trim().slice(0, 12000), by: preset?.model || preset?.name || "", at: Date.now(), lang } }] } }));
    running.delete(attempt.id);
  } catch (e) {
    running.set(attempt.id, { error: errorText(e) });
  }
  changed(attempt.id);
}

/* The result screen redraws only its analysis part when this changes (not the whole list you are reading). */
export const ANALYSIS_EVENT = "lakshyam-analysis";
const changed = (id) => window.dispatchEvent(new CustomEvent(ANALYSIS_EVENT, { detail: id }));

/** The analysis part of a result screen (and what its buttons do). */
export async function analysisBlock(a) {
  const st = analysisState(a.id);
  if (st && !st.error) return html`<section class="analysis-card"><h2 class="section-title">🤖 ${t("analysis.title")}</h2><p class="sheet-status">${t("analysis.writing")}</p></section>`;
  if (a.analysis?.text) {
    const an = a.analysis;
    const shut = hiddenIds.has(a.id);
    // One button folds the whole block (analysis and next steps) away, so the questions below are easy to read.
    return html`<section class="analysis-card${shut ? " is-shut" : ""}" data-an-card>
      <div class="an-head"><h2 class="section-title">🤖 ${t("analysis.title")}</h2>
        <button type="button" class="an-toggle" data-action="an-toggle" aria-expanded="${String(!shut)}">${shut ? `▼ ${t("analysis.show")}` : `▲ ${t("analysis.hide")}`}</button></div>
      <div class="an-body" ${shut ? "hidden" : ""}>
      <div class="ai-answer">${aiText(stripTags(an.text))}</div>
      <p class="hint made-by">${[an.by ? `🤖 ${an.by}` : "", new Date(an.at).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · ")} · ${t("ai.verify")} ${an.by ? flagChip({ ref: `an:${a.id}:${an.at}`, by: an.by, kind: "analysis" }) : ""}</p>
      ${st?.error ? html`<p class="warn-box pre">${st.error}</p>` : ""}
      <div class="row-actions">
        <button type="button" class="link" data-action="an-copy">${t("question.copy")}</button>
        ${can("ai") ? html`<button type="button" class="link" data-action="an-make">${t("analysis.again")}</button>` : ""}
        <button type="button" class="link danger" data-action="an-clear">${t("common.clear")}</button>
      </div>${can("ai") ? stepsBlock(a) : ""}
      <button type="button" class="btn btn-quiet wide an-fold" data-action="an-toggle" data-from="end">▲ ${t("analysis.hideToQs")}</button></div></section>`;
  }
  if (!can("ai") || !canAnalyse(a)) return "";
  return html`<section class="analysis-card"><h2 class="section-title">🤖 ${t("analysis.title")}</h2>
    ${st?.error ? html`<p class="warn-box pre">${st.error}</p>` : html`<p class="hint">${t("analysis.hint")}</p>`}
    <div class="actions-row"><button type="button" class="btn btn-quiet" data-action="an-make">${st?.error ? t("ai.tryAgain") : t("analysis.make")}</button></div></section>`;
}

export function analysisHandlers(id) {
  const att = () => store.byId("attempts", id);
  return {
    "an-make": () => makeAnalysis(att()),
    "an-toggle": (el) => {
      const card = el.closest("[data-an-card]");
      if (!card) return;
      const shut = !hiddenIds.has(id);
      if (shut) hiddenIds.add(id); else hiddenIds.delete(id);
      card.classList.toggle("is-shut", shut);
      card.querySelector(".an-body").hidden = shut;
      const b = card.querySelector(".an-head .an-toggle");
      b.textContent = shut ? `▼ ${t("analysis.show")}` : `▲ ${t("analysis.hide")}`;
      b.setAttribute("aria-expanded", String(!shut));
      // Folded from the bottom of a long analysis: keep the questions in view (they now start just below).
      if (shut && el.dataset.from === "end") card.scrollIntoView({ block: "start", behavior: "instant" });
    },
    "ns-do": (el) => { const a = att(); runStep(a, stepsOf(a)[Number(el.dataset.i)]); },
    "an-copy": async () => { try { await navigator.clipboard.writeText(stripTags(att()?.analysis?.text || "")); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    "an-clear": () => runFlow(async () => {
      const a = att();
      if (!a?.analysis || !(await confirmAction({ title: t("analysis.clearTitle"), confirmLabel: t("common.clear"), danger: true }))) return;
      const prev = a.analysis;
      const { analysis, ...rest } = a;
      await store.apply({ attempts: { put: [rest] } });
      toast(t("analysis.cleared"), { actionLabel: t("common.undo"), duration: 8000, onAction: () => { const b = att(); if (b) store.apply({ attempts: { put: [{ ...b, analysis: prev }] } }); } });
    })
  };
}
