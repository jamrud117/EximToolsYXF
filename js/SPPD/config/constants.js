// ============================================================
// config/constants.js — Centralized application constants
// ============================================================

/** Mapping kode jenis transaksi (kolom N2 di HEADER) ke label. */
const JENIS_TRX_MAP = {
  1: "PENYERAHAN BKP",
  2: "PENYERAHAN JKP",
  3: "RETUR",
  4: "NON PENYERAHAN",
  5: "LAINNYA",
};

/**
 * Keyword yang menandai baris subtotal / grand-total pada sheet PL & INV.
 * Dicocokkan case-insensitive terhadap konten sel yang sudah di-trim.
 */
const SUBTOTAL_KEYWORDS = ["GRAND TOTAL", "SUB TOTAL", "SUBTOTAL", "TOTAL"];

/** Mapping label kemasan (PL) ke kode standar sistem. */
const UNIT_MAP = {
  POLYBAG: "BG",
  BOX:     "BX",
  CARTON:  "CT",
  ROLL:    "RO",
  SHEET:   "ST",
};

/** Mapping satuan quantity (INV/PL) ke kode standar sistem. */
const QTY_UNIT_MAP = {
  PAIRS: "NPR",
  PAIR:  "NPR",
  PRS:   "NPR",
  PR:    "NPR",
  PCS:   "PCE",
  PIECE: "PCE",
  PC:    "PCE",
  PCE:   "PCE",
};

/**
 * Google Spreadsheet yang menjadi sumber kurs.
 * Data diambil lewat opensheet.elk.sh (JSON proxy).
 */
const KURS_CONFIG = {
  SHEET_ID:   "1z0BMzWLQbKvhcDOSX3ZZeQ8e5g3wk9wHEHIxpIfuoi4",
  SHEET_NAME: "KURS",
};
