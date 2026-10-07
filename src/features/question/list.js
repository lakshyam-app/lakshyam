/* A listing's questions: toolbar (view, sort, exam filter), paged cards,
   and every card action (flag, difficulty, answer, edit, move, banks, copy, delete).
   Card changes are saved quietly and only that card is redrawn, so your place
   in a long list is kept. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { openSheet } from "../../core/sheet.js";
import { letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { questionCard, difficultyOf } from "./card.js";
import { copyQuestion } from "./copy.js";
import { pickTopic } from "../library/topic-picker.js";
import { pickExams } from "./exam-filter.js";

const PAGE = 30;
const shownBy = new Map();   // listing key → how many cards were showing (kept across redraws)
const examsBy = new Map();   // listing key → Set of included paper IDs (none = all)
const sortBy = new Map();    // listing key → "none" | "diff-asc" | "diff-desc"
const revealBy = new Map();  // listing key → Map(questionId → picked index | true)
let editMode = false;

const RANK = { E: 1, M: 2, D: 3 };

export const viewMode = () => (editMode ? "edit" : store.setting("questionView", "study"));
const difficultyOn = () => store.setting("difficultyEnabled", true) !== false;

/** Questions after the listing's exam filter and sort. */
export function visibleQuestions(key, questions) {
  const exams = examsBy.get(key);
  let list = exams ? questions.filter((q) => exams.has(q.paperId)) : questions.slice();
  const sort = sortBy.get(key) || "none";
  if (sort !== "none") {
    const r = (q) => RANK[difficultyOf(q)] || 0;
    list.sort((a, b) => (sort === "diff-asc" ? r(a) - r(b) : r(b) - r(a)));
  }
  return list;
}

