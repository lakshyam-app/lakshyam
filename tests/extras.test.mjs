// AI preset pausing, automatic difficulty times, smart insights, older backups. Made-up data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tryOrder, isPaused, FOREVER } from "../src/ai/presets.js";
import { autoDifficulty, planAutoDifficulty, validThresholds } from "../src/domain/testing.js";
import { checkFact, rankWeakSpots, mistakeStats, keywords } from "../src/domain/insights.js";
import { examMoment, timeUntil } from "../src/domain/habits.js";

const p = (id, extra = {}) => ({ id, name: id, apiKey: "k", model: "m", baseUrl: "https://x.test", ...extra });

test("paused presets are skipped, also as the active one", () => {
  const now = 1_000_000;
  const list = [p("a", { pausedUntil: now + 1000 }), p("b"), p("c", { pausedUntil: FOREVER })];
  assert.deepEqual(tryOrder(list, { activeId: "a", fallback: true }, now).map((x) => x.id), ["b"]);
  assert.deepEqual(tryOrder(list, { activeId: "a", fallback: true }, now + 2000).map((x) => x.id), ["a", "b"], "pause ended");
  assert.equal(tryOrder([p("a", { pausedUntil: FOREVER })], { activeId: "a", fallback: true }, now).length, 0);
  assert.ok(isPaused(list[2], now));
  assert.ok(!isPaused(list[1], now));
});

test("difficulty times: custom thresholds and re-marking past tests", () => {
  assert.equal(autoDifficulty(30000), "M");
  assert.equal(autoDifficulty(30000, { medium: 35, hard: 60 }), "E");
  assert.ok(validThresholds({ medium: 20, hard: 40 }));
  assert.ok(!validThresholds({ medium: 40, hard: 40 }));
  assert.ok(!validThresholds({ medium: 3, hard: 40 }));
  const attempts = [
    { submittedAt: 2, answers: [{ questionId: "q1", selected: 1, timeMs: 5000 }] },
    { submittedAt: 1, answers: [{ questionId: "q1", selected: 0, timeMs: 40000 }, { questionId: "q2", selected: 2, timeMs: 30000 }, { questionId: "q3", selected: 1, timeMs: 70000 }, { questionId: "q4", selected: null, timeMs: 9000 }, { questionId: "q5", selected: 1, timeMs: 30000 }, { questionId: "q6", selected: 1, timeMs: 30000 }] }
  ];
  const states = { q1: { difficulty: "M", difficultySource: "auto" }, q2: { difficulty: "D", difficultySource: "manual" }, q3: { difficulty: "D", difficultySource: "auto" }, q6: { difficulty: "E", difficultySource: "auto" } };
  const r = planAutoDifficulty(attempts, (id) => states[id], (id) => (id === "q5" ? "M" : null), { medium: 20, hard: 35 });
  const byQ = Object.fromEntries(r.changes.map((c) => [c.questionId, c]));
  assert.equal(byQ.q1.to, "D", "first timed answer (40 s), not the later fast one");
  assert.ok(!byQ.q2, "manual never changes");
  assert.ok(!byQ.q3, "already right");
  assert.ok(!byQ.q4, "blank answers don't count");
  assert.ok(!byQ.q5, "paper difficulty never changes");
  assert.equal(byQ.q6.to, "M");
  assert.equal(r.summary["M>D"], 1);
  assert.equal(r.summary["E>M"], 1);
});

