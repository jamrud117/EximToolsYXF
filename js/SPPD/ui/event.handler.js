// ============================================================
// ui/event.handler.js — DOM event wiring & UI state management
// Depends on: all core & utils modules (loaded via script tags)
// ============================================================

// ── Navbar active link ────────────────────────────────────────
(function highlightActiveNav() {
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.getAttribute("href") === currentPage) link.classList.add("active");
  });
})();

// ── Company dropdown ──────────────────────────────────────────
async function loadPTDropdown() {
  const mappings = JSON.parse(localStorage.getItem("companyMappings") || "{}");
  const ptSelect = document.getElementById("ptSelect");
  ptSelect.innerHTML = '<option value="">Pilih Perusahaan</option>';

  Object.keys(mappings).forEach((pt) => {
    const opt       = document.createElement("option");
    opt.value       = pt;
    opt.textContent = pt;
    ptSelect.appendChild(opt);
  });
}

// ── ExBC visibility toggle ────────────────────────────────────
function bindExBCToggle() {
  const jenisTrxSelect = document.getElementById("jenisTrx");
  const exBCWrapper    = document.getElementById("exBCWrapper");

  function toggle() {
    const show = ["RETUR", "LAINNYA"].includes(jenisTrxSelect.value);
    exBCWrapper.style.display = show ? "block" : "none";
    if (!show) document.getElementById("exBC").value = "";
  }

  jenisTrxSelect.addEventListener("change", toggle);
  toggle(); // set initial state
}

// ── Filter change ─────────────────────────────────────────────
function bindFilterChange() {
  const filterSelect = document.getElementById("filter");
  if (!filterSelect) return;
  filterSelect.addEventListener("change", () =>
    TableRenderer.applyFilter(filterSelect.value)
  );
}

