/**
 * config.js — Konfigurasi bisnis terpusat
 *
 * Edit file ini untuk menyesuaikan perilaku aplikasi.
 * Tidak perlu menyentuh file logika (parser, formatter, dsb).
 *
 * Load order: PERTAMA sebelum semua modul lain.
 */

// ─── Nama perusahaan sendiri (untuk deteksi arah BC 2.7) ─────────────────────
const MY_COMPANY_NAME = "CHINLI PLASTIC MATERIALS INDONESIA";

// ─── Default Jenis Barang per BC ─────────────────────────────────────────────
const DEFAULT_JENIS_BARANG = {
  "BC 2.7 Masuk": [
    "INSOLE",
    "EVA FOOTBED",
    "PU FOAM",
    "TEXTILE",
    "LOGO",
    "BOX KEMASAN",
  ],
  "BC 2.7 Keluar": ["INSOLE", "EVA FOOTBED", "TEXTILE", "BOX KEMASAN"],
  "BC 4.0 Masuk": [
    "SMART FOAM",
    "PU FOAM",
    "CHEMICAL",
    "CARTON BOX",
    "STICKER FIFO",
    "PRINT FILM",
  ],
  "BC 4.1 Keluar": ["SMART FOAM", "PU FOAM", "CHEMICAL"],
  "BC 2.6.1 Keluar": ["MESIN", "SPARE PART", "MOLD"],
  "BC 2.6.2 Masuk": ["MESIN", "SPARE PART", "MOLD"],
  "BC 2.3 Masuk": ["TEXTILE"],
};

// ─── Konfigurasi Per-PT ───────────────────────────────────────────────────────
/**
 * Saat entitas terdeteksi dari file, nama entitas dicocokkan dengan `match`.
 * Jika cocok, jenis barang pada `jenisBarang[jenisBC]` otomatis dipilih.
 * Jika item belum ada di store, ditambahkan dahulu secara otomatis.
 *
 * Cara menambah PT baru:
 *   1. Tambahkan objek baru di array ini.
 *   2. Isi `match` dengan keyword yang muncul di nama entitas (case-insensitive).
 *   3. Isi `jenisBarang` dengan key = jenis BC, value = array item yang dipilih.
 *
 * Satu PT bisa punya konfigurasi untuk banyak jenis BC sekaligus.
 */
/**
 * config.js — Konfigurasi bisnis terpusat
 */

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────
function createPT(match, jenisBarang) {
  return {
    match: Array.isArray(match) ? match : [match],
    jenisBarang,
  };
}

