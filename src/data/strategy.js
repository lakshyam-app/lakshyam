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

/** Forgets the topic's saved strategy (also the copy in its note, for the question makers). Returns the old one for Undo. */
export async function clearStrategy(topicId) {
  const prev = store.setting(key(topicId), null);
  await store.quietly(() => store.setSetting(key(topicId), { cleared: true, at: Date.now() }));
  return prev;
}
export const restoreStrategy = (topicId, prev) => store.quietly(() => store.setSetting(key(topicId), prev || null));

/** True when the topic's own note holds a strategy you added to it (that copy is yours to edit). */
export function noteHasStrategy(topicId) {
  const note = store.byId("notes", ids.note("topic", topicId));
  return Boolean(note?.text && NOTE_MARK.test(note.text));
}

/** { text, at, by, from: "saved" | "note" } or null. */
export function strategyFor(topicId) {
  const saved = store.setting(key(topicId), null);
  if (saved?.text) return { ...saved, from: "saved" };
  if (saved?.cleared) return null; // cleared by you: the old copy in the note no longer counts
  const note = store.byId("notes", ids.note("topic", topicId));
  const m = note?.text ? NOTE_MARK.exec(note.text) : null;
  if (!m) return null;
  const rest = note.text.slice(m.index + m[0].length);
  const end = rest.search(/\n🤖 /);
  const text = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return text ? { text, at: note.updatedAt || null, by: "", from: "note" } : null;
}
