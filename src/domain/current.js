/* Is a question about something that changes over time (current affairs, who holds a post now, "latest")?
   Then an AI answering from memory may be out of date, so the app looks it up on the web. Pure, unit-tested. */

const SUBJECT = /current\s*affairs|ആനുകാലിക|സമകാലിക/i;
// Words that ask about the present (English and Malayalam).
const NOW_EN = /\b(present|presently|current|currently|now|at\s+present|recent|recently|latest|newly|new(?=\s+(?:chief|head|chair|ceo|director|governor|president|secretary|minister|captain|judge|commissioner|chairman|chairperson|vice))|incumbent|serving|appointed|elected|sworn\s+in|takes?\s+charge|took\s+charge|this\s+year)\b/i;
const NOW_ML = /(നിലവിലെ|നിലവിൽ|ഇപ്പോഴത്തെ|ഇപ്പോൾ|ഇപ്പോഴുള്ള|അടുത്തിടെ|അടുത്തകാലത്ത്|പുതുതായി|പുതിയ|നിയമിതന|നിയമിതയ|നിയമിക്കപ്പെട്ട|നിയമിച്ച|തിരഞ്ഞെടുക്കപ്പെട്ട|ചുമതലയേറ്റ|സ്ഥാനമേറ്റ|ഈ വർഷ)/;

/** → "" (not time-sensitive) or why it is: "subject" | "words" | "year". */
export function timeSensitive(q, { subject = "", topic = "", now = new Date() } = {}) {
  if (SUBJECT.test(`${subject} ${topic}`)) return "subject";
  const text = `${q?.text || ""} ${(q?.options || []).join(" ")}`;
  if (NOW_EN.test(text) || NOW_ML.test(text)) return "words";
  const y = now.getFullYear();
  const years = (text.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  if (years.some((x) => x >= y - 1 && x <= y + 1)) return "year";
  return "";
}

/** A chat message that asks about now ("who is it now?", "ഇപ്പോൾ ആരാണ്?"). */
export const asksAboutNow = (message) => NOW_EN.test(String(message || "")) || NOW_ML.test(String(message || ""));

/** The year of a PSC paper from its code, e.g. "05_118/22 – M" → 2022, "15_060/2023-M" → 2023 (null if not shown). */
export function examYear(name) {
  const m = /\/\s*(\d{4}|\d{2})(?!\d)/.exec(String(name || ""));
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  return y >= 1990 && y <= 2100 ? y : null;
}
