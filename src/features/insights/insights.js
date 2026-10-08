/* Smart insights: your tests + the past-paper collection + your study PDFs.
   #/insights            weak spots, mistake patterns, notes check per topic, best time of day & focus
   #/insight-topic?id=…  one topic: which missed facts are in your notes (with page),
                         and what to do (cards, focused practice from the PDF, retry)
   The counting and matching is done in code; AI only explains (optional). */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { toast } from "../../core/toast.js";
import { can } from "../../core/entitlements.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import { letterFor } from "../../domain/text.js";
import { answerRecords, pickByBasis, accuracyBy, guessSummary, markingInfo, isTimed } from "../../domain/stats.js";
import { rankWeakSpots, mistakeStats, checkFact } from "../../domain/insights.js";
import { pageCounts } from "../../pdf/pdf-tools.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import * as presets from "../../ai/presets.js";
import * as P from "../../ai/prompts.js";
import { listPdfs } from "../../pdf/pdf-store.js";
import { finishedTests } from "../progress/data.js";
import { stillWrongQuestions } from "../library/banks.js";
import { openStartTest } from "../test/start-sheet.js";
import { askInSheet, ensureAi } from "../ai/ai-ui.js";
import { openPrepared } from "../pdfs/pdfs.js";
import { chev } from "../library/library.js";
import { focusSection } from "./focus-view.js";

const lang = async () => (await presets.getConfig()).lang || "en";

/** Past-paper answers only (AI questions are kept apart). */
function pyqRecords(syllabus) {
  const attempts = finishedTests(syllabus.id).filter((a) => a.kind !== "ai");
  return answerRecords(attempts).filter((r) => { const q = store.question(r.questionId); return q && q.source !== "ai"; });
}

function topicFigures(syllabus, records) {
  const freq = new Map();
  store.questionsFor({ syllabusId: syllabus.id }).forEach((q) => freq.set(q.topicId, (freq.get(q.topicId) || 0) + 1));
  const acc = accuracyBy(pickByBasis(records, "first"), (r) => r.topicId);
  const timed = pickByBasis(records, "first", isTimed);
  const secs = new Map(); timed.forEach((r) => { const a = secs.get(r.topicId) || []; a.push(r.timeMs / 1000); secs.set(r.topicId, a); });
  const byTopic = new Map();
  freq.forEach((f, topicId) => {
    if (store.topic(topicId)?.isFallback) return; // the catch-all topic isn't a study target
    const a = acc[topicId];
    const s = secs.get(topicId);
    const g = guessSummary(records.filter((r) => r.topicId === topicId), syllabus.marking);
    byTopic.set(topicId, { freq: f, n: a?.total || 0, correct: a?.correct || 0, adj: a ? a.adj : null, avgSec: s?.length >= 2 ? s.reduce((x, y) => x + y, 0) / s.length : null, guessNet: g.n ? g.net : 0 });
  });
  return byTopic;
}

const pct = (x) => `${Math.round(x * 100)}%`;
/* Weak spots: which topics (all / practised / not practised yet) and top 10 or all. Kept while the app is open. */
const weakView = { filter: "all", showAll: false };
const WEAK_FILTERS = ["all", "done", "todo"];
const TOP_N = 10;
function reasonChips(r) {
  return html`<span class="chips-inline">${r.reasons.map((k) => html`<span class="mini-chip r-${k}">${t(`insights.reason.${k}`)}</span>`)}</span>`;
}

/* ---------- #/insights ---------- */