// ─────────────────────────────────────────────────────────────
// Konfigurasi PT
// ─────────────────────────────────────────────────────────────
const PT_CONFIG = [
  // =========================================================
  // BC 2.7
  // =========================================================

  createPT(["PT. YIH QUAN FOOTWEAR INDONESIA", "YIH QUAN FOOTWEAR INDONESIA"], {
    "BC 2.7 Masuk": ["INSOLE"],
    "BC 2.7 Keluar": ["INSOLE"],
  }),

  createPT(["PT. ADONIA FOOTWEAR INDONESIA", "ADONIA FOOTWEAR INDONESIA"], {
    "BC 2.7 Masuk": ["INSOLE"],
    "BC 2.7 Keluar": ["INSOLE"],
  }),

  createPT(["PT.SHOETOWN LIGUNG INDONESIA", "SHOETOWN LIGUNG INDONESIA"], {
    "BC 2.7 Masuk": ["INSOLE"],
    "BC 2.7 Keluar": ["INSOLE"],
  }),

  createPT(["BSN TECHNOLOGIES INDONESIA", "PT. BSN TECHNOLOGIES INDONESIA"], {
    "BC 2.7 Masuk": ["LOGO"],
    "BC 2.7 Keluar": ["LOGO"],
  }),

  createPT(["LONG HARMONY INDUSTRY", "PT. LONG HARMONY INDUSTRY"], {
    "BC 2.7 Masuk": ["TEXTILE"],
    "BC 2.7 Keluar": ["TEXTILE"],
  }),

  createPT(["CHUN CHERNG INDONESIA", "PT. CHUN CHERNG INDONESIA"], {
    "BC 2.7 Masuk": ["TEXTILE"],
    "BC 2.7 Keluar": ["TEXTILE"],
  }),

  createPT(["DONG JIN TEXTILE INDONESIA", "PT. DONG JIN TEXTILE INDONESIA"], {
    "BC 2.7 Masuk": ["TEXTILE"],
    "BC 2.7 Keluar": ["TEXTILE"],
  }),

  // =========================================================
  // BC 4.0 / 4.1
  // =========================================================

  createPT("SERIM INDONESIA", {
    "BC 4.0 Masuk": ["SMART FOAM"],
    "BC 4.1 Keluar": ["SMART FOAM"],
  }),

  createPT("INDO NAN PAO RESINS CHEMICAL", {
    "BC 4.0 Masuk": ["CHEMICAL"],
    "BC 4.1 Keluar": ["CHEMICAL"],
  }),

  createPT("TRI NANG INDONESIA", {
    "BC 4.0 Masuk": ["CHEMICAL"],
    "BC 4.1 Keluar": ["CHEMICAL"],
  }),

  createPT("MILLION LINK TRADING", {
    "BC 4.0 Masuk": ["CHEMICAL"],
  }),

  createPT("SU INDONESIA", {
    "BC 4.0 Masuk": ["TEXTILE"],
    "BC 4.1 Keluar": ["TEXTILE"],
  }),

  createPT("JOMU STUDIO INDONESIA", {
    "BC 4.0 Masuk": ["CUTTING DIES"],
  }),

  createPT("KARYA ABADI SUKSES", {
    "BC 4.0 Masuk": ["CUTTING DIES"],
  }),

  createPT("SINAR MUTIARA KEMASINDO", {
    "BC 4.0 Masuk": ["STICKER FIFO"],
  }),

  createPT("HAOWEISHIYE INDO", {
    "BC 4.0 Masuk": ["PAPER PRINTING"],
  }),

  createPT("YULONG QINMINGZHI INDONESIA", {
    "BC 4.0 Masuk": ["PRINT FILM"],
  }),

  createPT("GOLDEN ASIA SEJAHTERA", {
    "BC 4.0 Masuk": ["PLASTIC PE"],
  }),

  createPT("TAICHANG WRAPPER INTERNATIONAL", {
    "BC 4.0 Masuk": ["CARTON BOX"],
  }),
];

// ─── Mapping kode dokumen → label BC ─────────────────────────────────────────
const KODE_BC_MAP = {
  40: "BC 4.0 Masuk",
  41: "BC 4.1 Keluar",
  23: "BC 2.3 Masuk",
  25: "BC 2.5 Keluar",
  261: "BC 2.6.1 Keluar",
  262: "BC 2.6.2 Masuk",
};

// ─── Kode entitas per BC ──────────────────────────────────────────────────────
const KODE_ENTITAS_BC_MAP = {
  "BC 4.0": 9,
  "BC 4.1": 8,
  "BC 2.5": 8,
  "BC 2.6.1": 8,
  "BC 2.6.2": 9,
  "BC 2.3": 5,
};

// ─── Prioritas kode respon (untuk penentuan tanggal dokumen) ──────────────────
const PRIORITAS_KODE = [
  "2303",
  "2503",
  "26108",
  "26202",
  "2703",
  "4003",
  "4103",
];

// ─── Urutan jalur untuk sorting ───────────────────────────────────────────────
const JALUR_ORDER = { HIJAU: 1, MERAH: 2, KUNING: 3 };

// ─── Mapping jenis transaksi BC 2.6.x ────────────────────────────────────────
const BC26_JENIS_TRX_MAP = {
  "BC 2.6.1": {
    1: "Subkontrak",
    2: "Perbaikan/Reparasi",
    3: "Peminjaman",
    4: "Pameran",
    5: "Pengujian / Quality Control",
    6: "Lainnya",
  },
  "BC 2.6.2": {
    1: "Eks Diperbaiki",
    2: "Eks Disubkontrakan",
    3: "Eks Dipinjamkan",
    4: "Lainnya",
  },
};

// ─── Mapping kode jenis transaksi umum ───────────────────────────────────────
const JENIS_TRANSAKSI_MAP = {
  1: "PENYERAHAN BKP",
  2: "PENYERAHAN JKP",
  3: "RETUR",
  4: "NON PENYERAHAN",
  5: "LAINNYA",
};
