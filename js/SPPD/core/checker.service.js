// ============================================================
// core/checker.service.js — Cross-check orchestration
// Depends on: config/constants.js, utils/comparator.js,
//             utils/formatter.js, utils/parser.js,
//             core/kurs.service.js, core/sheet.reader.js
// ============================================================

// ── Helpers ───────────────────────────────────────────────────

function resolveJenisTransaksi(n2Val) {
  return JENIS_TRX_MAP[String(n2Val).trim()] || "TIDAK DIKETAHUI";
}

// ── Validation ────────────────────────────────────────────────

function _validateSheets(sheetPL, sheetINV, sheetsDATA) {
  const missing = [];
  if (!sheetPL || !sheetPL["!ref"])        missing.push("PL");
  if (!sheetINV || !sheetINV["!ref"])       missing.push("INV");
  if (!sheetsDATA?.HEADER)                  missing.push("DATA.HEADER");
  if (!sheetsDATA?.DOKUMEN)                 missing.push("DATA.DOKUMEN");
  if (missing.length) {
    throw new Error(`File berikut tidak terdeteksi: ${missing.join(", ")}`);
  }
}

// ── INV column detection ──────────────────────────────────────

/**
 * Detect all relevant column indices from the INV sheet using the
 * company config keywords.
 *
 * CIF and KURS are resolved separately with separator-based
 * disambiguation so a dual-AMOUNT layout is handled correctly.
 */
function _detectINVColumns(sheetINV, config) {
  const cifKursCols = findHeaderColumns(
    sheetINV,
    { cif: config.cif, kurs: "KURS" },
    40,
    { separatorKeyword: "KURS" }
  );

  const otherCols = findHeaderColumns(sheetINV, {
    kode:       config.kode,
    uraian:     config.uraian,
    qty:        config.qty,
    suratjalan: config.suratjalan,
    no:         config.no,
  });

  return {
    ...otherCols,
    cif:       cifKursCols.cif,
    kurs:      cifKursCols.kurs,
    headerRow: otherCols.headerRow ?? cifKursCols.headerRow,
  };
}

/**
 * Guard: CIF and QTY must not resolve to the same column.
 * Throws a descriptive error if they do.
 */
function _guardCIFQTYConflict(invCols, config) {
  if (
    invCols.cif !== undefined &&
    invCols.qty !== undefined &&
    invCols.cif === invCols.qty
  ) {
    throw new Error(
      `Kolom Amount dan Quantity terdeteksi di kolom yang sama (col ${invCols.cif}).<br>` +
      `Periksa mapping keyword di Pengaturan Perusahaan:<br>` +
      `• Keyword Amount/CIF saat ini: <b>"${config.cif}"</b><br>` +
      `• Keyword tersebut cocok dengan header QTY, bukan header Amount.<br>` +
      `Ganti keyword Amount/CIF menjadi kata yang ada di header kolom harga (misal: <b>AMOUNT</b>).`
    );
  }
}

// ── CIF summation ─────────────────────────────────────────────

/**
 * Sum the CIF column values from all genuine data rows in the INV sheet.
 * Subtotal rows are automatically skipped.
 */
function _sumCIFFromINV(sheetINV, invCols, rangeINV) {
  let cifSum = 0;
  if (invCols.headerRow !== null && invCols.cif !== undefined && rangeINV) {
    for (let r = invCols.headerRow + 1; r <= rangeINV.e.r; r++) {
      if (isSubtotalRow(sheetINV, r)) continue;
      const parsed = parseFloat(getCellValueRC(sheetINV, r, invCols.cif));
      if (!isNaN(parsed)) cifSum += parsed;
    }
  }
  return cifSum;
}

// ── Header draft extraction ───────────────────────────────────

/**
 * Read the main financial values from the DATA HEADER sheet using
 * keyword-based column lookup (not hardcoded cell addresses).
 */
