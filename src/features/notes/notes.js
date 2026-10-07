/* Notes: every listing note in one place (from Phase 2). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";

export const notesScreen = {
  id: "notes",
  tab: 4,
  render(container) {
    container.innerHTML = html`<section class="empty">
      <h1>${t("notes.emptyTitle")}</h1>
      <p>${t("notes.emptyBody")}</p>
    </section>`;
  }
};
