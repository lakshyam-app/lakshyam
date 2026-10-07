import test from "node:test";
import assert from "node:assert/strict";
import { searchSettings, SETTINGS_INDEX, CATEGORIES } from "../src/features/settings/settings-index.js";
import en from "../src/strings/en.js";

const ids = (q) => searchSettings(q).map((x) => x.id);

test("finds settings by name, keyword and several words", () => {
  assert.equal(ids("dark")[0], "theme");
  assert.ok(ids("negative marks").includes("marking"));
  assert.ok(ids("api key").includes("presets"));
  assert.deepEqual(ids("zzz"), []);
  assert.deepEqual(ids("  "), []);
});

test("every entry has a group, a name and English keywords", () => {
  for (const it of SETTINGS_INDEX) {
    assert.ok(CATEGORIES.includes(it.cat) || it.cat === "elsewhere", it.id);
    assert.ok(it.label() && !it.label().includes("."), `label for ${it.id}`);
    assert.ok(en.setx.kw[it.id], `keywords for ${it.id}`);
  }
});