function _extractHeaderDraftValues(headerSheet) {
  const cols = findHeaderColumns(headerSheet, {
    cif:             "CIF",
    hargaPenyerahan: "HARGA_PENYERAHAN",
    bruto:           "BRUTO",
    netto:           "NETTO",
    ppn:             "PPN",
  }, 5);

  const dataRow = (cols.headerRow ?? 0) + 1;

  return {
    cif:             getCellValueRC(headerSheet, dataRow, cols.cif),
    hargaPenyerahan: getCellValueRC(headerSheet, dataRow, cols.hargaPenyerahan),
    bruto:           getCellValueRC(headerSheet, dataRow, cols.bruto),
    netto:           getCellValueRC(headerSheet, dataRow, cols.netto),
    ppn:             getCellValueRC(headerSheet, dataRow, cols.ppn),
  };
}

// ── Check sections ────────────────────────────────────────────

/**
 * Ex-BC cross-check (only for RETUR / LAINNYA transactions).
 * Compares nomor & tanggal from each parsed Ex-BC entry against the draft.
 */
function _checkExBC({ jenisTransaksi, parsedExBC, sheetsDATA, onResult, onSectionHeader }) {
  const isReturable = jenisTransaksi === "RETUR" || jenisTransaksi === "LAINNYA";
  if (!isReturable || parsedExBC.length === 0) return;

  for (const doc of parsedExBC) {
    onSectionHeader("exbc", `Ex BC ${doc.jenisDokumen}`);

    const draft       = getExBCFromDraft(sheetsDATA.DOKUMEN, doc.jenisDokumen);
    const draftLookup = new Map(
      draft.nomorArr.map((nomor, i) => [nomor, draft.tanggalArr[i] ?? ""])
    );

    for (const item of doc.items) {
      const invNomor = String(item.nomor).trim();
      const invTgl   = parseExcelDate(item.tanggal);
      const found    = draftLookup.has(invNomor);

      onResult("Nomor Daftar",  found ? invNomor : "(tidak ditemukan)", invNomor, found,             { group: "exbc", isSpecial: true });
      onResult("Tanggal Daftar", parseExcelDate(draftLookup.get(invNomor) ?? ""), invTgl, isEqual(parseExcelDate(draftLookup.get(invNomor) ?? ""), invTgl), { group: "exbc", isSpecial: true });
    }
  }
}

/**
 * General checks: Jenis Transaksi, Customer, Address, NPWP.
 * Jenis Transaksi is auto-detected from the draft file (KODE TUJUAN PENGIRIMAN),
 * so it is shown as-is without a manual reference value.
 */
function _checkGeneral({ jenisTransaksi, config, sheetsDATA, onResult }) {
  onResult("Jenis Transaksi", jenisTransaksi, jenisTransaksi, true);

  const customer = getCustomerDraft(sheetsDATA);
  onResult("Customer", customer, config.check || "",
    String(customer) === String(config.check || ""));

  const address = getAddressDraft(sheetsDATA);
  onResult("Address", address, config.address || "",
    String(address) === String(config.address || ""));

  const npwp = getNPWPDraft(sheetsDATA);
  onResult("NPWP", npwp, config.npwp || "",
    String(npwp) === String(config.npwp || ""),
    { isSpecial: true });
}

/**
 * Financial checks: CIF, Harga Penyerahan, PPN 11%.
 * Valuta is auto-detected from the draft file (KODE VALUTA header), so
 * both the draft column and the INV reference use the same currency label.
 */
function _checkFinancials({ cifSum, draftValues, valuta, kursAPI, onResult }) {
  // CIF comparison
  onResult("CIF",
    `${formatCurr(draftValues.cif)} ${valuta}`,
    `${formatCurr(cifSum)} ${valuta}`,
    isEqual(draftValues.cif, cifSum)
  );

  // Harga Penyerahan: selalu cifSum × kurs dari API
  const hargaPenyerahanRef = cifSum * kursAPI;
  onResult("Harga Penyerahan",
    formatRupiah(draftValues.hargaPenyerahan),
    formatRupiah(hargaPenyerahanRef),
    isEqual(draftValues.hargaPenyerahan, hargaPenyerahanRef)
  );

  // PPN 11%: selalu cifSum × kurs API × 0.11
  const ppnRef = cifSum * kursAPI * 0.11;
  onResult("PPN 11%",
    formatRupiah(draftValues.ppn),
    formatRupiah(ppnRef),
    Math.abs((draftValues.ppn || 0) - ppnRef) < 0.01
  );
}

/**
 * Weight & packaging checks: Total Kemasan, Bruto, Netto.
 */
