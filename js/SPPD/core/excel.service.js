// ============================================================
// core/excel.service.js — Excel reading & sheet data extraction
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
        const data = new Uint8Array(e.target.result);
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
 */
function detectFileType(wb, debug = true) {
  const names = wb.SheetNames.map((n) => n.toUpperCase().trim());
  const has = (key) => names.some((n) => n.includes(key));

  if (debug) {
    console.group("📁 DETECT FILE TYPE");
    console.log("Sheet Names:", names);
  }

  // ===== DATA DETECTION =====
  const dataCheck = {
    HEADER: has("HEADER"),
    BARANG: has("BARANG"),
    KEMASAN: has("KEMASAN"),
    DOKUMEN: has("DOKUMEN"),
  };

  if (debug) console.log("DATA Check:", dataCheck);

  if (
    dataCheck.HEADER &&
    dataCheck.BARANG &&
    dataCheck.KEMASAN &&
    dataCheck.DOKUMEN
  ) {
    if (debug) {
      console.log("✅ RESULT: DATA");
      console.groupEnd();
    }
    return "DATA";
  }

  let scoreINV = 0;
  let scorePL = 0;

  const foundKeywords = {
    INV: [],
    PL: [],
  };

  const MIN_SCORE = 4;

  // ===== SCAN ALL SHEETS =====
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      if (debug) console.warn(`⚠️ Sheet ${sheetName} kosong`);
      continue;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const maxRow = Math.min(range.e.r, 30);
    const maxCol = Math.min(range.e.c, 20);

    if (debug) {
      console.log(
        `🔍 Scan Sheet: ${sheetName} (Row ${range.s.r}-${maxRow}, Col ${range.s.c}-${maxCol})`
      );
    }

    for (let r = range.s.r; r <= maxRow; r++) {
      for (let c = range.s.c; c <= maxCol; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v == null) continue;

        const v = String(cell.v).toUpperCase().trim();
        const isHeaderRow = r < 5;

        // ===== NORMALISASI =====
        const normalized = v.replace(/\./g, "").replace(/\s+/g, " ");

        // ===== PL (Packing List) =====
        if (normalized.includes("PACKING LIST")) {
          scorePL += isHeaderRow ? 10 : 5;
          foundKeywords.PL.push(v);
        }

        if (normalized.includes("NO KONTRAK")) {
          scorePL += isHeaderRow ? 8 : 4;
          foundKeywords.PL.push(v);
        }

        if (normalized.includes("KEMASAN")) {
          scorePL += 3;
          foundKeywords.PL.push(v);
        }

        if (normalized.includes("GROSS WEIGHT") || normalized === "GW") {
          scorePL += 2;
          foundKeywords.PL.push(v);
        }

        if (normalized.includes("NET WEIGHT") || normalized === "NW") {
          scorePL += 2;
          foundKeywords.PL.push(v);
        }

        // ===== INV (Invoice) =====
        if (normalized.includes("INVOICE")) {
          scoreINV += isHeaderRow ? 10 : 5;
          foundKeywords.INV.push(v);
        }

        if (normalized.includes("UNIT PRICE") || normalized.includes("HARGA")) {
          scoreINV += 3;
          foundKeywords.INV.push(v);
        }

        if (normalized === "AMOUNT") {
          scoreINV += 1;
          foundKeywords.INV.push(v);
        }
      }
    }
  }

  if (debug) {
    console.log("📊 Score INV:", scoreINV);
    console.log("📊 Score PL:", scorePL);
    console.log("🔎 Found INV keywords:", foundKeywords.INV.slice(0, 10));
    console.log("🔎 Found PL keywords:", foundKeywords.PL.slice(0, 10));
  }

  // ===== FINAL DECISION =====
  let result = "UNKNOWN";

  if (scorePL >= MIN_SCORE && scorePL > scoreINV) {
    result = "PL";
  } else if (scoreINV >= MIN_SCORE && scoreINV > scorePL) {
    result = "INV";
  }

  if (debug) {
    console.log("📊 FINAL COMPARISON:", {
      scoreINV,
      scorePL,
      result,
    });

    if (result === "UNKNOWN") {
      console.warn("❗ Tidak cukup kuat untuk menentukan tipe file");
    }

    console.groupEnd();
  }

  return result;
}
// ── Low-level cell accessors ─────────────────────────────────

function getCellValue(sheet, cell) {
  const c = sheet[cell];
  return c ? c.v : "";
}

function getCellValueRC(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return "";
  if (cell.t === "s") return String(cell.v).trim();
  return cell.v ?? "";
}

function getCellTextRC(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return "";
  if (cell.t === "s") return String(cell.v).trim();
  if (cell.t === "n" && cell.w) return String(cell.w).trim();
  return String(cell.v ?? "").trim();
}

// ── Header-based column finder ───────────────────────────────

/**
 * Scan a sheet for header keywords and return column indices.
 * @param {Object} sheet
 * @param {Object} headers  - { key: 'HEADER_KEYWORD' }
 * @returns {Object} { ...found_keys, headerRow }
 */
