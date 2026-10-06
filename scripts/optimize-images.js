const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'public', 'images');

const BOXES = {
  'subtitulo.png': { width: 320, height: 100 },
};
const DEFAULT_BOX = { width: 320, height: 320 };

async function run() {
  const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.png'));

  if (!files.length) {
    console.log('No se han encontrado PNG en', DIR);
    return;
  }

  let before = 0;
  let after  = 0;

  for (const file of files) {
    const src = path.join(DIR, file);
    const out = path.join(DIR, file.replace(/\.png$/i, '.webp'));
    const box = BOXES[file] ?? DEFAULT_BOX;

    await sharp(src)
      .resize({ ...box, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(out);

    const a = fs.statSync(src).size;
    const b = fs.statSync(out).size;
    before += a;
    after  += b;

    console.log(`${file.padEnd(20)} ${(a / 1024).toFixed(0).padStart(5)} KB  ->  ${(b / 1024).toFixed(0).padStart(4)} KB`);
  }

  console.log(`\nTotal: ${(before / 1024).toFixed(0)} KB  ->  ${(after / 1024).toFixed(0)} KB`);
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
