/* Settings → How to use Lakshyam: the illustrated demo (swipe through 11 steps, English or
   മലയാളം, "Try it" opens the real screen), and the same guide as a PDF to view or download. */
import { html, raw, onAction } from "../../core/dom.js";
import { t, locale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { STEPS, UI, GUIDE_LANGS, stepHtml } from "./content.js";
import { openStartTest } from "../test/start-sheet.js";

export const pdfUrl = (lang) => `guide/lakshyam-guide-${lang === "ml" ? "ml" : "en"}.pdf`;
const LANG_NAME = { en: "English", ml: "മലയാളം" };
let place = { i: 0, lang: null };

function downloadPdf(lang) {
  const a = document.createElement("a");
  a.href = pdfUrl(lang);
  a.download = `Lakshyam-guide-${lang === "ml" ? "Malayalam" : "English"}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  toast(t("guide.downloaded"));
}

/** The Settings entry: demo, view PDF, download PDF. */
export function openGuideSheet() {
  openSheet(html`<h2>📖 ${t("guide.title")}</h2>
    <p class="hint">${t("guide.sub")}</p>
    <button type="button" class="btn wide" data-action="demo">▶ ${t("guide.openDemo")}</button>
    <h3>${t("guide.pdfHead")}</h3>
    <div class="menu">${GUIDE_LANGS.map((l) => html`
      <button type="button" class="menu-item" data-action="view" data-l="${l}"><span class="row-main"><span>📄 ${t("guide.view")} · <span lang="${l}">${LANG_NAME[l]}</span></span></span><span class="chev-txt">›</span></button>
      <button type="button" class="menu-item" data-action="dl" data-l="${l}"><span class="row-main"><span>⬇ ${t("guide.download")} · <span lang="${l}">${LANG_NAME[l]}</span></span></span></button>`)}</div>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button></div>`, {
    demo: () => go("guide"),
    view: (el) => go("guide-pdf", { lang: el.dataset.l }),
    dl: (el) => downloadPdf(el.dataset.l),
    close: () => closeSheet()
  }, { label: t("guide.title") });
}

export const guideScreen = {
  id: "guide",
  render(container, params = {}) {
    const lang = GUIDE_LANGS.includes(params.lang) ? params.lang : place.lang || (locale() === "ml" ? "ml" : "en");
    place.lang = lang;
    const u = UI[lang];
    container.innerHTML = html`<section class="guide" lang="${lang}">
      <header class="screen-head"><div class="head-bar">
        <button type="button" class="back" data-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("settings.title")}</span></button>
        <div class="segmented two g-lang" role="group" aria-label="${u.lang}">${GUIDE_LANGS.map((l) => html`<button type="button" class="${l === lang ? "on" : ""}" data-action="lang" data-l="${l}" lang="${l}" aria-pressed="${String(l === lang)}">${LANG_NAME[l]}</button>`)}</div>
      </div>
      <h1>📖 ${u.title}</h1><p class="hint">${u.sub}</p></header>
      <div class="g-dots" role="tablist">${STEPS.map((s, i) => html`<button type="button" class="g-dot" data-action="dot" data-i="${i}" aria-label="${u.step.replace("{n}", i + 1).replace("{of}", STEPS.length)}"></button>`)}</div>
      <div class="g-track" id="gTrack">${raw(STEPS.map((s, i) => stepHtml(s, i, lang, { actions: true })).join(""))}</div>
      <div class="g-nav">
        <button type="button" class="btn btn-quiet" data-action="prev">‹ ${u.prev}</button>
        <button type="button" class="btn" data-action="next" id="gNext">${u.next} ›</button>
      </div>
      <div class="g-pdf">
        <button type="button" class="link" data-action="pdf-view">📄 ${u.pdfView}</button>
        <button type="button" class="link" data-action="pdf-dl">⬇ ${u.pdfDownload}</button>
      </div>
    </section>`;

    const track = container.querySelector("#gTrack");
    const dots = [...container.querySelectorAll(".g-dot")];
    const nextBtn = container.querySelector("#gNext");
    const prevBtn = container.querySelector('[data-action="prev"]');
    const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const paint = () => {
      const i = current();
      place.i = i;
      dots.forEach((d, k) => { d.classList.toggle("on", k === i); d.setAttribute("aria-selected", String(k === i)); });
      nextBtn.textContent = i >= STEPS.length - 1 ? `${u.done} ✓` : `${u.next} ›`;
      // On the first step, Back leaves the demo (instead of doing nothing).
      prevBtn.textContent = i === 0 ? `‹ ${t("settings.title")}` : `‹ ${u.prev}`;
    };
    // Moves to step i. Some phones ignore a smooth scroll inside a snapping row (most often
    // going backwards), so if it hasn't arrived shortly after, jump there directly.
    const show = (i, smooth = true) => {
      const k = Math.max(0, Math.min(STEPS.length - 1, i));
      const left = k * track.clientWidth;
      track.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
      setTimeout(() => { if (track.isConnected && current() !== k) { track.style.scrollSnapType = "none"; track.scrollLeft = left; requestAnimationFrame(() => { track.style.scrollSnapType = ""; paint(); }); } }, smooth ? 450 : 0);
    };
    let raf = 0;
    track.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
    requestAnimationFrame(() => { show(Number(params.i ?? place.i) || 0, false); paint(); });
    const onKey = (e) => { if (e.key === "ArrowRight") show(current() + 1); if (e.key === "ArrowLeft") show(current() - 1); };
    document.addEventListener("keydown", onKey);

    onAction(container, {
      back: () => go("settings"),
      lang: (el) => { place.lang = el.dataset.l; go("guide", { lang: el.dataset.l, i: current() }); },
      dot: (el) => show(Number(el.dataset.i)),
      prev: () => (current() === 0 ? go("settings") : show(current() - 1)),
      next: () => (current() >= STEPS.length - 1 ? go("today") : show(current() + 1)),
      "pdf-view": () => go("guide-pdf", { lang }),
      "pdf-dl": () => downloadPdf(lang),
      "g-try": (el) => {
        const to = el.dataset.to;
        if (to === "start-test") { go("today"); setTimeout(() => openStartTest(), 80); return; }
        go(to);
      }
    });
    return () => document.removeEventListener("keydown", onKey);
  }
};

/** The PDF, drawn page by page with the app's own PDF reader (Android Chrome can't show PDFs inline). */
export const guidePdfScreen = {
  id: "guide-pdf",
  render(container, params = {}) {
    const lang = params.lang === "ml" ? "ml" : "en";
    container.innerHTML = html`<section class="guide-pdf">
      <header class="screen-head"><div class="head-bar">
        <button type="button" class="back" data-action="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("guide.title")}</span></button>
        <button type="button" class="btn btn-small" data-action="dl">⬇ ${t("guide.download")}</button></div>
      <h1>📄 ${t("guide.pdfTitle")}</h1><p class="hint" lang="${lang}">${LANG_NAME[lang]}</p></header>
      <div id="gPages" class="g-pages"><p class="sheet-status">${t("guide.loading")}</p></div>
    </section>`;
    const host = container.querySelector("#gPages");
    let alive = true;
    (async () => {
      try {
        const res = await fetch(pdfUrl(lang));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const { openStoredPdf, renderPageJpeg } = await import("../../pdf/pdf-reader.js");
        const doc = await openStoredPdf({ blob });
        host.innerHTML = "";
        for (let n = 1; n <= doc.numPages && alive; n++) {
          const src = await renderPageJpeg(doc, n, { width: 1100, quality: 0.82 });
          if (!alive) break;
          const img = document.createElement("img");
          img.src = src; img.alt = `${n} / ${doc.numPages}`; img.className = "g-page";
          host.appendChild(img);
        }
        doc.destroy();
      } catch {
        if (alive) host.innerHTML = String(html`<p class="warn-box">${t("guide.pdfFailed")}</p>`);
      }
    })();
    onAction(container, { back: () => go("guide", { lang }), dl: () => downloadPdf(lang) });
    return () => { alive = false; };
  }
};
