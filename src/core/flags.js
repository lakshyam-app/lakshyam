/* Feature flags: switch unfinished features on/off in one place.
   Each phase turns its flag on once it is ready to test. */

export const flags = Object.freeze({
  import: true,
  tests: true,
  ai: true,
  pdfs: true,
  malayalamNames: false
});
