/* AI presets (provider, model, your API key) — kept ONLY on this phone.
   They live in the private "aiPresets" store: never in backups, never in safety
   copies, never sent anywhere except to the provider you chose. */
import * as db from "../data/db.js";

const CONFIG_ID = "_config";
const LIMIT_PAUSE_MS = 3600000; // a preset that hit its limit is tried last for an hour

export const TEMPLATES = [
  { key: "gemini", label: "Google Gemini", format: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", hint: "gemini" },
  { key: "openrouter", label: "OpenRouter (many models, some free)", format: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "", hint: "openrouter" },
  { key: "groq", label: "Groq", format: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", hint: "groq" },
  { key: "openai", label: "OpenAI", format: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hint: "openai" },
  { key: "anthropic", label: "Anthropic (Claude)", format: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-haiku-4-5-20251001", hint: "anthropic" },
  { key: "deepseek", label: "DeepSeek", format: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", hint: "deepseek" },
  { key: "mistral", label: "Mistral", format: "openai", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", hint: "mistral" },
  { key: "custom", label: "Custom (any OpenAI-compatible address)", format: "openai", baseUrl: "", model: "", hint: "custom" }
];
export const LANGS = ["en", "ml", "both"];

let cache = null; // { presets: [], config }

async function loadAll() {
  if (cache) return cache;
  const rows = await db.getAll("aiPresets");
  const config = rows.find((r) => r.id === CONFIG_ID) || { id: CONFIG_ID, activeId: null, fallback: true, lang: "en" };
  const presets = rows.filter((r) => r.id !== CONFIG_ID).sort((a, b) => a.order - b.order);
  cache = { presets, config };
  return cache;
}

export async function getPresets() { return (await loadAll()).presets.map((p) => ({ ...p })); }
export async function getConfig() { return { ...(await loadAll()).config }; }
export async function hasPreset() { return (await loadAll()).presets.some((p) => p.apiKey && p.model); }

export async function saveConfig(patch) {
  const all = await loadAll();
  all.config = { ...all.config, ...patch };
  await db.put("aiPresets", all.config);
}

export async function addPreset(templateKey) {
  const all = await loadAll();
  const tpl = TEMPLATES.find((x) => x.key === templateKey) || TEMPLATES.at(-1);
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const preset = {
    id: `ai:${Date.now().toString(36)}${rand}`, name: tpl.key === "custom" ? "My preset" : tpl.label.split(" (")[0],
    template: tpl.key, format: tpl.format, baseUrl: tpl.baseUrl, model: tpl.model, apiKey: "",
    order: all.presets.length ? Math.max(...all.presets.map((p) => p.order)) + 1 : 0, uses: 0, lastUsedAt: null, limitHitAt: null
  };
  all.presets.push(preset);
  await db.put("aiPresets", preset);
  if (!all.config.activeId) await saveConfig({ activeId: preset.id });
  return { ...preset };
}

export async function updatePreset(id, patch) {
  const all = await loadAll();
  const p = all.presets.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  await db.put("aiPresets", p);
}

export async function deletePreset(id) {
  const all = await loadAll();
  all.presets = all.presets.filter((x) => x.id !== id);
  await db.remove("aiPresets", id);
  if (all.config.activeId === id) await saveConfig({ activeId: all.presets[0]?.id || null });
}

/** Moves a preset up (−1) or down (+1) in the priority order. */
export async function movePreset(id, delta) {
  const all = await loadAll();
  const i = all.presets.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= all.presets.length) return;
  [all.presets[i], all.presets[j]] = [all.presets[j], all.presets[i]];
  all.presets.forEach((p, k) => { p.order = k; });
  await db.writeAll({ aiPresets: { put: all.presets.map((p) => ({ ...p })) } });
}

/** Removes every preset and key from this phone. */
export async function removeAllKeys() {
  const all = await loadAll();
  await db.writeAll({ aiPresets: { delete: all.presets.map((p) => p.id) } });
  all.presets = [];
  await saveConfig({ activeId: null });
}

/** Order to try presets in: the active one first, then by priority; ones that hit a limit recently go last. */
export function tryOrder(presets, config, now = Date.now()) {
  const usable = presets.filter((p) => p.apiKey && p.model && p.baseUrl);
  if (!usable.length) return [];
  const start = Math.max(0, usable.findIndex((p) => p.id === config.activeId));
  const rotated = usable.map((_, i) => usable[(start + i) % usable.length]);
  if (!config.fallback) return [rotated[0]];
  const fresh = rotated.filter((p) => !p.limitHitAt || now - p.limitHitAt > LIMIT_PAUSE_MS);
  return [...fresh, ...rotated.filter((p) => !fresh.includes(p))];
}

/** Only for tests: forget the in-memory copy. */
export function _reset() { cache = null; }
