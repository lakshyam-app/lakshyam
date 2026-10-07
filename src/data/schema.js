/* Database layout. Bump DB_VERSION and add a step to MIGRATIONS for any change;
   steps run in order on the user's phone, so existing data is upgraded, never lost. */

export const DB_NAME = "lakshyam-db";
export const DB_VERSION = 1;

/* Content: things that could later come from an admin (papers, questions…). */
export const CONTENT_STORES = ["syllabi", "subjects", "topics", "papers", "questions", "flashcards"];

/* User data: always the user's own (progress, notes, settings…). */
export const USER_STORES = [
  "questionState", "topicState", "attempts", "sets", "topicLists", "labels",
  "notes", "filterTemplates", "flashcardState", "activity", "settings"
];

/* Included in backups. */
export const BACKUP_STORES = [...CONTENT_STORES, ...USER_STORES];

/* Never included in backups: AI keys, large PDFs, and the safety copies themselves. */
export const PRIVATE_STORES = ["aiPresets", "pdfs", "snapshots", "importLog"];

const INDEXES = {
  topics: ["subjectId"],
  papers: ["syllabusId"],
  questions: ["paperId", "topicId"],
  attempts: ["syllabusId"],
  flashcards: ["topicId"]
};

export const MIGRATIONS = [
  // v1: first layout
  (db) => {
    [...BACKUP_STORES, ...PRIVATE_STORES].forEach((name) => {
      if (db.objectStoreNames.contains(name)) return;
      const store = db.createObjectStore(name, { keyPath: "id" });
      (INDEXES[name] || []).forEach((field) => store.createIndex(field, field));
    });
  }
];