function findHeaderColumns(sheet, headers) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const found = {};
  let headerRow = null;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || !cell.v) continue;
      const v = String(cell.v).toUpperCase();

      const val = cell.v.toString().trim().toUpperCase();

      for (const [key, target] of Object.entries(headers)) {
        if (!target) continue;
        if (val.includes(String(target).toUpperCase())) found[key] = c;
      }
    }

    if (Object.keys(found).length > 0) {
      headerRow = r;
      break;
    }
  }

  return { ...found, headerRow };
}

// ── PL Aggregation ───────────────────────────────────────────

/**
 * Sum packaging count, GW, and NW from a PL sheet.
 * Also detects the packaging unit label.
 */
function hitungKemasanNWGW(sheet) {
  const EMPTY = { kemasanSum: 0, bruttoSum: 0, nettoSum: 0, kemasanUnit: "" };
  if (!sheet || !sheet["!ref"]) return EMPTY;

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let colKemasan = null,
    colGW = null,
    colNW = null,
    headerRow = null;

  // Locate header row
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || typeof cell.v !== "string") continue;
      const val = cell.v.toUpperCase();
      if (val.includes("KEMASAN")) colKemasan = c;
      if (val.includes("GW")) colGW = c;
      if (val.includes("NW")) colNW = c;
    }
    if (colKemasan !== null && colGW !== null && colNW !== null) {
      headerRow = r;
      break;
    }
  }

  if (headerRow === null) return EMPTY;

  // Detect packaging unit
  const kemasanUnit = _detectKemasanUnit(sheet, colKemasan, headerRow, range);

  // Find first data row (column A contains a numeric serial)
  let dataStartRow = headerRow + 1;
  for (let r = dataStartRow; r <= range.e.r; r++) {
    const serial = getCellValueRC(sheet, r, 0);
    if (serial !== "" && !isNaN(Number(serial))) {
      dataStartRow = r;
      break;
    }
  }

  // Accumulate totals
  let totalKemasan = 0,
    totalGW = 0,
    totalNW = 0;
  for (let r = dataStartRow; r <= range.e.r; r++) {
    const serial = getCellValueRC(sheet, r, 0);
    if (serial === "" || isNaN(Number(serial))) continue;
    totalKemasan += parseInt(getCellValueRC(sheet, r, colKemasan)) || 0;
    totalGW += parseFloat(getCellValueRC(sheet, r, colGW)) || 0;
    totalNW += parseFloat(getCellValueRC(sheet, r, colNW)) || 0;
  }

  return {
    kemasanSum: totalKemasan,
    bruttoSum: totalGW,
    nettoSum: totalNW,
    kemasanUnit,
  };
}

function _detectKemasanUnit(sheet, col, headerRow, range) {
  const headerText = getCellValueRC(sheet, headerRow, col);
  const m = String(headerText || "").match(/KEMASAN\s*(.*)/i);
  if (m && m[1] && m[1].trim()) return m[1].trim().toUpperCase();

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

// ── PL Unit Detection ────────────────────────────────────────

/**
 * Detect per-item or global QTY units from a PL sheet.
 * @returns {{ type: 'GLOBAL'|'PER_ITEM'|'UNKNOWN', unit?: string, data: Array }}
 */
function getPLUnits(sheetPL) {
  const range = XLSX.utils.decode_range(sheetPL["!ref"]);
  let colQty = null,
    colUnit = null,
    headerRow = null,
    globalUnit = "";

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

      if (v.includes("SATUAN") || v.includes("UNIT")) colUnit = c;
    }

    if (colQty !== null) {
      headerRow = r;
      break;
    }
  }

  if (colQty === null) return { type: "UNKNOWN", data: [] };

  const items = [];
  const unitSet = new Set();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const qty = getCellValueRC(sheetPL, r, colQty);
    if (!qty || isNaN(qty)) continue;

    let unit = colUnit !== null ? getCellValueRC(sheetPL, r, colUnit) : "";
    if (!unit && globalUnit) unit = globalUnit;

    const normUnit = normalizeQtyUnit(unit);
    if (normUnit) unitSet.add(normUnit);

    items.push({ qty: Number(qty), unit: normUnit || null });
  }

  if (unitSet.size > 1) return { type: "PER_ITEM", data: items };
  if (unitSet.size === 1)
    return { type: "GLOBAL", unit: [...unitSet][0], data: items };
  return { type: "UNKNOWN", data: items };
}

// ── Draft-sheet helpers ──────────────────────────────────────

function getNPWPDraft(sheetsDATA) {
  const sheet =
    sheetsDATA.ENTITAS || sheetsDATA.HDR_ENTITAS || sheetsDATA.entitas;
  if (!sheet) return "";
  return _getEntitasField(sheet, "NOMOR IDENTITAS", (row) => fixNpwp(row));
}

function getAddressDraft(sheetsDATA) {
  const sheet = sheetsDATA.ENTITAS;
  if (!sheet) return "";
  return _getEntitasField(sheet, "ALAMAT ENTITAS", (row) => row);
}

