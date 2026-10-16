/* Shared AI screens: "set up AI first", loading, result with actions, errors.
   Every AI answer carries a reminder that AI can be wrong. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody } from "../../core/sheet.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { can } from "../../core/entitlements.js";
import { aiText } from "../../domain/text.js";
import * as presets from "../../ai/presets.js";
import { ask, aiControl } from "../../ai/client.js";
import { chooseAction } from "../../core/dialogs.js";
import { flagChip, answerRef } from "./flag-ui.js";
import { presetFlags } from "../../ai/flags.js";
import { usageView } from "../../ai/usage.js";

export function errorText(e) {
  if (e?.allPaused) return t("ai.err.allPaused");
  if (e?.noPreset) return t("ai.err.noPreset");
  const m = String(e?.message || e);
  if (m === "network") return t("ai.err.network");
  if (m === "timeout") return t("ai.err.timeout");
  if (m === "empty") return t("ai.err.empty");
  if (m === "no-json" || m === "incomplete-json" || e instanceof SyntaxError) return t("ai.err.badJson");
  return m;
}

/* ---------- 🤖 at the top of the app: which AI writes, and in which language, for everything ---------- */

/** The 🤖 button at the top of the app: the preset tried first and the AI language, short. */
export async function aiTopLabel() {
  const [list, cfg] = await Promise.all([presets.getPresets(), presets.getConfig()]);
  const first = presets.tryOrder(list, cfg)[0];
  if (!first) return null;
  return { name: first.name, lang: t(`ai.langShort.${cfg.lang || "en"}`) };
}

/** Choose the preset to use first and the AI's language (the same setting as Settings → AI). True if something changed.
    Uses the open sheet; the caller draws its own screen again afterwards. */
export async function chooseAiSetup({ withLang = true } = {}) {
  const [list, cfg] = await Promise.all([presets.getPresets(), presets.getConfig()]);
  const usable = list.filter((p) => p.apiKey && p.model && p.baseUrl && !presets.isPaused(p));
  const first = presets.tryOrder(list, cfg)[0];
  const id = await chooseAction({ title: t("ai.switchTitle"), sub: t("ai.switchSub"), items: [
    { heading: t("ai.switchPreset") },
    ...usable.map((p) => { const n = presetFlags(p); const u = usageView(p); return { id: `p:${p.id}`, label: p.name, sub: [p.model, t("ai.usage.todayShort", { r: u.dayReq }), n ? t("flag.count", { n }) : ""].filter(Boolean).join(" · "), current: first?.id === p.id }; }),
    ...(withLang ? [{ heading: t("ai.lang") }, ...presets.LANGS.map((l) => ({ id: `l:${l}`, label: t(`ai.langs.${l}`), current: (cfg.lang || "en") === l }))] : []),
    { id: "settings", label: `⚙ ${t("ai.allSettings")}` }
  ] });
  if (!id) return false;
  if (id === "settings") { go("settings", { section: "ai" }); return false; }
  if (id.startsWith("p:")) { if (first?.id === id.slice(2)) return false; await presets.saveConfig({ activeId: id.slice(2) }); return true; }
  const l = id.slice(2);
  if ((cfg.lang || "en") === l) return false;
  await presets.saveConfig({ lang: l });
  return true;
}

/** True if AI can be used; otherwise explains how to set it up. */
export async function ensureAi() {
  if (!can("ai")) return false;
  if (await presets.hasPreset()) return true;
  openSheet(html`<h2>${t("ai.setUpTitle")}</h2><p>${t("ai.setUpBody")}</p><p class="hint">${t("ai.privacy")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("ai.setUp")}</button></div>`,
  { close: () => closeSheet(), go: () => go("settings", { section: "ai", open: "1" }) });
  return false;
}

/* While an AI is answering: which one, how long so far, and (after a while) "Ask the next AI" / "Stop".
   Some models think for minutes before writing; you never have to sit and wait for one. */
const SLOW_S = 15;
export function waitingBox(prefix = "") {
  return html`<div class="ai-wait"><p class="sheet-status" data-wait-line>${t("ai.thinking")}</p>
    <p class="hint center" data-wait-slow hidden>${t("ai.slow")}</p>
    <div class="wait-btns" data-wait-btns hidden><button type="button" class="btn btn-quiet" data-action="${prefix}stop">${t("ai.stop")}</button>
      <button type="button" class="btn" data-action="${prefix}skip" data-wait-skip>${t("ai.askNext")}</button></div></div>`;
}
export function paintWaiting(root, c) {
  if (!root?.isConnected || !c?.preset) return;
  const s = Math.max(0, Math.round((Date.now() - c.startedAt) / 1000));
  const line = root.querySelector("[data-wait-line]");
  if (line) line.textContent = t("ai.thinkingWith", { name: c.preset.name || c.preset.model || "", s });
  const slow = s >= SLOW_S;
  const hint = root.querySelector("[data-wait-slow]"); if (hint) hint.hidden = !slow;
  const btns = root.querySelector("[data-wait-btns]"); if (btns) btns.hidden = !slow;
  const skip = root.querySelector("[data-wait-skip]"); if (skip) skip.hidden = c.left < 1;
}
/** Redraws the waiting line every second while that sheet is open. */
export function watchWaiting(root, getControl) {
  const id = setInterval(() => { if (!root?.isConnected) { clearInterval(id); return; } paintWaiting(root, getControl()); }, 1000);
  paintWaiting(root, getControl());
}

