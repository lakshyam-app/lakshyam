/* 1.26 · Tidy up the Library.
   #/tidy?id=<"Other" topic>   AI suggests the right topic for each question filed under a subject's catch-all
                               "Other" topic; you check the list and apply the ones you want (Undo right after).
                               Nothing moves until you tap Apply. Your past answers move with the questions.
   lookAlikeSheet()            subjects and topics whose names look like the same thing, with a Merge button
                               (the usual rename-and-merge, which asks first). */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go, goBack } from "../../core/router.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import { runFlow, confirmAction } from "../../core/dialogs.js";
import { can } from "../../core/entitlements.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { ask, parseJsonLoose, aiControl } from "../../ai/client.js";
import * as P from "../../ai/prompts.js";
import { ensureAi, errorText } from "../ai/ai-ui.js";
import { lookAlikePairs } from "../../domain/names-alike.js";
import { renameSubjectTo, renameTopicTo } from "./topic-actions.js";

const BATCH = 25;
/* topic id → { status: "idle" | "running" | "done" | "error", items: [{ id, to, on }], done, total, error, control }.
   Kept while the app is open, so you can look elsewhere while it works. */
const runs = new Map();

/** The subject's real topics (not the catch-all), in syllabus order. */
function targetsOf(topic) {
  return store.topicsOf(topic.subjectId).filter((x) => x.id !== topic.id && !x.isFallback);
}

async function sortAll(topic, questions) {
  if (!(await ensureAi())) return;
  const targets = targetsOf(topic);
  const keys = targets.map((x, i) => ({ key: `T${i + 1}`, name: x.name, id: x.id }));
  const byKey = new Map(keys.map((k) => [k.key, k.id]));
  const run = { status: "running", items: [], done: 0, total: questions.length, error: null };
  run.control = aiControl(() => store.touch());
  runs.set(topic.id, run);
  store.touch();
  try {
    for (let i = 0; i < questions.length; i += BATCH) {
      if (run.cancelled) break;
      const batch = questions.slice(i, i + BATCH);
      const items = batch.map((q, k) => ({ n: k + 1, text: q.text, options: q.options }));
      const { text } = await ask(P.TIDY_SYSTEM, P.tidyTask(store.subject(topic.subjectId)?.name || "", keys, items), 1500, { control: run.control });
      const arr = parseJsonLoose(text);
      const got = new Map((Array.isArray(arr) ? arr : []).map((x) => [Number(x.n), String(x.t || "").trim().toUpperCase()]));
      batch.forEach((q, k) => {
        const to = byKey.get(got.get(k + 1)) || null; // T0, unknown or missing: stays in "Other"
        run.items.push({ id: q.id, to, on: Boolean(to) });
      });
      run.done = Math.min(questions.length, i + batch.length);
      store.touch();
    }
    run.status = "done";
  } catch (e) {
    run.status = run.items.length ? "done" : "error";
    run.error = errorText(e);
  }
  store.touch();
}

