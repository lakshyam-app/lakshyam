/* 1.26 · Papers for another phone: save a file with your question papers (nothing personal) and add such a
   file on another phone. See data/share.js for what is and isn't in the file. */
import { html } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { openSheet, updateSheet, closeSheet, sheetBody, setSheetDismissible } from "../../core/sheet.js";
import { pickJsonFile } from "../../core/files.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import { takeSnapshot, logImport } from "../../data/snapshots.js";
import { makePapersPack, readPapersPack, planPapersAdd, thisPhone, addPapers, isPapersPack } from "../../data/share.js";

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** The block in Settings → Backup & data. */
export function shareBlock() {
  return html`<div class="group" data-set="sharePapers">
    <h3>📦 ${t("share.title")}</h3>
    <p class="hint">${t("share.hint")}</p>
    <div class="actions-row">${store.isEmpty() ? "" : html`<button type="button" class="btn btn-quiet" data-action="share-papers">📤 ${t("share.export")}</button>`}
      <button type="button" class="btn btn-quiet" data-action="add-papers">📥 ${t("share.import")}</button></div>
  </div>`;
}

export const shareHandlers = {
  "share-papers": () => exportSheet(),
  "add-papers": () => importFlow()
};

function exportSheet() {
  const syllabi = store.syllabi();
  const cur = store.currentSyllabus()?.id;
  const count = (id) => store.papersOf(id).length;
  openSheet(html`<h2>📤 ${t("share.export")}</h2>
    <p class="hint">${t("share.exportHint")}</p>
    <div class="rows">${syllabi.map((s) => html`<label class="row check"><input type="checkbox" data-syl="${s.id}" ${s.id === cur ? "checked" : ""}>
      <span class="row-main"><span class="row-title">${s.name}</span><span class="row-sub">${t("common.papers", { n: count(s.id) })}</span></span></label>`)}</div>
    <p class="hint">🔒 ${t("share.notIn")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="save">${t("share.save")}</button></div>`, {
    close: () => closeSheet(),
    save: async () => {
      const ids = [...sheetBody().querySelectorAll("[data-syl]:checked")].map((x) => x.dataset.syl);
      if (!ids.length) { toast(t("share.pickOne")); return; }
      const pack = makePapersPack(ids);
      const name = `lakshyam-papers-${stamp()}.json`;
      const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
      const file = typeof File === "function" ? new File([blob], name, { type: "application/json" }) : null;
      const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
      updateSheet(html`<h2>📤 ${t("share.ready")}</h2>
        <p>${t("share.readyBody", { papers: formatNumber(pack.counts.papers), questions: formatNumber(pack.counts.questions) })}</p>
        <p class="hint">${t("share.readyHint")}</p>
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="download">⬇ ${t("share.download")}</button>
          ${canShare ? html`<button type="button" class="btn" data-action="send">${t("share.send")}</button>` : ""}</div>`, {
        download: () => { download(blob, name); toast(t("share.saved")); closeSheet(); },
        send: async () => { try { await navigator.share({ files: [file], title: t("share.title") }); closeSheet(); } catch (e) { if (e?.name !== "AbortError") { download(blob, name); toast(t("share.saved")); } } }
      });
    }
  }, { label: t("share.export") });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function importFlow() {
  const file = await pickJsonFile();
  if (!file) return;
  openSheet(html`<p class="sheet-status">${t("import.checking")}</p>`, {}, { label: t("share.import") });
  if (file.error) return message(file.error === "not-json" ? t("import.notJson") : t("import.readFailed"));
  if (!isPapersPack(file.json)) return message(t("share.notPapers"));
  reviewPapersPack(file);
}

function message(text) {
  updateSheet(html`<p>${text}</p><div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
}

/** Also used when a shared-papers file is picked from Import / Restore. */
export function reviewPapersPack(file) {
  const read = readPapersPack(file.json);
  if (!read.ok) return message(t("share.notPapers"));
  const plan = planPapersAdd(read.data, thisPhone());
  const a = plan.add;
  updateSheet(html`<h2>📥 ${t("share.import")}</h2>
    <p class="hint">${file.name || ""}</p>
    ${read.damaged ? html`<p class="warn-box">${t("import.restoreDamaged")}</p>` : ""}
    <table class="counts"><tbody>
      <tr><th scope="row">${t("share.newPapers")}</th><td>${formatNumber(a.papers.length)}</td></tr>
      <tr><th scope="row">${t("share.newQuestions")}</th><td>${formatNumber(a.questions.length)}</td></tr>
      ${a.syllabi.length ? html`<tr><th scope="row">${t("share.newSyllabi")}</th><td>${formatNumber(a.syllabi.length)}</td></tr>` : ""}
      ${a.subjects.length + a.topics.length ? html`<tr><th scope="row">${t("share.newTopics")}</th><td>${formatNumber(a.subjects.length + a.topics.length)}</td></tr>` : ""}
      ${plan.already.papers ? html`<tr><th scope="row">${t("share.already")}</th><td>${formatNumber(plan.already.papers)}</td></tr>` : ""}
    </tbody></table>
    <p class="hint">${t("share.addHint")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      ${a.papers.length ? html`<button type="button" class="btn" data-action="add">${t("share.add", { n: a.papers.length })}</button>` : ""}</div>`, {
    close: () => closeSheet(),
    add: async () => {
      setSheetDismissible(false);
      updateSheet(html`<p class="sheet-status">${t("import.working")}</p>`);
      try {
        await takeSnapshot("add-papers");
        await addPapers(plan);
        if (!store.currentSyllabus() && store.syllabi().length) await store.setSetting("currentSyllabusId", a.papers[0].syllabusId);
        await logImport({ kind: "papers", fileName: file.name || "", mode: "add", counts: { papers: a.papers.length, questions: a.questions.length }, verified: true });
      } catch (e) {
        setSheetDismissible(true);
        return message(t("import.failedBody", { error: String(e?.message || e) }));
      }
      setSheetDismissible(true);
      closeSheet();
      toast(t("share.added", { n: a.papers.length }));
      store.touch();
    }
  });
}
