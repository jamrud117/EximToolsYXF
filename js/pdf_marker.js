/* ===============================
   ACTIVE NAV LINK
================================ */
const currentPage = window.location.pathname.split("/").pop();
document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
  if (link.getAttribute("href") === currentPage) {
    link.classList.add("active");
  }
});

/* ===============================
   FORMAT TANGGAL
================================ */
function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/* ===============================
   KONVERSI TANGGAL → HARI
================================ */
function getHariFromTanggal(tgl) {
  if (!tgl) return "";
  const [dd, mm, yyyy] = tgl.split("-").map(Number);
  const dateObj = new Date(yyyy, mm - 1, dd);
  const hariList = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  return hariList[dateObj.getDay()];
}

/* ===============================
   TAMBAH 15 MENIT UNTUK GATE OUT
================================ */
function add15Minutes(jamStr) {
  if (!jamStr) return "";
  const separator = jamStr.includes(".")
    ? "."
    : jamStr.includes(":")
    ? ":"
    : null;
  if (!separator) return "";
  let [hh, mm] = jamStr.split(separator).map(Number);
  if (isNaN(hh) || isNaN(mm)) return "";
  let total = hh * 60 + mm + 15;
  hh = Math.floor(total / 60) % 24;
  mm = total % 60;
  return `${String(hh).padStart(2, "0")}${separator}${String(mm).padStart(
    2,
    "0"
  )}`;
}

/* ===============================
   GLOBAL VARIABLES
================================ */
let originalPdfBytes = null;
let currentViewport = null;
let extractedRegNumber = "";
let pdfFiles = [];

/* ===============================
   DEFAULT VALUE ON PAGE LOAD
================================ */
window.onload = function () {
  const today = todayDDMMYYYY();
  const todayHari = getHariFromTanggal(today);
  ss_tgl.value = today;
  go_tgl.value = today;
  ss_hari.value = todayHari;
  go_hari.value = todayHari;
  updateBox();
};

/* ===============================
   AUTO COPY SS → GO
================================ */
ss_tgl.addEventListener("input", () => {
  ss_hari.value = getHariFromTanggal(ss_tgl.value);
  go_tgl.value = ss_tgl.value;
  go_hari.value = ss_hari.value;
  updateBox();
});

go_tgl.addEventListener("input", () => {
  go_hari.value = getHariFromTanggal(go_tgl.value);
  updateBox();
});

/* ===============================
   AUTO HITUNG JAM GATE OUT (+15 MENIT)
================================ */
ss_jam.addEventListener("input", () => {
  const autoGO = add15Minutes(ss_jam.value);
  if (autoGO) go_jam.value = autoGO;
  updateBox();
});

/* ===============================
   UPDATE LIVE PREVIEW BOX
================================ */
[ss_hari, ss_tgl, ss_jam, go_hari, go_tgl, go_jam].forEach((input) => {
  input.addEventListener("input", updateBox);
});

function updateBox() {
  o_ss_hari.innerText = ss_hari.value;
  o_ss_tgl.innerText = ss_tgl.value;
  o_ss_jam.innerText = ss_jam.value;
  o_go_hari.innerText = go_hari.value;
  o_go_tgl.innerText = go_tgl.value;
  o_go_jam.innerText = go_jam.value;
}

