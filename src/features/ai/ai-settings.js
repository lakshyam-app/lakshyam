/* Settings → AI: presets (provider + model + your key), priority order,
   automatic fallback, answer language, Test, and "Remove all AI keys". */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen } from "../../core/sheet.js";
import { chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as presets from "../../ai/presets.js";
import * as store from "../../data/store.js";
import { request } from "../../ai/client.js";
import { TEST_PROMPT } from "../../ai/prompts.js";
import { errorText } from "./ai-ui.js";

const mask = (key) => (key ? `••••${key.slice(-4)}` : t("ai.noKey"));

/** The small summary shown inside Settings. */
export async function aiBlock() {
  const list = await presets.getPresets();
  const cfg = await presets.getConfig();
  const active = list.find((p) => p.id === cfg.activeId) || list[0];
  return html`<p>${list.length ? t("ai.summary", { n: list.length, active: active?.name || "" }) : t("ai.none")}</p>
    <p class="hint">${t("ai.privacy")}</p>
    <button type="button" class="btn btn-quiet" data-action="ai-settings">${list.length ? t("ai.manage") : t("ai.setUp")}</button>`;
}

export async function openAiSettings() {
  const list = await presets.getPresets();
  const cfg = await presets.getConfig();
  const now = Date.now();
  openSheet(html`<h2>${t("ai.title")}</h2>
    <p class="hint">${t("ai.privacy")}</p>
    ${list.length ? html`<div class="menu">${list.map((p, i) => {
      const limited = p.limitHitAt && now - p.limitHitAt < 3600000;
      return html`<div class="preset ${p.id === cfg.activeId ? "is-current" : ""}">
        <button type="button" class="preset-main" data-action="activate" data-id="${p.id}" aria-pressed="${String(p.id === cfg.activeId)}">
          <span class="radio">${p.id === cfg.activeId ? "●" : "○"}</span>
          <span class="row-main"><span class="row-title">${i + 1}. ${p.name}</span>
          <span class="row-sub">${[p.model || t("ai.noModel"), mask(p.apiKey), t("ai.uses", { n: p.uses || 0 }), limited ? t("ai.limited", { m: Math.max(1, 60 - Math.floor((now - p.limitHitAt) / 60000)) }) : null].filter(Boolean).join(" · ")}</span></span>
        </button>
        <button type="button" class="icon-sm" data-action="up" data-id="${p.id}" ${i === 0 ? "disabled" : ""} aria-label="${t("ai.up")}">↑</button>
        <button type="button" class="icon-sm" data-action="down" data-id="${p.id}" ${i === list.length - 1 ? "disabled" : ""} aria-label="${t("ai.down")}">↓</button>
        <button type="button" class="icon-sm" data-action="edit" data-id="${p.id}" aria-label="${t("common.edit")}">✎</button>
      </div>`;
    })}</div>` : html`<p>${t("ai.none")}</p>`}
    <button type="button" class="btn" data-action="add">${t("ai.add")}</button>
    <label class="switch-row"><input type="checkbox" id="aiFallback" ${cfg.fallback ? "checked" : ""}><span>${t("ai.fallback")}<span class="row-sub">${t("ai.fallbackHint")}</span></span></label>
    <h3>${t("ai.lang")}</h3>
    <div class="segmented three">${presets.LANGS.map((l) => html`<button type="button" class="${cfg.lang === l ? "on" : ""}" data-action="lang" data-l="${l}">${t(`ai.langs.${l}`)}</button>`)}</div>
    ${list.length ? html`<button type="button" class="link danger" data-action="remove-all">${t("ai.removeAll")}</button>` : ""}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    activate: async (el) => { await presets.saveConfig({ activeId: el.dataset.id }); openAiSettings(); },
    up: async (el) => { await presets.movePreset(el.dataset.id, -1); openAiSettings(); },
    down: async (el) => { await presets.movePreset(el.dataset.id, 1); openAiSettings(); },
    edit: (el) => editPreset(el.dataset.id),
    add: async () => {
      const key = await chooseAction({ title: t("ai.add"), items: presets.TEMPLATES.map((x) => ({ id: x.key, label: x.label })) });
      if (!key) { if (isSheetOpen()) openAiSettings(); return; }
      const p = await presets.addPreset(key);
      editPreset(p.id);
    },
    lang: async (el) => { await presets.saveConfig({ lang: el.dataset.l }); openAiSettings(); },
    "remove-all": async () => {
      const ok = await confirmAction({ title: t("ai.removeAllTitle"), body: t("ai.removeAllBody"), confirmLabel: t("ai.removeAllButton"), danger: true });
      if (ok) { await presets.removeAllKeys(); toast(t("ai.removed")); }
      if (isSheetOpen()) openAiSettings();
    },
    close: () => closeSheet()
  }, { label: t("ai.title"), onClose: () => store.touch() }); // Settings shows the new summary
  document.querySelector("#aiFallback")?.addEventListener("change", (e) => presets.saveConfig({ fallback: e.target.checked }));
}

async function editPreset(id) {
  const p = (await presets.getPresets()).find((x) => x.id === id);
  if (!p) return openAiSettings();
  const body = openSheet(html`<h2>${t("ai.editTitle")}</h2>
    <p class="hint">${t(`ai.hint.${p.template || "custom"}`)}</p>
    <label class="field-label">${t("ai.name")}<input class="field" id="pName" type="text" value="${p.name}"></label>
    <label class="field-label">${t("ai.format")}<select class="field" id="pFormat">
      <option value="openai" ${p.format === "openai" ? "selected" : ""}>${t("ai.formatOpenai")}</option>
      <option value="anthropic" ${p.format === "anthropic" ? "selected" : ""}>Anthropic</option></select></label>
    <label class="field-label">${t("ai.baseUrl")}<input class="field mono" id="pBase" type="url" value="${p.baseUrl}" autocapitalize="off" spellcheck="false" placeholder="https://…/v1"></label>
    <label class="field-label">${t("ai.model")}<input class="field mono" id="pModel" type="text" value="${p.model}" autocapitalize="off" spellcheck="false"></label>
    <label class="field-label">${t("ai.key")}<span class="inline-form"><input class="field mono" id="pKey" type="password" value="${p.apiKey}" autocapitalize="off" spellcheck="false" autocomplete="off">
      <button type="button" class="btn btn-quiet btn-small" data-action="show">${t("ai.show")}</button></span></label>
    <div id="pTest"></div>
    <button type="button" class="link danger" data-action="delete">${t("ai.delete")}</button>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="test">${t("ai.test")}</button>
      <button type="button" class="btn" data-action="save">${t("common.save")}</button>
    </div>`, {
    show: () => { const f = body.querySelector("#pKey"); f.type = f.type === "password" ? "text" : "password"; },
    test: async () => {
      const out = body.querySelector("#pTest");
      out.innerHTML = html`<p class="hint">${t("ai.testing")}</p>`;
      try {
        const reply = await request({ ...p, ...read() }, TEST_PROMPT.system, TEST_PROMPT.user, 300);
        out.innerHTML = html`<p class="ok-box">✓ ${t("ai.testOk", { reply: reply.slice(0, 60) })}</p>`;
      } catch (e) { out.innerHTML = html`<p class="warn-box">✗ ${errorText(e)}</p>`; }
    },
    save: async () => {
      const v = read();
      if (v.baseUrl && !/^https:\/\//i.test(v.baseUrl)) { toast(t("ai.httpsOnly")); return; }
      await presets.updatePreset(id, v);
      toast(t("ai.saved"));
      openAiSettings();
    },
    delete: async () => {
      const ok = await confirmAction({ title: t("ai.deleteTitle", { name: p.name }), confirmLabel: t("common.delete"), danger: true });
      if (ok) await presets.deletePreset(id);
      if (isSheetOpen()) openAiSettings();
    }
  }, { label: t("ai.editTitle") });
  function read() {
    return {
      name: body.querySelector("#pName").value.trim() || "Preset", format: body.querySelector("#pFormat").value,
      baseUrl: body.querySelector("#pBase").value.trim(), model: body.querySelector("#pModel").value.trim(), apiKey: body.querySelector("#pKey").value.trim()
    };
  }
}

