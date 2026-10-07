/* Import from PSC Exam Vault and restore of Lakshyam backups.
   Flow: pick file → check (nothing saved yet) → user reviews the report →
   safety copy → save in one transaction → read back and verify → result. */
import { html } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { openSheet, updateSheet, closeSheet, setSheetDismissible } from "../../core/sheet.js";
import { pickJsonFile } from "../../core/files.js";
import { toast } from "../../core/toast.js";
import { buildImportPlan } from "../../data/import-legacy.js";
import { isLakshyamBackup, readBackup, downloadBackup } from "../../data/backup.js";
import * as store from "../../data/store.js";
import { takeSnapshot, logImport } from "../../data/snapshots.js";

/** Entry point for every "Import…" / "Restore…" button. */
export async function startImport() {
  const file = await pickJsonFile();
  if (!file) return;
  openSheet(html`<p class="sheet-status">${t("import.checking")}</p>`, {}, { label: t("import.reviewTitle") });
  // Let the sheet paint before the (fast but synchronous) check runs.
  await new Promise((r) => setTimeout(r, 30));

  if (file.error) return showMessage(file.error === "not-json" ? t("import.notJson") : t("import.readFailed"));
  if (isLakshyamBackup(file.json)) return reviewRestore(file);

  const plan = buildImportPlan(file.json);
  if (!plan.ok) return showMessage(t("import.notBackup"));
  reviewLegacy(file, plan);
}

function showMessage(message) {
  updateSheet(html`<p>${message}</p>
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`,
  { close: () => closeSheet() });
}

/* ---------- review: PSC Exam Vault backup ---------- */

const n = (v) => formatNumber(v);

function row(label, value, sub = "") {
  return html`<tr><th scope="row">${label}${sub ? html`<span class="row-sub">${sub}</span>` : ""}</th><td>${n(value)}</td></tr>`;
}

function issueList(issues, dict) {
  return html`<ul class="issues">${issues.map((i) => html`<li>
    <p>${t(`import.${dict}.${i.code}`, { n: i.params?.n ?? i.count })}${i.count > 1 ? html` <span class="count">(${n(i.count)})</span>` : ""}</p>
    ${i.examples.length ? html`<p class="examples">${i.examples.join(" · ")}</p>` : ""}
  </li>`)}</ul>`;
}

function modeChoice() {
  if (store.isEmpty()) return "";
  return html`<fieldset class="choice">
    <legend>${t("import.modeTitle")}</legend>
    <label><input type="radio" name="mode" value="merge" checked>
      <span><strong>${t("import.modeMerge")}</strong><span class="row-sub">${t("import.modeMergeHint")}</span></span></label>
    <label><input type="radio" name="mode" value="replace">
      <span><strong>${t("import.modeReplace")}</strong><span class="row-sub">${t("import.modeReplaceHint")}</span></span></label>
    <p class="hint">${t("import.safetyNote")}</p>
  </fieldset>`;
}

function reviewLegacy(file, plan) {
  const { report } = plan;
  const s = report.source; const d = report.detail; const c = report.counts;
  const content = html`
    <h2>${t("import.reviewTitle")}</h2>
    <p class="hint">${t("import.fromFile", { file: file.name })}</p>

    <h3>${t("import.whatComes")}</h3>
    <table class="counts"><tbody>
      ${row(t("import.rows.syllabuses"), c.syllabi)}
      ${row(t("import.rows.papers"), c.papers)}
      ${row(t("import.rows.questions"), c.questions)}
      ${d.aiQuestions ? row(t("import.rows.aiQuestions"), d.aiQuestions) : ""}
      ${row(t("import.rows.deleted"), d.deletedByPsc)}
      ${row(t("import.rows.noAnswer"), d.noAnswerYet)}
      ${row(t("import.rows.explanations"), d.withExplanation)}
      ${row(t("import.rows.attempts"), c.attempts)}
      ${row(t("import.rows.studied"), c.topicState)}
      ${row(t("import.rows.labels"), s.labels, c.labels !== s.labels ? t("import.labelsPerSyllabus", { n: c.labels }) : "")}
      ${row(t("import.rows.lists"), c.topicLists)}
      ${row(t("import.rows.banks"), c.sets)}
      ${row(t("import.rows.notes"), c.notes)}
      ${s.flashcards ? row(t("import.rows.flashcards"), c.flashcards) : ""}
      ${row(t("import.rows.days"), c.activity)}
    </tbody></table>

    ${report.mergedNames.length ? html`<details class="block">
      <summary>${t("import.namesTitle")} <span class="count">(${n(report.mergedNames.length)})</span></summary>
      <p class="hint">${t("import.namesBody")}</p>
      <ul class="issues">${report.mergedNames.map((m) => html`<li><p>${m.from.join(", ")} → <strong>${m.into}</strong></p>
        ${m.subject ? html`<p class="examples">${m.subject}</p>` : ""}</li>`)}</ul>
    </details>` : ""}

    ${report.possibleDuplicates.length ? html`<details class="block">
      <summary>${t("import.dupTitle")} <span class="count">(${n(report.possibleDuplicates.length)})</span></summary>
      <p class="hint">${t("import.dupBody")}</p>
      <ul class="issues">${report.possibleDuplicates.map((p) => html`<li><p>${p.a} / ${p.b}</p>
        ${p.subject ? html`<p class="examples">${p.subject}</p>` : ""}</li>`)}</ul>
    </details>` : ""}

    ${report.warnings.length ? html`<details class="block" open>
      <summary>${t("import.warnTitle")} <span class="count">(${n(report.warnings.length)})</span></summary>
      ${issueList(report.warnings, "warn")}
    </details>` : ""}

    <details class="block" ${report.skipped.length ? "open" : ""}>
      <summary>${t("import.skipTitle")} <span class="count">(${n(report.skipped.reduce((x, i) => x + i.count, 0))})</span></summary>
      ${report.skipped.length ? issueList(report.skipped, "skip") : html`<p class="hint">${t("import.noneSkipped")}</p>`}
    </details>

    <details class="block">
      <summary>${t("import.notCarriedTitle")}</summary>
      <p class="hint">${t("import.notCarried")}</p>
    </details>

    ${modeChoice()}
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("import.importButton")}</button>
    </div>`;

  updateSheet(content, {
    cancel: () => closeSheet(),
    go: (_, event) => {
      const mode = selectedMode(event.target);
      commit({ kind: "legacy", fileName: file.name, mode, records: plan.records, expected: plan.records, checks: report.checks,
        summary: { warnings: report.warnings.length, skipped: report.skipped.length } });
    }
  });
}

