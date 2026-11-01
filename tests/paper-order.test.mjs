import test from "node:test";
import assert from "node:assert/strict";
import { paperCode, arrangePapers } from "../src/domain/paper-order.js";

const P = (id, name) => ({ id, name });
const papers = [P("a", "102/2024"), P("b", "15_060/2023-M"), P("c", "045/2023"), P("d", "007/2022"), P("e", "Model paper")];
test("paper code", () => {
  assert.equal(paperCode("15_060/2023-M"), 60); assert.equal(paperCode("045/2023"), 45); assert.equal(paperCode("Model"), null);
});
test("first: by year, then code; papers without a year last", () => {
  assert.deepEqual(arrangePapers(papers, null).map((p) => p.id), ["d", "c", "b", "a", "e"]);
});
test("your order is kept; a new paper goes in by year and code; removed ones dropped", () => {
  assert.deepEqual(arrangePapers(papers, ["a", "e", "d", "c", "b"]).map((p) => p.id), ["a", "e", "d", "c", "b"]);
  const more = [...papers, P("f", "050/2023")];
  assert.deepEqual(arrangePapers(more, ["d", "c", "b", "a", "e", "gone"]).map((p) => p.id), ["d", "c", "f", "b", "a", "e"]);
});
