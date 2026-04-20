/**
 * mapper.js — Mapping konstanta & rule bisnis BC
 */

const JENIS_TRANSAKSI_MAP = {
  '1': 'PENYERAHAN BKP',
  '2': 'PENYERAHAN JKP',
  '3': 'RETUR',
  '4': 'NON PENYERAHAN',
  '5': 'LAINNYA',
};

/** Mapping kode entitas per jenis BC */
const KODE_ENTITAS_BC_MAP = {
  'BC 4.0':   9,
  'BC 4.1':   8,
  'BC 2.5':   8,
  'BC 2.6.1': 8,
  'BC 2.6.2': 9,
  'BC 2.3':   5,
};

/** Prioritas kode respon untuk menentukan tanggal dokumen */
const PRIORITAS_KODE = ['2303', '2503', '26108', '26202', '2703', '4003', '4103'];

/** Urutan jalur untuk sorting */
const JALUR_ORDER = { HIJAU: 1, MERAH: 2, KUNING: 3 };

/**
 * Mapping kode tujuan pengiriman → label jenis transaksi
 * @param {string|number} kode
 */
function mapJenisTransaksi(kode) {
  return JENIS_TRANSAKSI_MAP[String(kode)] || 'TIDAK DIKETAHUI';
}

/**
 * Tentukan kode entitas berdasarkan jenis BC dan arah
 * @param {string} bc  — e.g. "BC 2.7"
 * @param {string} arah — "Masuk" | "Keluar"
 * @returns {number|null}
 */
function getKodeEntitas(bc, arah) {
  if (bc === 'BC 2.7') return arah === 'Masuk' ? 3 : 8;
  return KODE_ENTITAS_BC_MAP[bc] ?? null;
}

/**
 * Pecah string "BC 2.7 Masuk" → { bc: "BC 2.7", arah: "Masuk" }
 */
function parseJenisBC(raw) {
  const parts = raw.trim().split(' ');
  return { bc: `${parts[0]} ${parts[1]}`, arah: parts[2] || '' };
}

/**
 * Parse teks jalur override multi-line
 * Format: "MERAH = 123456, 789012"
 * @returns {Object} map { noBC|noAju: "JALUR" }
 */
function parseJalurOverride(text) {
  const map = {};
  text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return;
      const jalur = line.slice(0, eqIdx).trim().toUpperCase();
      const list  = line.slice(eqIdx + 1).trim();
      list.split(',').forEach(no => {
        const key = no.trim();
        if (key) map[key] = jalur;
      });
    });
  return map;
}
