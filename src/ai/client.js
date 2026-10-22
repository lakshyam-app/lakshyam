/* Talks to the AI provider you set up. Two wire formats: OpenAI-compatible
   (Gemini, OpenRouter, Groq, OpenAI, DeepSeek, Mistral, custom) and Anthropic.
   Your key goes only in the request to that provider's address. */
import * as presets from "./presets.js";
import { tokensOf, rateOf } from "./usage.js";

const TIMEOUT_MS = 90000;

export class AiError extends Error {
  constructor(message, { status = 0, limit = false, busy = false, noPreset = false, allPaused = false, skipped = false, cancelled = false } = {}) {
    super(message);
    Object.assign(this, { status, limit, busy, noPreset, allPaused, skipped, cancelled });
  }
}

/** Splits a data: URL into its media type and base64 data. */
function dataUrlParts(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(url));
  if (!m) throw new AiError("bad-image");
  return { mediaType: m[1], data: m[2] };
}

export const creativeTask = (system, user) => /memory trick|mnemonic|motivational line|funny rhyme/i.test(`${system}\n${typeof user === "string" ? user : ""}`);

/* Which presets write Malayalam best: Gemini first, then Claude / GPT, then Gemma, then the rest (Groq, OpenRouter…). */
export function malayalamRank(p) {
  const base = String(p.baseUrl || ""); const model = String(p.model || "");
  if (/generativelanguage\.googleapis/i.test(base) && /gemini/i.test(model)) return 0;
  if (p.format === "anthropic" || /api\.openai\.com/i.test(base)) return 1;
  if (/gemma/i.test(model)) return 2;
  return 3;
}
/** A request whose answer is to be written in Malayalam (the app's Malayalam instructions are in it). */
export const writesMalayalam = (system, user) => /in Malayalam|മലയാളം:/.test(`${system}\n${typeof user === "string" ? user : ""}`);

/**
 * The order to ask presets in, after the usual one (your 🤖 preset first, then by priority, recently limited last):
 * - a Malayalam answer goes first to the presets that write Malayalam best (your choice stays first among equals);
 * - presets you have flagged 🚩 often (3+ flags and 1 in 20 of their answers) are tried after the others.
 * flagsOf(p) → number of flags. Pure, so it can be tested.
 */
export function smartOrder(order, { malayalam = false, flagsOf = () => 0, limitedIds = new Set() } = {}) {
  const often = (p) => { const f = flagsOf(p); return f >= 3 && f / Math.max(1, p.uses || 0) >= 0.05; };
  const first = order[0];
  return order.map((p, i) => ({ p, i })).sort((a, b) =>
    (limitedIds.has(a.p.id) - limitedIds.has(b.p.id))
    || (malayalam ? malayalamRank(a.p) - malayalamRank(b.p) : 0)
    || (!malayalam ? (b.p === first) - (a.p === first) : 0) // your 🤖 preset stays first (flags only reorder the others)
    || (often(a.p) - often(b.p))
    || a.i - b.i).map((x) => x.p);
}

/** Builds the HTTP request (pure, so it can be tested).
    images: page pictures as data: URLs (for reading scanned pages). */
