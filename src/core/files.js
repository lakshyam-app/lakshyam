/* Opens the phone's file picker and reads a JSON file. Read-only. */

/** Resolves to { name, size, json } or { name, error: "not-json" | "read-failed" }.
    Resolves to null if the user cancels. */
export function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => input.remove();

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve({ name: file.name, size: file.size, json: JSON.parse(String(reader.result)) });
        } catch {
          resolve({ name: file.name, size: file.size, error: "not-json" });
        }
      };
      reader.onerror = () => resolve({ name: file.name, error: "read-failed" });
      reader.readAsText(file);
    }, { once: true });
    // Chrome on Android fires no event on cancel; the promise simply stays pending.
    input.click();
  });
}