/* ===========================================================
   ADAPTIVE MARKER POSITIONING
   
   Algoritma:
   1. Kumpulkan semua text item dari PDF beserta koordinat PDF-nya
   2. Cari semua kemunculan label "c. Alamat" (normalisasi spasi)
   3. Ambil yang paling bawah secara visual (= PDF Y terkecil)
   4. Dari Y tersebut, scan ke bawah untuk menemukan baris
      lanjutan alamat (multi-line) — berhenti saat ketemu
      label section baru (pola angka/huruf + titik di awal)
   5. Titik terbawah blok alamat → taruh marker tepat di bawahnya
      di sisi kanan halaman
   6. Fallback: 47% tinggi canvas
=========================================================== */
function autoPositionMarker(textContent, canvas) {
  const markerEl = document.getElementById("marker-box");

  // Rasio: canvas element mungkin di-scale oleh CSS (max-width)
  const displayScaleY = canvas.offsetHeight / canvas.height;

  // Tinggi halaman PDF dalam poin (sama dengan canvas.height karena scale:1)
  const pdfPageHeight = canvas.height;

  const items = textContent.items;

  /* ── STEP 1: Cari label "c. Alamat" terakhir secara visual ── */
  // "terakhir secara visual" = Y PDF terkecil (PDF Y-axis: 0=bawah)
  let lastAlamatPdfY = null;

  for (const item of items) {
    const normalized = (item.str || "").replace(/\s+/g, "").toLowerCase();

    // Cocokkan variasi: "c.alamat", "c.alamat:", "c.alamat" (dgn/tanpa titik)
    if (/^c\.?alamat[:\s]?$/.test(normalized) || normalized === "c.alamat") {
      const y = item.transform[5];
      if (lastAlamatPdfY === null || y < lastAlamatPdfY) {
        lastAlamatPdfY = y;
      }
    }
  }

  let markerTopPx;

  if (lastAlamatPdfY !== null) {
    /* ── STEP 2: Temukan batas bawah blok alamat (multi-line) ── */

    // Pattern label baru: diawali angka/huruf + titik atau kurung
    // Contoh: "1.", "2.", "a.", "b.", "c.", "d.", "e.", "4.", "5."
    const newSectionPattern = /^(\d+\.|[a-e]\.|[a-e]\)|\([a-e]\))/i;

    // Kita scan item di bawah lastAlamatPdfY:
    // - "di bawah" visual = PDF Y lebih kecil dari lastAlamatPdfY
    // - Batas scan: maksimum 150 poin ke bawah (cukup untuk 3-4 baris)
    // - Abaikan jika item itu label section baru → tandai blok alamat selesai

    // bottomOfAddress = PDF Y terkecil yang masih bagian dari blok alamat
    let bottomOfAddress = lastAlamatPdfY;

    // Urutkan item dari Y besar ke kecil (atas ke bawah secara visual)
    const sortedItems = [...items].sort(
      (a, b) => b.transform[5] - a.transform[5]
    );

    // Flag: setelah ketemu firstSectionBelow, hentikan scan
    let sectionBelowFound = false;

    for (const item of sortedItems) {
      const y = item.transform[5];
      const str = (item.str || "").trim();

      if (!str) continue;
      if (y >= lastAlamatPdfY) continue; // hanya item di bawah alamat
      if (y < lastAlamatPdfY - 160) break; // terlalu jauh ke bawah, stop

      if (newSectionPattern.test(str)) {
        // Ini label section baru → blok alamat sudah berakhir sebelum ini
        sectionBelowFound = true;
        break;
      }

      // Masih bagian dari blok alamat (nilai alamat / lanjutan baris)
      if (y < bottomOfAddress) {
        bottomOfAddress = y;
      }
    }

    /* ── STEP 3: Konversi ke koordinat canvas display ── */
    // PDF Y (bottom-left origin) → Canvas Y (top-left origin)
    const canvasPxY = (pdfPageHeight - bottomOfAddress) * displayScaleY;

    // Tambah sedikit padding agar tidak menempel ke teks alamat
    const PADDING_PX = 6;
    markerTopPx = canvas.offsetTop + canvasPxY + PADDING_PX;
  } else {
    // Fallback jika label "c. Alamat" tidak ditemukan sama sekali
    markerTopPx = canvas.offsetTop + canvas.offsetHeight * 0.47;
  }

  /* ── STEP 4: Posisi horizontal — sisi kanan, 52% dari kiri ── */
  const markerLeftPx = canvas.offsetLeft + canvas.offsetWidth * 0.56;

  markerEl.style.left = Math.round(markerLeftPx) + "px";
  markerEl.style.top = Math.round(Math.max(0, markerTopPx)) + "px";
}

/* ===========================================================
   EXTRACT NOMOR PENDAFTARAN
=========================================================== */
function extractRegFromItems(items) {
  let reg = "";
  const trimmed = items.map((i) => (i || "").toString().trim());

  let labelIdx = trimmed.findIndex(
    (txt) => txt.replace(/\s+/g, "").toLowerCase() === "nomorpendaftaran"
  );

  if (labelIdx !== -1) {
    for (let i = labelIdx - 1; i >= 0; i--) {
      let part = trimmed[i];
      if (!part) continue;
      if (/^\d+$/.test(part)) {
        reg = part;
        break;
      }
    }
  }

  if (!reg) {
    const fallbackMatch = trimmed.join(" ").match(/\b\d{5,20}\b/);
    reg = fallbackMatch ? fallbackMatch[0] : "UNKNOWN";
  }

  return reg;
}

async function extractRegNumberFromBytes(uint8Array) {
  const pdf = await pdfjsLib.getDocument(uint8Array).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const items = textContent.items.map((i) => i.str || "");
  return extractRegFromItems(items);
}

