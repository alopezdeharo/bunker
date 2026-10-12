const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'catalog');
const LOCAL_DIR   = path.join(CATALOG_DIR, 'local');
const IMAGES_DIR  = path.join(ROOT, 'public', 'images', 'items');

const args     = process.argv.slice(2);
const flags    = args.filter(a => a.startsWith('--'));
const keyPath  = args.find(a => !a.startsWith('--'));
const VALIDAR  = flags.includes('--validar');
const BORRAR   = flags.includes('--borrar');
const SIN_LOCAL = flags.includes('--sin-local');

if (!VALIDAR && !keyPath) {
  console.error('Uso:\n  node import-catalog.js --validar\n  node import-catalog.js <clave.json> [--borrar] [--sin-local]');
  process.exit(1);
}

// Valores permitidos

const CATEGORIES   = ['boardgame', 'videogame', 'beverage', 'food'];
const AVAILABILITY = ['ready', 'quick', 'planned'];
const KINDS        = ['consume', 'prepare', 'play'];
const DIFFICULTY   = ['easy', 'medium', 'hard'];
const PLATFORMS    = ['PS1', 'PS2', 'SNES', 'Wii', 'Switch'];
const VIDEO_MODES  = ['competitive', 'cooperative', 'party', 'casual'];
const BEV_TYPES    = ['tea', 'infusion', 'coffee', 'cocoa', 'shake', 'water', 'soft', 'mocktail', 'cocktail'];
const TEMPERATURES = ['hot', 'cold', 'either'];
const CAFFEINE     = ['none', 'some', 'high'];
const FOOD_TYPES   = ['snack', 'sweet', 'hearty'];
const ID_PATTERN   = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Lectura de archivos

function readJsonDir(dir, isLocal) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const full = path.join(dir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      console.error(`ERROR en ${path.relative(ROOT, full)}: JSON no válido (${err.message})`);
      process.exit(1);
    }
    if (!Array.isArray(data)) {
      console.error(`ERROR en ${path.relative(ROOT, full)}: debe ser una lista de items.`);
      process.exit(1);
    }
    data.forEach((item, i) => out.push({ item, isLocal, file: path.relative(ROOT, full), index: i }));
  }
  return out;
}

// Validación

const isStr  = v => typeof v === 'string' && v.trim() !== '';
const isNum  = v => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = v => v === null || v === undefined || isNum(v);
const isStrList = v => Array.isArray(v) && v.length > 0 && v.every(isStr);

