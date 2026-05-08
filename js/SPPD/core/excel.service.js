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

/**
 * Detect whether a workbook is DATA (Draft EXIM), PL, or INV.
 *
 * Strategy:
 *  1. If the workbook contains all four DATA sheets → "DATA"
 *  2. Otherwise score INV vs PL by keyword presence across all sheets.
 *     Result = type with the higher score (min 4 pts required).
 *
 * @param {Object}  wb
 * @param {boolean} debug - log scoring details to console
 * @returns {"DATA"|"INV"|"PL"|"UNKNOWN"}
 */
function detectFileType(wb, debug = true) {
  const names = wb.SheetNames.map((n) => n.toUpperCase().trim());
  const has   = (key) => names.some((n) => n.includes(key));

  // ── DATA check ──────────────────────────────────────────
  const isData = has("HEADER") && has("BARANG") && has("KEMASAN") && has("DOKUMEN");
  if (isData) return "DATA";

  // ── Keyword scoring ──────────────────────────────────────
  const MIN_SCORE = 4;
  let scoreINV = 0, scorePL = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

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
  }

  if (debug) console.log("[excel.service] detectFileType scores:", { scoreINV, scorePL });

  if (scorePL >= MIN_SCORE && scorePL > scoreINV) return "PL";
  if (scoreINV >= MIN_SCORE && scoreINV > scorePL) return "INV";
  return "UNKNOWN";
}
