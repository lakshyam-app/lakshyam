/* Subject and topic names in the language you chose
   (⚙ → Display → Subject & topic names: English · മലയാളം · Both).
   English stays the real name: matching, sorting, AI prompts, test labels and
   backups always use it. Malayalam is an optional extra (nameMl, nameMlStatus). */
import { html } from "./dom.js";
import { can } from "./entitlements.js";
import * as store from "../data/store.js";

export const NAME_MODES = ["en", "ml", "both"];

/** "en" | "ml" | "both" (always "en" while the feature is switched off). */
export function nameMode() {
  if (!can("malayalamNames")) return "en";
  const m = store.setting("nameLang", "en");
  return NAME_MODES.includes(m) ? m : "en";
}

const ml = (rec) => String(rec?.nameMl || "").trim();

/** One-line plain text (sheet titles, chips, "Subject › Topic" lines).
    In "Both" mode one-liners stay English to save space. */
export function label(rec) {
  if (!rec) return "";
  return nameMode() === "ml" && ml(rec) ? ml(rec) : rec.name;
}

/** Markup for titles and list rows. Both: English, then Malayalam below in a smaller font.
    Malayalam only: falls back to English in grey when there is no Malayalam name. */
export function nameHtml(rec) {
  if (!rec) return "";
  const mode = nameMode();
  if (mode === "en") return rec.name;
  if (mode === "ml") return ml(rec) ? html`<span lang="ml">${ml(rec)}</span>` : html`<span class="name-missing">${rec.name}</span>`;
  return ml(rec) ? html`<span class="nm2"><span class="nm-en">${rec.name}</span><span class="nm-ml" lang="ml">${ml(rec)}</span></span>` : rec.name;
}

export const subjectLabel = (id) => label(store.subject(id));
export const topicLabel = (id) => label(store.topic(id));
/** "Subject › Topic" in the chosen language. */
export function pathLabel(topicOrId) {
  const tp = typeof topicOrId === "string" ? store.topic(topicOrId) : topicOrId;
  if (!tp) return "";
  return [subjectLabel(tp.subjectId), label(tp)].filter(Boolean).join(" › ");
}

/** True if the search text matches the English or the Malayalam name. */
export function nameMatches(rec, term) {
  if (!term) return true;
  const q = String(term).toLowerCase().normalize("NFC");
  return String(rec?.name || "").toLowerCase().includes(q) || ml(rec).normalize("NFC").includes(q);
}

