/* Study PDFs.
   #/pdfs?type=topic|subject&id=…   PDFs of one listing (no type: every PDF)
   #/pdf?id=…                       one PDF: what it contains, what to make from it
   #/pdf-page?id=…&n=…              read / correct one page's text, or let AI read it
   #/pdf-make?id=…&kind=…           questions | cards | note | read (scanned pages)
   AI work keeps running if you leave the screen; come back to the PDF to review.
   Nothing made from a PDF is saved until you review it. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go, current, rerender } from "../../core/router.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { copyText } from "../../core/clipboard.js";
import { richText, letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { label as nameLabel, pathLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import * as T from "../../pdf/pdf-tools.js";
import * as pdfStore from "../../pdf/pdf-store.js";
import { extractPdfText, openStoredPdf, renderPageJpeg } from "../../pdf/pdf-reader.js";
import * as jobsApi from "../../pdf/pdf-jobs.js";
import { DEFAULT_STYLE } from "../../ai/pdf-prompts.js";
import { header, backHandler, chev } from "../library/library.js";
import { pickTopic } from "../library/topic-picker.js";
import { ensureAi, errorText } from "../ai/ai-ui.js";

const PDF_SCREENS = ["pdfs", "pdf", "pdf-page", "pdf-make"];
const KINDS = ["questions", "cards", "note", "read"];
const jobs = new Map(); // `${pdfId}|${kind}` → job (in memory; a reload starts afresh)
const jobKey = (id, kind) => `${id}|${kind}`;

/* ---------- small helpers ---------- */

const ownerName = (owner) => (owner?.type === "topic" ? nameLabel(store.topic(owner.id)) : owner?.type === "subject" ? nameLabel(store.subject(owner.id)) : null) || null;
function ownerLabel(owner) {
  if (owner?.type === "topic") { const x = store.topic(owner.id); return x ? pathLabel(x) : t("pdf.unknownOwner"); }
  return ownerName(owner) || t("pdf.unknownOwner");
}
/** Where questions/cards/notes from this PDF go by default. */
function defaultTarget(rec) {
  if (rec.owner?.type === "topic") { const x = store.topic(rec.owner.id); if (x) return { subjectId: x.subjectId, topicId: x.id }; }
  if (rec.owner?.type === "subject" && store.subject(rec.owner.id)) {
    const first = store.topicsOf(rec.owner.id)[0];
    return { subjectId: rec.owner.id, topicId: first?.id || null };
  }
  return { subjectId: null, topicId: null };
}
/** English "Subject › Topic" for AI prompts. */
const englishPath = (id) => { const x = store.topic(id); return x ? `${store.subject(x.subjectId)?.name || ""} › ${x.name}` : ""; };
const targetLabel = (tg) => (tg?.topicId && store.topic(tg.topicId) ? pathLabel(tg.topicId) : t("pdf.pickTopic"));

function summaryLine(rec) {
  const c = T.pageCounts(rec.pages);
  return [t("pdf.pagesN", { n: rec.pages.length }), t("pdf.readableN", { n: c.readable }), c.ai ? t("pdf.byAiN", { n: c.ai }) : null, c.need ? `⚠ ${t("pdf.needN", { n: c.need })}` : null].filter(Boolean).join(" · ");
}
const srcLabel = (src) => t(`pdf.src.${src}`);
const onScreen = (id, params = {}) => { const c = current(); return c.id === id && Object.entries(params).every(([k, v]) => String(c.params[k]) === String(v)); };
const editing = () => { const a = document.activeElement; return a && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName) && a.closest(".screen-host"); };

/** Redraws a PDF screen after background work, unless you are typing. */
function refresh(force = false) {
  if (!PDF_SCREENS.includes(current().id)) return;
  if (!force && editing()) return;
  rerender();
}
pdfStore.onPdfChange(() => refresh());

function loading(container) {
  container.innerHTML = html`<p class="sheet-status pad">${t("pdf.loading")}</p>`;
}

/* ---------- adding a PDF ---------- */

function pickPdfFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/pdf,.pdf"; input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => { const f = input.files?.[0] || null; input.remove(); resolve(f); }, { once: true });
    input.click();
  });
}

async function addPdf(owner, statusEl) {
  const file = await pickPdfFile();
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { toast(t("pdf.notPdf")); return; }
  if (file.size > pdfStore.MAX_PDF_MB * 1048576) { toast(t("pdf.tooBig", { mb: pdfStore.MAX_PDF_MB })); return; }
  const say = (msg, cls = "sheet-status") => { if (statusEl?.isConnected) statusEl.innerHTML = html`<p class="${cls}">${msg}</p>`; };
  say(t("pdf.reading", { name: file.name }));
  try {
    const pages = await extractPdfText(file, (i, n) => say(t("pdf.readingPage", { i, n })));
    if (!pages.length) throw new Error(t("pdf.noPages"));
    const rec = { id: pdfStore.newPdfId(), owner, syllabusId: store.currentSyllabus()?.id || null, name: file.name, size: file.size, addedAt: Date.now(), pages, blob: file };
    await pdfStore.savePdf(rec);
    const c = T.pageCounts(pages);
    toast(c.need ? t("pdf.addedNeed", { n: c.readable, need: c.need }) : t("pdf.added", { n: c.readable }));
    go("pdf", { id: rec.id });
  } catch (e) {
    const msg = /pdf-reader/.test(e?.message) ? t("pdf.readerMissing") : /password/i.test(e?.name || e?.message) ? t("pdf.locked") : /invalid|corrupt/i.test(e?.message || "") ? t("pdf.broken") : errorText(e);
    say(msg, "warn-box pre");
  }
}

