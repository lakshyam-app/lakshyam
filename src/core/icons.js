/* Inline icons (stroke style, inherit text colour). App-made markup only. */
import { raw } from "./dom.js";

const svg = (body) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);

export const icons = {
  today: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  library: svg('<path d="M5.5 4.5h11a2 2 0 0 1 2 2v13h-11a2 2 0 0 1-2-2z"/><path d="M5.5 17.5a2 2 0 0 1 2-2h11M9.5 8.5h5"/>'),
  progress: svg('<path d="M5 19.5V13M10 19.5V8.5M15 19.5v-7M20 19.5V5"/>'),
  notes: svg('<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5v4h4M9 12h6.5M9 15.5h6.5"/>')
};
