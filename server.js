const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = initDB();

// --- Scoring ---

function calcScore(criteriaArray) {
  const mandatoryPass = criteriaArray[0] && criteriaArray[1] && criteriaArray[2]
                     && criteriaArray[3] && criteriaArray[4];
  if (!mandatoryPass) return 0;
  const recommendedCount = criteriaArray.slice(5, 17).filter(Boolean).length;
  if (recommendedCount === 0) return 0.5;
  return recommendedCount * (0.5 / 12) + 0.5;
}

function scoreClass(s) {
  if (s === 0) return 'none';
  const p = Math.round(s * 100);
  return p >= 75 ? 'high' : p >= 50 ? 'mid' : 'low';
}

const SCORE_LABEL = { high: 'Alto', mid: 'Medio', low: 'Bajo', none: 'No apto' };

function enrichProduct(product, criteriaRows) {
  const boolArray = criteriaRows.map(c => !!c.is_met);
  const score = calcScore(boolArray);
  const cls = scoreClass(score);
  return {
    ...product,
    score,
    score_pct: score === 0 ? 0 : Math.round(score * 100),
    score_class: cls,
    score_label: SCORE_LABEL[cls],
    criteria: criteriaRows.map(c => ({
      criteria_id: c.criteria_id,
      label: c.label,
      category: c.category,
      is_met: !!c.is_met
    }))
  };
}

// --- Prepared statements ---

const stmtAllProducts = db.prepare(`SELECT * FROM products ORDER BY id`);

const stmtProductById = db.prepare(`SELECT * FROM products WHERE id = ?`);

const stmtProductCriteria = db.prepare(`
  SELECT pc.criteria_id, c.label, c.category, pc.is_met
  FROM product_criteria pc
  JOIN criteria c ON c.id = pc.criteria_id
  WHERE pc.product_id = ?
  ORDER BY c.sort_order
`);

const stmtInsertProduct = db.prepare(`INSERT INTO products (name, external_id) VALUES (?, ?)`);

const stmtAllCriteria = db.prepare(`SELECT id FROM criteria ORDER BY sort_order`);

const stmtInsertPC = db.prepare(`INSERT INTO product_criteria (product_id, criteria_id, is_met) VALUES (?, ?, 0)`);

const stmtUpdateProduct = db.prepare(`UPDATE products SET name = ?, external_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);

const stmtDeleteProduct = db.prepare(`DELETE FROM products WHERE id = ?`);

const stmtUpdateCriterion = db.prepare(`UPDATE product_criteria SET is_met = ? WHERE product_id = ? AND criteria_id = ?`);

const stmtCriteriaList = db.prepare(`SELECT * FROM criteria ORDER BY sort_order`);

// --- Routes ---

// GET /api/products
app.get('/api/products', (req, res) => {
  const products = stmtAllProducts.all();
  const enriched = products.map(p => {
    const criteria = stmtProductCriteria.all(p.id);
    return enrichProduct(p, criteria);
  });

  let high = 0, mid = 0, fail = 0;
  enriched.forEach(p => {
    if (p.score_class === 'high') high++;
    else if (p.score_class === 'mid') mid++;
    else fail++;
  });

  res.json({
    products: enriched,
    stats: { total: enriched.length, high, mid, fail }
  });
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  const product = stmtProductById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const criteria = stmtProductCriteria.all(product.id);
  res.json(enrichProduct(product, criteria));
});

// POST /api/products
app.post('/api/products', (req, res) => {
  const { name = '', external_id = '' } = req.body;
  const createProduct = db.transaction(() => {
    const result = stmtInsertProduct.run(name, external_id);
    const productId = result.lastInsertRowid;
    const allCriteria = stmtAllCriteria.all();
    for (const c of allCriteria) {
      stmtInsertPC.run(productId, c.id);
    }
    return productId;
  });
  const productId = createProduct();
  const product = stmtProductById.get(productId);
  const criteria = stmtProductCriteria.all(productId);
  res.status(201).json(enrichProduct(product, criteria));
});

// PUT /api/products/:id
app.put('/api/products/:id', (req, res) => {
  const product = stmtProductById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const name = req.body.name !== undefined ? req.body.name : product.name;
  const external_id = req.body.external_id !== undefined ? req.body.external_id : product.external_id;
  stmtUpdateProduct.run(name, external_id, product.id);
  const updated = stmtProductById.get(product.id);
  const criteria = stmtProductCriteria.all(product.id);
  res.json(enrichProduct(updated, criteria));
});

// DELETE /api/products/:id
app.delete('/api/products/:id', (req, res) => {
  const product = stmtProductById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  stmtDeleteProduct.run(product.id);
  res.json({ success: true, id: product.id });
});

// PUT /api/products/:id/criteria/:criteriaId
app.put('/api/products/:id/criteria/:criteriaId', (req, res) => {
  const { is_met } = req.body;
  stmtUpdateCriterion.run(is_met ? 1 : 0, req.params.id, req.params.criteriaId);
  const product = stmtProductById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const criteria = stmtProductCriteria.all(product.id);
  res.json(enrichProduct(product, criteria));
});

// PUT /api/products/:id/criteria (bulk update)
app.put('/api/products/:id/criteria', (req, res) => {
  const { criteria } = req.body;
  if (!Array.isArray(criteria)) return res.status(400).json({ error: 'criteria must be an array' });
  const bulkUpdate = db.transaction(() => {
    for (const c of criteria) {
      stmtUpdateCriterion.run(c.is_met ? 1 : 0, req.params.id, c.criteria_id);
    }
  });
  bulkUpdate();
  const product = stmtProductById.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const criteriaRows = stmtProductCriteria.all(product.id);
  res.json(enrichProduct(product, criteriaRows));
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const products = stmtAllProducts.all();
  let high = 0, mid = 0, fail = 0;
  products.forEach(p => {
    const criteria = stmtProductCriteria.all(p.id);
    const boolArray = criteria.map(c => !!c.is_met);
    const score = calcScore(boolArray);
    const cls = scoreClass(score);
    if (cls === 'high') high++;
    else if (cls === 'mid') mid++;
    else fail++;
  });
  res.json({ total: products.length, high, mid, fail });
});

// GET /api/criteria
app.get('/api/criteria', (req, res) => {
  res.json(stmtCriteriaList.all());
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Validación de Productos running on http://localhost:${PORT}`);
});
