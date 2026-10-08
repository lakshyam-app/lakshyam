/* Google Drive backup.
   - Sign-in: Google Identity Services token client (loaded only when you use Drive),
     scope drive.file = only files this app creates. The access token lives in memory
     only (about an hour) and is never saved or put in backups.
   - Files: "Lakshyam backups/<phone name>/lakshyam-backup-YYYY-MM-DD-HHMM.json.gz",
     gzip-compressed, tagged with appProperties so each phone's copies can be told apart.
   - Each phone keeps its own newest KEEP copies; older ones of that phone are deleted.
   The client ID is public by design (it identifies the app, not you); there is no secret. */
export const CLIENT_ID = "862673867909-g3femq04ncqg9jdtoqi74l2pulsir446.apps.googleusercontent.com";
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
export const ROOT_FOLDER = "Lakshyam backups";
export const KEEP = 10;
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(kind, detail = "") { super(`${kind}${detail ? `: ${detail}` : ""}`); this.kind = kind; }
}

/* ---------- sign-in ---------- */

let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new DriveError("offline")); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/** Starts loading Google's sign-in script early, so a later tap opens it at once. */
export function preload() { if (navigator.onLine) loadGis().catch(() => {}); }

let token = null; // { value, exp }
export const hasToken = () => Boolean(token && token.exp > Date.now() + 60000);
export const forgetToken = () => { token = null; };

/** Opens Google's sign-in (must be called from a tap). hint: the account to suggest. */
export async function signIn({ hint = "", consent = false } = {}) {
  if (!navigator.onLine) throw new DriveError("offline");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, hint: hint || undefined,
      callback: (resp) => {
        if (resp.error) { reject(new DriveError(resp.error === "access_denied" ? "denied" : "auth", resp.error)); return; }
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) { reject(new DriveError("scope")); return; }
        token = { value: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        resolve(token);
      },
      error_callback: (err) => reject(new DriveError(err?.type === "popup_closed" ? "closed" : err?.type === "popup_failed_to_open" ? "popup" : "auth", err?.type || ""))
    });
    client.requestAccessToken({ prompt: consent ? "consent" : "" });
  });
}

export async function signOut() {
  const v = token?.value;
  token = null;
  if (v && window.google?.accounts?.oauth2) await new Promise((r) => window.google.accounts.oauth2.revoke(v, r));
}

/* ---------- Drive calls ---------- */

async function call(url, { method = "GET", body, headers = {}, as = "json" } = {}) {
  if (!hasToken()) throw new DriveError("auth");
  let r;
  try {
    r = await fetch(url.startsWith("http") ? url : API + url, { method, body, headers: { Authorization: `Bearer ${token.value}`, ...headers } });
  } catch { throw new DriveError("offline"); }
  if (r.status === 401) { token = null; throw new DriveError("auth"); }
  if (r.status === 403 && /storageQuota|quota/i.test(await r.clone().text())) throw new DriveError("full");
  if (!r.ok) throw new DriveError("http", `${r.status} ${(await r.text()).slice(0, 200)}`);
  if (as === "blob") return r.blob();
  return r.status === 204 ? null : r.json();
}

const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function whoAmI() {
  const r = await call("/about?fields=user(emailAddress,displayName)");
  return { email: r.user?.emailAddress || "", name: r.user?.displayName || "" };
}

async function folder(name, parentId = null) {
  const query = `name='${q(name)}' and mimeType='${FOLDER}' and trashed=false${parentId ? ` and '${q(parentId)}' in parents` : ""}`;
  const found = await call(`/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10&spaces=drive`);
  if (found.files?.length) return found.files[0].id;
  const made = await call("/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) })
  });
  return made.id;
}

/** The phone's folder (created if needed). */
export async function phoneFolder(phoneName) {
  const root = await folder(ROOT_FOLDER);
  return folder(phoneName, root);
}

/* ---------- gzip ---------- */

export async function gzip(text) {
  if (typeof CompressionStream === "undefined") return { blob: new Blob([text], { type: "application/json" }), gz: false };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return { blob: new Blob([await new Response(stream).arrayBuffer()], { type: "application/gzip" }), gz: true };
}

