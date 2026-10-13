/* 🔊 Read a question and its options aloud with the phone's own text-to-speech: free, works offline,
   nothing is sent anywhere (Malayalam needs the phone's Malayalam voice installed). */
import { t } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { letterFor } from "../../domain/text.js";
import * as store from "../../data/store.js";

/* Older versions could save { voice: "gemini", gemini, model } here; those keys are now ignored. */
export const speakSettings = () => { const r = store.setting("readAloud") || {}; return { rate: Number(r.rate) || 1, button: r.button !== false }; };

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

let playing = null; // { qid, stop() }
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

/* 🔊 buttons show which question is being read: [data-speak-q="<question id>"] gets "speaking". */
const mark = (qid, on) => document.querySelectorAll(`[data-speak-q="${CSS.escape(String(qid))}"]`).forEach((b) => { b.classList.toggle("speaking", on); b.setAttribute("aria-pressed", String(on)); });

/** Reads the question; tapping the same 🔊 again stops it (another question's 🔊 switches to that one). */
export function speakQuestion(q) {
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
  phoneSpeak(sp, s.rate, done, me);
}

// Leaving the screen stops the reading.
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { if (playing) { const o = playing.qid; stopSpeaking(); mark(o, false); } });
export const speakButtonOn = () => speakSettings().button;

