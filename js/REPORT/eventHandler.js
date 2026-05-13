/**
 * eventHandler.js — Semua event listener & inisialisasi aplikasi
 *
 * Depends on: semua modul lain (load order penting — pastikan ini terakhir)
 */

let selectedFiles    = [];
let cachedWorkbooks  = []; // Workbooks yang sudah dibaca dari file

document.addEventListener("DOMContentLoaded", () => {

  // ─── Init ──────────────────────────────────────────────────────────────────
  initJenisBarang();
  toggleStatusJalur();
  highlightActiveNav();

  // ─── Init Choices.js ───────────────────────────────────────────────────────
  jenisBarangSelect = new Choices("#jenisBarang", {
    removeItemButton:      true,
    placeholder:           true,
    placeholderValue:      "Pilih Jenis Barang...",
    searchPlaceholderValue:"Cari jenis barang...",
    shouldSort:            true,
  });

  excludeAjuSelect = new Choices("#excludeAju", {
    removeItemButton:      true,
    placeholder:           true,
    placeholderValue:      "Pilih Nomor Aju...",
    searchPlaceholderValue:"Cari Nomor Aju...",
    shouldSort:            true,
  });

  entitasPTSelect = new Choices("#entitasPT", {
    removeItemButton:      true,
    placeholder:           true,
    placeholderValue:      "Pilih Entitas Perusahaan...",
    searchPlaceholderValue:"Cari Entitas...",
    shouldSort:            true,
  });

  jalurOverrideSelect = new Choices("#jalurOverride", {
    removeItemButton:      true,
    placeholder:           true,
    placeholderValue:      "Pilih Nomor Daftar",
    searchPlaceholderValue:"Cari nomor daftar...",
    shouldSort:            true,
  });

  // Set tanggal hari ini
  $("masukTgl").value = new Date().toISOString().slice(0, 10);

  // Populate jenis barang sesuai BC default
  filterJenisBarangByBC($("jenisBC").value);

  // ─── Configuration events ──────────────────────────────────────────────────

  $("jenisBC").addEventListener("change", async () => {
    const prevJenisBarang = getSelectedValues("jenisBarang");
    const prevEntitas     = getSelectedValues("entitasPT");
    const prevExclude     = getSelectedValues("excludeAju");

    toggleStatusJalur();
    filterJenisBarangByBC($("jenisBC").value, prevJenisBarang);

    if (cachedWorkbooks.length) {
      await extractAndRenderFromCache(prevEntitas, prevExclude);
    }
  });

  $("jenisBarang").addEventListener("change", refreshUI);
  $("entitasPT").addEventListener("change", refreshUI);
  $("excludeAju").addEventListener("change", refreshUI);
  $("masukTgl").addEventListener("change", refreshUI);

  $("statusJalur").addEventListener("change", () => {
    toggleStatusJalur();
    refreshUI();
  });

  $("jalurOverride").addEventListener("change", refreshUI);
  jalurOverrideSelect.passedElement.element.addEventListener("change", refreshUI);

  $("masukTgl").addEventListener("click", function () {
    if (this.showPicker) this.showPicker();
  });

  // ─── File input ────────────────────────────────────────────────────────────

  $("files").addEventListener("change", async (e) => {
    selectedFiles = Array.from(e.target.files);
    renderFileList(selectedFiles);

    if (!selectedFiles.length) {
      cachedWorkbooks = [];
      setExtractedData([]);
      renderPreview([]);
      $("result").value = "";
      updateResultCount(0);
      return;
    }

    await extractAndRender();
  });

  // ─── Copy button ───────────────────────────────────────────────────────────

  $("copyBtn").addEventListener("click", () => {
    const text = $("result").value.trim();
    if (!text) return Swal.fire({ icon: "warning", text: "Belum ada teks untuk disalin!" });

    navigator.clipboard.writeText(text).then(() => {
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "Teks Berhasil disalin!",
        showConfirmButton: false, timer: 2000, timerProgressBar: true,
      });
    });
  });

  // ─── Reset button ──────────────────────────────────────────────────────────

  $("clearBtn").addEventListener("click", () => {
    selectedFiles  = [];
    cachedWorkbooks = [];
    setExtractedData([]);

    $("files").value = "";
    renderFileList([]);
    renderPreview([]);
    $("result").value = "";
    updateResultCount(0);

    $("masukTgl").value  = new Date().toISOString().slice(0, 10);
    $("jenisBC").value   = "BC 2.7 Masuk";
    $("statusJalur").value = "HIJAU";
    toggleStatusJalur();
    filterJenisBarangByBC($("jenisBC").value);

    entitasPTSelect.clearStore();
    entitasPTSelect.clearChoices();
    excludeAjuSelect.clearStore();
    excludeAjuSelect.clearChoices();
    jalurOverrideSelect.clearStore();
    jalurOverrideSelect.clearChoices();
  });

  // ─── Tambah jenis barang ───────────────────────────────────────────────────

  $("addJenisBtn").addEventListener("click", handleAddJenisBarang);
  $("newJenisBarang").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddJenisBarang(); }
  });
});

