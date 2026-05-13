/**
 * uiController.js — Kontrol state UI: toggle form, filter data, Choices.js
 *
 * Depends on: config.js, utils.js, jenisBarangStore.js, mapper.js, render.js, formatter.js
 */

/** Choices.js instances (diinisialisasi di eventHandler.js) */
let jenisBarangSelect;
let excludeAjuSelect;
let entitasPTSelect;
let jalurOverrideSelect;

// ─── Jenis Barang ─────────────────────────────────────────────────────────────

/**
 * Refresh pilihan Jenis Barang sesuai BC aktif, pertahankan pilihan yang masih valid.
 * @param {string}   jenisBC
 * @param {string[]} prevValues — pilihan sebelumnya yang dipertahankan jika masih ada
 */
function filterJenisBarangByBC(jenisBC, prevValues = []) {
  const items = getJenisBarangByBC(jenisBC);

  jenisBarangSelect.clearStore();
  jenisBarangSelect.clearChoices();
  jenisBarangSelect.setChoices(
    items.map((v) => ({ value: v, label: v })),
    "value", "label", true
  );

  if (prevValues.length) {
    const validSet = new Set(items);
    prevValues.forEach((v) => {
      if (validSet.has(v)) jenisBarangSelect.setChoiceByValue(v);
    });
  }
  jenisBarangSelect._render();
}

// ─── PT Config Auto-Select ────────────────────────────────────────────────────

/**
 * Terapkan konfigurasi PT: deteksi entitas dari data, cocokkan dengan PT_CONFIG,
 * tambahkan item yang belum ada ke store, lalu auto-pilih semua item PT yang cocok.
 *
 * Pilihan yang sudah dibuat user TIDAK ditimpa — hanya ditambahkan.
 *
 * @param {Array}  dataArr — data dokumen hasil ekstraksi
 * @param {string} jenisBC — BC aktif
 */
function applyPTConfig(dataArr, jenisBC) {
  const entityNames = [...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean))];
  if (!entityNames.length) return;

  const ptItems = getJenisBarangFromPTConfig(entityNames, jenisBC);
  if (!ptItems.length) return;

  // Tambahkan item yang belum ada di store → refresh dropdown jika ada perubahan
  const added = ensureJenisBarang(jenisBC, ptItems);
  if (added.length) {
    const currentSelected = getSelectedValues("jenisBarang");
    filterJenisBarangByBC(jenisBC, currentSelected);
  }

  // Auto-pilih semua item PT config yang belum dipilih
  const alreadySelected = new Set(getSelectedValues("jenisBarang"));
  ptItems.forEach((item) => {
    if (!alreadySelected.has(item)) {
      try { jenisBarangSelect.setChoiceByValue(item); } catch (_) { /* item mungkin belum render */ }
    }
  });
}

// ─── Entitas & AJU Choices ────────────────────────────────────────────────────

/**
 * Isi pilihan entitas PT dari data yang sudah di-parse.
 * @param {Array}    dataArr
 * @param {string[]} prevValues — dipertahankan jika masih valid
 */
function populateEntitas(dataArr, prevValues = []) {
  const entitasList = [
    ...new Set(dataArr.map((d) => d.entitasBC).filter(Boolean)),
  ].sort();

  entitasPTSelect.clearStore();
  entitasPTSelect.clearChoices();
  entitasPTSelect.setChoices(
    entitasList.map((e) => ({ value: e, label: e })),
    "value", "label", true
  );

  if (prevValues.length) {
    const validSet = new Set(entitasList);
    prevValues.forEach((v) => {
      if (validSet.has(v)) entitasPTSelect.setChoiceByValue(v);
    });
  }
}

/**
 * Isi pilihan exclude AJU dari data yang sudah di-parse.
 * @param {Array}    dataArr
 * @param {string[]} prevValues — dipertahankan jika masih valid
 */
function populateExcludeAju(dataArr, prevValues = []) {
  const ajuList = [...new Set(dataArr.map((d) => d.aju).filter(Boolean))];

  excludeAjuSelect.clearStore();
  excludeAjuSelect.clearChoices();
  excludeAjuSelect.setChoices(
    ajuList.map((aju) => ({ value: aju, label: aju })),
    "value", "label", true
  );

  if (prevValues.length) {
    const validSet = new Set(ajuList);
    prevValues.forEach((v) => {
      if (validSet.has(v)) excludeAjuSelect.setChoiceByValue(v);
    });
  }
}

/**
 * Isi pilihan Nomor Daftar (BC) untuk jalur override dari data terfilter.
 * @param {string[]} prevValues — dipertahankan jika masih valid
 */
function populateJalurOverride(prevValues = []) {
  if (!jalurOverrideSelect) return;

  const allData = getExtractedData();
  const selectedEntitas = new Set(
    Array.from($("entitasPT").selectedOptions).map((o) => o.value)
  );
  const excluded = new Set(
    Array.from($("excludeAju").selectedOptions).map((o) => o.value)
  );

  const sourceData   = selectedEntitas.size ? allData.filter((d) => selectedEntitas.has(d.entitasBC)) : allData;
  const filteredData = excluded.size ? sourceData.filter((d) => !excluded.has(d.aju)) : sourceData;

  const newBcList = [...new Set(filteredData.map((d) => d.bc).filter(Boolean))];
  const newBcSet  = new Set(newBcList);

  const keepSelected = prevValues.length > 0
    ? prevValues
    : Array.from($("jalurOverride").selectedOptions)
        .map((o) => o.value)
        .filter((v) => newBcSet.has(v));

  jalurOverrideSelect.clearStore();
  jalurOverrideSelect.clearChoices();
  jalurOverrideSelect.setChoices(
    newBcList.map((bc) => ({ value: bc, label: bc })),
    "value", "label", true
  );
  keepSelected.forEach((v) => {
    if (newBcSet.has(v)) jalurOverrideSelect.setChoiceByValue(v);
  });
}

