const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

function initDB() {
  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      external_id TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('decisive', 'obligatory', 'recommended')),
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      criteria_id INTEGER NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
      is_met BOOLEAN NOT NULL DEFAULT 0,
      UNIQUE(product_id, criteria_id)
    );
  `);

  // Seed criteria if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM criteria').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO criteria (sort_order, label, category) VALUES (?, ?, ?)');
    const seed = db.transaction((rows) => {
      for (const row of rows) insert.run(row[0], row[1], row[2]);
    });
    seed([
      [1,  'Resuelve un problema específico',            'decisive'],
      [2,  'Stock ilimitado',                            'obligatory'],
      [3,  'Ligero y no frágil',                         'obligatory'],
      [4,  'Proveedor verificado o buena calificación',  'obligatory'],
      [5,  'No es de temporada',                         'obligatory'],
      [6,  'Micronicho',                                 'recommended'],
      [7,  'Innovador o poco común',                     'recommended'],
      [8,  'Percepción de valor',                        'recommended'],
      [9,  'Público masivo',                             'recommended'],
      [10, 'No se encuentra en mercado tradicional',     'recommended'],
      [11, 'Ticket bajo (menos de 30 USD)',              'recommended'],
      [12, 'Potencial viral',                            'recommended'],
      [13, 'No tiene tamaño muy grande',                 'recommended'],
      [14, 'Sin variaciones complejas',                  'recommended'],
      [15, 'Puede venderse en combos',                   'recommended'],
      [16, 'Efecto WOW (curiosidad o sorpresa)',         'recommended'],
      [17, 'Margen mínimo de ganancia (≥3 USD)',         'recommended'],
    ]);
  }

  return db;
}

module.exports = { initDB, DB_PATH };
