/* Theme choice: "system" (follow the phone), "light" or "dark".
   Stored as the device setting "theme" (kept on restore, like the app language);
   theme-boot.js does the switching and keeps the copy used for the first paint. */
export const THEMES = ["system", "light", "dark"];

export function applyTheme(choice) {
  const c = THEMES.includes(choice) ? choice : "system";
  if (typeof window !== "undefined" && window.lakshyamTheme) window.lakshyamTheme(c);
  else if (typeof document !== "undefined") document.documentElement.dataset.theme = c === "dark" ? "dark" : "light";
}

export const currentMode = () => (typeof document !== "undefined" && document.documentElement.dataset.theme) || "light";