/* ---------- #/pdfs : the PDFs of a listing (or all) ---------- */

export const pdfsScreen = {
  id: "pdfs",
  parent: "library",
  render(container, { type, id }) {
    const owner = type && id ? { type, id } : null;
    if (owner && !ownerName(owner)) return go("library", { view: "banks" });
    const back = owner?.type === "topic" ? { backTo: "topic", backParams: { id }, backLabel: ownerName(owner) }
      : owner ? { backTo: "subject", backParams: { id }, backLabel: ownerName(owner) }
        : { backTo: "library", backParams: { view: "banks" }, backLabel: t("library.views.banks") };
    container.innerHTML = html`${header({ ...back, title: t("pdf.title"), sub: owner ? ownerLabel(owner) : t("pdf.allSub") })}
      <p class="hint pad">${t("pdf.intro")}</p>
      <div class="actions-row"><button type="button" class="btn" data-action="add">＋ ${t("pdf.add")}</button></div>
      <div id="pdfStatus"></div>
      <div class="rows" id="pdfRows"><p class="hint pad">${t("pdf.loading")}</p></div>`;
    onAction(container, {
      ...backHandler,
      open: (el) => go("pdf", { id: el.dataset.id }),
      add: () => {
        const status = container.querySelector("#pdfStatus");
        if (owner) { addPdf(owner, status); return; } // straight from the tap (Chrome needs that for the file picker)
        runFlow(async () => {
          const pick = await pickTopic({ title: t("pdf.addTo") });
          if (!pick?.topicId) return;
          // runFlow closes its sheet when this returns; the file picker then opens.
          setTimeout(() => addPdf({ type: "topic", id: pick.topicId }, status), 0);
        });
      }
    });
    // A subject's list also shows the PDFs of its topics.
    const mine = (r) => !owner || (r.owner?.type === owner.type && r.owner?.id === owner.id)
      || (owner.type === "subject" && r.owner?.type === "topic" && store.topic(r.owner.id)?.subjectId === owner.id);
    pdfStore.listPdfs().then((all) => all.filter(mine)).then((list) => {
      const rows = container.querySelector("#pdfRows");
      if (!rows?.isConnected) return;
      rows.innerHTML = list.length ? html`${list.map((r) => {
        const running = KINDS.some((k) => jobs.get(jobKey(r.id, k))?.phase === "running");
        const ready = KINDS.some((k) => jobs.get(jobKey(r.id, k))?.phase === "review");
        return html`<button type="button" class="row" data-action="open" data-id="${r.id}">
          <span class="row-main"><span class="row-title">📄 ${r.name}</span>
          <span class="row-sub">${[owner && r.owner?.type === owner.type ? null : ownerLabel(r.owner), pdfStore.formatMB(r.size || 0), summaryLine(r), running ? `⏳ ${t("pdf.working")}` : null, ready ? `✓ ${t("pdf.readyToReview")}` : null].filter(Boolean).join(" · ")}</span></span>${chev}</button>`;
      })}` : html`<p class="hint pad">${owner ? t("pdf.noneHere") : t("pdf.none")}</p>`;
    }).catch((e) => { const rows = container.querySelector("#pdfRows"); if (rows) rows.innerHTML = html`<p class="warn-box">${errorText(e)}</p>`; });
  }
};

/* ---------- #/pdf : one PDF ---------- */

export const pdfScreen = {
  id: "pdf",
  parent: "library",
  render(container, { id }) {
    loading(container);
    pdfStore.getPdf(id).then((rec) => {
      if (!container.isConnected) return;
      if (!rec) { go("pdfs"); return; }
      drawPdf(container, rec);
    });
  }
};

function jobLine(rec, kind) {
  const job = jobs.get(jobKey(rec.id, kind));
  if (!job || job.phase === "form") return "";
  const label = t(`pdf.kind.${kind}`);
  const text = job.phase === "running" ? `⏳ ${label}: ${progressText(job)}` : job.phase === "review" ? `✓ ${label}: ${t("pdf.readyToReview")}` : job.phase === "done" ? `✓ ${label}: ${t("pdf.done")}` : `⚠ ${label}: ${t("pdf.stopped")}`;
  return html`<button type="button" class="row job-row" data-action="make" data-kind="${kind}"><span class="row-main"><span class="row-title">${text}</span></span>${chev}</button>`;
}

