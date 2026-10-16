// 1.23: screen time from Digital Wellbeing / Samsung screenshots. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/domain/screen-time.js";

test("times in both phones' formats are read", () => {
  assert.equal(S.parseDuration("5 hrs, 43 mins"), 343);
  assert.equal(S.parseDuration("1 hr, 20 mins"), 80);
  assert.equal(S.parseDuration("31 minutes"), 31);
  assert.equal(S.parseDuration("3 h 30 m"), 210);
  assert.equal(S.parseDuration("1 h 19 m"), 79);
  assert.equal(S.parseDuration("51 m"), 51);
  assert.equal(S.parseDuration("1:05"), 65);
  assert.equal(S.parseDuration("Less than 1 minute"), 0);
  assert.equal(S.parseDuration("Today"), null);
  assert.equal(S.parseDuration("40s"), 0);
  assert.equal(S.parseDuration(""), null);
});

test("the AI's reply: names and times kept, rows without a time dropped; 20-minute rule", () => {
  const r = S.readReply({ date: "2026-10-16", apps: [{ name: "Lakshyam", time: "5 hrs, 43 mins" }, { name: "YouTube", time: "1 hr, 20 mins" }, { name: "WhatsApp", time: "31 minutes" }, { name: "Meesho", time: "19 minutes" }, { name: "Show sites that you visit", time: "" }] });
  assert.equal(r.date, "2026-10-16");
  assert.deepEqual(r.apps.map((a) => [a.name, a.min]), [["Lakshyam", 343], ["YouTube", 80], ["WhatsApp", 31], ["Meesho", 19]]);
  const k = S.keepBig(S.mergeApps([r.apps]));
  assert.deepEqual(k.kept.map((a) => a.name), ["Lakshyam", "YouTube", "WhatsApp"]);
  assert.equal(k.ignored, 1); assert.equal(k.ignoredMin, 19);
  assert.equal(S.readReply({ date: "16 Oct", apps: [] }).date, null);
});

test("two screenshots of one long list merge (same app once, larger time)", () => {
  const m = S.mergeApps([[{ name: "Chrome", min: 210 }, { name: "YouTube", min: 79 }], [{ name: "youtube", min: 79 }, { name: "Clock", min: 10 }]]);
  assert.deepEqual(m.map((a) => [a.key, a.min]), [["chrome", 210], ["youtube", 79], ["clock", 10]]);
});

test("a day: study, needed and wasted from your answers", () => {
  const d = S.daySummary({ apps: [{ name: "Lakshyam", min: 343, share: "all" }, { name: "YouTube", min: 80, share: "little" }, { name: "WhatsApp", min: 31, share: "needed" }, { name: "Chrome", min: 29, share: "half" }, { name: "X", min: 25, share: null }] });
  assert.deepEqual([d.total, d.study, d.needed, d.wasted, d.unsorted], [508, 378, 31, 75, 25]);
  assert.equal(d.top[0].name, "YouTube"); assert.equal(d.top[0].min, 60);
});

test("a limit only after 7 days, about 20% under your usual day; lower when kept on most days", () => {
  const day = (w) => ({ apps: [{ name: "YouTube", min: w, share: "none" }] });
  assert.equal(S.suggestLimit([60, 70, 80].map(day)), null);
  const week = [60, 70, 80, 50, 90, 65, 75].map(day);
  assert.equal(S.suggestLimit(week), 55); // median 70 × 0.8 = 56 → 55
  assert.equal(S.suggestLimit([40, 45, 50, 30, 55, 40, 70].map(day), 55), 50); // kept on 6/7 → 10% lower
  assert.equal(S.suggestLimit([60, 70, 80, 50, 90, 65, 75].map(day), 55), 55); // not kept → same goal
});

test("a week: averages, study share, days under limit, worst app and a timer suggestion", () => {
  const e = (date, yt, lk) => ({ date, apps: [{ name: "YouTube", min: yt, share: "little" }, { name: "Lakshyam", min: lk, share: "all" }] });
  const p = S.periodSummary([e("2026-10-12", 80, 200), e("2026-10-13", 40, 300), { date: "2026-10-14", apps: [] }], 50);
  assert.equal(p.days, 2);
  assert.equal(p.avgWasted, 45); // (60 + 30) / 2
  assert.equal(p.underLimit, 1);
  assert.equal(p.apps[0].name, "YouTube"); assert.equal(p.apps[0].avgTotal, 60);
  assert.equal(S.timerFor(p.apps[0]), 45);
  assert.equal(S.timerFor({ avgTotal: 120, wasted: 10, total: 240 }), null); // mostly study: no timer
});

test("your usual answer is remembered after the same answer on 2 days", () => {
  let d = S.learnDefaults({}, [{ name: "Meesho", share: "none" }]);
  assert.equal(S.usualShare(d, "meesho"), null);
  d = S.learnDefaults(d, [{ name: "Meesho", share: "none" }]);
  assert.equal(S.usualShare(d, "meesho"), "none");
  d = S.learnDefaults(d, [{ name: "Meesho", share: "half" }]);
  assert.equal(S.usualShare(d, "meesho"), null);
  assert.equal(S.hm(65), "1 h 05 m"); assert.equal(S.hm(45), "45 m");
});
