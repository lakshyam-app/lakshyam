/* Question banks.
   Automatic: ⭐ Flagged and ❌ Still wrong (latest graded answer was wrong; PYQs only).
   Yours: create, rename, delete, add from the pool, import JSON, type a question, remove.
   Screens: #/bank?id=…   #/bank-add?id=… (add from pool) */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, isSheetOpen } from "../../core/sheet.js";
import { onLongPress } from "../../core/longpress.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { mountQuestions, visibleQuestions } from "../question/list.js";
import { questionCard } from "../question/card.js";
import { copyQuestions } from "../question/copy.js";
import { noteBlock, editNote } from "../notes/note-editor.js";
import { addPaperFlow } from "./paper-files.js";
import { openStartTest } from "../test/start-sheet.js";
import { wrongTricks } from "../ai/ai-actions.js";
import { pickTopic } from "./topic-picker.js";
import { header, backHandler, chev } from "./library.js";
import { can } from "../../core/entitlements.js";

export const AUTO = { flagged: "auto:flagged", wrong: "auto:wrong" };

const inSyllabus = (q, syllabusId) => {
  const p = store.paper(q.paperId);
  return p && (p.syllabusId === syllabusId || p.syllabusId === null);
};

export function flaggedQuestions(syllabusId) {
  return store.all("questionState").filter((s) => s.flagged)
    .map((s) => store.question(s.questionId || s.id)).filter((q) => q && inSyllabus(q, syllabusId));
}

/** Latest graded answer per question in this syllabus's tests; kept if it was wrong. */
export function stillWrongQuestions(syllabusId) {
  const latest = new Map();
  store.attemptsOf(syllabusId).filter((a) => a.kind !== "ai").forEach((a) => {
    a.answers.forEach((r) => {
      if (!r.graded) return;
      const prev = latest.get(r.questionId);
      if (!prev || prev.at < a.submittedAt) latest.set(r.questionId, { at: a.submittedAt, right: r.isCorrect });
    });
  });
  const out = [];
  latest.forEach((v, qid) => {
    if (v.right) return;
    const q = store.question(qid);
    if (q && q.source !== "ai") out.push(q);
  });
  return out;
}

function bankInfo(id, syllabusId) {
  if (id === AUTO.flagged) return { id, auto: true, name: t("banks.auto.flagged"), questions: flaggedQuestions(syllabusId), hint: t("banks.auto.flaggedHint") };
  if (id === AUTO.wrong) return { id, auto: true, name: t("banks.auto.wrong"), questions: stillWrongQuestions(syllabusId), hint: t("banks.auto.wrongHint") };
  const bank = store.byId("sets", id);
  if (!bank) return null;
  return { id, auto: false, bank, name: bank.name, questions: bank.questionIds.map((q) => store.question(q)).filter(Boolean), missing: bank.questionIds.filter((q) => !store.question(q)).length };
}

