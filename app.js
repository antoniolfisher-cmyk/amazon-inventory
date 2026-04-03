/* ===== Amazon Inventory Tracker - app.js ===== */

// ── Storage Key ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'amazon_inventory_v1';

// ── State ─────────────────────────────────────────────────────────────────────
let products = loadProducts();
let filteredProducts = [];
let sortCol = 'name';
let sortDir = 'asc';
let currentPage = 1;
let pageSize = 25;
let searchQuery = '';
let filterStatus = '';
let filterFulfillment = '';
let filterCategory = '';
let selectedIds = new Set();
let deleteTargetIds = [];

// ── Seed demo data if empty ───────────────────────────────────────────────────
if (products.length === 0) {
  products = generateDemoData();
  saveProducts();
}

// ── DOM References ────────────────────────────────────────────────────────────
const searchInput       = document.getElementById('searchInput');
const filterStatusSel   = document.getElementById('filterStatus');
const filterFulfillSel  = document.getElementById('filterFulfillment');
const filterCategorySel = document.getElementById('filterCategory');
const clearFiltersBtn   = document.getElementById('clearFilters');
const addProductBtn     = document.getElementById('addProductBtn');
const importBtn         = document.getElementById('importBtn');
const csvFileInput      = document.getElementById('csvFileInput');
const exportBtn         = document.getElementById('exportBtn');
const pageSizeSelect    = document.getElementById('pageSizeSelect');
const selectAllChk      = document.getElementById('selectAll');
const bulkBar           = document.getElementById('bulkBar');
const bulkCount         = document.getElementById('bulkCount');
const bulkExportBtn     = document.getElementById('bulkExport');
const bulkDeleteBtn     = document.getElementById('bulkDelete');
const bulkClearBtn      = document.getElementById('bulkClear');
const modalOverlay      = document.getElementById('modalOverlay');
const modalTitle        = document.getElementById('modalTitle');
const modalClose        = document.getElementById('modalClose');
const modalCancel       = document.getElementById('modalCancel');
const modalSave         = document.getElementById('modalSave');
const deleteOverlay     = document.getElementById('deleteOverlay');
const deleteClose       = document.getElementById('deleteClose');
const deleteMessage     = document.getElementById('deleteMessage');
const deleteCancelBtn   = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn  = document.getElementById('deleteConfirmBtn');

// ── Boot ──────────────────────────────────────────────────────────────────────
init();

function init() {
  bindEvents();
  applyFilters();
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  searchInput.addEventListener('input', debounce(() => { searchQuery = searchInput.value.trim(); currentPage = 1; applyFilters(); }, 250));
  filterStatusSel.addEventListener('change', () => { filterStatus = filterStatusSel.value; currentPage = 1; applyFilters(); });
  filterFulfillSel.addEventListener('change', () => { filterFulfillment = filterFulfillSel.value; currentPage = 1; applyFilters(); });
  filterCategorySel.addEventListener('change', () => { filterCategory = filterCategorySel.value; currentPage = 1; applyFilters(); });
  clearFiltersBtn.addEventListener('click', clearFilters);
  addProductBtn.addEventListener('click', () => openModal(null));
  importBtn.addEventListener('click', () => csvFileInput.click());
  csvFileInput.addEventListener('change', handleCsvImport);
  exportBtn.addEventListener('click', exportCSV);
  pageSizeSelect.addEventListener('change', () => { pageSize = parseInt(pageSizeSelect.value); currentPage = 1; renderTable(); });
  selectAllChk.addEventListener('change', toggleSelectAll);
  bulkExportBtn.addEventListener('click', exportSelectedCSV);
  bulkDeleteBtn.addEventListener('click', () => confirmDelete(Array.from(selectedIds)));
  bulkClearBtn.addEventListener('click', clearSelection);
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', saveProduct);
  deleteClose.addEventListener('click', closeDeleteModal);
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteConfirmBtn.addEventListener('click', doDelete);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  deleteOverlay.addEventListener('click', e => { if (e.target === deleteOverlay) closeDeleteModal(); });
  document.querySelectorAll('.stat-clickable').forEach(card => {
    card.addEventListener('click', () => applyStatFilter(card.dataset.filter));
  });
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = 'asc'; }
      applyFilters();
    });
  });
}

