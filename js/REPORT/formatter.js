/**
 * formatter.js — Generate teks laporan per jenis BC
 *
 * Depends on: utils.js, mapper.js
 */

/**
 * Format tanggal dokumen dari array Date menjadi string ringkasan
 * Contoh: "01/06/2025, 03-05/06/2025"
 */
function formatTanggalDokumen(arr) {
  if (!arr.length) return "";

  const sorted = [...new Set(arr.map((t) => t.getTime()))]
    .map((t) => new Date(t))
    .sort((a, b) => a - b);

  const groups = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if ((cur - end) / 86400000 === 1) {
      end = cur;
    } else {
      groups.push([start, end]);
      start = end = cur;
    }
  }
  groups.push([start, end]);

  return groups
    .map(([s, e]) =>
      s.getTime() === e.getTime()
        ? fmtDate(s)
        : `${String(s.getDate()).padStart(2, "0")}-${String(
            e.getDate()
          ).padStart(2, "0")}` +
          `/${String(s.getMonth() + 1).padStart(2, "0")}/${s.getFullYear()}`
    )
    .join(", ");
}

/**
 * Agregasi data: total kemasan, barang, segel, tanggal dari array dokumen
 */
function buildAggregates(dataArr) {
  const kemasanMap = {};
  const barangMap = {};
  const segelList = [];
  const tanggalArr = [];

  dataArr.forEach((d) => {
    if (d.segel) segelList.push(d.segel);
    if (d.tanggal) tanggalArr.push(d.tanggal);
    for (const [u, q] of Object.entries(d.kemasan))
      kemasanMap[u] = (kemasanMap[u] || 0) + q;
    for (const [u, q] of Object.entries(d.barang.map))
      barangMap[u] = (barangMap[u] || 0) + q;
  });

  return { kemasanMap, barangMap, segelList, tanggalArr };
}

/**
 * Kelompokkan nomor BC berdasarkan jalur + jenis transaksi
 * @returns { bcGrouped: {key → [noBC]}, bcList: {jenistrx → [noBC]} }
 */
function buildBCGrouped(dataArr, jalurOverrideMap, defaultJalur) {
  const bcGrouped = {};
  const bcList = {};

  dataArr.forEach((d) => {
    const jalur =
      jalurOverrideMap[d.bc] || jalurOverrideMap[d.aju] || defaultJalur;
    const key = `${jalur} | ${d.jenistrx}`;

    if (!bcGrouped[key]) bcGrouped[key] = [];
    if (d.bc) bcGrouped[key].push(d.bc);

    if (!bcList[d.jenistrx]) bcList[d.jenistrx] = [];
    if (d.bc) bcList[d.jenistrx].push(d.bc);
  });

  return { bcGrouped, bcList };
}

// ============================================================
// FORMAT STRATEGY: BC 4.0 & BC 4.1
// ============================================================
function formatBC4x(
  dataArr,
  rawBC,
  bc,
  arah,
  jenisBarang,
  masukTxt,
  jalurOverrideMap,
  defaultJalur
) {
  const { kemasanMap, barangMap, tanggalArr } = buildAggregates(dataArr);
  const { bcGrouped } = buildBCGrouped(dataArr, jalurOverrideMap, defaultJalur);

  const labelEntitas = bc === "BC 4.0" ? "Supplier" : "Tujuan";
  const tanggalLabel = arah === "Keluar" ? "Tanggal Keluar" : "Tanggal Masuk";
  const entitas = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].join(" | ");

  return [
    `*${rawBC}*`,
    `${labelEntitas} : ${entitas}`,
    ...Object.entries(bcGrouped).map(
      ([k, v]) => `No BC (${k}) : ${v.join(", ")}`
    ),
    `Jumlah Dokumen : ${dataArr.length} Dokumen`,
    `Jenis Barang : ${jenisBarang}`,
    `Jumlah barang : ${formatKeyValue(barangMap)}`,
    `Jumlah kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `${tanggalLabel} : ${masukTxt}`,
  ].join("\n");
}

// ============================================================
// FORMAT STRATEGY: BC 2.7 Keluar
// ============================================================
function formatBC27Keluar(
  dataArr,
  jenisBarang,
  masukTxt,
  jalurOverrideMap,
  defaultJalur
) {
  const { kemasanMap, barangMap, segelList, tanggalArr } =
    buildAggregates(dataArr);
  const { bcGrouped } = buildBCGrouped(dataArr, jalurOverrideMap, defaultJalur);

  const pengirim = [
    ...new Set(dataArr.map((d) => d.pengirim).filter(Boolean)),
  ].join(" | ");

  // Sort by jalur order
  const sortedKeys = Object.keys(bcGrouped).sort((a, b) => {
    const ja = a.split("|")[0].trim();
    const jb = b.split("|")[0].trim();
    return (JALUR_ORDER[ja] || 99) - (JALUR_ORDER[jb] || 99);
  });

  return [
    `*BC 2.7 Keluar*`,
    `Customer : ${pengirim}`,
    ...sortedKeys.map((k) => `BC 2.7 (${k}) : ${bcGrouped[k].join(", ")}`),
    `No. Segel : ${segelList.join(", ")}`,
    `Jumlah Dokumen : ${dataArr.length} Dokumen`,
    `Jenis Barang : ${jenisBarang}`,
    `Jumlah Barang : ${formatKeyValue(barangMap)}`,
    `Kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `Tanggal Keluar : ${masukTxt}`,
  ].join("\n");
}

