/* Taking a test (#/test). Always shows the one unfinished test.
   - Saved as you go: leave the app or the screen and continue later.
   - The timer and per-question time only run while this screen is open and
     visible (not while paused, in the background, or closed).
   - Per-question time goes to the question you are on: in "one at a time" the
     shown question; in "scroll" the question you last tapped or the one in the
     middle of the screen (this fixes the old scroll-mode timing bug). */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { TEXT_SIZES } from "../../core/theme.js";
import { runFlow, chooseAction, confirmAction } from "../../core/dialogs.js";
import { richText, letterFor } from "../../domain/text.js";
import { clock } from "../../domain/testing.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import * as tests from "../../data/tests.js";
import { mountCards, setPlace } from "../question/pager.js";

const SAVE_EVERY_MS = 10000;
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
let live = null;
let crossMode = false; // "Cross out" on: tapping an option crosses it out instead of choosing it // { id, run } — the run in memory is the source of truth while the screen is open

const star = (on) => html`<svg viewBox="0 0 24 24" aria-hidden="true" class="${on ? "filled" : ""}"><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>`;

function testCard(q, i, run) {
  const paper = store.paper(q.paperId);
  const sel = run.answers[q.id];
  const guessed = Boolean(run.guesses[q.id]);
  const flagged = Boolean(store.questionState(q.id)?.flagged);
  const where = [paper?.name, nameLabel(store.subject(q.subjectId)), nameLabel(store.topic(q.topicId))].filter(Boolean).join(" · ");
  return html`<article class="qcard tcard ${sel !== undefined ? "is-answered" : ""}" data-qid="${q.id}" data-i="${i}" lang="${q.lang === "ml" ? "ml" : "en"}">
    <header class="qcard-meta"><span class="qcard-where"><strong>${t("test.qOf", { n: i + 1, of: run.questionIds.length })}</strong>${q.number ? ` · ${t("question.paperNumber", { n: q.number })}` : ""}<br>${where}</span>
      <span class="qcard-badges"><button type="button" class="icon-sm ${flagged ? "on" : ""}" data-action="flag" aria-pressed="${String(flagged)}" aria-label="${t("question.flag")}">${star(flagged)}</button></span>
    </header>
    <div class="qtext">${richText(q.text)}</div>
    <ol class="options">${q.options.map((opt, k) => {
      const struck = sel !== k && (run.struck?.[q.id] || []).includes(k);
      return html`<li class="tappable ${sel === k ? "chosen" : ""} ${struck ? "struck" : ""}">
      <button type="button" class="opt-btn" data-action="pick" data-k="${k}" aria-pressed="${String(sel === k)}" ${struck ? html`aria-description="${t("test.struck")}"` : ""}>
        <span class="opt-letter">${letterFor(k)}</span><span class="opt-text">${richText(opt)}</span></button></li>`;
    })}</ol>
    <div class="tcard-tools">
      <button type="button" class="guess ${guessed ? "on" : ""}" data-action="guess" aria-pressed="${String(guessed)}">🤔 ${guessed ? t("test.guessOn") : t("test.guess")}</button>
      <button type="button" class="guess cross ${crossMode ? "on" : ""}" data-action="cross" aria-pressed="${String(crossMode)}">✕ ${crossMode ? t("test.crossOn") : t("test.cross")}</button>
    </div>
  </article>`;
}

