/**
 * render.js — Render tabel preview & file list ke DOM
 *
 * Depends on: utils.js
 */

/** State: data yang sedang ditampilkan */
let extractedData = [];

function setExtractedData(data) { extractedData = data; }
function getExtractedData()     { return extractedData; }

/**
 * Render baris-baris preview tabel
 * Tampilkan tableWrap jika ada data, sembunyikan jika kosong.
 */
function renderPreview(dataArr) {
  const tbody    = $('previewTableBody');
  const tableWrap = $('tableWrap');
  const emptyState = $('emptyState');

  if (!dataArr.length) {
    tableWrap.classList.add('d-none');
    if (emptyState) emptyState.classList.remove('d-none');
    return;
  }

  if (emptyState) emptyState.classList.add('d-none');

  tbody.innerHTML = dataArr.map((d, idx) => {
    const kemasanHtml = Object.entries(d.kemasan)
      .map(([u, q]) => `<span class="qty-badge">${fmtNum(q)} ${u}</span>`)
      .join('') || '<span class="text-muted">—</span>';

    const barangHtml = Object.entries(d.barang.map)
      .map(([u, q]) => `<span class="qty-badge">${fmtNum(q)} ${u}</span>`)
      .join('') || '<span class="text-muted">—</span>';

    return `
    <tr>
      <td class="text-center fw-semibold text-muted">${idx + 1}</td>
      <td><span class="jenis-badge">${d.jenistrx}</span></td>
      <td><code class="aju-code">${d.aju}</code></td>
      <td>${d.pengirim || '<span class="text-muted">—</span>'}</td>
      <td><span class="nobc-text">${d.bc || '—'}</span></td>
      <td>${d.segel || '<span class="text-muted">—</span>'}</td>
      <td class="qty-cell">${kemasanHtml}</td>
      <td class="qty-cell">${barangHtml}</td>
      <td class="text-center">${d.tanggal ? `<span class="date-text">${fmtDate(d.tanggal)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="nama-cell">${d.namaBarang.length ? d.namaBarang.join('<br>') : '—'}</td>
    </tr>`;
  }).join('');

  tableWrap.classList.remove('d-none');
}

/**
 * Render daftar file yang dipilih sebagai badge
 */
function renderFileList(files) {
  const el = $('fileList');
  if (!files.length) {
    el.innerHTML = '<span class="text-muted fst-italic">Belum ada file dipilih.</span>';
    return;
  }
  el.innerHTML = files.map(f =>
    `<span class="file-badge">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      ${f.name}
    </span>`
  ).join('');
}
