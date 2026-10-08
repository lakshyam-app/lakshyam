/* AI questions, flashcards and PDF revision notes, always kept apart from your PYQs.
   - PYQ / AI / Cards / Notes switch on topic and subject pages (shown only when AI content exists)
   - Each can be narrowed to one study PDF ("From: …"), or shown together
   - AI questions: browse, practise, generate more, delete
   - Flashcards: study (tap to flip, "Again" / "Know it") or list; spaced review 1→3→7→14→30 days
   - #/ai-hub?kind=ai|cards: every topic that has AI questions or cards */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { richText, noteText } from "../../domain/text.js";
import { shuffle } from "../../domain/testing.js";
import { know, again, isDue } from "../../domain/cards.js";
import * as store from "../../data/store.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import { mountQuestions, visibleQuestions } from "../question/list.js";
import { copyQuestions } from "../question/copy.js";
import { openStartTest } from "../test/start-sheet.js";
import { generateQuestions } from "./ai-actions.js";
import { viewNote, editNote, viewText } from "../notes/note-editor.js";

const inScope = (x, scope) => (scope.topicId ? x.topicId === scope.topicId : scope.subjectId ? x.subjectId === scope.subjectId : true);

export const aiQuestions = (syllabusId, scope = {}) => store.questionsFor({ syllabusId, source: "ai" }).filter((q) => inScope(q, scope));
export const cardsOf = (syllabusId, scope = {}) => store.all("flashcards").filter((c) => c.syllabusId === syllabusId && inScope(c, scope));
/** Revision notes made from study PDFs, for a topic (or every topic of a subject). */
export const pdfNotesOf = (scope = {}) => store.all("notes").filter((n) => n.target?.type === "pdfnote")
  .filter((n) => (scope.topicId ? n.target.topicId === scope.topicId : scope.subjectId ? store.topic(n.target.topicId)?.subjectId === scope.subjectId : true))
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

/* ---------- which study PDF ("From: all / one PDF / not from a PDF") ---------- */

const fromBy = new Map(); // `${kind}:${scope}` → "all" | pdfId | "none"
const pdfOf = (x) => (x.target?.type === "pdfnote" ? x.target.pdfId : x.sourceRef?.pdfId) || null;
const pdfNameOf = (x) => (x.target?.type === "pdfnote" ? x.label : x.sourceRef?.pdf) || "PDF";

/** Chips to show one PDF's items or all together; hidden when everything comes from one place. */
function fromFilter(kind, scope, items) {
  const key = `${kind}:${scope.topicId || scope.subjectId || "all"}`;
  const groups = new Map();
  items.forEach((x) => { const id = pdfOf(x) || "none"; if (!groups.has(id)) groups.set(id, { id, name: id === "none" ? t("ai.from.none") : pdfNameOf(x), n: 0 }); groups.get(id).n++; });
  let cur = fromBy.get(key) || "all";
  if (cur !== "all" && !groups.has(cur)) cur = "all";
  const shown = cur === "all" ? items : items.filter((x) => (pdfOf(x) || "none") === cur);
  const chips = groups.size > 1 ? html`<div class="chip-row from-row" role="group" aria-label="${t("ai.from.label")}">
      <button type="button" class="pill ${cur === "all" ? "on" : ""}" data-action="from" data-k="${key}" data-v="all">${t("ai.from.all")} <span class="count">${items.length}</span></button>
      ${[...groups.values()].map((g) => html`<button type="button" class="pill ${cur === g.id ? "on" : ""}" data-action="from" data-k="${key}" data-v="${g.id}">${g.id === "none" ? "" : "📄 "}${g.name} <span class="count">${g.n}</span></button>`)}</div>` : "";
  return { chips, shown, cur, groups };
}
// Redraws the whole screen (fresh listeners), keeping the choice.
const fromHandler = { from: (el) => { fromBy.set(el.dataset.k, el.dataset.v); store.touch(); } };

const stateOf = (card) => store.byId("flashcardState", card.id) || { id: card.id, cardId: card.id, status: "new", reviews: 0, lastAt: null, dueAt: null };