export function buildRequest(preset, system, user, maxTokens = 2500, images = []) {
  const base = String(preset.baseUrl || "").replace(/\/+$/, "");
  if (preset.format === "anthropic") {
    const content = images.length
      ? [...images.map((u) => { const { mediaType, data } = dataUrlParts(u); return { type: "image", source: { type: "base64", media_type: mediaType, data } }; }), { type: "text", text: user }]
      : user;
    return {
      url: `${base}/v1/messages`,
      headers: { "content-type": "application/json", "x-api-key": preset.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: { model: preset.model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }
    };
  }
  const content = images.length ? [{ type: "text", text: user }, ...images.map((u) => { dataUrlParts(u); return { type: "image_url", image_url: { url: u } }; })] : user;
  // Reading a page must be faithful, so no creativity for images.
  // Facts: low creativity (fewer made-up details). Memory tricks and motivational lines: more. Reading a page: none.
  const body = { model: preset.model, max_tokens: maxTokens, temperature: images.length ? 0 : creativeTask(system, user) ? 0.7 : 0.2, messages: [{ role: "system", content: system }, { role: "user", content }] };
  if (/openrouter\.ai/i.test(base)) body.reasoning = { exclude: true };
  // Gemma on Google's API thinks at length before it answers (minutes for Malayalam): thinking is turned
  // down so answers come quickly. If a model doesn't take this setting, it is asked without it (see request).
  if (quickThinking(preset)) body.reasoning_effort = "minimal";
  return { url: `${base}/chat/completions`, headers: { "content-type": "application/json", authorization: `Bearer ${preset.apiKey}` }, body };
}

export const quickThinking = (p) => /generativelanguage\.googleapis/i.test(p.baseUrl || "") && /gemma/i.test(p.model || "") && !p.noEffort;

/** True when the reply stopped because it ran out of room (its JSON, say, is cut off). */
export function cutShort(format, data) {
  const why = format === "anthropic" ? data?.stop_reason : data?.choices?.[0]?.finish_reason;
  return /^(length|max_tokens|MAX_TOKENS)$/.test(String(why || ""));
}

/** Reads the text out of either format's reply. */
export function replyText(format, data) {
  let text = format === "anthropic"
    ? (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : data?.choices?.[0]?.message?.content || "";
  if (Array.isArray(text)) text = text.map((x) => x.text || "").join("\n");
  return stripThinking(String(text || ""));
}

/** Some models (e.g. Gemma, DeepSeek R1, Qwen) put their private reasoning in the reply as
    <thought>…</thought> or <think>…</think>. Only the answer after it is kept. */
export function stripThinking(text) {
  let s = String(text || "").replace(/<(thought|think|thinking)>[\s\S]*?<\/\1>/gi, "");
  // Reasoning left open (reply cut short): drop it only when it is at the very start.
  s = s.replace(/^\s*<(thought|think|thinking)>[\s\S]*$/i, "");
  return s.trim();
}

/** Sorts an HTTP failure into "limit reached" (try another preset), "busy" (retry once) or other. */
export function classify(status, message) {
  const limit = status === 429 || status === 402 || status === 529 || /quota|rate.?limit|exhaust|billing|credit|overload/i.test(message);
  const busy = !limit && ([500, 502, 503, 504].includes(status) || /high demand|unavailable|try again later|temporar/i.test(message));
  return { limit, busy };
}

/* OpenRouter routers (e.g. "openrouter/free", "openrouter/auto") pick a model for each request; the reply's
   "model" field says which one wrote it, so that is the name shown with what it made (and flagged). */
export function servedModel(preset, data) {
  const m = typeof data?.model === "string" ? data.model.trim() : "";
  return m && /openrouter\.ai/i.test(preset?.baseUrl || "") && m !== preset.model ? m.slice(0, 80) : "";
}

export async function request(preset, system, user, maxTokens = 2500, retried = false, images = [], signal = null, meta = null) {
  if (!preset.apiKey) throw new AiError("No API key", { status: 401 });
  if (!preset.model) throw new AiError("No model name", { status: 400 });
  if (signal?.aborted) throw new AiError("skipped", { skipped: true });
  const { url, headers, body } = buildRequest(preset, system, user, maxTokens, images);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const skip = () => ctrl.abort("skip");
  signal?.addEventListener("abort", skip);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (e) {
    if (signal?.aborted) throw new AiError("skipped", { skipped: true });
    throw new AiError(e.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", skip);
  }
  let raw = ""; let data = null;
  try { raw = await res.text(); data = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok) {
    const m = data?.error?.message || data?.error || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
    const message = (typeof m === "string" ? m : JSON.stringify(m)).slice(0, 240);
    // A model that doesn't take the "think less" setting: ask again without it, and don't send it again.
    if (res.status === 400 && quickThinking(preset) && /reason|effort|think/i.test(message)) {
      const { updatePreset } = await import("./presets.js");
      await updatePreset(preset.id, { noEffort: true });
      return request({ ...preset, noEffort: true }, system, user, maxTokens, retried, images, signal, meta);
    }
    throw new AiError(message, { status: res.status, ...classify(res.status, message) });
  }
  // Counted on this phone: one request and the tokens the reply says it used (+ what the provider says is left).
  if (preset.id) presets.recordUsage(preset.id, { tokens: tokensOf(data), rate: rateOf(res.headers) }).catch(() => {});
  if (meta) { meta.model = servedModel(preset, data); meta.cut = cutShort(preset.format, data); }
  const text = replyText(preset.format, data);
  if (!text) {
    // Reasoning models can spend the whole budget thinking: retry once with more room.
    if (!retried && maxTokens < 6000) return request(preset, system, user, Math.min(8000, Math.max(1500, maxTokens * 4)), true, images, signal, meta);
    throw new AiError("empty");
  }
  return text;
}

/** For page pictures, providers that read images well go first:
    Gemini (best with Malayalam), then Anthropic / OpenAI, then OpenRouter, then the rest. */
const VISION_RANK = { gemini: 0, anthropic: 1, openai: 1, openrouter: 2 };
export function visionOrder(order) {
  const rank = (p) => VISION_RANK[p.template] ?? (/generativelanguage\.googleapis/i.test(p.baseUrl) ? 0 : 3);
  return order.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/**
 * Asks, trying your presets in order. Returns { text, preset, switched }.
 * A preset that hits its limit is marked so it is tried last for an hour.
 * opts.images: page pictures (data: URLs). Image requests never change your active preset.
 */
/**
 * control (optional): lets the screen show who is answering and skip a slow AI.
 *   control.onTry(preset)  is called as each preset is asked;
 *   control.skip()         stops waiting for this one and asks the next;
 *   control.cancel()       stops altogether (throws { cancelled: true }).
 */
export function aiControl(onTry = null) {
  const c = { onTry, preset: null, startedAt: 0, ctrl: null, cancelled: false, left: 0 };
  c.skip = () => c.ctrl?.abort();
  c.cancel = () => { c.cancelled = true; c.ctrl?.abort(); };
  return c;
}

/* opts.maxFor(preset): a bigger reply budget for presets known to allow it (1.26.1: long timetables on
   Gemini, whose thinking counts against the budget). The reply says cut: true when it ran out of room. */
export async function ask(system, user, maxTokens = 2500, { images = [], control = null, maxFor = null } = {}) {
  let routed = false;
  const list = await presets.getPresets();
  const config = await presets.getConfig();
  let order = presets.tryOrder(list, config);
  if (!order.length) {
    const allPaused = list.some((p) => p.apiKey && p.model && p.baseUrl) && list.every((p) => !(p.apiKey && p.model && p.baseUrl) || presets.isPaused(p));
    throw new AiError(allPaused ? "all-paused" : "no-preset", { noPreset: true, allPaused });
  }
  if (images.length) order = visionOrder(order);
  else {
    const now = Date.now();
    const { presetFlags } = await import("./flags.js");
    const usual = order[0];
    const { setting } = await import("../data/store.js");
    order = smartOrder(order, { malayalam: setting("aiMlBest", true) !== false && writesMalayalam(system, user), flagsOf: (p) => { try { return presetFlags(p); } catch { return 0; } },
      limitedIds: new Set(order.filter((p) => p.limitHitAt && now - p.limitHitAt < 3600000).map((p) => p.id)) });
    routed = order[0] !== usual; // chosen for this request only: your 🤖 preset stays your choice
  }
  const errors = [];
  for (const [i, p] of order.entries()) {
    if (control?.cancelled) throw new AiError("cancelled", { cancelled: true });
    const sig = control ? (control.ctrl = new AbortController()).signal : null;
    if (control) { control.preset = p; control.startedAt = Date.now(); control.left = order.length - i - 1; control.onTry?.(p, control); }
    try {
      let text;
      const meta = {};
      const budget = (maxFor && maxFor(p)) || maxTokens;
      try { text = await request(p, system, user, budget, false, images, sig, meta); } catch (e) {
        if (!e.busy) throw e;
        await new Promise((r) => setTimeout(r, 3500));
        text = await request(p, system, user, budget, false, images, sig, meta);
      }
      await presets.updatePreset(p.id, { uses: (p.uses || 0) + 1, lastUsedAt: Date.now(), limitHitAt: null });
      // The model that actually wrote it (OpenRouter's routers): shown and saved as "made by" instead of the router's name.
      const used = meta.model ? { ...p, model: meta.model, routedBy: p.model } : p;
      const cut = Boolean(meta.cut);
      if (images.length) return { text, preset: used, switched: false, cut };
      // A paused active preset stays your choice: it is used again once the pause ends.
      const activePaused = list.some((x) => x.id === config.activeId && presets.isPaused(x));
      const switched = config.activeId !== p.id && !activePaused && !routed;
      if (switched) await presets.saveConfig({ activeId: p.id });
      return { text, preset: used, switched, cut };
    } catch (e) {
      if (control?.cancelled) throw new AiError("cancelled", { cancelled: true });
      errors.push(`${p.name}: ${e.skipped ? "skipped (took too long)" : e.message}${e.status ? ` (HTTP ${e.status})` : ""}`);
      if (e.limit) await presets.updatePreset(p.id, { limitHitAt: Date.now() });
    }
  }
  throw new AiError(errors.join("\n"));
}

/** Pulls the JSON out of a reply that may have extra words or code fences around it. */
export function parseJsonLoose(text) {
  let s = String(text).replace(/```(?:json)?/gi, "").trim();
  const a = s.search(/[[{]/);
  if (a < 0) throw new Error("no-json");
  const close = s[a] === "[" ? "]" : "}";
  const b = s.lastIndexOf(close);
  if (b <= a) throw new Error("incomplete-json");
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return JSON.parse(s.replace(/\\(?!["\\/bfnrtu])/g, "\\\\").replace(/,(\s*[}\]])/g, "$1")); }
}
