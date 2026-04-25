// ============================================================
// utils/formatter.js — Value formatting helpers
// ============================================================

const UNIT_MAP = {
  POLYBAG: "BG",
  BOX: "BX",
  CARTON: "CT",
  ROLL: "RO",
  SHEET: "ST",
};

const QTY_UNIT_MAP = {
  PAIRS: "NPR",
  PAIR: "NPR",
  PRS: "NPR",
  PR: "NPR",
  PCS: "PCE",
  PIECE: "PCE",
  PC: "PCE",
  PCE: "PCE",
};

/**
 * Format a numeric/string value with optional unit suffix.
 * @param {*} val
 * @param {boolean} isQty - round to integer if true
 * @param {string} unit
 */
function formatValue(val, isQty = false, unit = "") {
  if (val === null || val === undefined || val === "") return "";

  const str = String(val).trim();
  const match = str.match(/^(-?\d+(\.\d+)?)/);
  if (!match) return str;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return str;

  const rounded = isQty ? Math.round(num) : Math.round(num * 100) / 100;
  const rest = str.substring(match[0].length).trim();
  const suffix = unit || rest;

  return suffix ? `${rounded} ${suffix}` : `${rounded}`;
}

/**
 * Format number as Indonesian Rupiah.
 */
function formatRupiah(value) {
  if (value == null || value === "" || isNaN(value)) return value;

  const num = Number(value);
  const hasDecimal = Math.abs(num % 1) > 0;

  const formatted = num.toLocaleString("id-ID", {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: hasDecimal ? 2 : 0,
  });

  return `Rp. ${formatted}`;
}

function formatCurr(value) {
  if (value == null || value === "") return value;

  let v = String(value)
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  const dotCount = (v.match(/\./g) || []).length;
  const commaCount = (v.match(/,/g) || []).length;

  if (dotCount > 1 && commaCount === 0) {
    v = v.replace(/\./g, "");
  } else if (commaCount > 1 && dotCount === 0) {
    v = v.replace(/,/g, "");
  } else if (v.includes(",") && v.includes(".")) {
    v = v.replace(/,/g, "");
  } else if (v.includes(",")) {
    v = v.replace(",", ".");
  }

  const num = parseFloat(v);

  if (isNaN(num)) {
    console.warn("⚠️ formatCurr gagal parse:", value);
    return value;
  }

  console.log("RAW VALUE:", value);
  console.log("STRING:", String(value));

  return num.toLocaleString("id-ID");
}

/**
 * Parse an Indonesian-formatted kurs string to a number.
 * e.g. "16.460,00" → 16460
 */
function parseKurs(val) {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") return val;

  let s = String(val)
    .trim()
    .replace(/\u00A0/g, "") // non-breaking spaces
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
 * Map packaging unit strings to standard codes.
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
 * Normalize quantity unit strings to standard codes.
 */
function normalizeQtyUnit(u) {
  if (!u) return "";
  const v = String(u).trim().toUpperCase();
  return QTY_UNIT_MAP[v] ?? v;
}

/**
 * Produce character-level diff HTML between two strings.
 * @param {string} a - draft value
 * @param {string} b - reference value
 * @param {boolean} refSide - true = highlight b side
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
 */
function cleanNumber(val) {
  if (!val) return "";
  return String(val)
    .replace(/.*?:\s*/i, "")
    .trim();
}
const isEqualNonZero = (a, b) => {
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  console.log("isEqualNonZero called →", { a, b, numA, numB });

  if (!a || !b || numA === 0 || numB === 0 || isNaN(numA) || isNaN(numB)) {
    console.log("→ return FALSE (ada nilai 0)");
    return false;
  }

  console.log("→ lanjut isEqual");
  return isEqual(a, b);
};
