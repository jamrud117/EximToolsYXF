// ============================================================
// core/sheet.reader.js — Low-level sheet access & data extraction
// Depends on: config/constants.js, utils/formatter.js, utils/parser.js
// ============================================================

// ── Low-level cell accessors ──────────────────────────────────

/** Read a cell by address string (e.g. "A1"). */
function getCellValue(sheet, cell) {
  const c = sheet[cell];
  return c ? c.v : "";
}

/** Read a cell by 0-indexed row / column. */
function getCellValueRC(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return "";
  if (cell.t === "s") return String(cell.v).trim();
  return cell.v ?? "";
}

/**
 * Like getCellValueRC but prefers the formatted text (cell.w) for
 * numeric cells — useful when the displayed string (e.g. a date) matters.
 */
function getCellTextRC(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return "";
  if (cell.t === "s") return String(cell.v).trim();
  if (cell.t === "n" && cell.w) return String(cell.w).trim();
  return String(cell.v ?? "").trim();
}

// ── Subtotal / data-row guards ────────────────────────────────

/**
 * Returns true when any cell in row `r` matches a subtotal keyword.
 * Uses exact-word matching to avoid false positives like "ITEM TOTAL LENGTH".
 * Depends on SUBTOTAL_KEYWORDS from constants.js.
 */
function isSubtotalRow(sheet, r) {
  if (!sheet || !sheet["!ref"]) return false;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell || cell.v == null) continue;
    const v = String(cell.v).trim().toUpperCase();
    if (SUBTOTAL_KEYWORDS.some((kw) => v === kw || v.startsWith(kw + " "))) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when row `r` is a genuine data row:
 *   – Not a subtotal row
 *   – The serial column contains a positive number
 */
function isDataRow(sheet, r, serialCol = 0) {
  if (isSubtotalRow(sheet, r)) return false;
  const serial = getCellValueRC(sheet, r, serialCol);
  if (serial === "" || serial === null || serial === undefined) return false;
  const n = Number(serial);
  return !isNaN(n) && n > 0;
}

// ── Header-based column finder ────────────────────────────────

/**
 * Scan a sheet for header keywords and return their column indices.
 *
 * Multi-row headers: scanning continues past the first match row so
 * layouts where e.g. "KEMASAN" and "GW/NW" appear on different header
 * rows are handled correctly.
 *
 * Disambiguation via `options.separatorKeyword`:
 * When two columns share the same header keyword (e.g. two "AMOUNT"
 * columns — one for CIF, one for the IDR equivalent), providing the
 * keyword of the column that sits BETWEEN them (e.g. "KURS") resolves
 * the ambiguity by selecting the rightmost match that still sits to the
 * LEFT of the separator.
 *
 * @param {Object} sheet
 * @param {Object} headers            - { key: "KEYWORD" }
 * @param {number} maxScanRows        - rows to scan (default 40)
 * @param {Object} [options]
 * @param {string} [options.separatorKeyword]
 * @returns {Object} { ...resolvedKeys, headerRow: number|null }
 */
function findHeaderColumns(sheet, headers, maxScanRows = 40, options = {}) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const limit = Math.min(range.e.r, range.s.r + maxScanRows - 1);

  const allMatches  = {}; // { key: [col, ...] }
  const found       = {};
  let   lastHeaderRow = null;
  let   separatorCol  = null;

  const sepKw = options.separatorKeyword
    ? String(options.separatorKeyword).toUpperCase().trim()
    : null;

  for (let r = range.s.r; r <= limit; r++) {
    let rowHadMatch = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || !cell.v) continue;
      const val = String(cell.v).trim().toUpperCase();

      if (sepKw && separatorCol === null && val.includes(sepKw)) {
        separatorCol = c;
      }

      for (const [key, target] of Object.entries(headers)) {
        if (!target) continue;
        if (!val.includes(String(target).toUpperCase())) continue;

        if (!allMatches[key]) allMatches[key] = [];
        allMatches[key].push(c);

        if (!(key in found)) {
          found[key]    = c;
          rowHadMatch   = true;
        }
      }
    }

    if (rowHadMatch) lastHeaderRow = r;

    // Early exit once all keys found and next row is data
    const allFound = Object.keys(headers).every((k) => !headers[k] || k in found);
    if (allFound && lastHeaderRow !== null) {
      const nextR = r + 1;
      if (nextR <= range.e.r && isDataRow(sheet, nextR, 0)) break;
    }
  }

  // Disambiguation: for duplicate matches, pick rightmost col left of separator
  if (separatorCol !== null) {
    for (const [key, cols] of Object.entries(allMatches)) {
      if (cols.length < 2) continue;
      const beforeSep = cols.filter((c) => c < separatorCol);
      if (beforeSep.length > 0) {
        found[key] = Math.max(...beforeSep);
      }
    }
  }

  return { ...found, headerRow: lastHeaderRow };
}

