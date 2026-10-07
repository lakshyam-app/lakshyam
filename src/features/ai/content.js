/* AI questions and flashcards, always kept apart from your PYQs.
   - PYQ / AI / Cards switch on topic and subject pages (shown only when AI content exists)
   - AI questions: browse, practise, generate more, delete
   - Flashcards: study (tap to flip, "Again" / "Know it") or list; spaced review 1→3→7→14→30 days
   - #/ai-hub?kind=ai|cards: every topic that has AI questions or cards */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { richText } from "../../domain/text.js";
import { shuffle } from "../../domain/testing.js";
import { know, again, isDue } from "../../domain/cards.js";
import * as store from "../../data/store.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import { mountQuestions, visibleQuestions } from "../question/list.js";
import { copyQuestions } from "../question/copy.js";
import { openStartTest } from "../test/start-sheet.js";
import { generateQuestions } from "./ai-actions.js";

const inScope = (x, scope) => (scope.topicId ? x.topicId === scope.topicId : scope.subjectId ? x.subjectId === scope.subjectId : true);

export const aiQuestions = (syllabusId, scope = {}) => store.questionsFor({ syllabusId, source: "ai" }).filter((q) => inScope(q, scope));
export const cardsOf = (syllabusId, scope = {}) => store.all("flashcards").filter((c) => c.syllabusId === syllabusId && inScope(c, scope));
const stateOf = (card) => store.byId("flashcardState", card.id) || { id: card.id, cardId: card.id, status: "new", reviews: 0, lastAt: null, dueAt: null };

/** The PYQ / AI / Cards switch; empty when there's no AI content here. */
export function contentSwitch(mode, counts, to, params) {
  if (!counts.ai && !counts.cards && mode === "pyq") return "";
  const btn = (m, label, n) => html`<button type="button" class="${mode === m ? "on" : ""}" data-action="content" data-to="${to}" data-mode="${m}" data-params="${JSON.stringify(params)}">${label} <span class="count">${n}</span></button>`;
  return html`<div class="segmented three content-switch">${btn("pyq", t("ai.cs.pyq"), counts.pyq)}${btn("ai", t("ai.cs.ai"), counts.ai)}${btn("cards", t("ai.cs.cards"), counts.cards)}</div>`;
}
export const contentHandler = {
  content: (el) => { const p = JSON.parse(el.dataset.params); go(el.dataset.to, el.dataset.mode === "pyq" ? p : { ...p, mode: el.dataset.mode }); }
};

/* ---------- AI questions ---------- */

export function renderAiPanel(host, { syllabus, scope, topic = null, label }) {
  const questions = aiQuestions(syllabus.id, scope);
  const key = `ai:${scope.topicId || scope.subjectId || "all"}`;
  host.innerHTML = html`<p class="hint">${t("ai.separateNote")}</p>
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
  let all = []; let deck = []; let counts = {}; let pass = () => true;
  const restart = () => { st.ids = null; draw(); };

  /** Re-reads the cards (after a change) and rebuilds the round if needed. */
  function compute() {
    const now = Date.now();
    all = cardsOf(syllabus.id, scope);
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
    if (!all.length) { host.innerHTML = html`<p class="hint pad">${t("ai.noCards")}</p>`; return; }
    const card = deck[st.index];
    host.innerHTML = html`
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
              <span class="fc-side">${st.flipped ? t("ai.fcAnswer") : t("ai.fcQuestion")}</span>
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
            <header class="qcard-meta"><span>${t(`ai.fcStatus.${s.status}`)}${s.dueAt && s.status === "known" ? ` · ${t("ai.fcNext", { date: new Date(s.dueAt).toLocaleDateString("en-IN") })}` : ""}</span></header>
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
