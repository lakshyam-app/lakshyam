import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash, createHmac, generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { pushScriptFor, PUSH_MANIFEST } from "../src/cloud/push-script.js";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
function keys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const j = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]);
  return { d: j.d, pub: b64u(pub), jwk: { kty: "EC", crv: "P-256", x: j.x, y: j.y } };
}
const signedArr = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));

/** Runs the generated script with stand-ins for Google's services. */
function load(src, { now = Date.now() } = {}) {
  const props = new Map(); const fetches = []; const triggers = [];
  const ctx = {
    BigInt, Date: class extends Date { static now() { return ctx.__now; } }, __now: now, JSON, Math, Number, Array, String, isFinite, Boolean,
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_a, bytes) => signedArr(createHash("sha256").update(Buffer.from(bytes.map((b) => b & 255))).digest()),
      computeHmacSha256Signature: (v, k) => signedArr(createHmac("sha256", Buffer.from(k.map((b) => b & 255))).update(Buffer.from(v.map((b) => b & 255))).digest()),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      base64DecodeWebSafe: (s) => signedArr(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
      newBlob: (text) => ({ getBytes: () => signedArr(Buffer.from(text, "utf8")) })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1), newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => triggers.push({ fn, m, getHandlerFunction: () => fn }) }) }) }) },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); return { getResponseCode: () => ctx.__status || 201 }; } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return { ctx, props, fetches, triggers, post };
}

function checkJwt(jwt, jwk, aud) {
  const [h, c, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(Buffer.from(c, "base64url"));
  assert.equal(claims.aud, aud);
  const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
  assert.ok(ok, "signature verifies");
  return claims;
}

const KEY = "k".repeat(40);

test("signatures made by the script verify with standard crypto (many keys)", () => {
  for (let i = 0; i < 8; i++) {
    const k = keys();
    const s = load(pushScriptFor({ key: KEY, vapid: k }));
    const r = s.post({ key: KEY, action: "test" });
    assert.equal(r.ok, true);
    checkJwt(r.jwt, k.jwk, "https://example.com");
  }
});

test("wrong code refused; setup makes one 5-minute timer", () => {
  const k = keys(); const s = load(pushScriptFor({ key: KEY, vapid: k }));
  assert.equal(s.post({ key: "nope", action: "ping" }).error, "key");
  s.ctx.setup(); s.ctx.setup();
  assert.equal(s.triggers.length, 1); assert.equal(s.triggers[0].m, 5);
  assert.equal(s.post({ key: KEY, action: "ping" }).timer, true);
});

test("plan + tick: due times wake the phone once, signed for the push service", () => {
  const k = keys(); const now = Date.UTC(2026, 9, 9, 6, 0);
  const s = load(pushScriptFor({ key: KEY, vapid: k }), { now });
  assert.equal(s.post({ key: KEY, action: "subscribe", endpoint: "https://fcm.googleapis.com/fcm/send/abc123xyz" }).ok, true);
  const r = s.post({ key: KEY, action: "plan", times: [now - 3600000, now + 60000, now + 30 * 60000, "junk"] });
  assert.equal(r.n, 2); // the hour-old one is dropped
  s.ctx.tick();
  assert.equal(s.fetches.length, 1);
  const f = s.fetches[0];
  assert.equal(f.url, "https://fcm.googleapis.com/fcm/send/abc123xyz");
  assert.equal(f.o.payload, ""); // no content ever leaves your account
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(f.o.headers.Authorization);
  assert.equal(m[2], k.pub);
  const claims = checkJwt(m[1], k.jwk, "https://fcm.googleapis.com");
  assert.ok(claims.exp > now / 1000 && claims.exp <= now / 1000 + 24 * 3600);
  assert.equal(f.o.headers.TTL, "1800");
  s.ctx.tick(); assert.equal(s.fetches.length, 1); // not twice
  s.ctx.__now = now + 31 * 60000; s.ctx.tick(); assert.equal(s.fetches.length, 2);
});

test("a gone push address stops wake-ups; manifest asks only for push + timer", () => {
  const k = keys(); const now = Date.now();
  const s = load(pushScriptFor({ key: KEY, vapid: k }), { now });
  s.post({ key: KEY, action: "subscribe", endpoint: "https://fcm.googleapis.com/fcm/send/abc123xyz" });
  s.post({ key: KEY, action: "plan", times: [now, now + 10 * 60000] });
  s.ctx.__status = 410; s.ctx.tick();
  s.ctx.__now = now + 11 * 60000; s.ctx.tick();
  assert.equal(s.fetches.length, 1);
  assert.deepEqual(JSON.parse(PUSH_MANIFEST).oauthScopes, ["https://www.googleapis.com/auth/script.external_request", "https://www.googleapis.com/auth/script.scriptapp"]);
  assert.throws(() => pushScriptFor({ key: "short", vapid: k }));
  assert.throws(() => pushScriptFor({ key: KEY, vapid: { d: "a\"b", pub: "x" } }));
});

test("the script has no 0n-style numbers (the Apps Script editor rejects them)", () => {
  const src = pushScriptFor({ key: KEY, vapid: keys() });
  assert.equal(/\b\d+n\b/.test(src.replace(/"[^"]*"/g, "")), false);
  assert.equal(/\?\.|\?\?/.test(src), false);
});
