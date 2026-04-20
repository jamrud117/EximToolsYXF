/**
 * uiController.js — Kontrol state UI: toggle form, filter data, Choices.js
 *
 * Depends on: utils.js, jenisBarangStore.js, render.js, formatter.js
 */

/** Choices.js instances (diinisialisasi di eventHandler.js) */
let jenisBarangSelect;
let excludeAjuSelect;

// ============================================================
// CHOICES HELPERS
// ============================================================

/** Isi pilihan jenis barang sesuai BC aktif */
function filterJenisBarangByBC(jenisBC) {
  const items = getJenisBarangByBC(jenisBC);
  jenisBarangSelect.clearStore();
  jenisBarangSelect.clearChoices();
  jenisBarangSelect.setChoices(
    items.map(v => ({ value: v, label: v })),
    'value', 'label', true
  );
}

/** Isi pilihan exclude AJU dari data yang sudah di-parse */
function populateExcludeAju(dataArr) {
  const ajuList = [...new Set(dataArr.map(d => d.aju).filter(Boolean))];
  excludeAjuSelect.clearStore();
  excludeAjuSelect.clearChoices();
  excludeAjuSelect.setChoices(
    ajuList.map(aju => ({ value: aju, label: aju })),
    'value', 'label', true
  );
}

/** Filter data: buang AJU yang diexclude oleh user */
function filterExcludedData(dataArr) {
  const excluded = new Set(
    Array.from($('excludeAju').selectedOptions).map(o => o.value)
  );
  return excluded.size
    ? dataArr.filter(d => !excluded.has(d.aju))
    : dataArr;
}

/** Re-render preview & result text dengan data yang sudah difilter */
function refreshUI() {
  const filtered = filterExcludedData(getExtractedData());
  renderPreview(filtered);
  $('result').value = generateResultText(filtered);
  updateResultCount(filtered.length);
}

// ============================================================
// FORM TOGGLE
// ============================================================

/**
 * Tampilkan/sembunyikan field jalur & sesuaikan grid berdasarkan jenis BC
 */
function toggleStatusJalur() {
  const jenisBC  = $('jenisBC').value;
  const isBC4    = jenisBC.startsWith('BC 4.');
  const isMasuk  = jenisBC.includes('Masuk');
  const showJalur = isBC4 || !isMasuk;

  // Label dinamis
  $('headerPengirim').textContent = isMasuk ? 'PENGIRIM' : 'PENERIMA';
  $('labelTanggal').textContent   = isMasuk ? 'Tanggal Masuk' : 'Tanggal Keluar';

  // Toggle visibility
  const jalurWrap    = $('statusJalurWrap');
  const overrideWrap = $('jalurOverrideWrap');
  jalurWrap.style.display    = showJalur ? '' : 'none';
  overrideWrap.style.display = showJalur ? '' : 'none';

  // Grid col adjustment
  const colSize = showJalur ? 'col-xl-4' : 'col-xl-6';
  ['col-xl-4', 'col-xl-6'].forEach(c => {
    $('colTanggal').classList.remove(c);
    $('colJenisBC').classList.remove(c);
  });
  $('colTanggal').classList.add(colSize);
  $('colJenisBC').classList.add(colSize);
}

// ============================================================
// LOADING STATE
// ============================================================

function setLoading(isLoading) {
  const btn = $('processBtn');
  if (isLoading) {
    btn.disabled  = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Memproses...`;
    $('loadingOverlay')?.classList.remove('d-none');
  } else {
    btn.disabled  = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" class="me-1">
      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg>
      Proses`;
    $('loadingOverlay')?.classList.add('d-none');
  }
}

// ============================================================
// MISC UI
// ============================================================

/** Update badge jumlah dokumen di preview header */
function updateResultCount(count) {
  const badge = $('resultCountBadge');
  if (badge) badge.textContent = count ? `${count} Dokumen` : '';
}