function _checkWeightsAndPackaging({ plAggregates, sheetsDATA, draftValues, onResult }) {
  const { kemasanSum, bruttoSum, nettoSum, kemasanUnit } = plAggregates;

  const kemasanUnitData  = getCellValue(sheetsDATA.KEMASAN, "C2");
  const kemasanQtyData   = getCellValue(sheetsDATA.KEMASAN, "D2");
  const kemasanUnitMapped = mapPackagingUnit(kemasanUnit);
  const kemasanDataMapped = mapPackagingUnit(kemasanUnitData);

  onResult("Total Kemasan",
    `${formatCurr(kemasanQtyData)} ${kemasanDataMapped}`,
    `${formatCurr(kemasanSum)} ${kemasanUnitMapped}`,
    isEqual(kemasanQtyData, kemasanSum) && kemasanUnitMapped === kemasanDataMapped,
    { isQty: true }
  );

  onResult("Bruto",
    formatCurr(draftValues.bruto),
    formatCurr(bruttoSum),
    isEqualNonZero(draftValues.bruto, bruttoSum),
    { unit: "KG" }
  );

  onResult("Netto",
    formatCurr(draftValues.netto),
    formatCurr(nettoSum),
    isEqualNonZero(draftValues.netto, nettoSum),
    { unit: "KG" }
  );
}

/**
 * Document number & date checks:
 * Invoice, Packinglist, Delivery Order, Contract.
 */
function _checkDocuments({ sheetINV, sheetPL, sheetsDATA, invCols, kontrakNo, kontrakTgl, onResult }) {
  const invInvoiceNo   = findInvoiceNo(sheetINV);
  const plInvoiceNo    = findInvoiceNo(sheetPL);
  const invDateParsed  = extractDateFromText(findDateText(sheetINV));
  const plDateParsed   = extractDateFromText(findDateText(sheetPL));

  // Invoice
  const draftInvoiceNo   = getDocumentNumber(sheetsDATA.DOKUMEN, "380");
  const draftInvoiceDate = findDocDateByCode(sheetsDATA.DOKUMEN, "380");
  onResult("Invoice No.",   draftInvoiceNo,   invInvoiceNo,  isEqual(draftInvoiceNo,   invInvoiceNo));
  onResult("Invoice Date",  draftInvoiceDate, invDateParsed, isEqual(draftInvoiceDate, invDateParsed));

  // Packinglist
  const draftPLNo   = getDocumentNumber(sheetsDATA.DOKUMEN, "217");
  const draftPLDate = findDocDateByCode(sheetsDATA.DOKUMEN, "217");
  onResult("Packinglist No.",   draftPLNo,   plInvoiceNo, isEqual(draftPLNo, plInvoiceNo));
  onResult("Packinglist Date",  draftPLDate, plDateParsed, isEqual(draftPLDate, plDateParsed));

  // Delivery Order
  let invSuratJalan = "";
  if (invCols.suratjalan !== undefined && invCols.headerRow !== null) {
    invSuratJalan = getCellValue(
      sheetINV,
      XLSX.utils.encode_cell({ r: invCols.headerRow + 1, c: invCols.suratjalan })
    );
  }
  const draftDONo   = getDocumentNumber(sheetsDATA.DOKUMEN, "640");
  const draftDODate = findDocDateByCode(sheetsDATA.DOKUMEN, "640");
  onResult("Delivery Order",      draftDONo,   invSuratJalan, isEqual(draftDONo, invSuratJalan));
  onResult("Delivery Order Date", draftDODate, invDateParsed, isEqual(draftDODate, invDateParsed));

  // Contract
  const draftContractNo   = getDocumentNumber(sheetsDATA.DOKUMEN, "315");
  const draftContractDate = parseExcelDate(findDocDateByCode(sheetsDATA.DOKUMEN, "315"));
  const kontrakTglFmt     = parseExcelDate(kontrakTgl);
  onResult("Contract No.",   draftContractNo,   kontrakNo,      isEqual(draftContractNo, kontrakNo));
  onResult("Contract Date",  draftContractDate, kontrakTglFmt,  isEqual(draftContractDate, kontrakTglFmt));
}

/**
 * Per-item (Barang) checks: Code, Item Name, Quantity, NW, GW, Amount.
 */
