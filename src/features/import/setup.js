/* 1.26 · A phone with nothing on it yet (a new phone, a lost one, or the second user's): every way to start.
   Restore from Google Drive · restore or import a file (Lakshyam backup, PSC Exam Vault backup, or papers
   shared from another phone) · start fresh with a syllabus and your first paper. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { runFlow, askText } from "../../core/dialogs.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { startImport } from "./import-flow.js";
import { restoreFromDrive } from "../settings/drive.js";
import { addPaperFlow } from "../library/paper-files.js";

export function setupPanel() {
  const hasSyllabus = store.syllabi().length > 0;
  const chev = html`<span class="chev-txt">›</span>`;
  return html`<div class="panel setup-panel">
    <h2>${t("setup.title")}</h2>
    <p class="hint">${t("setup.hint")}</p>
    <div class="rows">
      <button type="button" class="row" data-action="setup-drive"><span class="row-main"><span class="row-title">☁ ${t("setup.drive")}</span><span class="row-sub">${t("setup.driveSub")}</span></span>${chev}</button>
      <button type="button" class="row" data-action="import"><span class="row-main"><span class="row-title">📄 ${t("setup.file")}</span><span class="row-sub">${t("setup.fileSub")}</span></span>${chev}</button>
      <button type="button" class="row" data-action="setup-fresh"><span class="row-main"><span class="row-title">✨ ${hasSyllabus ? t("setup.addPaper") : t("setup.fresh")}</span><span class="row-sub">${hasSyllabus ? t("setup.addPaperSub") : t("setup.freshSub")}</span></span>${chev}</button>
    </div>
    <p class="hint">${t("setup.oldApp")}</p>
  </div>`;
}

export const setupHandlers = {
  import: () => startImport(),
  "setup-drive": () => restoreFromDrive(),
  "setup-fresh": () => runFlow(async () => {
    if (!store.syllabi().length) {
      const name = await askText({ title: t("setup.nameTitle"), hint: t("setup.nameHint"), placeholder: t("setup.namePlaceholder"), confirmLabel: t("common.create") });
      if (!name) return;
      const syl = await mut.addSyllabus(name);
      await store.setSetting("currentSyllabusId", syl.id);
    }
    await addPaperFlow();
  })
};