function drawPdf(container, rec) {
  const c = T.pageCounts(rec.pages);
  const backParams = rec.owner ? { type: rec.owner.type, id: rec.owner.id } : {};
  const lines = KINDS.map((k) => jobLine(rec, k)).filter(Boolean);
  container.innerHTML = html`${header({ backTo: "pdfs", backParams, backLabel: t("pdf.title"), title: rec.name, sub: `${ownerLabel(rec.owner)} · ${pdfStore.formatMB(rec.size || 0)}`, menu: true })}
    <p class="hint pad">${summaryLine(rec)}</p>
    ${c.need ? html`<div class="warn-box"><p>${t("pdf.needBody", { n: c.need })}</p>
      <button type="button" class="btn btn-quiet btn-small" data-action="make" data-kind="read">🖼️ ${t("pdf.readScanned", { n: c.need })}</button></div>` : ""}
    ${lines.length ? html`<div class="rows">${lines}</div>` : ""}
    <h3 class="rows-head">${t("pdf.makeHead")}</h3>
    <div class="rows">
      ${["questions", "cards", "note"].map((k) => html`<button type="button" class="row" data-action="make" data-kind="${k}" ${c.readable ? "" : "disabled"}>
        <span class="row-main"><span class="row-title">${t(`pdf.icon.${k}`)} ${t(`pdf.kind.${k}`)}</span><span class="row-sub">${t(`pdf.kindSub.${k}`)}</span></span>${chev}</button>`)}
    </div>
    ${c.readable ? "" : html`<p class="hint pad">${t("pdf.noReadable")}</p>`}
    <h3 class="rows-head">${t("pdf.pagesHead")}</h3>
    <div class="rows"><button type="button" class="row" data-action="pages"><span class="row-main"><span class="row-title">🔍 ${t("pdf.pages")}</span><span class="row-sub">${t("pdf.pagesSub")}</span></span>${chev}</button></div>
    <p class="hint pad">${t("pdf.privacy")}</p>`;
  onAction(container, {
    ...backHandler,
    make: (el) => go("pdf-make", { id: rec.id, kind: el.dataset.kind }),
    pages: () => go("pdf-page", { id: rec.id, n: T.pageNumbers(rec.pages, T.needsAi)[0] || 1 }),
    menu: () => runFlow(async () => {
      const choice = await chooseAction({ title: rec.name, items: [
        { id: "rename", label: t("pdf.rename") },
        { id: "move", label: t("pdf.move") },
        { id: "delete", label: t("pdf.delete"), danger: true }
      ] });
      if (choice === "rename") {
        const name = await askText({ title: t("pdf.rename"), value: rec.name });
        if (name) { rec.name = name.trim(); await pdfStore.savePdf(rec); toast(t("pdf.renamed")); }
      } else if (choice === "move") {
        const pick = await pickTopic({ title: t("pdf.move"), current: defaultTarget(rec) });
        if (pick?.topicId) { rec.owner = { type: "topic", id: pick.topicId }; await pdfStore.savePdf(rec); toast(t("pdf.moved", { to: targetLabel(pick) })); }
      } else if (choice === "delete") {
        const ok = await confirmAction({ title: t("pdf.deleteTitle", { name: rec.name }), body: t("pdf.deleteBody"), confirmLabel: t("common.delete"), danger: true });
        if (!ok) return;
        KINDS.forEach((k) => { const j = jobs.get(jobKey(rec.id, k)); if (j) j.cancel = true; jobs.delete(jobKey(rec.id, k)); });
        await pdfStore.deletePdf(rec.id);
        toast(t("pdf.deleted"));
        go("pdfs", backParams);
      }
    })
  });
}

/* ---------- #/pdf-page : one page ---------- */

const pagePicture = new Map(); // pdfId|n → data URL (kept while the app is open)

export const pdfPageScreen = {
  id: "pdf-page",
  parent: "library",
  render(container, { id, n }) {
    loading(container);
    pdfStore.getPdf(id).then((rec) => {
      if (!container.isConnected) return;
      if (!rec) { go("pdfs"); return; }
      drawPage(container, rec, Math.max(1, Math.min(rec.pages.length, Number(n) || 1)));
    });
  }
};

