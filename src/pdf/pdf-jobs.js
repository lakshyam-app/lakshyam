/* The AI work done on a PDF, section by section. Nothing here draws the screen;
   each job reports progress through onStep and can be stopped with job.cancel.
   - readPages: AI reads page pictures (scanned / old-font pages)
   - makeQuestions: grounded questions, quote-checked, optional second-pass answer check
   - makeCards / makeNote: grounded flashcards and revision notes
   An AI failure that affects every preset stops the job; whatever was made so far is kept. */
import { ask, parseJsonLoose, AiError } from "../ai/client.js";
import * as PP from "../ai/pdf-prompts.js";
import * as T from "./pdf-tools.js";
import { getPdf, savePage } from "./pdf-store.js";
import { openStoredPdf, renderPageJpeg } from "./pdf-reader.js";
import { pdfFile } from "./pdf-file.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PAUSE_MS = { between: 700, afterFail: 2500, page: 1200 };

/** A reply we could not use (bad JSON) only skips that section; anything else stops the job. */
const skippable = (e) => !(e instanceof AiError) && (e instanceof SyntaxError || /json/i.test(String(e?.message)));

function toArray(reply, ...keys) {
  if (Array.isArray(reply)) return reply;
  for (const k of keys) if (Array.isArray(reply?.[k])) return reply[k];
  return [];
}

/* ---------- reading page pictures ---------- */

export async function readPages(pdfId, pageNums, job, onStep = () => {}) {
  const rec = await getPdf(pdfId);
  if (!rec) throw new Error("pdf-missing");
  // The file may be only in Google Drive: fetched for this session (page text stays on the phone).
  const doc = await openStoredPdf({ blob: await pdfFile(rec) });
  let done = 0; let failedInRow = 0;
  try {
    for (const n of pageNums) {
      if (job.cancel) break;
      onStep({ page: n, done, total: pageNums.length });
      try {
        const img = await renderPageJpeg(doc, n);
        const { text } = await ask(PP.OCR_SYSTEM, PP.OCR_USER, 3500, { images: [img] });
        const t = T.cleanText(text);
        const page = /^NO_TEXT\b/i.test(t) || t.replace(/\s/g, "").length < 8 ? { t: "", src: "blank" } : { t, src: "ai" };
        await savePage(pdfId, n, page);
        done++; failedInRow = 0;
      } catch (e) {
        failedInRow++;
        if (e?.noPreset || failedInRow >= 2) throw Object.assign(e, { done });
        await sleep(PAUSE_MS.afterFail);
        continue;
      }
      await sleep(PAUSE_MS.page);
    }
  } finally { try { await doc.destroy(); } catch { /* ignore */ } }
  return done;
}

/* ---------- which model answered (shown after making, and saved with each item) ---------- */

/** The model that answered one request: the preset's model name (never the key). */
export const modelOf = (preset) => String(preset?.model || preset?.name || "").slice(0, 80) || null;
const tally = (map, m) => { if (m) map[m] = (map[m] || 0) + 1; };

/* ---------- style guide ---------- */

export async function buildStyleGuide(label, examples, onModel = () => {}) {
  const { text, preset } = await ask(PP.STYLE_SYSTEM, PP.styleTask(label, examples), 900);
  onModel(modelOf(preset));
  return text.trim();
}

/* ---------- questions ---------- */

