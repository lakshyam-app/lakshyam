/* Shared AI screens: "set up AI first", loading, result with actions, errors.
   Every AI answer carries a reminder that AI can be wrong. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody } from "../../core/sheet.js";
import { typesetMath } from "../../core/math.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { can } from "../../core/entitlements.js";
import { richText } from "../../domain/text.js";
import * as presets from "../../ai/presets.js";
import { ask } from "../../ai/client.js";

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

/** True if AI can be used; otherwise explains how to set it up. */
export async function ensureAi() {
  if (!can("ai")) return false;
  if (await presets.hasPreset()) return true;
  openSheet(html`<h2>${t("ai.setUpTitle")}</h2><p>${t("ai.setUpBody")}</p><p class="hint">${t("ai.privacy")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("ai.setUp")}</button></div>`,
  { close: () => closeSheet(), go: () => go("settings", { section: "ai" }) });
  return false;
}

/**
 * Shows "Thinking…", asks, then shows the answer with buttons.
 * opts: { title, sub, system, user, maxTokens, actions: [{ id, label, run(text) }] }
 * Returns the text (or null on error/close).
 */
export async function askInSheet({ title, sub = "", system, user, maxTokens = 2500, actions = [], keepOpen = false }) {
  const head = html`<h2>${title}</h2>${sub ? html`<p class="hint">${sub}</p>` : ""}`;
  openSheet(html`${head}<p class="sheet-status">${t("ai.thinking")}</p>`, {}, { label: title });
  try {
    const { text, preset, switched } = await ask(system, user, maxTokens);
    if (!isSheetOpen()) return text;
    if (switched) toast(t("ai.switched", { name: preset.name }));
    showAnswer({ head, text, actions, presetName: preset.name, keepOpen });
    return text;
  } catch (e) {
    if (isSheetOpen()) {
      openSheet(html`${head}<p class="warn-box pre">${errorText(e)}</p>
        <p class="hint">${t("ai.checkPreset")}</p>
        <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="settings">${t("ai.title")}</button>
          <button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`,
      { close: () => closeSheet(), settings: () => go("settings", { section: "ai" }) });
    }
    return null;
  }
}

export function showAnswer({ head, text, actions, presetName, keepOpen }) {
  openSheet(html`${head}
    <div class="ai-answer qtext">${richText(text)}</div>
    <p class="hint">${t("ai.byPreset", { name: presetName })} · ${t("ai.verify")}</p>
    <div class="ai-actions">
      <button type="button" class="btn btn-quiet btn-small" data-action="copy">${t("question.copy")}</button>
      ${actions.map((a) => html`<button type="button" class="btn btn-quiet btn-small" data-action="act" data-id="${a.id}">${a.label}</button>`)}
    </div>
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    copy: async () => { try { await navigator.clipboard.writeText(text); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    act: async (el) => {
      const a = actions.find((x) => x.id === el.dataset.id);
      const done = await a.run(text);
      if (done !== false) { el.disabled = true; el.textContent = `✓ ${a.label}`; }
      if (!keepOpen && a.closes) closeSheet();
    },
    close: () => closeSheet()
  });
  typesetMath(sheetBody());
}
