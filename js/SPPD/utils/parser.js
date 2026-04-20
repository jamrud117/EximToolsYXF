// ============================================================
// utils/parser.js — Date & document parsing helpers
// ============================================================

/**
 * Parse an Excel serial date or various string date formats
 * into "yyyy-mm-dd".
 */
function parseExcelDate(value) {
  if (!value) return '';

  // Numeric serial date
  if (!isNaN(value)) {
    const serial   = parseFloat(value);
    const utcDays  = Math.floor(serial - 25569);
    const dateInfo = new Date(utcDays * 86400 * 1000);
    const y  = dateInfo.getUTCFullYear();
    const mo = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(dateInfo.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  let s = String(value).trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/yyyy or dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // "1 October 2025"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    const mo = new Date(`${mon} 1, 2000`).getMonth() + 1;
    if (!isNaN(mo)) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // "October 1, 2025"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const [, mon, d, y] = m;
    const mo = new Date(`${mon} 1, 2000`).getMonth() + 1;
    if (!isNaN(mo)) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return s;
}

/**
 * Attempt to parse a raw date candidate string into "yyyy-mm-dd".
 * Returns empty string on failure.
 */
function tryParseDateCandidate(raw) {
  if (!raw) return '';

  const r = raw.trim()
    .replace(/[,\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // dd Month yyyy
  let m = r.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const [, d, mon, y] = m;
    const mo = new Date(`${mon} 1, 2000`).getMonth() + 1;
    if (!isNaN(mo)) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Month dd yyyy
  m = r.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const [, mon, d, y] = m;
    const mo = new Date(`${mon} 1, 2000`).getMonth() + 1;
    if (!isNaN(mo)) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // dd-mm-yyyy
  m = r.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  // yyyy-mm-dd
  m = r.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  // Fallback: native Date()
  const d = new Date(r);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return '';
}

/**
 * Extract a date from a free-text string that contains "DATE" keywords.
 * Falls back to scanning the entire text for common date patterns.
 */
function extractDateFromText(text) {
  if (!text) return '';

  const src = String(text)
    .replace(/[\u00A0\u200B\uFEFF\u2003\u2002]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const SEG_PATTERN = /\b(?:Invoice\s*Date|Packing\s*List\s*Date|Packinglist\s*Date|DATE)\s*[:\-]?\s*([A-Za-z0-9\s,\/\-]+?)(?=(\bDUE\s*DATE\b|\bPO\s*NO\b|\bINVOICE\b|\bNo\s*Kontrak\b|\bTanggal\s*Kontrak\b|$))/i;

  const segMatch = src.match(SEG_PATTERN);
  if (segMatch) {
    const candidate = segMatch[1].trim()
      .replace(/\bDUE\s*DATE\b.*$/i, '')
      .replace(/[^\w\s\-\/,\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const parsed = tryParseDateCandidate(candidate);
    if (parsed) return parsed;
  }

  // Fallback: scan for any date-like pattern
  const FALLBACK_PATTERNS = [
    /(\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b)/,
    /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
    /(\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b)/,
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
  ];

  for (const pat of FALLBACK_PATTERNS) {
    const gm = src.match(pat);
    if (gm) {
      const parsed = tryParseDateCandidate(gm[1]);
      if (parsed) return parsed;
    }
  }

  return '';
}

/**
 * Parse the Ex-BC textarea input into structured objects.
 * Expected format: "27 = 012345 (2025-10-03)"
 */
function parseExBC(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\s*=\s*([0-9,\s]+)(?:\s*\(([^)]+)\)|\s+(.+))$/);
    if (!match) continue;

    const jenisDokumen = match[1];
    const nomorList    = match[2].split(',').map(n => n.trim()).filter(Boolean);
    const tanggalRaw   = match[3] ?? match[4];

    if (!tanggalRaw) continue;

    const tanggalList = tanggalRaw.split(',').map(t => t.trim()).filter(Boolean);
    const items       = nomorList.map((nomor, idx) => ({
      nomor: String(nomor).trim(),
      tanggal: tanggalList[idx] || '',
    }));

    result.push({ jenisDokumen, items });
  }

  return result;
}

/**
 * Extract contract number and date from a PL sheet.
 */
function extractKontrakInfoFromPL(sheetPL) {
  const range      = XLSX.utils.decode_range(sheetPL['!ref']);
  let   kontrakNo  = '';
  let   kontrakTgl = '';

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = sheetPL[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || typeof cell.v !== 'string') continue;

      const lines = cell.v.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0);

      for (const line of lines) {
        if (/No\.?\s*Kontrak/i.test(line)) {
          const m = line.match(/No\.?\s*Kontrak\s*[:\-]?\s*(.*)/i);
          if (m) kontrakNo = m[1].trim();
        }
        if (/Tanggal\s*Kontrak/i.test(line)) {
          const m = line.match(/Tanggal\s*Kontrak\s*[:\-]?\s*(.*)/i);
          if (m) {
            let raw = m[1].trim();
            const dm = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
            if (dm) {
              const [, d, mo, y] = dm;
              const yyyy = y.length === 2 ? '20' + y : y;
              raw = `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            kontrakTgl = raw;
          }
        }
      }

      // Single-cell combined format: "No. Kontrak : XXX   Tanggal Kontrak : DD-MM-YYYY"
      const val = cell.v.replace(/\s+/g, ' ').trim();
      if (/No\.?\s*Kontrak/i.test(val) && /Tanggal\s*Kontrak/i.test(val)) {
        const mNo = val.match(/No\.?\s*Kontrak\s*[:\-]?\s*([^:]+?)(?=Tanggal\s*Kontrak|$)/i);
        if (mNo) kontrakNo = mNo[1].trim();

        const mTgl = val.match(/Tanggal\s*Kontrak\s*[:\-]?\s*([A-Za-z0-9\/\-\s]+)/i);
        if (mTgl) {
          let raw = mTgl[1].trim();
          const dm = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
          if (dm) {
            const [, d, mo, y] = dm;
            const yyyy = y.length === 2 ? '20' + y : y;
            raw = `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          kontrakTgl = raw;
        }
      }
    }
  }

  return { kontrakNo, kontrakTgl };
}
