/* The latest AI topic strategy for each topic (from Topic page → 🤖 AI strategy), kept so the
   question makers can follow the topic's past-paper pattern. Stored as a setting per topic, so it
   goes into backups. Strategies saved only into a topic's note (before this existed) are found there. */
import * as store from "./store.js";
import { ids } from "./ids.js";
export { patternFrom } from "../domain/topic-pattern.js";

const key = (topicId) => `strategy:${topicId}`;
// The heading the strategy gets when added to a note, in English and Malayalam.
const NOTE_MARK = /^🤖\s*(Topic strategy|ടോപ്പിക് പഠന തന്ത്രം)[^\n]*\n/m;

export function saveStrategy(topicId, { text, by = "", lang = "en" }) {
  if (!topicId || !String(text || "").trim()) return Promise.resolve();
  return store.quietly(() => store.setSetting(key(topicId), { text: String(text).slice(0, 30000), by, lang, at: Date.now() }));
}

/** { text, at, by, from: "saved" | "note" } or null. */
export function strategyFor(topicId) {
  const saved = store.setting(key(topicId), null);
  if (saved?.text) return { ...saved, from: "saved" };
  const note = store.byId("notes", ids.note("topic", topicId));
  const m = note?.text ? NOTE_MARK.exec(note.text) : null;
  if (!m) return null;
  const rest = note.text.slice(m.index + m[0].length);
  const end = rest.search(/\n🤖 /);
  const text = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return text ? { text, at: note.updatedAt || null, by: "", from: "note" } : null;
}
