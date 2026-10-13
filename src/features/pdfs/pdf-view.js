/* #/pdf-view?id=…&n=… : read a study PDF's real pages, scrolling down like a book.
   Pages are drawn only when they come near the screen and let go again when far away, so a long
   PDF doesn't fill the phone's memory. Zoom with the − / + buttons (or pinch). The file comes from
   the phone, or from your Google Drive when it lives there (this session only). Nothing is changed. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go, goBack } from "../../core/router.js";
import { backFrom } from "../../core/back.js";
import * as pdfStore from "../../pdf/pdf-store.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import { openStoredPdf } from "../../pdf/pdf-reader.js";
import { pdfFile, needsSignIn, ensureSignedIn } from "../../pdf/pdf-file.js";
import { cloudErrorText } from "./pdf-cloud.js";

/* Screens a viewer opened from elsewhere goes back to (else the PDF's own screen). */
const BACK_TO = ["insight-topic", "topic", "subject", "search", "notes", "pdf", "result"];
const ZOOMS = [1, 1.5, 2, 3];
const KEEP_NEAR = 4; // pages kept drawn on each side of the one you are reading

export const pdfViewScreen = {
  id: "pdf-view",
  parent: "library",
  render(container, params) {
    const state = { doc: null, gone: false, undo: [], on: {} };
    // One listener for the whole screen; each step swaps in its own buttons (two listeners would run ‹ twice).
    onAction(container, new Proxy({}, { get: (_, k) => state.on[k], has: (_, k) => k in state.on }));
    container.innerHTML = html`<p class="sheet-status pad">${t("pdf.loading")}</p>`;
    pdfStore.getPdf(params.id).then((rec) => {
      if (!container.isConnected || state.gone) return;
      if (!rec) { go("pdfs"); return; }
      open(container, rec, params, state);
    });
    return () => {
      state.gone = true;
      state.undo.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
      try { state.doc?.destroy(); } catch { /* ignore */ }
      state.doc = null;
    };
  }
};

function head(rec, back) {
  return html`<header class="screen-head pv-head"><div class="head-bar"><button type="button" class="back" data-action="back">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${back.label}</span></button></div>
    <h1 class="pv-title">${rec.name}</h1></header>`;
}

