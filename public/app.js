const API = '/api';

const SECTION_LABEL = {
  decisive: 'Criterio Decisivo',
  obligatory: 'Criterios Obligatorios',
  recommended: 'Criterios Recomendados'
};
const SCORE_COLOR = { high: '#1a7a4a', mid: '#d97706', low: '#c0392b', none: '#ccc' };
const SCORE_LABEL = { high: 'Alto', mid: 'Medio', low: 'Bajo', none: 'No apto' };

let products = [];
let current = 0;
let debounceTimers = {};

// --- Scoring (local for optimistic updates) ---

function calcScore(criteriaArray) {
  const ok = criteriaArray[0] && criteriaArray[1] && criteriaArray[2]
          && criteriaArray[3] && criteriaArray[4];
  if (!ok) return 0;
  const rec = criteriaArray.slice(5, 17).filter(Boolean).length;
  return rec === 0 ? 0.5 : rec * (0.5 / 12) + 0.5;
}

function scoreClass(s) {
  if (s === 0) return 'none';
  const p = Math.round(s * 100);
  return p >= 75 ? 'high' : p >= 50 ? 'mid' : 'low';
}

// --- API calls ---

async function fetchProducts() {
  const res = await fetch(`${API}/products`);
  const data = await res.json();
  products = data.products;
  if (current >= products.length) current = Math.max(0, products.length - 1);
  render();
}

