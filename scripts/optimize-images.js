const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

// ── Rutas y tamaños ──

const ROOT      = path.join(__dirname, '..');
const UI_DIR    = path.join(ROOT, 'public', 'images');
const ITEMS_DIR = path.join(UI_DIR, 'items');
const SRC_DIR   = path.join(ROOT, 'assets-src', 'images');

const BOXES = {
  'subtitulo.png': { width: 320, height: 100 },
};
const DEFAULT_BOX = { width: 320, height: 320 };
const ITEM_BOX    = { width: 640, height: 640 };

const ITEM_QUALITY = 76;
const UI_QUALITY   = 82;

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const FORCE     = process.argv.includes('--forzar');

// ── Trabajos ──

function interfaceJobs() {
  return fs.readdirSync(UI_DIR)
    .filter(file => file.toLowerCase().endsWith('.png'))
    .map(file => ({
      label: file,
      src:   path.join(UI_DIR, file),
      out:   path.join(UI_DIR, file.replace(/\.png$/i, '.webp')),
      box:   BOXES[file] ?? DEFAULT_BOX,
    }));
}

function listImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listImages(full);
    return IMAGE_EXT.test(entry.name) ? [full] : [];
  });
}

function itemJobs() {
  if (!fs.existsSync(SRC_DIR)) return [];

  return fs.readdirSync(SRC_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(folder => listImages(path.join(SRC_DIR, folder.name)))
    .map(src => ({
      label: path.relative(SRC_DIR, src).replace(/\\/g, '/'),
      src,
      out:   path.join(ITEMS_DIR, path.basename(src).replace(IMAGE_EXT, '.webp')),
      box:   ITEM_BOX,
    }));
}

function assertUnique(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    if (seen.has(job.out)) throw new Error(`${job.label} y ${seen.get(job.out)} generan el mismo archivo`);
    seen.set(job.out, job.label);
  }
}

// ── Conversión ──

const isUpToDate = job =>
  !FORCE && fs.existsSync(job.out) && fs.statSync(job.out).mtimeMs >= fs.statSync(job.src).mtimeMs;

async function convert({ src, out, box }) {
  await sharp(src)
    .rotate()
    .resize({ ...box, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: box === ITEM_BOX ? ITEM_QUALITY : UI_QUALITY, effort: 6 })
    .toFile(out);
}

async function run() {
  const jobs = [...interfaceJobs(), ...itemJobs()];

  if (!jobs.length) {
    console.log('No se han encontrado imágenes que optimizar.');
    return;
  }

  assertUnique(jobs);
  fs.mkdirSync(ITEMS_DIR, { recursive: true });

  let before = 0;
  let after  = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (isUpToDate(job)) {
      skipped++;
      continue;
    }

    await convert(job);

    const a = fs.statSync(job.src).size;
    const b = fs.statSync(job.out).size;
    before += a;
    after  += b;

    console.log(`${job.label.padEnd(46)} ${(a / 1024).toFixed(0).padStart(5)} KB  ->  ${(b / 1024).toFixed(0).padStart(4)} KB`);
  }

  console.log(`\nTotal: ${(before / 1024).toFixed(0)} KB  ->  ${(after / 1024).toFixed(0)} KB`);
  if (skipped) console.log(`${skipped} imagen(es) sin cambios (usa --forzar para repetirlas).`);
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
