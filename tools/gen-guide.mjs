/* Builds guide/lakshyam-guide-en.pdf and guide/lakshyam-guide-ml.pdf from
   src/features/guide/content.js (the same steps as the in-app demo).
   Needs a Chromium with Playwright:  node tools/gen-guide.mjs [path-to-playwright]
   Run it after changing the guide text, and commit the PDFs (the app serves them offline). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { STEPS, UI, stepHtml } from "../src/features/guide/content.js";

const pw = process.argv[2] || "playwright";
const { chromium } = await import(pw);
const css = readFileSync(new URL("../styles/guide.css", import.meta.url), "utf8");
mkdirSync(new URL("../guide/", import.meta.url), { recursive: true });

const TOKENS = `:root{--bg:#F4EEE1;--surface:#FFFDF8;--text:#221E17;--muted:#655D4D;--line:#E2D8C4;--brand:#2F6B4A;--brand-ink:#fff;--brand-soft:#E6ECDC;
  --gold:#9A6B17;--warn-bg:#F6E9CC;--danger:#A3352B;--wrong-bg:#F6E1DA;--c-good:#2F7D4F;--c-fair:#B8862A;--c-weak:#B3261E;--c-track:#E9E1CF}`;

function page(lang) {
  const u = UI[lang];
  const steps = STEPS.map((s, i) => `<section class="pg">
      <header class="pg-head"><span>🎯 Lakshyam</span><span>${u.title}</span></header>
      ${stepHtml(s, i, lang)}
      <footer class="pg-foot"><span>${u.footer}</span><span>${i + 1} / ${STEPS.length}</span></footer>
    </section>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${u.title}</title><style>
    ${TOKENS}
    @page { size: A5; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 "Inter", "Noto Sans Malayalam", "FreeSans", sans-serif; }
    [lang="ml"] { line-height: 1.75; }
    h1, h2, p, ul { margin: 0; }
    .pg { width: 148mm; height: 210mm; padding: 9mm 9mm 8mm; display: grid; grid-template-rows: auto 1fr auto; gap: 5mm; page-break-after: always; break-after: page; overflow: hidden; }
    .pg:last-child { page-break-after: auto; break-after: auto; }
    .pg-head, .pg-foot { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); font-weight: 600; letter-spacing: 0.02em; }
    .pg-head { padding-bottom: 2mm; border-bottom: 1px solid var(--line); }
    .g-step { border-radius: 16px; box-shadow: 0 1px 0 var(--line); }
    ${css}
    /* print: bigger type for the page, and no shadows / filters (they turn into heavy images) */
    .g-step { gap: 4mm; padding: 6mm; }
    .g-scene { min-height: 66mm; background: var(--g-soft) !important; }
    .g-scene * { box-shadow: none !important; filter: none !important; }
    .g-step .g-title { font-size: 22px; }
    .g-points { font-size: 15.5px; gap: 2.5mm; }
    [lang="ml"] .g-points { font-size: 14.5px; }
    .g-tip { font-size: 14px; }
    .gs-big { font-size: 80px; }
  </style></head><body>${steps}</body></html>`;
}

const browser = await chromium.launch();
for (const lang of ["en", "ml"]) {
  const p = await browser.newPage();
  await p.setContent(page(lang), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const out = new URL(`../guide/lakshyam-guide-${lang}.pdf`, import.meta.url);
  writeFileSync(out, await p.pdf({ format: "A5", printBackground: true, preferCSSPageSize: true }));
  console.log("wrote", out.pathname);
  await p.close();
}
await browser.close();