// ============================================================
// FORMAT STRATEGY: BC 2.7 Masuk
// ============================================================
function formatBC27Masuk(dataArr, jenisBarang, masukTxt) {
  const { kemasanMap, barangMap, segelList, tanggalArr } =
    buildAggregates(dataArr);
  const { bcList } = buildBCGrouped(dataArr, {}, "HIJAU");

  const pengirim = [
    ...new Set(dataArr.map((d) => d.pengirim).filter(Boolean)),
  ].join(" | ");

  return [
    `*BC 2.7 Masuk*`,
    `Supplier : ${pengirim}`,
    ...Object.entries(bcList).map(
      ([j, l]) => `No BC 2.7 (${j}) : ${l.join(", ")}`
    ),
    `No Segel : ${segelList.join(", ")}`,
    `Jumlah Dokumen : ${dataArr.length} Dokumen`,
    `Jenis Barang : ${jenisBarang}`,
    `Jumlah barang : ${formatKeyValue(barangMap)}`,
    `Jumlah kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `Tanggal Masuk : ${masukTxt}`,
  ].join("\n");
}

// ============================================================
// ENTRY POINT — Strategy dispatcher
// ============================================================

/** Map BC → formatter function */
const BC_FORMATTERS = {
  "BC 4.0": (arr, rawBC, bc, arah, jb, tgl, jom, dj) =>
    formatBC4x(arr, rawBC, bc, arah, jb, tgl, jom, dj),
  "BC 4.1": (arr, rawBC, bc, arah, jb, tgl, jom, dj) =>
    formatBC4x(arr, rawBC, bc, arah, jb, tgl, jom, dj),
  "BC 2.7_Keluar": (arr, _rawBC, _bc, _arah, jb, tgl, jom, dj) =>
    formatBC27Keluar(arr, jb, tgl, jom, dj),
  "BC 2.7_Masuk": (arr, _rawBC, _bc, _arah, jb, tgl) =>
    formatBC27Masuk(arr, jb, tgl),
};

/**
 * Generate teks laporan lengkap
 * @param {Array} dataArr — data dokumen (sudah di-filter)
 * @returns {string}
 */
function generateResultText(dataArr) {
  if (!dataArr.length) return "";

  const rawBC = $("jenisBC").value;
  const { bc, arah } = parseJenisBC(rawBC);
  const statusJalurVal = $("statusJalur")?.value || "HIJAU";
  const jenisBarang = getSelectedValues("jenisBarang").join(" + ");
  const masukTxt = fmtDate(new Date($("masukTgl").value));

  // Saat MERAH: nomor daftar yg dipilih di Choices = MERAH, sisanya HIJAU
  let defaultJalur, jalurOverrideMap;
  if (statusJalurVal === "MERAH") {
    defaultJalur = "HIJAU";
    jalurOverrideMap = {};
    Array.from($("jalurOverride").selectedOptions).forEach((o) => {
      jalurOverrideMap[o.value] = "MERAH";
    });
  } else {
    defaultJalur = statusJalurVal;
    jalurOverrideMap = {};
  }

  const key = BC_FORMATTERS[bc] ? bc : `BC 2.7_${arah}`;

  const formatter = BC_FORMATTERS[key] || BC_FORMATTERS["BC 2.7_Masuk"];
  return formatter(
    dataArr,
    rawBC,
    bc,
    arah,
    jenisBarang,
    masukTxt,
    jalurOverrideMap,
    defaultJalur
  );
}
