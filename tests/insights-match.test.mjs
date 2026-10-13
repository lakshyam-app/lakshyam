// 1.16: the notes check needs the page to be about the question, not just to contain the answer. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { checkFact } from "../src/domain/insights.js";

const q = (text, options, answerIndex) => ({ text, options, answerIndex });

test("a common answer on an unrelated page is not 'in your notes'", () => {
  const pages = [{ n: 1, t: "Land reforms in Kerala: the Kerala Agrarian Relations Act was passed in 1960." }];
  // the answer word is there, but nothing about the question
  assert.equal(checkFact(q("Which state set up the first commission for protecting senior citizens' welfare?", ["Kerala", "Goa", "Assam", "Bihar"], 0), pages).status, "missing");
  // a bare year somewhere proves nothing
  assert.equal(checkFact(q("In which year did the Senior Citizens Welfare law come into force?", ["1960", "2007", "2010", "1995"], 0), pages).status, "missing");
});

test("one question word: probably; two: found", () => {
  const pages = [{ n: 4, t: "The Maintenance and Welfare of Parents and Senior Citizens Act came in 2007. Tribunals hear claims of parents." }];
  assert.deepEqual(checkFact(q("When was the Maintenance and Welfare of Parents Act passed?", ["2005", "2007", "2009", "2011"], 1), pages), { status: "found", page: 4 });
  assert.equal(checkFact(q("Which body hears claims under the elderly law?", ["Tribunals", "Courts", "Panchayats", "Police"], 0), pages).status, "maybe");
});
