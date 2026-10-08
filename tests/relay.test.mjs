import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { scriptFor, MANIFEST, isRelayUrl } from "../src/cloud/relay-script.js";
import { BACKUP_STORES } from "../src/data/schema.js";
import { makeBackup } from "../src/data/backup.js";

const KEY = "k".repeat(43);

/** Runs the Apps Script code with a fake Google (Drive, Utilities, Properties, ContentService). */
function fakeGoogle() {
  const files = new Map(); let n = 0; const props = new Map();
  const Drive = { Files: {
    list: (opts) => {
      const q = opts.q;
      let all = [...files.values()].filter((f) => !f.trashed);
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\'/g, "'");
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      if (name) all = all.filter((f) => f.name === name && f.mimeType.endsWith("folder"));
      if (parent) all = all.filter((f) => f.parents?.[0] === parent);
      if (opts.orderBy) all.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
      return { files: all };
    },
    create: (meta, blob) => { const id = `f${++n}`; const f = { id, createdTime: new Date(Date.now() + n).toISOString(), ...meta, size: blob ? String(blob.bytes.length) : undefined, bytes: blob?.bytes }; files.set(id, f); return f; },
    update: (patch, id) => Object.assign(files.get(id), patch)
  } };
  const Utilities = {
    base64Decode: (s) => [...Buffer.from(s, "base64")].map((b) => (b > 127 ? b - 256 : b)),
    formatDate: () => "2026-10-08-1300", newBlob: (bytes, type, name) => ({ bytes, type, name })
  };
  const ctx = {
    Drive, Utilities, Session: { getScriptTimeZone: () => "Asia/Kolkata" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(scriptFor(KEY), ctx);
  const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return { files, post, props };
}
const gz = (s) => zlib.gzipSync(Buffer.from(s)).toString("base64");

test("script: refuses a wrong code, answers ping, saves a backup in its own folder", () => {
  const g = fakeGoogle();
  assert.deepEqual(g.post({ key: "nope", action: "ping" }), { ok: false, error: "key" });
  assert.equal(g.post({ key: KEY, action: "ping" }).ok, true);
  const r = g.post({ key: KEY, phone: "Sachin's phone", phoneId: "p1", questions: 5802, tests: 40, app: "1.6.0", data: gz("{\"format\":\"lakshyam-backup\"}") });
  assert.equal(r.ok, true, JSON.stringify(r));
  const names = [...g.files.values()].map((f) => f.name);
  assert.deepEqual(names, ["Lakshyam auto-backups", "Sachin's phone", "lakshyam-backup-2026-10-08-1300.json.gz"]);
  const file = [...g.files.values()].find((f) => f.bytes);
  assert.equal(file.appProperties.lakshyam, "backup");
  assert.equal(file.parents[0], [...g.files.values()].find((f) => f.name === "Sachin's phone").id);
});

test("script: rejects non-gzip data, oversize data and too many uploads a day", () => {
  const g = fakeGoogle();
  assert.equal(g.post({ key: KEY, data: Buffer.from("hello world, plain text!").toString("base64") }).error, "format");
  assert.equal(g.post({ key: KEY, data: "A".repeat(9 * 1024 * 1024) }).error, "size");
  for (let i = 0; i < 30; i++) assert.equal(g.post({ key: KEY, phone: "P", data: gz("x".repeat(50)) }).ok, true);
  assert.equal(g.post({ key: KEY, phone: "P", data: gz("x".repeat(50)) }).error, "rate");
});

test("script: only bins copies beyond the newest 15 that are older than 30 days; never deletes", () => {
  const g = fakeGoogle();
  g.post({ key: KEY, phone: "P", data: gz("first") });
  const dir = [...g.files.values()].find((f) => f.name === "P").id;
  // 20 old copies (60 days ago) + the new uploads
  for (let i = 0; i < 20; i++) g.files.set(`old${i}`, { id: `old${i}`, name: `old${i}`, mimeType: "application/gzip", parents: [dir], createdTime: new Date(Date.now() - 60 * 86400000 - i * 1000).toISOString() });
  for (let i = 0; i < 3; i++) g.post({ key: KEY, phone: "P", data: gz(`n${i}`) });
  const inDir = [...g.files.values()].filter((f) => f.parents?.[0] === dir);
  assert.equal(inDir.length, 24, "nothing removed for good");
  assert.equal(inDir.filter((f) => !f.trashed).length, 15);
  assert.ok(inDir.filter((f) => !f.trashed && f.bytes).length === 4, "all recent uploads kept");
});

test("manifest asks only for drive.file; URL check", () => {
  const m = JSON.parse(MANIFEST);
  assert.deepEqual(m.oauthScopes, ["https://www.googleapis.com/auth/drive.file"]);
  assert.equal(m.webapp.access, "ANYONE_ANONYMOUS");
  assert.ok(isRelayUrl("https://script.google.com/macros/s/AKfycbz0123456789abcdefghijk/exec"));
  assert.ok(!isRelayUrl("https://evil.example/macros/s/AKfycbz0123456789abcdefghijk/exec"));
});

test("background backup makes the same backup as the app", () => {
  const ctx = { self: {}, Blob, Response, btoa, Math, Promise, JSON, Object, Date, String, Number };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../src/cloud/sw-backup.js", import.meta.url), "utf8"), ctx);
  const B = ctx.self.lakshyamBackup;
  assert.deepEqual([...B.STORES], BACKUP_STORES);
  const records = Object.fromEntries(BACKUP_STORES.map((n) => [n, [{ id: `${n}:1`, v: 1 }]]));
  records.settings = [{ id: "theme", value: "paper" }, { id: "drive", value: { relayKey: "secret" } }];
  const app = makeBackup({ ...records, settings: records.settings.filter((r) => r.id !== "drive") });
  const sw = B.buildBackup(records, app.schemaVersion, app.appVersion);
  assert.equal(sw.checksum, app.checksum);
  assert.deepEqual(JSON.parse(JSON.stringify(sw.counts)), app.counts);
  assert.ok(!JSON.stringify(sw).includes("secret"), "the Drive link never goes into a backup");
});
