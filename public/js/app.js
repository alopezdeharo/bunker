import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const CATEGORIES = {
  boardgame: { label: 'Juegos de mesa',  emoji: '🎲' },
  videogame: { label: 'Videojuegos',     emoji: '🎮' },
  beverage:  { label: 'Bebidas',         emoji: '🍹' },
  food:      { label: 'Algo para comer', emoji: '🍿' },
};

const INITIAL_ITEMS = 8;

function router() {
  const hash = location.hash.slice(1) || 'home';
  const [screen, param] = hash.split('/');
  ({ home: renderHome, category: () => renderCategory(param) }[screen] ?? renderHome)();
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

function renderHome() {
  getApp().innerHTML = `
    <div class="screen">
      <div class="home-topbar">
        <div class="home-logo">
          <span class="home-logo-icon">🏠</span>
          Bunker
        </div>
        <img class="home-tagline" src="/images/subtitulo.png" alt="Buenas ideas, mejores momentos">
      </div>

      <header class="home-header">
        <h1 class="home-title">¿Qué hacemos hoy?</h1>
        <p class="home-subtitle">Elige una categoría y encuentra la mejor opción para esta noche.</p>
      </header>

      <div class="cat-grid">
        <a class="cat-tile" data-cat="boardgame" href="#category/boardgame">
          <img class="cat-illustration" src="/images/juegosmesa.png" alt="">
          <div class="cat-footer">
            <span class="cat-name">Juegos<br>de mesa</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="videogame" href="#category/videogame">
          <img class="cat-illustration" src="/images/videojuegos.png" alt="">
          <div class="cat-footer">
            <span class="cat-name">Videojuegos</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="beverage" href="#category/beverage">
          <img class="cat-illustration" src="/images/cocteles.png" alt="">
          <div class="cat-footer">
            <span class="cat-name">Bebidas</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="food" href="#category/food">
          <img class="cat-illustration" src="/images/picoteo.png" alt="">
          <div class="cat-footer">
            <span class="cat-name">Algo para<br>comer</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
      </div>

      <a class="surprise-card" href="#surprise">
        <img class="surprise-icon" src="/images/sorpresa.png" alt="">
        <div class="surprise-body">
          <p class="surprise-title">Plan sorpresa</p>
          <p class="surprise-desc">No lo pienses más. Deja que el Bunker elija por ti.</p>
        </div>
        <span class="surprise-arrow">→</span>
      </a>

      <footer class="home-footer">
        ♥ Mejores planes. Mismas personas.
      </footer>

      <div class="home-wave">
        <svg viewBox="0 0 520 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,30 C80,60 160,0 240,30 C320,60 400,0 520,30 L520,60 L0,60 Z" fill="#1A1A1A"/>
        </svg>
      </div>
    </div>
  `;
}

async function renderCategory(cat) {
  const catInfo = CATEGORIES[cat] ?? { label: 'Categoría', emoji: '📦' };

  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" onclick="history.back()">← Volver</button>
      <header class="cat-screen-header">
        <span>${catInfo.emoji}</span>
        <h2>${catInfo.label}</h2>
      </header>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  try {
    const items      = await loadItems([cat]);
    const ratingsMap = await loadRatings(items.map(i => i.id));

    const enriched = items.map(item => ({
      ...item,
      _avg:   ratingsMap[item.id]?.avg   ?? 0,
      _votes: ratingsMap[item.id]?.count ?? 0,
    }));

    renderItemsContent(enriched);
  } catch (err) {
    console.error(err);
    document.getElementById('content').innerHTML =
      `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

function renderItemsContent(items, showAll = false) {
  const content = document.getElementById('content');

  if (!items.length) {
    content.innerHTML = `<p class="msg-empty">Todavía no hay nada aquí.</p>`;
    return;
  }

  const displayed = showAll ? items : weightedSample(items, INITIAL_ITEMS);
  const hasMore   = !showAll && items.length > INITIAL_ITEMS;

  content.innerHTML = `
    <p class="result-count">${items.length} ${items.length === 1 ? 'opción' : 'opciones'}</p>
    <div class="items-list">
      ${displayed.map(buildItemCard).join('')}
    </div>
    ${hasMore ? `<button class="btn-see-all" id="btn-see-all">Ver todas (${items.length})</button>` : ''}
  `;

  if (hasMore) {
    document.getElementById('btn-see-all').addEventListener('click', () => {
      renderItemsContent(items, true);
    });
  }
}

function buildItemCard(item) {
  const emoji  = CATEGORIES[item.category]?.emoji ?? '📦';
  const meta   = buildMeta(item);
  const rating = item._votes > 0
    ? `<span class="item-rating">★ ${item._avg.toFixed(1)} · ${item._votes} ${item._votes === 1 ? 'voto' : 'votos'}</span>`
    : '';

  const thumb = item.image
    ? `<img class="item-thumb" src="${item.image}" alt="${item.name}" loading="lazy"
         onerror="this.outerHTML='<div class=\\'item-thumb item-thumb--fallback\\' data-cat=\\'${item.category}\\'>${emoji}</div>'">`
    : `<div class="item-thumb item-thumb--fallback" data-cat="${item.category}">${emoji}</div>`;

  return `
    <a class="item-card" href="#item/${item.id}">
      ${thumb}
      <div class="item-body">
        <p class="item-name">${item.name}</p>
        ${meta   ? `<p class="item-meta">${meta}</p>` : ''}
        ${rating}
      </div>
    </a>
  `;
}

function buildMeta(item) {
  const d = item.details ?? {};
  const parts = [];

  switch (item.category) {
    case 'boardgame':
    case 'videogame':
      if (d.minPlayers != null && d.maxPlayers != null)
        parts.push(`${d.minPlayers}–${d.maxPlayers} jugadores`);
      if (d.durationMin != null)
        parts.push(d.durationMax && d.durationMax !== d.durationMin
          ? `${d.durationMin}–${d.durationMax} min`
          : `${d.durationMin} min`);
      break;
    case 'beverage':
      if (d.type)        parts.push(d.type);
      if (d.temperature === 'hot')  parts.push('☕ Caliente');
      if (d.temperature === 'cold') parts.push('🧊 Frío');
      if (d.alcoholic === false)    parts.push('Sin alcohol');
      break;
    case 'food':
      if (d.preparationTime) parts.push(`${d.preparationTime} min`);
      if (d.vegetarian)      parts.push('🌱');
      break;
  }

  return parts.join(' · ');
}

async function loadItems(cats) {
  if (!cats.length) return [];
  const snap = await getDocs(query(
    collection(db, 'items'),
    where('category', 'in', cats),
    where('active', '==', true)
  ));
  // Filter secret items client-side to avoid needing a composite index.
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.secret !== true);
}

async function loadRatings(itemIds) {
  if (!itemIds.length) return {};

  const chunks = [];
  for (let i = 0; i < itemIds.length; i += 30)
    chunks.push(itemIds.slice(i, i + 30));

  const all = [];
  for (const chunk of chunks) {
    const snap = await getDocs(query(
      collection(db, 'ratings'),
      where('itemId', 'in', chunk)
    ));
    snap.forEach(doc => all.push(doc.data()));
  }

  const acc = {};
  for (const { itemId, stars } of all) {
    if (!acc[itemId]) acc[itemId] = { sum: 0, count: 0 };
    acc[itemId].sum   += stars;
    acc[itemId].count++;
  }

  const result = {};
  for (const [id, { sum, count }] of Object.entries(acc))
    result[id] = { avg: sum / count, count };

  return result;
}

// Weighted random: higher-rated items appear more often but not always.
// Items with no ratings default to weight equivalent to 3 stars.
function weightedSample(items, n) {
  if (items.length <= n) return [...items];

  const pool = items.map(item => ({
    item,
    w: Math.pow(item._votes > 0 ? item._avg : 3, 1.5),
  }));

  const result = [];
  while (result.length < n && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let rand = Math.random() * total;
    let idx  = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].w;
      if (rand <= 0) { idx = i; break; }
    }
    result.push(pool[idx].item);
    pool.splice(idx, 1);
  }

  return result;
}

function getApp() {
  return document.getElementById('app');
}