function validateItem({ item, isLocal, file, index }, errors, warnings) {
  const where = `${file} #${index + 1}${item && item.name ? ` (${item.name})` : ''}`;
  const err = msg => errors.push(`${where}: ${msg}`);

  if (!item || typeof item !== 'object') { err('no es un objeto'); return; }

  if (!isStr(item.id) || !ID_PATTERN.test(item.id)) err(`id no válido: "${item.id}" (minúsculas, números y guiones)`);
  if (!isStr(item.name)) err('falta name');
  if (!CATEGORIES.includes(item.category)) err(`category no válida: "${item.category}"`);
  if (!isStr(item.description)) err('falta description');
  if (!Array.isArray(item.tags) || !item.tags.every(isStr)) err('tags debe ser una lista de textos');
  if (!AVAILABILITY.includes(item.availability)) err(`availability no válida: "${item.availability}"`);
  if (!KINDS.includes(item.kind)) err(`kind no válido: "${item.kind}"`);
  if (item.active !== undefined && typeof item.active !== 'boolean') err('active debe ser true o false');
  if (isLocal && item.secret !== true) err('los items de catalog/local deben llevar "secret": true');
  if (!isLocal && item.secret === true) err('un item secreto debe ir en catalog/local, que no se sube a git');
  if (item.image !== undefined && typeof item.image !== 'string') err('image debe ser un texto');

  if (item.ingredients !== undefined && !isStrList(item.ingredients)) err('ingredients debe ser una lista de textos');
  if (item.steps !== undefined && !isStrList(item.steps)) err('steps debe ser una lista de textos');
  if (item.toppings !== undefined && !isStrList(item.toppings)) err('toppings debe ser una lista de textos');
  if (item.tips !== undefined && !isStrList(item.tips)) err('tips debe ser una lista de textos');
  if (item.serveTip !== undefined && !isStr(item.serveTip)) err('serveTip debe ser un texto');
  if (item.pairsWith !== undefined && !(Array.isArray(item.pairsWith) && item.pairsWith.every(isStr))) err('pairsWith debe ser una lista de ids');

  if (item.variants !== undefined) {
    if (!Array.isArray(item.variants) || item.variants.length === 0) err('variants debe ser una lista con al menos una variante');
    else {
      const seen = new Set();
      item.variants.forEach((v, i) => {
        if (!v || !isStr(v.id) || !ID_PATTERN.test(v.id)) err(`variante ${i + 1}: id no válido`);
        else if (seen.has(v.id)) err(`variante ${i + 1}: id repetido "${v.id}"`);
        else seen.add(v.id);
        if (!v || !isStr(v.name)) err(`variante ${i + 1}: falta name`);
        if (v && v.ingredients !== undefined && !isStrList(v.ingredients)) err(`variante ${i + 1}: ingredients no válido`);
        if (v && v.steps !== undefined && !isStrList(v.steps)) err(`variante ${i + 1}: steps no válido`);
        if (v && v.description !== undefined && !isStr(v.description)) err(`variante ${i + 1}: description no válida`);
      });
    }
  }

  const d = item.details;
  if (!d || typeof d !== 'object') { err('falta details'); return; }

  if (item.category === 'boardgame') {
    if (!isNumOrNull(d.minPlayers) || !isNumOrNull(d.maxPlayers)) err('minPlayers y maxPlayers deben ser números o null');
    if (isNum(d.minPlayers) && isNum(d.maxPlayers) && d.minPlayers > d.maxPlayers) err('minPlayers mayor que maxPlayers');
    if (!isNumOrNull(d.durationMin) || !isNumOrNull(d.durationMax)) err('durationMin y durationMax deben ser números o null');
    if (isNum(d.durationMin) && isNum(d.durationMax) && d.durationMin > d.durationMax) err('durationMin mayor que durationMax');
    if (!isNumOrNull(d.setupTime)) err('setupTime debe ser un número o null');
    if (!DIFFICULTY.includes(d.difficulty)) err(`difficulty no válida: "${d.difficulty}"`);
    if (!isStrList(d.type)) err('type debe ser una lista de textos');
    if (item.kind !== 'play') err('un juego de mesa debe tener kind "play"');
  }

  if (item.category === 'videogame') {
    if (!isNum(d.minPlayers) || !isNum(d.maxPlayers)) err('minPlayers y maxPlayers son obligatorios');
    if (isNum(d.minPlayers) && isNum(d.maxPlayers) && d.minPlayers > d.maxPlayers) err('minPlayers mayor que maxPlayers');
    if (d.minPlayers === 1 && d.maxPlayers === 1) err('no se añaden juegos de un solo jugador');
    if (!Array.isArray(d.platforms) || d.platforms.length === 0 || !d.platforms.every(p => PLATFORMS.includes(p))) err(`platforms debe usar: ${PLATFORMS.join(', ')}`);
    if (!Array.isArray(d.mode) || d.mode.length === 0 || !d.mode.every(m => VIDEO_MODES.includes(m))) err(`mode debe usar: ${VIDEO_MODES.join(', ')}`);
    if (!isNumOrNull(d.durationMin) || !isNumOrNull(d.durationMax)) err('durationMin y durationMax deben ser números o null');
    if (item.kind !== 'play') err('un videojuego debe tener kind "play"');
  }

  if (item.category === 'beverage') {
    if (!BEV_TYPES.includes(d.type)) err(`type no válido: "${d.type}"`);
    if (typeof d.alcoholic !== 'boolean') err('alcoholic debe ser true o false');
    if (!TEMPERATURES.includes(d.temperature)) err(`temperature no válida: "${d.temperature}"`);
    if (!isNumOrNull(d.preparationTime)) err('preparationTime debe ser un número o null');
    if (d.flavor !== undefined && !(Array.isArray(d.flavor) && d.flavor.every(isStr))) err('flavor debe ser una lista de textos');
    if (d.caffeineLevel !== undefined && d.caffeineLevel !== null && !CAFFEINE.includes(d.caffeineLevel)) err(`caffeineLevel no válido: "${d.caffeineLevel}"`);
    if (!isNumOrNull(d.steepingTime)) err('steepingTime debe ser un número o null');
    if (d.bestBefore !== undefined && d.bestBefore !== null && !(DATE_PATTERN.test(d.bestBefore) && !Number.isNaN(Date.parse(d.bestBefore)))) err('bestBefore debe ser una fecha AAAA-MM-DD o null');
    if (d.bestBeforeEstimated !== undefined && typeof d.bestBeforeEstimated !== 'boolean') err('bestBeforeEstimated debe ser true o false');
    if (d.bestBeforeEstimated === true && !d.bestBefore) err('bestBeforeEstimated sin bestBefore');
  }

  if (item.category === 'food') {
    if (!Array.isArray(d.type) || d.type.length === 0 || !d.type.every(t => FOOD_TYPES.includes(t))) err(`type debe usar: ${FOOD_TYPES.join(', ')}`);
    if (!isNumOrNull(d.preparationTime)) err('preparationTime debe ser un número o null');
    if (!isNumOrNull(d.servings)) err('servings debe ser un número o null');
    if (typeof d.vegetarian !== 'boolean') err('vegetarian debe ser true o false');
    if (d.bestBefore !== undefined && d.bestBefore !== null && !DATE_PATTERN.test(d.bestBefore)) err('bestBefore debe ser una fecha AAAA-MM-DD o null');
  }

  if (item._pending !== undefined) {
    warnings.push(`${where}: ${item._pending}`);
  }
}

