/* The "reminders" script you add to YOUR Google account (Google Apps Script), separate from
   the backup script. It wakes Lakshyam on your phone at the times the app gives it, so the app
   can show a reminder. What it knows, by design:
   - only TIMES (when to wake the app) and your phone's push address. No topics, questions,
     scores or any other study data: the app writes each reminder itself, on the phone.
   - sends an EMPTY push (no content), signed with this phone's private push key (standard
     Web Push "VAPID", ES256). It can't read or send anything else.
   - permissions: connect to the push service, and run itself every 5 minutes.
   The app fills in your private codes (see pushScriptFor). */

export const PUSH_SCRIPT_VERSION = 1;

export const PUSH_MANIFEST = `{
  "timeZone": "Asia/Kolkata",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": ["https://www.googleapis.com/auth/script.external_request", "https://www.googleapis.com/auth/script.scriptapp"],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}`;

const SAFE = /^[A-Za-z0-9_-]+$/;

/** vapid: { d, pub } (base64url). key: the private code for requests. subject: an https: or mailto: contact. */
export function pushScriptFor({ key, vapid, subject = "https://lakshyam-app.github.io/lakshyam/" }) {
  if (!SAFE.test(key || "") || key.length < 32) throw new Error("bad-key");
  if (!SAFE.test(vapid?.d || "") || !SAFE.test(vapid?.pub || "")) throw new Error("bad-vapid");
  if (!/^(https:\/\/|mailto:)[^"\\\s]+$/.test(subject)) throw new Error("bad-subject");
  return `/**
 * Lakshyam reminders (version ${PUSH_SCRIPT_VERSION}). Runs in YOUR Google account.
 * It only wakes Lakshyam on your phone at the times the app sends; it never gets your study data.
 * Keep this code private: KEY and PUSH_KEY_D work like passwords.
 * After pasting: choose "setup" in the toolbar and press Run once, then deploy as a web app.
 */
const KEY = "${key}";
const PUSH_KEY_D = "${vapid.d}";
const PUSH_KEY_PUBLIC = "${vapid.pub}";
const SUBJECT = "${subject}";
const MAX_TIMES = 400;
const EARLY_MS = 150000;   // a wake-up may go up to 2.5 minutes early
const LATE_MS = 20 * 60000; // and is dropped if more than 20 minutes late

function doGet() { return reply({ ok: true }); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!same(String(body.key || ""), KEY)) return reply({ ok: false, error: "key" });
    const props = PropertiesService.getScriptProperties();
    if (body.action === "ping") return reply({ ok: true, version: ${PUSH_SCRIPT_VERSION}, timer: hasTimer(), subscribed: Boolean(props.getProperty("endpoint")) && !props.getProperty("gone") });
    if (body.action === "subscribe") {
      const ep = String(body.endpoint || "");
      if (!/^https:\\/\\/[^\\s"']{10,800}$/.test(ep)) return reply({ ok: false, error: "endpoint" });
      props.setProperty("endpoint", ep); props.deleteProperty("gone");
      return reply({ ok: true });
    }
    if (body.action === "plan") {
      const now = Date.now();
      const times = (Array.isArray(body.times) ? body.times : []).map(Number)
        .filter(function (t) { return isFinite(t) && t > now - LATE_MS && t < now + 15 * 86400000; })
        .sort(function (a, b) { return a - b; }).slice(0, MAX_TIMES);
      props.setProperty("times", JSON.stringify(times));
      return reply({ ok: true, n: times.length, timer: hasTimer() });
    }
    if (body.action === "test") {
      // Signs a sample so the app can check the signing works here (no push is sent).
      return reply({ ok: true, jwt: vapidJwt("https://example.com", Math.floor(Date.now() / 1000) + 600) });
    }
    if (body.action === "push-now") {
      const r = pushOnce(props.getProperty("endpoint"));
      if (r === 404 || r === 410) props.setProperty("gone", "1");
      return reply(r === 201 || r === 200 ? { ok: true, status: r } : { ok: false, error: "push", detail: String(r) });
    }
    if (body.action === "stop") { props.deleteProperty("times"); return reply({ ok: true }); }
    return reply({ ok: false, error: "action" });
  } catch (err) {
    return reply({ ok: false, error: "server", detail: String(err).slice(0, 200) });
  }
}

/** Run this once from the editor: it creates the 5-minute timer (and asks for permission). */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "tick") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("tick").timeBased().everyMinutes(5).create();
  vapidJwt("https://example.com", Math.floor(Date.now() / 1000) + 600); // checks signing works
  return "Lakshyam reminders: timer set up.";
}

function hasTimer() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "tick"; });
}

/** Every 5 minutes: wakes the phone for each time that is due. */
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const ep = props.getProperty("endpoint");
    const times = JSON.parse(props.getProperty("times") || "[]");
    if (!ep || props.getProperty("gone") || !times.length) return;
    const now = Date.now();
    const due = times.filter(function (t) { return t <= now + EARLY_MS; });
    const keep = times.filter(function (t) { return t > now + EARLY_MS; });
    let sent = 0;
    due.forEach(function (t) {
      if (t < now - LATE_MS || sent >= 3) return; // too late, or several at once: the app covers them in one
      const r = pushOnce(ep);
      if (r === 404 || r === 410) props.setProperty("gone", "1"); // the phone's push address no longer exists
      sent++;
    });
    props.setProperty("times", JSON.stringify(keep));
  } finally { lock.releaseLock(); }
}

function pushOnce(endpoint) {
  if (!endpoint) return 0;
  const aud = endpoint.match(/^https:\\/\\/[^/]+/)[0];
  const jwt = vapidJwt(aud, Math.floor(Date.now() / 1000) + 12 * 3600);
  const r = UrlFetchApp.fetch(endpoint, {
    method: "post", muteHttpExceptions: true, payload: "",
    headers: { Authorization: "vapid t=" + jwt + ", k=" + PUSH_KEY_PUBLIC, TTL: "1800", Urgency: "high" }
  });
  return r.getResponseCode();
}

/* ---------- VAPID: a JWT signed with ES256 (ECDSA P-256, SHA-256, RFC 6979 nonce) ---------- */

function vapidJwt(aud, exp) {
  const head = b64u(bytesOf(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(bytesOf(JSON.stringify({ aud: aud, exp: exp, sub: SUBJECT })));
  const input = head + "." + claims;
  return input + "." + b64u(es256(bytesOf(input)));
}

const P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const GX = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
const GY = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");

function mod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function inv(a, m) { // modular inverse (extended Euclid)
  let lo = 1n, hi = 0n, low = mod(a, m), high = m;
  while (low > 1n) { const q = high / low; const nm = hi - lo * q; const nw = high - low * q; hi = lo; high = low; lo = nm; low = nw; }
  return mod(lo, m);
}
// Jacobian coordinates [X, Y, Z]; curve a = -3.
function dbl(p) {
  if (p[1] === 0n || p[2] === 0n) return [0n, 1n, 0n];
  const X = p[0], Y = p[1], Z = p[2];
  const d = mod(Y * Y, P), z2 = mod(Z * Z, P);
  const s = mod(4n * X * d, P);
  const m = mod(3n * (X - z2) * (X + z2), P);
  const x3 = mod(m * m - 2n * s, P);
  const y3 = mod(m * (s - x3) - 8n * d * d, P);
  const z3 = mod(2n * Y * Z, P);
  return [x3, y3, z3];
}
function add(p, q) {
  if (p[2] === 0n) return q; if (q[2] === 0n) return p;
  const z1 = mod(p[2] * p[2], P), z2 = mod(q[2] * q[2], P);
  const u1 = mod(p[0] * z2, P), u2 = mod(q[0] * z1, P);
  const s1 = mod(p[1] * z2 * q[2], P), s2 = mod(q[1] * z1 * p[2], P);
  if (u1 === u2) return s1 === s2 ? dbl(p) : [0n, 1n, 0n];
  const h = mod(u2 - u1, P), r = mod(s2 - s1, P);
  const h2 = mod(h * h, P), h3 = mod(h2 * h, P);
  const x3 = mod(r * r - h3 - 2n * u1 * h2, P);
  const y3 = mod(r * (u1 * h2 - x3) - s1 * h3, P);
  const z3 = mod(h * p[2] * q[2], P);
  return [x3, y3, z3];
}
function mulG(k) {
  let r = [0n, 1n, 0n], a = [GX, GY, 1n];
  while (k > 0n) { if (k & 1n) r = add(r, a); a = dbl(a); k >>= 1n; }
  const zi = inv(r[2], P), zi2 = mod(zi * zi, P);
  return [mod(r[0] * zi2, P), mod(r[1] * zi2 * zi, P)];
}
function toInt(bytes) { let x = 0n; for (let i = 0; i < bytes.length; i++) x = (x << 8n) | BigInt(bytes[i] & 255); return x; }
function toBytes(x, len) { const out = []; for (let i = len - 1; i >= 0; i--) out[i] = Number(x & 255n), x >>= 8n; return out; }
function sha256(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed(bytes)).map(function (b) { return b & 255; }); }
function hmac(key, bytes) { return Utilities.computeHmacSha256Signature(signed(bytes), signed(key)).map(function (b) { return b & 255; }); }
function signed(bytes) { return bytes.map(function (b) { b &= 255; return b > 127 ? b - 256 : b; }); }

function es256(msg) {
  const d = toInt(b64uDecode(PUSH_KEY_D));
  const h = sha256(msg);
  const e = mod(toInt(h), N);
  // RFC 6979 deterministic nonce (no random number generator needed).
  const x = toBytes(d, 32), h1 = toBytes(e, 32);
  let V = []; for (let i = 0; i < 32; i++) V.push(1);
  let K = []; for (let i = 0; i < 32; i++) K.push(0);
  K = hmac(K, V.concat([0], x, h1)); V = hmac(K, V);
  K = hmac(K, V.concat([1], x, h1)); V = hmac(K, V);
  for (;;) {
    V = hmac(K, V);
    const k = toInt(V);
    if (k > 0n && k < N) {
      const r = mod(mulG(k)[0], N);
      const s = mod(inv(k, N) * (e + r * d), N);
      if (r !== 0n && s !== 0n) return toBytes(r, 32).concat(toBytes(s, 32));
    }
    K = hmac(K, V.concat([0])); V = hmac(K, V);
  }
}

function bytesOf(text) { return Utilities.newBlob(text).getBytes().map(function (b) { return b & 255; }); }
function b64u(bytes) { return Utilities.base64EncodeWebSafe(signed(bytes)).replace(/=+$/, ""); }
function b64uDecode(s) { return Utilities.base64DecodeWebSafe(s + "===".slice((s.length + 3) % 4)).map(function (b) { return b & 255; }); }

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
`;
}

export const isPushScriptUrl = (u) => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(String(u || "").trim());
