/* 1.26 · Revise: one home for revision. It took the Notes tab's place in the bottom bar; Notes is the first
   row here, unchanged (#/notes still works).
   Due today: mistakes due (questions you got wrong, back on their day), flashcards due, topics to revise.
   Your mistakes: Still wrong, Flagged. Read and recall: Notes, all flashcards as one deck (#/cards), study
   PDFs, AI questions, the current-affairs quiz. Nothing new is saved here: each row opens what the app
   already had, in the same place as before. */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go, goBack } from "../../core/router.js";
import { openedFrom, backFrom } from "../../core/back.js";
import { can } from "../../core/entitlements.js";
import { label as nameLabel } from "../../core/names.js";
import * as store from "../../data/store.js";
import { dueMistakes, reviewQueue } from "../../data/review.js";
import { upcomingCounts } from "../../domain/review.js";
import { isDue } from "../../domain/cards.js";
import { isGradable } from "../../domain/testing.js";
import { localDate } from "../../domain/study.js";
import { REVIEW_CAP } from "../../domain/habits.js";
import { listPdfs } from "../../pdf/pdf-store.js";
import { cardsOf, cardState, aiQuestions, renderCardsPanel, presetDeck } from "../ai/content.js";
import { openCaQuiz } from "../ai/ca-quiz.js";
import { AUTO, flaggedQuestions, stillWrongQuestions } from "../library/banks.js";
import { notesShown } from "../notes/notes.js";
import { openStartTest } from "../test/start-sheet.js";
import { revisionDue, dueSheet } from "../today/today.js";
import { setupPanel, setupHandlers } from "../import/setup.js";

const chev = html`<span class="chev-txt">›</span>`;
const FROM = openedFrom("revise"); // so those screens' ‹ goes back here

function row({ action, icon = "", title, sub = "", n = null }) {
  return html`<button type="button" class="row" data-action="${action}">
    <span class="row-main"><span class="row-title">${icon ? `${icon} ` : ""}${title}</span>${sub ? html`<span class="row-sub">${sub}</span>` : ""}</span>
    ${n !== null ? html`<span class="row-count">${formatNumber(n)}</span>` : ""}${chev}</button>`;
}