// ── PL catalogue & aggregation ────────────────────────────────

/**
 * Build an ordered list of 0-indexed row numbers that are genuine data
 * rows in a PL sheet, skipping headers, subtotals, and blank rows.
 */
function getPLDataRows(sheet, serialCol = 0) {
  if (!sheet || !sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows  = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (isDataRow(sheet, r, serialCol)) rows.push(r);
  }
  return rows;
}

/** Find the Grand Total row in a PL sheet. Returns row index or null. */
function findGrandTotalRow(sheet) {
  if (!sheet || !sheet["!ref"]) return null;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) continue;
      if (String(cell.v).trim().toUpperCase() === "GRAND TOTAL") return r;
    }
  }
  return null;
}

/**
 * Sum KEMASAN (packaging count), GW (gross weight), and NW (net weight)
 * from a PL sheet.
 *
 * Strategy:
 *  1. Prefer the Grand Total row when present — most reliable.
 *  2. Fall back to summing genuine data rows (subtotals excluded).
 */
function hitungKemasanNWGW(sheet) {
  const EMPTY = { kemasanSum: 0, bruttoSum: 0, nettoSum: 0, kemasanUnit: "" };
  if (!sheet || !sheet["!ref"]) return EMPTY;

  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // ── Locate header columns ─────────────────────────────────
  let colKemasan = null, colGW = null, colNW = null, headerEndRow = null;

  for (let r = range.s.r; r <= range.e.r; r++) {
    if (isDataRow(sheet, r, 0)) { headerEndRow = r - 1; break; }
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || typeof cell.v !== "string") continue;
      const val = cell.v.toUpperCase().trim();
      if (colKemasan === null && (val.includes("KEMASAN") || val === "CT")) colKemasan = c;
      if (colGW      === null && (val.includes("GROSS WEIGHT") || val === "GW")) colGW = c;
      if (colNW      === null && (val.includes("NET WEIGHT")   || val === "NW")) colNW = c;
    }
  }

  if (headerEndRow === null) headerEndRow = range.e.r;
  if (colKemasan === null && colGW === null && colNW === null) return EMPTY;

  colKemasan = colKemasan ?? -1;
  colGW      = colGW      ?? -1;
  colNW      = colNW      ?? -1;

  const kemasanUnit = _detectKemasanUnit(sheet, colKemasan, headerEndRow, range);

  // ── Prefer Grand Total row ────────────────────────────────
  const grandTotalRow = findGrandTotalRow(sheet);
  if (grandTotalRow !== null) {
    const kemasanSum = colKemasan >= 0 ? (parseFloat(getCellValueRC(sheet, grandTotalRow, colKemasan)) || 0) : 0;
    const bruttoSum  = colGW >= 0      ? (parseFloat(getCellValueRC(sheet, grandTotalRow, colGW))      || 0) : 0;
    const nettoSum   = colNW >= 0      ? (parseFloat(getCellValueRC(sheet, grandTotalRow, colNW))      || 0) : 0;

    if (kemasanSum > 0 || bruttoSum > 0 || nettoSum > 0) {
      return { kemasanSum, bruttoSum, nettoSum, kemasanUnit };
    }
    console.warn("[sheet.reader] Grand Total row kosong; fallback ke sum baris data.");
  }

  // ── Fallback: sum data rows only ──────────────────────────
  let totalKemasan = 0, totalGW = 0, totalNW = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (!isDataRow(sheet, r, 0)) continue;
    if (colKemasan >= 0) totalKemasan += parseInt(getCellValueRC(sheet, r, colKemasan)) || 0;
    if (colGW      >= 0) totalGW      += parseFloat(getCellValueRC(sheet, r, colGW))    || 0;
    if (colNW      >= 0) totalNW      += parseFloat(getCellValueRC(sheet, r, colNW))    || 0;
  }

  return { kemasanSum: totalKemasan, bruttoSum: totalGW, nettoSum: totalNW, kemasanUnit };
}

