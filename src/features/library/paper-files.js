/* Adding a question paper, an answer key or explanations from JSON
   (a file, or text pasted from an AI chat). Nothing is saved until you
   have seen the report and tapped the button. */
import { html } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen } from "../../core/sheet.js";
import { pickTextFile } from "../../core/files.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { autoFix, parseJsonText, validatePaper } from "../../data/paper-json.js";
import { ids } from "../../data/ids.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { copyText } from "../../core/clipboard.js";
import { paperInstructions, answerKeyInstructions, explanationsInstructions } from "../../domain/ai-instructions.js";
import { FALLBACK_TOPIC } from "../../data/taxonomy-seed.js";

const n = (v) => formatNumber(v);

/** Your subjects and topics, in the app's order, for the AI instructions
    (subjects of this syllabus first, then every other subject). */
function myTaxonomy(syllabus) {
  const used = new Set(syllabus ? store.subjectsWithCounts(syllabus.id).map((x) => x.subject.id) : []);
  return store.all("subjects").slice().sort((a, b) => (used.has(b.id) - used.has(a.id)) || (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
    .map((s) => ({ subject: s.name, topics: store.topicsOf(s.id).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => x.name) }));
}

/** Step 1: file or paste. Resolves { raw, name } or null. */
function getJson({ title, hint, instructions = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const body = openSheet(html`<h2>${title}</h2>
      <p class="hint">${hint}</p>
      ${instructions ? html`<div class="ai-steps"><p class="hint">${t("addPaper.aiSteps")}</p>
        <button type="button" class="btn btn-quiet btn-small" data-action="copy-ai">📋 ${t("addPaper.copyAi")}</button></div>` : ""}
      <button type="button" class="btn" data-action="file">${t("addPaper.chooseFile")}</button>
      <p class="hint center">${t("addPaper.or")}</p>
      <textarea class="field mono" id="jsonPaste" rows="7" placeholder="${t("addPaper.pastePlaceholder")}"></textarea>
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="paste">${t("addPaper.check")}</button>
      </div>`, {
      file: async () => {
        const file = await pickTextFile();
        if (!file) return;
        if (file.error) { toast(t("import.readFailed")); return; }
        finish({ raw: file.text, name: file.name });
      },
      paste: () => {
        const raw = body.querySelector("#jsonPaste").value;
        if (!raw.trim()) { body.querySelector("#jsonPaste").focus(); return; }
        finish({ raw, name: t("addPaper.pasted") });
      },
      "copy-ai": () => copyText(instructions()),
      cancel: () => { finish(null); closeSheet(); }
    }, { label: title, onClose: () => finish(null) });
  });
}

/** Parse with auto-fix. Shows the error in the sheet and returns null if it can't be read. */
function readJson(input) {
  const first = parseJsonText(input.raw.trim());
  if (first.ok) return { json: first.json, fixes: [] };
  const { fixed, notes } = autoFix(input.raw);
  const second = parseJsonText(fixed);
  if (second.ok) return { json: second.json, fixes: notes };
  stopWith(t("addPaper.badJson"), html`<p class="examples mono">${second.near || second.error}</p>`);
  return null;
}

function stopWith(message, extra = "") {
  openSheet(html`<h2>${t("addPaper.cantUse")}</h2><p>${message}</p>${extra}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`,
  { close: () => closeSheet() });
}

const fixList = (fixes) => (fixes.length
  ? html`<p class="hint">${t("addPaper.fixed")}: ${fixes.map((f) => t(`addPaper.fix.${f}`)).join(", ")}</p>` : "");

/* ---------- paper ---------- */

