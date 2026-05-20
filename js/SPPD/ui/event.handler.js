// ============================================================
// ui/event.handler.js — DOM event wiring & UI state management
// v3: Fixed loading state flow with beginBatch/commitBatch
// ============================================================

// ── Global state ──────────────────────────────────────────────
let _cachedRunArgs  = null;
let _autoJenisTrx   = null;

// ── Navbar active link ─────────────────────────────────────────
(function highlightActiveNav() {
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.getAttribute("href") === currentPage) link.classList.add("active");
  });
})();

// ── Company dropdown (Tom Select) ─────────────────────────────
let _tomSelectInstance = null;

async function loadPTDropdown() {
  const mappings = JSON.parse(localStorage.getItem("companyMappings") || "{}");
  const ptSelect = document.getElementById("ptSelect");

  if (_tomSelectInstance) {
    _tomSelectInstance.destroy();
    _tomSelectInstance = null;
  }

  ptSelect.innerHTML = '<option value="">Mendeteksi dari file…</option>';
  Object.keys(mappings).forEach((pt) => {
    const opt       = document.createElement("option");
    opt.value       = pt;
    opt.textContent = pt;
    ptSelect.appendChild(opt);
  });

  _tomSelectInstance = new TomSelect("#ptSelect", {
    allowEmptyOption: true,
    maxOptions:       null,
    searchField:      ["text"],
    placeholder:      "Mendeteksi dari file…",
    dropdownParent:   "body",
    render: {
      option: (data, escape) =>
        `<div class="option" title="${escape(data.text)}">${escape(data.text)}</div>`,
      item:   (data, escape) =>
        `<div class="item" title="${escape(data.text)}">${escape(data.text)}</div>`,
    },
  });
}

// ── Fuzzy company name match ───────────────────────────────────
function _normCompanyName(name) {
  return String(name)
    .toUpperCase()
    .replace(/\.\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatchCompany(draftName, optionValues) {
  if (!draftName) return "";
  const normDraft = _normCompanyName(draftName);
  return optionValues.find((v) => _normCompanyName(v) === normDraft) || "";
}

// ── Auto-detect & set company ──────────────────────────────────
function autoSetCompany(sheetsDATA) {
  const draftName = getCustomerDraft(sheetsDATA);
  if (!draftName) return;

  const ptSelect     = document.getElementById("ptSelect");
  const optionValues = Array.from(ptSelect.options)
    .map((o) => o.value)
    .filter((v) => v);

  const matched = fuzzyMatchCompany(draftName, optionValues);
  if (matched) {
    if (_tomSelectInstance) {
      _tomSelectInstance.setValue(matched, true);
    } else {
      ptSelect.value = matched;
    }
  }
}

// ── Auto-detect jenis transaksi ────────────────────────────────
function autoDetectJenisTrx(sheetsDATA) {
  if (!sheetsDATA || !sheetsDATA.HEADER) return "PENYERAHAN BKP";

  const cols = findHeaderColumns(
    sheetsDATA.HEADER,
    { kodeTujuan: "KODE TUJUAN PENGIRIMAN" },
    5
  );

  let kode;
  if (cols.kodeTujuan !== undefined) {
    kode = getCellValueRC(
      sheetsDATA.HEADER,
      (cols.headerRow != null ? cols.headerRow : 0) + 1,
      cols.kodeTujuan
    );
  } else {
    kode = getCellValue(sheetsDATA.HEADER, "N2");
  }

  return resolveJenisTransaksi(kode);
}

// ── ExBC wrapper visibility ────────────────────────────────────
function updateExBCVisibility(jenisTransaksi) {
  const exBCWrapper = document.getElementById("exBCWrapper");
  const show        = ["RETUR", "LAINNYA"].includes(jenisTransaksi);
  exBCWrapper.style.display = show ? "block" : "none";
  if (!show) document.getElementById("exBC").value = "";
}

// ── Filter change ──────────────────────────────────────────────
function bindFilterChange() {
  const filterSelect = document.getElementById("filter");
  if (!filterSelect) return;
  filterSelect.addEventListener("change", () =>
    TableRenderer.applyFilter(filterSelect.value)
  );
}

// ── Core: run checks using cached data + current UI state ──────
//
// Flow (fixed v3):
//   1. showLoadingState()          — user sees spinner immediately
//   2. beginBatch()                — all add* calls buffer into fragment
//   3. await runChecks(...)        — async (kurs API + heavy compute)
//      → callbacks populate fragment (NOT the live tbody)
//   4. commitBatch()               — atomically swap loading → results
//   5. bindCollapsibles()
//
// This ensures the spinner is ALWAYS visible until data is ready.
// There is no window where the table is empty and white.

async function reRunChecks() {
  if (!_cachedRunArgs) return;

  const { sheetPL, sheetINV, sheetsDATA, kontrakNo, kontrakTgl } = _cachedRunArgs;

  const mappings   = JSON.parse(localStorage.getItem("companyMappings") || "{}");
  const selectedPT = document.getElementById("ptSelect").value;

  let parsedExBC = [];
  if (_autoJenisTrx === "RETUR" || _autoJenisTrx === "LAINNYA") {
    const exBCText = document.getElementById("exBC").value.trim();
    if (exBCText) parsedExBC = parseExBC(exBCText);
  }

  // Show spinner (initial load already did this, but re-runs need it too)
  TableRenderer.showLoadingState();

  // Yield once so the spinner paints before XLSX / compute blocks main thread
  await new Promise(resolve => setTimeout(resolve, 0));

  // Open batch — all row additions go to a hidden DocumentFragment
  TableRenderer.beginBatch();

  try {
    const { kursAPI } = await runChecks({
      sheetPL, sheetINV, sheetsDATA,
      kontrakNo, kontrakTgl,
      selectedPT, parsedExBC, mappings,
      onResult:        (check, value, ref, isMatch, opts = {}) =>
        TableRenderer.addResult(check, value, ref, isMatch, opts),
      onSectionHeader: (type, label) => TableRenderer.addSectionHeader(type, label),
      onBarangHeader:  (counter)     => TableRenderer.addBarangHeader(counter),
    });

    // Atomically replace spinner with completed results
    TableRenderer.commitBatch();

    const kursEl = document.getElementById("kurs");
    if (kursEl) kursEl.value = kursAPI === 1 ? "1" : kursAPI.toLocaleString("id-ID");

    TableRenderer.bindCollapsibles();

  } catch (err) {
    TableRenderer.clearTable();
    TableRenderer.showEmptyState();
    Swal.fire({
      icon: "error", title: "Terjadi Kesalahan",
      html: err.message, scrollbarPadding: false,
    });
  }
}

// ── Company dropdown change → re-render ───────────────────────
function bindPtSelectChange() {
  const ptSelect = document.getElementById("ptSelect");
  ptSelect.addEventListener("change", async () => {
    if (!_cachedRunArgs) return;
    await reRunChecks();
    TableRenderer.applyFilter(document.getElementById("filter").value);
  });
}

// ── ExBC textarea: re-run check when content changes (debounced)
function bindExBCRecheck() {
  let debounceTimer;
  document.getElementById("exBC").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!_cachedRunArgs) return;
      await reRunChecks();
      TableRenderer.applyFilter(document.getElementById("filter").value);
    }, 800);
  });
}

