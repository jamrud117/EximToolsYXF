/**
 * mapper.js — Fungsi-fungsi mapping & helper bisnis BC
 *
 * Depends on: config.js
 */

// ─── Jenis Transaksi ──────────────────────────────────────────────────────────

/**
 * Mapping kode tujuan → label jenis transaksi untuk BC 2.6.x
 * @param {string} bc   — "BC 2.6.1" | "BC 2.6.2"
 * @param {string} kode — kode numerik dari file
 */
function mapJenisTrxBC26(bc, kode) {
  const map = BC26_JENIS_TRX_MAP[bc] || {};
  return map[String(kode).replace(/\.0$/, "")] || "TIDAK DIKETAHUI";
}

/**
 * Mapping kode tujuan pengiriman → label jenis transaksi (BC umum)
 * @param {string|number} kode
 */
function mapJenisTransaksi(kode) {
  return JENIS_TRANSAKSI_MAP[String(kode)] || "TIDAK DIKETAHUI";
}

// ─── BC Helpers ───────────────────────────────────────────────────────────────

/**
 * Tentukan kode entitas berdasarkan jenis BC dan arah
 * @param {string} bc   — e.g. "BC 2.7"
 * @param {string} arah — "Masuk" | "Keluar"
 * @returns {number|null}
 */
function getKodeEntitas(bc, arah) {
  if (bc === "BC 2.7") return arah === "Masuk" ? 3 : 8;
  return KODE_ENTITAS_BC_MAP[bc] ?? null;
}

/**
 * Pecah string "BC 2.7 Masuk" → { bc: "BC 2.7", arah: "Masuk" }
 * @param {string} raw
 */
function parseJenisBC(raw) {
  const parts = raw.trim().split(" ");
  return { bc: `${parts[0]} ${parts[1]}`, arah: parts[2] || "" };
}

// ─── PT Config Helpers ────────────────────────────────────────────────────────

/**
 * Cari entri PT_CONFIG yang cocok dengan nama entitas.
 * @param {string} entityName
 * @returns {Object|null}
 */
function findPTConfig(entityName) {
  const upper = entityName.toUpperCase();
  return (
    PT_CONFIG.find((cfg) =>
      cfg.match.some((keyword) => upper.includes(keyword.toUpperCase()))
    ) || null
  );
}

/**
 * Kumpulkan semua jenis barang dari PT_CONFIG yang cocok
 * dengan daftar entitas terdeteksi, untuk BC tertentu.
 *
 * @param {string[]} entityNames — nama entitas dari file
 * @param {string}   jenisBC     — BC aktif (e.g. "BC 2.6.1 Keluar")
 * @returns {string[]} jenis barang unik dari semua PT yang cocok
 */
function getJenisBarangFromPTConfig(entityNames, jenisBC) {
  const result = new Set();
  entityNames.forEach((name) => {
    const cfg = findPTConfig(name);
    if (cfg?.jenisBarang?.[jenisBC]) {
      cfg.jenisBarang[jenisBC].forEach((item) => result.add(item));
    }
  });
  return [...result];
}

/**
 * Parse teks jalur override multi-line.
 * Format: "MERAH = 123456, 789012"
 * @returns {Object} map { noBC|noAju: "JALUR" }
 */
function parseJalurOverride(text) {
  const map = {};
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return;
      const jalur = line.slice(0, eqIdx).trim().toUpperCase();
      const list = line.slice(eqIdx + 1).trim();
      list.split(",").forEach((no) => {
        const key = no.trim();
        if (key) map[key] = jalur;
      });
    });
  return map;
}