function _detectKemasanUnit(sheet, col, headerRow, range) {
  if (col < 0) return "";
  const headerText = getCellValueRC(sheet, headerRow, col);
  const m = String(headerText || "").match(/KEMASAN\s*(.*)/i);
  if (m && m[1]?.trim()) return m[1].trim().toUpperCase();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const v = getCellValueRC(sheet, r, col);
    if (v && isNaN(v)) return String(v).trim().toUpperCase();
  }
  for (let r = range.e.r; r >= range.s.r; r--) {
    const v = getCellValueRC(sheet, r, col);
    if (v && isNaN(v)) return String(v).trim().toUpperCase();
  }
  return "";
}

// ── PL unit detection ─────────────────────────────────────────

/**
 * Detect per-item or global QTY units from a PL sheet.
 * Subtotal rows are excluded to avoid polluting the unit set.
 *
 * @returns {{ type: 'GLOBAL'|'PER_ITEM'|'UNKNOWN', unit?: string, data: Array }}
 */
function getPLUnits(sheetPL) {
  const range = XLSX.utils.decode_range(sheetPL["!ref"]);
  let colQty = null, colUnit = null, headerRow = null, globalUnit = "";

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const raw = getCellValueRC(sheetPL, r, c);
      if (!raw) continue;
      const v = String(raw).toUpperCase();
      if (v.includes("QTY")) {
        colQty = c;
        const m = v.match(/\(([^)]+)\)/);
        if (m) globalUnit = m[1].trim().toUpperCase();
      }
      if ((v.includes("SATUAN") || (v.includes("UNIT") && colUnit === null)))
        colUnit = c;
    }
    if (colQty !== null) { headerRow = r; break; }
  }

  if (colQty === null) return { type: "UNKNOWN", data: [] };

  const items   = [];
  const unitSet = new Set();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    if (!isDataRow(sheetPL, r, 0)) continue;

    const qty = getCellValueRC(sheetPL, r, colQty);
    if (!qty || isNaN(qty)) continue;

    let unit = colUnit !== null ? getCellValueRC(sheetPL, r, colUnit) : "";
    if (!unit && globalUnit) unit = globalUnit;

    const normUnit = normalizeQtyUnit(unit);
    if (normUnit) unitSet.add(normUnit);

    items.push({ qty: Number(qty), unit: normUnit || null });
  }

  if (unitSet.size > 1) return { type: "PER_ITEM", data: items };
  if (unitSet.size === 1) return { type: "GLOBAL", unit: [...unitSet][0], data: items };
  return { type: "UNKNOWN", data: items };
}

// ── Draft-sheet helpers ───────────────────────────────────────

function getNPWPDraft(sheetsDATA) {
  const sheet = sheetsDATA.ENTITAS || sheetsDATA.HDR_ENTITAS || sheetsDATA.entitas;
  if (!sheet) return "";
  return _getEntitasField(sheet, "NOMOR IDENTITAS", fixNpwp);
}

function getAddressDraft(sheetsDATA) {
  const sheet = sheetsDATA.ENTITAS;
  if (!sheet) return "";
  return _getEntitasField(sheet, "ALAMAT ENTITAS", (v) => v);
}

function getCustomerDraft(sheetsDATA) {
  const sheet = sheetsDATA.ENTITAS;
  if (!sheet) return "";
  return _getEntitasField(sheet, "NAMA ENTITAS", (v) => v);
}

function _getEntitasField(sheet, targetHeader, transform) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let colKode = null, colTarget = null;

  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    const h = String(cell.v).toUpperCase();
    if (h.includes("KODE ENTITAS"))               colKode   = c;
    if (h.includes(targetHeader.toUpperCase()))   colTarget = c;
  }

  if (colKode === null || colTarget === null) return "";

  for (let r = 1; r <= range.e.r; r++) {
    if (String(getCellValueRC(sheet, r, colKode)).trim() === "8") {
      return transform(getCellValueRC(sheet, r, colTarget));
    }
  }
  return "";
}