export const tidyScreen = {
  id: "tidy",
  parent: "library",
  render(container, { id }) {
    const topic = store.topic(id);
    const syllabus = store.currentSyllabus();
    if (!topic || !syllabus) return go("library");
    const subject = store.subject(topic.subjectId);
    const questions = store.questionsFor({ syllabusId: syllabus.id, topicId: id });
    const targets = targetsOf(topic);
    const run = runs.get(id) || { status: "idle", items: [] };
    // Only questions still in "Other" (you may have moved some by hand since).
    const items = run.items.filter((x) => store.question(x.id)?.topicId === id);
    const chosen = items.filter((x) => x.on && x.to);
    const options = (sel) => html`<option value="">${t("tidy.keep")}</option>${targets.map((x) => html`<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${x.name}</option>`)}`;

    container.innerHTML = html`<header class="screen-head"><div class="head-bar"><button type="button" class="back" data-action="back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${nameLabel(topic)}</span></button></div>
      <h1>🤖 ${t("tidy.title")}</h1><p class="hint">${nameLabel(subject)} · ${t("common.questions", { n: questions.length })}</p></header>
      ${run.status === "idle" ? html`<div class="panel">
          <p>${t("tidy.intro", { n: questions.length, topics: targets.length })}</p>
          <p class="hint">${t("tidy.introHint", { n: Math.ceil(questions.length / BATCH) })}</p>
          ${!can("ai") ? html`<p class="warn-box">${t("ai.err.noPreset")}</p>` : !targets.length ? html`<p class="warn-box">${t("tidy.noTopics")}</p>`
            : html`<button type="button" class="btn wide" data-action="start" ${questions.length ? "" : "disabled"}>🤖 ${t("tidy.start")}</button>`}
        </div>` : ""}
      ${run.status === "running" ? html`<div class="panel"><p class="sheet-status">${t("tidy.working", { n: run.done, of: run.total })}</p>
          <div class="progress-bar"><span style="width:${Math.round((100 * run.done) / Math.max(1, run.total))}%"></span></div>
          <button type="button" class="btn btn-quiet" data-action="stop">${t("tidy.stop")}</button></div>` : ""}
      ${run.status === "error" ? html`<p class="warn-box pre">${run.error}</p><button type="button" class="btn" data-action="start">${t("ai.tryAgain")}</button>` : ""}
      ${run.status === "done" ? html`
        ${run.error ? html`<p class="warn-box pre">${run.error}</p>` : ""}
        <p class="hint">${t("tidy.reviewHint")}</p>
        <div class="tidy-sum"><span>${t("tidy.toMove", { n: chosen.length })}</span><span class="hint">${t("tidy.toStay", { n: items.length - chosen.length })}</span></div>
        <div class="tidy-list">${items.map((x) => {
          const q = store.question(x.id);
          return html`<div class="tidy-item ${x.on && x.to ? "on" : ""}" data-qid="${x.id}">
            <label class="tidy-check"><input type="checkbox" data-tick="${x.id}" ${x.on && x.to ? "checked" : ""} ${x.to ? "" : "disabled"} aria-label="${t("tidy.moveThis")}"></label>
            <div class="tidy-main"><p class="tidy-q clamp">${q?.text || ""}</p>
              <select class="tidy-to" data-to="${x.id}" aria-label="${t("tidy.topicFor")}">${options(x.to)}</select></div></div>`;
        })}</div>
        <div class="sticky-actions"><button type="button" class="btn btn-quiet" data-action="discard">${t("tidy.discard")}</button>
          <button type="button" class="btn" data-action="apply" ${chosen.length ? "" : "disabled"}>${t("tidy.apply", { n: chosen.length })}</button></div>` : ""}`;

    // Ticks and topic choices update the list in place (no redraw, so you keep your place in a long list).
    const recount = () => {
      const n = items.filter((x) => x.on && x.to).length;
      const sum = container.querySelector(".tidy-sum");
      if (sum) sum.innerHTML = String(html`<span>${t("tidy.toMove", { n })}</span><span class="hint">${t("tidy.toStay", { n: items.length - n })}</span>`);
      const btn = container.querySelector('[data-action="apply"]');
      if (btn) { btn.textContent = t("tidy.apply", { n }); btn.disabled = !n; }
    };
    const paintRow = (it) => {
      const row = container.querySelector(`.tidy-item[data-qid="${CSS.escape(it.id)}"]`);
      if (!row) return;
      row.classList.toggle("on", Boolean(it.on && it.to));
      const box = row.querySelector("[data-tick]"); box.disabled = !it.to; box.checked = Boolean(it.on && it.to);
    };
    container.querySelectorAll("[data-tick]").forEach((box) => box.addEventListener("change", () => {
      const it = run.items.find((x) => x.id === box.dataset.tick); if (it) { it.on = box.checked; paintRow(it); recount(); }
    }));
    container.querySelectorAll("[data-to]").forEach((sel) => sel.addEventListener("change", () => {
      const it = run.items.find((x) => x.id === sel.dataset.to); if (it) { it.to = sel.value || null; it.on = Boolean(sel.value); paintRow(it); recount(); }
    }));
    onAction(container, {
      back: () => goBack("topic", { id }),
      start: () => sortAll(topic, questions),
      stop: () => { run.cancelled = true; run.control?.cancel?.(); },
      discard: () => runFlow(async () => {
        if (!(await confirmAction({ title: t("tidy.discardTitle"), confirmLabel: t("tidy.discard"), danger: true }))) return;
        runs.delete(id); store.touch();
      }),
      apply: () => runFlow(async () => {
        const moves = items.filter((x) => x.on && x.to).map((x) => ({ id: x.id, subjectId: topic.subjectId, topicId: x.to }));
        if (!moves.length) return;
        const before = await mut.moveQuestions(moves);
        runs.delete(id);
        toast(t("tidy.moved", { n: moves.length }), { actionLabel: t("common.undo"), duration: 10000, onAction: () => mut.undoMoves(before) });
        go("topic", { id }, { replace: true });
      })
    });
  }
};

