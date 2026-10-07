/* Thin promise wrapper around IndexedDB. Only the data layer imports this;
   screens go through store.js. */
import { DB_NAME, DB_VERSION, MIGRATIONS } from "./schema.js";

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("no-indexeddb")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let v = event.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](db, request.transaction);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the database: close so it can finish.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error); };
    request.onblocked = () => reject(new Error("db-blocked"));
  });
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error("transaction-aborted"));
});

export async function getAll(storeName) {
  const db = await openDb();
  return done(db.transaction(storeName).objectStore(storeName).getAll());
}

export async function get(storeName, id) {
  const db = await openDb();
  return done(db.transaction(storeName).objectStore(storeName).get(id));
}

export async function count(storeName) {
  const db = await openDb();
  return done(db.transaction(storeName).objectStore(storeName).count());
}

export async function countByIndex(storeName, indexName, value) {
  const db = await openDb();
  return done(db.transaction(storeName).objectStore(storeName).index(indexName).count(value));
}

/** Writes several stores in ONE transaction: either everything is saved or nothing.
    changes = { storeName: { clear?: bool, put?: [records], delete?: [ids] } } */
export async function writeAll(changes) {
  const db = await openDb();
  const names = Object.keys(changes);
  if (!names.length) return;
  const tx = db.transaction(names, "readwrite");
  const result = finished(tx);
  names.forEach((name) => {
    const store = tx.objectStore(name);
    const change = changes[name];
    if (change.clear) store.clear();
    (change.delete || []).forEach((id) => store.delete(id));
    (change.put || []).forEach((record) => store.put(record));
  });
  return result;
}

export async function put(storeName, record) {
  return writeAll({ [storeName]: { put: [record] } });
}

export async function remove(storeName, id) {
  return writeAll({ [storeName]: { delete: [id] } });
}

/** Removes the whole database (used by "Erase all Lakshyam data"). */
export async function deleteDatabase() {
  const db = await openDb().catch(() => null);
  db?.close();
  dbPromise = null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