export function banksRows(syllabusId, q) {
  const row = (b, icon = "") => html`<button type="button" class="row" data-action="open" data-to="bank" data-id="${b.id}">
    <span class="row-main"><span class="row-title">${icon}${b.name}</span>${b.hint ? html`<span class="row-sub">${b.hint}</span>` : ""}</span>
    <span class="row-count">${b.questions.length}</span>${chev}</button>`;
  const user = store.all("sets").filter((b) => b.kind === "user").sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => bankInfo(b.id, syllabusId)).filter((b) => !q || b.name.toLowerCase().includes(q));
  const autos = [bankInfo(AUTO.flagged, syllabusId), bankInfo(AUTO.wrong, syllabusId)].filter((b) => !q || b.name.toLowerCase().includes(q));
  // AI questions and flashcards (kept apart from PYQs) are reached from here too.
  const nAi = store.questionsFor({ syllabusId, source: "ai" }).length;
  const nCards = store.all("flashcards").filter((c) => c.syllabusId === syllabusId).length;
  const hub = (kind, label, n) => html`<button type="button" class="row" data-action="open" data-to="ai-hub" data-id="${kind}">
    <span class="row-main"><span class="row-title">${label}</span><span class="row-sub">${t("ai.separateShort")}</span></span>
    <span class="row-count">${n}</span>${chev}</button>`;
  return [
    ...autos.map((b) => row(b)),
    user.length ? html`<h3 class="rows-head">${t("banks.yours")}</h3>` : "",
    ...user.map((b) => row(b)),
    html`<h3 class="rows-head">${t("ai.hubHead")}</h3>`,
    nAi ? hub("ai", t("ai.hubAi"), nAi) : "",
    nCards ? hub("cards", t("ai.hubCards"), nCards) : "",
    can("pdfs") && (!q || t("pdf.title").toLowerCase().includes(q)) ? html`<button type="button" class="row" data-action="open" data-to="pdfs" data-id="">
      <span class="row-main"><span class="row-title">📄 ${t("pdf.title")}</span><span class="row-sub">${t("pdf.hubSub")}</span></span>${chev}</button>` : ""
  ].filter(Boolean);
}

/* ---------- bank screen ---------- */

export const bankScreen = {
  id: "bank",
  parent: "library",
  render(container, { id }) {
    const syllabus = store.currentSyllabus();
    const info = bankInfo(id, syllabus.id);
    if (!info) return go("library", { view: "banks" });
    const key = `bank:${id}`;
    const noteType = info.auto ? "set" : "bank";
    container.innerHTML = html`${header({
      backTo: "library", backParams: { view: "banks" }, backLabel: t("library.views.banks"),
      title: info.name, sub: [t("common.questions", { n: info.questions.length }), info.auto ? info.hint : null].filter(Boolean).join(" · "), menu: true
    })}
    <div class="actions-row">
      ${info.questions.length ? html`<button type="button" class="btn" data-action="practice">▶ ${t("practice.button")}</button>` : ""}
      ${info.auto ? "" : html`<button type="button" class="btn btn-quiet" data-action="add">${t("banks.addFromPool")}</button>
      <button type="button" class="btn btn-quiet" data-action="type">${t("banks.type")}</button>`}
    </div>
    ${info.missing ? html`<p class="hint">${t("banks.missing", { n: info.missing })}</p>` : ""}
    ${noteBlock(noteType, id)}
    <div id="qHost"></div>`;
    onAction(container, {
      ...backHandler,
      add: () => go("bank-add", { id }),
      type: () => typeQuestionFlow(info.bank),
      practice: () => openStartTest({ scope: info.auto ? { type: id === AUTO.flagged ? "flagged" : "wrong", ref: syllabus.id, label: info.name } : { type: "bank", ref: id, label: info.name }, questions: visibleQuestions(key, info.questions), keepOrder: false }),
      "note-edit": () => editNote(noteType, id, info.name),
      menu: () => runFlow(async () => {
        const choice = await chooseAction({ title: info.name, items: info.auto ? [
          id === AUTO.wrong ? { id: "tricks", label: `🤖 ${t("ai.tricksTitle")}` } : null,
          { id: "copy", label: t("listing.copy") },
          { id: "note", label: t("notes.myNote") }
        ] : [
          { id: "add", label: t("banks.addFromPool") },
          { id: "import", label: t("banks.importJson") },
          { id: "type", label: t("banks.type") },
          { id: "rename", label: t("banks.rename") },
          { id: "copy", label: t("listing.copy") },
          { id: "note", label: t("notes.myNote") },
          { id: "delete", label: t("banks.delete"), danger: true }
        ] });
        switch (choice) {
          case "add": return go("bank-add", { id });
          case "import": return addPaperFlow({ bank: info.bank });
          case "type": return typeQuestionFlow(info.bank);
          case "rename": { const name = await askText({ title: t("banks.rename"), value: info.name }); if (name) await mut.renameBank(info.bank, name); return; }
          case "tricks": wrongTricks(info.questions); return;
          case "copy": return copyQuestions(visibleQuestions(key, info.questions), info.name);
          case "note": return editNote(noteType, id, info.name);
          case "delete": {
            const ok = await confirmAction({ title: t("banks.deleteTitle", { name: info.name }), body: t("banks.deleteBody"), confirmLabel: t("common.delete"), danger: true });
            if (!ok) return;
            const copy = { ...info.bank };
            await store.quietly(() => mut.deleteBank(info.bank));
            toast(t("banks.deleted"), { actionLabel: t("common.undo"), onAction: () => store.apply({ sets: { put: [copy] } }) });
            return go("library", { view: "banks" });
          }
        }
      })
    });
    mountQuestions(container.querySelector("#qHost"), { key, questions: info.questions, showPaper: true, bank: info.bank || null });
  }
};

