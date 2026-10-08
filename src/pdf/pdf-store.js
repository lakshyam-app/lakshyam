/* Your study PDFs: the file itself plus the text of each page.
   They live in the private "pdfs" store on this phone — never in backups. The file can be moved
   to your own Google Drive (see pdf-file.js); the page text always stays here. Never in backups
   or safety copies (they can be large). Questions, cards and notes made from a
   PDF are normal app data and are backed up as usual. */
import * as db from "../data/db.js";

export const MAX_PDF_MB = 80;
const listeners = new Set();

/** Lets a screen redraw when a PDF changes (e.g. a page was read by AI). */
export function onPdfChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = (id) => listeners.forEach((fn) => { try { fn(id); } catch { /* ignore */ } });

export function newPdfId() {
  return `pdf:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Every PDF (newest first). owner = { type: "topic" | "subject", id } narrows it to one listing. */
export async function listPdfs(owner = null) {
  const all = await db.getAll("pdfs");
  return all.filter((r) => !owner || (r.owner?.type === owner.type && r.owner?.id === owner.id)).sort((a, b) => b.addedAt - a.addedAt);
}
export const getPdf = (id) => db.get("pdfs", id);

export async function savePdf(rec) {
  rec.updatedAt = Date.now();
  await db.put("pdfs", rec);
  changed(rec.id);
  return rec;
}

/** Saves one page's text (keeps the rest of the record as stored). */
export async function savePage(id, n, page) {
  const rec = await getPdf(id);
  if (!rec || n < 1 || n > rec.pages.length) return null;
  rec.pages[n - 1] = page;
  return savePdf(rec);
}

export async function deletePdf(id) {
  await db.remove("pdfs", id);
  changed(id);
}

export const formatMB = (bytes) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`);
