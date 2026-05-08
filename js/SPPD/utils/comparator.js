// ============================================================
// utils/comparator.js — Value comparison helpers
// ============================================================

/**
 * Normalise a value for comparison:
 *   • null / undefined  → ""
 *   • number            → number (preserved for numeric compare)
 *   • everything else   → trimmed string
 */
function normalize(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v).trim();
}

/**
 * Loose equality: numbers compared with ±0.01 tolerance,
 * strings compared after normalisation.
 */
function isEqual(a, b) {
  const n1 = normalize(a);
  const n2 = normalize(b);
  if (typeof n1 === "number" && typeof n2 === "number")
    return Math.abs(n1 - n2) < 0.01;
  return String(n1) === String(n2);
}

/**
 * Strict equality: no normalisation beyond coercing null/undefined to "".
 * Used for fields like Item Name where exact match is required.
 */
function isEqualStrict(a, b) {
  return (a ?? "") === (b ?? "");
}

/**
 * Same as isEqual but returns false when either side is zero / empty.
 * Used for weights (NW / GW) where 0 should never be treated as a match.
 */
function isEqualNonZero(a, b) {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (!a || !b || isNaN(numA) || isNaN(numB) || numA === 0 || numB === 0) {
    return false;
  }
  return isEqual(a, b);
}