/* ===========================================================
   LOAD PDF + PREVIEW
=========================================================== */
document.getElementById("pdf-file").addEventListener("change", function () {
  const files = Array.from(this.files || []);
  pdfFiles = files;
  if (!pdfFiles.length) return;
  document.getElementById("marker-box").classList.remove("hidden");
  document.getElementById("previewEmpty").style.display = "none";
  loadFirstPreview(pdfFiles[0]);
});

function loadFirstPreview(file) {
  const reader = new FileReader();

  reader.onload = async function () {
    originalPdfBytes = new Uint8Array(this.result);

    const pdf = await pdfjsLib.getDocument(originalPdfBytes).promise;
    const page = await pdf.getPage(1);

    currentViewport = page.getViewport({ scale: 1 });

    const canvas = document.getElementById("pdf-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = currentViewport.width;
    canvas.height = currentViewport.height;

    await page.render({ canvasContext: ctx, viewport: currentViewport })
      .promise;

    // ✅ ADAPTIVE POSITIONING — baca koordinat teks langsung dari PDF
    const textContent = await page.getTextContent();
    autoPositionMarker(textContent, canvas);

    const items = textContent.items.map((i) => i.str || "");
    extractedRegNumber = extractRegFromItems(items);
    console.log("Nomor Pendaftaran:", extractedRegNumber);
  };

  reader.readAsArrayBuffer(file);
}

/* ===========================================================
   HITUNG POSISI MARKER DI KOORDINAT PDF
=========================================================== */
function computeMarkerBoxForPage(page) {
  const { height: pdfH } = page.getSize();

  const canvas = document.getElementById("pdf-canvas");
  const marker = document.getElementById("marker-box");

  const canvasRect = canvas.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  const htmlLeft = markerRect.left - canvasRect.left;
  const htmlTop = markerRect.top - canvasRect.top;
  const htmlWidth = markerRect.width;
  const htmlHeight = markerRect.height;

  const s = currentViewport ? currentViewport.scale : 1;

  const pdfX = htmlLeft / s;
  const pdfY = pdfH - htmlTop / s - htmlHeight / s;
  const boxW = htmlWidth / s;
  const boxH = htmlHeight / s;

  return { pdfX, pdfY, boxW, boxH, s, pdfH };
}

/* ===========================================================
   PROSES SATU PDF (DRAW MARKER)
=========================================================== */
async function processSinglePDF(uint8Array) {
  const pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
  const page = pdfDoc.getPages()[0];
  const helvFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

  const { pdfX, pdfY, boxW, boxH, s } = computeMarkerBoxForPage(page);

  page.drawRectangle({
    x: pdfX,
    y: pdfY,
    width: boxW,
    height: boxH,
    borderWidth: 1,
    borderColor: PDFLib.rgb(0, 0, 0),
  });

  const headerHeightPx = 20;
  const headerH = headerHeightPx / s;

  page.drawLine({
    start: { x: pdfX, y: pdfY + boxH - headerH },
    end: { x: pdfX + boxW, y: pdfY + boxH - headerH },
    thickness: 1,
  });

  page.drawLine({
    start: { x: pdfX + boxW / 2, y: pdfY },
    end: { x: pdfX + boxW / 2, y: pdfY + boxH },
    thickness: 1,
  });

  const headerSize = 6;
  const leftW = helvBold.widthOfTextAtSize("SELESAI STUFFING", headerSize);
  const rightW = helvBold.widthOfTextAtSize("GATE OUT", headerSize);
  const headerCenterY = pdfY + boxH - headerH / 2 - headerSize * 0.35;

  page.drawText("SELESAI STUFFING", {
    x: pdfX + boxW / 4 - leftW / 2,
    y: headerCenterY,
    size: headerSize,
    font: helvBold,
  });

  page.drawText("GATE OUT", {
    x: pdfX + (3 * boxW) / 4 - rightW / 2,
    y: headerCenterY,
    size: headerSize,
    font: helvBold,
  });

  const bodySize = 7;
  const paddingTopPx = 12;
  const rowGapPx = 14;

  const baseXLeft = pdfX + 10 / s;
  const baseXRight = pdfX + boxW / 2 + 10 / s;
  const baseY = pdfY + boxH - headerH - paddingTopPx / s - bodySize * 0.2;

  function drawRow(colX, rowIndex, label, value) {
    const y = baseY - (rowIndex * rowGapPx) / s;
    const labelWidthPx = 30;

    page.drawText(label, { x: colX, y, size: bodySize, font: helvBold });
    page.drawText(":", {
      x: colX + labelWidthPx / s,
      y,
      size: bodySize,
      font: helvFont,
    });
    if (value) {
      page.drawText(value, {
        x: colX + (labelWidthPx + 7) / s,
        y,
        size: bodySize,
        font: helvFont,
      });
    }
  }

  drawRow(baseXLeft, 0, "Hari", ss_hari.value);
  drawRow(baseXLeft, 1, "Tanggal", ss_tgl.value);
  drawRow(baseXLeft, 2, "Jam", ss_jam.value);

  drawRow(baseXRight, 0, "Hari", go_hari.value);
  drawRow(baseXRight, 1, "Tanggal", go_tgl.value);
  drawRow(baseXRight, 2, "Jam", go_jam.value);

  return await pdfDoc.save();
}

/* ===========================================================
   DOWNLOAD PDF (SINGLE / ZIP)
=========================================================== */
async function downloadAllPDF() {
  if (!pdfFiles.length) {
    alert("Upload beberapa file PDF terlebih dahulu.");
    return;
  }
  if (!currentViewport) {
    alert("Tunggu sampai preview PDF pertama tampil terlebih dahulu.");
    return;
  }

  try {
    if (pdfFiles.length === 1) {
      const file = pdfFiles[0];
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      let regNumber = "";
      try {
        regNumber = await extractRegNumberFromBytes(uint8Array);
      } catch {}

      const processedBytes = await processSinglePDF(uint8Array);
      const baseName =
        regNumber && regNumber !== "UNKNOWN"
          ? regNumber
          : file.name.replace(/\.pdf$/i, "");
      const safeName = baseName.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";

      const blob = new Blob([processedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SPPB_${safeName}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    // MULTI → ZIP
    const zip = new JSZip();

    for (const file of pdfFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      let regNumber = "";
      try {
        regNumber = await extractRegNumberFromBytes(uint8Array);
      } catch {}

      const processedBytes = await processSinglePDF(uint8Array);
      const baseName =
        regNumber && regNumber !== "UNKNOWN"
          ? regNumber
          : file.name.replace(/\.pdf$/i, "");
      const safeName = baseName.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";
      zip.file(`SPPB_${safeName}`, processedBytes);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SPPB_MARKED_ALL.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Gagal membuat ZIP:", err);
    alert("Terjadi kesalahan saat membuat ZIP.");
  }
}

/* ===============================
   PRINT PREVIEW (MODAL)
================================ */
let previewBlobUrl = null;
let previewIndex = 0;

async function previewPDFModal(index = 0) {
  if (!pdfFiles.length) {
    alert("Upload PDF terlebih dahulu.");
    return;
  }
  if (!currentViewport) {
    alert("Tunggu preview PDF siap.");
    return;
  }

  if (index < 0) index = 0;
  if (index >= pdfFiles.length) index = pdfFiles.length - 1;
  previewIndex = index;

  try {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }

    const file = pdfFiles[previewIndex];
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    const processedBytes = await processSinglePDF(uint8Array);
    const blob = new Blob([processedBytes], { type: "application/pdf" });
    previewBlobUrl = URL.createObjectURL(blob);

    document.getElementById("pdf-preview-frame").src = previewBlobUrl;
    new bootstrap.Modal(document.getElementById("printPreviewModal")).show();
  } catch (err) {
    console.error(err);
    alert("Gagal membuat preview PDF.");
  }
}

async function previewAllMergedPDF() {
  if (!pdfFiles.length) {
    alert("Upload PDF terlebih dahulu.");
    return;
  }
  if (!currentViewport) {
    alert("Tunggu preview PDF siap.");
    return;
  }

  try {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);

    const mergedPdf = await PDFLib.PDFDocument.create();

    for (const file of pdfFiles) {
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      const processedBytes = await processSinglePDF(uint8Array);
      const tempPdf = await PDFLib.PDFDocument.load(processedBytes);
      const copiedPages = await mergedPdf.copyPages(
        tempPdf,
        tempPdf.getPageIndices()
      );
      copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    const finalBytes = await mergedPdf.save();
    const blob = new Blob([finalBytes], { type: "application/pdf" });
    previewBlobUrl = URL.createObjectURL(blob);

    document.getElementById("pdf-preview-frame").src = previewBlobUrl;
    new bootstrap.Modal(document.getElementById("printPreviewModal")).show();
  } catch (err) {
    console.error(err);
    alert("Gagal membuat preview gabungan PDF.");
  }
}
