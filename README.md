# Validación de Productos

App fullstack para evaluar productos de venta online por impulso. Evalúa cada producto contra **17 criterios** organizados en 3 categorías (Decisivo, Obligatorios, Recomendados) y calcula un porcentaje de aptitud automáticamente.

## Stack

- **Backend**: Node.js + Express
- **Base de datos**: SQLite3 (better-sqlite3)
- **Frontend**: HTML/CSS/JS vanilla
- **API**: REST JSON

## Instalación

```bash
npm install
```
```bash
npm start
```
La app estará disponible en `http://localhost:3000`

## Estructura

```
validacion-productos/
├── server.js           # Express + API routes
├── db/
│   ├── init.js         # Crear tablas + seed de criterios
│   └── database.sqlite # Auto-generado al iniciar
├── public/
│   ├── index.html      # Frontend
│   ├── styles.css      # Estilos mobile-first
│   └── app.js          # Lógica frontend + API calls
└── package.json
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Lista productos con scores |
| GET | `/api/products/:id` | Producto individual |
| POST | `/api/products` | Crear producto |
| PUT | `/api/products/:id` | Actualizar nombre/ID |
| DELETE | `/api/products/:id` | Eliminar producto |
| PUT | `/api/products/:id/criteria/:cid` | Toggle criterio |
| PUT | `/api/products/:id/criteria` | Bulk update criterios |
| GET | `/api/stats` | Estadísticas globales |
| GET | `/api/criteria` | Lista 17 criterios |

## Scoring

- Los 5 primeros criterios (decisivo + obligatorios) son **gate**: si alguno falla, score = 0%
- Si pasan todos los mandatory: 50% base + (recommended_count / 12) * 50%
- Clasificación: ≥75% Alto (verde), ≥50% Medio (amarillo), <50% Bajo (rojo), 0% No apto
