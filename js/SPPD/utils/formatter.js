// ============================================================
// utils/formatter.js — Display formatting helpers
// Depends on: config/constants.js (UNIT_MAP, QTY_UNIT_MAP)
// ============================================================

/**
 * Format a numeric value with optional rounding and unit suffix.
 * @param {*}       val
 * @param {boolean} isQty  - round to integer when true
 * @param {string}  unit
 */
function formatValue(val, isQty = false, unit = "") {
  if (val === null || val === undefined || val === "") return "";

  const str = String(val).trim();
  const match = str.match(/^(-?\d+(\.\d+)?)/);
  if (!match) return str;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return str;

  const rounded = isQty ? Math.round(num) : Math.round(num * 100) / 100;
  const rest    = str.substring(match[0].length).trim();
  const suffix  = unit || rest;

  return suffix ? `${rounded} ${suffix}` : `${rounded}`;
}

/**
 * Format a number as Indonesian Rupiah.
 * e.g. 16000000 → "Rp. 16.000.000"
 */
function formatRupiah(value) {
  if (value == null || value === "" || isNaN(value)) return value;

  const num        = Number(value);
  const hasDecimal = Math.abs(num % 1) > 0;

  return `Rp. ${num.toLocaleString("id-ID", {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: hasDecimal ? 2 : 0,
  })}`;
}

/**
 * Parse and re-format a currency string using the id-ID locale.
 * Handles both dot-as-thousands and comma-as-decimal conventions.
 * e.g. "1.234,56" → "1.234,56" | "1234.56" → "1.234,56"
 */
function formatCurr(value) {
  if (value == null || value === "") return value;

  let v = String(value)
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  const dotCount   = (v.match(/\./g)  || []).length;
  const commaCount = (v.match(/,/g)   || []).length;

  if      (dotCount > 1 && commaCount === 0)  v = v.replace(/\./g, "");
  else if (commaCount > 1 && dotCount === 0)  v = v.replace(/,/g, "");
  else if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
  else if (v.includes(","))                   v = v.replace(",", ".");

  const num = parseFloat(v);
  if (isNaN(num)) return value;

  return num.toLocaleString("id-ID");
}

/**
 * Parse an Indonesian-format kurs string to a number.
 * e.g. "16.460,00" → 16460
 */
function parseKurs(val) {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") return val;

  let s = String(val)
    .trim()
    .replace(/\u00A0/g, "")
    .replace(/[^\d,.\-]/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  return isNaN(n) ? "" : n;
}

/**
 * Map a packaging unit string to its standard short code.
 * e.g. "CARTON" → "CT"
 * Depends on UNIT_MAP from constants.js.
 */
function mapPackagingUnit(u) {
  if (!u) return "";
  const v = String(u).toUpperCase();
  for (const [key, code] of Object.entries(UNIT_MAP)) {
    if (v.includes(key)) return code;
  }
  return v;
}

/**
 * Normalize a quantity unit string to its standard code.
 * e.g. "PCS" → "PCE"
 * Depends on QTY_UNIT_MAP from constants.js.
 */
function normalizeQtyUnit(u) {
  if (!u) return "";
  const v = String(u).trim().toUpperCase();
  return QTY_UNIT_MAP[v] ?? v;
}

/**
 * Produce character-level diff HTML between two strings.
 * @param {string}  a       - draft (left) value
 * @param {string}  b       - reference (right) value
 * @param {boolean} refSide - when true, highlights the right (ref) side
 */
function diffText(a, b, refSide = false) {
  a = String(a ?? "");
  b = String(b ?? "");
  if (a === b) return a;

  const max = Math.max(a.length, b.length);
  let result = "";

  for (let i = 0; i < max; i++) {
    const ca = a[i] || "";
    const cb = b[i] || "";

    if (ca !== cb) {
      result += refSide
        ? `<span class="diff-ref">${cb || "∅"}</span>`
        : `<span class="diff">${ca || "∅"}</span>`;
    } else {
      result += ca;
    }
  }

  return result;
}

/**
 * Strip leading "label: " prefixes from a string.
 * e.g. "Invoice No: INV-001" → "INV-001"
 */
function cleanNumber(val) {
  if (!val) return "";
  return String(val).replace(/.*?:\s*/i, "").trim();
}