/* ---------- add from pool ---------- */

const pool = { subjectId: "", topicId: "", paperId: "", term: "", chosen: new Set(), bankId: null };

export const bankAddScreen = {
  id: "bank-add",
  parent: "library",
  render(container, { id }) {
    const bank = store.byId("sets", id);
    if (!bank) return go("library", { view: "banks" });
    if (pool.bankId !== id) Object.assign(pool, { subjectId: "", topicId: "", paperId: "", term: "", chosen: new Set(), bankId: id });
    const syllabus = store.currentSyllabus();
    const inBank = new Set(bank.questionIds);
    const all = store.questionsFor({ syllabusId: syllabus.id });
    const subjects = store.subjectsWithCounts(syllabus.id);
    const topics = pool.subjectId ? store.topicsWithCounts(syllabus.id, pool.subjectId).sort((a, b) => a.topic.name.localeCompare(b.topic.name)) : [];
    const papers = store.papersOf(syllabus.id);
    const select = (name, value, options, allLabel) => html`<select class="field" data-filter="${name}">
      <option value="">${allLabel}</option>
      ${options.map((o) => html`<option value="${o.id}" ${o.id === value ? "selected" : ""}>${o.name}</option>`)}</select>`;

    container.innerHTML = html`${header({ backTo: "bank", backParams: { id }, backLabel: bank.name, title: t("pool.title") })}
      <div class="filters">
        ${select("subjectId", pool.subjectId, subjects.map((x) => ({ id: x.subject.id, name: `${x.subject.name} (${x.count})` })), t("pool.allSubjects"))}
        ${pool.subjectId ? select("topicId", pool.topicId, topics.map((x) => ({ id: x.topic.id, name: `${x.topic.name} (${x.count})` })), t("pool.allTopics")) : ""}
        ${select("paperId", pool.paperId, papers.map((p) => ({ id: p.id, name: p.name })), t("pool.allPapers"))}
        <input type="search" class="search" id="poolSearch" placeholder="${t("pool.search")}" value="${pool.term}" autocomplete="off">
      </div>
      <div class="row-actions"><button type="button" class="link" data-action="select-shown">${t("pool.selectShown")}</button>
        <button type="button" class="link" data-action="clear">${t("pool.clear")}</button></div>
      <p class="hint" id="poolCount"></p>
      <div class="checks" id="poolRows"></div>
      <button type="button" class="btn btn-quiet more" id="poolMore" hidden></button>
      <div class="bottom-bar"><button type="button" class="btn wide" data-action="save" id="poolSave"></button></div>`;

    let shown = 0; let list = [];
    const rowsEl = container.querySelector("#poolRows");
    const moreEl = container.querySelector("#poolMore");
    const filter = () => {
      const term = pool.term.trim().toLowerCase();
      list = all.filter((q) => (!pool.subjectId || q.subjectId === pool.subjectId) && (!pool.topicId || q.topicId === pool.topicId)
        && (!pool.paperId || q.paperId === pool.paperId)
        && (!term || `${q.text} ${q.options.join(" ")}`.toLowerCase().includes(term)));
    };
    const rowHtml = (q) => {
      const has = inBank.has(q.id); const on = pool.chosen.has(q.id) || has;
      return html`<button type="button" class="check ${on ? "on" : ""} ${has ? "is-in" : ""}" data-action="toggle" data-id="${q.id}" data-lp="1" ${has ? "disabled" : ""}>
        <span class="box">${on ? "✓" : ""}</span>
        <span class="row-main"><span class="clamp">${q.text}</span>
          <span class="row-sub">${[store.paper(q.paperId)?.name, q.number ? `Q${q.number}` : null, has ? t("pool.inBank") : null].filter(Boolean).join(" · ")}</span></span>
      </button>`;
    };
    const drawMore = () => {
      const next = list.slice(shown, shown + 50);
      rowsEl.insertAdjacentHTML("beforeend", String(html`${next.map(rowHtml)}`));
      shown += next.length;
      moreEl.hidden = shown >= list.length;
      moreEl.textContent = t("common.showMore", { n: Math.min(50, list.length - shown) });
    };
    const drawFooter = () => {
      container.querySelector("#poolCount").textContent = t("pool.count", { n: list.length });
      const btn = container.querySelector("#poolSave");
      btn.textContent = t("pool.add", { n: pool.chosen.size });
      btn.disabled = !pool.chosen.size;
    };
    const redrawList = () => { filter(); shown = 0; rowsEl.innerHTML = ""; drawMore(); drawFooter(); };
    redrawList();
    moreEl.addEventListener("click", drawMore);

    container.querySelectorAll("[data-filter]").forEach((sel) => sel.addEventListener("change", () => {
      pool[sel.dataset.filter] = sel.value;
      if (sel.dataset.filter === "subjectId") pool.topicId = "";
      store.touch(); // redraw (topic list depends on subject)
    }));
    let timer = null;
    container.querySelector("#poolSearch").addEventListener("input", (e) => { pool.term = e.target.value; clearTimeout(timer); timer = setTimeout(redrawList, 200); });

    onAction(container, {
      ...backHandler,
      toggle: (el) => {
        const qid = el.dataset.id;
        if (pool.chosen.has(qid)) pool.chosen.delete(qid); else pool.chosen.add(qid);
        el.outerHTML = String(rowHtml(store.question(qid)));
        drawFooter();
      },
      "select-shown": () => { list.forEach((q) => { if (!inBank.has(q.id)) pool.chosen.add(q.id); }); redrawList(); },
      clear: () => { pool.chosen.clear(); redrawList(); },
      save: async () => {
        const n = pool.chosen.size;
        await store.quietly(() => mut.addToBank(store.byId("sets", id), [...pool.chosen]));
        pool.chosen = new Set();
        toast(t("banks.added", { n, bank: bank.name }));
        go("bank", { id });
      }
    });
    onLongPress(rowsEl, (el) => previewQuestion(store.question(el.dataset.id)));
  }
};