// ─── Core Processing ───────────────────────────────────────────────────────────

/**
 * Baca semua file → simpan workbooks → deteksi BC → extract & render
 */
async function extractAndRender() {
  setLoading(true);
  try {
    cachedWorkbooks = await Promise.all(selectedFiles.map(readWorkbook));

    // Deteksi jenis BC dari file pertama
    const detected = detectJenisBCFromWorkbook(cachedWorkbooks[0].wb);
    if (detected) {
      const jenisBC = $("jenisBC");
      const optionExists = [...jenisBC.options].some((o) => o.value === detected);
      if (!optionExists) {
        const opt = document.createElement("option");
        opt.value       = detected;
        opt.textContent = detected;
        jenisBC.appendChild(opt);
      }
      jenisBC.value = detected;
      toggleStatusJalur();
      filterJenisBarangByBC(detected);
    }

    await extractAndRenderFromCache([], []);

  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: "error",
      title: "Gagal Membaca File",
      text: err.message || "Pastikan format file sesuai.",
    });
  } finally {
    setLoading(false);
  }
}

/**
 * Extract dari workbooks tersimpan → populate Choices → terapkan PT config → render
 * @param {string[]} prevEntitas — entitas sebelumnya (dipertahankan jika masih valid)
 * @param {string[]} prevExclude — AJU exclude sebelumnya (dipertahankan jika masih valid)
 */
async function extractAndRenderFromCache(prevEntitas = [], prevExclude = []) {
  setLoading(true);
  try {
    const extracted = cachedWorkbooks.flatMap(({ wb }) => extractMultipleDocuments(wb));
    setExtractedData(extracted);

    populateEntitas(extracted, prevEntitas);
    populateExcludeAju(extracted, prevExclude);

    // Auto-pilih jenis barang berdasarkan PT yang terdeteksi
    applyPTConfig(extracted, $("jenisBC").value);

    refreshUI();
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: "error",
      title: "Gagal Proses",
      text: err.message || "Terjadi kesalahan.",
    });
  } finally {
    setLoading(false);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tambah jenis barang baru dari input user */
function handleAddJenisBarang() {
  const input  = $("newJenisBarang");
  const value  = input.value.trim().toUpperCase();
  if (!value) return;

  const jenisBC = $("jenisBC").value;
  const success = addJenisBarang(jenisBC, value);

  if (!success) {
    Swal.fire({ icon: "warning", title: "Duplikat", text: `"${value}" sudah ada dalam daftar.` });
    return;
  }

  filterJenisBarangByBC(jenisBC);
  jenisBarangSelect.setChoiceByValue(value);
  refreshUI();
  input.value = "";
}

/** Highlight nav-link aktif berdasarkan URL */
function highlightActiveNav() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
    if (link.getAttribute("href") === current) link.classList.add("active");
  });
}
