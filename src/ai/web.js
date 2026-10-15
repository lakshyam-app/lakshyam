/* Asking AI with a web search, for things that must come from trustworthy sources.
   Only two kinds of preset can search the web here, both with your own key:
   - Google Gemini: "Grounding with Google Search" (the sources come back as links);
   - Groq with an openai/gpt-oss model: its built-in browser search.
   Other presets can't search; the caller then says so and offers the AI's own knowledge instead.
   The rules for which sites to trust are in the prompt (prompts.js WEB_RULES), and every source that
   comes back is also checked here against a list of trusted sites, so you can see which to double-check. */
import * as presets from "./presets.js";
import { AiError, stripThinking } from "./client.js";

const TIMEOUT_MS = 120000;
const GEMINI = /generativelanguage\.googleapis\.com/i;
const GROQ = /api\.groq\.com/i;

export const canSearch = (p) => Boolean(p?.apiKey && p.model && p.baseUrl && ((GEMINI.test(p.baseUrl)) || (GROQ.test(p.baseUrl) && /gpt-oss/i.test(p.model))));

const WEB_PAUSE_MS = 3600000; // a key whose web-search limit was hit is tried last for an hour

/** Every preset that can search, in the order to try them: the one in use first (🤖 at the top), then by priority;
    ones whose web-search limit was hit in the last hour go last. (Google keeps a separate, smaller limit for
    searches, so a key can still answer normally after its search limit is reached: that is tracked apart.) */
export async function webOrder(now = Date.now()) {
  const [list, cfg] = await Promise.all([presets.getPresets(), presets.getConfig()]);
  const all = presets.tryOrder(list, { ...cfg, fallback: true }, now).filter(canSearch);
  const fresh = all.filter((p) => !p.webLimitAt || now - p.webLimitAt > WEB_PAUSE_MS);
  return [...fresh, ...all.filter((p) => !fresh.includes(p))];
}
/** The preset that will be tried first, or null when none can search. */
export async function webPreset() { return (await webOrder())[0] || null; }

/* Sites a PSC aspirant can rely on. "fair": fine to cross-check with. Everything else: check yourself. */
const TRUSTED = [/\.gov\.in$/, /\.nic\.in$/, /^gov\.in$/, /\.ac\.in$/, /\.edu$/, /(^|\.)britannica\.com$/, /(^|\.)thehindu\.com$/, /(^|\.)indianexpress\.com$/,
  /(^|\.)prsindia\.org$/, /(^|\.)rbi\.org\.in$/, /(^|\.)sebi\.gov\.in$/, /(^|\.)un\.org$/, /(^|\.)who\.int$/, /(^|\.)unesco\.org$/, /(^|\.)ncert\.nic\.in$/, /(^|\.)keralapsc\.gov\.in$/];
const FAIR = [/(^|\.)wikipedia\.org$/, /(^|\.)ncert\.org\.in$/, /(^|\.)pib\.gov\.in$/];
export function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return String(url || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0]; }
}
export function trustOf(domain) {
  const d = String(domain || "").toLowerCase().replace(/^www\./, "");
  if (TRUSTED.some((re) => re.test(d))) return "trusted";
  if (FAIR.some((re) => re.test(d))) return "fair";
  return "check";
}

/** Sources listed by the AI at the end ("SOURCES:" then "- [n] title — url"). The text without that list. */
export function splitSources(text) {
  const s = String(text || "");
  const at = s.search(/^\s*\**SOURCES:?\**\s*$/im);
  const body = at >= 0 ? s.slice(0, at).trim() : s.trim();
  const list = [];
  if (at >= 0) {
    s.slice(at).split("\n").slice(1).forEach((line) => {
      const m = /^\s*[-•*]?\s*\[?(\d+)?\]?\s*(.*?)\s*(?:[—–-]+\s*)?(https?:\/\/\S+)\s*$/.exec(line);
      if (m) list.push({ n: m[1] ? Number(m[1]) : list.length + 1, title: m[2].replace(/[—–-]\s*$/, "").trim(), url: m[3].replace(/[).,]+$/, "") });
    });
  }
  return { body, sources: list };
}

const withTrust = (list) => list.map((x) => { const domain = x.domain || domainOf(x.url); return { ...x, domain, trust: trustOf(domain) }; });

async function post(url, headers, body, signal = null) {
  if (signal?.aborted) throw new AiError("skipped", { skipped: true });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const skip = () => ctrl.abort();
  signal?.addEventListener("abort", skip);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (e) {
    if (signal?.aborted) throw new AiError("skipped", { skipped: true });
    throw new AiError(e.name === "AbortError" ? "timeout" : "network");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", skip); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let m = data?.error?.message || data?.message || `HTTP ${res.status}`;
    m = String(typeof m === "string" ? m : JSON.stringify(m)).split(/\.\s+For more information/i)[0].slice(0, 200);
    const q = quotaOf(data);
    if (q) m += ` [${q}]`;
    const limit = res.status === 429 || res.status === 402 || /quota|rate.?limit|exhaust|billing/i.test(m);
    throw new AiError(m, { status: res.status, limit, busy: !limit && [500, 502, 503, 504].includes(res.status) });
  }
  return data;
}

