/* Topic and subject actions: rename (merges on a name clash), colour label,
   topic lists, studied −1. Used from ⋯ menus and long-press. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet } from "../../core/sheet.js";
import { runFlow, chooseAction, askText, confirmAction } from "../../core/dialogs.js";
import { nameMode, label as nameLabel } from "../../core/names.js";
import { editNames } from "../settings/names.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { ids } from "../../data/ids.js";

export const LABELS = [
  { name: "Red", color: "#b14b4b" }, { name: "Gold", color: "#c9932b" },
  { name: "Green", color: "#3e7a4f" }, { name: "Blue", color: "#3f5c8a" },
  { name: "Purple", color: "#7a4a9e" }, { name: "Teal", color: "#2f6f5e" }
];

export const labelFor = (syllabusId, topicId) => store.byId("labels", ids.label(syllabusId, topicId)) || null;
export const labelDot = (label) => (label ? html`<span class="dot" style="background:${label.color}" title="${t(`labels.${label.name}`, {})}"></span>` : "");

/** Long-press / topic page menu. extra: items only shown on the topic page. */
export function topicMenu(topic, { listId = null, onPage = false, extra = [] } = {}) {
  const syllabus = store.currentSyllabus();
  const label = labelFor(syllabus.id, topic.id);
  const list = listId ? store.byId("topicLists", listId) : null;
  return runFlow(async () => {
    const id = await chooseAction({ title: nameLabel(topic), sub: nameLabel(store.subject(topic.subjectId)), items: [
      onPage ? null : { id: "open", label: t("topicMenu.open") },
      { id: "list", label: t("topicMenu.addToList") },
      { id: "label", label: label ? t("topicMenu.changeLabel", { label: t(`labels.${label.name}`) }) : t("topicMenu.addLabel") },
      list ? { id: "unlist", label: t("topicMenu.removeFromList", { list: list.name }) } : null,
      ...extra,
      { id: "rename", label: t("topicMenu.rename") }
    ] });
    if (!id) return;
    if (id === "open") return go("topic", { id: topic.id });
    if (id === "list") return toggleListsSheet(topic);
    if (id === "label") return chooseLabel(syllabus.id, topic);
    if (id === "unlist") { await mut.toggleTopicInList(list, topic.id); toast(t("topicMenu.removed")); return; }
    if (id === "rename") return renameTopicFlow(topic);
    return extra.find((x) => x.id === id)?.run?.();
  });
}

async function chooseLabel(syllabusId, topic) {
  const current = labelFor(syllabusId, topic.id);
  const id = await chooseAction({ title: t("labels.title"), sub: nameLabel(topic), items: [
    ...LABELS.map((l) => ({ id: l.name, label: html`<span class="dot" style="background:${l.color}"></span> ${t(`labels.${l.name}`)}`, current: current?.name === l.name })),
    { id: "__none", label: t("labels.none"), current: !current }
  ] });
  if (!id) return;
  await mut.setLabel(syllabusId, topic.id, id === "__none" ? null : LABELS.find((l) => l.name === id));
}

/** Tick the lists this topic belongs to; "New list" creates one with the topic in it. */
function toggleListsSheet(topic) {
  return new Promise((resolve) => {
    const draw = () => {
      const lists = store.all("topicLists").sort((a, b) => a.name.localeCompare(b.name));
      openSheet(html`<h2>${t("lists.addTitle")}</h2><p class="hint">${nameLabel(topic)}</p>
        <div class="checks">${lists.map((l) => {
          const on = l.topicIds.includes(topic.id);
          return html`<button type="button" class="check ${on ? "on" : ""}" data-action="toggle" data-id="${l.id}" aria-pressed="${String(on)}">
            <span class="box">${on ? "✓" : ""}</span><span class="row-main"><span>${l.name}</span>
            <span class="row-sub">${t("common.topics", { n: l.topicIds.length })}</span></span></button>`;
        })}</div>
        ${lists.length ? "" : html`<p class="hint">${t("lists.none")}</p>`}
        <button type="button" class="link" data-action="new">${t("lists.newList")}</button>
        <div class="sheet-actions"><button type="button" class="btn" data-action="done">${t("common.done")}</button></div>`, {
        toggle: async (el) => { await store.quietly(() => mut.toggleTopicInList(store.byId("topicLists", el.dataset.id), topic.id)); draw(); },
        new: async () => {
          const name = await askText({ title: t("lists.newList"), placeholder: t("lists.namePlaceholder"), confirmLabel: t("common.create") });
          if (name) await store.quietly(() => mut.createList(name, topic.id));
          draw();
        },
        done: () => resolve()
      }, { onClose: () => resolve() });
    };
    draw();
  }).then(() => store.touch()); // one redraw at the end
}

export async function renameTopicFlow(topic) {
  if (nameMode() !== "en") return editNames("topic", topic, { onEnglish: (name) => renameTopicTo(topic, name, { quiet: true }) });
  const name = await askText({ title: t("topicMenu.rename"), hint: t("topicMenu.renameHint"), value: topic.name });
  if (!name || name === topic.name) return;
  await renameTopicTo(topic, name);
}

/** Renames (merging into a same-named topic after asking). Returns the topic that now
    holds everything, or null if the merge was cancelled. */
export async function renameTopicTo(topic, name, { quiet = false } = {}) {
  const clash = mut.findTopicByName(topic.subjectId, name);
  if (clash && clash.id !== topic.id) {
    const ok = await confirmAction({ title: t("merge.title", { name: clash.name }), body: t("merge.topicBody", { from: topic.name, to: clash.name }), confirmLabel: t("merge.button") });
    if (!ok) return null;
  }
  const result = await mut.renameTopic(topic, name);
  if (result.merged) { toast(t("merge.done", { name: result.into.name })); go("topic", { id: result.into.id }); return result.into; }
  if (!quiet) toast(t("topicMenu.renamed"));
  return store.topic(topic.id);
}

export async function renameSubjectFlow(subject) {
  if (nameMode() !== "en") return editNames("subject", subject, { onEnglish: (name) => renameSubjectTo(subject, name, { quiet: true }) });
  const name = await askText({ title: t("subjectMenu.rename"), hint: t("topicMenu.renameHint"), value: subject.name });
  if (!name || name === subject.name) return;
  await renameSubjectTo(subject, name);
}

export async function renameSubjectTo(subject, name, { quiet = false } = {}) {
  const clash = mut.findSubjectByName(name);
  if (clash && clash.id !== subject.id) {
    const ok = await confirmAction({ title: t("merge.title", { name: clash.name }), body: t("merge.subjectBody", { from: subject.name, to: clash.name }), confirmLabel: t("merge.button") });
    if (!ok) return null;
  }
  const result = await mut.renameSubject(subject, name);
  if (result.merged) { toast(t("merge.done", { name: result.into.name })); go("subject", { id: result.into.id }); return result.into; }
  if (!quiet) toast(t("topicMenu.renamed"));
  return store.subject(subject.id);
}

/** Studied +1 with Undo (the undo is the −1). */
export async function markStudied(syllabusId, topic) {
  await mut.addStudied(syllabusId, topic.id, +1);
  const n = store.topicStateFor(syllabusId, topic.id)?.studiedCount || 0;
  toast(t("studied.done", { n }), { actionLabel: t("common.undo"), onAction: () => mut.addStudied(syllabusId, topic.id, -1) });
}
