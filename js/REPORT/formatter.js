/**
 * formatter.js — Generate teks laporan per jenis BC
 *
 * Depends on: config.js, utils.js, mapper.js
 */

// ─── Date Formatting ──────────────────────────────────────────────────────────

/**
 * Format tanggal dokumen dari array Date menjadi string ringkasan.
 * Contoh output: "01/06/2025, 03-05/06/2025"
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

// ─── Aggregation ──────────────────────────────────────────────────────────────

/** Agregasi total kemasan, barang, segel, tanggal dari array dokumen */
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
 * Kelompokkan nomor BC berdasarkan jalur + jenis transaksi.
 * @returns {{ bcGrouped: Object, bcList: Object }}
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

// ─── Formatters ───────────────────────────────────────────────────────────────

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

/**
 * BC 2.6.1 Keluar — jenis transaksi diambil dari data (d.jenistrx), bukan dari DOM.
 */
function formatBC261Keluar(dataArr, jenisBarang, masukTxt) {
  const { kemasanMap, barangMap, tanggalArr } = buildAggregates(dataArr);
  const entitas = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].join(" | ");

  // Ambil label jenis transaksi langsung dari data yang sudah di-parse
  const jenisTrxLabel = dataArr[0]?.jenistrx || "";
  const judul = jenisTrxLabel
    ? `BC 2.6.1 Keluar (${jenisTrxLabel})`
    : "BC 2.6.1 Keluar";

  const bcList = [...new Set(dataArr.map((d) => d.bc).filter(Boolean))];
  const statusJalurVal = $("statusJalur")?.value || "HIJAU";

  return [
    `*${judul}*`,
    `Suplier : ${entitas}`,
    `No. BC 2.6.1 : ${bcList.join(", ")}`,
    `Jenis Barang : ${jenisBarang}`,
    `Jumlah Barang : ${formatKeyValue(barangMap)}`,
    `Jumlah Kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `Tanggal Keluar : ${masukTxt}`,
    `Status Jalur : ${statusJalurVal}`,
  ].join("\n");
}

/**
 * BC 2.6.2 Masuk — jenis transaksi diambil dari data (d.jenistrx), bukan dari DOM.
 */
function formatBC262Masuk(dataArr, jenisBarang, masukTxt) {
  const { kemasanMap, barangMap, tanggalArr } = buildAggregates(dataArr);
  const entitas = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].join(" | ");

  const jenisTrxLabel = dataArr[0]?.jenistrx || "";
  const judul = jenisTrxLabel
    ? `BC 2.6.2 Masuk (${jenisTrxLabel})`
    : "BC 2.6.2 Masuk (Hasil Reparasi)";

  const bcList = [...new Set(dataArr.map((d) => d.bc).filter(Boolean))];
  const statusJalurVal = $("statusJalur")?.value || "HIJAU";

  return [
    `*${judul}*`,
    `Suplier : ${entitas}`,
    `No. BC 2.6.2 : ${bcList.join(", ")}`,
    `Jenis Barang : ${jenisBarang}`,
    `Jumlah Barang : ${formatKeyValue(barangMap)}`,
    `Jumlah Kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `Tanggal Masuk : ${masukTxt}`,
    `Status Jalur : ${statusJalurVal}`,
  ].join("\n");
}

function formatBC23Masuk(dataArr, jenisBarang, masukTxt) {
  const { kemasanMap, segelList, tanggalArr, barangMap } =
    buildAggregates(dataArr);
  const entitas = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].join(" | ");
  const bcList = [...new Set(dataArr.map((d) => d.bc).filter(Boolean))];
  const statusJalurVal = $("statusJalur")?.value || "HIJAU";

  return [
    `*BC 2.3 Import*`,
    `Suplier : ${entitas}`,
    `No. BC 2.3 : ${bcList.join(", ")}`,
    `No. Segel BC 2.3 : ${segelList.join(", ")}`,
    `Jenis Barang : ${jenisBarang || "TEXTILE"}`,
    `Jumlah Barang : ${formatKeyValue(barangMap)}`,
    `Jumlah Kemasan : ${formatKeyValue(kemasanMap)}`,
    `Tanggal Dokumen : ${formatTanggalDokumen(tanggalArr)}`,
    `Tanggal Masuk : ${masukTxt}`,
    `Status Jalur : ${statusJalurVal}`,
  ].join("\n");
}

// ─── Strategy Dispatcher ──────────────────────────────────────────────────────

/**
 * Map BC key → formatter function.
 * Semua formatter menerima (dataArr, rawBC, bc, arah, jenisBarang, masukTxt, jalurOverrideMap, defaultJalur)
 * dan hanya menggunakan argumen yang diperlukan.
 */
const BC_FORMATTERS = {
  "BC 4.0": (arr, rawBC, bc, arah, jb, tgl, jom, dj) =>
    formatBC4x(arr, rawBC, bc, arah, jb, tgl, jom, dj),
  "BC 4.1": (arr, rawBC, bc, arah, jb, tgl, jom, dj) =>
    formatBC4x(arr, rawBC, bc, arah, jb, tgl, jom, dj),
  "BC 2.7_Keluar": (arr, _r, _b, _a, jb, tgl, jom, dj) =>
    formatBC27Keluar(arr, jb, tgl, jom, dj),
  "BC 2.7_Masuk": (arr, _r, _b, _a, jb, tgl) => formatBC27Masuk(arr, jb, tgl),
  "BC 2.6.1": (arr, _r, _b, _a, jb, tgl) => formatBC261Keluar(arr, jb, tgl),
  "BC 2.6.2": (arr, _r, _b, _a, jb, tgl) => formatBC262Masuk(arr, jb, tgl),
  "BC 2.3": (arr, _r, _b, _a, jb, tgl) => formatBC23Masuk(arr, jb, tgl),
};

/**
 * Generate teks laporan lengkap dari data yang sudah difilter.
 * @param {Array} dataArr
 * @returns {string}
 */
function generateResultText(dataArr) {
  if (!dataArr.length) return "";

  const rawBC = $("jenisBC").value;
  const { bc, arah } = parseJenisBC(rawBC);
  const statusJalurVal = $("statusJalur")?.value || "HIJAU";
  const jenisBarang = getSelectedValues("jenisBarang").join(" + ");
  const masukTxt = fmtDate(new Date($("masukTgl").value));

  // Jalur override map (hanya relevan saat MERAH)
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

  // BC 2.7 punya suffix arah; yang lain langsung pakai kode BC
  const key =
    bc === "BC 2.7"
      ? `BC 2.7_${arah}`
      : BC_FORMATTERS[bc]
      ? bc
      : "BC 2.7_Masuk";
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
