// ============================================================
// ui/table.renderer.js — Result table rendering & collapsibles
// ============================================================

const TableRenderer = (() => {
  // ── Private state ──────────────────────────────────────────
  let _tbody = null;

  function _getOrCreateTbody() {
    if (!_tbody) _tbody = document.querySelector("#resultTable tbody");
    return _tbody;
  }

  // ── Empty / Loading states ────────────────────────────────

  function showLoadingState() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = `
      <tr class="state-row">
        <td colspan="4">
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Memproses file Excel…</span>
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
            <p>Belum ada data. Upload 3 file Excel lalu klik <strong>Cross Check</strong>.</p>
          </div>
        </td>
      </tr>`;
  }

  function clearTable() {
    const tbody = _getOrCreateTbody();
    tbody.innerHTML = "";
    _tbody = tbody; // re-cache after innerHTML clear
  }

  // ── Section header rows ──────────────────────────────────

  function addSectionHeader(type, label) {
    const tbody = _getOrCreateTbody();
    const tr = document.createElement("tr");
    tr.classList.add("fw-bold", `${type}-header`);
    tr.setAttribute("aria-expanded", "false");
    tr.innerHTML = `
      <td colspan="4">
        <span class="collapse-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        ${label}
      </td>`;
    tbody.appendChild(tr);
  }

  function addBarangHeader(counter) {
    addSectionHeader("barang", `BARANG KE ${counter}`);
  }

  // ── Result rows ───────────────────────────────────────────

  /**
   * Append a check result row to the table.
   *
   * @param {string}  check       - Label
   * @param {*}       value       - Draft EXIM value
   * @param {*}       ref         - INV/PL reference value
   * @param {boolean} isMatch
   * @param {Object}  options
   * @param {boolean} options.isQty       - integer rounding
   * @param {string}  options.unit        - shared unit for both sides
   * @param {string}  options.unitForRef  - unit for ref side
   * @param {string}  options.unitForData - unit for value side
   * @param {string}  options.group       - CSS group class
   * @param {boolean} options.isSpecial   - skip diff highlight (NPWP etc.)
   */
  function addResult(check, value, ref, isMatch, options = {}) {
    const {
      isQty = false,
      unit = "",
      unitForRef = unit,
      unitForData = unit,
      group = "general",
      isSpecial = false,
    } = options;

    const tbody = _getOrCreateTbody();
    const row = document.createElement("tr");

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
      let leftRaw = `${value ?? ""}${
        effectiveUnitForData ? " " + effectiveUnitForData : ""
      }`;
      let rightRaw = `${ref ?? ""}${unitForRef ? " " + unitForRef : ""}`;

      let leftHTML = leftRaw;
      let rightHTML = rightRaw;

      if (!isMatch) {
        leftHTML = diffText(leftRaw, rightRaw, false);
        rightHTML = diffText(leftRaw, rightRaw, true);
      }

      row.innerHTML = `
        <td>${check}</td>
        <td>${leftHTML}</td>
        <td>${rightHTML}</td>
        <td class="result-cell">${statusBadge}</td>`;
    }

    row.classList.add(isMatch ? "match" : "mismatch", group);
    tbody.appendChild(row);
  }

  // ── Collapsible binding ───────────────────────────────────

  /**
   * Bind click-to-collapse behaviour on all section headers.
   * Uses event delegation from tbody — safe to call once after render.
   */
  function bindCollapsibles() {
    const tbody = _getOrCreateTbody();

    const STOP_CLASSES = {
      "exbc-header": ["exbc-header", "general-header", "barang-header"],
      "general-header": ["general-header", "barang-header"],
      "barang-header": ["barang-header", "exbc-header", "general-header"],
    };

    // Prevent double-binding
    if (tbody.dataset.collapsibleBound) return;
    tbody.dataset.collapsibleBound = "1";

    tbody.addEventListener("click", (e) => {
      const header = e.target.closest(
        ".exbc-header, .general-header, .barang-header"
      );
      if (!header) return;

      const isOpen = header.getAttribute("aria-expanded") === "true";
      const stopList =
        STOP_CLASSES[
          ["exbc-header", "general-header", "barang-header"].find((c) =>
            header.classList.contains(c)
          )
        ] || [];

      header.setAttribute("aria-expanded", isOpen ? "false" : "true");
      header.classList.toggle("open", !isOpen);

      let next = header.nextElementSibling;
      while (next && !stopList.some((cls) => next.classList.contains(cls))) {
        next.classList.toggle("row-collapsed", isOpen ? false : true);
        next = next.nextElementSibling;
      }
    });
  }

  // ── Filter ────────────────────────────────────────────────

  function applyFilter(filterValue) {
    const HEADER_CLASSES = ["barang-header", "general-header", "exbc-header"];
    const rows = document.querySelectorAll("#resultTable tbody tr");

    rows.forEach((row) => {
      // Section headers always visible
      if (HEADER_CLASSES.some((cls) => row.classList.contains(cls))) {
        row.style.display = "";
        return;
      }

      switch (filterValue) {
        case "sama":
          row.style.display = row.classList.contains("match") ? "" : "none";
          break;
        case "beda":
          row.style.display = row.classList.contains("mismatch") ? "" : "none";
          break;
        default:
          row.style.display = "";
          break;
      }
    });
  }

  // ── Public API ────────────────────────────────────────────
  return {
    showLoadingState,
    showEmptyState,
    clearTable,
    addSectionHeader,
    addBarangHeader,
    addResult,
    bindCollapsibles,
    applyFilter,
  };
})();
