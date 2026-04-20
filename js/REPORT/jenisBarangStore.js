/**
 * jenisBarangStore.js — Penyimpanan jenis barang per jenis BC di localStorage
 */

const JENIS_BARANG_KEY = 'yxf_jenis_barang';

const DEFAULT_JENIS_BARANG = {
  'BC 2.7 Masuk':  ['INSOLE', 'EVA FOOTBED', 'PU FOAM', 'TEXTILE', 'LOGO', 'BOX KEMASAN'],
  'BC 2.7 Keluar': ['INSOLE', 'EVA FOOTBED', 'TEXTILE', 'BOX KEMASAN'],
  'BC 4.0 Masuk':  ['SMART FOAM', 'PU FOAM', 'CHEMICAL', 'CARTON BOX', 'STICKER FIFO', 'PRINT FILM'],
  'BC 4.1 Keluar': ['SMART FOAM', 'PU FOAM', 'CHEMICAL'],
};

function loadJenisBarang() {
  try {
    return JSON.parse(localStorage.getItem(JENIS_BARANG_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveJenisBarang(data) {
  localStorage.setItem(JENIS_BARANG_KEY, JSON.stringify(data));
}

/** Inisialisasi storage dengan data default jika belum ada */
function initJenisBarang() {
  if (!localStorage.getItem(JENIS_BARANG_KEY)) {
    saveJenisBarang(DEFAULT_JENIS_BARANG);
  }
}

/** Ambil daftar jenis barang untuk satu jenis BC */
function getJenisBarangByBC(jenisBC) {
  return loadJenisBarang()[jenisBC] || [];
}

/**
 * Tambah jenis barang baru ke storage
 * @returns {boolean} false jika sudah ada (duplicate)
 */
function addJenisBarang(jenisBC, value) {
  const data = loadJenisBarang();
  if (!data[jenisBC]) data[jenisBC] = [];
  if (data[jenisBC].includes(value)) return false;
  data[jenisBC].push(value);
  saveJenisBarang(data);
  return true;
}
