/**
 * utils.js — Helper umum yang dipakai di seluruh aplikasi
 */

/** Shorthand getElementById */
const $ = id => document.getElementById(id);

/** Format Date → DD/MM/YYYY */
function fmtDate(d) {
  if (!d || isNaN(d)) return '';
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

/** Format angka → locale ID (1.234.567) */
function fmtNum(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

/**
 * Parse berbagai format tanggal: serial Excel (number) atau string/Date
 * @returns {Date|null}
 */
function parseDate(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') {
    const utcMs = Math.floor(raw - 25569) * 86400 * 1000;
    const d = new Date(utcMs);
    return isNaN(d) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

/** Format map {unit: qty} → "1.000 PCS + 500 KG" */
function formatKeyValue(map) {
  return Object.entries(map)
    .map(([u, q]) => `${fmtNum(q)} ${u}`)
    .join(' + ');
}

/** Ambil value dari <select multiple> */
function getSelectedValues(selectId) {
  return Array.from($(selectId).selectedOptions).map(o => o.value);
}
