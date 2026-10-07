/* Talks to the AI provider you set up. Two wire formats: OpenAI-compatible
   (Gemini, OpenRouter, Groq, OpenAI, DeepSeek, Mistral, custom) and Anthropic.
   Your key goes only in the request to that provider's address. */
import * as presets from "./presets.js";

const TIMEOUT_MS = 90000;

export class AiError extends Error {
  constructor(message, { status = 0, limit = false, busy = false, noPreset = false } = {}) {
    super(message);
    Object.assign(this, { status, limit, busy, noPreset });
  }
}

/** Builds the HTTP request (pure, so it can be tested). */
export function buildRequest(preset, system, user, maxTokens = 2500) {
  const base = String(preset.baseUrl || "").replace(/\/+$/, "");
  if (preset.format === "anthropic") {
    return {
      url: `${base}/v1/messages`,
      headers: { "content-type": "application/json", "x-api-key": preset.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: { model: preset.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }
    };
  }
  const body = { model: preset.model, max_tokens: maxTokens, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  if (/openrouter\.ai/i.test(base)) body.reasoning = { exclude: true };
  return { url: `${base}/chat/completions`, headers: { "content-type": "application/json", authorization: `Bearer ${preset.apiKey}` }, body };
}

/** Reads the text out of either format's reply. */
export function replyText(format, data) {
  let text = format === "anthropic"
    ? (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : data?.choices?.[0]?.message?.content || "";
  if (Array.isArray(text)) text = text.map((x) => x.text || "").join("\n");
  return String(text || "").trim();
}

/** Sorts an HTTP failure into "limit reached" (try another preset), "busy" (retry once) or other. */
export function classify(status, message) {
  const limit = status === 429 || status === 402 || status === 529 || /quota|rate.?limit|exhaust|billing|credit|overload/i.test(message);
  const busy = !limit && ([500, 502, 503, 504].includes(status) || /high demand|unavailable|try again later|temporar/i.test(message));
  return { limit, busy };
}

export async function request(preset, system, user, maxTokens = 2500, retried = false) {
  if (!preset.apiKey) throw new AiError("No API key", { status: 401 });
  if (!preset.model) throw new AiError("No model name", { status: 400 });
  const { url, headers, body } = buildRequest(preset, system, user, maxTokens);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (e) {
    throw new AiError(e.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  let raw = ""; let data = null;
  try { raw = await res.text(); data = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok) {
    const m = data?.error?.message || data?.error || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
    const message = (typeof m === "string" ? m : JSON.stringify(m)).slice(0, 240);
    throw new AiError(message, { status: res.status, ...classify(res.status, message) });
  }
  const text = replyText(preset.format, data);
  if (!text) {
    // Reasoning models can spend the whole budget thinking: retry once with more room.
    if (!retried && maxTokens < 6000) return request(preset, system, user, Math.min(8000, Math.max(1500, maxTokens * 4)), true);
    throw new AiError("empty");
  }
  return text;
}

/**
 * Asks, trying your presets in order. Returns { text, preset }.
 * A preset that hits its limit is marked so it is tried last for an hour.
 */
export async function ask(system, user, maxTokens = 2500) {
  const list = await presets.getPresets();
  const config = await presets.getConfig();
  const order = presets.tryOrder(list, config);
  if (!order.length) throw new AiError("no-preset", { noPreset: true });
  const errors = [];
  for (const p of order) {
    try {
      let text;
      try { text = await request(p, system, user, maxTokens); } catch (e) {
        if (!e.busy) throw e;
        await new Promise((r) => setTimeout(r, 3500));
        text = await request(p, system, user, maxTokens);
      }
      await presets.updatePreset(p.id, { uses: (p.uses || 0) + 1, lastUsedAt: Date.now(), limitHitAt: null });
      const switched = config.activeId !== p.id;
      if (switched) await presets.saveConfig({ activeId: p.id });
      return { text, preset: p, switched };
    } catch (e) {
      errors.push(`${p.name}: ${e.message}${e.status ? ` (HTTP ${e.status})` : ""}`);
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
