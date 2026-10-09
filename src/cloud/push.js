/* Reminders: this phone's push keys, Chrome's push subscription, and the calls to your own
   reminder script (push-script.js). The script gets only the times; the reminders are written
   on the phone. */
import { RelayError } from "./relay.js";

export { RelayError };

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));

export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const permission = () => (("Notification" in window) ? Notification.permission : "unsupported");

/** A new push key pair for this phone (P-256). The private part goes only into your script. */
export async function newVapid() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { d: jwk.d, x: jwk.x, y: jwk.y, pub: b64u(raw) };
}

/** A private code for requests to the script. */
export function newKey() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return b64u(b);
}

async function call(url, body) {
  if (!navigator.onLine) throw new RelayError("offline");
  let r;
  try {
    r = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" });
  } catch { throw new RelayError("unreachable"); }
  let j = null;
  try { j = await r.json(); } catch { throw new RelayError(r.status === 404 ? "notfound" : "notscript", String(r.status)); }
  if (!j.ok) throw new RelayError(j.error || "server", j.detail || "");
  return j;
}

export const ping = (cfg) => call(cfg.url, { key: cfg.key, action: "ping" });
export const sendPlan = (cfg, times) => call(cfg.url, { key: cfg.key, action: "plan", times });
export const stop = (cfg) => call(cfg.url, { key: cfg.key, action: "stop" });
export const pushNow = (cfg) => call(cfg.url, { key: cfg.key, action: "push-now" });

/** Checks your script can sign wake-ups (its signature must verify with this phone's public key). */
export async function checkSigning(cfg) {
  const { jwt } = await call(cfg.url, { key: cfg.key, action: "test" });
  const [h, c, s] = String(jwt || "").split(".");
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: cfg.vapid.x, y: cfg.vapid.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64u(s), new TextEncoder().encode(`${h}.${c}`));
  if (!ok) throw new RelayError("signing");
}

/** Asks for notification permission (from a tap) and subscribes this phone; sends the address to the script. */
export async function subscribe(cfg) {
  const p = await Notification.requestPermission();
  if (p !== "granted") throw new RelayError(p === "denied" ? "blocked" : "notallowed");
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  // A subscription made with another key can't be reused.
  if (old && b64u(old.options?.applicationServerKey || new ArrayBuffer(0)) !== cfg.vapid.pub) await old.unsubscribe();
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(cfg.vapid.pub) });
  await call(cfg.url, { key: cfg.key, action: "subscribe", endpoint: sub.endpoint });
  return sub.endpoint;
}

export async function unsubscribe() {
  try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch { /* fine */ }
}