/** Read-only look at a question (long-press in pickers and search). */
export function previewQuestion(q, { actions = "" , handlers = {} } = {}) {
  if (!q) return;
  const body = openSheet(html`${questionCard(q, { showPaper: true, mode: "study" })}
    <p class="hint">${[store.subject(q.subjectId)?.name, store.topic(q.topicId)?.name].filter(Boolean).join(" › ")}</p>
    ${actions}`, handlers, { label: t("question.preview") });
  body.querySelectorAll(".qcard-badges").forEach((el) => el.remove()); // no editing from a preview
  typesetMath(body);
}

/* ---------- type a question ---------- */

function typeQuestionFlow(bank) {
  const syllabus = store.currentSyllabus();
  const form = { text: "", options: ["", "", "", ""], answerIndex: null, explanation: "", subjectId: null, topicId: null, toPool: false };
  return runFlow(() => new Promise((resolve) => {
    const read = (body) => {
      form.text = body.querySelector("#tqText").value;
      form.options = [...body.querySelectorAll("[data-opt]")].map((el) => el.value);
      form.explanation = body.querySelector("#tqExplain").value;
      form.toPool = body.querySelector("#tqPool").checked;
    };
    const draw = () => {
      const topic = form.topicId ? store.topic(form.topicId) : null;
      openSheet(html`<h2>${t("banks.type")}</h2><p class="hint">${bank.name}</p>
        <label class="field-label" for="tqText">${t("question.question")}</label>
        <textarea class="field" id="tqText" rows="4">${form.text}</textarea>
        ${form.options.map((o, i) => html`<div class="opt-field">
          <button type="button" class="opt-pick ${form.answerIndex === i ? "on" : ""}" data-action="answer" data-i="${i}" aria-label="${t("typeQ.markCorrect", { l: letterFor(i) })}">${letterFor(i)}</button>
          <input class="field" type="text" data-opt="${i}" value="${o}" placeholder="${t("question.option", { l: letterFor(i) })}"></div>`)}
        <p class="hint">${t("typeQ.answerHint")}</p>
        <div class="row-actions">
          ${form.options.length < 6 ? html`<button type="button" class="link" data-action="add-opt">${t("question.addOption")}</button>` : ""}
          ${form.options.length > 2 ? html`<button type="button" class="link danger" data-action="drop-opt">${t("question.removeOption")}</button>` : ""}
        </div>
        <label class="field-label" for="tqExplain">${t("question.explanation")}</label>
        <textarea class="field" id="tqExplain" rows="3">${form.explanation}</textarea>
        <button type="button" class="row" data-action="topic">
          <span class="row-main"><span class="row-title">${t("typeQ.topic")}</span>
          <span class="row-sub">${topic ? `${store.subject(topic.subjectId)?.name} › ${topic.name}` : t("typeQ.pickTopic")}</span></span>${chev}</button>
        <label class="switch-row"><input type="checkbox" id="tqPool" ${form.toPool ? "checked" : ""}>
          <span>${t("typeQ.toPool", { syllabus: syllabus.name })}</span></label>
        <div class="sheet-actions">
          <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
          <button type="button" class="btn" data-action="save">${t("common.save")}</button>
        </div>`, {
        answer: (el) => { read(el.closest(".sheet-body")); const i = Number(el.dataset.i); form.answerIndex = form.answerIndex === i ? null : i; draw(); },
        "add-opt": (el) => { read(el.closest(".sheet-body")); form.options.push(""); draw(); },
        "drop-opt": (el) => { read(el.closest(".sheet-body")); form.options.pop(); if (form.answerIndex >= form.options.length) form.answerIndex = null; draw(); },
        topic: async (el) => {
          read(el.closest(".sheet-body"));
          const pick = await pickTopic({ title: t("typeQ.topic"), current: form.topicId ? { subjectId: form.subjectId, topicId: form.topicId } : null });
          if (!isSheetOpen()) return resolve();
          if (pick) Object.assign(form, pick);
          draw();
        },
        cancel: () => resolve(),
        save: async (el) => {
          read(el.closest(".sheet-body"));
          const options = form.options.map((o) => o.trim());
          if (!form.text.trim() || options.some((o) => !o)) { toast(t("question.formIncomplete")); return; }
          if (!form.topicId) { toast(t("typeQ.needTopic")); return; }
          await mut.typeQuestion({ bank: store.byId("sets", bank.id), syllabusId: syllabus.id, toPool: form.toPool, text: form.text.trim(), options,
            answerIndex: form.answerIndex, explanation: form.explanation.trim(), subjectId: form.subjectId, topicId: form.topicId });
          toast(t("typeQ.saved"));
          resolve();
        }
      }, { label: t("banks.type"), onClose: () => resolve() });
    };
    draw();
  }));
}

