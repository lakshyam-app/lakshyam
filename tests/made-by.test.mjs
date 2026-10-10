import test from "node:test";
import assert from "node:assert/strict";
import { countsLine, modelNames, aiModelOf, madeByOf } from "../src/domain/made-by.js";

test("model summaries", () => {
  assert.equal(countsLine({}), "");
  assert.equal(countsLine({ "gemini-3.8-flash": 4 }), "gemini-3.8-flash");
  assert.equal(countsLine({ "gemma-4-31b-it": 3, "gemini-3.8-flash": 9 }), "gemini-3.8-flash (9) · gemma-4-31b-it (3)");
  assert.deepEqual(modelNames({ a: 1, b: 5, c: 0 }), ["b", "a"]);
  assert.deepEqual(aiModelOf("m1", "m2"), { by: "m1", checkedBy: "m2" });
  assert.deepEqual(aiModelOf("m1"), { by: "m1" });
  assert.equal(aiModelOf(null), null);
  assert.equal(madeByOf({ aiModel: { by: "x" } }), "x");
  assert.equal(madeByOf({}), null);
});
