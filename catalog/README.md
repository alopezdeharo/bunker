# Catálogo de El Bunker

Datos de los items (comida, bebidas, juegos de mesa y videojuegos) en JSON, listos para importar a Firestore.

| Archivo | Contenido |
|---|---|
| `food.json` | Comida |
| `beverages.json` | Bebidas |
| `boardgames.json` | Juegos de mesa |
| `videogames.json` | Videojuegos |
| `local/*.json` | Items de "Fuera de carta". Se importan a Firestore pero **no se suben a git** (carpeta ignorada). Cada item lleva `"secret": true` |

## Cómo se usa

```
node scripts/import-catalog.js --validar              # solo comprueba los archivos, no necesita clave
node scripts/import-catalog.js clave.json             # importa (crea o actualiza)
node scripts/import-catalog.js clave.json --sin-local # importa sin Fuera de carta
node scripts/import-catalog.js clave.json --borrar    # borra de Firestore los items del catálogo
```

Importar de nuevo actualiza los items existentes (conserva `createdAt`) y no toca valoraciones ni notas. No borra los items que ya no estén en el catálogo: el script los lista al final.

## Campos de un item

- Comunes: `id` (estable, en minúsculas y con guiones; prefijos `bg-`, `vg-`, `bev-`, `food-`), `name`, `category`, `description`, `tags`, `availability` (`ready`, `quick`, `planned`), `kind` (`consume`, `prepare`, `play`) y `details`. Opcionales: `active` (por defecto `true`) e `image`.
- **Foto:** si no hay `image`, se usa `/images/items/<id>.webp` cuando ese archivo existe en `public/images/items/`.
- Para preparar: `ingredients`, `steps`, `toppings`, `tips` (listas de texto) y `variants` (`id`, `name`, y opcionalmente `description`, `ingredients`, `steps`).
- Bebidas: `serveTip` (cómo tomarla) y `pairsWith` (ids de otros items).
- `details.bestBefore` es una fecha `AAAA-MM-DD` (el último día del mes de la etiqueta); `bestBeforeEstimated: true` si no viene en el envase.
- Los campos que empiezan por `_` (por ejemplo `_pending`) no se importan: son notas de trabajo, y `--validar` las lista.

Los detalles de cada categoría están en `scripts/import-catalog.js` (valores permitidos).
