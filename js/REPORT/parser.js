/**
 * parser.js — Pembacaan file XLSX & ekstraksi data dokumen BC
 *
 * Depends on: XLSX (global), utils.js, mapper.js
 */

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

/** Cari index kolom berdasarkan keyword (case-insensitive, includes) */
function findColIndex(header, keyword) {
  return header.findIndex((h) =>
    String(h || "")
      .toUpperCase()
      .includes(keyword.toUpperCase()),
  );
}

/**
 * Build map {aju → namaEntitas} dari sheet ENTITAS
 */
function buildEntitasMap(wb, targetKode) {
  const sheet = wb.Sheets["ENTITAS"];
  if (!sheet) return {};

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju = findColIndex(header, "AJU");
  const idxKode = findColIndex(header, "KODE");
  const idxNama = findColIndex(header, "NAMA");

  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const aju = String(rows[i][idxAju] || "").trim();
    const kode = String(rows[i][idxKode] || "").trim();
    if (aju && kode == targetKode) {
      map[aju] = String(rows[i][idxNama] || "").trim();
    }
  }
  return map;
}

/**
 * Parse sheet HEADER → objek dokumen awal, diindex per AJU
 */
function parseHeaderSheet(wb) {
  const sheet = wb.Sheets["HEADER"];
  if (!sheet) return {};

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju = findColIndex(header, "AJU");
  const idxBC = findColIndex(header, "NOMOR DAFTAR");
  const idxJenis = findColIndex(header, "KODE TUJUAN PENGIRIMAN");

  const docs = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!aju) continue;

    docs[aju] = {
      aju,
      bc: row[idxBC] || "",
      jenistrx: mapJenisTransaksi(String(row[idxJenis] || "").trim()),
      kemasan: {},
      barang: { map: {} },
      namaBarang: [],
      segel: "",
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

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju = findColIndex(header, "AJU");
  const idxKode = findColIndex(header, "KODE KEMASAN");
  const idxJumlah = findColIndex(header, "JUMLAH");
  const idxSegel = findColIndex(header, "SEGEL");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!docs[aju]) continue;

    const kode = String(row[idxKode] || "").trim();
    const qty = Number(row[idxJumlah]) || 0;

    if (kode) {
      docs[aju].kemasan[kode] = (docs[aju].kemasan[kode] || 0) + qty;
    }

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

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju = findColIndex(header, "AJU");
  const idxJumlah = findColIndex(header, "JUMLAH");
  const idxSatuan = findColIndex(header, "SATUAN");
  const idxUraian = findColIndex(header, "URAIAN");
  const idxMerek = findColIndex(header, "MEREK");
  const idxTipe = findColIndex(header, "TIPE");
  const idxUkuran = findColIndex(header, "UKURAN");
  const idxSpek = findColIndex(header, "SPESIFIKASI");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!docs[aju]) continue;

    const qty = Number(row[idxJumlah]) || 0;
    const unit = String(row[idxSatuan] || "").trim();

    if (qty > 0 && unit) {
      docs[aju].barang.map[unit] = (docs[aju].barang.map[unit] || 0) + qty;
    }

    function cleanVal(v) {
      if (v === null || v === undefined) return "";
      const val = String(v).trim();
      if (val === "" || val === "-") return "";
      return val;
    }

    const parts = [
      cleanVal(row[idxUraian]),
      cleanVal(row[idxMerek]),
      cleanVal(row[idxTipe]),
      cleanVal(row[idxUkuran]),
      cleanVal(row[idxSpek]),
    ].filter(Boolean);

    if (parts.length) {
      docs[aju].namaBarang.push(parts.join(" "));
    }
  }
}

/**
 * Tentukan tanggal dokumen dari sheet RESPON berdasarkan PRIORITAS_KODE
 */
function parseResponSheet(wb, docs) {
  const sheet = wb.Sheets["RESPON"];
  if (!sheet) return;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows[0] || [];

  const idxAju = findColIndex(header, "AJU");
  const idxKode = findColIndex(header, "KODE");
  const idxTanggal = findColIndex(header, "TANGGAL");

  // Kumpulkan semua tanggal valid per aju per kode
  const tempTanggal = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const aju = String(row[idxAju] || "").trim();
    if (!docs[aju]) continue;

    const kode = String(row[idxKode] || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/\.0$/, "");

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

/**
 * Ekstrak semua dokumen dari satu workbook
 * @param {Object} wb — XLSX workbook
 * @returns {Array} array dokumen siap render/format
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
  const entitasMap = buildEntitasMap(wb, kodeEntitas);

  return Object.values(docs).map((d) => ({
    ...d,
    pengirim: entitasMap[d.aju] || "",
    entitasBC: entitasMap[d.aju] || "",
    namaBarang: [...new Set(d.namaBarang)],
  }));
}
