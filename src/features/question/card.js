/* One question card, shared by Library, banks, search (and later tests/results).
   mode: "study"   – correct answer shown, explanation one tap away
         "selftest"– answer hidden; tap an option (or "Show answer") to check yourself
         "edit"    – tap an option to set the correct answer (tap again to clear) */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { richText, smartText, aiText, letterFor, textSig } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { formatDuration } from "../../domain/testing.js";
import { can } from "../../core/entitlements.js";

const star = (on) => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="${on ? "filled" : ""}"><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>`;
const dots = html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>`;

/** The difficulty that counts: yours if set, otherwise the one in the paper file. */
export function difficultyOf(q) {
  return store.questionState(q.id)?.difficulty || q.difficultyHint || null;
}

/** review: an answer record from a finished test ({ selected, correct, isCorrect, graded, guessed, timeMs }).
    listNo: the card's place in the list shown (1, 2, 3…). actions: false for a read-only look (no buttons). */
export function questionCard(q, { showPaper = true, mode = "study", revealed = null, showDifficulty = true, review = null, n = null, listNo = null, actions = true } = {}) {
  if (review) mode = "review";
  const paper = store.paper(q.paperId);
  const state = store.questionState(q.id);
  const deleted = q.status === "deleted_by_psc";
  const flagged = Boolean(state?.flagged);
  const diff = showDifficulty ? difficultyOf(q) : null;
  // AI questions: where they came from (a study PDF and page) instead of their internal number.
  const isAi = q.source === "ai";
  const ref = isAi && q.sourceRef?.quote ? q.sourceRef : null;
  const aiWhere = isAi ? (q.sourceRef?.pdf ? `📄 ${String(q.sourceRef.pdf).replace(/\.pdf$/i, "")}${q.sourceRef.page ? ` · ${t("question.pageShort", { n: q.sourceRef.page })}` : ""}` : `🤖 ${q.aiModel?.by || t("ai.madeLabel")}`) : null;
  // Which model wrote (and double-checked) it, when that was recorded (1.14+).
  const byLine = isAi && q.aiModel?.by ? `🤖 ${q.aiModel.by}${q.aiModel.checkedBy ? ` · ${t("ai.checkedByList", { list: q.aiModel.checkedBy })}` : ""}` : "";
  // AI help you kept with this question (1.15+): which model wrote the saved explanation (while it is still
  // that text — an edit later drops the label), its Related facts, and your chat about it.
  const ai = state?.ai || {};
  const explBy = ai.explainBy?.model && ai.explainBy.sig === textSig(q.explanation) ? ai.explainBy.model : "";
  // Numbers on the header line (next to the buttons); the paper and its post on their own full-width line below.
  const meta = [
    listNo !== null ? `#${listNo}` : null,
    n !== null ? t("question.inTest", { n }) : null,
    isAi ? aiWhere : q.number ? (n !== null ? t("question.paperNumber", { n: q.number }) : t("question.number", { n: q.number })) : null
  ].filter(Boolean);
  const paperLine = [showPaper && paper && !isAi ? paper.name : null, showPaper && !isAi && paper?.postName ? paper.postName : null].filter(Boolean).join(" · ");
  // A PDF question's explanation ends with its source line; that part is shown on its own ("Source line").
  let explain = q.explanation || "";
  if (ref && explain.endsWith(`“${ref.quote}”`)) {
    const at = explain.lastIndexOf("📄 ", explain.length - ref.quote.length - 2);
    if (at === 0) explain = "";
    else if (at > 0 && explain[at - 1] === "\n") explain = explain.slice(0, at).trim();
  }
  // In self-test the answer shows only after you pick an option or tap "Show answer".
  const hidden = mode === "selftest" && revealed === null;
  const picked = mode === "selftest" && typeof revealed === "number" ? revealed : null;

  const option = (opt, i) => {
    let right = !deleted && q.answerIndex === i && !hidden;
    let wrongPick = picked === i && !right;
    if (review) {
      right = review.graded && review.correct === i;
      wrongPick = review.graded && review.selected === i && !review.isCorrect;
    }
    const cls = [right ? "right" : "", wrongPick ? "wrong" : "", mode !== "study" ? "tappable" : ""].join(" ");
    const inner = html`<span class="opt-letter">${letterFor(i)}</span>
      <span class="opt-text">${richText(opt)}</span>
      ${right ? html`<span class="tick" aria-label="${t("question.correct")}">✓</span>` : ""}
      ${wrongPick ? html`<span class="cross" aria-label="${t("question.yourPick")}">✗</span>` : ""}`;
    return mode === "study" || mode === "review"
      ? html`<li class="${cls}">${inner}</li>`
      : html`<li class="${cls}"><button type="button" class="opt-btn" data-action="q-option" data-i="${i}">${inner}</button></li>`;
  };

  return html`<article class="qcard ${deleted ? "is-deleted" : ""} ${mode === "edit" ? "is-editing" : ""}" data-qid="${q.id}" lang="${q.lang === "ml" ? "ml" : "en"}">
    <header class="qcard-meta">
      <span class="qcard-where">${meta.join(" · ")}</span>
      ${actions ? html`<span class="qcard-badges">
        ${diff ? html`<button type="button" class="chip chip-${diff}" data-action="q-diff">${t(`question.difficulty.${diff}`)}</button>` : ""}
        <button type="button" class="icon-sm ${flagged ? "on" : ""}" data-action="q-flag" aria-pressed="${String(flagged)}"
          aria-label="${flagged ? t("question.unflag") : t("question.flag")}">${star(flagged)}</button>
        <button type="button" class="icon-sm" data-action="q-menu" aria-label="${t("question.more")}">${dots}</button>
      </span>` : ""}
    </header>
    ${paperLine ? html`<p class="qcard-paper">${paperLine}</p>` : ""}
    ${review ? reviewLine(review) : ""}
    ${deleted && !review ? html`<p class="qcard-note">${t("question.deleted")}</p>` : ""}
    <div class="qtext">${richText(q.text)}</div>
    <ol class="options">${q.options.map(option)}</ol>
    ${mode === "edit" ? html`<p class="qcard-note quiet">${t("question.editHint")}</p>` : ""}
    ${review && review.graded && q.answerIndex !== review.correct ? html`<p class="qcard-note quiet">${t("review.keyChanged")}</p>` : ""}
    ${!review && !deleted && q.answerIndex === null && !hidden ? html`<p class="qcard-note quiet">${t("question.noAnswer")}</p>` : ""}
    ${hidden ? html`<button type="button" class="link" data-action="q-reveal">${t("question.showAnswer")}</button>` : ""}
    ${explain && !hidden ? html`<details class="explain" data-k="expl"><summary>${t("question.explanation")}</summary>
      <div class="qtext ai-answer plain">${smartText(explain)}</div>
      ${explBy || actions ? html`<div class="extra-foot">${explBy ? html`<span class="hint made-by">🤖 ${explBy}</span>` : ""}
        ${actions ? html`<button type="button" class="link danger" data-action="q-clear-expl">${t("question.clearExplanation")}</button>` : ""}</div>` : ""}</details>` : ""}
    ${ref && !hidden ? html`<details class="explain source-line" data-k="src"><summary>📄 ${t("question.sourceLine")}</summary>
      <p class="quote">${ref.quote}</p>${ref.pdf ? html`<p class="hint">${String(ref.pdf).replace(/\.pdf$/i, "")}${ref.page ? ` · ${t("question.pageShort", { n: ref.page })}` : ""}</p>` : ""}${byLine ? html`<p class="hint made-by">${byLine}</p>` : ""}</details>` : ""}
    ${!hidden ? aiExtras(ai, actions) : ""}
    ${actions && can("ai") && store.setting("aiOnCards", true) !== false && !hidden && mode !== "edit" ? aiRow(review) : ""}
  </article>`;
}

