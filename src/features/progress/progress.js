/* Progress: insights, drill-down and test history (from Phase 4). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";

export const progressScreen = {
  id: "progress",
  tab: 3,
  render(container) {
    container.innerHTML = html`<section class="empty">
      <h1>${t("progress.emptyTitle")}</h1>
      <p>${t("progress.emptyBody")}</p>
    </section>`;
  }
};
