// ============================================================
// core/kurs.service.js — Exchange rate fetching from API
// Depends on: config/constants.js (KURS_CONFIG)
// ============================================================

/**
 * Fetch the current exchange rate for `valuta` from the remote spreadsheet.
 *
 * - Returns 1 immediately for IDR (no conversion needed).
 * - Returns null on any failure (network error, valuta not found, etc.).
 *
 * NOTE: Kurs yang dikembalikan SELALU dari API.
 * Harga Penyerahan dan PPN dihitung menggunakan kurs ini — tidak pernah
 * dari kolom KURS di file INV, karena sistem CEISA biasanya tidak
 * mencantumkan kurs pada file ekspor.
 *
 * @param {string} valuta - e.g. "USD", "EUR", "JPY"
 * @returns {Promise<number|null>}
 */
async function getKursFromAPI(valuta) {
  if (String(valuta).toUpperCase() === "IDR") return 1;

  const url = `https://opensheet.elk.sh/${KURS_CONFIG.SHEET_ID}/${KURS_CONFIG.SHEET_NAME}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0)
      throw new Error("Sheet KURS kosong");

    const target = valuta.toUpperCase();
    const row    = rows.find((r) =>
      String(r["Mata Uang"] || "").toUpperCase().includes(`(${target})`)
    );

    if (!row)               throw new Error(`Valuta ${valuta} tidak ditemukan di sheet KURS`);
    if (!row["Nilai"])      throw new Error("Kolom Nilai kosong");

    const kurs = Number(
      String(row["Nilai"]).replace(/\./g, "").replace(",", ".")
    );

    if (isNaN(kurs)) throw new Error(`Nilai kurs tidak valid: ${row["Nilai"]}`);

    return kurs;
  } catch (err) {
    console.error("[kurs.service] Gagal ambil kurs:", err.message);
    return null;
  }
}
