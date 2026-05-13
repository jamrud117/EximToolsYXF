/**
 * parser.js — Pembacaan file XLSX & ekstraksi data dokumen BC
 *
 * Depends on: XLSX (global), config.js, utils.js, mapper.js
 */

// ─── File Reading ─────────────────────────────────────────────────────────────

/**
 * Baca file XLSX → workbook
 * @param {File} file
 * @returns {Promise<{file, wb}>}
 */
function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        resolve({ file, wb });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error(`Gagal membaca: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Sheet Helpers ────────────────────────────────────────────────────────────

/** Cari index kolom berdasarkan keyword (case-insensitive, includes) */
function findColIndex(header, keyword) {
  return header.findIndex((h) =>
    String(h || "")
      .toUpperCase()
      .includes(keyword.toUpperCase())
  );
}

/**
 * Build map { aju → namaEntitas } dari sheet ENTITAS
 * @param {Object} wb
 * @param {number} targetKode — kode entitas yang dicari
 */
function buildEntitasMap(wb, targetKode) {
  const sheet = wb.Sheets["ENTITAS"];
  if (!sheet) return {};

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju  = findColIndex(header, "AJU");
  const idxKode = findColIndex(header, "KODE");
  const idxNama = findColIndex(header, "NAMA");

  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const aju  = String(rows[i][idxAju]  || "").trim();
    const kode = String(rows[i][idxKode] || "").trim();
    if (aju && kode == targetKode) {
      map[aju] = String(rows[i][idxNama] || "").trim();
    }
  }
  return map;
}

// ─── Sheet Parsers ────────────────────────────────────────────────────────────

/**
 * Parse sheet HEADER → objek dokumen awal, diindex per AJU
 */
function parseHeaderSheet(wb) {
  const sheet = wb.Sheets["HEADER"];
  if (!sheet) return {};

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju     = findColIndex(header, "AJU");
  const idxBC      = findColIndex(header, "NOMOR DAFTAR");
  const idxJenis   = findColIndex(header, "KODE TUJUAN PENGIRIMAN");
  const idxKodeDok = findColIndex(header, "KODE DOKUMEN");
  const idxTujuan  = findColIndex(header, "KODE TUJUAN PEMASUKAN");

  const docs = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!aju) continue;

    const rawKodeDok = String(row[idxKodeDok] || "").trim().replace(/\.0$/, "");
    const bcForMap =
      rawKodeDok === "261" ? "BC 2.6.1" :
      rawKodeDok === "262" ? "BC 2.6.2" : null;

    let jenistrx;
    if (bcForMap) {
      // BC 2.6.1 → KODE TUJUAN PENGIRIMAN, BC 2.6.2 → KODE TUJUAN PEMASUKAN
      const tujuanColIdx = bcForMap === "BC 2.6.1" ? idxJenis : idxTujuan;
      const kode = tujuanColIdx !== -1
        ? String(row[tujuanColIdx] || "").trim().replace(/\.0$/, "")
        : "";
      jenistrx = mapJenisTrxBC26(bcForMap, kode);
    } else {
      jenistrx = mapJenisTransaksi(String(row[idxJenis] || "").trim());
    }

    docs[aju] = {
      aju,
      bc: row[idxBC] || "",
      jenistrx,
      kemasan: {},
      barang:  { map: {} },
      namaBarang: [],
      segel:   "",
      tanggal: null,
    };
  }
  return docs;
}

/**
 * Isi field kemasan & segel pada docs dari sheet KEMASAN
 */
function parseKemasanSheet(wb, docs) {
  const sheet = wb.Sheets["KEMASAN"];
  if (!sheet) return;

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju    = findColIndex(header, "AJU");
  const idxKode   = findColIndex(header, "KODE KEMASAN");
  const idxJumlah = findColIndex(header, "JUMLAH");
  const idxSegel  = findColIndex(header, "SEGEL");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!docs[aju]) continue;

    const kode = String(row[idxKode] || "").trim();
    const qty  = Number(row[idxJumlah]) || 0;

    if (kode) docs[aju].kemasan[kode] = (docs[aju].kemasan[kode] || 0) + qty;

    if (!docs[aju].segel && idxSegel !== -1 && row[idxSegel]) {
      docs[aju].segel = String(row[idxSegel]).trim();
    }
  }
}

/**
 * Isi field barang & namaBarang dari sheet BARANG
 */
function parseBarangSheet(wb, docs) {
  const sheet = wb.Sheets["BARANG"];
  if (!sheet) return;

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju    = findColIndex(header, "AJU");
  const idxJumlah = findColIndex(header, "JUMLAH");
  const idxSatuan = findColIndex(header, "SATUAN");
  const idxUraian = findColIndex(header, "URAIAN");
  const idxMerek  = findColIndex(header, "MEREK");
  const idxTipe   = findColIndex(header, "TIPE");
  const idxUkuran = findColIndex(header, "UKURAN");
  const idxSpek   = findColIndex(header, "SPESIFIKASI");

  const cleanVal = (v) => {
    if (v === null || v === undefined) return "";
    const val = String(v).trim();
    return val === "" || val === "-" ? "" : val;
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!docs[aju]) continue;

    const qty  = Number(row[idxJumlah]) || 0;
    const unit = String(row[idxSatuan] || "").trim();

    if (qty > 0 && unit) {
      docs[aju].barang.map[unit] = (docs[aju].barang.map[unit] || 0) + qty;
    }

    const parts = [
      cleanVal(row[idxUraian]),
      cleanVal(row[idxMerek]),
      cleanVal(row[idxTipe]),
      cleanVal(row[idxUkuran]),
      cleanVal(row[idxSpek]),
    ].filter(Boolean);

    if (parts.length) docs[aju].namaBarang.push(parts.join(" "));
  }
}

/**
 * Tentukan tanggal dokumen dari sheet RESPON berdasarkan PRIORITAS_KODE
 */
function parseResponSheet(wb, docs) {
  const sheet = wb.Sheets["RESPON"];
  if (!sheet) return;

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju     = findColIndex(header, "AJU");
  const idxKode    = findColIndex(header, "KODE");
  const idxTanggal = findColIndex(header, "TANGGAL");

  const tempTanggal = {};

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const aju  = String(row[idxAju]  || "").trim();
    if (!docs[aju]) continue;

    const kode = String(row[idxKode] || "").trim().replace(/\s+/g, "").replace(/\.0$/, "");
    if (!PRIORITAS_KODE.includes(kode)) continue;

    const d = parseDate(row[idxTanggal]);
    if (!d) continue;

    if (!tempTanggal[aju]) tempTanggal[aju] = {};
    tempTanggal[aju][kode] = d;
  }

  // Assign tanggal terbaik berdasarkan prioritas
  Object.keys(tempTanggal).forEach((aju) => {
    for (const k of PRIORITAS_KODE) {
      if (tempTanggal[aju][k]) {
        docs[aju].tanggal = tempTanggal[aju][k];
        break;
      }
    }
  });
}

// ─── BC Detection ─────────────────────────────────────────────────────────────

/**
 * Cek apakah entitas kode '3' di sheet ENTITAS adalah perusahaan sendiri.
 * Digunakan untuk menentukan arah BC 2.7.
 */
function detectMyCompanyFromEntitas(wb) {
  const sheet = wb.Sheets["ENTITAS"];
  if (!sheet) return false;

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxKode = findColIndex(header, "KODE");
  const idxNama = findColIndex(header, "NAMA");
  if (idxKode === -1 || idxNama === -1) return false;

  for (let i = 1; i < rows.length; i++) {
    const kode = String(rows[i][idxKode] || "").trim();
    const nama  = String(rows[i][idxNama] || "").trim().toUpperCase();
    if (kode === "3" && nama.includes(MY_COMPANY_NAME)) return true;
  }
  return false;
}

/**
 * Deteksi jenis BC dari workbook berdasarkan KODE DOKUMEN di sheet HEADER.
 * @param {Object} wb
 * @returns {string|null} — e.g. "BC 2.7 Masuk", "BC 4.0 Masuk", null
 */
function detectJenisBCFromWorkbook(wb) {
  const sheet = wb.Sheets["HEADER"];
  if (!sheet) return null;

  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxKodeDok = findColIndex(header, "KODE DOKUMEN");
  if (idxKodeDok === -1) return null;

  let kodeDok = null;
  for (let i = 1; i < rows.length; i++) {
    const val = String(rows[i][idxKodeDok] || "").trim().replace(/\.0$/, "");
    if (val) { kodeDok = val; break; }
  }
  if (!kodeDok) return null;

  if (KODE_BC_MAP[kodeDok]) return KODE_BC_MAP[kodeDok];

  // BC 2.7: arah dari sheet ENTITAS
  if (kodeDok === "27") {
    return detectMyCompanyFromEntitas(wb) ? "BC 2.7 Keluar" : "BC 2.7 Masuk";
  }

  return null;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────

/**
 * Ekstrak semua dokumen dari workbook → array siap render/format
 * @param {Object} wb
 * @returns {Array}
 */
function extractMultipleDocuments(wb) {
  const rawBC = $("jenisBC").value;
  const { bc, arah } = parseJenisBC(rawBC);

  const docs = parseHeaderSheet(wb);
  if (!Object.keys(docs).length) return [];

  parseKemasanSheet(wb, docs);
  parseBarangSheet(wb, docs);
  parseResponSheet(wb, docs);

  const kodeEntitas = getKodeEntitas(bc, arah);
  const entitasMap  = buildEntitasMap(wb, kodeEntitas);

  return Object.values(docs).map((d) => ({
    ...d,
    pengirim:   entitasMap[d.aju] || "",
    entitasBC:  entitasMap[d.aju] || "",
    namaBarang: [...new Set(d.namaBarang)],
  }));
}