function getCustomerDraft(sheetsDATA) {
  const sheet = sheetsDATA.ENTITAS;
  if (!sheet) return "";
  return _getEntitasField(sheet, "NAMA ENTITAS", (row) => row);
}

/**
 * Generic helper: find column by header, then return value for KODE ENTITAS = 8.
 */
function _getEntitasField(sheet, targetHeader, transform) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let colKode = null;
  let colTarget = null;

  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    const h = String(cell.v).toUpperCase();
    if (h.includes("KODE ENTITAS")) colKode = c;
    if (h.includes(targetHeader.toUpperCase())) colTarget = c;
  }

  if (colKode === null || colTarget === null) return "";

  for (let r = 1; r <= range.e.r; r++) {
    if (String(getCellValueRC(sheet, r, colKode)).trim() === "8") {
      return transform(getCellValueRC(sheet, r, colTarget));
    }
  }

  return "";
}

function fixNpwp(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  if (/e\+/i.test(s)) {
    try {
      s = BigInt(Number(raw).toFixed(0)).toString();
    } catch {
      s = String(Number(raw));
    }
  }

  s = s.replace(/[^0-9]/g, "");
  if (s.length < 22) s = s.padStart(22, "0");
  if (s.length > 22) s = s.slice(-22);
  return s;
}

function getDocumentNumber(sheet, kodeDokumenTarget) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (!rows || rows.length === 0) return "";

  const headerRow = rows[0].map((h) =>
    (h || "").toString().trim().toUpperCase()
  );
  const kodeIdx = headerRow.indexOf("KODE DOKUMEN");
  const nomorIdx = headerRow.indexOf("NOMOR DOKUMEN");
  if (kodeIdx === -1 || nomorIdx === -1) return "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (String(row[kodeIdx]).trim() === String(kodeDokumenTarget))
      return row[nomorIdx] ?? "";
  }

  return "";
}

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

function getExBCFromDraft(sheet, kodeDokumen) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const nomorArr = [];
  const tanggalArr = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const kode = getCellValueRC(sheet, r, 2);
    if (String(kode).trim() !== String(kodeDokumen)) continue;

    const nomorRaw = getCellTextRC(sheet, r, 3);
    const tanggalRaw = getCellValueRC(sheet, r, 4);

    if (nomorRaw) nomorArr.push(String(nomorRaw).trim());
    if (tanggalRaw) tanggalArr.push(parseExcelDate(tanggalRaw));
  }

  return {
    nomorArr,
    tanggalArr,
    nomorText: nomorArr.join(", "),
    tanggalText: tanggalArr.join(", "),
  };
}

/**
 * Scan sheet for text containing DATE keywords and return the cell text.
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

  // Fallback: concatenate all string cells
  const allText = Object.values(sheet)
    .filter((c) => c && typeof c.v === "string")
    .map((c) => c.v)
    .join(" ");

  const match = allText.match(/DATE\s*[:\-]?\s*([A-Za-z0-9 ,\/\-]+)/i);
  return match ? match[0] : "";
}

/**
 * Locate invoice / packing-list number from a sheet.
 */
function findInvoiceNo(sheet) {
  const KEYWORDS = ["INVOICE NO", "PACKINGLIST NO", "PACKING LIST NO"];
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || typeof cell.v !== "string") continue;

      const cellText = cell.v.toUpperCase();
      if (!KEYWORDS.some((k) => cellText.includes(k))) continue;

      for (const line of cell.v.split(/\r?\n/)) {
        const foundKey = KEYWORDS.find((k) => line.toUpperCase().includes(k));
        if (!foundKey) continue;

        const parts = line.split(":");
        if (parts.length > 1) {
          let value = parts[1]
            .trim()
            .split(/DATE/i)[0]
            .trim()
            .split(/\s+/)[0]
            .trim();
          return value;
        }
      }
    }
  }

  return "";
}

/**
 * Fetch current exchange rate from remote spreadsheet.
 * Returns 1 for IDR, null on failure.
 */
async function getKursFromSpreadsheet(valuta) {
  if (String(valuta).toUpperCase() === "IDR") return 1;

  const SHEET_ID = "1z0BMzWLQbKvhcDOSX3ZZeQ8e5g3wk9wHEHIxpIfuoi4";
  const SHEET_NAME = "KURS";
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_NAME}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0)
      throw new Error("Sheet KURS kosong");

    const row = rows.find((r) =>
      String(r["Mata Uang"] || "")
        .toUpperCase()
        .includes(`(${valuta.toUpperCase()})`)
    );

    if (!row) throw new Error(`Valuta ${valuta} tidak ditemukan`);

    const kursRaw = row["Nilai"];
    if (!kursRaw) throw new Error("Kolom Nilai kosong");

    const kurs = Number(String(kursRaw).replace(/\./g, "").replace(",", "."));
    if (isNaN(kurs)) throw new Error(`Nilai kurs tidak valid: ${kursRaw}`);

    return kurs;
  } catch (err) {
    console.error("Gagal ambil kurs:", err);
    return null;
  }
}
