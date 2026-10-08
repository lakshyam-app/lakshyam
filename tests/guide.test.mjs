import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, UI, stepHtml } from "../src/features/guide/content.js";

test("every guide step has English and Malayalam text, and builds", () => {
  assert.equal(STEPS.length, 11);
  for (const s of STEPS) {
    for (const l of ["en", "ml"]) {
      assert.ok(s.title[l] && s.tip[l], `${s.id} ${l}`);
      assert.ok(s.points[l].length >= 3, `${s.id} ${l} points`);
      if (s.go) assert.ok(s.go.label[l]);
      assert.match(stepHtml(s, 0, l, { actions: true }), /class="g-step/);
    }
    assert.equal(s.points.en.length, s.points.ml.length, `${s.id}: same number of points`);
  }
  assert.deepEqual(Object.keys(UI.en).sort(), Object.keys(UI.ml).sort());
});