function papersIn(questions) {
  const map = new Map();
  questions.forEach((q) => {
    const p = store.paper(q.paperId);
    if (!p) return;
    const row = map.get(p.id) || { id: p.id, name: p.name, postName: p.postName, count: 0 };
    row.count++;
    map.set(p.id, row);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * host: element to fill. opts: { key, questions, showPaper, bank, examFilter }
 * examFilter: show the "Exams" chip (for listings that mix papers).
 */
export function mountQuestions(host, { key, questions, showPaper = true, bank = null, examFilter = true }) {
  const papers = examFilter ? papersIn(questions) : [];
  const exams = examsBy.get(key);
  const list = visibleQuestions(key, questions);
  const mode = viewMode();
  const reveal = revealBy.get(key) || new Map();
  revealBy.set(key, reveal);
  const sort = sortBy.get(key) || "none";

  host.innerHTML = html`
    <div class="toolbar">
      <button type="button" class="pill" data-action="ql-view">${t(`view.${mode}`)} ▾</button>
      <button type="button" class="pill" data-action="ql-sort">${t(`sort.${sort}`)} ▾</button>
      ${papers.length > 1 ? html`<button type="button" class="pill ${exams ? "on" : ""}" data-action="ql-exams">
        ${exams ? t("exams.some", { n: exams.size, of: papers.length }) : t("exams.all", { n: papers.length })} ▾</button>` : ""}
    </div>
    ${mode === "edit" ? html`<div class="banner"><span>${t("view.editBanner")}</span>
      <button type="button" class="btn btn-small" data-action="ql-edit-done">${t("common.done")}</button></div>` : ""}
    ${exams ? html`<p class="hint">${t("exams.showing", { n: list.length, of: questions.length })}</p>` : ""}
    <div class="qlist"></div>
    <button type="button" class="btn btn-quiet more" hidden></button>`;

  const listEl = host.querySelector(".qlist");
  const more = host.querySelector(".more");
  const cardOpts = () => ({ showPaper, mode: viewMode(), showDifficulty: difficultyOn() });
  let shown = 0;
  const drawMore = (n = PAGE) => {
    const next = list.slice(shown, shown + n);
    const holder = document.createElement("div");
    holder.innerHTML = html`${next.map((q) => questionCard(q, { ...cardOpts(), revealed: reveal.has(q.id) ? reveal.get(q.id) : null }))}`;
    typesetMath(holder);
    listEl.append(...holder.children);
    shown += next.length;
    shownBy.set(key, shown);
    const left = list.length - shown;
    more.hidden = left <= 0;
    more.textContent = t("common.showMore", { n: Math.min(PAGE, left) });
  };
  more.addEventListener("click", () => drawMore());
  if (!list.length) listEl.innerHTML = html`<p class="hint">${t("library.noQuestions")}</p>`;
  else drawMore(Math.max(PAGE, shownBy.get(key) || 0));

  const redraw = () => mountQuestions(host, { key, questions, showPaper, bank, examFilter });

  function refreshCard(qid) {
    const el = listEl.querySelector(`[data-qid="${CSS.escape(qid)}"]`);
    if (!el) return;
    const q = store.question(qid);
    if (!q) { el.remove(); return; }
    const holder = document.createElement("div");
    holder.innerHTML = html`${questionCard(q, { ...cardOpts(), revealed: reveal.has(qid) ? reveal.get(qid) : null })}`;
    const fresh = holder.firstElementChild;
    typesetMath(fresh);
    const openExplain = el.querySelector("details[open]");
    if (openExplain) fresh.querySelector("details")?.setAttribute("open", "");
    el.replaceWith(fresh);
  }

  const quiet = (fn, qid) => store.quietly(fn).then(() => refreshCard(qid));
  const qOf = (el) => store.question(el.closest("[data-qid]").dataset.qid);

  onAction(host, {
    "ql-view": () => runFlow(async () => {
      const id = await chooseAction({ title: t("view.title"), items: [
        { id: "study", label: t("view.study"), sub: t("view.studyHint"), current: mode === "study" },
        { id: "selftest", label: t("view.selftest"), sub: t("view.selftestHint"), current: mode === "selftest" },
        { id: "edit", label: t("view.edit"), sub: t("view.editHint"), current: mode === "edit" }
      ] });
      if (!id) return;
      editMode = id === "edit";
      reveal.clear();
      if (id !== "edit") await store.quietly(() => store.setSetting("questionView", id));
      redraw();
    }),
    "ql-edit-done": () => { editMode = false; redraw(); },
    "ql-sort": () => runFlow(async () => {
      const id = await chooseAction({ title: t("sort.title"), items: ["none", "diff-asc", "diff-desc"]
        .map((s) => ({ id: s, label: t(`sort.${s}`), current: s === sort })) });
      if (!id) return;
      sortBy.set(key, id);
      shownBy.delete(key);
      redraw();
    }),
    "ql-exams": async () => {
      const result = await pickExams({ papers, selected: exams || null });
      if (result === undefined) return;
      if (result) examsBy.set(key, result); else examsBy.delete(key);
      shownBy.delete(key);
      redraw();
    },
    "q-option": (el) => {
      const q = qOf(el); const i = Number(el.dataset.i);
      if (viewMode() === "edit") return quiet(() => mut.setAnswer(q, i), q.id);
      reveal.set(q.id, i);
      refreshCard(q.id);
    },
    "q-reveal": (el) => { const q = qOf(el); reveal.set(q.id, true); refreshCard(q.id); },
    "q-flag": (el) => {
      const q = qOf(el); const on = !store.questionState(q.id)?.flagged;
      quiet(() => mut.setFlag(q.id, on), q.id);
      toast(on ? t("question.flaggedToast") : t("question.unflaggedToast"));
    },
    "q-diff": (el) => runFlow(() => chooseDifficulty(qOf(el), quiet)),
    "q-menu": (el) => runFlow(() => questionMenu(qOf(el), { bank, quiet, refreshCard, removeCard: (id) => listEl.querySelector(`[data-qid="${CSS.escape(id)}"]`)?.remove() }))
  });
}

/* ---------- card ⋯ menu ---------- */

async function chooseDifficulty(q, quiet) {
  const cur = store.questionState(q.id)?.difficulty || null;
  const id = await chooseAction({ title: t("question.setDifficulty"), items: [
    ...["E", "M", "D"].map((d) => ({ id: d, label: t(`question.difficulty.${d}`), current: cur === d })),
    { id: "clear", label: t("question.clearDifficulty") }
  ] });
  if (!id) return;
  await quiet(() => mut.setDifficulty(q.id, id === "clear" ? null : id), q.id);
}

async function questionMenu(q, { bank, quiet, removeCard }) {
  const state = store.questionState(q.id);
  const deleted = q.status === "deleted_by_psc";
  const id = await chooseAction({
    title: q.number ? t("question.number", { n: q.number }) : t("question.question"),
    sub: [store.subject(q.subjectId)?.name, store.topic(q.topicId)?.name].filter(Boolean).join(" › "),
    items: [
      { id: "flag", label: state?.flagged ? t("question.unflag") : t("question.flag") },
      { id: "difficulty", label: t("question.setDifficulty") },
      { id: "answer", label: t("question.setAnswer") },
      { id: "edit", label: t("question.edit") },
      { id: "move", label: t("question.move") },
      { id: "deleted", label: deleted ? t("question.undeletePsc") : t("question.markDeleted") },
      { id: "bank", label: t("question.addToBank") },
      bank && bank.kind === "user" ? { id: "unbank", label: t("question.removeFromBank", { bank: bank.name }) } : null,
      { id: "copy", label: t("question.copy") },
      { id: "delete", label: t("question.delete"), danger: true }
    ]
  });
  switch (id) {
    case "flag": return quiet(() => mut.setFlag(q.id, !state?.flagged), q.id);
    case "difficulty": return chooseDifficulty(q, quiet);
    case "answer": {
      const pick = await chooseAction({ title: t("question.setAnswer"), items: [
        ...q.options.map((opt, i) => ({ id: String(i), label: `${letterFor(i)}) ${opt.slice(0, 80)}`, current: !deleted && q.answerIndex === i })),
        { id: "none", label: t("question.noAnswerOption"), current: !deleted && q.answerIndex === null }
      ] });
      if (pick === null) return;
      const answerIndex = pick === "none" ? null : Number(pick);
      return quiet(() => mut.saveQuestionUpdates([{ ...q, answerIndex, status: "active" }]), q.id);
    }
    case "edit": {
      const fields = await editQuestionForm(q);
      if (!fields) return;
      return quiet(() => mut.updateQuestion(q, fields), q.id);
    }
    case "move": {
      const target = await pickTopic({ title: t("question.move"), current: { subjectId: q.subjectId, topicId: q.topicId } });
      if (!target) return;
      await quiet(() => mut.moveQuestion(q, target.subjectId, target.topicId), q.id);
      toast(t("question.movedTo", { topic: store.topic(target.topicId)?.name || "" }));
      return;
    }
    case "deleted": return quiet(() => mut.setDeletedByPsc(q, !deleted), q.id);
    case "bank": return addToBankFlow([q.id]);
    case "unbank": {
      await store.quietly(() => mut.removeFromBank(store.byId("sets", bank.id), [q.id]));
      removeCard(q.id);
      toast(t("question.removedFromBank"), { actionLabel: t("common.undo"), onAction: () => mut.addToBank(store.byId("sets", bank.id), [q.id]) });
      return;
    }
    case "copy": return copyQuestion(q);
    case "delete": {
      const ok = await confirmAction({ title: t("question.deleteTitle"), body: t("question.deleteBody"), confirmLabel: t("question.deleteButton"), danger: true });
      if (!ok) return;
      const bundle = await store.quietly(() => mut.deleteQuestions([q.id]));
      removeCard(q.id);
      toast(t("question.deletedToast"), { actionLabel: t("common.undo"), onAction: () => mut.restoreRecords(bundle), duration: 8000 });
    }
  }
}

/** Choose (or create) a bank and add the questions. Used by cards, search and bank pages. */
export async function addToBankFlow(questionIds) {
  const banks = store.all("sets").filter((b) => b.kind === "user").sort((a, b) => a.name.localeCompare(b.name));
  const id = await chooseAction({ title: t("banks.addTo"), items: [
    ...banks.map((b) => ({ id: b.id, label: b.name, sub: t("common.questions", { n: b.questionIds.length }) })),
    { id: "__new", label: t("banks.newBank") }
  ] });
  if (!id) return;
  let bank = store.byId("sets", id);
  if (id === "__new") {
    const name = await askText({ title: t("banks.newBank"), placeholder: t("banks.namePlaceholder"), confirmLabel: t("common.create") });
    if (!name) return;
    bank = await store.quietly(() => mut.createBank(name));
  }
  await store.quietly(() => mut.addToBank(store.byId("sets", bank.id), questionIds));
  toast(t("banks.added", { n: questionIds.length, bank: bank.name }));
}

/* ---------- edit form ---------- */

function editQuestionForm(q) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let options = q.options.slice();
    const read = (body) => {
      options = [...body.querySelectorAll("[data-opt]")].map((el) => el.value);
      return { text: body.querySelector("#eqText").value.trim(), explanation: body.querySelector("#eqExplain").value.trim() };
    };
    const draw = (vals = { text: q.text, explanation: q.explanation || "" }) => {
      const body = openSheet(html`<h2>${t("question.edit")}</h2>
        <label class="field-label" for="eqText">${t("question.question")}</label>
        <textarea class="field" id="eqText" rows="4">${vals.text}</textarea>
        ${options.map((opt, i) => html`<label class="field-label">${t("question.option", { l: letterFor(i) })}
          <input class="field" type="text" data-opt="${i}" value="${opt}"></label>`)}
        <div class="row-actions">
          ${options.length < 6 ? html`<button type="button" class="link" data-action="add-opt">${t("question.addOption")}</button>` : ""}
          ${options.length > 2 ? html`<button type="button" class="link danger" data-action="drop-opt">${t("question.removeOption")}</button>` : ""}
        </div>
        <label class="field-label" for="eqExplain">${t("question.explanation")}</label>
        <textarea class="field" id="eqExplain" rows="4">${vals.explanation}</textarea>
        <p class="hint">${t("question.formatHint")}</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
          <button type="button" class="btn" data-action="save">${t("common.save")}</button>
        </div>`, {
        "add-opt": (el) => { const v = read(el.closest(".sheet-body")); options.push(""); draw(v); },
        "drop-opt": (el) => { const v = read(el.closest(".sheet-body")); options.pop(); draw(v); },
        cancel: () => finish(null),
        save: (el) => {
          const v = read(el.closest(".sheet-body"));
          const opts = options.map((o) => o.trim());
          if (!v.text || opts.filter(Boolean).length < 2 || opts.some((o) => !o)) { toast(t("question.formIncomplete")); return; }
          finish({ text: v.text, options: opts, explanation: v.explanation });
        }
      }, { label: t("question.edit"), onClose: () => finish(null) });
      return body;
    };
    draw();
  });
}
