/* Marks after negative marking.
   marking = { pos, negNum, negDen } means: +pos per right answer,
   minus negNum/negDen per wrong answer (e.g. 1/3), nothing for unanswered. */

export const DEFAULT_MARKING = Object.freeze({ pos: 1, negNum: 1, negDen: 3 });

/** Converts the old app's { positive, negNum, negDen } shape. */
export function markingFromLegacy(m) {
  if (!m || typeof m !== "object") return { ...DEFAULT_MARKING };
  const pos = Number(m.positive ?? m.pos);
  const negNum = Number(m.negNum);
  const negDen = Number(m.negDen);
  return {
    pos: Number.isFinite(pos) ? pos : 1,
    negNum: Number.isFinite(negNum) ? negNum : 0,
    negDen: Number.isFinite(negDen) && negDen > 0 ? negDen : 1
  };
}

export function penaltyPerWrong(marking) {
  return marking.negDen > 0 ? marking.negNum / marking.negDen : 0;
}

/** Same rounding as the old app (2 decimals), so imported scores match. */
export function netScore(correct, wrong, marking) {
  const raw = correct * marking.pos - wrong * penaltyPerWrong(marking);
  return Math.round(raw * 100) / 100;
}

/** "+1 right, −⅓ wrong" style text. */
export function markingText(marking) {
  const fractions = { "1/3": "⅓", "1/4": "¼", "1/2": "½", "2/3": "⅔", "3/4": "¾" };
  const pen = marking.negNum === 0 ? "0" : (fractions[`${marking.negNum}/${marking.negDen}`] ??
    (marking.negDen === 1 ? String(marking.negNum) : `${marking.negNum}/${marking.negDen}`));
  return { right: `+${marking.pos}`, wrong: marking.negNum === 0 ? "0" : `−${pen}` };
}