/** The PYQ / AI / Cards switch; empty when there's no AI content here. */
export function contentSwitch(mode, counts, to, params) {
  if (!counts.ai && !counts.cards && !counts.notes && mode === "pyq") return "";
  // The icon is its own piece so narrow phones can hide it and keep each word whole.
  const btn = (m, label, n) => { const [, ico = "", word = label] = /^(\p{Extended_Pictographic}\S*)\s+(.+)$/u.exec(label) || []; return html`<button type="button" class="${mode === m ? "on" : ""}" data-action="content" data-to="${to}" data-mode="${m}" data-params="${JSON.stringify(params)}" aria-label="${word} ${n}"><span class="cs-word">${ico ? html`<span class="cs-ico" aria-hidden="true">${ico} </span>` : ""}${word}</span> <span class="count">${n}</span></button>`; };
  return html`<div class="segmented four content-switch">${btn("pyq", t("ai.cs.pyq"), counts.pyq)}${btn("ai", t("ai.cs.ai"), counts.ai)}${btn("cards", t("ai.cs.cards"), counts.cards)}${btn("notes", t("ai.cs.notes"), counts.notes || 0)}</div>`;
}
export const contentHandler = {
  content: (el) => { const p = JSON.parse(el.dataset.params); go(el.dataset.to, el.dataset.mode === "pyq" ? p : { ...p, mode: el.dataset.mode }); }
};

/* ---------- AI questions ---------- */