function _checkBarang({ sheetINV, sheetPL, sheetsDATA, invCols, plUnits, plDataRows, valuta, onResult, onBarangHeader }) {
  const rangeBarang = XLSX.utils.decode_range(sheetsDATA.BARANG["!ref"]);
  const plCols      = findHeaderColumns(sheetPL, { nw: "NW", gw: "GW" });

  let barangCounter = 1;

  for (let r = 1; r <= rangeBarang.e.r; r++) {
    const kodeBarang = getCellValue(sheetsDATA.BARANG, `D${r + 1}`);
    if (!kodeBarang) continue;

    const rowINV = (invCols.headerRow || 0) + r;
    const rowPL  = plDataRows[barangCounter - 1] ?? ((plCols.headerRow || 0) + r);

    onBarangHeader(barangCounter);

    const group = `barang-${barangCounter}`;

    // Code
    const invKode = invCols.kode ? getCellValueRC(sheetINV, rowINV, invCols.kode) : "";
    onResult("Code", kodeBarang, invKode, isEqual(kodeBarang, invKode), { group });

    // Item Name
    const draftUraian = getCellValue(sheetsDATA.BARANG, `E${r + 1}`);
    const invUraian   = invCols.uraian ? getCellValueRC(sheetINV, rowINV, invCols.uraian) : "";
    onResult("Item Name", draftUraian, invUraian, isEqualStrict(draftUraian, invUraian), { group });

    // Quantity
    const draftQty    = getCellValue(sheetsDATA.BARANG, `K${r + 1}`);
    const invQty      = invCols.qty ? getCellValueRC(sheetINV, rowINV, invCols.qty) : "";
    const plUnit      = plUnits.type === "PER_ITEM" ? plUnits.data[barangCounter - 1]?.unit : plUnits.unit;
    const draftUnit   = getCellValue(sheetsDATA.BARANG, `J${r + 1}`);
    const effectiveUnit = draftUnit || plUnit;

    onResult("Quantity",
      formatCurr(draftQty),
      formatCurr(invQty),
      isEqual(draftQty, invQty) && String(effectiveUnit) === String(plUnit),
      { isQty: true, unitForRef: plUnit, unitForData: effectiveUnit, group }
    );

    // NW
    const draftNW = getCellValue(sheetsDATA.BARANG, `T${r + 1}`);
    const plNW    = plCols.nw ? getCellValueRC(sheetPL, rowPL, plCols.nw) : "";
    onResult("NW", formatCurr(draftNW), formatCurr(plNW), isEqualNonZero(draftNW, plNW), { unit: "KG", group });

    // GW
    const draftGW = getCellValue(sheetsDATA.BARANG, `U${r + 1}`);
    const plGW    = plCols.gw ? getCellValueRC(sheetPL, rowPL, plCols.gw) : "";
    onResult("GW", formatCurr(draftGW), formatCurr(plGW), isEqualNonZero(draftGW, plGW), { unit: "KG", group });

    // Amount (CIF per item)
    const draftCIF = getCellValue(sheetsDATA.BARANG, `Z${r + 1}`);
    const invCIF   = invCols.cif ? getCellValueRC(sheetINV, rowINV, invCols.cif) : "";
    onResult("Amount",
      `${formatCurr(draftCIF)} ${valuta}`,
      `${formatCurr(invCIF)} ${valuta}`,
      isEqual(draftCIF, invCIF),
      { group }
    );

    barangCounter++;
  }
}

// ── Main orchestrator ─────────────────────────────────────────

/**
 * Orchestrate all cross-checks and emit results through the callbacks.
 * This function contains no direct DOM access — all output goes through
 * the provided callbacks.
 *
 * Valuta is auto-detected from the draft HEADER sheet (KODE VALUTA).
 * Jenis Transaksi is auto-detected from the draft HEADER sheet (KODE TUJUAN PENGIRIMAN).
 * Both selectedValuta and selectedTrx are no longer required.
 *
 * @param {Object}   params
 * @param {Object}   params.sheetPL
 * @param {Object}   params.sheetINV
 * @param {Object}   params.sheetsDATA
 * @param {string}   params.kontrakNo
 * @param {string}   params.kontrakTgl
 * @param {string}   params.selectedPT
 * @param {Array}    params.parsedExBC
 * @param {Object}   params.mappings
 * @param {Function} params.onResult         (check, value, ref, isMatch, opts)
 * @param {Function} params.onSectionHeader  (type, label)
 * @param {Function} params.onBarangHeader   (counter)
 * @returns {Promise<{ kursAPI: number, valuta: string }>}
 */
