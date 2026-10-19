// Browser smoke test: the main paths of the app on a phone-sized screen, with made-up data only
// (tests/e2e/fixture.mjs) and AI answers faked inside the browser (no key, nothing sent anywhere).
// Run: node tests/e2e/smoke.mjs
//   PW=<path to playwright's index.mjs> to use a Playwright installed elsewhere;
//   PW_CHANNEL=chromium to use an installed Chromium instead of Playwright's own;
//   SHOTS=<folder> for the screenshots of failed steps.
// Exits with 1 if any step fails; screenshots of failures go to the folder printed at the end.
import http from "node:http";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeVaultExport } from "./fixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(process.env.PW || "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf", ".woff2": "font/woff2", ".txt": "text/plain", ".md": "text/plain" };

/* ---------- a small static server for the app's own files ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    if (path.split(/[/\\]/).includes("..")) throw new Error("bad path");
    const file = join(ROOT, path || "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const U = `http://127.0.0.1:${server.address().port}/`;

const work = await mkdtemp(join(tmpdir(), "lakshyam-smoke-"));
const shots = process.env.SHOTS || join(work, "shots"); await mkdir(shots, { recursive: true });
const fixturePath = join(work, "vault-export-made-up.json");
await writeFile(fixturePath, JSON.stringify(makeVaultExport()));

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const errors = [];
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, p };
}
let failed = 0;
const step = async (p, name, fn) => {
  try { await fn(); console.log("OK  ", name); } catch (e) {
    failed++; console.log("FAIL", name, "—", String(e.message).split("\n")[0]);
    await p.screenshot({ path: join(shots, `${name.replace(/\W+/g, "_").slice(0, 60)}.png`) }).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const text = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, " ").trim();
const counts = (p) => p.evaluate(async () => { const s = await import("/src/data/store.js"); return s.counts(); });
const jsonOf = async (download) => JSON.parse(readFileSync(await download.path(), "utf8"));

const { p } = await phone();

await step(p, "first screen offers Google Drive, a file, or a fresh start", async () => {
  await p.goto(U); await p.waitForSelector(".setup-panel");
  for (const a of ["setup-drive", "import", "setup-fresh"]) expect(await p.locator(`.setup-panel [data-action="${a}"]`).count(), a);
});

await step(p, "import the made-up PSC Exam Vault file: report, then verified", async () => {
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.click('.setup-panel [data-action="import"]')]);
  await chooser.setFiles(fixturePath);
  await p.waitForSelector('.sheet [data-action="go"]', { timeout: 20000 });
  await p.click('.sheet [data-action="go"]');
  await p.waitForSelector(".sheet .result.ok", { timeout: 30000 });
  await p.click('.sheet [data-action="done"]');
  const c = await counts(p);
  expect(c.papers === 6 && c.questions === 240 && c.attempts === 6, JSON.stringify(c));
});

await step(p, "Today: greeting, today's session and the day's card", async () => {
  await p.goto(U + "#/today"); await p.waitForSelector(".session-card");
  expect(await p.locator('.session-card [data-action="session-start"]').count(), "no session button");
  const tabs = await p.$$eval("#tabbar .tab", (x) => x.map((e) => e.dataset.to).join(","));
  expect(tabs === "today,library,progress,revise", tabs);
});

await step(p, "Library: subject → topic → a self-test card that reveals its answer", async () => {
  await p.goto(U + "#/library?view=subjects"); await p.waitForSelector("#libRows .row");
  expect((await p.locator("#libRows .row").count()) >= 6, "subjects");
  await p.click('#libRows .row[data-to="subject"] >> nth=0'); await p.waitForURL(/#\/subject/);
  await p.click('#subRows .row[data-action="open"] >> nth=0'); await p.waitForURL(/#\/topic/);
  await p.waitForSelector(".qcard");
  await p.click('.qcard [data-action="q-reveal"] >> nth=0');
  await p.waitForSelector(".qcard .options li.right");
});

await step(p, "a test from a topic: start, answer, submit, see the result", async () => {
  await p.click('[data-action="practice"]'); await p.waitForSelector('.sheet [data-action="start"]');
  await p.click('.sheet [data-action="layout"][data-l="scroll"]');
  await p.click('.sheet [data-action="start"]'); await p.waitForURL(/#\/test/); await p.waitForSelector(".tcard");
  await p.locator('[data-action="pick"]').first().click();
  await p.click('[data-action="submit"]');
  if (await p.locator('.sheet [data-action="ok"]').count()) await p.click('.sheet [data-action="ok"]');
  await p.waitForURL(/#\/result/, { timeout: 15000 }); await p.waitForSelector(".screen-head h1");
  expect((await counts(p)).attempts === 7, "attempt not saved");
});

await step(p, "Progress and test history", async () => {
  await p.goto(U + "#/progress"); await p.waitForSelector(".screen-host section, .screen-host .panel");
  expect(/%/.test(await text(p, "#screen")), "no percentages");
  await p.goto(U + "#/history"); await p.waitForSelector("#screen .row");
  expect((await p.locator("#screen .row").count()) >= 7, "history rows");
});

await step(p, "Revise tab: mistakes due open the start sheet on Mistakes due; Notes inside it", async () => {
  await p.click('#tabbar [data-to="revise"]'); await p.waitForSelector(".revise");
  await p.click('[data-action="rv-mistakes"]'); await p.waitForSelector('.sheet [data-action="start"]');
  expect(/Mistakes due/.test(await text(p, ".sheet .pill.on")), "not on mistakes");
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  await p.click('[data-action="rv-notes"]'); await p.waitForSelector(".note-card");
  expect(/made-up note/.test(await text(p, ".note-list")), "note");
});

await step(p, "Search finds a question (English and Malayalam)", async () => {
  await p.goto(U + "#/search"); await p.waitForSelector("#searchInput");
  await p.fill("#searchInput", "Made-up question 17"); await p.waitForSelector("#qRows .row", { timeout: 5000 });
  await p.fill("#searchInput", "സാങ്കൽപ്പിക"); await p.waitForSelector("#qRows .row", { timeout: 5000 });
});

let backupFile = null;
await step(p, "Back up now: a Lakshyam backup with every question and test", async () => {
  await p.goto(U + "#/settings?section=data"); await p.waitForSelector('[data-action="backup"]');
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-action="backup"]')]);
  const j = await jsonOf(dl);
  expect(j.format === "lakshyam-backup" && j.counts.questions === 240 && j.counts.attempts === 7, JSON.stringify(j.counts));
  expect(!/apiKey/.test(JSON.stringify(j)), "an AI key in the backup");
  backupFile = join(work, "lakshyam-restore-test.json"); await writeFile(backupFile, JSON.stringify(j));
});

await step(p, "Share papers: only papers, no tests, notes or keys", async () => {
  await p.click('[data-action="share-papers"]'); await p.click('.sheet [data-action="save"]');
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('.sheet [data-action="download"]')]);
  const j = await jsonOf(dl);
  expect(j.format === "lakshyam-papers" && j.counts.papers === 6, JSON.stringify(j.counts));
  expect(Object.keys(j.data).sort().join(",") === "papers,questions,subjects,syllabi,topics", Object.keys(j.data).join(","));
});

await step(p, "AI help on a card (a faked AI answer)", async () => {
  await p.route("https://mock.test/**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content: "Mock explanation: option C is right because it is made up." } }] }) }));
  await p.evaluate(async () => { const P = await import("/src/ai/presets.js"); const a = await P.addPreset("custom");
    await P.updatePreset(a.id, { name: "Mock", baseUrl: "https://mock.test/v1", model: "mock-1", apiKey: "not-a-real-key" }); await P.saveConfig({ activeId: a.id, lang: "en" }); });
  const topicId = await p.evaluate(async () => { const s = await import("/src/data/store.js"); return s.topicsWithCounts(s.currentSyllabus().id).find((x) => x.subject?.name === "History")?.topic.id; });
  await p.goto(U + "#/topic?id=" + encodeURIComponent(topicId)); await p.waitForSelector(".qcard");
  await p.click('.qcard [data-action="q-reveal"] >> nth=0');
  await p.click('.qcard [data-action="q-ai-menu"] >> nth=0'); await p.waitForSelector(".sheet .row, .sheet button");
  await p.click('.sheet [data-id="explain"]');
  await p.waitForSelector(".sheet .ai-answer", { timeout: 15000 });
  expect(/Mock explanation/.test(await text(p, ".sheet .ai-answer")), "answer");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
});

await step(p, "Current affairs quiz: web search faked, checks applied, saved apart from past papers", async () => {
  await p.route("https://generativelanguage.googleapis.com/**", (route) => {
    const b = JSON.parse(route.request().postData()); const sys = b.systemInstruction.parts[0].text; const user = b.contents[0].parts[0].text;
    const m = /^MONTH: .*?\((\d{4}-\d{2})-01 to/m.exec(user);
    const text = /independently/.test(sys) ? JSON.stringify([{ n: 1, answer: 1 }, { n: 2, answer: 1 }])
      : JSON.stringify([
        { question_text: "In the made-up month, which made-up city hosted the made-up summit?", options: ["P", "Q", "R", "S"], correct_answer_index: 0, explanation: "P did.", date: `${m?.[1]}-10`, region: "india", topic: "T1", source: "https://www.thehindu.com/x" },
        { question_text: "A made-up event from another month?", options: ["P", "Q", "R", "S"], correct_answer_index: 0, explanation: "x", date: "2001-01-01", region: "world", topic: "T1", source: "https://www.thehindu.com/y" }]);
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x", title: "thehindu.com" } }] } }] }) });
  });
  await p.evaluate(async () => { const P = await import("/src/ai/presets.js"); const g = await P.addPreset("gemini");
    await P.updatePreset(g.id, { apiKey: "not-a-real-key", model: "gemini-flash-latest" }); await P.saveConfig({ activeId: g.id }); });
  await p.goto(U + "#/revise"); await p.click('[data-action="rv-ca"]'); await p.waitForSelector('.sheet [data-action="make"]');
  await p.click('.sheet [data-action="make"]'); await p.waitForSelector(".sheet .ns-item", { timeout: 20000 });
  const ticks = await p.$$eval(".sheet input[data-i]", (x) => x.map((c) => c.checked).join(","));
  expect(ticks === "true,false", `ticks ${ticks}`);
  await p.click('.sheet [data-action="save"]'); await p.waitForSelector('.sheet [data-action="practise"]');
  const saved = await p.evaluate(async () => { const s = await import("/src/data/store.js");
    return { ai: s.questionsFor({ syllabusId: s.currentSyllabus().id, source: "ai" }).filter((q) => q.sourceRef?.ca).length, pyq: s.questionsFor({ syllabusId: s.currentSyllabus().id }).filter((q) => q.sourceRef?.ca).length }; });
  expect(saved.ai === 1 && saved.pyq === 0, JSON.stringify(saved));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
});

await step(p, "Malayalam app language: tabs and Today in Malayalam, then back to English", async () => {
  await p.evaluate(async () => { const s = await import("/src/data/store.js"); await s.setSetting("appLang", "ml"); });
  await p.goto(U + "#/today"); await p.reload(); await p.waitForSelector("#tabbar .tab");
  const tabs = await text(p, "#tabbar");
  expect(/[ഀ-ൿ]/.test(tabs), tabs);
  await p.evaluate(async () => { const s = await import("/src/data/store.js"); await s.setSetting("appLang", "en"); });
  await p.reload(); await p.waitForSelector("#tabbar .tab");
});

await step(p, "a small phone (320 px): no sideways scrolling on the main screens or in a test", async () => {
  await p.setViewportSize({ width: 320, height: 640 });
  for (const h of ["#/today", "#/library?view=subjects", "#/library?view=banks", "#/progress", "#/revise", "#/notes", "#/settings", "#/history"]) {
    await p.goto(U + h); await p.waitForTimeout(500);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over <= 0, `${h} is ${over}px too wide`);
  }
  // a test on the paper with a very long post name (left unfinished; the next step uses another phone)
  await p.goto(U + "#/paper?id=" + encodeURIComponent("pap:fx-2")); await p.waitForSelector('[data-action="practice"]');
  await p.click('[data-action="practice"]'); await p.waitForSelector('.sheet [data-action="start"]');
  await p.click('.sheet [data-action="start"]'); await p.waitForURL(/#\/test/); await p.waitForSelector(".tcard");
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over <= 0, `the test screen is ${over}px too wide`);
  const submit = await p.evaluate(() => document.querySelector('[data-action="submit"]').getBoundingClientRect().right);
  expect(submit <= 320, `Submit ends at ${submit}px`);
  await p.setViewportSize({ width: 390, height: 844 });
});

// Another phone (e.g. a new one): restore that backup and get the same data back.
const other = await phone();
await step(other.p, "restore the backup on another phone: same counts, verified", async () => {
  const q = other.p;
  await q.goto(U); await q.waitForSelector(".setup-panel");
  const [chooser] = await Promise.all([q.waitForEvent("filechooser"), q.click('.setup-panel [data-action="import"]')]);
  await chooser.setFiles(backupFile);
  await q.waitForSelector('.sheet [data-action="go"]', { timeout: 20000 }); await q.click('.sheet [data-action="go"]');
  await q.waitForSelector(".sheet .result.ok", { timeout: 30000 }); await q.click('.sheet [data-action="done"]');
  const c = await counts(q);
  expect(c.questions === 240 && c.attempts === 7 && c.papers === 6, JSON.stringify(c));
});

await browser.close();
server.close();
if (errors.length) { failed++; console.log("FAIL", "errors in the page:\n  " + [...new Set(errors)].join("\n  ")); }
else console.log("OK   no errors in the page");
console.log(failed ? `\n${failed} failed (screenshots: ${shots})` : "\nall passed");
process.exit(failed ? 1 : 0);