function drawPage(container, rec, n) {
  const p = rec.pages[n - 1] || { t: "", src: "scan" };
  const pic = pagePicture.get(`${rec.id}|${n}`);
  const needList = T.pageNumbers(rec.pages, T.needsAi);
  const nextNeed = needList.find((x) => x > n);
  container.innerHTML = html`${header({ backTo: "pdf", backParams: { id: rec.id }, backLabel: rec.name, title: t("pdf.pageOf", { n, of: rec.pages.length }), sub: srcLabel(p.src) })}
    <div class="page-nav">
      <button type="button" class="btn btn-quiet btn-small" data-action="to" data-n="${n - 1}" ${n > 1 ? "" : "disabled"}>‹ ${t("pager.prev")}</button>
      <label class="page-jump"><span class="sr-only">${t("pdf.page")}</span><input type="number" class="field" id="pgNum" min="1" max="${rec.pages.length}" value="${n}" inputmode="numeric"></label>
      <button type="button" class="btn btn-quiet btn-small" data-action="to" data-n="${n + 1}" ${n < rec.pages.length ? "" : "disabled"}>${t("pager.next")} ›</button>
    </div>
    ${T.needsAi(p) ? html`<p class="warn-box">${t(p.src === "garbled" ? "pdf.garbledNote" : "pdf.scanNote")}</p>` : ""}
    ${p.src === "ai" ? html`<p class="hint">${t("pdf.aiReadNote")}</p>` : ""}
    <label class="field-label">${t("pdf.pageText")}<textarea class="field page-text" id="pgText" rows="14" placeholder="${t("pdf.noText")}">${p.t || ""}</textarea></label>
    <div id="pgOut"></div>
    <div class="actions-row">
      <button type="button" class="btn" data-action="save">${t("pdf.saveText")}</button>
      <button type="button" class="btn btn-quiet" data-action="ai">🖼️ ${t("pdf.readWithAi")}</button>
      <button type="button" class="btn btn-quiet" data-action="pic">${pic ? t("pdf.hidePicture") : t("pdf.showPicture")}</button>
    </div>
    ${nextNeed ? html`<button type="button" class="link" data-action="to" data-n="${nextNeed}">${t("pdf.nextNeed", { n: nextNeed })} ›</button>` : ""}
    ${pic ? html`<img class="page-pic" src="${pic}" alt="${t("pdf.pageOf", { n, of: rec.pages.length })}">` : ""}`;
  const out = container.querySelector("#pgOut");
  container.querySelector("#pgNum").addEventListener("change", (e) => go("pdf-page", { id: rec.id, n: Math.max(1, Math.min(rec.pages.length, Number(e.target.value) || n)) }));
  onAction(container, {
    ...backHandler,
    to: (el) => go("pdf-page", { id: rec.id, n: el.dataset.n }),
    save: async () => {
      const text = T.cleanText(container.querySelector("#pgText").value);
      if (text === T.cleanText(p.t) && p.src !== "scan" && p.src !== "garbled") { toast(t("pdf.noChange")); return; }
      await pdfStore.savePage(rec.id, n, { t: text, src: text ? "edited" : "blank" });
      toast(t("pdf.pageSaved"));
    },
    pic: async (el) => {
      const key = `${rec.id}|${n}`;
      if (pagePicture.has(key)) { pagePicture.delete(key); drawPage(container, rec, n); return; }
      el.disabled = true; el.textContent = t("pdf.loading");
      try {
        const doc = await openStoredPdf(rec);
        try { pagePicture.clear(); pagePicture.set(key, await renderPageJpeg(doc, n, { width: 1100, quality: 0.8 })); } finally { doc.destroy(); }
        if (container.isConnected) drawPage(container, rec, n);
      } catch (e) { out.innerHTML = html`<p class="warn-box">${errorText(e)}</p>`; el.disabled = false; }
    },
    ai: async (el) => {
      if (!(await ensureAi())) return;
      el.disabled = true;
      out.innerHTML = html`<p class="sheet-status">${t("pdf.aiReading")}</p>`;
      try {
        await jobsApi.readPages(rec.id, [n], { cancel: false });
        toast(t("pdf.pageReadDone"));
      } catch (e) {
        if (out.isConnected) { out.innerHTML = html`<p class="warn-box pre">${errorText(e)}</p>`; el.disabled = false; }
      }
    }
  });
}

/* ---------- #/pdf-make : questions, cards, revision note, AI page reading ---------- */

export const pdfMakeScreen = {
  id: "pdf-make",
  parent: "library",
  render(container, { id, kind }) {
    if (!KINDS.includes(kind)) return go("pdf", { id });
    loading(container);
    pdfStore.getPdf(id).then((rec) => {
      if (!container.isConnected) return;
      if (!rec) { go("pdfs"); return; }
      let job = jobs.get(jobKey(id, kind));
      if (!job) { job = newJob(rec, kind); jobs.set(jobKey(id, kind), job); }
      drawMake(container, rec, job);
    });
  }
};

function styleKey(topicId) { return `aiStyle:${topicId}`; }
function savedStyle(tg) {
  return (tg.topicId && store.setting(styleKey(tg.topicId))) || (tg.subjectId && store.setting(`aiStyle:sub:${tg.subjectId}`)) || null;
}
async function saveStyle(tg, text) {
  const value = { text, at: Date.now() };
  await store.quietly(async () => {
    if (tg.topicId) await store.setSetting(styleKey(tg.topicId), value);
    if (tg.subjectId) await store.setSetting(`aiStyle:sub:${tg.subjectId}`, value);
  });
}

/** Past-paper questions to learn the style from: the topic's, or the subject's if the topic has few. */
function pyqPool(tg) {
  const syllabus = store.currentSyllabus();
  const ok = (q) => q.text && Array.isArray(q.options) && q.options.length >= 2;
  const topicQs = tg.topicId ? store.questionsFor({ syllabusId: syllabus.id, topicId: tg.topicId }).filter(ok) : [];
  if (topicQs.length >= 6) return topicQs;
  return tg.subjectId ? store.questionsFor({ syllabusId: syllabus.id, subjectId: tg.subjectId }).filter(ok) : topicQs;
}
const pickRandom = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