function selectedMode(fromEl) {
  const checked = fromEl.closest(".sheet-body")?.querySelector('input[name="mode"]:checked');
  return store.isEmpty() ? "replace" : (checked?.value || "merge");
}

/* ---------- review: Lakshyam backup ---------- */

function reviewRestore(file) {
  const parsed = readBackup(file.json);
  if (!parsed.ok) return showMessage(parsed.error === "newer-version" ? t("import.restoreNewer") : t("import.notBackup"));
  const r = parsed.report; const c = r.counts;
  const when = r.exportedAt ? new Date(r.exportedAt).toLocaleString() : "?";
  updateSheet(html`
    <h2>${t("import.restoreTitle")}</h2>
    <p class="hint">${t("import.restoreFrom", { date: when })} · ${file.name}</p>
    ${!r.checksumOk || !r.countsMatch ? html`<p class="warn-box">${t("import.restoreDamaged")}</p>` : ""}
    ${r.skippedRecords ? html`<p class="warn-box">${t("import.restoreSkipped", { n: r.skippedRecords })}</p>` : ""}
    <table class="counts"><tbody>
      ${row(t("import.rows.syllabuses"), c.syllabi)}
      ${row(t("import.rows.papers"), c.papers)}
      ${row(t("import.rows.questions"), c.questions)}
      ${row(t("import.rows.attempts"), c.attempts)}
      ${row(t("import.rows.studied"), c.topicState)}
      ${row(t("import.rows.notes"), c.notes)}
      ${row(t("import.rows.banks"), c.sets)}
    </tbody></table>
    ${modeChoice()}
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("import.restoreButton")}</button>
    </div>`, {
    cancel: () => closeSheet(),
    go: (_, event) => {
      const mode = selectedMode(event.target);
      commit({ kind: "restore", fileName: file.name, mode, records: parsed.records, expected: parsed.records, checks: null, summary: {} });
    }
  });
}

/* ---------- save + verify ---------- */

async function commit({ kind, fileName, mode, records, expected, checks, summary }) {
  setSheetDismissible(false);
  updateSheet(html`<p class="sheet-status">${t("import.working")}</p>`);
  const expectedCounts = Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.length]));
  // On merge, settings already set by the user are kept, so they aren't counted.
  if (mode === "merge") delete expectedCounts.settings;

  let verification;
  try {
    await takeSnapshot(kind === "legacy" ? "import" : "restore");
    await store.commitRecords(records, mode);
    verification = await store.verifyAgainst(expectedCounts, mode, checks);
    await logImport({ kind, fileName, mode, counts: expectedCounts, verified: verification.ok, ...summary });
  } catch (error) {
    setSheetDismissible(true);
    return showMessage(t("import.failedBody", { error: String(error?.message || error) }));
  }
  setSheetDismissible(true);
  showResult(verification);
}

function showResult(verification) {
  const bad = verification.rows.filter((r) => !r.ok);
  updateSheet(html`
    <div class="result ${verification.ok ? "ok" : "bad"}">
      <h2>${verification.ok ? `✓ ${t("import.verifiedTitle")}` : t("import.problemTitle")}</h2>
      <p>${verification.ok ? t("import.verifiedBody") : t("import.problemBody")}</p>
    </div>
    <table class="counts"><tbody>
      ${(verification.ok ? verification.rows.filter((r) => r.found > 0 && r.name !== "questionsPerPaper") : bad).map((r) => html`<tr>
        <th scope="row">${t(`import.checkRow.${r.name}`)}</th>
        <td>${r.ok ? formatNumber(r.found) : `${formatNumber(r.found)} / ${formatNumber(r.expected)}`}</td></tr>`)}
    </tbody></table>
    <p class="hint">${t("import.backupHint")}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="done">${t("common.done")}</button>
      <button type="button" class="btn" data-action="backup">${t("import.backupNow")}</button>
    </div>`, {
    done: () => closeSheet(),
    backup: async () => {
      await store.setSetting("lastBackupAt", Date.now());
      downloadBackup();
      toast(t("settings.backupSaved"));
      closeSheet();
    }
  });
}
