// Malayalam names: file checks and matching. Made-up records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planNames, exportNames, cleanMl, readNamesFile } from "../src/data/ml-names.js";
import { nameKey } from "../src/data/ids.js";

const sub = (id, name, extra = {}) => ({ id, name, key: nameKey(name), ...extra });
const top = (id, subjectId, name, extra = {}) => ({ id, subjectId, name, key: nameKey(name), ...extra });
const subjects = [sub("s1", "History"), sub("s2", "Geography", { nameMl: "ഭൂമിശാസ്ത്രം", nameMlStatus: "official" })];
const topics = [top("t1", "s1", "Travancore History"), top("t2", "s1", "Old Name", { key: "newname", name: "New Name", aliasKeys: ["oldname"] }),
  top("t3", "s2", "Rivers of Kerala", { nameMl: "നദികൾ", nameMlStatus: "review" }), top("t4", "s2", "Travancore History")];

test("file shape is checked", () => {
  assert.equal(readNamesFile(null).ok, false);
  assert.equal(readNamesFile({ subjects: "x" }).ok, false);
  assert.equal(readNamesFile({ subjects: [] }).ok, false);
  assert.equal(planNames({ nope: 1 }, subjects, topics).report.ok, false);
});

test("clean-up of a Malayalam name", () => {
  assert.equal(cleanMl("  ചരിത്രം ​\n "), "ചരിത്രം");
  assert.equal(cleanMl(""), null);
  assert.equal(cleanMl("x".repeat(201)), null);
  assert.equal(cleanMl(5), null);
});

test("matching by name (case/punctuation ignored), by old name and by ID; topics only inside their subject", () => {
  const file = { subjects: [
    { name: "HISTORY", name_ml: "ചരിത്രം", status: "official", topics: [
      { name: "travancore-history", name_ml: "തിരുവിതാംകൂറിന്റെ ചരിത്രം", status: "official" },
      { name: "Old Name", name_ml: "പഴയ പേര്" },
      { name: "Rivers of Kerala", name_ml: "നദികൾ" }
    ] },
    { id: "s2", name_ml: "ഭൂമിശാസ്ത്രം", topics: [{ id: "t3", name_ml: "കേരളത്തിലെ നദികൾ", status: "official" }] },
    { name: "Physics", name_ml: "ഭൗതികശാസ്ത്രം" }
  ] };
  const plan = planNames(file, subjects, topics);
  const r = plan.report;
  assert.deepEqual(plan.subjects.map((x) => [x.id, x.nameMl, x.nameMlStatus]), [["s1", "ചരിത്രം", "official"]]);
  const byId = Object.fromEntries(plan.topics.map((x) => [x.id, x]));
  assert.equal(byId.t1.nameMl, "തിരുവിതാംകൂറിന്റെ ചരിത്രം");
  assert.equal(byId.t1.nameMlStatus, "official");
  assert.equal(byId.t2.nameMlStatus, "review", "no status in the file → review");
  assert.ok(!byId.t4, "same English name in another subject is not touched");
  assert.equal(r.filled, 3);
  assert.equal(r.same, 1, "Geography already has this name");
  assert.deepEqual(r.notFound, ["HISTORY › Rivers of Kerala", "Physics"]);
  assert.equal(r.kept.length, 1, "t3 has a different name and replace is off");
  assert.ok(!byId.t3);
});

test("replace and official options", () => {
  const file = { subjects: [{ id: "s2", topics: [{ id: "t3", name_ml: "കേരളത്തിലെ നദികൾ" }] }] };
  const p1 = planNames(file, subjects, topics, { replace: true, official: true });
  assert.equal(p1.report.replaced, 1);
  assert.deepEqual([p1.topics[0].nameMl, p1.topics[0].nameMlStatus], ["കേരളത്തിലെ നദികൾ", "official"]);
  const p2 = planNames({ subjects: [{ id: "s2", topics: [{ id: "t3", name_ml: "നദികൾ" }] }] }, subjects, topics, { official: true });
  assert.equal(p2.report.statusOnly, 1, "same name, now marked checked");
  assert.equal(p2.topics[0].nameMlStatus, "official");
});

test("unusable names are reported, never saved", () => {
  const plan = planNames({ subjects: [{ name: "History", name_ml: "History in English" }, { name: "Geography", name_ml: "  " }] }, subjects, topics);
  assert.equal(plan.report.invalid.length, 2);
  assert.equal(plan.subjects.length, 0);
});

test("export then import gives the same names", () => {
  const named = planNames(JSON.parse(readFileSync(new URL("../content/taxonomy-ml.json", import.meta.url))), [sub("h", "History")], [top("a", "h", "Travancore History")]);
  assert.equal(named.report.filled, 2);
  const out = exportNames(named.subjects, named.topics);
  assert.equal(out.subjects[0].name_ml, "ചരിത്രം");
  assert.equal(out.subjects[0].topics[0].name_ml, "തിരുവിതാംകൂറിന്റെ ചരിത്രം");
  const again = planNames(out, named.subjects, named.topics);
  assert.equal(again.report.same, 2);
  assert.equal(again.subjects.length + again.topics.length, 0);
});

test("the bundled syllabus file is well-formed", () => {
  const seed = JSON.parse(readFileSync(new URL("../content/taxonomy-ml.json", import.meta.url)));
  const f = readNamesFile(seed);
  assert.ok(f.ok);
  f.entries.forEach(({ entry }) => {
    assert.ok(cleanMl(entry.name_ml), entry.name);
    assert.ok(/[ഀ-ൿ]/.test(entry.name_ml), entry.name);
    assert.ok(["official", "review"].includes(entry.status), entry.name);
  });
});