function newJob(rec, kind) {
  const readable = T.pageNumbers(rec.pages, T.isUsable);
  const target = defaultTarget(rec);
  const subjectName = store.subject(target.subjectId)?.name || "";
  const s = savedStyle(target);
  return {
    pdfId: rec.id, kind, phase: "form", cancel: false, progress: null, result: null, error: null, keep: new Set(), noteText: "",
    cfg: {
      target, from: readable[0] || 1, to: readable[readable.length - 1] || rec.pages.length,
      n: kind === "cards" ? 20 : 10, difficulty: "mixed", lang: "same", check: true, detail: "detailed",
      style: s?.text || DEFAULT_STYLE, styleAt: s?.at || null, styleNote: "", readCount: "all",
      subjectName
    }
  };
}

function progressText(job) {
  const p = job.progress;
  if (!p) return t("pdf.starting");
  if (job.kind === "read") return t("pdf.readProgress", { page: p.page, done: p.done, total: p.total });
  const base = t("pdf.sectionProgress", { i: p.section, n: p.sections, pages: p.pages });
  return p.made !== undefined ? `${base} · ${t(job.kind === "cards" ? "pdf.cardsSoFar" : "pdf.questionsSoFar", { n: p.made })}` : base;
}

function drawMake(container, rec, job) {
  const title = t(`pdf.kind.${job.kind}`);
  const head = header({ backTo: "pdf", backParams: { id: rec.id }, backLabel: rec.name, title: `${t(`pdf.icon.${job.kind}`)} ${title}`, sub: summaryLine(rec) });
  const handlers = { ...backHandler };
  let body = "";
  if (job.phase === "running") {
    body = html`<p class="sheet-status" id="pdfProgress">${progressText(job)}</p>
      <p class="hint">${t("pdf.canLeave")}</p>
      <div class="actions-row"><button type="button" class="btn btn-quiet" data-action="stop" ${job.cancel ? "disabled" : ""}>${job.cancel ? t("pdf.stopping") : t("pdf.stop")}</button></div>`;
    handlers.stop = () => { job.cancel = true; refresh(true); };
  } else if (job.phase === "review") {
    ({ body } = reviewView(rec, job, handlers));
  } else if (job.phase === "done" || job.phase === "error") {
    body = html`${job.phase === "error" ? html`<p class="warn-box pre">${job.error}</p>` : html`<p class="ok-box">${job.message}</p>`}
      ${job.extra ? html`<p class="hint">${job.extra}</p>` : ""}
      <div class="actions-row">
        ${job.kind === "read" ? html`<button type="button" class="btn" data-action="check">${t("pdf.checkPages")}</button>` : ""}
        <button type="button" class="btn ${job.kind === "read" ? "btn-quiet" : ""}" data-action="again">${job.phase === "error" ? t("pdf.tryAgain") : t("common.done")}</button></div>`;
    handlers.check = () => { jobs.delete(jobKey(rec.id, job.kind)); go("pdf-page", { id: rec.id, n: job.firstPage || 1 }); };
    handlers.again = () => {
      if (job.phase === "error") { job.phase = "form"; job.cancel = false; refresh(true); return; }
      jobs.delete(jobKey(rec.id, job.kind)); go("pdf", { id: rec.id });
    };
  } else {
    ({ body } = formView(rec, job, handlers));
  }
  container.innerHTML = html`${head}${body}`;
  onAction(container, handlers);
  bindForm(container, job);
  if (job.phase === "review") {
    container.querySelectorAll("input[data-i]").forEach((c) => c.addEventListener("change", () => {
      const i = Number(c.dataset.i);
      if (c.checked) job.keep.add(i); else job.keep.delete(i);
      c.closest(".qcard")?.classList.toggle("off", !c.checked);
      const save = container.querySelector('[data-action="save"]');
      if (save) save.textContent = t(job.kind === "cards" ? "pdf.saveCards" : "pdf.saveQuestions", { n: job.keep.size });
    }));
    container.querySelector("#noteText")?.addEventListener("input", (e) => { job.noteText = e.target.value; });
    typesetMath(container);
  }
}

/** Keeps form values in the job, so a redraw never loses what you typed. */
function bindForm(container, job) {
  container.querySelectorAll("[data-cfg]").forEach((el) => {
    const k = el.dataset.cfg;
    el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
      job.cfg[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    });
  });
}

const pills = (job, key, values, label) => html`<div class="chip-wrap">${values.map((v) => html`<button type="button" class="pill ${String(job.cfg[key]) === String(v) ? "on" : ""}" data-action="set" data-k="${key}" data-v="${v}">${label(v)}</button>`)}</div>`;