async function createProduct(name, external_id) {
  const res = await fetch(`${API}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, external_id })
  });
  return res.json();
}

async function updateProduct(id, data) {
  await fetch(`${API}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function deleteProduct(id) {
  await fetch(`${API}/products/${id}`, { method: 'DELETE' });
}

async function toggleCriterion(productId, criteriaId, is_met) {
  await fetch(`${API}/products/${productId}/criteria/${criteriaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_met })
  });
}

// --- Render ---

function updateStats() {
  let h = 0, m = 0, f = 0;
  products.forEach(p => {
    if (p.score_class === 'high') h++;
    else if (p.score_class === 'mid') m++;
    else f++;
  });
  document.getElementById('statTotal').textContent = products.length;
  document.getElementById('statHigh').textContent = h;
  document.getElementById('statMid').textContent = m;
  document.getElementById('statFail').textContent = f;
}

function renderStrip() {
  const strip = document.getElementById('productStrip');
  strip.innerHTML = '';
  products.forEach((p, i) => {
    const color = SCORE_COLOR[p.score_class || 'none'];
    const chip = document.createElement('div');
    chip.className = 'strip-chip' + (i === current ? ' active' : '');
    chip.innerHTML = `<span class="chip-dot" style="background:${i === current ? 'white' : color}"></span>${esc(p.name || '#' + (i + 1))}`;
    chip.onclick = () => goTo(i);
    strip.appendChild(chip);
  });
  const active = strip.children[current];
  if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function renderCard() {
  const area = document.getElementById('cardArea');
  if (!products.length) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos aún.<br>Agrega tu primer producto.</p></div>';
    document.getElementById('navCurrent').textContent = '—';
    document.getElementById('navName').textContent = '';
    document.getElementById('btnPrev').disabled = true;
    document.getElementById('btnNext').disabled = true;
    return;
  }

  const p = products[current];
  const cls = p.score_class || 'none';
  const pct = p.score_pct || 0;

  // Group criteria by category
  const sections = [];
  let lastType = null;
  (p.criteria || []).forEach(c => {
    if (c.category !== lastType) {
      sections.push({ type: c.category, items: [] });
      lastType = c.category;
    }
    sections[sections.length - 1].items.push(c);
  });

  const sectionsHTML = sections.map(sec =>
    `<div class="criteria-section">
      <div class="section-label ${sec.type}">
        <div class="section-dot dot-${sec.type}"></div>
        ${SECTION_LABEL[sec.type]}
      </div>
      ${sec.items.map(item => {
        const val = item.is_met;
        return `<div class="criteria-row" data-pid="${p.id}" data-cid="${item.criteria_id}">
          <span class="criteria-text ${val ? 'on' : 'off'}">${item.label}</span>
          <label class="toggle ${sec.type}" onclick="event.stopPropagation()">
            <input type="checkbox" ${val ? 'checked' : ''} data-pid="${p.id}" data-cid="${item.criteria_id}">
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>`;
      }).join('')}
    </div>`
  ).join('');

  area.innerHTML = `
    <div class="notice-card">
      <strong>⚡ Recuerda:</strong> Esta probabilidad indica qué tan apto es el producto para venta online por impulso, no si tendrás éxito con él.
    </div>
    <div class="product-card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-num">Producto ${current + 1} de ${products.length}</div>
          <input class="card-name-input" type="text" value="${esc(p.name)}" placeholder="Nombre del producto…" id="inputName">
          <input class="card-id-input" type="text" value="${esc(p.external_id)}" placeholder="ID (opcional)" id="inputId">
        </div>
        <div class="card-header-right">
          <div class="result-badge badge-${cls}">
            <div class="result-pct">${pct}%</div>
            <div class="result-label">${SCORE_LABEL[cls]}</div>
          </div>
          <button class="btn-delete" id="btnDelete" title="Eliminar">🗑 Eliminar</button>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${pct}%;background:${SCORE_COLOR[cls]}"></div>
        </div>
      </div>
      ${sectionsHTML}
    </div>`;

  // Wire up name/id inputs with debounce
  const nameInput = document.getElementById('inputName');
  const idInput = document.getElementById('inputId');

  nameInput.addEventListener('input', () => {
    products[current].name = nameInput.value;
    renderStrip();
    debounce('name', () => updateProduct(p.id, { name: nameInput.value }), 500);
  });

  idInput.addEventListener('input', () => {
    products[current].external_id = idInput.value;
    debounce('id', () => updateProduct(p.id, { external_id: idInput.value }), 500);
  });

  // Wire up delete
  document.getElementById('btnDelete').addEventListener('click', handleDelete);

  // Wire up criteria toggles
  area.querySelectorAll('.criteria-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      const pid = parseInt(row.dataset.pid);
      const cid = parseInt(row.dataset.cid);
      handleToggle(pid, cid);
    });
  });

  area.querySelectorAll('.toggle input').forEach(input => {
    input.addEventListener('change', () => {
      const pid = parseInt(input.dataset.pid);
      const cid = parseInt(input.dataset.cid);
      handleToggle(pid, cid);
    });
  });

  document.getElementById('navCurrent').textContent = `${current + 1} / ${products.length}`;
  document.getElementById('navName').textContent = p.name ? `"${p.name}"` : `Producto ${current + 1}`;
  document.getElementById('btnPrev').disabled = current === 0;
  document.getElementById('btnNext').disabled = current === products.length - 1;
}

function render() {
  renderStrip();
  renderCard();
  updateStats();
}

// --- Handlers ---

async function handleToggle(productId, criteriaId) {
  const p = products[current];
  const criterion = p.criteria.find(c => c.criteria_id === criteriaId);
  if (!criterion) return;

  // Optimistic update
  criterion.is_met = !criterion.is_met;
  const boolArray = p.criteria.map(c => c.is_met);
  const score = calcScore(boolArray);
  const cls = scoreClass(score);
  p.score = score;
  p.score_pct = score === 0 ? 0 : Math.round(score * 100);
  p.score_class = cls;
  p.score_label = SCORE_LABEL[cls];
  render();

  // Persist
  await toggleCriterion(productId, criteriaId, criterion.is_met);
}

async function handleDelete() {
  const p = products[current];
  if (!confirm(`¿Eliminar "${p.name || 'este producto'}"?`)) return;
  await deleteProduct(p.id);
  await fetchProducts();
}

function goTo(idx) {
  if (idx < 0 || idx >= products.length) return;
  current = idx;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function debounce(key, fn, ms) {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(fn, ms);
}

// --- Modal ---

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('modalName').focus(), 300);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalName').value = '';
  document.getElementById('modalId').value = '';
}

async function confirmAdd() {
  const name = document.getElementById('modalName').value.trim();
  const id = document.getElementById('modalId').value.trim();
  if (!name && !id) return;
  await createProduct(name, id);
  closeModal();
  await fetchProducts();
  current = products.length - 1;
  render();
}

// --- Event listeners ---

document.getElementById('btnAdd').addEventListener('click', openModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnConfirm').addEventListener('click', confirmAdd);
document.getElementById('btnPrev').addEventListener('click', () => goTo(current - 1));
document.getElementById('btnNext').addEventListener('click', () => goTo(current + 1));

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

document.getElementById('modalName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('modalId').focus();
});
document.getElementById('modalId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAdd();
});

// Swipe support
let tx = 0;
document.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 60) goTo(current + (dx < 0 ? 1 : -1));
}, { passive: true });

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Dark mode ---

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('btnTheme');
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('btnTheme').addEventListener('click', toggleTheme);

// --- Init ---
initTheme();
fetchProducts();