/**
 * Shows "Thinking…", asks, then shows the answer with buttons.
 * opts: { title, sub, system, user, maxTokens, actions: [{ id, label, run(text) }], onModel(model), onAnswer(text, model), flagKind }
 * system / user / maxTokens may be functions of the AI language (the one chosen with 🤖 at the top).
 * onAnswer runs when the answer arrives.
 * Returns the first answer's text (or null on error).
 */
export async function askInSheet(opts) {
  const { title, sub = "", maxTokens = 2500, actions = [], keepOpen = false, onModel = null, onAnswer = null, flagKind = "answer" } = opts;
  let mine = null; // this flow's sheet content: another sheet opened meanwhile is never drawn over
  let run = 0;
  let state = { kind: "thinking" };
  const ours = () => isSheetOpen() && mine?.isConnected;
  const head = () => html`<h2>${title}</h2>${sub ? html`<p class="hint">${sub}</p>` : ""}`;
  let control = null;
  const draw = () => {
    if (state.kind === "thinking") {
      mine = openSheet(html`${head()}${waitingBox()}`, {
        skip: () => control?.skip(),
        stop: () => { control?.cancel(); closeSheet(); }
      }, { label: title });
      watchWaiting(mine, () => control);
    }
    else if (state.kind === "answer") {
      showAnswer({ head: head(), text: state.text, actions, presetName: state.preset.name, keepOpen, model: state.preset.model || "", done: state.done,
        flag: { ref: state.ref, kind: flagKind, presetId: state.preset.id }, onDraw: (b) => { mine = b; } });
    } else {
      mine = openSheet(html`${head()}<p class="warn-box pre">${errorText(state.error)}</p>
        <p class="hint">${t("ai.checkPreset")}</p>
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="settings">${t("ai.title")}</button>
          <button type="button" class="btn btn-quiet" data-action="again">${t("ai.tryAgain")}</button>
          <button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`,
      { close: () => closeSheet(), again: () => start(), settings: () => go("settings", { section: "ai", open: "1" }) });
    }
  };
  const start = async () => {
    const me = ++run;
    state = { kind: "thinking" };
    draw();
    const lang = (await presets.getConfig()).lang || "en";
    const val = (x) => (typeof x === "function" ? x(lang) : x);
    try {
      control = aiControl(() => { if (ours()) paintWaiting(mine, control); });
      const { text, preset, switched } = await ask(val(opts.system), val(opts.user), val(maxTokens), { control });
      if (me !== run) return text; // asked again meanwhile: the newer answer is the one shown
      const model = preset?.model || preset?.name || "";
      if (onModel) onModel(model);
      state = { kind: "answer", text, preset, done: new Set(), ref: answerRef(flagKind) };
      if (onAnswer) await onAnswer(text, model);
      if (ours()) { if (switched) toast(t("ai.switched", { name: preset.name })); draw(); }
      return text;
    } catch (e) {
      if (me !== run || e.cancelled) return null;
      state = { kind: "error", error: e };
      if (ours()) draw();
      return null;
    }
  };
  return start();
}

/** done: ids of actions already carried out (shown ticked). extra: more handlers (e.g. the 🤖 switch). */
export function showAnswer({ head, text, actions, presetName, keepOpen, model = "", done = new Set(), extra = {}, onDraw = null, flag = null }) {
  const fl = flag || { ref: answerRef("answer"), kind: "answer" };
  const again = () => showAnswer({ head, text, actions, presetName, keepOpen, model, done, extra, onDraw, flag: fl });
  const body = openSheet(html`${head}
    <div class="ai-answer">${aiText(text)}</div>
    <p class="hint">${t("ai.byPreset", { name: presetName })}${model && model !== presetName ? ` (${model})` : ""} · ${t("ai.verify")} ${flagChip({ ...fl, by: model || presetName })}</p>
    <div class="ai-actions">
      <button type="button" class="btn btn-quiet btn-small" data-action="copy">${t("question.copy")}</button>
      ${actions.map((a) => html`<button type="button" class="btn btn-quiet btn-small" data-action="act" data-id="${a.id}" ${done.has(a.id) ? "disabled" : ""}>${done.has(a.id) ? "✓ " : ""}${a.label}</button>`)}
    </div>
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    ...extra,
    copy: async () => { try { await navigator.clipboard.writeText(text); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    act: async (el) => {
      const a = actions.find((x) => x.id === el.dataset.id);
      const ok = await a.run(text);
      if (ok !== false) done.add(a.id);
      if (!keepOpen && a.closes) { closeSheet(); return; }
      // An action that asked something first (e.g. "Replace the explanation?") used this sheet: show the answer again.
      if (!el.isConnected) { if (isSheetOpen()) again(); return; }
      if (ok !== false) { el.disabled = true; el.textContent = `✓ ${a.label}`; }
    },
    close: () => closeSheet()
  });
  onDraw?.(body);
  typesetMath(body);
  return body;
}
