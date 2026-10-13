/* 🔊 Read a question and its options aloud.
   - Phone voice (default): the phone's own text-to-speech; free, works offline (Malayalam needs the
     phone's Malayalam voice installed).
   - Natural voice (optional): Google Gemini's speech model with your own Gemini key from Settings → AI.
     Only the question text goes to Google; each reading uses your Gemini quota (kept for the session,
     so the same question isn't fetched twice). If it fails, the phone voice reads instead. */
import { t } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";
import * as presets from "../../ai/presets.js";

export const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
export const TTS_VOICES = ["Kore", "Puck", "Charon", "Aoede", "Leda", "Orus", "Zephyr", "Sulafat"];
export const speakSettings = () => ({ voice: "phone", gemini: TTS_VOICES[0], model: TTS_MODELS[0], rate: 1, ...(store.setting("readAloud") || {}) });

const isMl = (s) => /[ഀ-ൿ]/.test(s);
/** Plain words to read: no **, $, \frac… or markdown bullets. */
export function speakable(s) {
  return String(s ?? "")
    .replace(/\$\$?([^$]+)\$\$?/g, " $1 ").replace(/\\(?:frac)\{([^}]*)\}\{([^}]*)\}/g, " $1 by $2 ")
    .replace(/\\[a-zA-Z]+/g, " ").replace(/[{}^_]/g, " ")
    .replace(/\*\*|__|`/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s+/g, " ").trim();
}
export function questionSpeech(q) {
  const ml = q.lang === "ml" || isMl(q.text);
  const opt = ml ? "ഓപ്ഷൻ" : "Option";
  return { text: `${speakable(q.text)}\n${q.options.map((o, i) => `${opt} ${letterFor(i)}. ${speakable(o)}.`).join("\n")}`, lang: ml ? "ml-IN" : "en-IN" };
}

let playing = null; // { stop() }
const cache = new Map(); // text → object URL (this session)
export const isSpeaking = () => Boolean(playing);
export function stopSpeaking() { const p = playing; playing = null; try { p?.stop(); } catch { /* ignore */ } }

function phoneSpeak({ text, lang }, rate, onEnd, me) {
  if (!("speechSynthesis" in window)) { toast(t("speak.noVoice")); onEnd(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  const base = lang.slice(0, 2);
  const voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.toLowerCase().startsWith(base)) || null;
  if (base === "ml" && !voice && voices.length) toast(t("speak.noMlVoice"));
  // Long text is read in parts (some phones stop after ~15 s of one utterance).
  const parts = text.split("\n").filter(Boolean);
  let i = 0; let stopped = false;
  const next = () => {
    if (stopped || i >= parts.length) { if (!stopped) onEnd(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = voice?.lang || lang; if (voice) u.voice = voice; u.rate = rate;
    u.onend = next; u.onerror = () => { if (!stopped) onEnd(); };
    synth.speak(u);
  };
  me.stop = () => { stopped = true; synth.cancel(); };
  next();
}

/** 16-bit mono PCM (24 kHz) → a WAV file the phone can play. */
export function pcmToWav(bytes, rate = 24000) {
  const head = new ArrayBuffer(44); const v = new DataView(head);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + bytes.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, bytes.length, true);
  return new Blob([head, bytes], { type: "audio/wav" });
}

async function geminiKey() {
  const list = await presets.getPresets();
  return list.find((p) => p.apiKey && /generativelanguage\.googleapis\.com/.test(p.baseUrl || "") && !presets.isPaused(p))?.apiKey || null;
}

async function geminiAudio(text, s) {
  const key = await geminiKey();
  if (!key) throw new Error(t("speak.noGemini"));
  const models = [s.model, ...TTS_MODELS.filter((m) => m !== s.model)];
  let last = null;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Read this exam question and its options aloud, clearly and at a calm pace:\n${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.gemini } } } } })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { last = new Error(`${data?.error?.message || `HTTP ${res.status}`}`.slice(0, 200)); if (res.status === 404 || res.status === 400) continue; throw last; }
    const part = data?.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
    if (!part) { last = new Error(t("speak.noAudio")); continue; }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1]) || 24000;
    const bin = atob(part.inlineData.data); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(pcmToWav(bytes, rate));
  }
  throw last || new Error(t("speak.noAudio"));
}

/* 🔊 buttons show which question is being read: [data-speak-q="<question id>"] gets "speaking". */
const mark = (qid, on) => document.querySelectorAll(`[data-speak-q="${CSS.escape(String(qid))}"]`).forEach((b) => { b.classList.toggle("speaking", on); b.setAttribute("aria-pressed", String(on)); });

/** Reads the question; tapping the same 🔊 again stops it (another question's 🔊 switches to that one). */
export async function speakQuestion(q) {
  if (playing) {
    const same = playing.qid === q.id;
    const old = playing.qid;
    stopSpeaking(); mark(old, false);
    if (same) return;
  }
  const s = speakSettings();
  const sp = questionSpeech(q);
  const me = { qid: q.id, stop: () => {} };
  const done = () => { if (playing === me) playing = null; mark(q.id, false); };
  playing = me; mark(q.id, true);
  if (s.voice === "gemini") {
    let stopped = false;
    me.stop = () => { stopped = true; };
    try {
      let url = cache.get(sp.text);
      if (!url) { url = await geminiAudio(sp.text, s); cache.set(sp.text, url); if (cache.size > 30) { const k = cache.keys().next().value; URL.revokeObjectURL(cache.get(k)); cache.delete(k); } }
      if (stopped) return;
      const audio = new Audio(url);
      audio.playbackRate = s.rate;
      me.stop = () => { audio.pause(); };
      audio.onended = done; audio.onerror = done;
      await audio.play();
      return;
    } catch (e) {
      if (stopped) return;
      toast(t("speak.geminiFailed", { why: String(e.message || e).slice(0, 120) }));
    }
  }
  phoneSpeak(sp, s.rate, done, me);
}

// Leaving the screen stops the reading.
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { if (playing) { const o = playing.qid; stopSpeaking(); mark(o, false); } });
export const speakButtonOn = () => speakSettings().button !== false;

