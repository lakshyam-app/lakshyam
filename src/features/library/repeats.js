/* #/repeats  1.27 · Questions PSC asked again: every question that came in two or more papers, once each,
   most-asked first (🔁 n× on each card shows where else it came). One subject or all; practise them as a test. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import { label as nameLabel } from "../../core/names.js";
import * as store from "../../data/store.js";
import { repeatedQuestions } from "../../data/repeats.js";
import { mountQuestions } from "../question/list.js";
import { header, backHandler, practice } from "./library.js";

let subjectId = null; // kept while the app is open

export const repeatsScreen = {
  id: "repeats",
  parent: "library",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("library");
    if (subjectId && !store.subject(subjectId)) subjectId = null;
    const all = repeatedQuestions(syllabus.id);
    const list = subjectId ? all.filter((x) => x.q.subjectId === subjectId) : all;
    const questions = list.map((x) => x.q);
    const most = list[0]?.times || 0;
    container.innerHTML = html`${header({ backTo: "library", backParams: { view: "papers" }, backLabel: t("tabs.library"), title: html`🔁 ${t("repeats.title")}`, sub: t("repeats.sub", { n: questions.length, most }) })}
      <p class="hint">${t("repeats.hint")}</p>
      <div class="chip-wrap"><button type="button" class="pill ${subjectId ? "on" : ""}" data-action="subject">${subjectId ? nameLabel(store.subject(subjectId)) : t("repeats.allSubjects")} ▾</button></div>
      ${questions.length ? html`<div class="actions-row"><button type="button" class="btn" data-action="practice">▶ ${t("practice.button")}</button></div>` : html`<p class="hint pad">${t("repeats.none")}</p>`}
      <div id="qHost"></div>`;
    const key = `repeats:${subjectId || "all"}`;
    onAction(container, {
      ...backHandler,
      practice: () => practice(key, questions, { type: "custom", ref: "repeats", label: t("repeats.title") }),
      subject: () => runFlow(async () => {
        const counts = new Map(); all.forEach((x) => counts.set(x.q.subjectId, (counts.get(x.q.subjectId) || 0) + 1));
        const id = await chooseAction({ title: t("repeats.whichSubject"), items: [
          { id: "all", label: t("repeats.allSubjects"), sub: String(all.length), current: !subjectId },
          ...[...counts.entries()].map(([sid, n]) => ({ id: sid, label: nameLabel(store.subject(sid)) || "—", sub: String(n), current: subjectId === sid }))
            .sort((a, b) => Number(b.sub) - Number(a.sub))] });
        if (!id) return;
        subjectId = id === "all" ? null : id;
        store.touch();
      })
    });
    if (questions.length) mountQuestions(container.querySelector("#qHost"), { key, questions, showPaper: true });
  }
};