export const testScreen = {
  id: "test",
  render(container) {
    const attempt = tests.activeTest();
    if (!attempt) { container.innerHTML = html`<section class="empty"><h1>${t("test.none")}</h1></section>`; return undefined; }
    if (!live || live.id !== attempt.id) live = { id: attempt.id, run: structuredClone(attempt.run) };
    const run = live.run;
    const questions = run.questionIds.map((id) => store.question(id)).filter(Boolean);
    run.questionIds = questions.map((q) => q.id); // questions deleted since the start are dropped
    const timed = run.remainingMs !== null;
    document.body.classList.add("in-test");

    container.innerHTML = html`<section class="test">
      <header class="test-bar">
        ${timed ? html`<button type="button" class="test-timer" data-action="pause" aria-label="${t("test.pause")}"><span class="tt-icon"></span><span id="tClock">${clock(run.remainingMs)}</span></button>` : html`<button type="button" class="test-timer" data-action="pause" aria-label="${t("test.pause")}"><span class="tt-icon"></span><span>${t("test.pause")}</span></button>`}
        <span class="test-count" id="tCount"></span>
        <button type="button" class="icon-btn" data-action="menu" aria-label="${t("common.more")}">⋯</button>
        <button type="button" class="btn btn-small" data-action="submit">${t("test.submit")}</button>
      </header>
      <p class="hint test-title">${attempt.scope?.label || ""}</p>
      <div id="tBody"></div>
      <div class="pause-cover" id="tPause" hidden><div><h2>${t("test.paused")}</h2><p class="hint">${t("test.pausedHint")}</p>
        <button type="button" class="btn" data-action="resume">${t("test.resume")}</button></div></div>
    </section>`;

    const body = container.querySelector("#tBody");
    const countEl = container.querySelector("#tCount");
    const clockEl = container.querySelector("#tClock");
    const cover = container.querySelector("#tPause");
    const items = questions;

    /* ---- time keeping ---- */
    let activeId = run.questionIds[run.index] || run.questionIds[0];
    let lastTick = null;   // when time was last added (null = not running)
    let lastSave = Date.now();
    let finished = false;
    const running = () => !run.paused && !document.hidden && !finished;
    function account() {
      const now = performance.now();
      if (lastTick !== null && running()) {
        const dt = now - lastTick;
        if (activeId) run.timeSpent[activeId] = (run.timeSpent[activeId] || 0) + dt;
        if (timed) run.remainingMs = Math.max(0, run.remainingMs - dt);
      }
      lastTick = running() ? now : null;
    }
    function setActive(id) { if (id && id !== activeId) { account(); activeId = id; run.index = Math.max(0, run.questionIds.indexOf(id)); } }
    const save = () => { account(); lastSave = Date.now(); return tests.saveRun(attempt, run); };

    function drawCount() {
      countEl.textContent = t("test.answered", { n: Object.keys(run.answers).length, of: run.questionIds.length });
      if (clockEl) {
        clockEl.textContent = clock(run.remainingMs);
        clockEl.parentElement.classList.toggle("low", run.remainingMs <= 60000);
      }
      cover.hidden = !run.paused;
      const icon = container.querySelector(".tt-icon");
      if (icon.dataset.state !== String(run.paused)) {
        icon.dataset.state = String(run.paused);
        icon.innerHTML = run.paused ? PLAY : PAUSE;
      }
    }

    const marks = (q) => [run.answers[q.id] !== undefined ? "answered" : "", run.guesses[q.id] ? "guessed" : ""].join(" ");
    const card = (q, i) => testCard(store.question(q.id) || q, i, run);
    // Scroll layout shows every question at once (no "Show more" in a test).
    if (attempt.layout === "scroll") setPlace(`test:${attempt.id}`, items.length, "scroll");
    else setPlace(`test:${attempt.id}`, run.index || 0, "single"); // back where you left off
    const view = mountCards(body, {
      key: `test:${attempt.id}`, items, card, layout: attempt.layout === "scroll" ? "scroll" : "single", marks,
      onIndex: (i) => setActive(items[i]?.id)
    });
    const refresh = (id) => { view.refresh(id); drawCount(); };

    // Scroll layout: the question in the middle of the screen is the one being read.
    let scrollTimer = null;
    const onScroll = () => {
      if (attempt.layout !== "scroll") return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const mid = window.innerHeight / 2;
        let best = null; let bestDist = Infinity;
        body.querySelectorAll(".tcard").forEach((el) => {
          const r = el.getBoundingClientRect();
          const dist = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
          if (dist < bestDist) { bestDist = dist; best = el; }
        });
        if (best) setActive(best.dataset.qid);
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (attempt.layout === "scroll" && run.index > 0) {
      requestAnimationFrame(() => body.querySelector(`[data-i="${run.index}"]`)?.scrollIntoView({ block: "center" }));
    }

    const onVisibility = () => { account(); if (document.hidden) save(); };
    const onPageHide = () => save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    const timer = setInterval(() => {
      account();
      drawCount();
      if (timed && run.remainingMs <= 0 && !finished) { submit(true); return; }
      if (Date.now() - lastSave > SAVE_EVERY_MS) save();
    }, 1000);
    account(); drawCount();
    typesetMath(body);

    async function submit(auto) {
      if (finished) return;
      account();
      if (!auto) {
        const left = run.questionIds.length - Object.keys(run.answers).length;
        if (left > 0) {
          const ok = await runFlow(() => confirmAction({ title: t("test.submitTitle"), body: t("test.submitLeft", { n: left }), confirmLabel: t("test.submit") }));
          if (!ok) return;
        }
      }
      finished = true;
      clearInterval(timer);
      const done = await tests.submitTest(attempt, run, { auto });
      live = null;
      if (auto) toast(t("test.timeUp"));
      go("result", { id: done.id, fresh: "1" });
    }

    function toggleStrike(id, k) {
      run.struck ||= {};
      const list = new Set(run.struck[id] || []);
      if (list.has(k)) list.delete(k); else { list.add(k); if (run.answers[id] === k) delete run.answers[id]; }
      if (list.size) run.struck[id] = [...list]; else delete run.struck[id];
      refresh(id);
    }
    function unstrike(id, k) {
      if (!run.struck?.[id]?.includes(k)) return;
      run.struck[id] = run.struck[id].filter((x) => x !== k);
      if (!run.struck[id].length) delete run.struck[id];
    }
    // Long-press an option to cross it out (works without "Cross out" mode).
    let pressTimer = null;
    let swallowUntil = 0; // the finger-lift click after a long-press must not also choose the option
    let pressFired = false;
    const onDown = (e) => {
      const btn = e.target.closest(".opt-btn[data-action='pick']");
      if (!btn) return;
      pressTimer = setTimeout(() => {
        btn.dataset.longpress = "1"; navigator.vibrate?.(15); btn.click();
        pressFired = true;
      }, 480);
    };
    const cancelPress = (e) => {
      clearTimeout(pressTimer);
      if (pressFired && e?.type === "pointerup") swallowUntil = Date.now() + 250;
      pressFired = false;
    };
    body.addEventListener("pointerdown", onDown);
    ["pointerup", "pointercancel", "pointerleave", "scroll"].forEach((ev) => body.addEventListener(ev, cancelPress, { passive: true }));
    body.addEventListener("contextmenu", (e) => { if (e.target.closest(".opt-btn")) e.preventDefault(); });
    body.addEventListener("click", (e) => {
      if (e.isTrusted && Date.now() < swallowUntil && e.target.closest(".opt-btn")) { e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
    }, true);

    onAction(container, {
      pick: (el) => {
        const id = el.closest("[data-qid]").dataset.qid; const k = Number(el.dataset.k);
        setActive(id);
        if (crossMode || el.dataset.longpress === "1") { delete el.dataset.longpress; toggleStrike(id, k); return; }
        unstrike(id, k);
        if (run.answers[id] === k) delete run.answers[id]; else run.answers[id] = k;
        refresh(id);
        if (Date.now() - lastSave > 2000) save();
      },
      cross: () => { crossMode = !crossMode; body.querySelectorAll(".tcard").forEach((c) => view.refresh(c.dataset.qid)); if (crossMode) toast(t("test.crossHint")); },
      guess: (el) => {
        const id = el.closest("[data-qid]").dataset.qid;
        setActive(id);
        if (run.guesses[id]) delete run.guesses[id]; else run.guesses[id] = true;
        refresh(id);
      },
      flag: (el) => {
        const id = el.closest("[data-qid]").dataset.qid;
        store.quietly(() => mut.setFlag(id, !store.questionState(id)?.flagged)).then(() => refresh(id));
      },
      pause: () => { account(); run.paused = !run.paused; account(); drawCount(); save(); },
      resume: () => { account(); run.paused = false; account(); drawCount(); },
      submit: () => submit(false),
      menu: () => runFlow(async () => {
        const choice = await chooseAction({ title: attempt.scope?.label || t("test.title"), items: [
          { id: "size", label: `Aa ${t("test.textSize")}`, sub: t(`setx.sizes.${store.setting("textSize", "m")}`) },
          { id: "leave", label: t("test.leave"), sub: t("test.leaveHint") },
          { id: "discard", label: t("test.discard"), danger: true }
        ] });
        if (choice === "size") {
          const cur = store.setting("textSize", "m");
          const size = await chooseAction({ title: t("test.textSize"), items: TEXT_SIZES.map((v) => ({ id: v, label: t(`setx.sizes.${v}`), current: v === cur })) });
          if (size && size !== cur) { await save(); await store.setSetting("textSize", size); }
        }
        if (choice === "leave") { await save(); go("today"); }
        if (choice === "discard") {
          const ok = await confirmAction({ title: t("test.discardTitle"), body: t("test.discardBody"), confirmLabel: t("test.discard"), danger: true });
          if (!ok) return;
          finished = true; clearInterval(timer); live = null;
          await tests.discardTest(attempt);
          go("today");
        }
      })
    });

    // Leaving the screen (Back, a tab, a redraw): stop the clock and save.
    return () => {
      clearInterval(timer);
      clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.body.classList.remove("in-test");
      if (!finished) { account(); tests.saveRun(attempt, run); }
    };
  }
};
