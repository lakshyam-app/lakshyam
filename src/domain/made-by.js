/* Which AI model made something: kept with AI questions, flashcards, PDF notes, style guides and
   topic strategies (model name only, never a key), and shown in small text. Pure helpers. */

/** { "gemini-3.8-flash": 9, "gemma-4-31b-it": 3 } → "gemini-3.8-flash (9) · gemma-4-31b-it (3)" (most used first). */
export function countsLine(map) {
  const e = Object.entries(map || {}).filter(([m, n]) => m && n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!e.length) return "";
  if (e.length === 1) return e[0][0];
  return e.map(([m, n]) => `${m} (${n})`).join(" · ");
}

/** Model names used, most used first. */
export const modelNames = (map) => Object.entries(map || {}).filter(([m, n]) => m && n > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m);

/** What one saved item records: { by, checkedBy? } or null. */
export function aiModelOf(madeBy, checkedBy = null) {
  if (!madeBy) return null;
  return checkedBy ? { by: String(madeBy), checkedBy: String(checkedBy) } : { by: String(madeBy) };
}

/** The model a saved item was made with (questions and cards keep it in aiModel; older items have none). */
export const madeByOf = (x) => x?.aiModel?.by || null;