/** cfg: { from, to, n, check, style, examples, lang, difficulty } → { items, tot, abortMsg } */
export async function makeQuestions(pages, cfg, job, onStep = () => {}) {
  const plan = T.planChunks(T.buildChunks(pages, cfg.from, cfg.to, cfg.only ? new Set(cfg.only) : null), cfg.n);
  const all = []; const seen = new Set();
  const tot = { raw: 0, badShape: 0, badQuote: 0, skipped: 0, checkFailed: 0 };
  const models = { write: {}, check: {} };
  let abortMsg = null;
  for (let i = 0; i < plan.length; i++) {
    if (job.cancel) break;
    const { chunk, n } = plan[i];
    onStep({ section: i + 1, sections: plan.length, pages: T.pageRange(chunk.pages), made: all.length });
    try {
      const askFor = n <= 1 ? 1 : n + 1; // a little extra, as some are dropped by the checks
      const { text, preset } = await ask(PP.GEN_SYSTEM, PP.genTask(cfg, chunk, askFor), Math.min(7000, 700 * askFor + 700));
      const { items, stats } = T.verifyQuestions(toArray(parseJsonLoose(text), "questions"), chunk, { seen });
      tot.raw += stats.raw; tot.badShape += stats.badShape; tot.badQuote += stats.badQuote;
      const by = modelOf(preset); tally(models.write, by);
      if (cfg.check && items.length && !job.cancel) {
        try {
          const { text: reply, preset: cp } = await ask(PP.CHECK_SYSTEM, PP.checkTask(chunk, items), 400 + items.length * 40);
          T.applyAnswerCheck(items, parseJsonLoose(reply));
          const cb = modelOf(cp); tally(models.check, cb);
          items.forEach((it) => { it.checkedBy = cb; });
        } catch (e) {
          if (!skippable(e)) throw e;
          items.forEach((it) => { it.check = "none"; }); tot.checkFailed++;
        }
      }
      items.forEach((it) => { it.madeBy = by; });
      all.push(...items);
    } catch (e) {
      if (skippable(e)) tot.skipped++;
      else { abortMsg = e; break; }
    }
    if (i < plan.length - 1) await sleep(PAUSE_MS.between);
  }
  return { items: T.trimToBest(all, cfg.n), tot, abortMsg, sections: plan.length, models };
}

/* ---------- flashcards ---------- */

export async function makeCards(pages, cfg, job, onStep = () => {}) {
  const plan = T.planChunks(T.buildChunks(pages, cfg.from, cfg.to), cfg.n);
  const all = []; const tot = { badQuote: 0, badShape: 0, flagged: 0, skipped: 0 };
  const models = { write: {}, check: {} };
  let abortMsg = null;
  for (let i = 0; i < plan.length; i++) {
    if (job.cancel) break;
    const { chunk, n } = plan[i];
    onStep({ section: i + 1, sections: plan.length, pages: T.pageRange(chunk.pages), made: all.length });
    try {
      const { text, preset } = await ask(PP.CARD_SYSTEM, PP.cardTask(cfg, chunk, n + 1), Math.min(6000, 220 * (n + 1) + 600));
      const { items, stats } = T.verifyCards(toArray(parseJsonLoose(text), "cards", "flashcards"), chunk);
      tot.badQuote += stats.badQuote; tot.badShape += stats.badShape; tot.flagged += stats.flagged;
      const by = modelOf(preset); tally(models.write, by);
      items.forEach((it) => { it.madeBy = by; });
      all.push(...items);
    } catch (e) {
      if (skippable(e)) tot.skipped++;
      else { abortMsg = e; break; }
    }
    if (i < plan.length - 1) await sleep(PAUSE_MS.between);
  }
  // Cards on past-paper areas first (when the topic pattern was used), then the rest.
  const cards = T.dropDuplicates(all, (c) => c.front);
  const ordered = cfg.pattern ? [...cards.filter((c) => c.pyq), ...cards.filter((c) => !c.pyq)] : cards;
  return { items: ordered.slice(0, cfg.n), tot, abortMsg, models };
}

/* ---------- revision note ---------- */

export const NOTE_MAX_SECTIONS = 15;

export async function makeNote(pages, cfg, job, onStep = () => {}) {
  const chunks = T.buildChunks(pages, cfg.from, cfg.to).slice(0, NOTE_MAX_SECTIONS);
  const lines = []; const tot = { dropped: 0, skipped: 0 };
  const models = { write: {}, check: {} };
  let abortMsg = null;
  for (let i = 0; i < chunks.length; i++) {
    if (job.cancel) break;
    const chunk = chunks[i];
    onStep({ section: i + 1, sections: chunks.length, pages: T.pageRange(chunk.pages) });
    try {
      const { text, preset } = await ask(PP.NOTE_SYSTEM, PP.noteTask(cfg, chunk), cfg.lang === "ml" ? 4500 : 2600);
      tally(models.write, modelOf(preset));
      const r = T.noteLines(text, chunk);
      if (r.lines.length) lines.push(`**Pages ${T.pageRange(chunk.pages)}**`, ...r.lines, "");
      tot.dropped += r.dropped;
    } catch (e) {
      if (skippable(e)) tot.skipped++;
      else { abortMsg = e; break; }
    }
    if (i < chunks.length - 1) await sleep(PAUSE_MS.between);
  }
  const starred = cfg.pattern && lines.some((l) => /^- ⭐/.test(l));
  return { text: [starred ? cfg.starLegend || "" : "", ...lines].join("\n").trim(), tot, abortMsg, sections: chunks.length, models };
}