function formView(rec, job, handlers) {
  const cfg = job.cfg;
  const c = T.pageCounts(rec.pages);
  handlers.set = (el) => { const k = el.dataset.k; cfg[k] = ["n"].includes(k) ? Number(el.dataset.v) : el.dataset.v; refresh(true); };
  handlers.start = () => start(rec, job);

  if (job.kind === "read") {
    const need = T.pageNumbers(rec.pages, T.needsAi);
    const counts = [5, 10, 20, 40].filter((x) => x < need.length);
    const body = need.length ? html`<p>${t("pdf.readIntro", { n: need.length })}</p>
      <p class="hint">${t("pdf.readHint")}</p>
      <h3>${t("pdf.readHowMany")}</h3>
      ${pills(job, "readCount", [...counts, "all"], (v) => (v === "all" ? t("pdf.readAll", { n: need.length }) : t("pdf.readFirst", { n: v })))}
      <div class="actions-row"><button type="button" class="btn" data-action="start">${t("pdf.startReading")}</button></div>`
      : html`<p class="ok-box">${t("pdf.nothingToRead")}</p>`;
    return { body };
  }

  const target = html`<h3>${t("pdf.saveTo")}</h3>
    <button type="button" class="row" data-action="target"><span class="row-main"><span class="row-title">${targetLabel(cfg.target)}</span></span><span class="chev-txt">${t("pdf.change")}</span></button>`;
  handlers.target = () => runFlow(async () => {
    const pick = await pickTopic({ title: t("pdf.saveTo"), current: cfg.target });
    if (pick?.topicId) {
      cfg.target = pick;
      const s = savedStyle(pick);
      if (s) { cfg.style = s.text; cfg.styleAt = s.at; }
      cfg.styleNote = "";
    }
  }).then(() => refresh(true));
  const range = html`<div class="two-col">
      <label class="field-label">${t("pdf.fromPage")}<input class="field" type="number" min="1" max="${rec.pages.length}" value="${cfg.from}" data-cfg="from" inputmode="numeric"></label>
      <label class="field-label">${t("pdf.toPage")}<input class="field" type="number" min="1" max="${rec.pages.length}" value="${cfg.to}" data-cfg="to" inputmode="numeric"></label></div>
    ${c.need ? html`<p class="hint">${t("pdf.skipsScanned", { n: c.need })}</p>` : ""}`;
  const langPills = html`<h3>${t("pdf.lang")}</h3>${pills(job, "lang", ["same", "en", "ml"], (v) => t(`pdf.langs.${v}`))}`;

  if (job.kind === "questions") {
    const pool = pyqPool(cfg.target).length;
    handlers.learn = async (el) => {
      if (!(await ensureAi())) return;
      const examples = pickRandom(pyqPool(cfg.target), 20);
      const note = document.querySelector("#styleNote");
      if (examples.length < 3) { note.textContent = t("pdf.styleFew"); return; }
      el.disabled = true; note.textContent = t("pdf.styleLearning");
      try {
        const text = await jobsApi.buildStyleGuide(englishPath(cfg.target.topicId), examples);
        cfg.style = text; cfg.styleAt = Date.now(); cfg.styleNote = t("pdf.styleBuilt");
        await saveStyle(cfg.target, text);
      } catch (e) { cfg.styleNote = `✗ ${errorText(e)}`; }
      refresh(true);
    };
    handlers["style-default"] = () => { cfg.style = DEFAULT_STYLE; cfg.styleNote = ""; refresh(true); };
    const note = cfg.styleNote || (cfg.styleAt ? t("pdf.styleSaved", { date: new Date(cfg.styleAt).toLocaleDateString("en-IN"), n: pool }) : pool ? t("pdf.styleCanLearn", { n: pool }) : t("pdf.styleNoPyq"));
    return { body: html`${target}${range}
      <h3>${t("pdf.howMany")}</h3>${pills(job, "n", [5, 10, 15, 20, 30], (v) => v)}
      <h3>${t("ai.genDiff")}</h3>${pills(job, "difficulty", ["mixed", "E", "M", "D"], (v) => (v === "mixed" ? t("ai.mixed") : t(`question.difficulty.${v}`)))}
      ${langPills}
      <h3>${t("pdf.style")}</h3>
      <p class="hint">${t("pdf.styleHint")}</p>
      <textarea class="field" rows="7" data-cfg="style" aria-label="${t("pdf.style")}">${cfg.style}</textarea>
      <p class="hint" id="styleNote">${note}</p>
      <div class="actions-row"><button type="button" class="btn btn-quiet btn-small" data-action="learn">🔄 ${t("pdf.styleLearn")}</button>
        <button type="button" class="btn btn-quiet btn-small" data-action="style-default">${t("pdf.styleDefault")}</button></div>
      <label class="switch-row"><input type="checkbox" data-cfg="check" ${cfg.check ? "checked" : ""}><span>${t("pdf.check")}<span class="row-sub">${t("pdf.checkHint")}</span></span></label>
      <p class="hint">${t("pdf.groundedNote")}</p>
      <div class="actions-row"><button type="button" class="btn" data-action="start">${t("ai.generate")}</button></div>` };
  }
  if (job.kind === "cards") {
    return { body: html`${target}${range}
      <h3>${t("pdf.howManyCards")}</h3>${pills(job, "n", [10, 20, 30, 50], (v) => v)}
      ${langPills}
      <p class="hint">${t("pdf.groundedNote")}</p>
      <div class="actions-row"><button type="button" class="btn" data-action="start">${t("ai.generate")}</button></div>` };
  }
  return { body: html`${target}${range}
    <h3>${t("pdf.length")}</h3>${pills(job, "detail", ["short", "detailed"], (v) => t(`pdf.detail.${v}`))}
    ${langPills}
    <p class="hint">${t("pdf.noteLimit", { n: jobsApi.NOTE_MAX_SECTIONS })}</p>
    <div class="actions-row"><button type="button" class="btn" data-action="start">${t("ai.generate")}</button></div>` };
}