/**
 * Sinkronisasi daftar AJU ke entitas yang dipilih.
 * Pilihan AJU yang sudah dicentang dipertahankan jika masih ada.
 */
function syncExcludeAjuToEntitas() {
  const allData = getExtractedData();
  if (!allData.length) return;

  const selectedEntitas = new Set(
    Array.from($("entitasPT").selectedOptions).map((o) => o.value)
  );
  const sourceData = selectedEntitas.size
    ? allData.filter((d) => selectedEntitas.has(d.entitasBC))
    : allData;

  const newAjuList = [...new Set(sourceData.map((d) => d.aju).filter(Boolean))];
  const newAjuSet  = new Set(newAjuList);

  const prevExcluded = Array.from($("excludeAju").selectedOptions)
    .map((o) => o.value)
    .filter((v) => newAjuSet.has(v));

  excludeAjuSelect.clearStore();
  excludeAjuSelect.clearChoices();
  excludeAjuSelect.setChoices(
    newAjuList.map((aju) => ({ value: aju, label: aju })),
    "value", "label", true
  );
  prevExcluded.forEach((v) => excludeAjuSelect.setChoiceByValue(v));
}

// ─── Data Filtering ───────────────────────────────────────────────────────────

/**
 * Filter data berdasarkan entitas PT dan exclude AJU yang dipilih.
 */
function filterData(dataArr) {
  const selectedEntitas = new Set(
    Array.from($("entitasPT").selectedOptions).map((o) => o.value)
  );
  let filtered = selectedEntitas.size
    ? dataArr.filter((d) => selectedEntitas.has(d.entitasBC))
    : dataArr;

  const excluded = new Set(
    Array.from($("excludeAju").selectedOptions).map((o) => o.value)
  );
  if (excluded.size) filtered = filtered.filter((d) => !excluded.has(d.aju));

  return filtered;
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

/** Re-render preview & result text dengan data terfilter */
function refreshUI() {
  syncExcludeAjuToEntitas();

  if ($("statusJalur").value === "MERAH") populateJalurOverride();

  const filtered = filterData(getExtractedData());
  renderPreview(filtered);
  $("result").value = generateResultText(filtered);
  updateResultCount(filtered.length);
}

// ─── Form Toggle ──────────────────────────────────────────────────────────────

/**
 * Tampilkan/sembunyikan field berdasarkan jenis BC dan status jalur.
 * Mengatur grid layout, label dinamis, dan posisi filterGroup.
 */
function toggleStatusJalur() {
  const jenisBC    = $("jenisBC").value;
  const statusJalur = $("statusJalur").value;
  const isBC4      = jenisBC.startsWith("BC 4.");
  const isMasuk    = jenisBC.includes("Masuk");

  // BC 2.6.2 Masuk & BC 2.3 Masuk ditampilkan layaknya dokumen keluar (jalur terlihat)
  const forceShowJalur = jenisBC === "BC 2.6.2 Masuk" || jenisBC === "BC 2.3 Masuk";
  const showJalur      = isBC4 || !isMasuk || forceShowJalur;

  // Label dinamis
  $("headerPengirim").textContent = isMasuk ? "PENGIRIM" : "PENERIMA";
  $("labelTanggal").textContent   = isMasuk ? "Tanggal Masuk" : "Tanggal Keluar";

  // Toggle status jalur & override
  $("statusJalurWrap").style.display  = showJalur ? "" : "none";
  const isJalurMerah = showJalur && statusJalur === "MERAH";
  $("jalurOverrideWrap").style.display = isJalurMerah ? "" : "none";

  // Pindah filterGroup: MERAH → kolom kiri, lainnya → kolom kanan
  const filterGroup = $("filterGroup");
  if (isJalurMerah) {
    $("colKiri").appendChild(filterGroup);
  } else {
    const colKanan  = $("colKanan");
    const firstRow  = colKanan.querySelector(".row");
    const next      = firstRow?.nextElementSibling;
    next ? colKanan.insertBefore(filterGroup, next) : colKanan.appendChild(filterGroup);
  }

  // Grid adjustment
  const colSize = showJalur ? "col-xl-4" : "col-xl-6";
  ["col-xl-4", "col-xl-6"].forEach((c) => {
    $("colTanggal").classList.remove(c);
    $("colJenisBC").classList.remove(c);
  });
  $("colTanggal").classList.add(colSize);
  $("colJenisBC").classList.add(colSize);
}

// ─── Loading State ────────────────────────────────────────────────────────────

function setLoading(isLoading) {
  const overlay = $("loadingOverlay");
  if (!overlay) return;
  isLoading ? overlay.classList.remove("d-none") : overlay.classList.add("d-none");
}

// ─── Badge ────────────────────────────────────────────────────────────────────

/** Update badge jumlah dokumen di preview header */
function updateResultCount(count) {
  const badge = $("resultCountBadge");
  if (badge) badge.textContent = count ? `${count} Dokumen` : "";
}
