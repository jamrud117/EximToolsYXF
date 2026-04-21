/**
 * eventHandler.js — Semua event listener & inisialisasi aplikasi
 *
 * Depends on: semua modul lain (load order penting — pastikan ini terakhir)
 */

let selectedFiles = [];

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
    placeholderValue: "Pilih nomor AJU...",
    searchPlaceholderValue: "Cari nomor AJU...",
    shouldSort: false,
  });

  // Set today's date
  $("masukTgl").value = new Date().toISOString().slice(0, 10);

  // Populate jenis barang sesuai BC default
  filterJenisBarangByBC($("jenisBC").value);

  // ─── Configuration events ──────────────────────────────────

  $("jenisBC").addEventListener("change", () => {
    filterJenisBarangByBC($("jenisBC").value);
    toggleStatusJalur();
    refreshUI();
  });

  $("jenisBarang").addEventListener("change", refreshUI);

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
    if (!selectedFiles.length) return;

    setLoading(true);
    try {
      const extracted = await processFiles(selectedFiles);
      setExtractedData(extracted);
      populateExcludeAju(extracted);
      renderPreview(extracted);
      $("result").value = generateResultText(extracted);
      updateResultCount(extracted.length);
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
  });

  // ─── Process button ────────────────────────────────────────

  $("processBtn").addEventListener("click", async () => {
    if (!selectedFiles.length) {
      return Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "Upload minimal 1 file Excel terlebih dahulu!",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }
    if (!getSelectedValues("jenisBarang").length) {
      return Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "Pilih minimal 1 jenis barang!",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }

    setLoading(true);
    try {
      const extracted = await processFiles(selectedFiles);
      setExtractedData(extracted);
      populateExcludeAju(extracted);
      renderPreview(extracted);
      $("result").value = generateResultText(extracted);
      updateResultCount(extracted.length);
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
    setExtractedData([]);

    $("files").value = "";
    renderFileList([]);
    renderPreview([]);
    $("result").value = "";
    $("masukTgl").value = new Date().toISOString().slice(0, 10);
    updateResultCount(0);

    filterJenisBarangByBC($("jenisBC").value);
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

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Proses semua file secara paralel → flat array dokumen
 */
async function processFiles(files) {
  const workbooks = await Promise.all(files.map(readWorkbook));
  return workbooks.flatMap(({ wb }) => extractMultipleDocuments(wb));
}

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