/** Google says which limit was hit (e.g. "…SearchGrounding…PerDay…FreeTier, limit 0"). Shown so you can tell. */
export function quotaOf(data) {
  const v = (data?.error?.details || []).flatMap((d) => d?.violations || []).find((x) => x?.quotaId || x?.quotaMetric);
  if (!v) return "";
  const name = String(v.quotaId || v.quotaMetric).replace(/^.*\//, "");
  return v.quotaValue !== undefined ? `${name}, limit ${v.quotaValue}` : name;
}

/** The answer only: models that think (e.g. Gemma 4) send their planning as parts marked "thought". */
export function answerParts(parts) { return (parts || []).filter((x) => !x.thought).map((x) => x.text || "").join(""); }

async function geminiSearch(p, system, user, maxTokens, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`;
  const headers = { "content-type": "application/json", "x-goog-api-key": p.apiKey };
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: maxTokens } };
  // Gemma writes out its planning unless thinking is turned down; if a model doesn't take that setting, ask without it.
  const gemma = /gemma/i.test(p.model);
  let data;
  if (gemma) {
    try { data = await post(url, headers, { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: "minimal" } } }, signal); } catch (e) {
      if (e.status !== 400) throw e;
    }
  }
  if (!data) data = await post(url, headers, body, signal);
  const cand = data?.candidates?.[0];
  const text = answerParts(cand?.content?.parts);
  const meta = cand?.groundingMetadata || {};
  // Google gives each page as a link through Google plus the site's name (title).
  const found = (meta.groundingChunks || []).map((c, i) => c.web && { n: i + 1, url: c.web.uri, title: c.web.title || "", domain: domainOf(c.web.title?.includes(".") ? `https://${c.web.title}` : c.web.uri) }).filter(Boolean);
  return { text, found, queries: meta.webSearchQueries || [] };
}

async function groqSearch(p, system, user, maxTokens, signal) {
  const base = String(p.baseUrl).replace(/\/+$/, "");
  const data = await post(`${base}/chat/completions`, { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` }, {
    model: p.model, max_completion_tokens: maxTokens, reasoning_effort: "low",
    messages: [{ role: "system", content: system }, { role: "user", content: `${user}\n\nWrite your final answer after a line '=== ANSWER ===' (nothing from the search pages before it is shown).` }],
    tools: [{ type: "browser_search" }], tool_choice: "required"
  }, signal);
  let text = String(data?.choices?.[0]?.message?.content || "");
  const at = text.lastIndexOf("=== ANSWER ===");
  if (at >= 0) text = text.slice(at + "=== ANSWER ===".length);
  return { text: text.replace(/【[^】]*】/g, ""), found: [], queries: [] };
}

/**
 * Asks with a web search. → { text, sources: [{ n, url, title, domain, trust }], queries, preset, by }
 * Throws { noWeb: true } when no preset can search. Sources: from Google when it gives them, else the AI's own list.
 */
export async function askWeb(system, user, maxTokens = 3000, { onTry, control = null } = {}) {
  const order = await webOrder();
  if (!order.length) throw new AiError("no-web", { noWeb: true });
  const errors = []; let allLimit = true;
  for (const [i, p] of order.entries()) {
    if (control?.cancelled) throw new AiError("cancelled", { cancelled: true });
    const sig = control ? (control.ctrl = new AbortController()).signal : null;
    if (control) { control.preset = p; control.startedAt = Date.now(); control.left = order.length - i - 1; control.onTry?.(p, control); }
    onTry?.(p);
    try {
      let r;
      const once = () => (GEMINI.test(p.baseUrl) ? geminiSearch(p, system, user, maxTokens, sig) : groqSearch(p, system, user, maxTokens, sig));
      try { r = await once(); } catch (e) { if (!e.busy) throw e; await new Promise((ok) => setTimeout(ok, 3500)); r = await once(); }
      const clean = stripThinking(r.text);
      if (!clean) throw new AiError("empty");
      await presets.updatePreset(p.id, { uses: (p.uses || 0) + 1, lastUsedAt: Date.now(), webLimitAt: null });
      return finish(r, clean, p);
    } catch (e) {
      if (control?.cancelled) throw new AiError("cancelled", { cancelled: true });
      errors.push(`${p.name}: ${e.skipped ? "skipped (took too long)" : e.message}${e.status ? ` (HTTP ${e.status})` : ""}`);
      if (e.limit) await presets.updatePreset(p.id, { webLimitAt: Date.now() }); else allLimit = false;
    }
  }
  const err = new AiError(errors.join("\n"), { limit: allLimit });
  err.webFailed = true;
  throw err;
}

function finish(r, clean, p) {
  const { body, sources } = splitSources(clean);
  // With Google's own list of the pages it searched, the AI's numbered citations would not match it: they are dropped.
  const text = r.found.length ? body.replace(/\s?\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "") : body;
  return { text, sources: withTrust(r.found.length ? r.found : sources), listed: withTrust(sources), queries: r.queries, preset: p, by: p.model || p.name };
}
