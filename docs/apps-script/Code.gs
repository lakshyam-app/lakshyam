/**
 * Lakshyam automatic backup (version 1). Runs in YOUR Google account and saves
 * Lakshyam backups to YOUR Drive, in the folder "Lakshyam auto-backups".
 * It can only see files it made (permission: drive.file). It only adds backups; it can't
 * send files back, list or open your other files. Old copies go to the Bin, never deleted.
 * Keep this code private: the KEY below works like a password for adding backups.
 */
const KEY = "(the app fills in your private code when you tap Copy the script)";
const ROOT = "Lakshyam auto-backups";
const MAX_CHARS = 8 * 1024 * 1024;  // about 6 MB of compressed backup
const MAX_PER_DAY = 30;
const KEEP_NEWEST = 15;
const KEEP_DAYS = 30;
const FOLDER = "application/vnd.google-apps.folder";

function doGet() { return reply({ ok: true }); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!same(String(body.key || ""), KEY)) return reply({ ok: false, error: "key" });
    if (body.action === "ping") return reply({ ok: true, version: 1, folder: ROOT });
    const data = String(body.data || "");
    if (!data || data.length > MAX_CHARS) return reply({ ok: false, error: "size" });
    const bytes = Utilities.base64Decode(data);
    if (bytes.length < 20 || (bytes[0] & 255) !== 0x1f || (bytes[1] & 255) !== 0x8b) return reply({ ok: false, error: "format" });
    if (!withinDailyLimit()) return reply({ ok: false, error: "rate" });
    const phone = clean(body.phone, 40) || "Phone";
    const name = "lakshyam-backup-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd-HHmm") + ".json.gz";
    const dir = folder(phone, folder(ROOT, null));
    const file = Drive.Files.create({
      name: name, parents: [dir], mimeType: "application/gzip",
      appProperties: { lakshyam: "backup", via: "relay", phoneId: clean(body.phoneId, 60), phone: phone,
        questions: clean(body.questions, 10), tests: clean(body.tests, 10), app: clean(body.app, 12) }
    }, Utilities.newBlob(bytes, "application/gzip", name), { fields: "id,name,size" });
    tidy(dir);
    return reply({ ok: true, id: file.id, name: file.name, size: file.size });
  } catch (err) {
    return reply({ ok: false, error: "server", detail: String(err).slice(0, 200) });
  }
}

function folder(name, parent) {
  const q = "name = '" + name.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER + "' and trashed = false" + (parent ? " and '" + parent + "' in parents" : "");
  const found = Drive.Files.list({ q: q, fields: "files(id)", pageSize: 5, spaces: "drive" }).files || [];
  if (found.length) return found[0].id;
  const made = { name: name, mimeType: FOLDER };
  if (parent) made.parents = [parent];
  return Drive.Files.create(made, null, { fields: "id" }).id;
}

/* Moves this phone's old copies to the Bin: only beyond the newest KEEP_NEWEST, and only older than KEEP_DAYS. */
function tidy(dir) {
  const list = Drive.Files.list({ q: "'" + dir + "' in parents and trashed = false", orderBy: "createdTime desc", fields: "files(id,createdTime)", pageSize: 100 }).files || [];
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  list.slice(KEEP_NEWEST).forEach(function (f) {
    if (new Date(f.createdTime).getTime() < cutoff) Drive.Files.update({ trashed: true }, f.id);
  });
}

function withinDailyLimit() {
  const props = PropertiesService.getScriptProperties();
  const day = "uploads-" + Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
  const n = Number(props.getProperty(day) || 0);
  if (n >= MAX_PER_DAY) return false;
  props.setProperty(day, String(n + 1));
  return true;
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function clean(v, max) { return String(v === undefined || v === null ? "" : v).replace(/[^\w .,'()\-\u0D00-\u0D7F]/g, "").slice(0, max); }

function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