export function renderAiPanel(host, { syllabus, scope, topic = null, label }) {
  const every = aiQuestions(syllabus.id, scope);
  const from = fromFilter("ai", scope, every);
  const questions = from.shown;
  const key = `ai:${scope.topicId || scope.subjectId || "all"}:${from.cur}`;
  host.innerHTML = html`<p class="hint">${t("ai.separateNote")}</p>
    ${from.chips}
    <div class="actions-row">
      ${questions.length ? html`<button type="button" class="btn" data-action="ai-practice">▶ ${t("practice.button")}</button>` : ""}
      ${topic ? html`<button type="button" class="btn btn-quiet" data-action="ai-generate">${t("ai.generateMore")}</button>` : ""}
    </div>
    <div id="aiQHost"></div>
    ${questions.length ? html`<div class="row-actions pad">
      <button type="button" class="link" data-action="ai-copy">${t("listing.copy")}</button>
      <button type="button" class="link danger" data-action="ai-delete">${t("ai.deleteThese", { n: questions.length })}</button></div>` : ""}`;
  if (questions.length) mountQuestions(host.querySelector("#aiQHost"), { key, questions, showPaper: false, examFilter: false });
  else host.querySelector("#aiQHost").innerHTML = html`<p class="hint pad">${topic ? t("ai.noAiTopic") : t("ai.noAi")}</p>`;
  onAction(host, {
    ...fromHandler,
    "ai-practice": () => openStartTest({ scope: { type: "ai", ref: scope.topicId || scope.subjectId || syllabus.id, label: t("ai.aiLabel", { label }) }, questions: visibleQuestions(key, questions), keepOrder: false }),
    "ai-generate": () => generateQuestions(topic),
    "ai-copy": () => copyQuestions(visibleQuestions(key, questions), t("ai.aiLabel", { label })),
    "ai-delete": () => runFlow(async () => {
      const ok = await confirmAction({ title: t("ai.deleteTitleQ", { n: questions.length }), body: t("ai.deleteBodyQ"), confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      const bundle = await mut.deleteQuestions(questions.map((q) => q.id));
      toast(t("ai.deletedQ"), { actionLabel: t("common.undo"), onAction: () => mut.restoreRecords(bundle), duration: 8000 });
    })
  });
}

/* ---------- flashcards ---------- */

const deckBy = new Map(); // scope key → { ids, index, flipped, filter, mode, shuffle }

export function renderCardsPanel(host, { syllabus, scope }) {
  const key = `cards:${scope.topicId || scope.subjectId || "all"}`;
  const st = deckBy.get(key) || { filter: "due", mode: "study", shuffle: false, ids: null, index: 0, flipped: false };
  deckBy.set(key, st);
  let all = []; let every = []; let from = { chips: "", cur: "all" }; let deck = []; let counts = {}; let pass = () => true;
  const restart = () => { st.ids = null; draw(); };

  /** Re-reads the cards (after a change) and rebuilds the round if needed. */
  function compute() {
    const now = Date.now();
    every = cardsOf(syllabus.id, scope);
    from = fromFilter("cards", scope, every);
    all = from.shown;
    if (st.from !== from.cur) { st.from = from.cur; st.ids = null; }
    counts = {
      due: all.filter((c) => isDue(stateOf(c), now)).length,
      all: all.length,
      learn: all.filter((c) => stateOf(c).status !== "known").length,
      known: all.filter((c) => stateOf(c).status === "known").length
    };
    pass = (c) => ({ due: isDue(stateOf(c), now), all: true, learn: stateOf(c).status !== "known", known: stateOf(c).status === "known" })[st.filter];
    if (!st.ids) { const base = all.filter(pass).map((c) => c.id); st.ids = st.shuffle ? shuffle(base) : base; st.index = 0; st.flipped = false; }
    deck = st.ids.map((id) => store.byId("flashcards", id)).filter(Boolean);
  }

  function draw() {
    compute();
    if (!every.length) { host.innerHTML = html`<p class="hint pad">${t("ai.noCards")}</p>`; return; }
    const card = deck[st.index];
    host.innerHTML = html`${from.chips}
      <div class="segmented two"><button type="button" class="${st.mode === "study" ? "on" : ""}" data-action="fc-mode" data-v="study">${t("ai.fcStudy")}</button>
        <button type="button" class="${st.mode === "list" ? "on" : ""}" data-action="fc-mode" data-v="list">${t("ai.fcList")}</button></div>
      <div class="chip-row">${["due", "all", "learn", "known"].map((f) => html`<button type="button" class="pill ${st.filter === f ? "on" : ""}" data-action="fc-filter" data-v="${f}">${t(`ai.fcFilter.${f}`)} <span class="count">${counts[f]}</span></button>`)}</div>
      ${st.mode === "study" ? html`
        <div class="toolbar"><button type="button" class="pill ${st.shuffle ? "on" : ""}" data-action="fc-shuffle">${t("ai.fcShuffle")}</button>
          <button type="button" class="pill" data-action="fc-restart">${t("ai.fcRestart")}</button></div>
        ${!deck.length ? html`<p class="hint pad">${t("ai.fcEmptyFilter")}</p>`
          : st.index >= deck.length ? html`<div class="fc-card done"><p class="fc-text">${t("ai.fcDone")}</p><p class="hint">${t("ai.fcDoneSub", { known: counts.known, learn: counts.learn })}</p></div>
            <button type="button" class="btn" data-action="fc-learn">${t("ai.fcStudyLearn")}</button>`
          : html`<p class="hint">${t("ai.fcPos", { n: st.index + 1, of: deck.length })}</p>
            <button type="button" class="fc-card ${st.flipped ? "flipped" : ""}" data-action="fc-flip" aria-label="${t("ai.fcFlip")}">
              <span class="fc-side">${st.flipped ? t("ai.fcAnswer") : t("ai.fcQuestion")}${card.sourceRef?.pyq ? ` · ⭐ ${t("pdf.pyqArea")}` : ""}</span>
              <span class="fc-text">${richText(st.flipped ? card.back : card.front)}</span>
              ${st.flipped && card.sourceRef?.pdf ? html`<span class="hint">📄 ${card.sourceRef.pdf}${card.sourceRef.page ? `, p.${card.sourceRef.page}` : ""}</span>` : ""}
              ${st.flipped ? "" : html`<span class="hint">${t("ai.fcTap")}</span>`}
            </button>
            <div class="fc-buttons">${st.flipped
              ? html`<button type="button" class="btn btn-quiet" data-action="fc-again">↺ ${t("ai.fcAgain")}</button><button type="button" class="btn" data-action="fc-know">✓ ${t("ai.fcKnow")}</button>`
              : html`<button type="button" class="btn btn-quiet" data-action="fc-prev" ${st.index ? "" : "disabled"}>‹ ${t("pager.prev")}</button><button type="button" class="btn btn-quiet" data-action="fc-skip">${t("ai.fcSkip")} ›</button>`}</div>`}`
      : html`<div class="fc-list">${all.filter(pass).map((c) => {
          const s = stateOf(c);
          return html`<article class="qcard" data-cid="${c.id}">
            <header class="qcard-meta"><span>${c.sourceRef?.pyq ? `⭐ ${t("pdf.pyqArea")} · ` : ""}${t(`ai.fcStatus.${s.status}`)}${s.dueAt && s.status === "known" ? ` · ${t("ai.fcNext", { date: new Date(s.dueAt).toLocaleDateString(dateLocale()) })}` : ""}</span></header>
            <div class="qtext"><strong>Q:</strong> ${richText(c.front)}</div><div class="qtext"><strong>A:</strong> ${richText(c.back)}</div>
            <div class="row-actions"><button type="button" class="link" data-action="fc-set" data-v="known">✓ ${t("ai.fcKnow")}</button>
              <button type="button" class="link" data-action="fc-set" data-v="again">↺ ${t("ai.fcAgain")}</button>
              <button type="button" class="link danger" data-action="fc-del">${t("common.delete")}</button></div></article>`;
        })}</div>`}`;
    typesetMath(host);
  }
  draw();

  const save = (card, fn) => store.quietly(() => mut.saveCardState(fn(stateOf(card), Date.now())));
  onAction(host, {
    ...fromHandler,
    "fc-mode": (el) => { st.mode = el.dataset.v; draw(); },
    "fc-filter": (el) => { st.filter = el.dataset.v; restart(); },
    "fc-shuffle": () => { st.shuffle = !st.shuffle; restart(); },
    "fc-restart": restart,
    "fc-learn": () => { st.filter = "learn"; restart(); },
    "fc-flip": () => { st.flipped = !st.flipped; draw(); },
    "fc-prev": () => { st.index = Math.max(0, st.index - 1); st.flipped = false; draw(); },
    "fc-skip": () => { st.index++; st.flipped = false; draw(); },
    "fc-know": async () => { await save(deck[st.index], know); st.index++; st.flipped = false; draw(); },
    "fc-again": async () => { await save(deck[st.index], again); st.index++; st.flipped = false; draw(); },
    "fc-set": async (el) => { const c = store.byId("flashcards", el.closest("[data-cid]").dataset.cid); await save(c, el.dataset.v === "known" ? know : again); draw(); },
    "fc-del": (el) => runFlow(async () => {
      const id = el.closest("[data-cid]").dataset.cid;
      const ok = await confirmAction({ title: t("ai.fcDeleteTitle"), confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      const bundle = await mut.deleteCards([id]);
      st.ids = null;
      toast(t("ai.fcDeleted"), { actionLabel: t("common.undo"), onAction: () => mut.restoreRecords(bundle) });
    })
  });
}

/* ---------- revision notes from study PDFs ---------- */

export function renderPdfNotesPanel(host, { scope, topic = null }) {
  const every = pdfNotesOf(scope);
  if (!every.length) {
    host.innerHTML = html`<p class="hint pad">${t("ai.pnNone")}</p>${topic ? html`<div class="actions-row"><button type="button" class="btn btn-quiet" data-action="pn-pdfs">📄 ${t("pdf.title")}</button></div>` : ""}`;
    onAction(host, { "pn-pdfs": () => go("pdfs", { type: "topic", id: topic.id }) });
    return;
  }
  const from = fromFilter("notes", scope, every);
  const notes = from.shown;
  const when = (n) => new Date(n.createdAt || n.updatedAt || Date.now()).toLocaleDateString(dateLocale());
  const card = (n) => {
    const tp = store.topic(n.target.topicId);
    return html`<article class="note-card pdf-note" data-nid="${n.id}">
      <header class="qcard-meta"><span>📄 ${n.label || "PDF"}${n.target.pages ? ` · ${t("ai.pnPages", { pages: n.target.pages })}` : ""} · ${when(n)}${!scope.topicId && tp ? ` · ${nameLabel(tp)}` : ""}</span></header>
      <div class="note-body-btn" data-action="pn-read"><div class="qtext note-body ai-answer ${n.text.length > 600 || n.text.split("\n").length > 10 ? "is-long" : ""}">${noteText(n.text)}</div></div>
      <div class="row-actions">
        <button type="button" class="link" data-action="pn-read">📖 ${t("notes.read")}</button>
        <button type="button" class="link" data-action="pn-edit">✎ ${t("common.edit")}</button>
        ${n.target.pdfId ? html`<button type="button" class="link" data-action="pn-pdf">📄 ${t("ai.pnOpenPdf")}</button>` : ""}
        <button type="button" class="link danger" data-action="pn-del">${t("common.delete")}</button>
      </div></article>`;
  };
  // All together: grouped by PDF, newest first in each group.
  const groups = new Map(); notes.forEach((n) => { const k = n.target.pdfId || "none"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  host.innerHTML = html`<p class="hint">${t("ai.pnHint")}</p>
    ${from.chips}
    <div class="actions-row"><button type="button" class="btn btn-quiet" data-action="pn-all">📖 ${notes.length > 1 ? t("ai.pnReadAll", { n: notes.length }) : t("notes.read")}</button></div>
    ${from.cur === "all" && groups.size > 1 ? [...groups.values()].map((g) => html`<h3 class="rows-head">📄 ${g[0].label || "PDF"} <span class="count">${g.length}</span></h3>${g.map(card)}`) : notes.map(card)}`;
  const noteOf = (el) => store.byId("notes", el.closest("[data-nid]").dataset.nid);
  onAction(host, {
    ...fromHandler,
    "pn-read": (el) => { const n = noteOf(el); viewNote("pdfnote", n.target.id, n.label || ""); },
    "pn-edit": (el) => { const n = noteOf(el); editNote("pdfnote", n.target.id, n.label || ""); },
    "pn-pdf": (el) => go("pdf", { id: noteOf(el).target.pdfId }),
    "pn-del": (el) => runFlow(async () => {
      const n = noteOf(el);
      const ok = await confirmAction({ title: t("ai.pnDeleteTitle"), body: n.label || "", confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      const prev = await mut.deleteNotes([n.id]);
      toast(t("ai.pnDeleted"), { actionLabel: t("common.undo"), onAction: () => mut.putNotes(prev), duration: 8000 });
    }),
    "pn-all": () => readTogether(notes)
  });
}

/** Every shown note in one reading view, one part per PDF. */
function readTogether(notes) {
  const by = new Map(); notes.forEach((n) => { const k = n.target.pdfId || "none"; if (!by.has(k)) by.set(k, []); by.get(k).push(n); });
  const text = [...by.values()].map((g) => `## ${g[0].label || "PDF"}\n${g.map((n) => n.text).join("\n\n")}`).join("\n\n");
  viewText(t("ai.pnTogether"), text);
}

/* ---------- Library: every topic with AI content ---------- */

export const aiHubScreen = {
  id: "ai-hub",
  parent: "library",
  render(container, { kind, id }) {
    kind = kind || id;
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("library");
    const isCards = kind === "cards";
    const items = isCards ? cardsOf(syllabus.id) : aiQuestions(syllabus.id);
    const byTopic = new Map();
    items.forEach((x) => byTopic.set(x.topicId, (byTopic.get(x.topicId) || 0) + 1));
    const rows = [...byTopic.entries()].map(([id, n]) => ({ topic: store.topic(id), n })).filter((r) => r.topic)
      .sort((a, b) => b.n - a.n);
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("library.views.banks")}</span></button></div>
      <h1>${isCards ? t("ai.hubCards") : t("ai.hubAi")}</h1><p class="hint">${isCards ? t("ai.cardsN", { n: items.length }) : t("common.questions", { n: items.length })} · ${t("ai.separateNote")}</p></header>
      <div class="rows">${rows.map((r) => html`<button type="button" class="row" data-action="open" data-id="${r.topic.id}">
        <span class="row-main"><span class="row-title">${nameHtml(r.topic)}</span><span class="row-sub">${nameLabel(store.subject(r.topic.subjectId))}</span></span>
        <span class="row-count">${r.n}</span><span class="chev-txt">›</span></button>`)}</div>
      ${rows.length ? "" : html`<p class="hint pad">${isCards ? t("ai.noCards") : t("ai.noAi")}</p>`}`;
    onAction(container, {
      back: () => go("library", { view: "banks" }),
      open: (el) => go("topic", { id: el.dataset.id, mode: isCards ? "cards" : "ai" })
    });
  }
};