// ── Core Pipeline ─────────────────────────────────────────────────────────────
function applyFilters() {
  const q = searchQuery.toLowerCase();
  filteredProducts = products.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !p.asin.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    if (filterFulfillment && p.fulfillment !== filterFulfillment) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterStatus) {
      const computed = computedStatus(p);
      if (filterStatus === 'low_stock' && computed !== 'low_stock') return false;
      if (filterStatus === 'out_of_stock' && computed !== 'out_of_stock') return false;
      if (filterStatus === 'active' && p.status !== 'active') return false;
      if (filterStatus === 'inactive' && p.status !== 'inactive') return false;
    }
    return true;
  });

  // Sort
  filteredProducts.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === 'status') { va = computedStatus(a); vb = computedStatus(b); }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  renderStats();
  renderCategoryFilter();
  renderTable();
  updateSortHeaders();
}

// ── Stat Card Filters ─────────────────────────────────────────────────────────
function applyStatFilter(filter) {
  // Toggle off if already active
  const current = document.querySelector('.stat-clickable.stat-active');
  const isActive = current && current.dataset.filter === filter;

  clearFilters();

  if (!isActive) {
    if (filter === 'all') {
      // already cleared, just show all
    } else if (filter === 'FBA' || filter === 'FBM') {
      filterFulfillment = filter;
      filterFulfillSel.value = filter;
    } else {
      filterStatus = filter;
      filterStatusSel.value = filter;
    }
    currentPage = 1;
    applyFilters();
    // Mark card active after re-render
    document.querySelectorAll('.stat-clickable').forEach(c => {
      c.classList.toggle('stat-active', c.dataset.filter === filter);
    });
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats() {
  const totalSKUs = products.length;
  const totalValue = products.reduce((s, p) => s + (p.price * p.quantity), 0);
  const low = products.filter(p => computedStatus(p) === 'low_stock').length;
  const out = products.filter(p => computedStatus(p) === 'out_of_stock').length;
  const fbaUnits = products.filter(p => p.fulfillment === 'FBA').reduce((s, p) => s + p.quantity, 0);
  const fbmUnits = products.filter(p => p.fulfillment === 'FBM').reduce((s, p) => s + p.quantity, 0);

  document.getElementById('statTotalSKUs').textContent = totalSKUs;
  document.getElementById('statTotalValue').textContent = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('statLowStock').textContent = low;
  document.getElementById('statOutOfStock').textContent = out;
  document.getElementById('statFBA').textContent = fbaUnits.toLocaleString();
  document.getElementById('statFBM').textContent = fbmUnits.toLocaleString();
}


// ── Category Filter ───────────────────────────────────────────────────────────
function renderCategoryFilter() {
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const sel = filterCategorySel;
  const cur = filterCategory;
  sel.innerHTML = '<option value="">All Categories</option>';
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === cur) o.selected = true;
    sel.appendChild(o);
  });

  // Also update datalist in form
  const dl = document.getElementById('categoryList');
  dl.innerHTML = '';
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    dl.appendChild(o);
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('inventoryBody');
  const total = filteredProducts.length;
  document.getElementById('resultCount').textContent = `${total} product${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">
      <div class="empty-icon">&#128230;</div>
      <h3>No products found</h3>
      <p>Try adjusting your search or filters, or add your first product.</p>
      <button class="btn btn-primary" onclick="openModal(null)">+ Add Product</button>
    </div></td></tr>`;
    renderPagination(0);
    return;
  }

  const start = (currentPage - 1) * pageSize;
  const page = filteredProducts.slice(start, start + pageSize);

  tbody.innerHTML = page.map(p => {
    const status = computedStatus(p);
    const checked = selectedIds.has(p.id) ? 'checked' : '';
    const rowClass = selectedIds.has(p.id) ? 'selected-row' : '';
    const margin = p.cost > 0 ? (((p.price - p.cost) / p.price) * 100).toFixed(0) + '%' : '—';

    return `<tr class="${rowClass}" data-id="${p.id}">
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${p.id}" ${checked} /></td>
      <td class="col-name">
        <div class="product-name">${escHtml(p.name)}</div>
        ${p.notes ? `<div style="font-size:11px;color:#999;margin-top:2px">${escHtml(p.notes.substring(0, 50))}${p.notes.length > 50 ? '…' : ''}</div>` : ''}
      </td>
      <td><a href="https://www.amazon.com/dp/${escHtml(p.asin)}" target="_blank" rel="noopener" style="color:var(--amazon-blue);font-family:monospace;font-size:12px;text-decoration:none">${escHtml(p.asin)}</a></td>
      <td style="font-family:monospace;font-size:12px">${escHtml(p.sku)}</td>
      <td>${p.category ? escHtml(p.category) : '<span style="color:#ccc">—</span>'}</td>
      <td><span class="badge badge-${p.fulfillment.toLowerCase()}">${p.fulfillment}</span></td>
      <td class="qty-cell ${status === 'out_of_stock' ? 'qty-out' : status === 'low_stock' ? 'qty-low' : ''}">${p.quantity}</td>
      <td style="color:var(--text-muted)">${p.reorderPoint > 0 ? p.reorderPoint : '—'}</td>
      <td>$${p.price.toFixed(2)}</td>
      <td style="color:var(--text-muted)">${p.cost > 0 ? '$' + p.cost.toFixed(2) : '—'}<br/><span style="font-size:11px;color:#aaa">${margin !== '—' ? 'Margin: ' + margin : ''}</span></td>
      <td>${statusBadge(status, p.status)}</td>
      <td class="actions-cell">
        <button class="btn-icon edit" onclick="openModal('${p.id}')" title="Edit">&#9998;</button>
        <button class="btn-icon delete" onclick="confirmDelete(['${p.id}'])" title="Delete">&#128465;</button>
      </td>
    </tr>`;
  }).join('');

  // Row-checkbox listeners
  document.querySelectorAll('.row-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.id;
      if (chk.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkBar();
      const row = chk.closest('tr');
      row.classList.toggle('selected-row', chk.checked);
    });
  });

  // Sync select-all
  const visibleIds = page.map(p => p.id);
  selectAllChk.checked = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  selectAllChk.indeterminate = visibleIds.some(id => selectedIds.has(id)) && !selectAllChk.checked;

  renderPagination(total);
}

