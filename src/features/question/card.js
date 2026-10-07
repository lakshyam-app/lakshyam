/* One question card, shared by Library, tests, results and search.
   Phase 1: read-only "Study view" (answer shown). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { richText, letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";

/** showPaper: add the paper name (useful when the list mixes papers). */
export function questionCard(q, { showPaper = true } = {}) {
  const paper = store.paper(q.paperId);
  const state = store.questionState(q.id);
  const deleted = q.status === "deleted_by_psc";
  const meta = [
    q.number ? t("question.number", { n: q.number }) : null,
    showPaper && paper ? paper.name : null,
    showPaper && paper?.postName ? paper.postName : null
  ].filter(Boolean);

  return html`<article class="qcard ${deleted ? "is-deleted" : ""}" lang="${q.lang === "ml" ? "ml" : "en"}">
    <header class="qcard-meta">
      <span>${meta.join(" · ")}</span>
      <span class="qcard-badges">
        ${state?.difficulty ? html`<span class="chip chip-${state.difficulty}">${t(`question.difficulty.${state.difficulty}`)}</span>` : ""}
        ${state?.flagged ? html`<span class="flag" title="${t("question.flagged")}" aria-label="${t("question.flagged")}">★</span>` : ""}
      </span>
    </header>
    ${deleted ? html`<p class="qcard-note">${t("question.deleted")}</p>` : ""}
    <div class="qtext">${richText(q.text)}</div>
    <ol class="options">${q.options.map((opt, i) => {
      const right = !deleted && q.answerIndex === i;
      return html`<li class="${right ? "right" : ""}">
        <span class="opt-letter">${letterFor(i)}</span>
        <span class="opt-text">${richText(opt)}</span>
        ${right ? html`<span class="tick" aria-label="correct">✓</span>` : ""}
      </li>`;
    })}</ol>
    ${!deleted && q.answerIndex === null ? html`<p class="qcard-note quiet">${t("question.noAnswer")}</p>` : ""}
    ${q.explanation ? html`<details class="explain"><summary>${t("question.explanation")}</summary>
      <div class="qtext">${richText(q.explanation)}</div></details>` : ""}
  </article>`;
}