// ── Cross-check button ────────────────────────────────────────
function bindCheckButton() {
  const btn       = document.getElementById("btnCheck");
  const fileInput = document.getElementById("files");

  btn.addEventListener("click", async () => {
    const selectedPT = document.getElementById("ptSelect").value;

    if (!selectedPT) {
      return Swal.fire({
        toast: true, position: "top-end", icon: "warning",
        title: "Pilih perusahaan terlebih dahulu",
        showConfirmButton: false, timer: 2500, timerProgressBar: true,
      });
    }

    if (!fileInput.files || fileInput.files.length === 0) {
      return Swal.fire({
        icon: "error", title: "Pilih File",
        html: "Upload <b>2 file</b> (Draft EXIM + INV&amp;PL gabungan) atau <b>3 file</b> (Draft EXIM + INV + PL terpisah).",
        scrollbarPadding: false,
      });
    }

    if (fileInput.files.length > 3) {
      return Swal.fire({
        icon: "error", title: "Terlalu Banyak File",
        text: "Maksimal 3 file Excel yang diperbolehkan.",
        scrollbarPadding: false,
      });
    }

    // ── Ex BC validation ────────────────────────────────
    const jenisTrx = document.getElementById("jenisTrx").value;
    let parsedExBC = [];

    if (jenisTrx === "RETUR" || jenisTrx === "LAINNYA") {
      const exBCText = document.getElementById("exBC").value.trim();

      if (!exBCText) {
        return Swal.fire({
          icon: "warning", title: "Ex BC Wajib Diisi",
          text: "Jenis transaksi RETUR / LAINNYA wajib mengisi Ex BC.",
        });
      }

      parsedExBC = parseExBC(exBCText);

      if (parsedExBC.length === 0) {
        return Swal.fire({
          icon: "warning", title: "Format Ex BC Salah",
          text: "Gunakan format: 27 = 012345 (2025-10-03)",
        });
      }
    }

    // ── Loading state ────────────────────────────────────
    btn.disabled    = true;
    btn.innerHTML   = `<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:6px"></span>Memproses…`;
    TableRenderer.showLoadingState();

    try {
      await processFiles(Array.from(fileInput.files), parsedExBC);

      const filterEl  = document.getElementById("filter");
      filterEl.value  = "beda";
      TableRenderer.applyFilter("beda");
    } catch (err) {
      TableRenderer.clearTable();
      TableRenderer.showEmptyState();
      Swal.fire({
        icon: "error", title: "Terjadi Kesalahan",
        html: err.message, scrollbarPadding: false,
      });
    } finally {
      btn.disabled  = false;
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        Cross Check`;
    }
  });
}

// ── Upload zone (drag & drop + click) ────────────────────────
const uploadZone = document.getElementById("uploadZone");
const fileInput  = document.getElementById("files");

uploadZone.addEventListener("click", (e) => {
  if (e.target === fileInput) return;
  fileInput.click();
});

uploadZone.addEventListener("dragenter", (e) => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragover",  (e) => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", (e) => {
  if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove("drag-over");
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");

  const droppedFiles = Array.from(e.dataTransfer.files).filter(
    (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
  );

  if (droppedFiles.length === 0) {
    alert("Hanya file .xlsx / .xls yang diterima.");
    return;
  }

  const dt = new DataTransfer();
  droppedFiles.forEach((f) => dt.items.add(f));
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
});

// ── Main process orchestrator ─────────────────────────────────
async function processFiles(files, parsedExBC) {
  let sheetPL    = null;
  let sheetINV   = null;
  let sheetsDATA = null;
  let kontrakNo  = "";
  let kontrakTgl = "";

  // Classify every uploaded file
  const classified = [];
  for (const file of files) {
    const wb   = await readExcelFile(file);
    const type = detectFileType(wb);
    classified.push({ file, wb, type });
  }

  const unknownFiles = classified.filter((c) => c.type === "UNKNOWN");
  if (unknownFiles.length > 0) {
    const names = unknownFiles.map((c) => `<b>${c.file.name}</b>`).join(", ");
    throw new Error(
      `File berikut tidak dapat diidentifikasi sebagai Draft EXIM, INV, atau PL: ${names}`
    );
  }

  // Populate sheets from classified files
  for (const { file, wb, type } of classified) {
    if (type === "DATA") {
      sheetsDATA = wb.Sheets;

    } else if (type === "INV") {
      sheetINV = wb.Sheets[wb.SheetNames[0]];

    } else if (type === "PL") {
      sheetPL = wb.Sheets[wb.SheetNames[0]];
      const info = extractKontrakInfoFromPL(sheetPL);
      kontrakNo  = info.kontrakNo;
      kontrakTgl = info.kontrakTgl;

    } else if (type === "INV_PL") {
      // Mode 2 file: satu workbook berisi INV dan PL di sheet terpisah
      const { invSheet, plSheet } = extractSheetsFromCombined(wb);
      sheetINV = invSheet;
      sheetPL  = plSheet;
      const info = extractKontrakInfoFromPL(sheetPL);
      kontrakNo  = info.kontrakNo;
      kontrakTgl = info.kontrakTgl;
    }
  }

  // Validate completeness
  const missing = [];
  if (!sheetsDATA) missing.push("Draft EXIM");
  if (!sheetINV)   missing.push("Invoice (INV)");
  if (!sheetPL)    missing.push("Packing List (PL)");

  if (missing.length > 0) {
    throw new Error(
      `File belum lengkap. File yang belum terdeteksi: <b>${missing.join(", ")}</b>.<br><br>` +
      `<small>Mode yang didukung:<br>` +
      `• <b>3 file</b>: Draft EXIM + INV (terpisah) + PL (terpisah)<br>` +
      `• <b>2 file</b>: Draft EXIM + file gabungan INV &amp; PL (2 sheet berbeda)</small>`
    );
  }

  const mappings    = JSON.parse(localStorage.getItem("companyMappings") || "{}");
  const selectedPT  = document.getElementById("ptSelect").value;
  const selectedValuta = (document.getElementById("valutaSelect")?.value || "USD").toUpperCase();
  const selectedTrx = document.getElementById("jenisTrx")?.value?.trim() || "";

  TableRenderer.clearTable();

  const { kursAPI, valuta } = await runChecks({
    sheetPL, sheetINV, sheetsDATA,
    kontrakNo, kontrakTgl,
    selectedPT, selectedValuta, selectedTrx,
    parsedExBC, mappings,
    onResult:        (check, value, ref, isMatch, opts = {}) => TableRenderer.addResult(check, value, ref, isMatch, opts),
    onSectionHeader: (type, label)  => TableRenderer.addSectionHeader(type, label),
    onBarangHeader:  (counter)      => TableRenderer.addBarangHeader(counter),
  });

  // Update kurs display
  const kursEl = document.getElementById("kurs");
  if (kursEl) kursEl.value = kursAPI === 1 ? "1" : kursAPI.toLocaleString("id-ID");

  TableRenderer.bindCollapsibles();
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadPTDropdown();
  bindExBCToggle();
  bindFilterChange();
  bindCheckButton();
  TableRenderer.showEmptyState();
});
