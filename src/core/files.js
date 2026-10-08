/* Opens the phone's file picker and reads a JSON file. Read-only. */

/** Resolves to { name, size, json } or { name, error: "not-json" | "read-failed" }.
    Resolves to null if the user cancels. */
export function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // .gz: Lakshyam's Google Drive backups are compressed (lakshyam-backup-….json.gz).
    input.accept = "application/json,.json,application/gzip,.gz";
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => input.remove();

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) { resolve(null); return; }
      let text;
      try { text = await readMaybeGzip(file); } catch { resolve({ name: file.name, error: "read-failed" }); return; }
      try {
        resolve({ name: file.name, size: file.size, json: JSON.parse(text) });
      } catch {
        resolve({ name: file.name, size: file.size, error: "not-json" });
      }
    }, { once: true });
    // Chrome on Android fires no event on cancel; the promise simply stays pending.
    input.click();
  });
}

/** Text of a file, unzipping it first if it is gzip-compressed (starts with 1f 8b). */
export async function readMaybeGzip(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return file.text();
}

/** Opens the file picker for a JSON/text file and returns its raw text
    (so it can be auto-fixed before parsing). Resolves { name, text } or { error }. */
export function pickTextFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,text/plain,.txt";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => resolve({ name: file.name, error: "read-failed" });
      reader.readAsText(file);
    }, { once: true });
    input.click();
  });
}
