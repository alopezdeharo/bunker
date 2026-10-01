const { initializeApp, cert }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const [,, keyPath, flag] = process.argv;

if (!keyPath) {
  console.error('Uso: node seed-items.js <clave.json> [--borrar]');
  process.exit(1);
}

initializeApp({ credential: cert(require(require('path').resolve(keyPath))) });
const db = getFirestore();

// Datos de prueba

const ITEMS = [
  // juegos de mesa
  { id: 'seed_codenames', name: 'Codenames', category: 'boardgame',
    description: 'Dos equipos, un tablero de palabras y pistas de una sola palabra. Rápido y muy de grupo.',
    tags: ['equipos', 'palabras'], availability: 'ready', kind: 'play',
    details: { minPlayers: 4, maxPlayers: 8, durationMin: 15, durationMax: 30, setupTime: 2,
               difficulty: 'easy', type: ['party', 'palabras'] } },
  { id: 'seed_7wonders-duel', name: '7 Wonders Duel', category: 'boardgame',
    description: 'Duelo de civilizaciones para dos: construye maravillas y gana por ciencia, guerra o puntos.',
    tags: ['dos jugadores', 'cartas'], availability: 'ready', kind: 'play',
    details: { minPlayers: 2, maxPlayers: 2, durationMin: 30, durationMax: 45, setupTime: 5,
               difficulty: 'medium', type: ['estrategia', 'cartas'] } },
  { id: 'seed_pandemic', name: 'Pandemic', category: 'boardgame',
    description: 'Cooperativo: entre todos frenáis cuatro enfermedades antes de que el mundo caiga.',
    tags: ['cooperativo'], availability: 'ready', kind: 'play',
    details: { minPlayers: 2, maxPlayers: 4, durationMin: 45, durationMax: 60, setupTime: 10,
               difficulty: 'medium', type: ['cooperativo', 'estrategia'] } },
  { id: 'seed_dixit', name: 'Dixit', category: 'boardgame',
    description: 'Cartas ilustradas e historias ambiguas. Adivina cuál es la del narrador.',
    tags: ['imaginación'], availability: 'ready', kind: 'play',
    details: { minPlayers: 3, maxPlayers: 6, durationMin: 30, durationMax: 30, setupTime: 3,
               difficulty: 'easy', type: ['party', 'creatividad'] } },

  // videojuegos
  { id: 'seed_mario-kart', name: 'Mario Kart 8 Deluxe', category: 'videogame',
    description: 'Carreras caóticas para todos los niveles. Caparazones incluidos.',
    tags: ['carreras', 'party'], availability: 'ready', kind: 'play',
    details: { minPlayers: 1, maxPlayers: 4, platforms: ['Switch'], durationMin: 15, durationMax: 60,
               mode: ['competitive', 'party', 'casual'] } },
  { id: 'seed_overcooked2', name: 'Overcooked 2', category: 'videogame',
    description: 'Cocinar en equipo entre gritos y cocinas que se mueven. Cooperativo puro.',
    tags: ['cooperativo'], availability: 'ready', kind: 'play',
    details: { minPlayers: 1, maxPlayers: 4, platforms: ['Switch', 'PS5', 'PC'], durationMin: 30, durationMax: 60,
               mode: ['cooperative', 'party'] } },
  { id: 'seed_ea-fc', name: 'EA Sports FC', category: 'videogame',
    description: 'Fútbol para picarse de verdad. Mejor con mando y rencor.',
    tags: ['fútbol', 'versus'], availability: 'ready', kind: 'play',
    details: { minPlayers: 1, maxPlayers: 2, platforms: ['PS5', 'Xbox', 'PC'], durationMin: 20, durationMax: 90,
               mode: ['competitive'] } },

  // bebidas
  { id: 'seed_te-jazmin', name: 'Té de jazmín', category: 'beverage',
    description: 'Suave y floral. Muy bueno después de cenar.',
    tags: ['té', 'infusión'], availability: 'quick', kind: 'prepare',
    details: { type: 'tea', alcoholic: false, temperature: 'hot', preparationTime: 5,
               flavor: ['floral', 'suave'], caffeineLevel: 'low', steepingTime: 3,
               openedAt: null, bestBefore: null } },
  { id: 'seed_mojito', name: 'Mojito', category: 'beverage',
    description: 'Hierbabuena, lima y ron. Se prepara entre todos.',
    tags: ['cóctel'], availability: 'quick', kind: 'prepare',
    details: { type: 'cocktail', alcoholic: true, temperature: 'cold', preparationTime: 8,
               flavor: ['fresco', 'cítrico'], caffeineLevel: null, steepingTime: null,
               openedAt: null, bestBefore: null } },
  { id: 'seed_cerveza', name: 'Cerveza fría', category: 'beverage',
    description: 'Sin complicaciones.',
    tags: ['cerveza'], availability: 'ready', kind: 'consume',
    details: { type: 'beer', alcoholic: true, temperature: 'cold', preparationTime: 0,
               flavor: ['amargo'], caffeineLevel: null, steepingTime: null,
               openedAt: null, bestBefore: null } },
  { id: 'seed_chocolate', name: 'Chocolate a la taza', category: 'beverage',
    description: 'Espeso, de los de cuchara. Para noches largas.',
    tags: ['chocolate'], availability: 'quick', kind: 'prepare',
    details: { type: 'hot', alcoholic: false, temperature: 'hot', preparationTime: 10,
               flavor: ['dulce'], caffeineLevel: null, steepingTime: null,
               openedAt: null, bestBefore: null } },
  { id: 'seed_agua-gas', name: 'Agua con gas', category: 'beverage',
    description: 'Con hielo y una rodaja de limón si hay.',
    tags: ['agua'], availability: 'ready', kind: 'consume',
    details: { type: 'water', alcoholic: false, temperature: 'either', preparationTime: 0,
               flavor: ['neutro'], caffeineLevel: null, steepingTime: null,
               openedAt: null, bestBefore: null } },

  // comida
  { id: 'seed_nachos', name: 'Nachos con salsa', category: 'food',
    description: 'Bolsa, bol y salsa. Cero esfuerzo.',
    tags: ['picar'], availability: 'ready', kind: 'consume',
    details: { type: ['snack'], preparationTime: 2, servings: 4, vegetarian: true, bestBefore: null } },
  { id: 'seed_palomitas', name: 'Palomitas', category: 'food',
    description: 'De microondas, en cuenco grande para compartir.',
    tags: ['picar', 'peli'], availability: 'quick', kind: 'prepare',
    details: { type: ['snack'], preparationTime: 5, servings: 4, vegetarian: true, bestBefore: null } },
  { id: 'seed_picoteo', name: 'Tabla de queso y embutido', category: 'food',
    description: 'Lo que haya en la nevera, bien puesto.',
    tags: ['picar'], availability: 'ready', kind: 'consume',
    details: { type: ['snack'], preparationTime: 10, servings: 4, vegetarian: false, bestBefore: null } },
  { id: 'seed_mugcake', name: 'Mugcake de chocolate', category: 'food',
    description: 'Bizcocho en taza, dos minutos de microondas. Hacerlo juntos es parte del plan.',
    tags: ['dulce'], availability: 'quick', kind: 'prepare',
    details: { type: ['sweet'], preparationTime: 5, servings: 1, vegetarian: true, bestBefore: null } },
  { id: 'seed_helado', name: 'Helado con toppings', category: 'food',
    description: 'Bol de helado y toppings para montar cada uno el suyo.',
    tags: ['dulce'], availability: 'ready', kind: 'prepare',
    details: { type: ['sweet'], preparationTime: 5, servings: 4, vegetarian: true, bestBefore: null } },
  { id: 'seed_tortitas', name: 'Tortitas', category: 'food',
    description: 'Masa rápida y sartén. Con sirope, fruta o lo que apetezca.',
    tags: ['dulce'], availability: 'quick', kind: 'prepare',
    details: { type: ['sweet'], preparationTime: 20, servings: 4, vegetarian: true, bestBefore: null } },
  { id: 'seed_brownie', name: 'Brownie', category: 'food',
    description: 'Hay que haberlo hecho antes. Merece la pena.',
    tags: ['dulce', 'previsión'], availability: 'planned', kind: 'prepare',
    details: { type: ['sweet'], preparationTime: 45, servings: 6, vegetarian: true, bestBefore: null } },
  { id: 'seed_tortilla', name: 'Tortilla de patatas', category: 'food',
    description: 'Con cebolla, claro. Contundente y para compartir.',
    tags: ['contundente'], availability: 'planned', kind: 'prepare',
    details: { type: ['hearty'], preparationTime: 40, servings: 4, vegetarian: true, bestBefore: null } },
  { id: 'seed_pizza', name: 'Pizza al horno', category: 'food',
    description: 'Base, tomate y lo que haya. Cada uno pone lo suyo.',
    tags: ['contundente'], availability: 'quick', kind: 'prepare',
    details: { type: ['hearty'], preparationTime: 25, servings: 4, vegetarian: false, bestBefore: null } },
];

async function run() {
  const batch = db.batch();

  for (const { id, ...data } of ITEMS) {
    const ref = db.collection('items').doc(id);
    if (flag === '--borrar') {
      batch.delete(ref);
    } else {
      batch.set(ref, {
        image: '',
        active: true,
        secret: false,
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
  console.log(`${flag === '--borrar' ? 'Borrados' : 'Escritos'} ${ITEMS.length} items de prueba.`);
}

run().then(() => process.exit(0)).catch(err => { console.error('Error:', err.message); process.exit(1); });
