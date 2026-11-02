/* #/repeats  1.27 · Questions PSC asked again: every question that came in two or more papers, once each,
   most-asked first (🔁 n× on each card shows where else it came). One subject or all; practise them as a test.
   1.27.2: "Compare with": this syllabus (default), another syllabus or every other one (questions of this syllabus
   that also came there); "Wording alike": the app's usual rule, or at least 50 / 60 / 75 / 90 / 100 % of the words. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { runFlow, chooseAction } from "../../core/dialogs.js";
import { label as nameLabel } from "../../core/names.js";
import * as store from "../../data/store.js";
import { repeatedQuestions } from "../../data/repeats.js";
import { LEVELS } from "../../domain/repeats.js";
import { mountQuestions } from "../question/list.js";
import { header, backHandler, practice } from "./library.js";

// Kept while the app is open.
let subjectId = null;
let other = null;   // null = this syllabus · a syllabus id · "all" = every other syllabus
let level = "std";  // how alike the wording must be

const levelLabel = (l) => (l === "std" ? t("repeats.level.std") : t("repeats.level.pct", { p: l }));

export const repeatsScreen = {
  id: "repeats",
  parent: "library",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("library");
    const others = store.syllabi().filter((s) => s.id !== syllabus.id);
    if (other && other !== "all" && !others.some((s) => s.id === other)) other = null;
    if (other === "all" && !others.length) other = null;
    if (subjectId && !store.subject(subjectId)) subjectId = null;
    const all = repeatedQuestions(syllabus.id, { other, level });
    const list = subjectId ? all.filter((x) => x.q.subjectId === subjectId) : all;
    const questions = list.map((x) => x.q);
    const byId = new Map(list.map((x) => [x.q.id, x]));
    const most = list[0]?.times || 0;
    const otherName = other === "all" ? t("repeats.allOther") : others.find((s) => s.id === other)?.name || "";
    container.innerHTML = html`${header({ backTo: "library", backParams: { view: "papers" }, backLabel: t("tabs.library"), title: html`🔁 ${t("repeats.title")}`, sub: t("repeats.sub", { n: questions.length, most }) })}
      <p class="hint">${other ? t("repeats.hintOther", { here: syllabus.name, other: otherName }) : t("repeats.hint")}</p>
      <div class="chip-wrap">
        ${others.length ? html`<button type="button" class="pill ${other ? "on" : ""}" data-action="other">🗂 ${other ? t("repeats.withOther", { name: otherName }) : t("repeats.withinThis")} ▾</button>` : ""}
        <button type="button" class="pill ${level !== "std" ? "on" : ""}" data-action="level">≈ ${levelLabel(level)} ▾</button>
        <button type="button" class="pill ${subjectId ? "on" : ""}" data-action="subject">${subjectId ? nameLabel(store.subject(subjectId)) : t("repeats.allSubjects")} ▾</button></div>
      ${questions.length ? html`<div class="actions-row"><button type="button" class="btn" data-action="practice">▶ ${t("practice.button")}</button></div>`
        : html`<p class="hint pad">${other ? t("repeats.noneOther", { other: otherName }) : t("repeats.none")}</p>`}
      <div id="qHost"></div>`;
    const key = `repeats:${other || "this"}:${level}:${subjectId || "all"}`;
    onAction(container, {
      ...backHandler,
      practice: () => practice(key, questions, { type: "custom", ref: "repeats", label: t("repeats.title") }),
      other: () => runFlow(async () => {
        const id = await chooseAction({ title: t("repeats.compareTitle"), sub: t("repeats.compareSub", { name: syllabus.name }), items: [
          { id: "this", label: t("repeats.withinThis"), sub: t("repeats.withinThisSub", { name: syllabus.name }), current: !other },
          ...others.map((s) => ({ id: s.id, label: t("repeats.withOther", { name: s.name }), sub: t("repeats.withOtherSub", { here: syllabus.name, other: s.name }), current: other === s.id })),
          others.length > 1 ? { id: "all", label: t("repeats.withOther", { name: t("repeats.allOther") }), sub: t("repeats.withAllSub", { here: syllabus.name }), current: other === "all" } : null
        ].filter(Boolean) });
        if (!id) return;
        other = id === "this" ? null : id;
        store.touch();
      }),
      level: () => runFlow(async () => {
        const id = await chooseAction({ title: t("repeats.levelTitle"), sub: t("repeats.levelSub"), items: LEVELS.map((l) => ({ id: String(l), label: levelLabel(l), sub: t(`repeats.levelHint.${l}`), current: String(level) === String(l) })) });
        if (!id) return;
        level = id === "std" ? "std" : Number(id);
        store.touch();
      }),
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
    // The 🔁 count and "where else" on each card follow the choices here.
    if (questions.length) mountQuestions(container.querySelector("#qHost"), { key, questions, showPaper: true,
      repeats: { timesOf: (q) => byId.get(q.id)?.times ?? null, placesOf: (q) => byId.get(q.id)?.places || null } });
  }
};