export async function gunzipToText(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return blob.text();
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/* ---------- backup files ---------- */

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

/** Uploads one backup; returns { id, name, size }. props: small labels saved with the file. */
export async function uploadBackup(folderId, text, props) {
  const { blob, gz } = await gzip(text);
  const meta = {
    name: `lakshyam-backup-${stamp()}.json${gz ? ".gz" : ""}`, parents: [folderId],
    mimeType: gz ? "application/gzip" : "application/json",
    appProperties: Object.fromEntries(Object.entries({ lakshyam: "backup", ...props }).map(([k, v]) => [k, String(v).slice(0, 100)]))
  };
  const boundary = `lk${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
    blob, `\r\n--${boundary}--`
  ]);
  return call(`${UPLOAD}?uploadType=multipart&fields=id,name,size,createdTime`, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body
  });
}

/** Every Lakshyam backup this account can see (all phones), newest first. */
export async function listBackups() {
  const query = "appProperties has { key='lakshyam' and value='backup' } and trashed=false";
  const out = [];
  let page = "";
  do {
    const r = await call(`/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&pageSize=100&fields=nextPageToken,files(id,name,size,createdTime,appProperties)${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
    out.push(...(r.files || []));
    page = r.nextPageToken || "";
  } while (page && out.length < 500);
  return out;
}

export const downloadBackupText = async (id) => gunzipToText(await call(`/files/${encodeURIComponent(id)}?alt=media`, { as: "blob" }));
export const deleteFile = (id) => call(`/files/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Deletes this phone's copies beyond the newest `keep`. Returns how many were removed. */
export async function prune(phoneId, keep = KEEP) {
  const mine = (await listBackups()).filter((f) => f.appProperties?.phoneId === phoneId);
  const extra = mine.slice(keep);
  for (const f of extra) { try { await deleteFile(f.id); } catch { /* try again next time */ } }
  return extra.length;
}

/* ---------- study PDFs kept in Drive ("Lakshyam PDFs") ---------- */

export const PDF_FOLDER = "Lakshyam PDFs";
export const pdfFolder = () => folder(PDF_FOLDER);

/**
 * Uploads a large file with a resumable upload (multipart is only for small files).
 * meta: { name, parents, mimeType, appProperties }. onProgress(sent, total).
 * Returns { id, name, size, md5Checksum }.
 */
export async function uploadLarge(blob, meta, onProgress) {
  if (!hasToken()) throw new DriveError("auth");
  let start;
  try {
    start = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,name,size,md5Checksum`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": meta.mimeType, "X-Upload-Content-Length": String(blob.size) },
      body: JSON.stringify(meta)
    });
  } catch { throw new DriveError("offline"); }
  if (start.status === 401) { token = null; throw new DriveError("auth"); }
  if (start.status === 403 && /storageQuota|quota/i.test(await start.clone().text())) throw new DriveError("full");
  if (!start.ok) throw new DriveError("http", `${start.status} ${(await start.text()).slice(0, 200)}`);
  const at = start.headers.get("Location");
  if (!at) {
    // The browser couldn't see the upload address: one-request upload instead (fine for smaller files).
    const boundary = `lk${Math.random().toString(36).slice(2)}`;
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
    onProgress?.(0, blob.size);
    const r = await call(`${UPLOAD}?uploadType=multipart&fields=id,name,size,md5Checksum`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    onProgress?.(blob.size, blob.size);
    return r;
  }
  // XMLHttpRequest, because fetch can't report upload progress.
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", at);
    x.setRequestHeader("Content-Type", meta.mimeType);
    x.upload.onprogress = (e) => onProgress?.(e.loaded, e.total || blob.size);
    x.onload = () => {
      if (x.status === 401) { token = null; reject(new DriveError("auth")); return; }
      if (x.status === 403 && /quota/i.test(x.responseText)) { reject(new DriveError("full")); return; }
      if (x.status < 200 || x.status >= 300) { reject(new DriveError("http", `${x.status} ${String(x.responseText).slice(0, 200)}`)); return; }
      try { resolve(JSON.parse(x.responseText)); } catch { reject(new DriveError("http", "bad reply")); }
    };
    x.onerror = () => reject(new DriveError("offline"));
    x.send(blob);
  });
}

/** Downloads a file this app made. onProgress(received, total). */
export async function downloadFile(id, onProgress) {
  if (!hasToken()) throw new DriveError("auth");
  let r;
  try { r = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token.value}` } }); } catch { throw new DriveError("offline"); }
  if (r.status === 401) { token = null; throw new DriveError("auth"); }
  if (r.status === 404) throw new DriveError("gone");
  if (!r.ok) throw new DriveError("http", `${r.status}`);
  const total = Number(r.headers.get("Content-Length")) || 0;
  if (!r.body || !onProgress) return r.blob();
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; onProgress(got, total);
  }
  return new Blob(parts, { type: "application/pdf" });
}

/** Moves a file to the Drive Bin (it can be restored from there for 30 days). */
export const trashFile = (id) => call(`/files/${encodeURIComponent(id)}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });

/** Every study PDF this app put in Drive (not in the Bin). */
export async function listPdfFiles() {
  const query = "appProperties has { key='lakshyam' and value='pdf' } and trashed=false";
  const out = []; let page = "";
  do {
    const r = await call(`/files?q=${encodeURIComponent(query)}&pageSize=100&fields=nextPageToken,files(id,name,size,md5Checksum,createdTime,appProperties)${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
    out.push(...(r.files || []));
    page = r.nextPageToken || "";
  } while (page && out.length < 1000);
  return out;
}
