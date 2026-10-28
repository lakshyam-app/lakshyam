/* #/topic-notes?id=…  A topic's own notes (1.26.5): several per topic, each with a name.
   Shown as a list of names (newest edit first); tap one to read it laid out, then edit, copy or delete it.
   "＋ New note": give it a name (or let the first heading of the pasted text name it) and paste or write the text. */
import { html, onAction } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import { plainPreview, bodyWithoutTitle } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { header, backHandler } from "../library/library.js";
import { topicNotes, noteTitle, viewTopicNote, editTopicNote } from "./note-editor.js";

export const topicNotesScreen = {
  id: "topic-notes",
  parent: "library",
  render(container, { id }) {
    const topic = store.topic(id);
    if (!topic) return go("library");
    const notes = topicNotes(id);
    const when = (ms) => (ms ? new Date(ms).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" }) : "");
    container.innerHTML = html`${header({ backTo: "topic", backParams: { id }, backLabel: nameLabel(topic), title: html`📝 ${t("notes.myNotes")}`, sub: html`${nameHtml(topic)} · ${t("notes.nNotes", { n: notes.length })}` })}
      <div class="actions-row"><button type="button" class="btn" data-action="new">＋ ${t("notes.newNote")}</button></div>
      ${notes.length ? html`<div class="rows my-notes">${notes.map((n) => html`<button type="button" class="row" data-action="read" data-id="${n.id}">
          <span class="row-main"><span class="row-title">${noteTitle(n)}</span>
            <span class="row-sub">${when(n.updatedAt)}${n.text ? ` · ${plainPreview(bodyWithoutTitle(n.text, noteTitle(n)), 90)}` : ""}</span></span><span class="chev-txt">›</span></button>`)}</div>`
        : html`<p class="hint pad">${t("notes.topicEmpty")}</p>`}`;
    const refresh = () => store.touch();
    onAction(container, {
      ...backHandler,
      new: () => editTopicNote(id, null, { onChange: refresh }),
      read: (el) => viewTopicNote(el.dataset.id, { onChange: refresh })
    });
  }
};
