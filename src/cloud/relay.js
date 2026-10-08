/* Talks to your own backup script (Google Apps Script web app; see relay-script.js).
   No Google sign-in: the script runs as you, and the private code proves it's your app. */
import { gzip } from "./drive.js";

export class RelayError extends Error {
  constructor(kind, detail = "") { super(`${kind}${detail ? `: ${detail}` : ""}`); this.kind = kind; }
}

async function call(url, body) {
  if (!navigator.onLine) throw new RelayError("offline");
  let r;
  try {
    // text/plain keeps it a "simple" request (no CORS pre-check, which Apps Script can't answer).
    r = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" });
  } catch { throw new RelayError("unreachable"); }
  let j = null;
  try { j = await r.json(); } catch { throw new RelayError(r.status === 404 ? "notfound" : "notscript", String(r.status)); }
  if (!j.ok) throw new RelayError(j.error || "server", j.detail || "");
  return j;
}

/** Checks the address and code without sending any data. */
export const relayPing = (url, key) => call(url, { key, action: "ping" });

export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sends one backup (JSON text). props: phoneId, phone, questions, tests, app. */
export async function relayUpload(url, key, text, props) {
  const { blob, gz } = await gzip(text);
  if (!gz) throw new RelayError("nogzip");
  const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
  return call(url, { key, ...props, data });
}