test("notes check: answer found on a page, a year near the question's words, combined answers unknown", () => {
  const pages = [{ n: 1, t: "The Vaikom Satyagraha began in 1924 near the Vaikom temple." }, { n: 2, t: "Kelappan led the Guruvayur Satyagraha in 1931." }, { n: 3, t: "Unrelated page about 1924 football." }];
  const q = (text, options, answerIndex) => ({ text, options, answerIndex });
  assert.deepEqual(checkFact(q("Who led the Guruvayur Satyagraha?", ["Kelappan", "Gandhi", "Nehru", "Bose"], 0), pages), { status: "found", page: 2 });
  assert.deepEqual(checkFact(q("When did the Vaikom Satyagraha begin?", ["1921", "1924", "1931", "1936"], 1), pages), { status: "found", page: 1 });
  assert.equal(checkFact(q("Who wrote Indulekha?", ["O. Chandu Menon", "Kumaran Asan", "x", "y"], 0), pages).status, "missing");
  assert.equal(checkFact(q("Which are correct?", ["i only", "ii only", "Both i and ii", "None"], 2), pages).status, "unknown");
  assert.equal(checkFact(q("Which are correct?", ["i and ii", "ii and iii", "i only", "iii"], 0), pages).status, "unknown");
  assert.ok(keywords("Who led the Guruvayur Satyagraha?").includes("guruvayur"));
});

test("weak spots and mistake patterns", () => {
  const byTopic = new Map([
    ["t1", { freq: 40, n: 20, correct: 8, adj: 0.42, avgSec: 55, guessNet: -2 }],
    ["t2", { freq: 40, n: 20, correct: 19, adj: 0.92, avgSec: 20, guessNet: 1 }],
    ["t3", { freq: 30, n: 0, correct: 0, adj: null, avgSec: null, guessNet: 0 }],
    ["t4", { freq: 2, n: 4, correct: 1, adj: 0.4, avgSec: null, guessNet: 0 }]
  ]);
  const r = rankWeakSpots(byTopic, { hasNotes: (id) => id !== "t3" });
  assert.equal(r[0].topicId, "t1");
  assert.deepEqual(r[0].reasons, ["often", "weak", "slow", "guess"]);
  assert.ok(!r.some((x) => x.topicId === "t2"), "strong topics left out");
  assert.ok(r.find((x) => x.topicId === "t3").reasons.includes("untried") && r.find((x) => x.topicId === "t3").reasons.includes("nonotes"));
  const ms = mistakeStats([
    { q: { text: "Which of the following statements is correct?", options: ["a", "b"], answerIndex: 0 }, r: { selected: 1, timeMs: 5000, guessed: true } },
    { q: { text: "In which year was X founded?", options: ["1921", "1931"], answerIndex: 1 }, r: { selected: null } },
    { q: { text: "Which is NOT a river?", options: ["a", "b"], answerIndex: 0 }, r: { selected: 1, timeMs: 30000 } }
  ]);
  assert.deepEqual([ms.total, ms.statement, ms.numbers, ms.guessed, ms.quick, ms.blank, ms.notQ], [3, 1, 1, 1, 1, 1, 1]);
});

test("exam countdown", () => {
  const at = examMoment("2026-12-01", "07:15");
  assert.equal(new Date(at).getHours(), 7);
  const now = examMoment("2026-11-29", "05:15");
  assert.deepEqual(timeUntil(at, now), { past: false, days: 2, hours: 2, minutes: 0 });
  assert.equal(timeUntil(at, at + 1).past, true);
  assert.equal(examMoment("bad"), null);
});

test("a backup made before the timetable stores existed still passes its checksum", async () => {
  const { readBackup, checksum } = await import("../src/data/backup.js");
  const { BACKUP_STORES } = await import("../src/data/schema.js");
  const v1 = BACKUP_STORES.filter((n) => !["timetables", "ttLog", "diary"].includes(n));
  const data = Object.fromEntries(v1.map((n) => [n, n === "settings" ? [{ id: "x", value: 1 }] : []]));
  const json = { format: "lakshyam-backup", schemaVersion: 1, data, checksum: checksum(JSON.stringify(data)), counts: Object.fromEntries(v1.map((n) => [n, data[n].length])) };
  const r = readBackup(json);
  assert.ok(r.ok);
  assert.ok(r.report.checksumOk);
  assert.deepEqual(r.records.timetables, []);
});
