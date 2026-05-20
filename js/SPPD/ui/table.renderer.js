// ============================================================
// ui/table.renderer.js — Result table rendering & collapsibles
// v3: DocumentFragment batching, batched animations, stable columns
// ============================================================

const TableRenderer = (() => {
  // ── Private state ──────────────────────────────────────────
  let _tbody              = null;
  let _batchFragment      = null; // non-null while a batch is in progress
  let _collapsibleHandler = null; // stored ref so old listener can be removed

  function _getOrCreateTbody() {
    if (!_tbody) _tbody = document.querySelector("#resultTable tbody");
    return _tbody;
  }

  // ── Batch API ─────────────────────────────────────────────
  // While a batch is open, all add* calls append to _batchFragment
  // instead of the live tbody. commitBatch() swaps them in atomically,
  // ensuring the loading state stays visible during the full runChecks()
  // call (including the async kurs API request).

  function beginBatch() {
    _batchFragment = document.createDocumentFragment();
  }

  function commitBatch() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = "";
    delete tbody.dataset.collapsibleBound;
    if (_batchFragment) {
      tbody.appendChild(_batchFragment);
      _batchFragment = null;
    }
    _tbody = tbody;
  }

  // ── Target for add* methods ───────────────────────────────
  function _appendTarget() {
    return _batchFragment ?? _getOrCreateTbody();
  }

  // ── Empty / Loading states ────────────────────────────────

  function showLoadingState() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = `
      <tr class="state-row">
        <td colspan="4">
          <div class="loading-state">
            <div class="loading-state__text">
              <div class="spinner"></div>
              <span>Memproses file Excel…</span>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function showEmptyState() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = `
      <tr class="state-row">
        <td colspan="4">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p>Belum ada data. Upload <strong>2–3 file Excel</strong> untuk memulai pengecekan.</p>
          </div>
        </td>
      </tr>`;
  }

  function clearTable() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = "";
    delete tbody.dataset.collapsibleBound;
    _batchFragment = null;
    _tbody = tbody;
  }

  // ── Section header rows ──────────────────────────────────

  function addSectionHeader(type, label) {
    const target = _appendTarget();
    const tr = document.createElement("tr");
    tr.classList.add("fw-bold", `${type}-header`, "open");
    tr.setAttribute("aria-expanded", "true");
    tr.innerHTML = `
      <td colspan="4">
        <span class="collapse-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        ${label}
      </td>`;
    target.appendChild(tr);
  }

  function addBarangHeader(counter) {
    addSectionHeader("barang", `BARANG KE ${counter}`);
  }

  // ── Result rows ───────────────────────────────────────────

  function addResult(check, value, ref, isMatch, options = {}) {
    const {
      isQty       = false,
      unit        = "",
      unitForRef  = unit,
      unitForData = unit,
      group       = "general",
      isSpecial   = false,
    } = options;

    const target = _appendTarget();
    const row    = document.createElement("tr");

    const statusBadge = isMatch
      ? '<span class="badge-match">Sama</span>'
      : '<span class="badge-mismatch">Beda</span>';

    if (isSpecial) {
      row.innerHTML = `
        <td>${check}</td>
        <td>${value ?? ""}</td>
        <td>${ref ?? ""}</td>
        <td class="result-cell">${statusBadge}</td>`;
    } else {
      const effectiveUnitForData = unitForData || unitForRef;
      const leftRaw  = `${value ?? ""}${effectiveUnitForData ? " " + effectiveUnitForData : ""}`;
      const rightRaw = `${ref ?? ""}${unitForRef ? " " + unitForRef : ""}`;

      let leftHTML  = leftRaw;
      let rightHTML = rightRaw;

      if (!isMatch) {
        leftHTML  = diffText(leftRaw, rightRaw, false);
        rightHTML = diffText(leftRaw, rightRaw, true);
      }

      row.innerHTML = `
        <td>${check}</td>
        <td>${leftHTML}</td>
        <td>${rightHTML}</td>
        <td class="result-cell">${statusBadge}</td>`;
    }

    row.classList.add(isMatch ? "match" : "mismatch", group);
    target.appendChild(row);
  }

  // ── Collapsible binding ───────────────────────────────────

  /**
   * Bind click-to-collapse on all section headers via event delegation.
   * Call once after commitBatch() / direct render.
   *
   * Strategy: zero JS animation — icon rotates via CSS .open class transition.
   * Rows toggle display:none instantly (no height measurement, no glitch).
   */
  function bindCollapsibles() {
    const tbody = _getOrCreateTbody();

    // ── Remove old listener before attaching a new one ────
    // BUG FIX: commitBatch() clears `collapsibleBound` so this function
    // would add a fresh listener on every upload — but the old listener
    // was never removed. After N uploads there were N listeners firing
    // per click (toggle open → toggle close → …), making the collapsible
    // appear broken. Storing the handler reference and calling
    // removeEventListener first ensures only one listener ever exists.
    if (_collapsibleHandler) {
      tbody.removeEventListener("click", _collapsibleHandler);
      _collapsibleHandler = null;
    }

    const HEADER_CLASSES = ["barang-header", "general-header", "exbc-header"];

    const STOP_CLASSES = {
      "exbc-header":    ["exbc-header", "general-header", "barang-header"],
      "general-header": ["general-header", "barang-header"],
      "barang-header":  ["barang-header", "exbc-header", "general-header"],
    };

    function _getAffectedRows(header) {
      const type     = HEADER_CLASSES.find(c => header.classList.contains(c));
      const stopList = STOP_CLASSES[type] || [];
      const rows     = [];
      let next = header.nextElementSibling;
      while (next && !stopList.some(cls => next.classList.contains(cls))) {
        rows.push(next);
        next = next.nextElementSibling;
      }
      return rows;
    }

    // ── Collapse: instantly hide rows ─────────────────────
    function _collapseRows(rows) {
      rows.forEach(row => {
        row.classList.add("row-collapsed");
        row.style.display = "none";
      });
    }

    // ── Expand: show rows, respecting current filter ──────
    function _expandRows(rows, filter) {
      rows.forEach(row => {
        row.classList.remove("row-collapsed");

        const isHeader = HEADER_CLASSES.some(cls => row.classList.contains(cls));
        if (isHeader) {
          row.style.display = "";
          return;
        }

        let show = true;
        if (filter === "sama") show = row.classList.contains("match");
        if (filter === "beda") show = row.classList.contains("mismatch");
        row.style.display = show ? "" : "none";
      });
    }

    // ── Click handler (stored so it can be removed on next call) ──
    _collapsibleHandler = e => {
      const header = e.target.closest(".exbc-header, .general-header, .barang-header");
      if (!header) return;

      const isOpen        = header.getAttribute("aria-expanded") === "true";
      const affectedRows  = _getAffectedRows(header);
      const currentFilter = document.getElementById("filter")?.value || "all";

      if (isOpen) {
        header.setAttribute("aria-expanded", "false");
        header.classList.remove("open");
        _collapseRows(affectedRows);
      } else {
        header.setAttribute("aria-expanded", "true");
        header.classList.add("open");
        _expandRows(affectedRows, currentFilter);
      }
    };

    tbody.addEventListener("click", _collapsibleHandler);
    tbody.dataset.collapsibleBound = "1";
  }

  // ── Filter ─────────────────────────────────────────────────

  function applyFilter(filterValue) {
    const HEADER_CLASSES = ["barang-header", "general-header", "exbc-header"];
    const rows = document.querySelectorAll("#resultTable tbody tr");

    rows.forEach(row => {
      if (row.classList.contains("state-row"))                          return;
      if (HEADER_CLASSES.some(cls => row.classList.contains(cls)))      { row.style.display = ""; return; }
      if (row.classList.contains("row-collapsed"))                      return;

      switch (filterValue) {
        case "sama": row.style.display = row.classList.contains("match")    ? "" : "none"; break;
        case "beda": row.style.display = row.classList.contains("mismatch") ? "" : "none"; break;
        default:     row.style.display = ""; break;
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    showLoadingState,
    showEmptyState,
    clearTable,
    beginBatch,
    commitBatch,
    addSectionHeader,
    addBarangHeader,
    addResult,
    bindCollapsibles,
    applyFilter,
  };
})();