// ── Sort Headers ──────────────────────────────────────────────────────────────
function updateSortHeaders() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.col === sortCol) th.classList.add('sorted-' + sortDir);
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(total) {
  const pag = document.getElementById('pagination');
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  const maxBtns = 7;
  let pages = [];
  if (totalPages <= maxBtns) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pages = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  pag.innerHTML = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">&#8249;</button>
    ${pages.map(p => p === '...'
      ? `<span style="padding:0 6px;color:#aaa">…</span>`
      : `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`
    ).join('')}
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">&#8250;</button>
  `;
}

function goPage(p) { currentPage = p; renderTable(); window.scrollTo(0, 0); }

// ── Selection ─────────────────────────────────────────────────────────────────
function toggleSelectAll() {
  const start = (currentPage - 1) * pageSize;
  const pageIds = filteredProducts.slice(start, start + pageSize).map(p => p.id);
  if (selectAllChk.checked) pageIds.forEach(id => selectedIds.add(id));
  else pageIds.forEach(id => selectedIds.delete(id));
  updateBulkBar();
  renderTable();
}

function clearSelection() {
  selectedIds.clear();
  updateBulkBar();
  renderTable();
}

function updateBulkBar() {
  const n = selectedIds.size;
  if (n > 0) {
    bulkBar.classList.remove('hidden');
    bulkCount.textContent = `${n} selected`;
  } else {
    bulkBar.classList.add('hidden');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  clearFormErrors();
  const p = id ? products.find(x => x.id === id) : null;
  modalTitle.textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('fieldId').value = p ? p.id : '';
  document.getElementById('fieldName').value = p ? p.name : '';
  document.getElementById('fieldAsin').value = p ? p.asin : '';
  document.getElementById('fieldSku').value = p ? p.sku : '';
  document.getElementById('fieldCategory').value = p ? (p.category || '') : '';
  document.getElementById('fieldFulfillment').value = p ? p.fulfillment : 'FBA';
  document.getElementById('fieldQuantity').value = p ? p.quantity : '';
  document.getElementById('fieldReorderPoint').value = p ? (p.reorderPoint || '') : '';
  document.getElementById('fieldPrice').value = p ? p.price : '';
  document.getElementById('fieldCost').value = p ? (p.cost || '') : '';
  document.getElementById('fieldStatus').value = p ? p.status : 'active';
  document.getElementById('fieldNotes').value = p ? (p.notes || '') : '';
  modalOverlay.classList.remove('hidden');
  document.getElementById('fieldName').focus();
}

function closeModal() { modalOverlay.classList.add('hidden'); }

function saveProduct() {
  if (!validateForm()) return;
  const id = document.getElementById('fieldId').value;
  const data = {
    id: id || uid(),
    name: document.getElementById('fieldName').value.trim(),
    asin: document.getElementById('fieldAsin').value.trim().toUpperCase(),
    sku: document.getElementById('fieldSku').value.trim(),
    category: document.getElementById('fieldCategory').value.trim(),
    fulfillment: document.getElementById('fieldFulfillment').value,
    quantity: parseInt(document.getElementById('fieldQuantity').value) || 0,
    reorderPoint: parseInt(document.getElementById('fieldReorderPoint').value) || 0,
    price: parseFloat(document.getElementById('fieldPrice').value) || 0,
    cost: parseFloat(document.getElementById('fieldCost').value) || 0,
    status: document.getElementById('fieldStatus').value,
    notes: document.getElementById('fieldNotes').value.trim(),
    updatedAt: Date.now(),
  };
  if (id) {
    const idx = products.findIndex(p => p.id === id);
    if (idx > -1) { data.createdAt = products[idx].createdAt; products[idx] = data; }
  } else {
    data.createdAt = Date.now();
    products.unshift(data);
  }
  saveProducts();
  closeModal();
  applyFilters();
}

function validateForm() {
  clearFormErrors();
  let ok = true;
  const name = document.getElementById('fieldName').value.trim();
  const asin = document.getElementById('fieldAsin').value.trim();
  const sku = document.getElementById('fieldSku').value.trim();
  const qty = document.getElementById('fieldQuantity').value;
  const price = document.getElementById('fieldPrice').value;

  if (!name) { showErr('fieldName', 'errName', 'Product name is required'); ok = false; }
  if (!asin) { showErr('fieldAsin', 'errAsin', 'ASIN is required'); ok = false; }
  else if (!/^[A-Z0-9]{10}$/i.test(asin)) { showErr('fieldAsin', 'errAsin', 'ASIN must be 10 alphanumeric characters'); ok = false; }
  if (!sku) { showErr('fieldSku', 'errSku', 'SKU is required'); ok = false; }
  if (qty === '' || isNaN(parseInt(qty))) { showErr('fieldQuantity', 'errQuantity', 'Valid quantity required'); ok = false; }
  if (!price || isNaN(parseFloat(price))) { showErr('fieldPrice', 'errPrice', 'Valid price required'); ok = false; }
  return ok;
}

function showErr(fieldId, errId, msg) {
  document.getElementById(fieldId).classList.add('error');
  document.getElementById(errId).textContent = msg;
}

function clearFormErrors() {
  ['fieldName','fieldAsin','fieldSku','fieldQuantity','fieldPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
  });
  ['errName','errAsin','errSku','errQuantity','errPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(ids) {
  deleteTargetIds = ids;
  if (ids.length === 1) {
    const p = products.find(x => x.id === ids[0]);
    deleteMessage.textContent = `Delete "${p ? p.name : 'this product'}"? This cannot be undone.`;
  } else {
    deleteMessage.textContent = `Delete ${ids.length} selected products? This cannot be undone.`;
  }
  deleteOverlay.classList.remove('hidden');
}

function closeDeleteModal() { deleteOverlay.classList.add('hidden'); deleteTargetIds = []; }

function doDelete() {
  products = products.filter(p => !deleteTargetIds.includes(p.id));
  deleteTargetIds.forEach(id => selectedIds.delete(id));
  saveProducts();
  closeDeleteModal();
  updateBulkBar();
  applyFilters();
}

// ── Filters ───────────────────────────────────────────────────────────────────
function clearFilters() {
  searchQuery = ''; filterStatus = ''; filterFulfillment = ''; filterCategory = '';
  searchInput.value = '';
  filterStatusSel.value = '';
  filterFulfillSel.value = '';
  filterCategorySel.value = '';
  currentPage = 1;
  document.querySelectorAll('.stat-clickable').forEach(c => c.classList.remove('stat-active'));
  applyFilters();
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV() { downloadCSV(filteredProducts, 'amazon-inventory.csv'); }

function exportSelectedCSV() {
  const sel = products.filter(p => selectedIds.has(p.id));
  downloadCSV(sel, 'amazon-inventory-selected.csv');
}

function downloadCSV(data, filename) {
  const headers = ['Name','ASIN','SKU','Category','Fulfillment','Quantity','ReorderPoint','Price','Cost','Status','Notes'];
  const rows = data.map(p => [p.name, p.asin, p.sku, p.category || '', p.fulfillment, p.quantity, p.reorderPoint, p.price, p.cost || '', computedStatus(p), p.notes || ''].map(csvCell));
  const csv = [headers.map(csvCell).join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvCell(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── CSV Import ────────────────────────────────────────────────────────────────
function handleCsvImport(e) {
  const file = e.target.files[0];
  // Always reset so re-selecting the same file fires the change event again
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let text = ev.target.result;
    // Strip BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      alert('Import failed: the file appears to be empty or has only a header row.');
      return;
    }

    // Auto-detect delimiter: Amazon SC exports are tab-delimited; check first line
    const delim = lines[0].includes('\t') ? '\t' : ',';

    const rawHeaders = parseLine(lines[0], delim);
    const headers = rawHeaders.map(h => h.trim().toLowerCase()
      .replace(/[^a-z0-9]/g, '') // strip all non-alphanumeric for fuzzy matching
    );

    // Column name aliases — maps our internal key → possible column name variants (normalized)
    const aliases = {
      name:         ['name','itemname','title','productname','listingname'],
      asin:         ['asin','asin1','asincode'],
      sku:          ['sku','sellersku','merchantsku','msku'],
      category:     ['category','producttype','itemtype','productcategory'],
      fulfillment:  ['fulfillment','fulfillmentchannel','fulfillmenttype','channel','merchantfulfillmentchannel'],
      quantity:     ['quantity','qty','quantityavailable','afnlistingexists','quantityinstock','sellableunits','available'],
      reorderPoint: ['reorderpoint','reorderat','reorder','reorderqty'],
      price:        ['price','saleprice','listingprice','yourprice','sellingprice'],
      cost:         ['cost','unitcost','landedcost','cogs'],
      status:       ['status','listingstatus','condition'],
      notes:        ['notes','note','comments','description','memo'],
    };

    // Build column index map
    const colMap = {};
    for (const [field, variants] of Object.entries(aliases)) {
      for (const v of variants) {
        const idx = headers.indexOf(v);
        if (idx !== -1) { colMap[field] = idx; break; }
      }
    }

    // Check required fields found
    const missing = ['name','asin','sku'].filter(f => colMap[f] === undefined);
    if (missing.length > 0) {
      const found = rawHeaders.join(', ');
      alert(`Import failed: could not find required columns: ${missing.join(', ')}.\n\nColumns detected in your file:\n${found}\n\nExpected columns (or Amazon equivalents): Name/item-name, ASIN/asin1, SKU/seller-sku.`);
      return;
    }

    const get = (row, field) => (row[colMap[field]] || '').trim();

    let added = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i], delim);
      const name = get(vals, 'name');
      const asin = get(vals, 'asin');
      const sku  = get(vals, 'sku');
      if (!name || !asin || !sku) { skipped++; continue; }

      const fulfillRaw = get(vals, 'fulfillment').toUpperCase();
      const fulfillment = fulfillRaw.includes('MFN') || fulfillRaw === 'FBM' || fulfillRaw.includes('MERCHANT') ? 'FBM' : 'FBA';

      products.unshift({
        id: uid(),
        name,
        asin: asin.toUpperCase(),
        sku,
        category: get(vals, 'category'),
        fulfillment,
        quantity: parseInt(get(vals, 'quantity')) || 0,
        reorderPoint: parseInt(get(vals, 'reorderPoint')) || 0,
        price: parseFloat(get(vals, 'price')) || 0,
        cost: parseFloat(get(vals, 'cost')) || 0,
        status: get(vals, 'status').toLowerCase() === 'inactive' ? 'inactive' : 'active',
        notes: get(vals, 'notes'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      added++;
    }

    saveProducts();
    applyFilters();

    if (added === 0) {
      alert(`Import failed: 0 products were imported.\n\n${skipped} rows were skipped (missing Name, ASIN, or SKU values).`);
    } else {
      alert(`Successfully imported ${added} product${added !== 1 ? 's' : ''}.${skipped > 0 ? ` (${skipped} rows skipped — missing required fields)` : ''}`);
    }
  };
  reader.readAsText(file);
}

function parseLine(line, delim) {
  if (delim === '\t') {
    // Tab-delimited: no quoting complexities usually, but handle basic quoted fields
    return line.split('\t').map(v => v.replace(/^"|"$/g, ''));
  }
  // Comma-delimited with full quote handling
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computedStatus(p) {
  if (p.quantity === 0) return 'out_of_stock';
  if (p.reorderPoint > 0 && p.quantity <= p.reorderPoint) return 'low_stock';
  if (p.status === 'inactive') return 'inactive';
  return 'active';
}

function statusBadge(computed, raw) {
  const map = {
    out_of_stock: ['badge-out', 'Out of Stock'],
    low_stock: ['badge-low', 'Low Stock'],
    inactive: ['badge-inactive', 'Inactive'],
    active: ['badge-active', 'Active'],
  };
  const [cls, label] = map[computed] || map['active'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function loadProducts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveProducts() { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); }

function uid() { return Math.random().toString(36).substring(2, 10) + Date.now().toString(36); }

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Demo Data ─────────────────────────────────────────────────────────────────
function generateDemoData() {
  return [
    { id: uid(), name: 'Wireless Earbuds Pro X', asin: 'B08N5KWB9H', sku: 'WE-PRO-X-BLK', category: 'Electronics', fulfillment: 'FBA', quantity: 142, reorderPoint: 30, price: 49.99, cost: 18.50, status: 'active', notes: 'Best seller Q4', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Bamboo Cutting Board Set (3pc)', asin: 'B07PQNTHP1', sku: 'BCB-SET-3PC', category: 'Kitchen', fulfillment: 'FBA', quantity: 8, reorderPoint: 15, price: 34.95, cost: 12.00, status: 'active', notes: 'Reorder placed', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Stainless Steel Water Bottle 32oz', asin: 'B09KRBZFZS', sku: 'SS-WB-32-SLV', category: 'Sports', fulfillment: 'FBM', quantity: 0, reorderPoint: 20, price: 24.99, cost: 8.75, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Memory Foam Pillow Queen Size', asin: 'B07XLRV3NS', sku: 'MFP-QN-WHT', category: 'Home & Bedroom', fulfillment: 'FBA', quantity: 56, reorderPoint: 10, price: 39.99, cost: 14.20, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'LED Desk Lamp with USB Charging', asin: 'B08CWMFZ5L', sku: 'LED-DSK-USB-BLK', category: 'Electronics', fulfillment: 'FBA', quantity: 23, reorderPoint: 25, price: 29.95, cost: 10.50, status: 'active', notes: 'Check new supplier', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Yoga Mat Non-Slip 6mm', asin: 'B07FKGF2TN', sku: 'YM-NS-6MM-PRP', category: 'Sports', fulfillment: 'FBM', quantity: 77, reorderPoint: 15, price: 22.99, cost: 7.00, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Cast Iron Skillet 12-Inch', asin: 'B01GNBOWPU', sku: 'CI-SK-12IN', category: 'Kitchen', fulfillment: 'FBM', quantity: 0, reorderPoint: 5, price: 54.99, cost: 22.00, status: 'inactive', notes: 'Discontinued model', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Resistance Bands Set (5 Pack)', asin: 'B086DPGJBK', sku: 'RB-SET-5PK-BLU', category: 'Sports', fulfillment: 'FBA', quantity: 198, reorderPoint: 40, price: 19.99, cost: 5.50, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Essential Oils Diffuser 500ml', asin: 'B07BQNSZBL', sku: 'EOD-500ML-WD', category: 'Home & Bedroom', fulfillment: 'FBA', quantity: 12, reorderPoint: 20, price: 35.99, cost: 13.00, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Stainless Meal Prep Containers 10pk', asin: 'B09NW9C7WQ', sku: 'MP-SS-10PK-CLR', category: 'Kitchen', fulfillment: 'FBA', quantity: 45, reorderPoint: 10, price: 44.99, cost: 16.80, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Portable Phone Stand Adjustable', asin: 'B08QT41JKV', sku: 'PS-ADJ-SLV', category: 'Electronics', fulfillment: 'FBM', quantity: 3, reorderPoint: 10, price: 14.99, cost: 3.50, status: 'active', notes: 'Flash sale candidate', createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid(), name: 'Glass Food Storage Set 18pc', asin: 'B07MKM3BS8', sku: 'GFS-18PC-CLR', category: 'Kitchen', fulfillment: 'FBA', quantity: 62, reorderPoint: 15, price: 59.99, cost: 24.00, status: 'active', notes: '', createdAt: Date.now(), updatedAt: Date.now() },
  ];
}
