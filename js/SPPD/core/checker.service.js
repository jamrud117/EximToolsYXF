// ============================================================
// core/checker.service.js — Cross-check orchestration logic
// ============================================================

// Dependency: excel.service.js, utils/formatter.js, utils/parser.js
// (loaded via <script> tags in the page)

// ── Comparison helpers ───────────────────────────────────────

function normalize(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v).trim();
}

function isEqual(a, b) {
  const n1 = normalize(a);
  const n2 = normalize(b);
  if (typeof n1 === "number" && typeof n2 === "number")
    return Math.abs(n1 - n2) < 0.01;
  return String(n1) === String(n2);
}

function isEqualStrict(a, b) {
  return (a || "") === (b || "");
}

// ── Jenis Transaksi Lookup ───────────────────────────────────

const JENIS_TRX_MAP = {
  1: "PENYERAHAN BKP",
  2: "PENYERAHAN JKP",
  3: "RETUR",
  4: "NON PENYERAHAN",
  5: "LAINNYA",
};

function resolveJenisTransaksi(n2Val) {
  return JENIS_TRX_MAP[String(n2Val).trim()] || "TIDAK DIKETAHUI";
}

// ── Main Check Orchestrator ──────────────────────────────────

/**
 * Orchestrates all checks and emits results via `renderResult`.
 * This function is pure logic — no direct DOM manipulation.
 * Results are passed to a callback: renderResult(check, value, ref, isMatch, options)
 */
