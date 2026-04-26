/**
 * uiController.js — Kontrol state UI: toggle form, filter data, Choices.js
 *
 * Depends on: utils.js, jenisBarangStore.js, render.js, formatter.js
 */

/** Choices.js instances (diinisialisasi di eventHandler.js) */
let jenisBarangSelect;
let excludeAjuSelect;
let entitasPTSelect;

// ============================================================
// CHOICES HELPERS
// ============================================================

/**
 * Isi pilihan jenis barang sesuai BC aktif
 * @param {string}   jenisBC     — nilai jenisBC saat ini
 * @param {string[]} prevValues  — nilai pilihan sebelumnya yang ingin dipertahankan
 */
function filterJenisBarangByBC(jenisBC, prevValues = []) {
  const items = getJenisBarangByBC(jenisBC);
  jenisBarangSelect.clearStore();
  jenisBarangSelect.clearChoices();
  jenisBarangSelect.setChoices(
    items.map((v) => ({ value: v, label: v })),
    "value",
    "label",
    true,
  );

  // Pertahankan pilihan yang masih valid di BC baru
  if (prevValues.length) {
    const validSet = new Set(items);
    prevValues.forEach((v) => {
      if (validSet.has(v)) jenisBarangSelect.setChoiceByValue(v);
    });
  }
  jenisBarangSelect._render();
}

/**
 * Isi pilihan entitas PT dari data yang sudah di-parse
 * @param {Array}    dataArr    — array dokumen hasil ekstraksi
 * @param {string[]} prevValues — nilai entitas sebelumnya yang ingin dipertahankan
 */
function populateEntitas(dataArr, prevValues = []) {
  const entitasList = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].sort();

  entitasPTSelect.clearStore();
  entitasPTSelect.clearChoices();
  entitasPTSelect.setChoices(
    entitasList.map((e) => ({ value: e, label: e })),
    "value",
    "label",
    true,
  );

  // Pertahankan pilihan yang masih valid
  if (prevValues.length) {
    const validSet = new Set(entitasList);
    prevValues.forEach((v) => {
      if (validSet.has(v)) entitasPTSelect.setChoiceByValue(v);
    });
  }
}

/**
 * Isi pilihan exclude AJU dari data yang sudah di-parse
 * @param {Array}    dataArr    — array dokumen hasil ekstraksi
 * @param {string[]} prevValues — nilai AJU exclude sebelumnya yang ingin dipertahankan
 */
function populateExcludeAju(dataArr, prevValues = []) {
  const ajuList = [...new Set(dataArr.map((d) => d.aju).filter(Boolean))];

  excludeAjuSelect.clearStore();
  excludeAjuSelect.clearChoices();
  excludeAjuSelect.setChoices(
    ajuList.map((aju) => ({ value: aju, label: aju })),
    "value",
    "label",
    true,
  );

  // Pertahankan pilihan yang masih valid
  if (prevValues.length) {
    const validSet = new Set(ajuList);
    prevValues.forEach((v) => {
      if (validSet.has(v)) excludeAjuSelect.setChoiceByValue(v);
    });
  }
}

/**
 * Sinkronisasi pilihan Kecualikan AJU berdasarkan Entitas PT yang dipilih.
 * Jika entitas dipilih → hanya tampilkan AJU milik entitas tersebut.
 * Jika tidak ada entitas dipilih → tampilkan semua AJU dari data.
 * Pilihan AJU yang sudah dicentang dipertahankan selama masih ada di daftar baru.
 */
