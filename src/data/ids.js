/* Stable IDs and name matching.
   Imported records get deterministic IDs (same input → same ID), so
   importing the same backup twice updates records instead of duplicating. */

/** Matching key for names: case, spaces and punctuation are ignored,
    letters, digits and Malayalam vowel signs are kept.
    "Light, Lens & Mirrors" and "Light Lens & Mirrors" → "lightlensmirrors" */
export function nameKey(name) {
  return String(name ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

/** Short readable slug for IDs. Falls back to the key for non-Latin names. */
export function slug(name) {
  const s = String(name ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || nameKey(name).slice(0, 24) || "x";
}

export const ids = {
  syllabus: (oldId) => `syl:${oldId}`,
  subject: (subjectKey) => `sub:${subjectKey}`,
  topic: (subjectKey, topicKey) => `top:${subjectKey}:${topicKey}`,
  paper: (oldId) => `pap:${oldId}`,
  question: (oldPaperId, qid) => `q:${oldPaperId}:${qid}`,
  attempt: (oldId) => `att:${oldId}`,
  bank: (oldId) => `bank:${oldId}`,
  topicList: (oldId) => `list:${oldId}`,
  filterTemplate: (oldId) => `tpl:${oldId}`,
  flashcard: (oldId) => `fc:${oldId}`,
  topicState: (syllabusId, topicId) => `ts:${syllabusId}|${topicId}`,
  label: (syllabusId, topicId) => `lab:${syllabusId}|${topicId}`,
  note: (targetType, targetId) => `note:${targetType}:${targetId}`
};

/** Random ID for records the user creates in the app (not imported). */
export function newId(prefix) {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}:${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/** Edit distance, used only to suggest possible duplicate names. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