const when = (at) => (at ? new Date(at).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }) : "");

/** What AI wrote for this question and you kept, each in its own place: Related facts and your chat. */
function aiExtras(ai, actions) {
  const facts = ai.facts?.text ? ai.facts : null;
  const chat = Array.isArray(ai.chat) ? ai.chat : [];
  return html`${facts ? html`<details class="explain ai-extra" data-k="facts"><summary>📚 ${t("ai.facts")}</summary>
      <div class="ai-answer">${aiText(facts.text, { sections: false })}</div>
      <div class="extra-foot"><span class="hint made-by">${[facts.by ? `🤖 ${facts.by}` : "", when(facts.at)].filter(Boolean).join(" · ")}</span>
        ${actions ? html`<button type="button" class="link danger" data-action="q-clear-facts">${t("ai.clearFacts")}</button>` : ""}</div></details>` : ""}
    ${chat.length ? html`<details class="explain ai-extra" data-k="chat"><summary>💬 ${t("ai.chatSaved", { n: chat.filter((m) => m.role === "user").length })}</summary>
      <div class="chat-log">${chat.map((m) => html`<div class="chat-msg ${m.role === "user" ? "me" : "ai"}">${m.role === "user"
        ? html`<p>${m.text}</p>` : html`<div class="ai-answer">${aiText(m.text, { sections: false })}</div>${m.by ? html`<p class="hint made-by">🤖 ${m.by}</p>` : ""}`}</div>`)}</div>
      ${actions ? html`<div class="extra-foot"><button type="button" class="link" data-action="q-ai" data-mode="chat">💬 ${t("ai.chatContinue")}</button></div>` : ""}</details>` : ""}`;
}

/** AI help right on the card: Explain (or "Why was I wrong?" after a wrong answer), Related facts, Ask AI, Similar questions. */
function aiRow(review) {
  const wrong = review && review.graded && !review.isCorrect && review.selected !== null && review.selected !== undefined;
  return html`<div class="ai-row">
    <button type="button" class="ai-chip" data-action="q-ai" data-mode="explain">🤖 ${wrong ? t("ai.explainMistakeShort") : t("ai.explainShort")}</button>
    <button type="button" class="ai-chip" data-action="q-ai" data-mode="facts">📚 ${t("ai.factsShort")}</button>
    <button type="button" class="ai-chip" data-action="q-ai" data-mode="chat">💬 ${t("ai.chatShort")}</button>
    <button type="button" class="ai-chip quiet" data-action="q-ai" data-mode="similar">✨ ${t("ai.similarShort")}</button></div>`;
}

function reviewLine(r) {
  const state = !r.graded ? "ungraded" : r.selected === null ? "blank" : r.isCorrect ? "right" : "wrong";
  return html`<p class="result-line ${state}">
    <span>${t(`review.${state}`)}</span>
    ${r.guessed ? html`<span class="tag">🤔 ${t("review.guess")}</span>` : ""}
    ${r.timeMs ? html`<span class="tag">⏱ ${formatDuration(r.timeMs)}</span>` : ""}
  </p>`;
}