export const reviseScreen = {
  id: "revise",
  tab: 4,
  render(container) {
    if (store.isEmpty()) {
      container.innerHTML = html`<section class="revise"><h1 class="page-title">${t("revise.title")}</h1>${setupPanel()}</section>`;
      onAction(container, setupHandlers);
      return;
    }
    const syllabus = store.currentSyllabus();
    const today = localDate();
    const mistakes = dueMistakes(syllabus.id, today).filter(isGradable);
    const coming = upcomingCounts(reviewQueue(syllabus.id), today, 7);
    const week = coming.reduce((n, d) => n + d.n, 0);
    const cards = cardsOf(syllabus.id);
    const now = Date.now();
    const cardsDue = cards.filter((c) => isDue(cardState(c), now)).length;
    const { due, freq } = revisionDue(syllabus, now);
    const dueToday = due.slice(0, REVIEW_CAP);
    const wrong = stillWrongQuestions(syllabus.id).length;
    const flagged = flaggedQuestions(syllabus.id).length;
    const nAi = aiQuestions(syllabus.id).length;
    const nothingDue = !mistakes.length && !cardsDue && !due.length;

    container.innerHTML = html`<section class="revise">
      <h1 class="page-title">${t("revise.title")}</h1>
      <p class="hint">${t("revise.hint")}</p>
      <article class="panel revise-due">
        <h2 class="kicker">${t("revise.dueHead")}</h2>
        ${nothingDue ? html`<p class="revise-none">✓ ${t("revise.nothingDue")}</p>` : html`<div class="rows">
          ${mistakes.length ? row({ action: "rv-mistakes", icon: "🔁", title: t("revise.mistakes"), sub: t("revise.mistakesSub"), n: mistakes.length }) : ""}
          ${cardsDue ? row({ action: "rv-cards", icon: "🃏", title: t("revise.cardsDue"), sub: t("revise.cardsDueSub"), n: cardsDue }) : ""}
          ${due.length ? row({ action: "rv-topics", icon: "📚", title: t("next.dueTodayN", { n: dueToday.length }),
            sub: `${dueToday.map((d) => nameLabel(store.topic(d.topicId))).filter(Boolean).join(", ")}${due.length > REVIEW_CAP ? ` · ${t("next.dueWaiting", { n: due.length - REVIEW_CAP })}` : ""}` }) : ""}
        </div>`}
        ${week ? html`<p class="hint">${t("revise.comingUp", { tomorrow: coming[0].n, week })}</p>` : ""}
      </article>
      <h3 class="rows-head">${t("revise.mistakesHead")}</h3>
      <div class="rows">
        ${row({ action: "rv-wrong", title: t("banks.auto.wrong"), sub: t("banks.auto.wrongHint"), n: wrong })}
        ${row({ action: "rv-flagged", title: t("banks.auto.flagged"), sub: t("banks.auto.flaggedHint"), n: flagged })}
      </div>
      <h3 class="rows-head">${t("revise.readHead")}</h3>
      <div class="rows">
        ${row({ action: "rv-notes", icon: "📝", title: t("tabs.notes"), sub: t("revise.notesSub"), n: notesShown() })}
        ${cards.length ? row({ action: "rv-deck", icon: "🃏", title: t("revise.deck"), sub: t("revise.deckSub"), n: cards.length }) : ""}
        ${can("pdfs") ? html`<button type="button" class="row" data-action="rv-pdfs"><span class="row-main"><span class="row-title">📄 ${t("pdf.title")}</span><span class="row-sub">${t("pdf.hubSub")}</span></span><span class="row-count" data-pdf-n></span>${chev}</button>` : ""}
        ${nAi ? row({ action: "rv-ai", icon: "🤖", title: t("ai.hubAi"), sub: t("ai.separateShort"), n: nAi }) : ""}
        ${can("ai") ? row({ action: "rv-ca", icon: "🗞", title: t("ca.title"), sub: t("ca.rowSub") }) : ""}
      </div>
    </section>`;
    // How many study PDFs (they live in their own storage, read when this screen opens)
    if (can("pdfs")) listPdfs().then((list) => { const el = container.querySelector("[data-pdf-n]"); if (el?.isConnected) el.textContent = list.length ? formatNumber(list.length) : ""; }).catch(() => {});

    onAction(container, {
      ...setupHandlers,
      "rv-mistakes": () => openStartTest(null, { what: "mistakes" }),
      "rv-cards": () => { presetDeck({}, "due"); go("cards"); },
      "rv-deck": () => go("cards"),
      "rv-topics": () => dueSheet(due, freq),
      "rv-wrong": () => go("bank", { id: AUTO.wrong, ...FROM }),
      "rv-flagged": () => go("bank", { id: AUTO.flagged, ...FROM }),
      "rv-notes": () => go("notes"),
      "rv-pdfs": () => go("pdfs", FROM),
      "rv-ai": () => go("ai-hub", { kind: "ai", ...FROM }),
      "rv-ca": () => openCaQuiz()
    });
  }
};

/* ---------- #/cards: every flashcard of this syllabus as one deck (study or list; due first) ---------- */

export const cardsScreen = {
  id: "cards",
  parent: "revise",
  render(container, params) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("revise");
    const n = cardsOf(syllabus.id).length;
    // Opened from Revise, or from Today's session card ("n flashcards due").
    const back = backFrom(params, ["today", "revise"], "revise");
    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${back.to === "today" ? t("tabs.today") : t("tabs.revise")}</span></button></div>
      <h1>🃏 ${t("revise.deck")}</h1><p class="hint">${t("ai.cardsN", { n })} · ${t("revise.deckSub")}${n ? html` · <button type="button" class="link inline" data-action="by-topic">${t("revise.byTopic")}</button>` : ""}</p></header>
      <div id="deckHost"></div>`;
    onAction(container, {
      back: () => goBack(back.to, back.params),
      "by-topic": () => go("ai-hub", { kind: "cards", ...FROM })
    });
    renderCardsPanel(container.querySelector("#deckHost"), { syllabus, scope: {} });
  }
};