/** bank: when given, the paper's questions go into that bank only (not shown under Papers). */
export async function addPaperFlow({ bank = null } = {}) {
  const syllabus = store.currentSyllabus();
  const input = await getJson({
    title: bank ? t("addPaper.bankTitle", { bank: bank.name }) : t("addPaper.title"),
    hint: bank ? t("addPaper.bankHint") : t("addPaper.hint", { syllabus: syllabus?.name || "" }),
    instructions: () => paperInstructions(myTaxonomy(syllabus), { fallback: FALLBACK_TOPIC })
  });
  if (!input) return;
  const read = readJson(input);
  if (!read) return;
  const errors = validatePaper(read.json);
  if (errors.length) {
    return stopWith(t("addPaper.invalid"), html`<ul class="issues">${errors.slice(0, 12).map((e) => html`<li>${t(`addPaper.err.${e.code}`, { n: e.n })}</li>`)}</ul>
      ${errors.length > 12 ? html`<p class="hint">${t("addPaper.moreErrors", { n: errors.length - 12 })}</p>` : ""}`);
  }
  const json = read.json;
  if (bank) {
    // Never merge a bank import into a Library paper that has the same ID.
    const clash = store.paper(ids.paper(String(json.paper.id)));
    if (clash && clash.kind !== "bank-import") json.paper.id = `bank-${bank.id.replace(/\W+/g, "")}-${json.paper.id}`;
  }
  const plan = mut.planPaper(json, syllabus?.id || null);
  const r = plan.report;
  const confirmed = await new Promise((resolve) => {
    openSheet(html`<h2>${plan.isUpdate ? t("addPaper.updateTitle") : t("addPaper.reviewTitle")}</h2>
      <p><strong>${plan.paper.name}</strong>${plan.paper.postName ? html` · ${plan.paper.postName}` : ""}</p>
      <p class="hint">${input.name}</p>
      ${fixList(read.fixes)}
      ${plan.isUpdate ? html`<p class="warn-box">${t("addPaper.updateNote")}</p>` : ""}
      <table class="counts"><tbody>
        <tr><th>${t("addPaper.rows.questions")}</th><td>${n(plan.questions.length)}</td></tr>
        ${plan.isUpdate ? html`
          <tr><th>${t("addPaper.rows.added")}</th><td>${n(r.added)}</td></tr>
          <tr><th>${t("addPaper.rows.updated")}</th><td>${n(r.updated)}</td></tr>
          <tr><th>${t("addPaper.rows.unchanged")}</th><td>${n(r.unchanged)}</td></tr>
          ${r.keptAnswers ? html`<tr><th>${t("addPaper.rows.keptAnswers")}</th><td>${n(r.keptAnswers)}</td></tr>` : ""}
          ${r.keptExplanations ? html`<tr><th>${t("addPaper.rows.keptExplanations")}</th><td>${n(r.keptExplanations)}</td></tr>` : ""}
          ${r.keptTopics ? html`<tr><th>${t("addPaper.rows.keptTopics")}</th><td>${n(r.keptTopics)}</td></tr>` : ""}
          ${r.notInFile ? html`<tr><th>${t("addPaper.rows.notInFile")}</th><td>${n(r.notInFile)}</td></tr>` : ""}` : ""}
        <tr><th>${t("addPaper.rows.deleted")}</th><td>${n(plan.questions.filter((q) => q.status === "deleted_by_psc").length)}</td></tr>
        <tr><th>${t("addPaper.rows.noAnswer")}</th><td>${n(plan.questions.filter((q) => q.status === "active" && q.answerIndex === null).length)}</td></tr>
        ${plan.created.subjects.length ? html`<tr><th>${t("addPaper.rows.newSubjects")}<span class="row-sub">${plan.created.subjects.map((s) => s.name).join(", ")}</span></th><td>${n(plan.created.subjects.length)}</td></tr>` : ""}
        ${plan.created.topics.length ? html`<tr><th>${t("addPaper.rows.newTopics")}<span class="row-sub">${plan.created.topics.slice(0, 12).map((x) => x.name).join(", ")}${plan.created.topics.length > 12 ? "…" : ""}</span></th><td>${n(plan.created.topics.length)}</td></tr>` : ""}
      </tbody></table>
      ${r.badAnswers ? html`<p class="warn-box">${t("addPaper.badAnswers", { n: r.badAnswers })}</p>` : ""}
      ${r.duplicates.length ? html`<details class="block"><summary>${t("addPaper.duplicates")} <span class="count">(${n(r.duplicates.length)})</span></summary>
        <p class="hint">${t("addPaper.duplicatesHint")}</p>
        <ul class="issues">${r.duplicates.slice(0, 30).map((d) => html`<li><p>${d.text}</p><p class="examples">${d.paper}</p></li>`)}</ul></details>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="ok">${plan.isUpdate ? t("addPaper.updateButton") : bank ? t("addPaper.addToBank") : t("addPaper.addButton")}</button>
      </div>`, { ok: () => resolve(true), cancel: () => resolve(false) }, { onClose: () => resolve(false) });
  });
  if (!confirmed) { if (isSheetOpen()) closeSheet(); return; }
  try {
    if (bank) await store.quietly(() => mut.importIntoBank(store.byId("sets", bank.id), plan));
    else await store.quietly(() => mut.savePaper(plan));
  } catch (error) {
    return stopWith(t("addPaper.saveFailed", { error: String(error?.message || error) }));
  }
  toast(bank ? t("banks.added", { n: plan.questions.length, bank: bank.name }) : plan.isUpdate ? t("addPaper.updated") : t("addPaper.added"));
  if (bank) go("bank", { id: bank.id });
  else go("paper", { id: plan.paper.id });
}

/* ---------- answer key and explanations ---------- */

export async function answerKeyFlow(paper, kind) {
  const isKey = kind === "key";
  const input = await getJson({
    title: isKey ? t("answerKey.title") : t("explanations.title"),
    hint: isKey ? t("answerKey.hint") : t("explanations.hint"),
    instructions: isKey ? answerKeyInstructions : explanationsInstructions
  });
  if (!input) return;
  const read = readJson(input);
  if (!read) return;
  const result = isKey ? mut.planAnswerKey(paper, read.json) : mut.planExplanations(paper, read.json);
  if (!result.ok) return stopWith(isKey ? t("answerKey.wrongFormat") : t("explanations.wrongFormat"));
  const before = result.updates.map((u) => store.question(u.id));
  const changed = result.updates.filter((u, i) => (isKey
    ? u.answerIndex !== before[i].answerIndex || u.status !== before[i].status
    : u.explanation !== (before[i].explanation || "")));
  const otherPaper = isKey && result.paperIdInFile && ids.paper(String(result.paperIdInFile)) !== paper.id;

  const ok = await new Promise((resolve) => {
    openSheet(html`<h2>${isKey ? t("answerKey.reviewTitle") : t("explanations.reviewTitle")}</h2>
      <p class="hint">${paper.name} · ${input.name}</p>
      ${fixList(read.fixes)}
      ${otherPaper ? html`<p class="warn-box">${t("answerKey.otherPaper", { id: result.paperIdInFile })}</p>` : ""}
      <table class="counts"><tbody>
        <tr><th>${t("answerKey.inFile")}</th><td>${n(result.total)}</td></tr>
        <tr><th>${t("answerKey.matched")}</th><td>${n(result.updates.length)}</td></tr>
        <tr><th>${t("answerKey.willChange")}</th><td>${n(changed.length)}</td></tr>
        ${isKey ? html`<tr><th>${t("answerKey.deleted")}</th><td>${n(result.updates.filter((u) => u.status === "deleted_by_psc").length)}</td></tr>` : ""}
      </tbody></table>
      ${result.unmatched.length ? html`<p class="warn-box">${t("answerKey.unmatched", { n: result.unmatched.length })}<span class="examples"> ${result.unmatched.slice(0, 20).join(", ")}</span></p>` : ""}
      ${result.unrecognized.length ? html`<p class="warn-box">${t("answerKey.unrecognized", { n: result.unrecognized.length })}<span class="examples"> ${result.unrecognized.slice(0, 20).join(", ")}</span></p>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="ok" ${changed.length ? "" : "disabled"}>${t("answerKey.apply", { n: changed.length })}</button>
      </div>`, { ok: () => resolve(true), cancel: () => resolve(false) }, { onClose: () => resolve(false) });
  });
  if (isSheetOpen()) closeSheet();
  if (!ok) return;
  const previous = changed.map((u) => store.question(u.id));
  await mut.saveQuestionUpdates(changed);
  toast(t("answerKey.done", { n: changed.length }), { actionLabel: t("common.undo"), onAction: () => mut.saveQuestionUpdates(previous), duration: 8000 });
}
