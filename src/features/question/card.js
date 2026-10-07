/* One question card, shared by Library, banks, search (and later tests/results).
   mode: "study"   – correct answer shown, explanation one tap away
         "selftest"– answer hidden; tap an option (or "Show answer") to check yourself
         "edit"    – tap an option to set the correct answer (tap again to clear) */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { richText, letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { formatDuration } from "../../domain/testing.js";

const star = (on) => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="${on ? "filled" : ""}"><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>`;
const dots = html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>`;

/** The difficulty that counts: yours if set, otherwise the one in the paper file. */
export function difficultyOf(q) {
  return store.questionState(q.id)?.difficulty || q.difficultyHint || null;
}

/** review: an answer record from a finished test ({ selected, correct, isCorrect, graded, guessed, timeMs }). */
export function questionCard(q, { showPaper = true, mode = "study", revealed = null, showDifficulty = true, review = null, n = null } = {}) {
  if (review) mode = "review";
  const paper = store.paper(q.paperId);
  const state = store.questionState(q.id);
  const deleted = q.status === "deleted_by_psc";
  const flagged = Boolean(state?.flagged);
  const diff = showDifficulty ? difficultyOf(q) : null;
  const meta = [
    n !== null ? t("question.inTest", { n }) : null,
    q.number ? (n !== null ? t("question.paperNumber", { n: q.number }) : t("question.number", { n: q.number })) : null,
    showPaper && paper ? paper.name : null,
    showPaper && paper?.postName ? paper.postName : null
  ].filter(Boolean);
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
      <span class="qcard-badges">
        ${diff ? html`<button type="button" class="chip chip-${diff}" data-action="q-diff">${t(`question.difficulty.${diff}`)}</button>` : ""}
        <button type="button" class="icon-sm ${flagged ? "on" : ""}" data-action="q-flag" aria-pressed="${String(flagged)}"
          aria-label="${flagged ? t("question.unflag") : t("question.flag")}">${star(flagged)}</button>
        <button type="button" class="icon-sm" data-action="q-menu" aria-label="${t("question.more")}">${dots}</button>
      </span>
    </header>
    ${review ? reviewLine(review) : ""}
    ${deleted && !review ? html`<p class="qcard-note">${t("question.deleted")}</p>` : ""}
    <div class="qtext">${richText(q.text)}</div>
    <ol class="options">${q.options.map(option)}</ol>
    ${mode === "edit" ? html`<p class="qcard-note quiet">${t("question.editHint")}</p>` : ""}
    ${review && review.graded && q.answerIndex !== review.correct ? html`<p class="qcard-note quiet">${t("review.keyChanged")}</p>` : ""}
    ${!review && !deleted && q.answerIndex === null && !hidden ? html`<p class="qcard-note quiet">${t("question.noAnswer")}</p>` : ""}
    ${hidden ? html`<button type="button" class="link" data-action="q-reveal">${t("question.showAnswer")}</button>` : ""}
    ${q.explanation && !hidden ? html`<details class="explain"><summary>${t("question.explanation")}</summary>
      <div class="qtext">${richText(q.explanation)}</div></details>` : ""}
  </article>`;
}

function reviewLine(r) {
  const state = !r.graded ? "ungraded" : r.selected === null ? "blank" : r.isCorrect ? "right" : "wrong";
  return html`<p class="result-line ${state}">
    <span>${t(`review.${state}`)}</span>
    ${r.guessed ? html`<span class="tag">🤔 ${t("review.guess")}</span>` : ""}
    ${r.timeMs ? html`<span class="tag">⏱ ${formatDuration(r.timeMs)}</span>` : ""}
  </p>`;
}