async function runChecks({
  sheetPL,
  sheetINV,
  sheetsDATA,
  kontrakNo,
  kontrakTgl,
  selectedPT,
  selectedValuta,
  selectedTrx,
  parsedExBC,
  mappings,
  onResult,
  onSectionHeader,
  onBarangHeader,
}) {
  // ── Validate required sheets ──────────────────────────────
  const missing = [];
  if (!sheetPL || !sheetPL["!ref"]) missing.push("PL");
  if (!sheetINV || !sheetINV["!ref"]) missing.push("INV");
  if (!sheetsDATA?.HEADER) missing.push("DATA.HEADER");
  if (!sheetsDATA?.DOKUMEN) missing.push("DATA.DOKUMEN");

  if (missing.length) {
    throw new Error(`File berikut tidak terdeteksi: ${missing.join(", ")}`);
  }

  // ── Load company config ───────────────────────────────────
  const config = mappings[selectedPT] || {};

  // ── PL aggregates ─────────────────────────────────────────
  const { kemasanSum, bruttoSum, nettoSum, kemasanUnit } =
    hitungKemasanNWGW(sheetPL);
  const plUnits = getPLUnits(sheetPL);

  // ── INV column mapping ────────────────────────────────────
  const invCols = findHeaderColumns(sheetINV, {
    kode: config.kode,
    uraian: config.uraian,
    qty: config.qty,
    cif: config.cif,
    suratjalan: config.suratjalan,
    no: config.no,
  });

  const rangeINV = sheetINV?.["!ref"]
    ? XLSX.utils.decode_range(sheetINV["!ref"])
    : null;

  // ── CIF sum from INV ─────────────────────────────────────
  let cifSum = 0;
  if (invCols.headerRow !== null && invCols.cif !== undefined) {
    for (let r = invCols.headerRow + 1; r <= rangeINV.e.r; r++) {
      const qty = getCellValueRC(sheetINV, r, invCols.qty);
      const item = getCellValueRC(sheetINV, r, invCols.uraian);

      if (
        !qty ||
        isNaN(qty) ||
        !item ||
        String(item).toUpperCase().includes("TOTAL")
      )
        break;

      cifSum += parseFloat(getCellValueRC(sheetINV, r, invCols.cif)) || 0;
    }
  }

  // ── Kurs ─────────────────────────────────────────────────
  const valuta = (
    getCellValue(sheetsDATA.HEADER, "CI2") || "USD"
  ).toUpperCase();
  const kursParsed = await getKursFromSpreadsheet(valuta);

  if (!kursParsed) throw new Error(`Gagal mengambil kurs ${valuta}`);

  // ── Jenis Transaksi ──────────────────────────────────────
  const jenisTransaksi = resolveJenisTransaksi(
    getCellValue(sheetsDATA.HEADER, "N2")
  );

  // ── EX BC section ────────────────────────────────────────
  const isReturable =
    jenisTransaksi === "RETUR" || jenisTransaksi === "LAINNYA";

  if (isReturable && parsedExBC.length > 0) {
    for (const doc of parsedExBC) {
      onSectionHeader("exbc", `Ex BC ${doc.jenisDokumen}`);

      const invNomorArr = doc.items.map((i) => i.nomor);
      const invTanggalArr = doc.items.map((i) => i.tanggal);
      const draft = getExBCFromDraft(sheetsDATA.DOKUMEN, doc.jenisDokumen);

      onResult(
        "Nomor Daftar",
        draft.nomorText,
        invNomorArr.join(", "),
        draft.nomorArr.join(",") === invNomorArr.join(","),
        { group: "exbc", isSpecial: true }
      );
      onResult(
        "Tanggal Daftar",
        draft.tanggalText,
        invTanggalArr.join(", "),
        draft.tanggalArr.join(",") === invTanggalArr.join(","),
        { group: "exbc", isSpecial: true }
      );
    }
  }

  // ── General section ───────────────────────────────────────
  onSectionHeader("general", "General Checking");

  onResult(
    "Jenis Transaksi",
    jenisTransaksi,
    selectedTrx,
    jenisTransaksi.toUpperCase() === selectedTrx.toUpperCase()
  );

  const customerDraft = getCustomerDraft(sheetsDATA);
  onResult(
    "Customer",
    customerDraft,
    config.check || "",
    String(customerDraft) === String(config.check || "")
  );

  const addressDraft = getAddressDraft(sheetsDATA);
  onResult(
    "Address",
    addressDraft,
    config.address || "",
    String(addressDraft) === String(config.address || "")
  );

  const npwpDraft = getNPWPDraft(sheetsDATA);
  onResult(
    "NPWP",
    npwpDraft,
    config.npwp || "",
    String(npwpDraft) === String(config.npwp || ""),
    { isSpecial: true }
  );

  const cifDraft = getCellValue(sheetsDATA.HEADER, "BU2");
  onResult(
    "CIF",
    `${formatCurr(cifDraft)} ${valuta}`,
    `${formatCurr(cifSum)} ${selectedValuta}`,
    isEqual(cifDraft, cifSum) && valuta === selectedValuta
  );

  const hargaPenyerahan = getCellValue(sheetsDATA.HEADER, "BV2");
  onResult(
    "Harga Penyerahan",
    formatRupiah(hargaPenyerahan),
    formatRupiah(cifSum * kursParsed),
    isEqual(hargaPenyerahan, cifSum * kursParsed)
  );

  const dpPajak = getCellValue(sheetsDATA.HEADER, "CT2");
  const ppnCalc = cifSum * kursParsed * 0.11;
  onResult(
    "PPN 11%",
    formatRupiah(dpPajak),
    formatRupiah(ppnCalc),
    Math.abs((dpPajak || 0) - ppnCalc) < 0.01
  );

  // Packaging
  const kemasanUnitData = getCellValue(sheetsDATA.KEMASAN, "C2");
  const kemasanQtyData = getCellValue(sheetsDATA.KEMASAN, "D2");
  const kemasanUnitMapped = mapPackagingUnit(kemasanUnit);
  const kemasanDataMapped = mapPackagingUnit(kemasanUnitData);
  onResult(
    "Total Kemasan",
    `${formatCurr(kemasanQtyData)} ${kemasanDataMapped}`,
    `${formatCurr(kemasanSum)} ${kemasanUnitMapped}`,
    isEqual(kemasanQtyData, kemasanSum) &&
      kemasanUnitMapped === kemasanDataMapped,
    { isQty: true }
  );

  onResult(
    "Bruto",
    formatCurr(getCellValue(sheetsDATA.HEADER, "CB2")),
    formatCurr(bruttoSum),
    isEqual(getCellValue(sheetsDATA.HEADER, "CB2"), bruttoSum),
    { unit: "KG" }
  );
  onResult(
    "Netto",
    formatCurr(getCellValue(sheetsDATA.HEADER, "CC2")),
    formatCurr(nettoSum),
    isEqual(getCellValue(sheetsDATA.HEADER, "CC2"), nettoSum),
    { unit: "KG" }
  );

  // Document numbers
  const invInvoiceNo = findInvoiceNo(sheetINV);
  const plInvoiceNo = findInvoiceNo(sheetPL);
  const invDateParsed = extractDateFromText(findDateText(sheetINV));
  const plDateParsed = extractDateFromText(findDateText(sheetPL));

  const draftInvoiceDate = findDocDateByCode(sheetsDATA.DOKUMEN, "380");
  const draftPackinglistDate = findDocDateByCode(sheetsDATA.DOKUMEN, "217");

  onResult(
    "Invoice No.",
    getDocumentNumber(sheetsDATA.DOKUMEN, "380"),
    invInvoiceNo,
    isEqual(getDocumentNumber(sheetsDATA.DOKUMEN, "380"), invInvoiceNo)
  );
  onResult(
    "Invoice Date",
    draftInvoiceDate,
    invDateParsed,
    isEqual(draftInvoiceDate, invDateParsed)
  );
  onResult(
    "Packinglist No.",
    getDocumentNumber(sheetsDATA.DOKUMEN, "217"),
    plInvoiceNo,
    isEqual(getDocumentNumber(sheetsDATA.DOKUMEN, "217"), plInvoiceNo)
  );
  onResult(
    "Packinglist Date",
    draftPackinglistDate,
    plDateParsed,
    isEqual(draftPackinglistDate, plDateParsed)
  );

  // Delivery Order
  let invSuratJalan = "";
  if (invCols.suratjalan !== undefined && invCols.headerRow !== null) {
    invSuratJalan = getCellValue(
      sheetINV,
      XLSX.utils.encode_cell({
        r: invCols.headerRow + 1,
        c: invCols.suratjalan,
      })
    );
  }
  const draftDODate = findDocDateByCode(sheetsDATA.DOKUMEN, "640");
  onResult(
    "Delivery Order",
    getDocumentNumber(sheetsDATA.DOKUMEN, "640"),
    invSuratJalan,
    isEqual(getDocumentNumber(sheetsDATA.DOKUMEN, "640"), invSuratJalan)
  );
  onResult(
    "Delivery Order Date",
    draftDODate,
    invDateParsed,
    isEqual(draftDODate, invDateParsed)
  );

  // Contract
  const draftContractNo = getDocumentNumber(sheetsDATA.DOKUMEN, "315");
  const draftContractDate = parseExcelDate(
    findDocDateByCode(sheetsDATA.DOKUMEN, "315")
  );
  const kontrakTglFmt = parseExcelDate(kontrakTgl);
  onResult(
    "Contract No.",
    draftContractNo,
    kontrakNo,
    isEqual(draftContractNo, kontrakNo)
  );
  onResult(
    "Contract Date",
    draftContractDate,
    kontrakTglFmt,
    isEqual(draftContractDate, kontrakTglFmt)
  );

  // ── Per-item / Barang section ─────────────────────────────
  const rangeBarang = XLSX.utils.decode_range(sheetsDATA.BARANG["!ref"]);
  const plCols = findHeaderColumns(sheetPL, { nw: "NW", gw: "GW" });

  let barangCounter = 1;
  for (let r = 1; r <= rangeBarang.e.r; r++) {
    const kodeBarang = getCellValue(sheetsDATA.BARANG, "D" + (r + 1));
    if (!kodeBarang) continue;

    const rowINV = (invCols.headerRow || 0) + r;
    const rowPL = (plCols.headerRow || 0) + r;

    onBarangHeader(barangCounter);

    const invKode = invCols.kode
      ? getCellValueRC(sheetINV, rowINV, invCols.kode)
      : "";
    onResult("Code", kodeBarang, invKode, isEqual(kodeBarang, invKode), {
      group: `barang-${barangCounter}`,
    });

    const draftUraian = getCellValue(sheetsDATA.BARANG, "E" + (r + 1));
    const invUraian = invCols.uraian
      ? getCellValueRC(sheetINV, rowINV, invCols.uraian)
      : "";
    onResult(
      "Item Name",
      draftUraian,
      invUraian,
      isEqualStrict(draftUraian, invUraian),
      { group: `barang-${barangCounter}` }
    );

    const draftQty = getCellValue(sheetsDATA.BARANG, "K" + (r + 1));
    const invQty = invCols.qty
      ? getCellValueRC(sheetINV, rowINV, invCols.qty)
      : "";
    const plUnit =
      plUnits.type === "PER_ITEM"
        ? plUnits.data[barangCounter - 1]?.unit
        : plUnits.unit;
    const draftUnit = getCellValue(sheetsDATA.BARANG, "J" + (r + 1));
    const effectiveUnit = draftUnit || plUnit;

    onResult(
      "Quantity",
      formatCurr(draftQty),
      formatCurr(invQty),
      isEqual(draftQty, invQty) && String(effectiveUnit) === String(plUnit),
      {
        isQty: true,
        unitForRef: plUnit,
        unitForData: effectiveUnit,
        group: `barang-${barangCounter}`,
      }
    );

    const draftNW = getCellValue(sheetsDATA.BARANG, "T" + (r + 1));
    const plNW = plCols.nw ? getCellValueRC(sheetPL, rowPL, plCols.nw) : "";
    onResult("NW", draftNW, plNW, isEqual(draftNW, plNW), {
      unit: "KG",
      group: `barang-${barangCounter}`,
    });

    const draftGW = getCellValue(sheetsDATA.BARANG, "U" + (r + 1));
    const plGW = plCols.gw ? getCellValueRC(sheetPL, rowPL, plCols.gw) : "";
    onResult("GW", draftGW, plGW, isEqual(draftGW, plGW), {
      unit: "KG",
      group: `barang-${barangCounter}`,
    });

    const draftCIF = getCellValue(sheetsDATA.BARANG, "Z" + (r + 1));
    const invCIF = invCols.cif
      ? getCellValueRC(sheetINV, rowINV, invCols.cif)
      : "";
    onResult(
      "Amount",
      `${formatCurr(draftCIF)} ${valuta}`,
      `${formatCurr(invCIF)} ${selectedValuta}`,
      isEqual(draftCIF, invCIF) && valuta === selectedValuta,
      { group: `barang-${barangCounter}` }
    );

    barangCounter++;
  }

  return { kursParsed, valuta };
}
