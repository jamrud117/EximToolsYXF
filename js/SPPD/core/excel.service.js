// ============================================================
// core/excel.service.js — Workbook reading & file-type detection
// ============================================================

/**
 * Read a File object into an XLSX workbook.
 * @param {File} file
 * @returns {Promise<Object>} XLSX workbook
 */
function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        resolve(workbook);
      } catch (err) {
        reject(new Error(`Gagal membaca file "${file.name}": ${err.message}`));
      }
    };
    reader.onerror = () =>
      reject(new Error(`Tidak dapat membaca file "${file.name}"`));
    reader.readAsArrayBuffer(file);
  });
}

// ── Internal: score a single sheet for INV / PL keywords ─────

/**
 * Score one sheet for INV vs PL keyword presence.
 * @param {Object} sheet  - XLSX sheet object
 * @returns {{ scoreINV: number, scorePL: number }}
 */
function _scoreSheet(sheet) {
  let scoreINV = 0, scorePL = 0;
  if (!sheet || !sheet["!ref"]) return { scoreINV, scorePL };

  const range  = XLSX.utils.decode_range(sheet["!ref"]);
  const maxRow = Math.min(range.e.r, 30);
  const maxCol = Math.min(range.e.c, 20);

  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= maxCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) continue;

      const v          = String(cell.v).toUpperCase().trim();
      const isTop      = r < 5;
      const normalized = v.replace(/\./g, "").replace(/\s+/g, " ");

      if (normalized.includes("PACKING LIST"))                    scorePL += isTop ? 10 : 5;
      if (normalized.includes("NO KONTRAK"))                      scorePL += isTop ? 8  : 4;
      if (normalized.includes("KEMASAN"))                         scorePL += 3;
      if (normalized.includes("GROSS WEIGHT") || normalized === "GW") scorePL += 2;
      if (normalized.includes("NET WEIGHT")   || normalized === "NW") scorePL += 2;
      if (normalized.includes("INVOICE"))                         scoreINV += isTop ? 10 : 5;
      if (normalized.includes("UNIT PRICE") || normalized.includes("HARGA")) scoreINV += 3;
      if (normalized === "AMOUNT")                                 scoreINV += 1;
    }
  }

  return { scoreINV, scorePL };
}

/**
 * Detect whether a workbook is DATA (Draft EXIM), PL, INV, or INV_PL (combined).
 *
 * Strategy:
 *  1. If the workbook contains all four DATA sheets → "DATA"
 *  2. Score each sheet individually.
 *     If at least one sheet looks like INV AND a different sheet looks like PL
 *     → "INV_PL" (combined workbook with INV & PL on separate sheets).
 *  3. Otherwise aggregate all sheet scores → highest wins (min 4 pts required).
 *
 * @param {Object}  wb
 * @param {boolean} debug - log scoring details to console
 * @returns {"DATA"|"INV"|"PL"|"INV_PL"|"UNKNOWN"}
 */
function detectFileType(wb, debug = true) {
  const names = wb.SheetNames.map((n) => n.toUpperCase().trim());
  const has   = (key) => names.some((n) => n.includes(key));

  // ── 1. DATA check ────────────────────────────────────────
  const isData = has("HEADER") && has("BARANG") && has("KEMASAN") && has("DOKUMEN");
  if (isData) return "DATA";

  // ── 2. Per-sheet scoring (detects combined INV+PL workbook) ──
  const MIN_SCORE = 4;

  const sheetScores = wb.SheetNames.map((sheetName) => {
    const { scoreINV, scorePL } = _scoreSheet(wb.Sheets[sheetName]);
    return { sheetName, scoreINV, scorePL };
  });

  const invSheets = sheetScores.filter((s) => s.scoreINV >= MIN_SCORE && s.scoreINV > s.scorePL);
  const plSheets  = sheetScores.filter((s) => s.scorePL  >= MIN_SCORE && s.scorePL  > s.scoreINV);

  if (debug) console.log("[excel.service] detectFileType per-sheet scores:", sheetScores);

  // Both INV-type and PL-type sheets exist → combined file
  if (invSheets.length > 0 && plSheets.length > 0) {
    if (debug) console.log("[excel.service] detectFileType → INV_PL (combined)");
    return "INV_PL";
  }

  // ── 3. Aggregate scoring (single-type file) ──────────────
  const totalINV = sheetScores.reduce((acc, s) => acc + s.scoreINV, 0);
  const totalPL  = sheetScores.reduce((acc, s) => acc + s.scorePL,  0);

  if (debug) console.log("[excel.service] detectFileType aggregate scores:", { totalINV, totalPL });

  if (totalPL  >= MIN_SCORE && totalPL  > totalINV) return "PL";
  if (totalINV >= MIN_SCORE && totalINV > totalPL)  return "INV";
  return "UNKNOWN";
}

/**
 * From a combined INV+PL workbook, extract the best-matching INV sheet
 * and the best-matching PL sheet.
 *
 * @param {Object} wb - XLSX workbook (type === "INV_PL")
 * @returns {{ invSheet: Object|null, plSheet: Object|null }}
 */
function extractSheetsFromCombined(wb) {
  let bestINV = { score: 0, sheet: null };
  let bestPL  = { score: 0, sheet: null };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const { scoreINV, scorePL } = _scoreSheet(sheet);

    if (scoreINV > scorePL && scoreINV > bestINV.score) {
      bestINV = { score: scoreINV, sheet };
    }
    if (scorePL > scoreINV && scorePL > bestPL.score) {
      bestPL = { score: scorePL, sheet };
    }
  }

  if (bestINV.score === 0 || bestPL.score === 0) {
    throw new Error(
      "File gabungan INV+PL tidak valid: tidak dapat menemukan sheet Invoice dan Packing List yang terpisah."
    );
  }

  return { invSheet: bestINV.sheet, plSheet: bestPL.sheet };
}