function syncExcludeAjuToEntitas() {
  const allData = getExtractedData();
  if (!allData.length) return;

  const selectedEntitas = new Set(
    Array.from($("entitasPT").selectedOptions).map((o) => o.value),
  );

  // Tentukan data sumber untuk daftar AJU
  const sourceData = selectedEntitas.size
    ? allData.filter((d) => selectedEntitas.has(d.entitasBC))
    : allData;

  const newAjuList = [...new Set(sourceData.map((d) => d.aju).filter(Boolean))];
  const newAjuSet = new Set(newAjuList);

  // Simpan pilihan yang sudah ada & masih valid di daftar baru
  const prevExcluded = Array.from($("excludeAju").selectedOptions)
    .map((o) => o.value)
    .filter((v) => newAjuSet.has(v));

  excludeAjuSelect.clearStore();
  excludeAjuSelect.clearChoices();
  excludeAjuSelect.setChoices(
    newAjuList.map((aju) => ({ value: aju, label: aju })),
    "value",
    "label",
    true,
  );

  // Kembalikan pilihan yang masih valid
  prevExcluded.forEach((v) => excludeAjuSelect.setChoiceByValue(v));
}

/**
 * Filter data: buang dokumen yang entitasnya tidak dipilih (jika ada filter),
 * dan buang AJU yang di-exclude oleh user
 */
function filterData(dataArr) {
  // Filter entitas PT (jika ada yang dipilih, tampilkan hanya yang dipilih)
  const selectedEntitas = new Set(
    Array.from($("entitasPT").selectedOptions).map((o) => o.value),
  );
  let filtered = selectedEntitas.size
    ? dataArr.filter((d) => selectedEntitas.has(d.entitasBC))
    : dataArr;

  // Filter exclude AJU
  const excluded = new Set(
    Array.from($("excludeAju").selectedOptions).map((o) => o.value),
  );
  if (excluded.size) {
    filtered = filtered.filter((d) => !excluded.has(d.aju));
  }

  return filtered;
}

/** Re-render preview & result text dengan data yang sudah difilter */
function refreshUI() {
  // Sinkronisasi daftar AJU dulu sesuai entitas yang dipilih
  syncExcludeAjuToEntitas();

  const filtered = filterData(getExtractedData());
  renderPreview(filtered);
  $("result").value = generateResultText(filtered);
  updateResultCount(filtered.length);
}

// ============================================================
// FORM TOGGLE
// ============================================================

/**
 * Tampilkan/sembunyikan field jalur & sesuaikan grid berdasarkan jenis BC
 */
function toggleStatusJalur() {
  const jenisBC = $("jenisBC").value;
  const isBC4 = jenisBC.startsWith("BC 4.");
  const isMasuk = jenisBC.includes("Masuk");
  const showJalur = isBC4 || !isMasuk;

  // Label dinamis
  $("headerPengirim").textContent = isMasuk ? "PENGIRIM" : "PENERIMA";
  $("labelTanggal").textContent = isMasuk ? "Tanggal Masuk" : "Tanggal Keluar";

  // Toggle visibility
  const jalurWrap = $("statusJalurWrap");
  const overrideWrap = $("jalurOverrideWrap");
  jalurWrap.style.display = showJalur ? "" : "none";
  overrideWrap.style.display = showJalur ? "" : "none";

  // ── PINDAH FILTER GROUP ──────────────────────────────────
  const filterGroup = $("filterGroup");
  const isBC27Masuk = jenisBC === "BC 2.7 Masuk";

  if (isBC27Masuk) {
    $("colKanan").appendChild(filterGroup);
  } else {
    $("colKiri").appendChild(filterGroup);
  }

  // Grid col adjustment
  const colSize = showJalur ? "col-xl-4" : "col-xl-6";
  ["col-xl-4", "col-xl-6"].forEach((c) => {
    $("colTanggal").classList.remove(c);
    $("colJenisBC").classList.remove(c);
  });
  $("colTanggal").classList.add(colSize);
  $("colJenisBC").classList.add(colSize);
}

// ============================================================
// LOADING STATE
// ============================================================

function setLoading(isLoading) {
  const overlay = $("loadingOverlay");
  if (isLoading) {
    if (overlay) overlay.classList.remove("d-none");
  } else {
    if (overlay) overlay.classList.add("d-none");
  }
}

// ============================================================
// MISC UI
// ============================================================

/** Update badge jumlah dokumen di preview header */
function updateResultCount(count) {
  const badge = $("resultCountBadge");
  if (badge) badge.textContent = count ? `${count} Dokumen` : "";
}
