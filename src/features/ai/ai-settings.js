/* Settings → AI: presets (provider + model + your key), priority order,
   automatic fallback, answer language, Test, and "Remove all AI keys". */
import { html } from "../../core/dom.js";
import { t, dateLocale, formatNumber } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen } from "../../core/sheet.js";
import { chooseAction, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as presets from "../../ai/presets.js";
import * as store from "../../data/store.js";
import { request } from "../../ai/client.js";
import { TEST_PROMPT } from "../../ai/prompts.js";
import { errorText } from "./ai-ui.js";
import { openFlags } from "./flag-ui.js";
import { presetFlags, flagList } from "../../ai/flags.js";
import { usageView, openRouterKey } from "../../ai/usage.js";

const PAUSE = html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/></svg>`;
const GRIP = html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${[6, 12, 18].map((y) => html`<circle cx="9" cy="${y}" r="1.7" fill="currentColor"/><circle cx="15" cy="${y}" r="1.7" fill="currentColor"/>`)}</svg>`;
const PLAY = html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`;
const pauseWhen = (ms) => new Date(ms).toLocaleString(dateLocale(), { hour: "numeric", minute: "2-digit", day: new Date(ms).toDateString() === new Date().toDateString() ? undefined : "numeric", month: new Date(ms).toDateString() === new Date().toDateString() ? undefined : "short" });
const mask = (key) => (key ? `••••${key.slice(-4)}` : t("ai.noKey"));
// 2,400 → "2.4k", 1,250,000 → "1.3M" (the phone's compact style for India would write "2.4T" for thousand).
const compact = (n) => (n < 1000 ? formatNumber(n) : n < 1e6 ? `${formatNumber(Math.round(n / 100) / 10)}k` : `${formatNumber(Math.round(n / 1e5) / 10)}M`);
const GROQ = /api\.groq\.com/i;

/** Today / in all, counted on this phone; and what the provider says is left (when it says). */
function usageLines(p, now) {
  const u = usageView(p, now);
  const lines = [t("ai.usage.today", { r: formatNumber(u.dayReq), tk: compact(u.dayTok) }), t("ai.usage.total", { r: formatNumber(u.totReq), tk: compact(u.totTok) })];
  const r = u.rate;
  // Only fresh figures (they change by the minute); Groq's request limit is per day, its token limit per minute.
  if (r && now - r.at < 6 * 3600000) {
    const when = new Date(r.at).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" });
    const day = GROQ.test(p.baseUrl || "");
    const parts = [
      Number.isFinite(r.reqLeft) ? t(day ? "ai.usage.reqLeftDay" : "ai.usage.reqLeft", { n: formatNumber(r.reqLeft), of: Number.isFinite(r.reqLimit) ? formatNumber(r.reqLimit) : "?" }) : null,
      Number.isFinite(r.tokLeft) ? t(day ? "ai.usage.tokLeftMin" : "ai.usage.tokLeft", { n: compact(r.tokLeft), of: Number.isFinite(r.tokLimit) ? compact(r.tokLimit) : "?" }) : null
    ].filter(Boolean);
    if (parts.length) lines.push(`${t("ai.usage.says", { name: p.name })}: ${parts.join(" · ")} (${when})`);
  }
  return lines;
}
const orCache = new Map(); // preset id → { at, info } (asked again after 5 minutes)
async function orInfo(p) {
  const c = orCache.get(p.id);
  if (c && Date.now() - c.at < 300000) return c.info;
  const info = await openRouterKey(p);
  orCache.set(p.id, { at: Date.now(), info });
  return info;
}
function orLine(info) {
  if (!info) return "";
  const parts = [
    Number.isFinite(info.freeLeft) ? t("ai.usage.orFree", { n: formatNumber(info.freeLeft), of: Number.isFinite(info.freeLimit) ? formatNumber(info.freeLimit) : "?" }) : null,
    Number.isFinite(info.creditLeft) ? t("ai.usage.orCredit", { n: info.creditLeft.toFixed(2) }) : null
  ].filter(Boolean);
  return parts.length ? `${t("ai.usage.says", { name: "OpenRouter" })}: ${parts.join(" · ")}` : "";
}

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
    ${list.length ? html`<p class="hint">${t("ai.usage.about")}</p>` : ""}
    ${list.length ? html`<div class="menu">${list.map((p, i) => {
      const limited = p.limitHitAt && now - p.limitHitAt < 3600000;
      const paused = presets.isPaused(p, now);
      return html`<div class="preset ${p.id === cfg.activeId ? "is-current" : ""} ${paused ? "is-paused" : ""}">
        <button type="button" class="preset-main" data-action="activate" data-id="${p.id}" aria-pressed="${String(p.id === cfg.activeId)}">
          <span class="radio">${p.id === cfg.activeId ? "●" : "○"}</span>
          <span class="row-main"><span class="row-title">${i + 1}. ${p.name}</span>
          <span class="row-sub">${[p.model || t("ai.noModel"), mask(p.apiKey), presetFlags(p) ? t("flag.count", { n: presetFlags(p) }) : null, limited ? t("ai.limited", { m: Math.max(1, 60 - Math.floor((now - p.limitHitAt) / 60000)) }) : null].filter(Boolean).join(" · ")}</span>
          <span class="row-sub usage-line">${usageLines(p, now).map((l) => html`<span>${l}</span>`)}${/openrouter\.ai/i.test(p.baseUrl || "") && p.apiKey ? html`<span data-or="${p.id}"></span>` : ""}</span>
          ${paused ? html`<span class="row-sub paused-note">${p.pausedUntil >= presets.FOREVER ? t("ai.pausedOff") : t("ai.pausedUntil", { when: pauseWhen(p.pausedUntil) })}</span>` : ""}</span>
        </button>
        <button type="button" class="icon-sm drag-handle" data-drag="${p.id}" aria-label="${t("ai.dragHint")}" title="${t("ai.dragHint")}">${GRIP}</button>
        <button type="button" class="icon-sm" data-action="pause" data-id="${p.id}" aria-label="${paused ? t("ai.resume") : t("ai.pause")}">${paused ? PLAY : PAUSE}</button>
        <button type="button" class="icon-sm" data-action="edit" data-id="${p.id}" aria-label="${t("common.edit")}">✎</button>
      </div>`;
    })}</div>` : html`<p>${t("ai.none")}</p>`}
    <div class="actions-row"><button type="button" class="btn" data-action="add">${t("ai.add")}</button>
      <button type="button" class="btn btn-quiet" data-action="flags">${t("flag.open")}${flagList().length ? ` (${flagList().length})` : ""}</button></div>
    <label class="switch-row"><input type="checkbox" id="aiFallback" ${cfg.fallback ? "checked" : ""}><span>${t("ai.fallback")}<span class="row-sub">${t("ai.fallbackHint")}</span></span></label>
    <h3>${t("ai.lang")}</h3>
    <div class="segmented three">${presets.LANGS.map((l) => html`<button type="button" class="${cfg.lang === l ? "on" : ""}" data-action="lang" data-l="${l}">${t(`ai.langs.${l}`)}</button>`)}</div>
    ${list.length ? html`<button type="button" class="link danger" data-action="remove-all">${t("ai.removeAll")}</button>` : ""}
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    activate: async (el) => { await presets.saveConfig({ activeId: el.dataset.id }); openAiSettings(); },
    up: async (el) => { await presets.movePreset(el.dataset.id, -1); openAiSettings(); },
    down: async (el) => { await presets.movePreset(el.dataset.id, 1); openAiSettings(); },
    edit: (el) => editPreset(el.dataset.id),
    pause: async (el) => {
      const p = list.find((x) => x.id === el.dataset.id);
      const paused = presets.isPaused(p);
      const choice = await chooseAction({ title: p.name, sub: t("ai.pauseHint"), items: [
        paused ? { id: "resume", label: `▶ ${t("ai.resume")}` } : null,
        { id: "hour", label: t("ai.pauseHour") },
        { id: "today", label: t("ai.pauseToday") },
        { id: "off", label: t("ai.pauseOff") }
      ] });
      const until = { hour: Date.now() + 3600000, today: presets.endOfToday(), off: presets.FOREVER, resume: null }[choice];
      if (choice) { await presets.updatePreset(p.id, { pausedUntil: until }); toast(choice === "resume" ? t("ai.resumed", { name: p.name }) : t("ai.pausedToast", { name: p.name })); }
      openAiSettings();
    },
    add: async () => {
      const key = await chooseAction({ title: t("ai.add"), items: presets.TEMPLATES.map((x) => ({ id: x.key, label: x.label })) });
      if (!key) { if (isSheetOpen()) openAiSettings(); return; }
      const p = await presets.addPreset(key);
      editPreset(p.id);
    },
    lang: async (el) => { await presets.saveConfig({ lang: el.dataset.l }); openAiSettings(); },
    flags: () => openFlags(() => openAiSettings()),
    "remove-all": async () => {
      const ok = await confirmAction({ title: t("ai.removeAllTitle"), body: t("ai.removeAllBody"), confirmLabel: t("ai.removeAllButton"), danger: true });
      if (ok) { await presets.removeAllKeys(); toast(t("ai.removed")); }
      if (isSheetOpen()) openAiSettings();
    },
    close: () => closeSheet()
  }, { label: t("ai.title"), onClose: () => store.touch() }); // Settings shows the new summary
  document.querySelector("#aiFallback")?.addEventListener("change", (e) => presets.saveConfig({ fallback: e.target.checked }));
  dragToReorder(list);
  // OpenRouter tells how many free-model requests are left today: asked for each OpenRouter preset (its own key only).
  list.filter((p) => /openrouter\.ai/i.test(p.baseUrl || "") && p.apiKey).forEach(async (p) => {
    const line = orLine(await orInfo(p));
    const el = document.querySelector(`[data-or="${CSS.escape(p.id)}"]`);
    if (el && line) el.textContent = line;
  });
}

/* ⠿ Hold the handle and drag a preset up or down (the list scrolls when you reach its top or bottom).
   A tap on the handle (no drag) offers Move to top / up / down / to bottom instead. */
function dragToReorder(list) {
  const menu = document.querySelector("#sheetRoot .menu");
  const scroller = document.querySelector("#sheetRoot .sheet-body");
  if (!menu || !scroller) return;
  menu.querySelectorAll("[data-drag]").forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      const row = h.closest(".preset");
      const id = h.dataset.drag;
      const from = list.findIndex((p) => p.id === id);
      const y0 = e.clientY; let lastY = e.clientY; let moved = false; let raf = 0;
      const place = () => {
        // The dragged row goes before the first row whose middle is below the finger.
        const rows = [...menu.querySelectorAll(".preset")].filter((r) => r !== row);
        const before = rows.find((r) => { const b = r.getBoundingClientRect(); return lastY < b.top + b.height / 2; });
        if (before) { if (row.nextElementSibling !== before) menu.insertBefore(row, before); }
        else if (menu.lastElementChild !== row) menu.appendChild(row);
      };
      const edge = () => {
        const b = scroller.getBoundingClientRect();
        const step = lastY < b.top + 60 ? -12 : lastY > b.bottom - 60 ? 12 : 0;
        if (step) { scroller.scrollTop += step; place(); }
        raf = requestAnimationFrame(edge);
      };
      const move = (ev) => {
        lastY = ev.clientY;
        if (!moved && Math.abs(lastY - y0) < 8) return;
        if (!moved) { moved = true; row.classList.add("dragging"); raf = requestAnimationFrame(edge); }
        place();
      };
      const end = async () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
        cancelAnimationFrame(raf);
        row.classList.remove("dragging");
        if (!moved) return moveMenu(list, from);
        const to = [...menu.querySelectorAll(".preset")].indexOf(row);
        if (to !== from) { await presets.movePresetTo(id, to); toast(t("ai.movedTo", { name: list[from].name, n: to + 1 })); }
        const top = scroller.scrollTop;
        await openAiSettings();
        const nb = document.querySelector("#sheetRoot .sheet-body"); if (nb) nb.scrollTop = top; // stay where you were in a long list
      };
      // On the window: moving the row in the list would end a capture on the handle itself.
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    });
  });
}

async function moveMenu(list, i) {
  const p = list[i];
  const last = list.length - 1;
  const choice = await chooseAction({ title: p.name, sub: t("ai.dragHint"), items: [
    i > 0 ? { id: "top", label: `⤒ ${t("ai.moveTop")}` } : null,
    i > 0 ? { id: "up", label: `↑ ${t("ai.up")}` } : null,
    i < last ? { id: "down", label: `↓ ${t("ai.down")}` } : null,
    i < last ? { id: "bottom", label: `⤓ ${t("ai.moveBottom")}` } : null
  ].filter(Boolean) });
  const to = { top: 0, up: i - 1, down: i + 1, bottom: last }[choice];
  if (to !== undefined) await presets.movePresetTo(p.id, to);
  openAiSettings();
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