async function start(rec, job) {
  if (!(await ensureAi())) return;
  const cfg = job.cfg;
  const fresh = await pdfStore.getPdf(rec.id); // page text may have been corrected meanwhile
  if (!fresh) return go("pdfs");
  let pagesToRead = [];
  if (job.kind === "read") {
    const need = T.pageNumbers(fresh.pages, T.needsAi);
    pagesToRead = cfg.readCount === "all" ? need : need.slice(0, Number(cfg.readCount));
    if (!pagesToRead.length) { toast(t("pdf.nothingToRead")); return; }
  } else {
    if (!cfg.target?.topicId) { toast(t("pdf.pickTopicFirst")); return; }
    let from = Math.max(1, Math.round(Number(cfg.from)) || 1); let to = Math.min(fresh.pages.length, Math.round(Number(cfg.to)) || fresh.pages.length);
    if (from > to) [from, to] = [to, from];
    cfg.from = from; cfg.to = to;
    if (!T.buildChunks(fresh.pages, from, to).length) { toast(t("pdf.noTextInRange", { from, to })); return; }
    if (job.kind === "questions") {
      cfg.style = String(cfg.style || "").trim() || DEFAULT_STYLE;
      if (cfg.style !== DEFAULT_STYLE) await saveStyle(cfg.target, cfg.style);
      cfg.examples = pickRandom(pyqPool(cfg.target), 4).map((q) => ({ text: q.text, options: q.options }));
    }
  }
  job.phase = "running"; job.cancel = false; job.progress = null; job.error = null;
  refresh(true);
  const step = (p) => {
    job.progress = p;
    const el = document.querySelector("#pdfProgress");
    if (el && onScreen("pdf-make", { id: rec.id, kind: job.kind })) el.textContent = progressText(job);
  };
  try {
    if (job.kind === "read") {
      const done = await jobsApi.readPages(rec.id, pagesToRead, job, step);
      job.phase = "done"; job.firstPage = pagesToRead[0];
      job.message = t("pdf.readDone", { n: done }) + (job.cancel ? ` ${t("pdf.stoppedEarly")}` : "");
      job.extra = t("pdf.readCheck");
    } else if (job.kind === "questions") {
      const r = await jobsApi.makeQuestions(fresh.pages, cfg, job, step);
      finishItems(job, r, r.items, (it) => T.passedAll(it));
    } else if (job.kind === "cards") {
      const r = await jobsApi.makeCards(fresh.pages, cfg, job, step);
      finishItems(job, r, r.items, (it) => T.passedAll(it));
    } else {
      const r = await jobsApi.makeNote(fresh.pages, cfg, job, step);
      job.result = r;
      if (!r.text) { job.phase = "error"; job.error = [r.abortMsg ? errorText(r.abortMsg) : null, t("pdf.noNote")].filter(Boolean).join("\n\n"); }
      else { job.phase = "review"; job.noteText = `${t("pdf.noteHead", { name: fresh.name })}\n${r.text}`; }
    }
  } catch (e) {
    job.phase = "error";
    job.error = errorText(e) + (job.kind === "read" ? `\n\n${t("pdf.readPartial", { n: e?.done || 0 })}` : "");
  }
  if (job.cancel && job.phase === "error" && job.kind !== "read") job.error = t("pdf.stoppedNothing");
  refresh(true);
}

function finishItems(job, r, items, preTick) {
  job.result = r;
  if (!items.length) {
    job.phase = "error";
    job.error = [r.abortMsg ? errorText(r.abortMsg) : null, job.cancel ? t("pdf.stoppedNothing") : t("pdf.nonePassed", { bad: r.tot.badQuote })].filter(Boolean).join("\n\n");
    return;
  }
  job.phase = "review";
  job.keep = new Set(items.map((it, i) => (preTick(it) ? i : -1)).filter((i) => i >= 0));
}

function badges(it, rec) {
  const b = [html`<span class="badge ok">📄 p.${it.page}</span>`];
  b.push(it.quoteLevel === "exact" ? html`<span class="badge ok">✓ ${t("pdf.quoteFound")}</span>` : html`<span class="badge warn">≈ ${t("pdf.quoteClose")}</span>`);
  if (rec.pages[(it.page || 1) - 1]?.src === "ai") b.push(html`<span class="badge warn">${t("pdf.aiReadPage")}</span>`);
  if (it.check === "agree") b.push(html`<span class="badge ok">✓ ${t("pdf.checkAgree")}</span>`);
  else if (it.check === "disagree") b.push(html`<span class="badge bad">⚠ ${t("pdf.checkDisagree", { letter: letterFor(it.checkAnswer) })}</span>`);
  else if (it.check === "unclear") b.push(html`<span class="badge warn">⚠ ${t("pdf.checkUnclear")}</span>`);
  if (it.flag) b.push(html`<span class="badge warn">⚠ ${t("pdf.numberFlag")}</span>`);
  return html`<div class="badges">${b}</div>`;
}

function stoppedNote(r) {
  return r.abortMsg ? html`<p class="warn-box pre">${t("pdf.stoppedEarlyBecause", { why: errorText(r.abortMsg).slice(0, 240) })}</p>` : "";
}