// ── File input: parse + auto-check on change ──────────────────
function bindFileChange() {
  const fileInput = document.getElementById("files");

  fileInput.addEventListener("change", async function () {
    const hint  = document.getElementById("uploadHint");
    const count = this.files.length;

    if (count === 0) {
      hint.textContent = "Upload 2–3 file: Draft EXIM + INV & PL (gabungan atau terpisah)";
      hint.className   = "upload-sub";
      _cachedRunArgs   = null;
      _autoJenisTrx    = null;
      TableRenderer.clearTable();
      TableRenderer.showEmptyState();
      return;
    } else if (count === 2 || count === 3) {
      hint.textContent = `✓ ${count} file dipilih`;
      hint.className   = "upload-sub hint-ok";
    } else if (count > 3) {
      hint.textContent = `${count} file dipilih — maksimal 3 file`;
      hint.className   = "upload-sub hint-warn";
      return;
    } else {
      hint.textContent = `${count} file dipilih — minimal 2 file`;
      hint.className   = "upload-sub hint-warn";
      return;
    }

    // Reset cache and show loading immediately
    _cachedRunArgs = null;
    _autoJenisTrx  = null;
    TableRenderer.clearTable();
    TableRenderer.showLoadingState();

    // Yield so the spinner paints before XLSX.read() blocks the thread
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      await processFiles(Array.from(this.files));
      const filterEl = document.getElementById("filter");
      filterEl.value = "beda";
      TableRenderer.applyFilter("beda");
    } catch (err) {
      TableRenderer.clearTable();
      TableRenderer.showEmptyState();
      Swal.fire({
        icon: "error", title: "Terjadi Kesalahan",
        html: err.message, scrollbarPadding: false,
      });
    }
  });
}

// ── Upload zone (drag & drop + click) ─────────────────────────
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

// ── Main process orchestrator ──────────────────────────────────
async function processFiles(files) {
  let sheetPL    = null;
  let sheetINV   = null;
  let sheetsDATA = null;
  let kontrakNo  = "";
  let kontrakTgl = "";

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

  for (const { wb, type } of classified) {
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
      const { invSheet, plSheet } = extractSheetsFromCombined(wb);
      sheetINV = invSheet;
      sheetPL  = plSheet;
      const info = extractKontrakInfoFromPL(sheetPL);
      kontrakNo  = info.kontrakNo;
      kontrakTgl = info.kontrakTgl;
    }
  }

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

  autoSetCompany(sheetsDATA);

  _autoJenisTrx = autoDetectJenisTrx(sheetsDATA);
  updateExBCVisibility(_autoJenisTrx);

  _cachedRunArgs = { sheetPL, sheetINV, sheetsDATA, kontrakNo, kontrakTgl };

  // reRunChecks will show loading, buffer results, then commit atomically
  await reRunChecks();
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadPTDropdown();
  bindFilterChange();
  bindPtSelectChange();
  bindFileChange();
  bindExBCRecheck();
  TableRenderer.showEmptyState();
});
