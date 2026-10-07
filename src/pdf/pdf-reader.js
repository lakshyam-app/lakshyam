/* Reads PDFs in the browser with pdf.js (Mozilla, Apache-2.0), kept in this app's
   own vendor/pdfjs folder — no outside download. Loaded only when you first use
   Study PDFs; the service worker keeps a copy after that for offline use. */
import { classifyPage } from "./pdf-tools.js";

const LIB = "vendor/pdfjs/pdf.min.js";
const WORKER = "vendor/pdfjs/pdf.worker.min.js";
let loading = null;

export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIB;
    s.onload = () => {
      if (!window.pdfjsLib) { loading = null; reject(new Error("pdf-reader-failed")); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => { loading = null; s.remove(); reject(new Error("pdf-reader-missing")); };
    document.head.appendChild(s);
  });
  return loading;
}

async function openDoc(data) {
  const lib = await loadPdfJs();
  // isEvalSupported: false — never run generated code (also required by this app's security policy).
  return lib.getDocument({ data, isEvalSupported: false }).promise;
}

/** Text of every page, classified: [{ t, src }]. onProgress(i, total). */
export async function extractPdfText(blob, onProgress) {
  const doc = await openDoc(new Uint8Array(await blob.arrayBuffer()));
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let s = "";
      for (const it of tc.items) { s += it.str; if (it.hasEOL) s += "\n"; }
      pages.push(classifyPage(s));
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
  } finally { try { await doc.destroy(); } catch { /* ignore */ } }
  return pages;
}

/** Opens a stored PDF for drawing pages (call .destroy() when done). */
export const openStoredPdf = async (rec) => openDoc(new Uint8Array(await rec.blob.arrayBuffer()));

/** Draws one page as a JPEG data: URL (about 1500 px wide) for AI reading or preview. */
export async function renderPageJpeg(doc, n, { width = 1500, quality = 0.72 } = {}) {
  const page = await doc.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2.2, width / v1.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", quality);
  page.cleanup(); canvas.width = canvas.height = 0;
  return url;
}
