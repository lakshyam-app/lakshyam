/* Where a study PDF's FILE is: on this phone, in your Google Drive, or both.
   The page text always stays on the phone (AI questions, cards, notes, search and the notes
   check only need the text), so a PDF kept only in Drive works offline for everything except
   seeing the page pictures and AI-reading scanned pages.
   - Move to Drive: upload, then check Drive's copy is byte-for-byte the same (size + MD5) and
     only then remove the phone's copy. Your original file (wherever you picked it from) is
     never touched: the app only ever had its own copy.
   - Opening a Drive-only PDF downloads it for this session only (memory, not storage).
   - Uses Google sign-in (drive.file: only files this app made). The no-sign-in automatic
     backup can't be used for this: it is built to only add files, never send any back. */
import * as drive from "../cloud/drive.js";
import * as store from "../data/store.js";
import { getPdf, savePdf, listPdfs } from "./pdf-store.js";
import { md5Blob } from "./md5.js";

export class PdfFileError extends Error { constructor(kind) { super(kind); this.kind = kind; } }

const session = new Map(); // pdfId → Blob downloaded from Drive (this session only; at most 2 kept)
const remember = (id, blob) => { session.delete(id); session.set(id, blob); while (session.size > 2) session.delete(session.keys().next().value); };

export const onPhone = (rec) => Boolean(rec?.blob);
export const inDrive = (rec) => Boolean(rec?.drive?.fileId);
/** True when the file can be used right now without Drive (on the phone or already fetched). */
export const fileHere = (rec) => Boolean(rec?.blob || session.has(rec?.id));
export const needsSignIn = (rec) => !fileHere(rec) && inDrive(rec) && !drive.hasToken();

const hint = () => store.setting("drive", null)?.email || "";

/** Google sign-in if needed. Call at the start of a tap (Google needs that for its sign-in window). */
export async function ensureSignedIn(email = hint()) {
  if (!drive.hasToken()) await drive.signIn({ hint: email });
}

/** The PDF file: from the phone, from this session, or downloaded from Drive (checked). */
export async function pdfFile(rec, { onProgress } = {}) {
  if (rec.blob) return rec.blob;
  if (session.has(rec.id)) return session.get(rec.id);
  if (!inDrive(rec)) throw new PdfFileError("missing");
  await ensureSignedIn(rec.drive.email || hint());
  const blob = await drive.downloadFile(rec.drive.fileId, onProgress);
  if (rec.drive.size && blob.size !== Number(rec.drive.size)) throw new PdfFileError("mismatch");
  if (rec.drive.md5 && (await md5Blob(blob)) !== rec.drive.md5) throw new PdfFileError("mismatch");
  remember(rec.id, blob);
  return blob;
}

/**
 * Puts the PDF in Drive and frees the phone's copy. Safe order: upload → Drive confirms the
 * same size and MD5 → only then the phone's copy is removed. onStep({ phase, done, total }).
 * Returns the bytes freed.
 */
export async function moveToDrive(id, onStep = () => {}) {
  let rec = await getPdf(id);
  if (!rec) throw new PdfFileError("missing");
  if (!rec.blob) return 0; // already only in Drive
  await ensureSignedIn();
  const blob = rec.blob;
  onStep({ phase: "check", done: 0, total: blob.size });
  const md5 = await md5Blob(blob, (done, total) => onStep({ phase: "check", done, total }));
  // Already uploaded earlier (e.g. "Keep on phone again") and unchanged: no second upload.
  let file = inDrive(rec) && rec.drive.md5 === md5 ? { id: rec.drive.fileId, size: rec.drive.size, md5Checksum: rec.drive.md5 } : null;
  if (!file) {
    const folderId = await drive.pdfFolder();
    const props = { lakshyam: "pdf", pdfId: rec.id, owner: rec.owner ? `${rec.owner.type}:${rec.owner.id}` : "", pages: String(rec.pages?.length || 0) };
    file = await drive.uploadLarge(blob, {
      name: rec.name, parents: [folderId], mimeType: "application/pdf",
      appProperties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v).slice(0, 100)]))
    }, (done, total) => onStep({ phase: "upload", done, total }));
    if (Number(file.size) !== blob.size || (file.md5Checksum && file.md5Checksum !== md5)) {
      try { await drive.trashFile(file.id); } catch { /* left for you to remove */ }
      throw new PdfFileError("mismatch");
    }
  }
  let email = hint();
  if (!email) { try { email = (await drive.whoAmI()).email; } catch { /* fine */ } }
  rec = await getPdf(id); // fresh (page text may have changed meanwhile)
  if (!rec) return 0;
  rec.drive = { fileId: file.id, size: Number(file.size), md5, email, at: Date.now() };
  rec.size = blob.size;
  rec.blob = null;
  await savePdf(rec);
  remember(id, blob); // still usable this session without downloading again
  return blob.size;
}

/** Downloads the Drive copy and keeps it on this phone again (the Drive copy stays). */
export async function keepOnPhone(id, onStep = () => {}) {
  let rec = await getPdf(id);
  if (!rec || rec.blob) return;
  const blob = await pdfFile(rec, { onProgress: (done, total) => onStep({ phase: "download", done, total }) });
  rec = await getPdf(id);
  rec.blob = blob;
  await savePdf(rec);
}

/** Moves the Drive copy to the Drive Bin (when you delete the PDF in the app and choose so). */
export async function binDriveCopy(rec) {
  if (!inDrive(rec)) return;
  await ensureSignedIn(rec.drive.email || hint());
  await drive.trashFile(rec.drive.fileId);
}

/** How much space PDFs take on this phone, and how many are only in Drive. */
export async function pdfSpace() {
  const all = await listPdfs();
  const phone = all.filter((r) => r.blob);
  return {
    all: all.length,
    onPhone: phone.length,
    phoneBytes: phone.reduce((s, r) => s + (r.blob?.size || r.size || 0), 0),
    driveOnly: all.filter((r) => !r.blob && inDrive(r)).length
  };
}

/** Moves every PDF on this phone to Drive, one by one. onStep({ i, n, name, phase, done, total }). Stops on the first error. */
export async function moveAllToDrive(onStep = () => {}, isCancelled = () => false) {
  await ensureSignedIn();
  const list = (await listPdfs()).filter((r) => r.blob);
  let freed = 0; let moved = 0;
  for (let i = 0; i < list.length; i++) {
    if (isCancelled()) break;
    freed += await moveToDrive(list[i].id, (s) => onStep({ ...s, i: i + 1, n: list.length, name: list[i].name }));
    moved++;
  }
  return { moved, freed, total: list.length };
}

/** PDFs in your Drive that this phone doesn't have (e.g. after a new phone or a restore). */
export async function drivePdfsMissingHere() {
  await ensureSignedIn();
  const [files, local] = await Promise.all([drive.listPdfFiles(), listPdfs()]);
  const have = new Set(local.map((r) => r.id));
  return files.filter((f) => !have.has(f.appProperties?.pdfId));
}