function validateAll(entries) {
  const errors = [];
  const warnings = [];
  const ids = new Map();

  entries.forEach(e => validateItem(e, errors, warnings));

  entries.forEach(({ item, file, index }) => {
    if (!item || !isStr(item.id)) return;
    if (ids.has(item.id)) errors.push(`${file} #${index + 1}: id repetido "${item.id}" (ya en ${ids.get(item.id)})`);
    else ids.set(item.id, file);
  });

  entries.forEach(({ item, file, index }) => {
    if (!item || !Array.isArray(item.pairsWith)) return;
    item.pairsWith.forEach(ref => {
      if (!ids.has(ref)) errors.push(`${file} #${index + 1} (${item.name}): pairsWith apunta a un id que no existe: "${ref}"`);
    });
  });

  return { errors, warnings };
}

// Conversión a documento de Firestore

function imageFor(item) {
  if (item.image) return item.image;
  const file = path.join(IMAGES_DIR, `${item.id}.webp`);
  return fs.existsSync(file) ? `/images/items/${item.id}.webp` : '';
}

function buildDoc(item, Timestamp) {
  const doc = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === 'id' || key.startsWith('_')) continue;
    doc[key] = value;
  }
  doc.image  = imageFor(item);
  doc.active = item.active !== false;
  doc.secret = item.secret === true;

  const d = { ...item.details };
  if (d.bestBefore) d.bestBefore = Timestamp.fromDate(new Date(`${d.bestBefore}T12:00:00Z`));
  doc.details = d;
  return doc;
}

// Ejecución

async function run() {
  const entries = [
    ...readJsonDir(CATALOG_DIR, false),
    ...(SIN_LOCAL ? [] : readJsonDir(LOCAL_DIR, true)),
  ];

  const { errors, warnings } = validateAll(entries);

  const porCategoria = {};
  entries.forEach(({ item }) => { if (item && item.category) porCategoria[item.category] = (porCategoria[item.category] || 0) + 1; });

  if (warnings.length) {
    console.log(`\nPendientes marcados en el catálogo (${warnings.length}):`);
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(es):`);
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\nCatálogo válido: ${entries.length} items.`);
  Object.entries(porCategoria).forEach(([cat, n]) => console.log(`  ${cat}: ${n}`));

  if (VALIDAR) return;

  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

  initializeApp({ credential: cert(require(path.resolve(keyPath))) });
  const db = getFirestore();
  const col = db.collection('items');

  const refs = entries.map(({ item }) => col.doc(item.id));
  const BATCH_SIZE = 400;

  if (BORRAR) {
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      refs.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    console.log(`Borrados ${refs.length} items del catálogo.`);
    return;
  }

  const existing = new Map();
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const snaps = await db.getAll(...refs.slice(i, i + BATCH_SIZE));
    snaps.forEach(s => { if (s.exists) existing.set(s.id, s.data()); });
  }

  let nuevos = 0;
  let actualizados = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    entries.slice(i, i + BATCH_SIZE).forEach(({ item }) => {
      const prev = existing.get(item.id);
      const doc = buildDoc(item, Timestamp);
      doc.createdAt = prev && prev.createdAt ? prev.createdAt : FieldValue.serverTimestamp();
      doc.updatedAt = FieldValue.serverTimestamp();
      batch.set(col.doc(item.id), doc);
      if (prev) actualizados++; else nuevos++;
    });
    await batch.commit();
  }
  console.log(`Importados ${entries.length} items (${nuevos} nuevos, ${actualizados} actualizados).`);

  const ids = new Set(entries.map(({ item }) => item.id));
  const all = await col.select().get();
  const fuera = all.docs.map(d => d.id).filter(id => !ids.has(id));
  if (fuera.length) {
    console.log(`\nHay ${fuera.length} item(s) en Firestore que no están en el catálogo (por ejemplo los de prueba "seed_"):`);
    fuera.slice(0, 20).forEach(id => console.log(`  - ${id}`));
    console.log('Los de prueba se quitan con: node seed-items.js <clave.json> --borrar');
  }
}

run().then(() => process.exit(0)).catch(err => { console.error('Error:', err.message); process.exit(1); });
