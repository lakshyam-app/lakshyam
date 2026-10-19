/* 1.26 · About: What's new (also offered once after each update), what leaves this phone, and credits. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { APP_VERSION } from "../../core/version.js";

/** Newest first. Each item is a string key under news.* (English and Malayalam). */
export const NEWS = [
  { v: "1.26", items: ["n126i", "n126a", "n126b", "n126c", "n126d", "n126e", "n126f", "n126g", "n126h", "n126j"] },
  { v: "1.25", items: ["n125a"] },
  { v: "1.24", items: ["n124a"] },
  { v: "1.23", items: ["n123a"] }
];

export const LEAVES = ["ai", "screen", "web", "drive", "reminders", "nothing"];

export function aboutBlocks() {
  const [latest, ...older] = NEWS;
  return html`<div class="group" data-set="whatsNew">
      <h3>🆕 ${t("about.newTitle", { v: latest.v })}</h3>
      <ul class="about-list">${latest.items.map((k) => html`<li>${t(`news.${k}`)}</li>`)}</ul>
      <details class="info"><summary>${t("about.earlier")}</summary>${older.map((x) => html`<p class="about-ver">${x.v}</p><ul class="about-list">${x.items.map((k) => html`<li>${t(`news.${k}`)}</li>`)}</ul>`)}</details>
    </div>
    <div class="group" data-set="privacy">
      <h3>🔒 ${t("about.leavesTitle")}</h3>
      <ul class="about-list">${LEAVES.map((k) => html`<li>${t(`about.leaves.${k}`)}</li>`)}</ul>
      <p class="hint">${t("about.backupsNote")}</p>
    </div>
    <div class="group" data-set="credits">
      <h3>${t("about.creditsTitle")}</h3>
      <p class="hint">${t("about.credits")}</p>
      <p class="hint">${t("about.versionLine", { version: APP_VERSION })}</p>
    </div>`;
}