/* ---------- look-alike names ---------- */

/** Pairs of subjects (in this syllabus) and of topics (within a subject) that look like the same thing. */
export function lookAlikes(syllabus) {
  const subjects = store.subjectsWithCounts(syllabus.id).map((x) => x.subject).filter(Boolean);
  const subjectPairs = lookAlikePairs(subjects);
  const topicPairs = subjects.flatMap((s) => lookAlikePairs(store.topicsOf(s.id).filter((x) => !x.isFallback)));
  return { subjectPairs, topicPairs, n: subjectPairs.length + topicPairs.length };
}

export function lookAlikeSheet() {
  const syllabus = store.currentSyllabus();
  if (!syllabus) return;
  const { subjectPairs, topicPairs, n } = lookAlikes(syllabus);
  const count = (kind, x) => (kind === "subject" ? store.questionsFor({ syllabusId: syllabus.id, subjectId: x.id }).length : store.questionsFor({ syllabusId: syllabus.id, topicId: x.id }).length);
  const pair = (kind, p, i) => html`<div class="alike-row"><p><b>${nameHtml(p.a)}</b> <span class="hint">(${count(kind, p.a)})</span><br>≈ <b>${nameHtml(p.b)}</b> <span class="hint">(${count(kind, p.b)})</span>${kind === "topic" ? html`<br><span class="hint">${nameLabel(store.subject(p.a.subjectId))}</span>` : ""}</p>
    <div class="actions-row"><button type="button" class="btn btn-quiet btn-small" data-action="merge" data-kind="${kind}" data-i="${i}" data-dir="ab">${t("alike.mergeInto", { name: p.b.name })}</button>
      <button type="button" class="btn btn-quiet btn-small" data-action="merge" data-kind="${kind}" data-i="${i}" data-dir="ba">${t("alike.mergeInto", { name: p.a.name })}</button></div></div>`;
  openSheet(html`<h2>🔎 ${t("alike.title")}</h2>
    <p class="hint">${n ? t("alike.hint") : t("alike.none")}</p>
    ${subjectPairs.length ? html`<h3 class="rows-head">${t("alike.subjects")}</h3>${subjectPairs.map((p, i) => pair("subject", p, i))}` : ""}
    ${topicPairs.length ? html`<h3 class="rows-head">${t("alike.topics")}</h3>${topicPairs.map((p, i) => pair("topic", p, i))}` : ""}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, {
    close: () => closeSheet(),
    merge: (el) => runFlow(async () => {
      const list = el.dataset.kind === "subject" ? subjectPairs : topicPairs;
      const p = list[Number(el.dataset.i)];
      if (!p) return;
      const [from, into] = el.dataset.dir === "ab" ? [p.a, p.b] : [p.b, p.a];
      closeSheet();
      if (el.dataset.kind === "subject") await renameSubjectTo(from, into.name);
      else await renameTopicTo(from, into.name);
    })
  }, { label: t("alike.title") });
}
