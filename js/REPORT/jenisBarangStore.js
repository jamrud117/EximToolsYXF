/**
 * jenisBarangStore.js — Penyimpanan & manajemen jenis barang per BC
 *
 * Depends on: config.js (DEFAULT_JENIS_BARANG)
 */

const JENIS_BARANG_KEY = "yxf_jenis_barang";

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadJenisBarang() {
  try {
    return JSON.parse(localStorage.getItem(JENIS_BARANG_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveJenisBarang(data) {
  localStorage.setItem(JENIS_BARANG_KEY, JSON.stringify(data));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/** Isi storage dengan data default jika BC belum ada */
function initJenisBarang() {
  const stored = loadJenisBarang();
  let changed = false;
  for (const [bc, items] of Object.entries(DEFAULT_JENIS_BARANG)) {
    if (!stored[bc]) {
      stored[bc] = items;
      changed = true;
    }
  }
  if (changed) saveJenisBarang(stored);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Ambil daftar jenis barang untuk satu jenis BC */
function getJenisBarangByBC(jenisBC) {
  return loadJenisBarang()[jenisBC] || [];
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Tambah satu jenis barang baru ke storage.
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

/**
 * Pastikan semua item ada di store untuk BC tertentu.
 * Item yang belum ada ditambahkan otomatis (tanpa duplikat).
 * @param {string}   jenisBC
 * @param {string[]} items
 * @returns {string[]} item yang benar-benar baru ditambahkan
 */
function ensureJenisBarang(jenisBC, items) {
  const data = loadJenisBarang();
  if (!data[jenisBC]) data[jenisBC] = [];
  const added = [];
  items.forEach((item) => {
    if (!data[jenisBC].includes(item)) {
      data[jenisBC].push(item);
      added.push(item);
    }
  });
  if (added.length) saveJenisBarang(data);
  return added;
}