export const insightsScreen = {
  id: "insights",
  parent: "progress",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const records = pyqRecords(syllabus);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("tabs.progress")}</span></button></div>
      <h1>${t("insights.title")}</h1><p class="hint">${t("insights.sub")}</p></header>
      <div id="insBody"><p class="sheet-status pad">${t("pdf.loading")}</p></div>`;
    onAction(container, { back: () => go("progress") });
    listPdfs().then((pdfs) => {
      const body = container.querySelector("#insBody");
      if (!body?.isConnected) return;
      const pdfTopics = new Set(); const pdfSubjects = new Set();
      pdfs.forEach((p) => { if (p.owner?.type === "topic") pdfTopics.add(p.owner.id); if (p.owner?.type === "subject") pdfSubjects.add(p.owner.id); });
      const hasNotes = (id) => pdfTopics.has(id) || pdfSubjects.has(store.topic(id)?.subjectId);
      const byTopic = topicFigures(syllabus, records);
      const KEEP = { all: () => true, done: (r) => r.adj !== null, todo: (r) => r.adj === null };
      const pool = rankWeakSpots(byTopic, { hasNotes, limit: Infinity, all: weakView.showAll });
      const ranked = pool.filter(KEEP[weakView.filter]);
      const weak = weakView.showAll ? ranked : ranked.slice(0, TOP_N);
      const everyTopic = weakView.showAll ? pool : rankWeakSpots(byTopic, { hasNotes, limit: Infinity, all: true });
      const filterCount = (f) => everyTopic.filter(KEEP[f]).length; // counts are always of every topic
      const wrongQs = stillWrongQuestions(syllabus.id);
      const lastRec = new Map(); records.forEach((r) => { if (r.graded) lastRec.set(r.questionId, r); });
      const wrong = wrongQs.map((q) => ({ q, r: lastRec.get(q.id) })).filter((x) => x.r);
      const ms = mistakeStats(wrong);
      const wrongByTopic = new Map(); wrongQs.forEach((q) => wrongByTopic.set(q.topicId, (wrongByTopic.get(q.topicId) || 0) + 1));
      const notesRows = [...wrongByTopic.entries()].filter(([id]) => hasNotes(id)).sort((a, b) => b[1] - a[1]);
      const noNotesRows = [...wrongByTopic.entries()].filter(([id]) => !hasNotes(id) && store.topic(id)).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const ai = can("ai");

      body.innerHTML = html`
        ${records.length ? "" : html`<p class="warn-box">${t("insights.noTests")}</p>`}
        <section class="ins-block">
          <h2 class="section-title">1 · ${t("insights.weakTitle")}</h2>
          <p class="hint">${t("insights.weakHint")}</p>
          <div class="chip-row" role="group" aria-label="${t("insights.weakTitle")}">${WEAK_FILTERS.map((f) => html`<button type="button" class="pill ${weakView.filter === f ? "on" : ""}" data-action="wfilter" data-f="${f}" aria-pressed="${String(weakView.filter === f)}">${t(`insights.wf.${f}`)} <span class="count">${filterCount(f)}</span></button>`)}</div>
          ${weakView.filter === "todo" ? html`<p class="hint">${t("insights.todoHint")}</p>` : ""}
          ${weak.length ? html`<div class="rows">${weak.map((r, i) => html`<button type="button" class="row" data-action="topic" data-id="${r.topicId}">
            <span class="row-main"><span class="row-title">${i + 1}. ${nameHtml(store.topic(r.topicId))}</span>
              <span class="row-sub">${nameLabel(store.subject(store.topic(r.topicId)?.subjectId))} · ${t("insights.inPapers", { n: r.freq })} · ${r.adj === null ? t("stats.notTried") : t("insights.right", { pct: pct(r.correct / Math.max(1, r.n)), n: r.n })}${r.avgSec ? ` · ${Math.round(r.avgSec)} s` : ""}</span>
              ${reasonChips(r)}</span>${chev}</button>`)}</div>
            ${ranked.length > TOP_N || weakView.showAll ? html`<button type="button" class="link" data-action="wall">${weakView.showAll ? t("insights.showTop", { n: TOP_N }) : t("insights.showAll")}</button>` : ""}
            ${ai ? html`<button type="button" class="btn btn-quiet" data-action="ai-weak">🤖 ${t("insights.aiWeak")}</button>` : ""}`
          : html`<p class="hint pad">${weakView.filter === "all" ? t("insights.noWeak") : t("insights.noneInFilter")}</p>
            ${weakView.showAll ? "" : html`<button type="button" class="link" data-action="wall">${t("insights.showAll")}</button>`}`}
        </section>
        <section class="ins-block">
          <h2 class="section-title">2 · ${t("insights.patternsTitle")}</h2>
          ${ms.total ? html`<p class="hint">${t("insights.patternsHint", { n: ms.total })}</p>
            <div class="facts">
              ${[["statement", ms.statement], ["notQ", ms.notQ], ["numbers", ms.numbers], ["guessed", ms.guessed], ["quick", ms.quick], ["blank", ms.blank]].filter(([, n]) => n)
                .map(([k, n]) => html`<div class="fact"><span class="fact-n">${n}</span><span class="fact-l">${t(`insights.ms.${k}`)}</span></div>`)}</div>
            ${ai ? html`<button type="button" class="btn btn-quiet" data-action="ai-patterns">🤖 ${t("insights.aiPatterns")}</button>` : ""}`
          : html`<p class="hint pad">${t("insights.noWrong")}</p>`}
        </section>
        <section class="ins-block">
          <h2 class="section-title">3 · ${t("insights.notesTitle")}</h2>
          <p class="hint">${t("insights.notesHint")}</p>
          ${notesRows.length ? html`<div class="rows">${notesRows.map(([id, n]) => html`<button type="button" class="row" data-action="topic" data-id="${id}">
            <span class="row-main"><span class="row-title">${nameHtml(store.topic(id))}</span><span class="row-sub">${t("insights.missedN", { n })} · 📄</span></span>${chev}</button>`)}</div>`
          : html`<p class="hint pad">${pdfs.length ? t("insights.noNotesMatch") : t("insights.noPdfs")}</p>`}
          ${noNotesRows.length ? html`<p class="hint">${t("insights.noNotesFor")}</p><div class="rows">${noNotesRows.map(([id, n]) => html`<button type="button" class="row" data-action="topic" data-id="${id}">
            <span class="row-main"><span class="row-title">${nameHtml(store.topic(id))}</span><span class="row-sub">${t("insights.missedN", { n })} · ${t("insights.reason.nonotes")}</span></span>${chev}</button>`)}</div>` : ""}
        </section>
        ${focusSection(syllabus, 4)}
        <section class="ins-block">
          <h2 class="section-title">5 · ${t("insights.practiceTitle")}</h2>
          <p class="hint">${t("insights.practiceHint")}</p>
        </section>`;

      onAction(body, {
        topic: (el) => go("insight-topic", { id: el.dataset.id }),
        wfilter: (el) => { weakView.filter = el.dataset.f; store.touch(); },
        wall: () => { weakView.showAll = !weakView.showAll; store.touch(); },
        "ai-weak": async () => {
          if (!(await ensureAi())) return;
          const mk = markingInfo(syllabus.marking);
          const rows = weak.slice(0, TOP_N).map((r, i) => `${i + 1}. ${pathEn(r.topicId)}: ${r.freq} past-paper questions; ${r.adj === null ? "not practised" : `${r.correct}/${r.n} right`}${r.avgSec ? `; ${Math.round(r.avgSec)}s per question` : ""}${r.guessNet < 0 ? `; guessing net ${r.guessNet} marks` : ""}${r.reasons.includes("nonotes") ? "; no study notes added" : ""}`);
          await askInSheet({
            title: t("insights.aiWeak"), maxTokens: 2500, system: P.tutorSystem(await lang()), user: P.weakSpotsTask(rows, mk),
            actions: [{ id: "save", label: t("ai.saveToNotes"), run: async (text) => { await mut.saveNote({ type: "misc", id: "ai-weak" }, t("insights.weakNote"), `${t("insights.weakNote")} — ${new Date().toLocaleDateString(dateLocale())}\n\n${text}`); toast(t("ai.savedToNotes")); return true; } }]
          });
        },
        "ai-patterns": async () => {
          if (!(await ensureAi())) return;
          const sample = wrong.slice(-30);
          const ex = sample.map(({ q, r }, i) => `${i + 1}. [${pathEn(q.topicId)}] ${q.text.slice(0, 220)}\n   Options: ${q.options.map((o, j) => `${letterFor(j)}) ${String(o).slice(0, 60)}`).join("  ")}\n   Your answer: ${r.selected === null ? "left blank" : letterFor(r.selected)}${r.guessed ? " (guess)" : ""} · Right: ${letterFor(q.answerIndex)}${r.timeMs ? ` · ${Math.round(r.timeMs / 1000)}s` : ""}`);
          const stats = `${ms.total} still wrong; ${ms.statement} statement-type, ${ms.notQ} 'NOT' questions, ${ms.numbers} with a number/year answer, ${ms.guessed} guessed, ${ms.quick} answered in under 10 s, ${ms.blank} left blank.`;
          await askInSheet({
            title: t("insights.aiPatterns"), maxTokens: 3000, system: P.tutorSystem(await lang()), user: P.patternsTask(stats, ex),
            actions: [{ id: "save", label: t("ai.saveToNotes"), run: async (text) => { await mut.saveNote({ type: "misc", id: "ai-patterns" }, t("insights.patternsNote"), `${t("insights.patternsNote")} — ${new Date().toLocaleDateString(dateLocale())}\n\n${text}`); toast(t("ai.savedToNotes")); return true; } }]
          });
        }
      });
    });
  }
};

const pathEn = (topicId) => { const x = store.topic(topicId); return x ? `${store.subject(x.subjectId)?.name || ""} › ${x.name}` : "?"; };

/* ---------- #/insight-topic ---------- */

export const insightTopicScreen = {
  id: "insight-topic",
  parent: "progress",
  render(container, { id }) {
    const topic = store.topic(id);
    const syllabus = store.currentSyllabus();
    if (!topic || !syllabus) return go("insights");
    const missed = stillWrongQuestions(syllabus.id).filter((q) => q.topicId === id);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("insights.title")}</span></button></div>
      <h1>${nameHtml(topic)}</h1><p class="hint">${nameLabel(store.subject(topic.subjectId))} · ${t("insights.missedN", { n: missed.length })}</p></header>
      <div id="itBody"><p class="sheet-status pad">${t("pdf.loading")}</p></div>`;
    onAction(container, { back: () => go("insights") });
    listPdfs().then((all) => {
      const body = container.querySelector("#itBody");
      if (!body?.isConnected) return;
      const pdfs = all.filter((p) => (p.owner?.type === "topic" && p.owner.id === id) || (p.owner?.type === "subject" && p.owner.id === topic.subjectId)
        || (p.owner?.type === "topic" && store.topic(p.owner.id)?.subjectId === topic.subjectId));
      // Each missed question: checked against every PDF; the best result wins.
      const rank = { found: 3, maybe: 2, missing: 1, unknown: 0 };
      const rows = missed.map((q) => {
        let best = { status: pdfs.length ? "missing" : "nopdf", page: null, pdf: null };
        pdfs.forEach((p) => {
          const pages = p.pages.map((pg, i) => ({ n: i + 1, t: pg?.t || "" })).filter((x) => x.t);
          const r = checkFact(q, pages);
          if (r.status === "unknown") { if (best.status === "missing" || best.status === "nopdf") best = { ...r, pdf: null }; return; }
          if (rank[r.status] > (rank[best.status] ?? -1)) best = { ...r, pdf: p };
        });
        return { q, ...best };
      });
      const by = (s) => rows.filter((r) => r.status === s);
      const found = [...by("found"), ...by("maybe")];
      const pdfHits = new Map(); found.forEach((r) => pdfHits.set(r.pdf.id, (pdfHits.get(r.pdf.id) || 0) + 1));
      const topPdf = [...pdfHits.entries()].sort((a, b) => b[1] - a[1])[0];
      const focusPdf = topPdf ? pdfs.find((p) => p.id === topPdf[0]) : null;
      const focusRows = focusPdf ? found.filter((r) => r.pdf.id === focusPdf.id) : [];
      const existing = new Set(store.all("flashcards").map((c) => c.sourceRef?.questionId).filter(Boolean));
      const newCards = missed.filter((q) => !existing.has(q.id));
      const ans = (q) => q.options[q.answerIndex];
      const item = (r) => html`<article class="qcard fact-row">
        <div class="qtext clamp">${r.q.text}</div>
        <p class="hint">✓ ${t("insights.answer")}: <strong>${ans(r.q)}</strong></p>
        ${r.page ? html`<button type="button" class="link" data-action="page" data-pdf="${r.pdf.id}" data-n="${r.page}">📄 ${r.pdf.name}, ${t("pdf.page")} ${r.page} ›</button>` : ""}
      </article>`;
      const section = (key, list) => (list.length ? html`<h3 class="rows-head">${t(`insights.fact.${key}`, { n: list.length })}</h3><p class="hint">${t(`insights.factHint.${key}`)}</p>${list.map(item)}` : "");

      body.innerHTML = html`
        ${missed.length ? "" : html`<p class="ok-box">${t("insights.noMissedTopic")}</p>`}
        ${missed.length && !pdfs.length ? html`<p class="warn-box">${t("insights.addPdf")}</p>
          <button type="button" class="btn btn-quiet" data-action="add-pdf">📄 ${t("pdf.add")}</button>` : ""}
        ${pdfs.length && missed.length ? html`<div class="facts">
          <div class="fact"><span class="fact-n">${by("found").length + by("maybe").length}</span><span class="fact-l">${t("insights.inNotes")}</span></div>
          <div class="fact"><span class="fact-n">${by("missing").length}</span><span class="fact-l">${t("insights.notInNotes")}</span></div>
          ${by("unknown").length ? html`<div class="fact"><span class="fact-n">${by("unknown").length}</span><span class="fact-l">${t("insights.cantTell")}</span></div>` : ""}</div>
          <p class="hint">${t("insights.checkedIn", { names: pdfs.map((p) => p.name).join(", ") })}</p>` : ""}
        ${missed.length ? html`<div class="actions-col">
          <button type="button" class="btn" data-action="retry">▶ ${t("insights.retry", { n: missed.length })}</button>
          ${newCards.length ? html`<button type="button" class="btn btn-quiet" data-action="cards">🃏 ${t("insights.toCards", { n: newCards.length })}</button>` : ""}
          ${focusPdf && can("ai") ? html`<button type="button" class="btn btn-quiet" data-action="focus">🎯 ${t("insights.focus", { n: focusRows.length, name: focusPdf.name })}</button>` : ""}
        </div>` : ""}
        ${section("missing", by("missing"))}
        ${section("found", by("found"))}
        ${section("maybe", by("maybe"))}
        ${section("unknown", by("unknown"))}
        ${section("nopdf", by("nopdf"))}`;

      onAction(body, {
        page: (el) => go("pdf-page", { id: el.dataset.pdf, n: el.dataset.n }),
        "add-pdf": () => go("pdfs", { type: "topic", id }),
        retry: () => openStartTest({ scope: { type: "topic", ref: id, label: `${topic.name} — ${t("insights.missedLabel")}` }, questions: missed, keepOrder: false }),
        cards: async () => {
          await mut.saveCards(syllabus.id, topic.subjectId, id, newCards.map((q) => ({ front: q.text, back: ans(q), sourceRef: { questionId: q.id, paperId: q.paperId } })), "pyq");
          toast(t("insights.cardsMade", { n: newCards.length }), { actionLabel: t("insights.open"), onAction: () => go("topic", { id, mode: "cards" }) });
        },
        focus: () => {
          const pagesSet = [...new Set(focusRows.map((r) => r.page))].sort((a, b) => a - b);
          // A little context around each page: the page after it often continues the passage.
          const withNext = [...new Set(pagesSet.flatMap((n) => [n, n + 1]))].filter((n) => n <= focusPdf.pages.length && pageCounts([focusPdf.pages[n - 1]]).readable).sort((a, b) => a - b);
          openPrepared(focusPdf.id, "questions", {
            target: { subjectId: topic.subjectId, topicId: id }, only: withNext, focus: focusRows.map((r) => `${r.q.text.slice(0, 80)} → ${ans(r.q)}`),
            n: Math.min(20, Math.max(5, focusRows.length * 2)), from: 1, to: focusPdf.pages.length
          });
        }
      });
    });
  }
};