async function open(container, rec, params, state) {
  const b = backFrom(params, BACK_TO, "pdf");
  const labelFor = (to, p) => (to === "insight-topic" ? t("insights.title") : to === "topic" ? nameLabel(store.topic(p.id)) || t("common.back")
    : to === "subject" ? nameLabel(store.subject(p.id)) || t("common.back") : to === "search" ? t("search.title") : t("common.back"));
  const back = b.to === "pdf" && !params.bt ? { to: "pdf", params: { id: rec.id }, label: rec.name } : { to: b.to, params: b.params, label: b.to === "pdf" ? rec.name : labelFor(b.to, b.params) };
  const doBack = () => goBack(back.to, back.params);
  // A PDF kept only in Drive needs a Google sign-in, which must start from a tap.
  if (needsSignIn(rec)) {
    container.innerHTML = html`${head(rec, back)}<p class="hint pad">☁️ ${t("pv.inDrive")}</p>
      <div class="actions-row"><button type="button" class="btn" data-action="signin">${t("pv.openFromDrive")}</button></div>`;
    state.on = ({ back: doBack, signin: async () => { try { await ensureSignedIn(rec.drive?.email); open(container, rec, params, state); } catch (e) { showError(container, rec, back, doBack, e, state); } } });
    return;
  }
  container.innerHTML = html`${head(rec, back)}<p class="sheet-status pad" id="pvLoad">${t("pdf.loading")}</p>`;
  state.on = { back: doBack };
  let doc;
  try {
    const blob = await pdfFile(rec, { onProgress: (d, n) => { const el = container.querySelector("#pvLoad"); if (el) el.textContent = t("pdfc.downloadingShort", { p: n ? Math.round((100 * d) / n) : 0 }); } });
    doc = await openStoredPdf({ blob });
  } catch (e) { if (!state.gone) showError(container, rec, back, doBack, e, state); return; }
  if (state.gone || !container.isConnected) { doc.destroy(); return; }
  state.doc = doc;
  const total = doc.numPages;
  const first = await doc.getPage(1);
  const v1 = first.getViewport({ scale: 1 });
  const ratio = v1.height / v1.width;
  const start = Math.max(1, Math.min(total, Number(params.n) || 1));
  let zoom = 1;
  container.innerHTML = html`${head(rec, back)}
    <div class="pv-bar">
      <label class="pv-jump"><span class="sr-only">${t("pdf.page")}</span><input type="number" class="field" id="pvNum" min="1" max="${total}" value="${start}" inputmode="numeric"></label>
      <span class="pv-of">${t("pv.of", { n: total })}</span>
      <span class="pv-zoom"><button type="button" class="icon-btn" data-action="zout" aria-label="${t("pv.zoomOut")}">−</button>
        <span id="pvZoom">100%</span>
        <button type="button" class="icon-btn" data-action="zin" aria-label="${t("pv.zoomIn")}">+</button></span>
    </div>
    <div class="pv-scroll" id="pvScroll"><div class="pv-pages" id="pvPages">${Array.from({ length: total }, (_, i) => html`<div class="pv-page" data-n="${i + 1}" style="aspect-ratio: 1 / ${ratio.toFixed(4)}"><span class="pv-no">${i + 1}</span></div>`)}</div></div>`;
  const pagesEl = container.querySelector("#pvPages");
  const numEl = container.querySelector("#pvNum");
  const drawn = new Map(); // page number → canvas
  const busy = new Set();
  let current = start;

  const draw = async (n) => {
    if (drawn.has(n) || busy.has(n) || state.gone) return;
    busy.add(n);
    const box = pagesEl.querySelector(`[data-n="${n}"]`);
    try {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      if (Math.abs(vp1.height / vp1.width - ratio) > 0.01) box.style.aspectRatio = `1 / ${(vp1.height / vp1.width).toFixed(4)}`;
      const cssW = box.clientWidth || pagesEl.clientWidth;
      const scale = Math.min(4, (cssW * Math.min(2, window.devicePixelRatio || 1)) / vp1.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      canvas.setAttribute("aria-label", t("pdf.pageOf", { n, of: total }));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      if (state.gone || !box.isConnected) return;
      box.querySelector("canvas")?.remove();
      box.appendChild(canvas);
      drawn.set(n, canvas);
    } catch { /* a page that can't be drawn stays blank with its number */ } finally { busy.delete(n); }
  };
  const forget = () => {
    drawn.forEach((c, n) => { if (Math.abs(n - current) > KEEP_NEAR) { c.width = c.height = 0; c.remove(); drawn.delete(n); } });
  };
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) draw(Number(e.target.dataset.n)); });
  }, { rootMargin: "120% 0px" });
  pagesEl.querySelectorAll(".pv-page").forEach((el) => seen.observe(el));
  state.undo.push(() => seen.disconnect());
  // The page in the middle of the screen is "the page you are on".
  const onScroll = () => {
    const mid = window.innerHeight / 2;
    let best = current;
    for (const el of pagesEl.children) { const r = el.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { best = Number(el.dataset.n); break; } }
    if (best !== current) { current = best; if (document.activeElement !== numEl) numEl.value = String(best); forget(); }
  };
  let tick = null;
  const scrollHost = window;
  const onWinScroll = () => { clearTimeout(tick); tick = setTimeout(onScroll, 120); };
  scrollHost.addEventListener("scroll", onWinScroll, { passive: true });
  state.undo.push(() => { scrollHost.removeEventListener("scroll", onWinScroll); clearTimeout(tick); });
  const jump = (n) => { const el = pagesEl.querySelector(`[data-n="${Math.max(1, Math.min(total, n))}"]`); el?.scrollIntoView({ block: "start" }); };
  const setZoom = (z) => {
    const keep = current;
    zoom = z;
    pagesEl.style.width = `${Math.round(z * 100)}%`;
    container.querySelector("#pvZoom").textContent = `${Math.round(z * 100)}%`;
    drawn.forEach((c) => { c.width = c.height = 0; c.remove(); });
    drawn.clear();
    requestAnimationFrame(() => { jump(keep); pagesEl.querySelectorAll(".pv-page").forEach((el) => { seen.unobserve(el); seen.observe(el); }); });
  };
  numEl.addEventListener("change", () => jump(Number(numEl.value) || current));
  state.on = {
    back: doBack,
    zin: () => { const i = ZOOMS.indexOf(zoom); if (i < ZOOMS.length - 1) setZoom(ZOOMS[i + 1]); },
    zout: () => { const i = ZOOMS.indexOf(zoom); if (i > 0) setZoom(ZOOMS[i - 1]); }
  };
  requestAnimationFrame(() => { if (start > 1) jump(start); });
}

function showError(container, rec, back, doBack, e, state) {
  container.innerHTML = html`${head(rec, back)}<p class="warn-box pre">${cloudErrorText(e)}</p>`;
  state.on = { back: doBack };
}

/** Opens the viewer at a page; from: openedFrom(…) of the screen you are on (for ‹). */
export const viewPdf = (id, n = 1, from = {}) => go("pdf-view", { id, n, ...from });