async function runChecks({
  sheetPL,
  sheetINV,
  sheetsDATA,
  kontrakNo,
  kontrakTgl,
  selectedPT,
  parsedExBC,
  mappings,
  onResult,
  onSectionHeader,
  onBarangHeader,
}) {
  // ── 1. Validate required sheets ──────────────────────────
  _validateSheets(sheetPL, sheetINV, sheetsDATA);

  // ── 2. Company config ────────────────────────────────────
  const config = mappings[selectedPT] || {};

  // ── 3. INV column detection ──────────────────────────────
  const invCols  = _detectINVColumns(sheetINV, config);
  const rangeINV = sheetINV["!ref"] ? XLSX.utils.decode_range(sheetINV["!ref"]) : null;
  _guardCIFQTYConflict(invCols, config);

  // ── 4. CIF sum from INV ──────────────────────────────────
  const cifSum = _sumCIFFromINV(sheetINV, invCols, rangeINV);

  // ── 5. Valuta — auto-detected from HEADER (KODE VALUTA) ──
  // Falls back to legacy hardcoded cell CI2 if the header keyword
  // is not found (older draft formats).
  let valuta = "USD";
  {
    const vCols = findHeaderColumns(
      sheetsDATA.HEADER,
      { kodeValuta: "KODE VALUTA" },
      5
    );
    if (vCols.kodeValuta !== undefined) {
      const raw = getCellValueRC(
        sheetsDATA.HEADER,
        (vCols.headerRow != null ? vCols.headerRow : 0) + 1,
        vCols.kodeValuta
      );
      if (raw) valuta = String(raw).trim().toUpperCase();
    } else {
      valuta = (getCellValue(sheetsDATA.HEADER, "CI2") || "USD").toUpperCase();
    }
  }

  // ── 6. Kurs from API ─────────────────────────────────────
  const kursAPI = await getKursFromAPI(valuta);
  if (!kursAPI) throw new Error(`Gagal mengambil kurs ${valuta} dari API.`);

  // ── 7. Header draft values ───────────────────────────────
  const draftValues = _extractHeaderDraftValues(sheetsDATA.HEADER);

  // ── 8. Jenis Transaksi — auto-detected from HEADER ───────
  // (KODE TUJUAN PENGIRIMAN, fallback to N2)
  let jenisTransaksi;
  {
    const tCols = findHeaderColumns(
      sheetsDATA.HEADER,
      { kodeTujuan: "KODE TUJUAN PENGIRIMAN" },
      5
    );
    let kode;
    if (tCols.kodeTujuan !== undefined) {
      kode = getCellValueRC(
        sheetsDATA.HEADER,
        (tCols.headerRow != null ? tCols.headerRow : 0) + 1,
        tCols.kodeTujuan
      );
    } else {
      kode = getCellValue(sheetsDATA.HEADER, "N2"); // legacy fallback
    }
    jenisTransaksi = resolveJenisTransaksi(kode);
  }

  // ── 9. PL aggregates ─────────────────────────────────────
  const plAggregates = hitungKemasanNWGW(sheetPL);
  const plUnits      = getPLUnits(sheetPL);
  const plDataRows   = getPLDataRows(sheetPL, 0);

  // ── 10. Run check sections ────────────────────────────────

  _checkExBC({ jenisTransaksi, parsedExBC, sheetsDATA, onResult, onSectionHeader });

  onSectionHeader("general", "General Checking");

  _checkGeneral({ jenisTransaksi, config, sheetsDATA, onResult });
  _checkFinancials({ cifSum, draftValues, valuta, kursAPI, onResult });
  _checkWeightsAndPackaging({ plAggregates, sheetsDATA, draftValues, onResult });
  _checkDocuments({ sheetINV, sheetPL, sheetsDATA, invCols, kontrakNo, kontrakTgl, onResult });

  _checkBarang({ sheetINV, sheetPL, sheetsDATA, invCols, plUnits, plDataRows, valuta, onResult, onBarangHeader });

  return { kursAPI, valuta };
}
