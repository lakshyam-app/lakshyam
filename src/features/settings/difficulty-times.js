/* Settings → Display → automatic difficulty times.
   Change the seconds that decide Easy / Medium / Hard after a test, see what
   re-marking your past tests would change, then choose: past tests too, or only
   future tests. Your own choices and paper difficulties are never changed. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { validThresholds, AUTO_DIFF_DEFAULT } from "../../domain/testing.js";
import * as tests from "../../data/tests.js";

export function autoTimesLine() {
  const th = tests.autoTimes();
  return t("diffTimes.line", { m: th.medium, h: th.hard });
}

export function openAutoTimes() {
  const cur = tests.autoTimes();
  const th = { ...cur };
  const scale = () => html`<span class="chip-E">${t("question.difficulty.E")} &lt; ${th.medium}s</span>
        <span class="chip-M">${th.medium}–${th.hard}s</span>
        <span class="chip-D">${t("question.difficulty.D")} &gt; ${th.hard}s</span>`;
  const step = (k, d) => { th[k] = Math.max(5, Math.min(600, th[k] + d)); draw(); };
  const draw = () => {
    const ok = validThresholds(th);
    const changed = th.medium !== cur.medium || th.hard !== cur.hard;
    const stepper = (k) => html`<div class="stepper">
      <button type="button" class="icon-sm" data-action="step" data-k="${k}" data-d="-5" aria-label="−5">−5</button>
      <button type="button" class="icon-sm" data-action="step" data-k="${k}" data-d="-1" aria-label="−1">−</button>
      <input class="field" type="number" inputmode="numeric" min="5" max="600" value="${th[k]}" data-k="${k}" aria-label="${t(`diffTimes.${k}`)}">
      <button type="button" class="icon-sm" data-action="step" data-k="${k}" data-d="1" aria-label="+1">+</button>
      <button type="button" class="icon-sm" data-action="step" data-k="${k}" data-d="5" aria-label="+5">+5</button></div>`;
    openSheet(html`<h2>${t("diffTimes.title")}</h2>
      <p class="hint">${t("diffTimes.hint")}</p>
      <h3>${t("diffTimes.medium")}</h3>${stepper("medium")}
      <h3>${t("diffTimes.hard")}</h3>${stepper("hard")}
      <div class="diff-scale" aria-hidden="true">${scale()}</div>
      <p class="warn-box" id="dtWarn" ${ok ? "hidden" : ""}>${t("diffTimes.invalid")}</p>
      <button type="button" class="link" data-action="reset">${t("diffTimes.reset", { m: AUTO_DIFF_DEFAULT.medium, h: AUTO_DIFF_DEFAULT.hard })}</button>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="next" ${ok && changed ? "" : "disabled"}>${t("common.save")}</button></div>`, {
      step: (el) => step(el.dataset.k, Number(el.dataset.d)),
      reset: () => { Object.assign(th, AUTO_DIFF_DEFAULT); draw(); },
      close: () => closeSheet(),
      next: () => ask()
    }, { label: t("diffTimes.title") });
    // Typing only updates the numbers; the sheet is redrawn by the buttons (a redraw on "change"
    // would replace the sheet while you tap Save).
    sheetBody().querySelectorAll("input[data-k]").forEach((inp) => inp.addEventListener("input", () => {
      th[inp.dataset.k] = Math.round(Number(inp.value) || 0);
      const ok = validThresholds(th);
      const body = sheetBody();
      body.querySelector('[data-action="next"]').disabled = !ok || (th.medium === cur.medium && th.hard === cur.hard);
      body.querySelector(".diff-scale").innerHTML = String(scale());
      body.querySelector("#dtWarn").hidden = ok;
    }));
  };
  const ask = () => {
    const { changes, summary } = tests.previewAutoDifficulty(th);
    const name = (l) => t(`question.difficulty.${l}`);
    const rows = Object.entries(summary).filter(([k, n]) => k !== "filled" && n).map(([k, n]) => { const [a, b] = k.split(">"); return html`<tr><th>${name(a)} → ${name(b)}</th><td>${n}</td></tr>`; });
    openSheet(html`<h2>${t("diffTimes.pastTitle")}</h2>
      <p>${changes.length ? t("diffTimes.pastBody", { n: changes.length }) : t("diffTimes.pastNone")}</p>
      ${changes.length ? html`<table class="report"><tbody>${rows}${summary.filled ? html`<tr><th>${t("diffTimes.filled")}</th><td>${summary.filled}</td></tr>` : ""}</tbody></table>` : ""}
      <p class="hint">${t("diffTimes.safe")}</p>
      <div class="sheet-actions stack">
        <button type="button" class="btn btn-quiet" data-action="future">${t("diffTimes.onlyFuture")}</button>
        ${changes.length ? html`<button type="button" class="btn" data-action="past">${t("diffTimes.applyPast", { n: changes.length })}</button>` : ""}</div>`, {
      future: async () => { await tests.saveAutoTimes(th); closeSheet(); toast(t("diffTimes.saved")); },
      past: async () => {
        const undo = await tests.saveAutoTimes(th, { past: true });
        closeSheet();
        toast(t("diffTimes.applied", { n: changes.length }), { actionLabel: t("common.undo"), onAction: undo, duration: 8000 });
      }
    }, { label: t("diffTimes.pastTitle") });
  };
  draw();
}
