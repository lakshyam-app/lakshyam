/* Sheet for choosing a subject and topic (with search and "add new").
   Resolves { subjectId, topicId } or null. Leaves the sheet open (use inside runFlow). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, isSheetOpen } from "../../core/sheet.js";
import { askText } from "../../core/dialogs.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";

const lower = (s) => String(s || "").toLowerCase();

export function pickTopic({ title, current = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let q = "";

    const subjects = () => store.all("subjects").sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    function subjectStep() {
      const body = openSheet(html`<h2>${title}</h2>
        <p class="hint">${t("picker.pickSubject")}</p>
        <input type="search" class="search" id="pkSearch" placeholder="${t("common.searchPlaceholder")}" value="${q}" autocomplete="off">
        <div class="menu" id="pkRows"></div>
        <button type="button" class="link" data-action="new-subject">${t("picker.newSubject")}</button>`, {
        subject: (el) => topicStep(el.dataset.id),
        "new-subject": async () => {
          const name = await askText({ title: t("picker.newSubject"), placeholder: t("picker.subjectName"), confirmLabel: t("common.add") });
          if (!name) return isSheetOpen() ? subjectStep() : finish(null);
          const s = await store.quietly(() => mut.addSubject(name));
          topicStep(s.id);
        }
      }, { label: title, onClose: () => finish(null) });
      const draw = () => {
        const term = lower(q);
        body.querySelector("#pkRows").innerHTML = html`${subjects().filter((s) => !term || lower(s.name).includes(term)).map((s) => html`
          <button type="button" class="menu-item ${s.id === current?.subjectId ? "is-current" : ""}" data-action="subject" data-id="${s.id}">
            <span class="row-main"><span>${s.name}</span></span><span class="row-count">${store.topicsOf(s.id).length}</span>
          </button>`)}`;
      };
      body.querySelector("#pkSearch").addEventListener("input", (e) => { q = e.target.value; draw(); });
      draw();
    }

    function topicStep(subjectId) {
      const subject = store.subject(subjectId);
      let tq = "";
      const body = openSheet(html`<button type="button" class="back" data-action="back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>${t("picker.subjects")}</span></button>
        <h2>${subject.name}</h2>
        <p class="hint">${t("picker.pickTopic")}</p>
        <input type="search" class="search" id="pkSearch" placeholder="${t("common.searchPlaceholder")}" autocomplete="off">
        <div class="menu" id="pkRows"></div>
        <button type="button" class="link" data-action="new-topic">${t("picker.newTopic")}</button>`, {
        back: subjectStep,
        topic: (el) => finish({ subjectId, topicId: el.dataset.id }),
        "new-topic": async () => {
          const name = await askText({ title: t("picker.newTopic"), hint: subject.name, placeholder: t("picker.topicName"), confirmLabel: t("common.add") });
          if (!name) return isSheetOpen() ? topicStep(subjectId) : finish(null);
          const topic = await store.quietly(() => mut.addTopic(subjectId, name));
          finish({ subjectId, topicId: topic.id });
        }
      }, { label: title, onClose: () => finish(null) });
      const draw = () => {
        const term = lower(tq);
        body.querySelector("#pkRows").innerHTML = html`${store.topicsOf(subjectId).filter((x) => !term || lower(x.name).includes(term)).map((x) => html`
          <button type="button" class="menu-item ${x.id === current?.topicId ? "is-current" : ""}" data-action="topic" data-id="${x.id}">
            <span class="row-main"><span>${x.name}</span></span>${x.id === current?.topicId ? html`<span class="tick">✓</span>` : ""}
          </button>`)}`;
      };
      body.querySelector("#pkSearch").addEventListener("input", (e) => { tq = e.target.value; draw(); });
      draw();
    }

    if (current?.subjectId && store.subject(current.subjectId)) topicStep(current.subjectId);
    else subjectStep();
  });
}