function reviewView(rec, job, handlers) {
  const r = job.result; const cfg = job.cfg;
  const tg = cfg.target; const topic = store.topic(tg.topicId);
  handlers.discard = () => runFlow(async () => {
    const ok = await confirmAction({ title: t("pdf.discardTitle"), confirmLabel: t("ai.discard"), danger: true });
    if (ok) { jobs.delete(jobKey(rec.id, job.kind)); go("pdf", { id: rec.id }); }
  });
  if (job.kind === "note") {
    handlers.copy = () => copyText(job.noteText);
    handlers.save = async () => {
      const text = job.noteText.trim();
      if (!text || !topic) return;
      await mut.appendNote({ type: "topic", id: topic.id }, topic.name, text);
      jobs.delete(jobKey(rec.id, job.kind));
      toast(t("pdf.noteSaved", { topic: nameLabel(topic) }));
      go("topic", { id: topic.id });
    };
    return { body: html`<p class="hint">${t("pdf.noteReview", { to: targetLabel(tg) })}${r.tot.dropped ? ` ${t("pdf.noteDropped", { n: r.tot.dropped })}` : ""}</p>
      ${stoppedNote(r)}
      <textarea class="field page-text" id="noteText" rows="16" aria-label="${t("pdf.kind.note")}">${job.noteText}</textarea>
      <p class="hint">${t("ai.verify")}</p>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="discard">${t("ai.discard")}</button>
        <button type="button" class="btn btn-quiet" data-action="copy">${t("question.copy")}</button>
        <button type="button" class="btn" data-action="save">${t("pdf.saveNote")}</button></div>` };
  }
  const items = r.items;
  const dropped = r.tot.badQuote + (r.tot.badShape || 0);
  const source = (it) => html`<details class="source"><summary>${t("pdf.sourceLine")}</summary><p class="quote">${it.quote}</p></details>`;
  const isCards = job.kind === "cards";
  handlers.save = async () => {
    const chosen = items.filter((_, i) => job.keep.has(i));
    if (!chosen.length) { toast(t("ai.nothingChosen")); return; }
    if (!topic) { toast(t("pdf.pickTopicFirst")); return; }
    const syllabus = store.currentSyllabus();
    const ref = (it) => ({ pdf: rec.name, pdfId: rec.id, page: it.page, quote: it.quote });
    if (isCards) {
      await mut.saveCards(syllabus.id, topic.subjectId, topic.id, chosen.map((it) => ({ front: it.front, back: it.back, sourceRef: ref(it) })));
      toast(t("pdf.cardsSaved", { n: chosen.length }));
    } else {
      await mut.saveAiQuestions(syllabus, topic.subjectId, topic.id, chosen.map((it) => ({
        text: it.text, options: it.options, answerIndex: it.answerIndex, difficulty: it.difficulty,
        explanation: `${it.explanation ? `${it.explanation}\n\n` : ""}📄 ${t("pdf.sourceRef", { name: rec.name, page: it.page })}\n“${it.quote}”`,
        sourceRef: ref(it)
      })));
      toast(t("ai.savedN", { n: chosen.length }));
    }
    jobs.delete(jobKey(rec.id, job.kind));
    go("topic", { id: topic.id, mode: isCards ? "cards" : "ai" });
  };
  const list = items.map((it, i) => html`<article class="qcard gen ${job.keep.has(i) ? "" : "off"}">
    <label class="switch-row"><input type="checkbox" data-i="${i}" ${job.keep.has(i) ? "checked" : ""}><strong>${isCards ? `${i + 1}.` : t("ai.genQ", { n: i + 1 })}</strong>${it.type ? html`<span class="hint"> · ${it.type}</span>` : ""}</label>
    ${isCards ? html`<div class="qtext"><strong>Q:</strong> ${richText(it.front)}</div><div class="qtext"><strong>A:</strong> ${richText(it.back)}</div>`
      : html`<div class="qtext">${richText(it.text)}</div>
      <ol class="options">${it.options.map((o, j) => html`<li class="${j === it.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === it.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>`}
    ${badges(it, rec)}
    ${source(it)}
    ${!isCards && it.explanation ? html`<p class="hint">${richText(it.explanation)}</p>` : ""}
  </article>`);
  return { body: html`<p class="hint">${t(isCards ? "pdf.reviewCards" : "pdf.reviewQuestions", { n: items.length, to: targetLabel(tg) })}${dropped ? ` ${t("pdf.droppedN", { n: dropped, bad: r.tot.badQuote })}` : ""}</p>
    <p class="warn-box">${t("pdf.reviewTick")}</p>
    ${stoppedNote(r)}
    ${list}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="discard">${t("ai.discard")}</button>
      <button type="button" class="btn" data-action="save">${t(isCards ? "pdf.saveCards" : "pdf.saveQuestions", { n: job.keep.size })}</button></div>` };
}

/** "📄 Study PDFs" entry for a topic or subject ⋯ menu. */
export const pdfMenuItem = (type, id) => ({ id: "pdfs", label: `📄 ${t("pdf.title")}`, run: () => go("pdfs", { type, id }) });
