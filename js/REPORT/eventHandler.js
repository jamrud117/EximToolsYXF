/**
 * eventHandler.js — Semua event listener & inisialisasi aplikasi
 *
 * Depends on: semua modul lain (load order penting — pastikan ini terakhir)
 */

let selectedFiles = [];
let cachedWorkbooks = []; // Workbooks yang sudah dibaca dari file

document.addEventListener("DOMContentLoaded", () => {
  // ─── Init ──────────────────────────────────────────────────
  initJenisBarang();
  toggleStatusJalur();
  highlightActiveNav();

  // ─── Init Choices.js ───────────────────────────────────────
  jenisBarangSelect = new Choices("#jenisBarang", {
    removeItemButton: true,
    placeholder: true,
    placeholderValue: "Pilih jenis barang...",
    searchPlaceholderValue: "Cari jenis barang...",
    shouldSort: false,
  });

  excludeAjuSelect = new Choices("#excludeAju", {
    removeItemButton: true,
    placeholder: true,
    placeholderValue: "Pilih nomor Aju Untuk Dikecualikan...",
    searchPlaceholderValue: "Cari nomor Aju...",
    shouldSort: false,
  });

  entitasPTSelect = new Choices("#entitasPT", {
    removeItemButton: true,
    placeholder: true,
    placeholderValue: "Pilih Entitas Perusahaan...",
    searchPlaceholderValue: "Cari entitas...",
    shouldSort: false,
  });

  // Set today's date
  $("masukTgl").value = new Date().toISOString().slice(0, 10);

  // Populate jenis barang sesuai BC default
  filterJenisBarangByBC($("jenisBC").value);

  // ─── Configuration events ──────────────────────────────────

  $("jenisBC").addEventListener("change", async () => {
    toggleStatusJalur();

    // Simpan pilihan sebelumnya sebelum choices di-reset
    const prevJenisBarang = getSelectedValues("jenisBarang");
    const prevEntitas = getSelectedValues("entitasPT");
    const prevExclude = getSelectedValues("excludeAju");

    // Update jenis barang, pertahankan yang masih valid di BC baru
    filterJenisBarangByBC($("jenisBC").value, prevJenisBarang);

    // Jika ada workbooks tersimpan → re-extract otomatis dengan jenisBC baru
    if (cachedWorkbooks.length) {
      await extractAndRenderFromCache(prevEntitas, prevExclude);
    }
  });

  $("jenisBarang").addEventListener("change", refreshUI);
  $("entitasPT").addEventListener("change", refreshUI);
  $("excludeAju").addEventListener("change", refreshUI);
  $("statusJalur").addEventListener("change", refreshUI);
  $("jalurOverride").addEventListener("input", refreshUI);
  $("masukTgl").addEventListener("change", refreshUI);

  $("masukTgl").addEventListener("click", function () {
    this.showPicker?.();
  });

  // ─── File input ────────────────────────────────────────────

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

  // ─── Copy button ───────────────────────────────────────────

  $("copyBtn").addEventListener("click", () => {
    const text = $("result").value.trim();
    if (!text)
      return Swal.fire({
        icon: "warning",
        text: "Belum ada teks untuk disalin!",
      });
    navigator.clipboard.writeText(text).then(() => {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Teks Berhasil disalin!",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    });
  });

  // ─── Reset button ──────────────────────────────────────────

  $("clearBtn").addEventListener("click", () => {
    selectedFiles = [];
    cachedWorkbooks = [];
    setExtractedData([]);

    // Reset file
    $("files").value = "";
    renderFileList([]);

    // Reset output
    renderPreview([]);
    $("result").value = "";
    updateResultCount(0);

    // Reset tanggal
    $("masukTgl").value = new Date().toISOString().slice(0, 10);

    // Reset jenis BC & jalur ke default
    $("jenisBC").value = "BC 2.7 Masuk";
    $("statusJalur").value = "HIJAU";
    $("jalurOverride").value = "";
    toggleStatusJalur();

    // Reset jenis barang ke default BC, tanpa pilihan aktif
    filterJenisBarangByBC($("jenisBC").value);

    // Clear entitas PT
    entitasPTSelect.clearStore();
    entitasPTSelect.clearChoices();

    // Clear exclude AJU
    excludeAjuSelect.clearStore();
    excludeAjuSelect.clearChoices();
  });

  // ─── Add jenis barang ──────────────────────────────────────

  $("addJenisBtn").addEventListener("click", handleAddJenisBarang);
  $("newJenisBarang").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddJenisBarang();
    }
  });
});

// ─── Core Processing ───────────────────────────────────────────

/**
 * Baca semua files → simpan workbooks → extract & render
 */
async function extractAndRender() {
  setLoading(true);
  try {
    cachedWorkbooks = await Promise.all(selectedFiles.map(readWorkbook));
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
 * Extract dari workbooks tersimpan → populate choices → render
 * @param {string[]} prevEntitas — nilai entitas sebelumnya (dipertahankan jika masih valid)
 * @param {string[]} prevExclude — nilai AJU exclude sebelumnya (dipertahankan jika masih valid)
 */
async function extractAndRenderFromCache(prevEntitas = [], prevExclude = []) {
  setLoading(true);
  try {
    const extracted = cachedWorkbooks.flatMap(({ wb }) =>
      extractMultipleDocuments(wb),
    );
    setExtractedData(extracted);
    populateEntitas(extracted, prevEntitas);
    populateExcludeAju(extracted, prevExclude);
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

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Tambah jenis barang baru
 */
function handleAddJenisBarang() {
  const input = $("newJenisBarang");
  const value = input.value.trim().toUpperCase();
  if (!value) return;

  const jenisBC = $("jenisBC").value;
  const success = addJenisBarang(jenisBC, value);

  if (!success) {
    Swal.fire({
      icon: "warning",
      title: "Duplikat",
      text: `"${value}" sudah ada dalam daftar.`,
    });
    return;
  }

  filterJenisBarangByBC(jenisBC);
  jenisBarangSelect.setChoiceByValue(value);
  refreshUI();
  input.value = "";
}

/**
 * Highlight nav-link aktif berdasarkan URL
 */
function highlightActiveNav() {
  const current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
    if (link.getAttribute("href") === current) link.classList.add("active");
  });
}
