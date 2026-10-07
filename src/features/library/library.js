/* Library: subjects, topics, papers and question banks (from Phase 1). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";

export const libraryScreen = {
  id: "library",
  tab: 2,
  render(container) {
    container.innerHTML = html`<section class="empty">
      <h1>${t("library.emptyTitle")}</h1>
      <p>${t("library.emptyBody")}</p>
    </section>`;
  }
};