/**
 * Normalise an NPWP value: strip non-digits, zero-pad to 22 chars.
 */
function fixNpwp(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (/e\+/i.test(s)) {
    try   { s = BigInt(Number(raw).toFixed(0)).toString(); }
    catch { s = String(Number(raw)); }
  }
  s = s.replace(/[^0-9]/g, "");
  if (s.length < 22) s = s.padStart(22, "0");
  if (s.length > 22) s = s.slice(-22);
  return s;
}

/**
 * Lookup a document number by its kode dokumen in the DOKUMEN sheet.
 * @param {Object} sheet
 * @param {string} kodeDokumenTarget  - e.g. "380", "217", "640"
 */
function getDocumentNumber(sheet, kodeDokumenTarget) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (!rows || rows.length === 0) return "";

  const header  = rows[0].map((h) => String(h || "").trim().toUpperCase());
  const kodeIdx  = header.indexOf("KODE DOKUMEN");
  const nomorIdx = header.indexOf("NOMOR DOKUMEN");
  if (kodeIdx === -1 || nomorIdx === -1) return "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (String(row[kodeIdx]).trim() === String(kodeDokumenTarget))
      return row[nomorIdx] ?? "";
  }
  return "";
}

/**
 * Lookup a document date by kode dokumen (column index 2) in the DOKUMEN
 * sheet. Returns a formatted date string.
 */
function findDocDateByCode(sheet, code) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let r = range.s.r; r <= range.e.r; r++) {
    const kode = getCellValueRC(sheet, r, 2);
    if (String(kode).trim() === String(code)) {
      return parseExcelDate(getCellValueRC(sheet, r, 4));
    }
  }
  return "";
}

/**
 * Collect Ex-BC nomor / tanggal pairs from the DOKUMEN sheet
 * for a given jenis dokumen code.
 */
function getExBCFromDraft(sheetDokumen, jenisDokumen) {
  const range    = XLSX.utils.decode_range(sheetDokumen["!ref"]);
  const nomorArr = [], tanggalArr = [];

  for (let r = 1; r <= range.e.r; r++) {
    const jenis = getCellValue(sheetDokumen, `C${r + 1}`);
    if (String(jenis).trim() !== String(jenisDokumen).trim()) continue;

    const nomor   = getCellValue(sheetDokumen, `D${r + 1}`);
    const tanggal = getCellValue(sheetDokumen, `E${r + 1}`);
    if (!nomor) continue;

    nomorArr.push(String(nomor).trim());
    tanggalArr.push(tanggal ?? "");
  }

  return { nomorArr, tanggalArr };
}

/**
 * Scan a sheet for a cell containing "DATE" and return its text content.
 * Used to extract the invoice/packing-list date string.
 */
function findDateText(sheet) {
  if (!sheet || !sheet["!ref"]) return "";
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || typeof cell.v !== "string") continue;
      const v = cell.v
        .replace(/[\u00A0\u200B\uFEFF\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (/DATE/i.test(v)) return v;
    }
  }

  // Fallback: scan all string cells
  const allText = Object.values(sheet)
    .filter((c) => c && typeof c.v === "string")
    .map((c) => c.v)
    .join(" ");
  const match = allText.match(/DATE\s*[:\-]?\s*([A-Za-z0-9 ,\/\-]+)/i);
  return match ? match[0] : "";
}

/**
 * Locate the invoice or packing-list number in a sheet.
 * Searches for "INVOICE NO" / "PACKING LIST NO" keywords.
 */
function findInvoiceNo(sheet) {
  const KEYWORDS = ["INVOICE NO", "PACKINGLIST NO", "PACKING LIST NO"];
  const range    = XLSX.utils.decode_range(sheet["!ref"]);

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || typeof cell.v !== "string") continue;
      if (!KEYWORDS.some((k) => cell.v.toUpperCase().includes(k))) continue;

      for (const line of cell.v.split(/\r?\n/)) {
        const foundKey = KEYWORDS.find((k) => line.toUpperCase().includes(k));
        if (!foundKey) continue;
        const parts = line.split(":");
        if (parts.length > 1) {
          return parts[1].trim().split(/DATE/i)[0].trim().split(/\s+/)[0].trim();
        }
      }
    }
  }
  return "";
}
