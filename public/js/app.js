import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, getDoc, limit
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const CATEGORIES = {
  boardgame: { label: 'Juegos de mesa',  emoji: '🎲' },
  videogame: { label: 'Videojuegos',     emoji: '🎮' },
  beverage:  { label: 'Bebidas',         emoji: '🍹' },
  food:      { label: 'Algo para comer', emoji: '🍿' },
};

const INITIAL_ITEMS = 8;

const AVAILABILITY_LABELS = {
  ready:   '⚡ Ahora mismo',
  quick:   '🟡 Unos minutos',
  planned: '🕐 Requiere previsión',
};

const BEVERAGE_TYPES = {
  tea: 'Té', cocktail: 'Cóctel', beer: 'Cerveza', juice: 'Zumo',
  soft: 'Refresco', water: 'Agua', hot: 'Bebida caliente', other: 'Otra',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let navCount = 0;
let firstRoute = true;

function router() {
  if (firstRoute) firstRoute = false; else navCount++;
  window.scrollTo(0, 0);

  const hash = location.hash.slice(1) || 'home';
  const [screen, param] = hash.split('/');
  ({
    home:     renderHome,
    category: () => renderCategory(param),
    item:     () => renderItem(param),
  }[screen] ?? renderHome)();
}

function bindBack(fallbackHash) {
  const btn = document.getElementById('back-btn');
  btn.dataset.fallback = fallbackHash;
  btn.addEventListener('click', () => {
    if (navCount > 0) history.back();
    else location.hash = btn.dataset.fallback;
  });
  return btn;
}

window.addEventListener('hashchange', router);

function renderHome() {
  getApp().innerHTML = `
    <div class="screen">
      <div class="home-topbar">
        <div class="home-logo">
          <span class="home-logo-icon">🏠</span>
          Bunker
        </div>
        <img class="home-tagline" src="/images/subtitulo.webp" alt="Buenas ideas, mejores momentos">
      </div>

      <header class="home-header">
        <h1 class="home-title">¿Qué hacemos hoy?</h1>
        <p class="home-subtitle">Elige una categoría y encuentra la mejor opción para esta noche.</p>
      </header>

      <div class="cat-grid">
        <a class="cat-tile" data-cat="boardgame" href="#category/boardgame">
          <img class="cat-illustration" src="/images/juegosmesa.webp" alt="">
          <div class="cat-footer">
            <span class="cat-name">Juegos<br>de mesa</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="videogame" href="#category/videogame">
          <img class="cat-illustration" src="/images/videojuegos.webp" alt="">
          <div class="cat-footer">
            <span class="cat-name">Videojuegos</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="beverage" href="#category/beverage">
          <img class="cat-illustration" src="/images/cocteles.webp" alt="">
          <div class="cat-footer">
            <span class="cat-name">Bebidas</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
        <a class="cat-tile" data-cat="food" href="#category/food">
          <img class="cat-illustration" src="/images/picoteo.webp" alt="">
          <div class="cat-footer">
            <span class="cat-name">Algo para<br>comer</span>
            <span class="cat-arrow">→</span>
          </div>
        </a>
      </div>

      <a class="surprise-card" href="#surprise">
        <img class="surprise-icon" src="/images/sorpresa.webp" alt="">
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
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>${catInfo.emoji}</span>
        <h2>${catInfo.label}</h2>
      </header>
      <div id="chips"></div>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  bindBack('#home');

  try {
    const items      = await loadItems([cat]);
    const ratingsMap = await loadRatings(items.map(i => i.id));

    const enriched = items.map(item => ({
      ...item,
      _avg:   ratingsMap[item.id]?.avg   ?? 0,
      _votes: ratingsMap[item.id]?.count ?? 0,
    }));

    const ordered = weightedOrder(enriched);
    const state = {
      items:   ordered,
      groups:  buildFilterGroups(cat, ordered),
      active:  new Set(),
      showAll: false,
    };

    renderChips(state);
    renderResults(state);
  } catch (err) {
    console.error(err);
    document.getElementById('content').innerHTML =
      `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Filtros rápidos ──

function rangeOverlaps(item, minKey, maxKey, lo, hi) {
  const d = item.details ?? {};
  const a = d[minKey];
  if (a == null) return false;
  const b = d[maxKey] ?? a;
  return a <= hi && b >= lo;
}

const playersTest  = (lo, hi) => item => rangeOverlaps(item, 'minPlayers',  'maxPlayers',  lo, hi);
const durationTest = (lo, hi) => item => rangeOverlaps(item, 'durationMin', 'durationMax', lo, hi);

function buildFilterGroups(cat, items) {
  const chip = (group, id, label, test) => ({ key: `${group}:${id}`, label, test });
  let groups = [];

  switch (cat) {
    case 'boardgame':
      groups = [
        { id: 'players', chips: [
          chip('players', '2',   '2',   playersTest(2, 2)),
          chip('players', '3-4', '3–4', playersTest(3, 4)),
          chip('players', '5+',  '5+',  playersTest(5, Infinity)),
        ]},
        { id: 'duration', chips: [
          chip('duration', 'short',  '< 30 min',  durationTest(0, 29)),
          chip('duration', 'medium', '30–60 min', durationTest(30, 60)),
        ]},
      ];
      break;

    case 'videogame': {
      const platforms = [...new Set(items.flatMap(i => i.details?.platforms ?? []))].sort();
      groups = [
        { id: 'players', chips: [
          chip('players', '1',   '1',   playersTest(1, 1)),
          chip('players', '2',   '2',   playersTest(2, 2)),
          chip('players', '3-4', '3–4', playersTest(3, 4)),
        ]},
        { id: 'platform', chips: platforms.map(p =>
          chip('platform', p, p, item => (item.details?.platforms ?? []).includes(p))
        )},
      ];
      break;
    }

    case 'beverage':
      groups = [
        { id: 'temp', chips: [
          chip('temp', 'hot',  '☕ Caliente', i => ['hot',  'either'].includes(i.details?.temperature)),
          chip('temp', 'cold', '🧊 Frío',     i => ['cold', 'either'].includes(i.details?.temperature)),
        ]},
        { id: 'alcohol', chips: [
          chip('alcohol', 'yes', '🍺 Con alcohol', i => i.details?.alcoholic === true),
          chip('alcohol', 'no',  '🥤 Sin',         i => i.details?.alcoholic === false),
        ]},
      ];
      break;

    case 'food':
      groups = [
        { id: 'availability', chips: [
          chip('availability', 'ready', '⚡ Ahora mismo',    i => i.availability === 'ready'),
          chip('availability', 'quick', '🟡 Unos minutos', i => i.availability === 'quick'),
        ]},
        { id: 'kind', chips: [
          chip('kind', 'prepare', '👨‍🍳 Para preparar', i => i.kind === 'prepare'),
        ]},
      ];
      break;
  }

  return groups
    .map(g => ({ ...g, chips: g.chips.filter(c => items.some(c.test)) }))
    .filter(g => g.chips.length);
}

function applyFilters({ items, groups, active }) {
  if (!active.size) return items;
  return items.filter(item => groups.every(g => {
    const on = g.chips.filter(c => active.has(c.key));
    return !on.length || on.some(c => c.test(item));
  }));
}

function renderChips(state) {
  const el = document.getElementById('chips');
  if (!state.groups.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="chips" role="group" aria-label="Filtros rápidos">
      ${state.groups.map(g => g.chips.map(c => `
        <button type="button" class="chip" data-key="${esc(c.key)}" aria-pressed="false">${esc(c.label)}</button>
      `).join('')).join('<span class="chip-sep" aria-hidden="true"></span>')}
    </div>
  `;

  el.querySelector('.chips').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;

    const key = btn.dataset.key;
    if (state.active.has(key)) state.active.delete(key);
    else                       state.active.add(key);

    btn.setAttribute('aria-pressed', String(state.active.has(key)));
    state.showAll = false;
    renderResults(state);
  });
}

function renderResults(state) {
  const content  = document.getElementById('content');
  const filtered = applyFilters(state);

  if (!state.items.length) {
    content.innerHTML = `<p class="msg-empty">Todavía no hay nada aquí.</p>`;
    return;
  }

  if (!filtered.length) {
    content.innerHTML = `
      <p class="msg-empty">Nada encaja con esa combinación.</p>
      <button class="btn-see-all" id="btn-clear">Quitar filtros</button>
    `;
    document.getElementById('btn-clear').addEventListener('click', () => {
      state.active.clear();
      document.querySelectorAll('#chips .chip')
        .forEach(b => b.setAttribute('aria-pressed', 'false'));
      renderResults(state);
    });
    return;
  }

  const displayed = state.showAll ? filtered : filtered.slice(0, INITIAL_ITEMS);
  const hasMore   = filtered.length > displayed.length;

  content.innerHTML = `
    <p class="result-count">${filtered.length} ${filtered.length === 1 ? 'opción' : 'opciones'}</p>
    <div class="items-list">
      ${displayed.map(buildItemCard).join('')}
    </div>
    ${hasMore ? `<button class="btn-see-all" id="btn-see-all">Ver todas (${filtered.length})</button>` : ''}
  `;

  if (hasMore) {
    document.getElementById('btn-see-all').addEventListener('click', () => {
      state.showAll = true;
      renderResults(state);
    });
  }
}

// ── Ficha de detalle ──

const DIFFICULTY_LABELS = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };
const MODE_LABELS = {
  competitive: 'Competitivo', cooperative: 'Cooperativo', party: 'Party', casual: 'Casual',
};

const fmtAvg = n => n.toFixed(1).replace('.', ',');

function playersLabel(d) {
  if (d.minPlayers == null) return '';
  const max = d.maxPlayers ?? d.minPlayers;
  if (max === d.minPlayers) return `${max} ${max === 1 ? 'jugador' : 'jugadores'}`;
  return `${d.minPlayers}–${max} jugadores`;
}

function durationLabel(d) {
  if (d.durationMin == null) return '';
  return d.durationMax && d.durationMax !== d.durationMin
    ? `${d.durationMin}–${d.durationMax} min`
    : `${d.durationMin} min`;
}

async function renderItem(id) {
  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  const backBtn = bindBack('#home');
  const content = document.getElementById('content');

  const notFound = `
    <p class="msg-empty">No hemos encontrado esto.</p>
    <a class="btn-see-all" href="#home">Volver al inicio</a>
  `;

  if (!id) { content.innerHTML = notFound; return; }

  try {
    const [snap, ratings, comments] = await Promise.all([
      getDoc(doc(db, 'items', id)),
      loadRatings([id]).catch(() => ({})),
      loadComments(id),
    ]);

    if (!snap.exists()) { content.innerHTML = notFound; return; }

    const item = { id: snap.id, ...snap.data() };
    backBtn.dataset.fallback = `#category/${item.category}`;
    content.innerHTML = buildDetail(item, ratings[id], comments);
  } catch (err) {
    console.error(err);
    content.innerHTML = err.code === 'permission-denied'
      ? notFound
      : `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

async function loadComments(itemId) {
  try {
    const snap = await getDocs(query(
      collection(db, 'comments'),
      where('itemId', '==', itemId),
      where('hidden', '==', false)
    ));
    return snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 3);
  } catch (err) {
    console.warn('Notas no disponibles:', err.code ?? err.message);
    return [];
  }
}

function buildFacts(item) {
  const d = item.details ?? {};
  const facts = [];

  switch (item.category) {
    case 'boardgame':
      facts.push(playersLabel(d), durationLabel(d), DIFFICULTY_LABELS[d.difficulty]);
      break;
    case 'videogame':
      facts.push(
        playersLabel(d), durationLabel(d),
        (d.platforms ?? []).join(' / '),
        ...(d.mode ?? []).map(m => MODE_LABELS[m] ?? m)
      );
      break;
    case 'beverage':
      facts.push(
        AVAILABILITY_LABELS[item.availability],
        BEVERAGE_TYPES[d.type] ?? d.type,
        { hot: '☕ Caliente', cold: '🧊 Frío', either: '☕ / 🧊 Frío o caliente' }[d.temperature],
        d.alcoholic === true ? '🍺 Con alcohol' : d.alcoholic === false ? '🥤 Sin alcohol' : null,
        d.preparationTime > 0 ? `${d.preparationTime} min` : null
      );
      break;
    case 'food':
      facts.push(
        AVAILABILITY_LABELS[item.availability],
        d.preparationTime > 0 ? `${d.preparationTime} min` : null,
        d.servings ? `Para ${d.servings}` : null,
        d.vegetarian ? '🌱 Vegetariano' : null
      );
      break;
  }

  if (item.kind === 'prepare') facts.push('👨‍🍳 Para preparar');
  return facts.filter(Boolean);
}

function buildDetail(item, rating, comments) {
  const emoji = CATEGORIES[item.category]?.emoji ?? '📦';
  const cat   = esc(item.category);
  const facts = buildFacts(item);
  const votes = rating?.count ?? 0;

  const hero = item.image
    ? `<img class="detail-hero" src="${esc(item.image)}" alt="${esc(item.name)}"
         onerror="this.outerHTML='<div class=\\'detail-hero detail-hero--fallback\\' data-cat=\\'${cat}\\'>${emoji}</div>'">`
    : `<div class="detail-hero detail-hero--fallback" data-cat="${cat}">${emoji}</div>`;

  const notes = comments.length ? `
    <section class="detail-notes">
      <h3>Lo que opinó la gente</h3>
      ${comments.map(c => `
        <blockquote class="note">
          <p>“${esc(c.text)}”</p>
          <footer>— ${esc(c.name || 'Alguien de la reunión')}</footer>
        </blockquote>
      `).join('')}
    </section>
  ` : '';

  return `
    <article class="detail">
      ${hero}
      <h2 class="detail-name">${esc(item.name)}</h2>
      ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ''}
      ${facts.length ? `<div class="detail-facts">${facts.map(f => `<span class="fact">${esc(f)}</span>`).join('')}</div>` : ''}
      ${votes ? `<p class="detail-rating">★ ${fmtAvg(rating.avg)} · ${votes} ${votes === 1 ? 'voto' : 'votos'}</p>` : ''}
      ${item.tags?.length ? `<p class="detail-tags">${item.tags.map(esc).join(' · ')}</p>` : ''}
      ${notes}
    </article>
  `;
}

function buildItemCard(item) {
  const emoji  = CATEGORIES[item.category]?.emoji ?? '📦';
  const meta   = buildMeta(item);
  const rating = item._votes > 0
    ? `<span class="item-rating">★ ${fmtAvg(item._avg)} · ${item._votes} ${item._votes === 1 ? 'voto' : 'votos'}</span>`
    : '';

  const thumb = item.image
    ? `<img class="item-thumb" src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy"
         onerror="this.outerHTML='<div class=\\'item-thumb item-thumb--fallback\\' data-cat=\\'${item.category}\\'>${emoji}</div>'">`
    : `<div class="item-thumb item-thumb--fallback" data-cat="${item.category}">${emoji}</div>`;

  return `
    <a class="item-card" href="#item/${esc(item.id)}">
      ${thumb}
      <div class="item-body">
        <p class="item-name">${esc(item.name)}</p>
        ${meta   ? `<p class="item-meta">${esc(meta)}</p>` : ''}
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
      parts.push(...[playersLabel(d), durationLabel(d)].filter(Boolean));
      break;
    case 'beverage':
      if (d.type)        parts.push(BEVERAGE_TYPES[d.type] ?? d.type);
      if (d.temperature === 'hot')  parts.push('☕ Caliente');
      if (d.temperature === 'cold') parts.push('🧊 Frío');
      if (d.alcoholic === false)    parts.push('Sin alcohol');
      break;
    case 'food':
      if (d.preparationTime) parts.push(`${d.preparationTime} min`);
      if (d.vegetarian)      parts.push('🌱');
      break;
  }

  if ((item.category === 'beverage' || item.category === 'food') && AVAILABILITY_LABELS[item.availability])
    parts.unshift(AVAILABILITY_LABELS[item.availability]);

  return parts.join(' · ');
}

async function loadItems(cats) {
  if (!cats.length) return [];
  const snap = await getDocs(query(
    collection(db, 'items'),
    where('category', 'in', cats),
    where('active', '==', true)
  ));
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.secret !== true);
}

async function loadRatings(itemIds) {
  if (!itemIds.length) return {};

  const chunks = [];
  for (let i = 0; i < itemIds.length; i += 30)
    chunks.push(itemIds.slice(i, i + 30));

  const snaps = await Promise.all(chunks.map(chunk => getDocs(query(
    collection(db, 'ratings'),
    where('itemId', 'in', chunk)
  ))));
  const all = snaps.flatMap(snap => snap.docs.map(d => d.data()));

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

function weightedOrder(items) {
  const pool = items.map(item => ({
    item,
    w: Math.pow(item._votes > 0 ? item._avg : 3, 1.5),
  }));

  const result = [];
  while (pool.length > 0) {
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

function warmUpFirestore() {
  getDocs(query(collection(db, 'items'), where('active', '==', true), limit(1)))
    .catch(() => {});
}

warmUpFirestore();

router();
