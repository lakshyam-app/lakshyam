/* Study PDFs in Google Drive — the screens:
   - on a PDF: where its file is (this phone / Drive / both) with Move to Drive, Free up space,
     Keep on phone again
   - Settings → Backup & data → Study PDFs: space used, "Move all to Google Drive", and
     "PDFs in your Drive" to add back ones this phone doesn't have (new phone, restore)
   Your original PDF file (where you picked it from) is never touched. */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet, isSheetOpen } from "../../core/sheet.js";
import { runFlow, chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as pdfStore from "../../pdf/pdf-store.js";
import * as PF from "../../pdf/pdf-file.js";
import { extractPdfText } from "../../pdf/pdf-reader.js";
import { errorText as driveErrorText } from "../settings/drive.js";

const mb = (bytes) => pdfStore.formatMB(bytes || 0);
const pct = (d, n) => (n ? Math.min(100, Math.round((100 * d) / n)) : 0);

export function cloudErrorText(e) {
  if (e instanceof PF.PdfFileError) return t(`pdfc.err.${e.kind}`);
  if (e?.kind === "gone") return t("pdfc.err.gone");
  if (e?.kind) return driveErrorText(e);
  return String(e?.message || e);
}

const stepText = (s) => (s.phase === "check" ? t("pdfc.checking", { p: pct(s.done, s.total) })
  : s.phase === "upload" ? t("pdfc.uploading", { p: pct(s.done, s.total), done: mb(s.done), total: mb(s.total) })
    : t("pdfc.downloading", { p: pct(s.done, s.total), done: mb(s.done), total: mb(s.total) }));

/* ---------- on one PDF ---------- */

export function storageBox(rec) {
  const phone = PF.onPhone(rec); const cloud = PF.inDrive(rec);
  const when = cloud ? new Date(rec.drive.at).toLocaleDateString(dateLocale()) : "";
  const line = phone && cloud ? t("pdfc.both", { size: mb(rec.size), date: when })
    : phone ? t("pdfc.phoneOnly", { size: mb(rec.size) })
      : cloud ? t("pdfc.driveOnly", { size: mb(rec.size), date: when })
        : t("pdfc.missing");
  return html`<div class="pdf-where ${cloud && !phone ? "is-cloud" : ""}" id="pdfWhere">
    <p>${cloud && !phone ? "☁️" : "📱"} ${line}</p>
    <div class="actions-row">
      ${phone && !cloud ? html`<button type="button" class="btn btn-quiet btn-small" data-action="pdf-to-drive">☁️ ${t("pdfc.move", { size: mb(rec.size) })}</button>` : ""}
      ${phone && cloud ? html`<button type="button" class="btn btn-quiet btn-small" data-action="pdf-to-drive">☁️ ${t("pdfc.free", { size: mb(rec.size) })}</button>` : ""}
      ${!phone && cloud ? html`<button type="button" class="btn btn-quiet btn-small" data-action="pdf-keep">📥 ${t("pdfc.keep")}</button>` : ""}
    </div>
    ${phone && !cloud ? html`<p class="hint">${t("pdfc.moveHint")}</p>` : ""}
    ${!phone && cloud ? html`<p class="hint">${t("pdfc.driveHint")}</p>` : ""}
    <p class="hint" id="pdfWhereStatus" aria-live="polite"></p>
  </div>`;
}

export function storageHandlers(container, rec, redraw) {
  const status = () => container.querySelector("#pdfWhereStatus");
  const say = (msg) => { const el = status(); if (el) el.textContent = msg; };
  const busy = (on) => container.querySelectorAll("#pdfWhere button").forEach((b) => { b.disabled = on; });
  return {
    "pdf-to-drive": async () => {
      busy(true);
      try {
        const freed = await PF.moveToDrive(rec.id, (s) => say(stepText(s)));
        toast(t("pdfc.moved", { size: mb(freed) }));
        redraw();
      } catch (e) { say(cloudErrorText(e)); busy(false); }
    },
    "pdf-keep": async () => {
      busy(true);
      try { await PF.keepOnPhone(rec.id, (s) => say(stepText(s))); toast(t("pdfc.kept")); redraw(); } catch (e) { say(cloudErrorText(e)); busy(false); }
    }
  };
}

/** Deleting a PDF that is in Drive: here only, or the Drive copy to the Bin too. Returns null (cancel) | "here" | "both". */
export async function deleteChoice(rec) {
  if (!PF.inDrive(rec)) {
    const ok = await confirmAction({ title: t("pdf.deleteTitle", { name: rec.name }), body: t("pdf.deleteBody"), confirmLabel: t("common.delete"), danger: true });
    return ok ? "here" : null;
  }
  const id = await chooseAction({ title: t("pdf.deleteTitle", { name: rec.name }), sub: t("pdfc.deleteSub"), items: [
    { id: "here", label: t("pdfc.deleteHere"), sub: PF.onPhone(rec) ? t("pdfc.deleteHereSub") : t("pdfc.deleteHereDriveOnly") },
    { id: "both", label: t("pdfc.deleteBoth"), sub: t("pdfc.deleteBothSub"), danger: true }
  ] });
  return id || null;
}

/** Opening the file when it is only in Drive and sign-in is needed: one tap. */
export const needsTap = (rec) => PF.needsSignIn(rec);

/* ---------- Settings → Backup & data ---------- */

export async function settingsBlock() {
  const s = await PF.pdfSpace();
  if (!s.all) return html`<h3>📄 ${t("pdfc.title")}</h3><p class="hint">${t("pdfc.none")}</p>
    <button type="button" class="link" data-action="pdfc-find">☁️ ${t("pdfc.find")}</button>`;
  return html`<h3>📄 ${t("pdfc.title")}</h3>
    <p>${s.onPhone ? t("pdfc.summary", { n: s.onPhone, size: mb(s.phoneBytes), cloud: s.driveOnly }) : t("pdfc.summaryNone", { cloud: s.driveOnly })}</p>
    ${s.onPhone ? html`<button type="button" class="btn btn-quiet" data-action="pdfc-all">☁️ ${t("pdfc.moveAll", { n: s.onPhone, size: mb(s.phoneBytes) })}</button>` : ""}
    <p class="hint">${t("pdfc.settingsHint")}</p>
    <button type="button" class="link" data-action="pdfc-find">☁️ ${t("pdfc.find")}</button>
    <p class="hint" id="pdfcStatus" aria-live="polite"></p>`;
}

export function settingsHandlers(container, refresh) {
  const say = (msg) => { const el = container.querySelector("#pdfcStatus"); if (el) el.textContent = msg; };
  return {
    "pdfc-all": async (el) => {
      const s = await PF.pdfSpace();
      if (!s.onPhone) return;
      const ok = await runFlow(() => confirmAction({ title: t("pdfc.moveAllTitle", { n: s.onPhone }), body: t("pdfc.moveAllBody", { size: mb(s.phoneBytes) }), confirmLabel: t("pdfc.moveAllGo") }));
      if (!ok) return;
      el.disabled = true;
      try {
        const r = await PF.moveAllToDrive((st) => say(`${st.i}/${st.n} · ${st.name} · ${stepText(st)}`));
        toast(t("pdfc.movedAll", { n: r.moved, size: mb(r.freed) }));
        refresh();
      } catch (e) { say(cloudErrorText(e)); el.disabled = false; refresh(true); }
    },
    "pdfc-find": () => findInDrive()
  };
}

/* ---------- PDFs in your Drive that this phone doesn't have ---------- */

async function findInDrive() {
  openSheet(html`<h2>☁️ ${t("pdfc.findTitle")}</h2><p class="sheet-status">${t("pdfc.looking")}</p>`, {}, { label: t("pdfc.findTitle") });
  let files;
  try { files = await PF.drivePdfsMissingHere(); } catch (e) {
    if (isSheetOpen()) openSheet(html`<h2>☁️ ${t("pdfc.findTitle")}</h2><p class="warn-box">${cloudErrorText(e)}</p>
      <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
    return;
  }
  if (!isSheetOpen()) return;
  const ownerOf = (f) => { const [type, id] = String(f.appProperties?.owner || "").split(/:(.+)/); return type === "topic" && store.topic(id) ? { type, id } : type === "subject" && store.subject(id) ? { type, id } : null; };
  const where = (o) => (o ? nameLabel(o.type === "topic" ? store.topic(o.id) : store.subject(o.id)) : t("pdfc.noTopic"));
  const draw = (msg = "") => openSheet(html`<h2>☁️ ${t("pdfc.findTitle")}</h2>
    <p class="hint">${files.length ? t("pdfc.findHint") : t("pdfc.findNone")}</p>
    ${files.length ? html`<div class="rows">${files.map((f) => html`<button type="button" class="row" data-action="add-back" data-id="${f.id}">
      <span class="row-main"><span class="row-title">📄 ${f.name}</span><span class="row-sub">${mb(Number(f.size))} · ${where(ownerOf(f))}</span></span><span class="chev-txt">${t("pdfc.addBack")}</span></button>`)}</div>` : ""}
    ${msg ? html`<p class="sheet-status">${msg}</p>` : ""}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    close: () => closeSheet(),
    "add-back": async (el) => {
      const f = files.find((x) => x.id === el.dataset.id);
      try {
        draw(t("pdfc.downloading", { p: 0, done: mb(0), total: mb(Number(f.size)) }));
        const rec = await addBack(f, ownerOf(f), (d, n) => { const st = document.querySelector(".sheet .sheet-status"); if (st) st.textContent = t("pdfc.downloading", { p: pct(d, n), done: mb(d), total: mb(n) }); });
        files = files.filter((x) => x.id !== f.id);
        toast(t("pdfc.addedBack", { name: rec.name }));
        draw();
      } catch (e) { draw(cloudErrorText(e)); }
    }
  }, { label: t("pdfc.findTitle") });
  draw();
}

/** Downloads a Drive PDF, reads its text and adds it back as a Drive-only PDF (same id, so its questions, cards and notes link up again). */
async function addBack(f, owner, onProgress) {
  const { downloadFile } = await import("../../cloud/drive.js");
  await PF.ensureSignedIn();
  const blob = await downloadFile(f.id, onProgress);
  const pages = await extractPdfText(blob);
  const id = f.appProperties?.pdfId || pdfStore.newPdfId();
  const { md5Blob } = await import("../../pdf/md5.js");
  const md5 = f.md5Checksum || await md5Blob(blob);
  const rec = { id, owner, syllabusId: store.currentSyllabus()?.id || null, name: f.name, size: blob.size, addedAt: Date.now(), pages, blob: null,
    drive: { fileId: f.id, size: blob.size, md5, email: store.setting("drive", null)?.email || "", at: Date.now() } };
  await pdfStore.savePdf(rec);
  return rec;
}

export const openPdf = (id) => go("pdf", { id });
