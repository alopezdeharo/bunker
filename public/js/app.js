import { db, ensureUser, currentUserId } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, getDoc, limit, setDoc, updateDoc, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js';

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
  tea: 'Té', infusion: 'Infusión', coffee: 'Café', cocoa: 'Cacao y chocolate', shake: 'Batido',
  water: 'Agua', soft: 'Refresco', mocktail: 'Mocktail', cocktail: 'Cóctel',
};

const CAFFEINE_LABELS = {
  none: '🌙 Sin cafeína', some: 'Algo de cafeína', high: 'Con cafeína',
};

const BEVERAGE_BLOCKS = [
  { key: 'tea',      label: 'Tés',                   emoji: '🍵', hint: 'Con cafeína', types: ['tea'] },
  { key: 'infusion', label: 'Infusiones',            emoji: '🌿', hint: 'Sin cafeína', types: ['infusion'] },
  { key: 'coffee',   label: 'Café, cacao y batidos', emoji: '☕', hint: '',            types: ['coffee', 'cocoa', 'shake'] },
  { key: 'water',    label: 'Agua y refrescos',      emoji: '🥤', hint: '',            types: ['water', 'soft'] },
  { key: 'mocktail', label: 'Mocktails',             emoji: '🍹', hint: 'Sin alcohol', types: ['mocktail'] },
  { key: 'cocktail', label: 'Cócteles',              emoji: '🍸', hint: 'Con alcohol', types: ['cocktail'] },
];

const BEVERAGE_OTHER = { key: 'other', label: 'Más ideas', emoji: '🍹', hint: '', types: null };

const BEVERAGE_LIST_MAX = 12;

const SPEND_DAYS = 180;
const SPEND_MAX  = 3;
const FINISH_DAYS = 60;
const DAY_MS = 86400000;

const TOURNAMENT_RULE =
  '🏆 Torneo: si sois más de dos, el que pierde sale, el ganador se queda y entra el siguiente.';

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
  const [screen, param, sub] = hash.split('/');
  ({
    home:     renderHome,
    category: () => renderCategory(param, sub),
    item:     () => renderItem(param, sub),
    surprise: renderSurprise,
    secret:   renderSecret,
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
  lastPlan = null;
  orderMemory.clear();
  filterMemory.clear();
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
        <a class="secret-link" href="#secret" aria-label="Fuera de carta">✦</a>
      </footer>

      <div class="home-wave">
        <svg viewBox="0 0 520 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,30 C80,60 160,0 240,30 C320,60 400,0 520,30 L520,60 L0,60 Z" fill="#1A1A1A"/>
        </svg>
      </div>
    </div>
  `;
}

async function renderCategory(cat, section) {
  if (CATALOG_SCREENS[cat])      return renderCatalogList(cat);
  if (cat === 'food' && section) return renderFoodSection(section);
  if (cat === 'beverage')        return section ? renderBeverageBlock(section) : renderBeverageHome();

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
    const items = await withRatings(await loadItems([cat]));
    showList(cat, cat, items);
  } catch (err) {
    console.error(err);
    document.getElementById('content').innerHTML =
      `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

async function withRatings(items) {
  const ratings = await loadRatings(items.map(i => i.id));
  return items.map(item => ({
    ...item,
    _avg:   ratings[item.id]?.avg   ?? 0,
    _votes: ratings[item.id]?.count ?? 0,
  }));
}

function showList(cat, memoryKey, items, extra = {}) {
  const ordered = orderByMemory(memoryKey, items);
  const active  = filterMemory.get(memoryKey) ?? new Set();
  filterMemory.set(memoryKey, active);

  const state = {
    cat,
    items:   ordered,
    groups:  buildFilterGroups(cat, ordered),
    active,
    showAll: false,
    ...extra,
  };

  renderChips(state);
  renderResults(state);
}

// ── Bebidas ──

function blockItems(items, block) {
  if (block.types) return items.filter(i => block.types.includes(i.details?.type));
  const known = new Set(BEVERAGE_BLOCKS.flatMap(b => b.types));
  return items.filter(i => !known.has(i.details?.type));
}

function blockKeyFor(item) {
  const block = BEVERAGE_BLOCKS.find(b => b.types.includes(item.details?.type));
  return block ? block.key : BEVERAGE_OTHER.key;
}

function bestBeforeDate(item) {
  const raw = item.details?.bestBefore;
  if (!raw) return null;
  const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysToBestBefore(item) {
  const date = bestBeforeDate(item);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((date - today) / DAY_MS);
}

function needsFinishing(item) {
  const days = daysToBestBefore(item);
  return days != null && days <= FINISH_DAYS;
}

function expiryNote(item) {
  const days = daysToBestBefore(item);
  if (days == null) return '';
  if (days < 0)            return 'Pasó su fecha de consumo preferente; lo huelo antes de prepararlo.';
  if (days <= FINISH_DAYS) return 'Caduca pronto.';
  return '';
}

function spendUrgency(item) {
  const days = daysToBestBefore(item);
  if (days == null) return 0;
  if (days < 0)     return 1;
  return Math.max(0, 1 - days / 365);
}

const spendFactor = item => 1 + 3 * spendUrgency(item);

function seasonFactor(item) {
  const month = new Date().getMonth();
  const temp  = item.details?.temperature;
  if (temp === 'cold' && month >= 5 && month <= 8)         return 3;
  if (temp === 'hot'  && (month >= 11 || month <= 2))      return 3;
  return 1;
}

function pickSpendItems(items) {
  const eligible = items.filter(i => {
    const days = daysToBestBefore(i);
    return days != null && days <= SPEND_DAYS;
  });
  if (!eligible.length) return [];

  const known = orderMemory.get('beverage/spend');
  if (known) {
    const byId = new Map(eligible.map(i => [i.id, i]));
    const kept = known.map(id => byId.get(id)).filter(Boolean);
    if (kept.length) return kept;
  }

  const picked = weightedOrder(eligible, spendFactor).slice(0, SPEND_MAX);
  orderMemory.set('beverage/spend', picked.map(i => i.id));
  return picked;
}

function buildBlockCard(block) {
  const n = block.items.length;
  return `
    <a class="item-card" href="#category/beverage/${esc(block.key)}">
      <div class="item-thumb item-thumb--fallback" data-cat="beverage">${block.emoji}</div>
      <div class="item-body">
        <p class="item-name">${esc(block.label)}</p>
        <p class="item-meta">${n} ${n === 1 ? 'opción' : 'opciones'}${block.hint ? ` · ${esc(block.hint)}` : ''}</p>
      </div>
    </a>
  `;
}

async function renderBeverageHome() {
  const info = CATEGORIES.beverage;

  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>${info.emoji}</span>
        <h2>${info.label}</h2>
      </header>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack('#home');

  const content = document.getElementById('content');

  try {
    const items  = await withRatings(await loadItems(['beverage']));
    const blocks = [...BEVERAGE_BLOCKS, BEVERAGE_OTHER]
      .map(b => ({ ...b, items: blockItems(items, b) }))
      .filter(b => b.items.length);

    if (!blocks.length) {
      content.innerHTML = `<p class="msg-empty">Todavía no hay nada aquí.</p>`;
      return;
    }

    const spend = pickSpendItems(items);

    content.innerHTML = `
      <section class="item-group">
        <h3 class="item-group-title">¿Qué te apetece?</h3>
        <div class="items-list">${blocks.map(buildBlockCard).join('')}</div>
      </section>
      ${spend.length ? `
        <section class="item-group">
          <h3 class="item-group-title">Ayúdame a gastar</h3>
          <p class="result-count">Se les acaba el tiempo. Si te apetece alguna, me haces un favor.</p>
          <div class="items-list">${spend.map(buildItemCard).join('')}</div>
        </section>` : ''}
    `;
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

async function renderBeverageBlock(key) {
  const block = [...BEVERAGE_BLOCKS, BEVERAGE_OTHER].find(b => b.key === key);

  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>${block ? block.emoji : CATEGORIES.beverage.emoji}</span>
        <h2>${esc(block ? block.label : 'Bebidas')}</h2>
      </header>
      <div id="chips"></div>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack('#category/beverage');

  const content = document.getElementById('content');

  if (!block) {
    content.innerHTML = `
      <p class="msg-empty">No hemos encontrado esto.</p>
      <a class="btn-see-all" href="#category/beverage">Volver a las bebidas</a>
    `;
    return;
  }

  try {
    const items = blockItems(await withRatings(await loadItems(['beverage'])), block);
    showList('beverage', `beverage/${key}`, items, { initial: BEVERAGE_LIST_MAX });
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Juegos de mesa y videojuegos ──

function topBar(title, extra = '') {
  return `
    <header class="top-bar">
      <button class="back-icon" id="back-btn" aria-label="Volver">←</button>
      <h2 id="top-title">${esc(title)}</h2>
      ${extra}
    </header>
  `;
}

function catalogThumb(item, cls) {
  const emoji = CATEGORIES[item.category]?.emoji ?? '📦';
  const cat   = esc(item.category);
  if (!item.image) return `<div class="${cls} ${cls}--fallback" data-cat="${cat}">${emoji}</div>`;

  return `<img class="${cls}" data-cat="${cat}" src="${esc(item.image)}" alt="" loading="lazy"
    onerror="this.outerHTML='<div class=\\'${cls} ${cls}--fallback\\' data-cat=\\'${cat}\\'>${emoji}</div>'">`;
}

function catalogMeta(item) {
  const d = item.details ?? {};
  const parts = item.category === 'videogame'
    ? [(d.platforms ?? []).join(' / '), playersLabel(d)]
    : [playersLabel(d, true), durationLabel(d)];
  return parts.filter(Boolean).join(' · ');
}

function buildCatalogCard(item, groupMin) {
  const meta  = catalogMeta(item);
  const votes = item._votes ?? 0;

  return `
    <a class="bg-card" href="#item/${esc(item.id)}">
      ${catalogThumb(item, 'bg-thumb')}
      <div class="bg-card-body">
        <p class="bg-card-name">${esc(item.name)}</p>
        ${meta ? `<p class="bg-card-meta">${esc(meta)}</p>` : ''}
        ${tournamentApplies(item, groupMin) ? `<p class="bg-card-tag">🏆 Torneo</p>` : ''}
        ${votes ? `<p class="bg-card-rating">★ ${fmtAvg(item._avg)} · ${votes} ${votes === 1 ? 'voto' : 'votos'}</p>` : ''}
      </div>
      <span class="bg-card-chevron" aria-hidden="true">›</span>
    </a>
  `;
}

function buildCatalogTile(item, groupMin) {
  const d        = item.details ?? {};
  const isVideo  = item.category === 'videogame';
  const platform = (d.platforms ?? []).join(' / ');
  const count    = isVideo ? playersShort(d) : '';
  const players  = isVideo
    ? (count ? `${count} jug.` : '')
    : playersLabel(d, true).replace(/jugadores?/, 'jug.');
  const meta     = [players, tournamentApplies(item, groupMin) ? '🏆 Torneo' : ''].filter(Boolean).join(' · ');

  return `
    <a class="bg-tile" href="#item/${esc(item.id)}">
      <div class="bg-tile-media">
        ${catalogThumb(item, 'bg-tile-img')}
        ${isVideo && platform ? `<span class="bg-tile-badge">${esc(platform)}</span>` : ''}
      </div>
      <p class="bg-tile-name">${esc(item.name)}</p>
      <p class="bg-tile-meta">${esc(meta)}</p>
    </a>
  `;
}

async function renderCatalogList(cat) {
  getApp().innerHTML = `
    <div class="screen">
      ${topBar(CATALOG_SCREENS[cat].title, '<button type="button" class="view-toggle" id="view-toggle"></button>')}
      <div id="chips"></div>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack('#home');

  try {
    showCatalog(cat, orderByMemory(cat, await withRatings(await loadItems([cat]))));
  } catch (err) {
    console.error(err);
    document.getElementById('content').innerHTML =
      `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Filtros de juegos de mesa y videojuegos ──

const PLAYERS_TITLE = 'Número de jugadores';

const VIDEO_PLATFORM_ORDER = ['SNES', 'PS1', 'PS2', 'Wii', 'Switch'];

const VIDEO_TYPES = [
  ['cooperative', 'Cooperativo'], ['competitive', 'Competitivo'], ['party', 'Party'], ['chill', 'Tranquilo'],
];

const BOARDGAME_FILTERS = [
  { id: 'players', label: 'Jugadores', title: PLAYERS_TITLE, options: [
    ['2', '2 jugadores'], ['3', '3 jugadores'], ['4', '4 jugadores'], ['5', '5 jugadores'], ['6', '6 o más'],
  ], test: value => {
    const n = Number(value);
    return playersTest(n, n >= 6 ? Infinity : n);
  }},
  { id: 'duration', label: 'Duración', title: 'Duración', options: [
    ['short', '< 30 min'], ['medium', '30–60 min'], ['long', '60+ min'],
  ], test: value => ({
    short:  durationTest(0, 29),
    medium: durationTest(30, 60),
    long:   durationTest(60, Infinity),
  })[value]},
  { id: 'difficulty', label: 'Dificultad', title: 'Dificultad', options: [
    ['easy', 'Fácil'], ['medium', 'Media'], ['hard', 'Difícil'],
  ], test: value => item => item.details?.difficulty === value },
];

function videogameFilters(items) {
  const hasPlatform = p => items.some(i => (i.details?.platforms ?? []).includes(p));
  const hasMode     = m => items.some(i => (i.details?.mode ?? []).includes(m));

  return [
    { id: 'players', label: 'Jugadores', title: PLAYERS_TITLE,
      options: [['3-4', '3–4 jugadores'], ['5', '5 o más']],
      test: value => value === '5' ? playersTest(5, Infinity) : playersTest(3, 4) },
    { id: 'platform', label: 'Consola', title: 'Consola',
      options: VIDEO_PLATFORM_ORDER.filter(hasPlatform).map(p => [p, p]),
      test: value => item => (item.details?.platforms ?? []).includes(value) },
    { id: 'type', label: 'Tipo', title: 'Tipo de juego',
      options: VIDEO_TYPES.filter(([mode]) => hasMode(mode)),
      test: value => item => (item.details?.mode ?? []).includes(value) },
  ].filter(f => f.options.length);
}

const CATALOG_SCREENS = {
  boardgame: {
    title: 'Juegos de mesa', playersKey: 'bunker.boardgame.players',
    viewKey: 'bunker.boardgame.view', defaultView: 'list', cols: 3,
    filters: () => BOARDGAME_FILTERS, inline: ['players', 'duration'], sheet: true,
  },
  videogame: {
    title: 'Videojuegos', playersKey: 'bunker.videogame.players',
    viewKey: 'bunker.videogame.view', defaultView: 'grid', cols: 2,
    filters: videogameFilters, inline: ['players', 'platform', 'type'], sheet: false,
    groupMin: value => ({ '3-4': 3, '5': 5 })[value],
  },
};

const catalogValues = {};

function savedPlayers(cfg, defs) {
  try {
    const value = localStorage.getItem(cfg.playersKey);
    return defs.find(f => f.id === 'players')?.options.some(([v]) => v === value) ? value : null;
  } catch {
    return null;
  }
}

function savePlayers(cfg, value) {
  try {
    if (value) localStorage.setItem(cfg.playersKey, value);
    else       localStorage.removeItem(cfg.playersKey);
  } catch {}
}

const VIEW_ICONS = {
  grid: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 5h18v3H3V5zm0 5.5h18v3H3v-3zM3 16h18v3H3v-3z"/></svg>',
};

function savedView(cfg) {
  try {
    const value = localStorage.getItem(cfg.viewKey);
    return value === 'grid' || value === 'list' ? value : cfg.defaultView;
  } catch {
    return cfg.defaultView;
  }
}

function saveView(cfg, value) {
  try {
    localStorage.setItem(cfg.viewKey, value);
  } catch {}
}

function renderViewToggle(state) {
  const btn = document.getElementById('view-toggle');
  if (!btn) return;

  const next = state.view === 'grid' ? 'list' : 'grid';
  btn.innerHTML = VIEW_ICONS[next];
  btn.setAttribute('aria-label', next === 'grid' ? 'Ver en cuadrícula' : 'Ver en lista');
  btn.onclick = () => {
    state.view = next;
    saveView(state.cfg, next);
    renderViewToggle(state);
    renderResults(state);
  };
}

function catalogFilterValues(cat, cfg, defs) {
  catalogValues[cat] ??= {
    ...Object.fromEntries(defs.map(f => [f.id, null])),
    players: savedPlayers(cfg, defs),
  };
  return catalogValues[cat];
}

function catalogGroups(defs) {
  return defs.map(f => ({
    id: f.id,
    chips: f.options.map(([value, label]) => ({
      key: `${f.id}:${value}`, label, test: f.test(value),
    })),
  }));
}

function syncCatalogActive(state) {
  state.active.clear();
  for (const [id, value] of Object.entries(state.values)) {
    if (value) state.active.add(`${id}:${value}`);
  }
}

function closeFilterSheet() {
  document.getElementById('bg-sheet-root')?.remove();
}

function renderCatalogFilters(state) {
  const { cfg, defs, values } = state;
  const count = Object.values(values).filter(Boolean).length;

  const select = f => `
    <label class="bg-select${values[f.id] ? ' is-set' : ''}">
      <select data-filter="${f.id}" aria-label="${esc(f.title)}">
        <option value="">${esc(f.label)}</option>
        ${f.options.map(([v, l]) => `<option value="${esc(v)}"${values[f.id] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
    </label>
  `;

  const inline = cfg.inline.map(id => defs.find(f => f.id === id)).filter(Boolean);

  const el = document.getElementById('chips');
  el.innerHTML = `
    <div class="bg-filters">
      ${inline.map(f => select(f)).join('')}
      ${cfg.sheet ? `
        <button type="button" class="bg-filter-btn${count ? ' is-set' : ''}" id="bg-open-sheet">
          Filtros${count ? ` <span class="bg-filter-count">${count}</span>` : ''}
        </button>` : ''}
    </div>
  `;

  el.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
    commitCatalogFilters(state, { ...state.values, [sel.dataset.filter]: sel.value || null });
  }));
  document.getElementById('bg-open-sheet')?.addEventListener('click', () => openFilterSheet(state));
}

function commitCatalogFilters(state, values) {
  catalogValues[state.cat] = { ...values };
  state.values = catalogValues[state.cat];
  savePlayers(state.cfg, state.values.players);
  syncCatalogActive(state);
  renderCatalogFilters(state);
  renderResults(state);
}

function openFilterSheet(state) {
  closeFilterSheet();
  const draft = { ...state.values };

  const root = document.createElement('div');
  root.id = 'bg-sheet-root';
  document.body.appendChild(root);

  const paint = (enter = false) => {
    root.innerHTML = `
      <div class="sheet-backdrop" data-close></div>
      <section class="sheet${enter ? ' sheet--enter' : ''}" role="dialog" aria-modal="true" aria-label="Filtros">
        <header class="sheet-head">
          <h3>Filtros</h3>
          <button type="button" class="sheet-close" data-close aria-label="Cerrar">✕</button>
        </header>
        ${state.defs.map(f => `
          <div class="sheet-group">
            <p class="sheet-group-title">${esc(f.title)}</p>
            <div class="sheet-chips">
              ${f.options.map(([v, l]) => `
                <button type="button" class="chip" data-filter="${f.id}" data-value="${v}" aria-pressed="${draft[f.id] === v}">${esc(l)}</button>
              `).join('')}
            </div>
          </div>
        `).join('')}
        <footer class="sheet-actions">
          <button type="button" class="sheet-clear" id="sheet-clear">Limpiar</button>
          <button type="button" class="btn-primary" id="sheet-apply">Aplicar filtros</button>
        </footer>
      </section>
    `;
  };
  paint(true);

  root.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { closeFilterSheet(); return; }

    const chip = e.target.closest('.chip');
    if (chip) {
      const { filter, value } = chip.dataset;
      draft[filter] = draft[filter] === value ? null : value;
      paint();
      return;
    }
    if (e.target.closest('#sheet-clear')) {
      Object.keys(draft).forEach(k => { draft[k] = null; });
      paint();
      return;
    }
    if (e.target.closest('#sheet-apply')) {
      closeFilterSheet();
      commitCatalogFilters(state, draft);
    }
  });

  window.addEventListener('hashchange', closeFilterSheet, { once: true });
}

function showCatalog(cat, items) {
  const cfg  = CATALOG_SCREENS[cat];
  const defs = cfg.filters(items);

  const state = {
    cat, cfg, items, defs,
    values:  catalogFilterValues(cat, cfg, defs),
    groups:  catalogGroups(defs),
    active:  new Set(),
    showAll: false,
    view:    savedView(cfg),
    onClear: () => commitCatalogFilters(state, Object.fromEntries(defs.map(f => [f.id, null]))),
  };

  syncCatalogActive(state);
  renderCatalogFilters(state);
  renderViewToggle(state);
  renderResults(state);
}

// ── Ficha de juegos de mesa y videojuegos ──

function playersShort(d) {
  if (d.minPlayers == null) return '';
  if (d.maxPlayers == null) return `${d.minPlayers} o más`;
  return d.maxPlayers === d.minPlayers ? `${d.minPlayers}` : `${d.minPlayers}–${d.maxPlayers}`;
}

function relativeTime(createdAt) {
  const seconds = createdAt?.seconds;
  if (!seconds) return 'Ahora mismo';

  const diff = Math.max(0, Date.now() / 1000 - seconds);
  const ago  = (n, one, many) => `Hace ${n} ${n === 1 ? one : many}`;
  const DAY  = 86400;

  if (diff < 60)        return 'Ahora mismo';
  if (diff < 3600)      return ago(Math.floor(diff / 60), 'minuto', 'minutos');
  if (diff < DAY)       return ago(Math.floor(diff / 3600), 'hora', 'horas');
  if (diff < DAY * 7)   return ago(Math.floor(diff / DAY), 'día', 'días');
  if (diff < DAY * 30)  return ago(Math.floor(diff / (DAY * 7)), 'semana', 'semanas');
  if (diff < DAY * 365) return ago(Math.floor(diff / (DAY * 30)), 'mes', 'meses');
  return ago(Math.floor(diff / (DAY * 365)), 'año', 'años');
}

function buildCatalogDetail(item, rating, noteCount) {
  const d = item.details ?? {};

  const stats = item.category === 'videogame' ? [
    ['👥', playersShort(d), 'Jugadores'],
    ['🎮', (d.platforms ?? []).join(' / '), 'Consola'],
    [(d.mode ?? []).map(m => MODE_ICONS[m] ?? '🎯').join(''), (d.mode ?? []).map(m => MODE_LABELS[m] ?? m).join(' · '), 'Tipo'],
  ].filter(([, value]) => value) : [
    ['👥', playersShort(d),                'Jugadores'],
    ['⏱️', durationLabel(d),               'Duración'],
    ['🧠', DIFFICULTY_LABELS[d.difficulty], 'Dificultad'],
  ].filter(([, value]) => value);

  return `
    <article class="detail">
      ${catalogThumb(item, 'bg-hero')}
      <h2 class="bg-detail-name">${esc(item.name)}</h2>
      <p class="detail-rating" id="detail-rating">${ratingHtml(rating)}</p>
      ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ''}
      ${isTournament(item) ? `<p class="bg-tournament">${esc(TOURNAMENT_RULE)}</p>` : ''}
      ${stats.length ? `
        <div class="bg-stats">
          ${stats.map(([icon, value, label]) => `
            <div class="bg-stat">
              <span class="bg-stat-icon" aria-hidden="true">${icon}</span>
              <span class="bg-stat-value">${esc(value)}</span>
              <span class="bg-stat-label">${label}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${item.tags?.length ? `<p class="detail-tags">${item.tags.map(esc).join(' · ')}</p>` : ''}

      <section class="bg-vote">
        <p class="vote-label">¿Qué te pareció?</p>
        <div class="stars" role="group" aria-label="Tu valoración">
          ${[1, 2, 3, 4, 5].map(n =>
            `<button type="button" class="star" data-stars="${n}" aria-label="${n} de 5" aria-pressed="false">★</button>`
          ).join('')}
        </div>
        <p class="vote-msg" id="vote-msg" role="status"></p>
      </section>

      <a class="bg-notes-link" href="#item/${esc(item.id)}/notes">
        <span>💬 Notas${noteCount ? ` (${noteCount})` : ''}</span>
        <span class="bg-card-chevron" aria-hidden="true">›</span>
      </a>
    </article>
  `;
}

function bindCatalogStars(item, root) {
  const stars   = root.querySelector('.stars');
  const voteMsg = root.querySelector('#vote-msg');

  loadMyRating(item.id)
    .then(mine => paintStars(stars, mine))
    .catch(() => {});

  stars.addEventListener('click', async e => {
    const btn = e.target.closest('.star');
    if (!btn) return;

    const value = Number(btn.dataset.stars);
    voteMsg.textContent = '';
    paintStars(stars, value);

    try {
      await saveRating(item.id, value);
      voteMsg.textContent = 'Guardado. Gracias.';
      const ratings = await loadRatings([item.id]);
      root.querySelector('#detail-rating').innerHTML = ratingHtml(ratings[item.id]);
    } catch (err) {
      console.error(err);
      voteMsg.textContent = 'No se pudo guardar. Prueba otra vez.';
      loadMyRating(item.id).then(mine => paintStars(stars, mine)).catch(() => {});
    }
  });
}

function showCatalogDetail(item, rating, comments) {
  getApp().innerHTML = `
    <div class="screen">
      ${topBar('')}
      <div id="content"></div>
    </div>
  `;
  bindBack(`#category/${item.category}`);

  const content = document.getElementById('content');
  content.innerHTML = buildCatalogDetail(item, rating, comments.length);
  bindCatalogStars(item, content);
}

async function loadStarsByUser(itemId) {
  try {
    const snap = await getDocs(query(collection(db, 'ratings'), where('itemId', '==', itemId)));
    return new Map(snap.docs.map(d => [d.data().uid, d.data().stars]));
  } catch (err) {
    console.warn('Valoraciones no disponibles:', err.code ?? err.message);
    return new Map();
  }
}

function buildCatalogNote(c, stars) {
  const name = c.name || 'Alguien del búnker';

  return `
    <article class="bg-note">
      <div class="bg-avatar" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase())}</div>
      <div class="bg-note-body">
        <header class="bg-note-head">
          <span class="bg-note-name">${esc(name)}</span>
          <span class="bg-note-time">${esc(relativeTime(c.createdAt))}</span>
        </header>
        ${stars ? `<p class="bg-note-stars" aria-label="${stars} de 5">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</p>` : ''}
        <p class="bg-note-text">${esc(c.text)}</p>
      </div>
    </article>
  `;
}

function closeNoteSheet() {
  document.getElementById('note-sheet-root')?.remove();
}

function openNoteSheet(item, onSaved) {
  closeNoteSheet();

  const root = document.createElement('div');
  root.id = 'note-sheet-root';
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet sheet--enter" role="dialog" aria-modal="true" aria-label="Dejar una nota">
      <header class="sheet-head">
        <h3>Dejar una nota</h3>
        <button type="button" class="sheet-close" data-close aria-label="Cerrar">✕</button>
      </header>
      <div class="note-form">
        <textarea id="note-text" rows="4" maxlength="500" placeholder="Qué tal estuvo, con cuánta gente jugasteis…"></textarea>
        <input id="note-name" type="text" maxlength="40" placeholder="Tu nombre (opcional)" autocomplete="off">
        <button type="button" class="btn-primary" id="btn-note" disabled>Publicar nota</button>
        <p class="note-msg" id="note-msg" role="status"></p>
      </div>
    </section>
  `;
  document.body.appendChild(root);

  const text    = root.querySelector('#note-text');
  const name    = root.querySelector('#note-name');
  const noteBtn = root.querySelector('#btn-note');
  const msg     = root.querySelector('#note-msg');

  name.value = savedName();
  text.addEventListener('input', () => { noteBtn.disabled = !text.value.trim(); });
  root.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeNoteSheet(); });

  noteBtn.addEventListener('click', async () => {
    const body = text.value.trim();
    if (!body) return;

    noteBtn.disabled = true;
    msg.textContent  = '';

    try {
      const author = name.value.trim().slice(0, 40);
      saveName(author);
      await saveNote(item.id, author, body.slice(0, 500));
      closeNoteSheet();
      onSaved();
    } catch (err) {
      console.error(err);
      msg.textContent = 'No se pudo guardar. Prueba otra vez.';
      noteBtn.disabled = false;
    }
  });

  window.addEventListener('hashchange', closeNoteSheet, { once: true });
  text.focus();
}

async function renderCatalogNotes(id) {
  getApp().innerHTML = `
    <div class="screen">
      ${topBar('Notas')}
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack(`#item/${id}`);

  const content = document.getElementById('content');

  try {
    const snap = id ? await getDoc(doc(db, 'items', id)) : null;
    if (!snap?.exists() || !CATALOG_SCREENS[snap.data().category]) {
      location.replace(`#item/${id ?? ''}`);
      return;
    }

    const item = { id: snap.id, ...snap.data() };

    const paint = async () => {
      const [comments, byUser, ratings] = await Promise.all([
        loadComments(id),
        loadStarsByUser(id),
        loadRatings([id]).catch(() => ({})),
      ]);

      content.innerHTML = `
        <p class="notes-sub">${esc(item.name)}${ratings[id] ? ` · ${esc(ratingText(ratings[id]))}` : ''}</p>
        ${comments.length
          ? `<div class="bg-notes">${comments.map(c => buildCatalogNote(c, byUser.get(c.uid))).join('')}</div>`
          : `<p class="notes-empty">Todavía nadie ha dejado una nota. ¿Empiezas tú?</p>`}
        <button type="button" class="btn-primary bg-notes-add" id="btn-add-note">Dejar una nota</button>
      `;
      content.querySelector('#btn-add-note').addEventListener('click', () => openNoteSheet(item, paint));
    };

    await paint();
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Filtros rápidos ──

function rangeOverlaps(item, minKey, maxKey, lo, hi) {
  const d = item.details ?? {};
  const a = d[minKey];
  if (a == null) return false;
  const openEnded = item.category === 'boardgame' && minKey === 'minPlayers';
  const b = d[maxKey] ?? (openEnded ? Infinity : a);
  return a <= hi && b >= lo;
}

const isTournament = item => item.category === 'videogame' && item.details?.tournament === true;

const tournamentApplies = (item, groupMin) =>
  isTournament(item) && groupMin > (item.details?.maxPlayers ?? 0);

const playersTest = (lo, hi) => item => {
  const d = item.details ?? {};
  if (d.minPlayers == null) return true;
  if (isTournament(item))   return d.minPlayers <= hi;
  return rangeOverlaps(item, 'minPlayers', 'maxPlayers', lo, hi);
};
const durationTest = (lo, hi) => item =>
  item.details?.durationMin == null || rangeOverlaps(item, 'durationMin', 'durationMax', lo, hi);

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

    case 'beverage':
      groups = [
        { id: 'temp', chips: [
          chip('temp', 'hot',  '☕ Caliente', i => ['hot',  'either'].includes(i.details?.temperature)),
          chip('temp', 'cold', '🧊 Fría',     i => ['cold', 'either'].includes(i.details?.temperature)),
        ]},
        { id: 'caffeine', chips: [
          chip('caffeine', 'none', '🌙 Sin cafeína', i => i.details?.caffeineLevel === 'none'),
        ]},
        { id: 'rooibos', chips: [
          chip('tag', 'rooibos', 'Rooibos', i => (i.tags ?? []).includes('rooibos')),
        ]},
        { id: 'alcohol', chips: [
          chip('alcohol', 'yes', '🍺 Con alcohol', i => i.details?.alcoholic === true),
          chip('alcohol', 'no',  '🥤 Sin alcohol', i => i.details?.alcoholic === false),
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

  const useful = c => {
    const n = items.filter(c.test).length;
    return n > 0 && n < items.length;
  };

  return groups
    .map(g => ({ ...g, chips: g.chips.filter(useful) }))
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
        <button type="button" class="chip" data-key="${esc(c.key)}" aria-pressed="${state.active.has(c.key)}">${esc(c.label)}</button>
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
      if (state.onClear) { state.onClear(); return; }
      state.active.clear();
      document.querySelectorAll('#chips .chip')
        .forEach(b => b.setAttribute('aria-pressed', 'false'));
      renderResults(state);
    });
    return;
  }

  const isCatalog = Boolean(state.cfg);
  const groupMin  = state.cfg?.groupMin?.(state.values.players);
  const sections  = state.cat === 'food' ? groupFood(filtered) : null;
  let listHtml;
  let shownCount;

  if (sections) {
    shownCount = filtered.length;
    listHtml   = sections.map(buildFoodRow).join('');
  } else if (isCatalog && state.view === 'grid') {
    shownCount = filtered.length;
    listHtml   = `<div class="bg-grid bg-grid--${state.cfg.cols}">${filtered.map(item => buildCatalogTile(item, groupMin)).join('')}</div>`;
  } else {
    const filtering = isCatalog && state.active.size > 0;
    const displayed = state.showAll || filtering ? filtered : filtered.slice(0, state.initial ?? INITIAL_ITEMS);
    shownCount = displayed.length;
    listHtml   = `<div class="items-list">${displayed.map(isCatalog ? (item => buildCatalogCard(item, groupMin)) : buildItemCard).join('')}</div>`;
  }

  const hasMore = filtered.length > shownCount;

  content.innerHTML = `
    ${isCatalog ? '' : `<p class="result-count">${filtered.length} ${filtered.length === 1 ? 'opción' : 'opciones'}</p>`}
    ${listHtml}
    ${hasMore ? `<button class="btn-see-all" id="btn-see-all">Ver ${isCatalog ? 'todos' : 'todas'} (${filtered.length})</button>` : ''}
  `;

  if (hasMore) {
    document.getElementById('btn-see-all').addEventListener('click', () => {
      state.showAll = true;
      renderResults(state);
    });
  }
}

// ── Agrupaciones de comida ──

const FOOD_GROUPS = [
  { type: 'snack',  label: 'Para picar' },
  { type: 'sweet',  label: 'Algo dulce' },
  { type: 'hearty', label: 'Algo contundente' },
];

const FOOD_ROW_ITEMS = 5;

function primaryType(item) {
  const type = item.details?.type;
  return Array.isArray(type) ? type[0] : type;
}

function groupFood(items) {
  const known = new Set(FOOD_GROUPS.map(g => g.type));

  return [
    ...FOOD_GROUPS.map(g => ({ type: g.type, label: g.label, items: items.filter(i => primaryType(i) === g.type) })),
    { type: 'other', label: 'Más ideas', items: items.filter(i => !known.has(primaryType(i))) },
  ].filter(s => s.items.length);
}

function buildItemSection(section) {
  return `
    <section class="item-group">
      <h3 class="item-group-title">${esc(section.label)}</h3>
      <div class="items-list">
        ${section.items.map(buildItemCard).join('')}
      </div>
    </section>
  `;
}

// ── Comida en filas ──

const orderMemory  = new Map();
const filterMemory = new Map();

function orderByMemory(cat, items) {
  const known = orderMemory.get(cat);
  let ordered;

  if (!known) {
    ordered = weightedOrder(items);
  } else {
    const rank  = new Map(known.map((id, i) => [id, i]));
    const kept  = items.filter(i => rank.has(i.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
    const fresh = weightedOrder(items.filter(i => !rank.has(i.id)));
    ordered = [...kept, ...fresh];
  }

  orderMemory.set(cat, ordered.map(i => i.id));
  return ordered;
}

function foodPhoto(item) {
  const emoji    = CATEGORIES.food?.emoji ?? '🍿';
  const fallback = `<div class="food-photo food-photo--fallback">${emoji}</div>`;
  if (!item.image) return fallback;

  return `<img class="food-photo" src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy"
    onerror="this.outerHTML='<div class=\\'food-photo food-photo--fallback\\'>${emoji}</div>'">`;
}

function buildFoodCard(item) {
  const minutes      = item.details?.preparationTime;
  const availability = AVAILABILITY_LABELS[item.availability];
  const votes        = item._votes ?? 0;
  const metaText     = [minutes > 0 ? `⏱ ${minutes} min` : '', versionsLabel(item)].filter(Boolean).join(' · ');

  return `
    <a class="food-card" href="#item/${esc(item.id)}">
      ${foodPhoto(item)}
      <div class="food-card-body">
        <p class="food-card-name">${esc(item.name)}</p>
        <p class="food-card-meta">${metaText ? esc(metaText) : '&nbsp;'}</p>
        ${availability ? `<span class="food-pill is-${esc(item.availability)}">${availability}</span>` : ''}
        ${votes ? `<p class="food-card-rating"><b>★ ${fmtAvg(item._avg)}</b> · ${votes} ${votes === 1 ? 'voto' : 'votos'}</p>` : ''}
      </div>
    </a>
  `;
}

function buildFoodRow(section) {
  const shown = section.items.slice(0, FOOD_ROW_ITEMS);
  const more  = section.items.length > shown.length;
  const href  = `#category/food/${section.type}`;

  return `
    <section class="food-section">
      <div class="food-section-head">
        <h3>${esc(section.label)}</h3>
        ${more ? `<a href="${href}">Ver todo →</a>` : ''}
      </div>
      <div class="food-row">
        ${shown.map(buildFoodCard).join('')}
        ${more ? `<a class="food-more" href="${href}"><span>→</span>Ver todo<small>${section.items.length} opciones</small></a>` : ''}
      </div>
    </section>
  `;
}

async function renderFoodSection(type) {
  const group = FOOD_GROUPS.find(g => g.type === type);
  const label = group ? group.label : type === 'other' ? 'Más ideas' : null;

  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>${CATEGORIES.food?.emoji ?? '🍿'}</span>
        <h2>${esc(label ?? 'Comida')}</h2>
      </header>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack('#category/food');

  const content = document.getElementById('content');

  if (!label) {
    content.innerHTML = `
      <p class="msg-empty">No hemos encontrado esto.</p>
      <a class="btn-see-all" href="#category/food">Volver a la comida</a>
    `;
    return;
  }

  try {
    const items   = await loadItems(['food']);
    const ratings = await loadRatings(items.map(i => i.id));

    const ordered = orderByMemory('food', items.map(item => ({
      ...item,
      _avg:   ratings[item.id]?.avg   ?? 0,
      _votes: ratings[item.id]?.count ?? 0,
    })));

    const section = groupFood(ordered).find(s => s.type === (group ? group.type : 'other'));

    if (!section) {
      content.innerHTML = `<p class="msg-empty">Todavía no hay nada aquí.</p>`;
      return;
    }

    content.innerHTML = `
      <p class="result-count">${section.items.length} ${section.items.length === 1 ? 'opción' : 'opciones'}</p>
      <div class="food-grid">${section.items.map(buildFoodCard).join('')}</div>
    `;
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Plan sorpresa ──

const PLAN_KINDS = ['activity', 'beverage', 'food'];

const PLAN_PIECES = {
  activity: { label: '🎲 Para jugar', toggle: '🎲 Jugar', categories: ['boardgame', 'videogame'] },
  beverage: { label: '🍹 Para beber', toggle: '🍹 Beber', categories: ['beverage'] },
  food:     { label: '🍿 Para comer', toggle: '🍿 Comer', categories: ['food'] },
};

const GROUP_SIZES = {
  '2':   { label: '2',   range: [2, 2] },
  '3-4': { label: '3–4', range: [3, 4] },
  '5-7': { label: '5–7', range: [5, 7] },
  '8+':  { label: '8+',  range: [8, Infinity] },
};

const TIME_OPTIONS = {
  quick: { label: 'Poco tiempo', minutes: 30 },
  hour:  { label: 'Hasta 1 h',   minutes: 60 },
  any:   { label: 'Sin prisa',   minutes: Infinity },
};

const GROUP_SIZE_KEY = 'bunker.players';

let lastPlan = null;

function savedGroupSize() {
  try {
    const value = localStorage.getItem(GROUP_SIZE_KEY);
    return GROUP_SIZES[value] ? value : null;
  } catch {
    return null;
  }
}

function saveGroupSize(value) {
  try {
    localStorage.setItem(GROUP_SIZE_KEY, value);
  } catch {}
}

async function loadPlanPools() {
  const items   = await loadItems(['boardgame', 'videogame', 'beverage', 'food']);
  const ratings = await loadRatings(items.map(i => i.id));

  const enriched = items.map(item => ({
    ...item,
    _avg:   ratings[item.id]?.avg   ?? 0,
    _votes: ratings[item.id]?.count ?? 0,
  }));

  return Object.fromEntries(PLAN_KINDS.map(kind => [
    kind,
    enriched.filter(i => PLAN_PIECES[kind].categories.includes(i.category)),
  ]));
}

function ensurePools(plan) {
  if (plan.pools) return Promise.resolve();

  if (!plan.loading) {
    plan.loading = loadPlanPools()
      .then(pools => { plan.pools = pools; })
      .catch(err => console.error(err))
      .finally(() => { plan.loading = null; });
  }
  return plan.loading;
}

function fitsPlayers(item, [lo, hi], strict) {
  const d = item.details ?? {};
  if (d.minPlayers == null) return true;
  if (isTournament(item))   return d.minPlayers <= (strict ? lo : hi);
  const max = d.maxPlayers ?? (item.category === 'boardgame' ? Infinity : d.minPlayers);
  return strict
    ? d.minPlayers <= lo && max >= (hi === Infinity ? lo : hi)
    : d.minPlayers <= hi && max >= lo;
}

function fitsTime(kind, item, minutes) {
  const d = item.details ?? {};
  const needed = kind === 'activity' ? d.durationMin : d.preparationTime;
  return needed == null || needed <= minutes;
}

function planCandidates(plan, kind) {
  const pool    = plan.pools[kind];
  const range   = GROUP_SIZES[plan.players].range;
  const minutes = TIME_OPTIONS[plan.time].minutes;

  const levels = kind === 'activity'
    ? [
        i => fitsPlayers(i, range, true)  && fitsTime(kind, i, minutes),
        i => fitsPlayers(i, range, false) && fitsTime(kind, i, minutes),
        i => fitsPlayers(i, range, false),
      ]
    : [i => fitsTime(kind, i, minutes)];

  for (let level = 0; level < levels.length; level++) {
    const items = pool.filter(levels[level]);
    if (items.length) return { items, exact: level === 0 };
  }
  return { items: pool, exact: false };
}

function pickFor(plan, kind) {
  const { items, exact } = planCandidates(plan, kind);
  if (!items.length) return null;

  const currentId = plan.picks[kind]?.item.id;
  const seen      = plan.seen[kind];
  const others    = weightedOrder(items, kind === 'beverage' ? seasonFactor : undefined)
    .filter(i => i.id !== currentId);
  const pool      = others.length ? others : items;
  const unseen    = pool.filter(i => !seen.has(i.id));

  if (!unseen.length) seen.clear();
  const item = unseen[0] ?? pool[0];
  seen.add(item.id);

  return { item, exact };
}

function refreshPicks(plan) {
  for (const kind of PLAN_KINDS) {
    if (!plan.include.has(kind)) {
      delete plan.picks[kind];
      continue;
    }

    const current = plan.picks[kind];
    if (current) {
      const { items, exact } = planCandidates(plan, kind);
      if (items.some(i => i.id === current.item.id)) {
        current.exact = exact;
        continue;
      }
    }

    const next = pickFor(plan, kind);
    if (next) plan.picks[kind] = next;
    else delete plan.picks[kind];
  }
}

function newPlan(plan) {
  for (const kind of PLAN_KINDS) {
    if (!plan.include.has(kind)) continue;
    const next = pickFor(plan, kind);
    if (next) plan.picks[kind] = next;
  }
}

function applyChip(plan, { group, value }) {
  if (group === 'players') {
    plan.players = value;
    saveGroupSize(value);
  } else if (group === 'time') {
    plan.time = value;
  } else if (plan.include.has(value)) {
    if (plan.include.size > 1) plan.include.delete(value);
  } else {
    plan.include.add(value);
  }
}

function syncChips(plan) {
  document.querySelectorAll('#plan .chip').forEach(btn => {
    const { group, value } = btn.dataset;
    const on = group === 'players' ? plan.players === value
             : group === 'time'    ? plan.time === value
             : plan.include.has(value);
    btn.setAttribute('aria-pressed', String(on));
  });
}

function planChip(group, value, label, on) {
  return `<button type="button" class="chip" data-group="${group}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
}

function renderSurprise() {
  const plan = lastPlan ?? {
    phase:   'ask',
    players: savedGroupSize() ?? '3-4',
    time:    'any',
    include: new Set(PLAN_KINDS),
    pools:   null,
    loading: null,
    picks:   {},
    seen:    { activity: new Set(), beverage: new Set(), food: new Set() },
  };
  lastPlan = plan;

  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>✨</span>
        <h2>Plan sorpresa</h2>
      </header>
      <p class="screen-intro">No sabemos qué hay hoy, pero seguro que es una buena idea.</p>
      <div id="plan"></div>
    </div>
  `;
  bindBack('#home');

  ensurePools(plan);

  if (plan.phase === 'plan') renderPlan(plan);
  else renderAsk(plan);
}

function renderAsk(plan) {
  const root = document.getElementById('plan');

  root.innerHTML = `
    <section class="plan-ask">
      <p class="plan-question">¿Cuántos sois?</p>
      <div class="chips" role="group" aria-label="Número de personas">
        ${Object.entries(GROUP_SIZES).map(([value, g]) =>
          planChip('players', value, g.label, plan.players === value)
        ).join('')}
      </div>
      <button type="button" class="btn-primary" id="btn-idea">Danos una idea</button>
    </section>
  `;

  root.querySelector('.chips').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    applyChip(plan, btn.dataset);
    syncChips(plan);
  });

  document.getElementById('btn-idea').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Pensando…';

    await ensurePools(plan);

    if (!plan.pools) {
      root.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
      return;
    }

    plan.phase = 'plan';
    newPlan(plan);
    renderPlan(plan);
  });
}

function renderPlan(plan) {
  const root = document.getElementById('plan');
  if (!root) return;

  root.innerHTML = `
    <div class="chips" role="group" aria-label="Ajustes del plan">
      ${Object.entries(GROUP_SIZES).map(([value, g]) =>
        planChip('players', value, `👥 ${g.label}`, plan.players === value)
      ).join('')}
      <span class="chip-sep" aria-hidden="true"></span>
      ${Object.entries(TIME_OPTIONS).map(([value, t]) =>
        planChip('time', value, t.label, plan.time === value)
      ).join('')}
      <span class="chip-sep" aria-hidden="true"></span>
      ${PLAN_KINDS.map(kind =>
        planChip('include', kind, PLAN_PIECES[kind].toggle, plan.include.has(kind))
      ).join('')}
    </div>
    <div id="plan-pieces"></div>
    <button type="button" class="btn-primary" id="btn-new-plan">Otro plan</button>
  `;

  root.querySelector('.chips').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    applyChip(plan, btn.dataset);
    refreshPicks(plan);
    syncChips(plan);
    renderPieces(plan);
  });

  document.getElementById('plan-pieces').addEventListener('click', e => {
    const btn = e.target.closest('.plan-reroll');
    if (!btn) return;
    const next = pickFor(plan, btn.dataset.kind);
    if (next) plan.picks[btn.dataset.kind] = next;
    renderPieces(plan);
  });

  document.getElementById('btn-new-plan').addEventListener('click', () => {
    newPlan(plan);
    renderPieces(plan);
  });

  renderPieces(plan);
}

function renderPieces(plan) {
  const box = document.getElementById('plan-pieces');
  if (!box) return;

  const kinds = PLAN_KINDS.filter(kind => plan.picks[kind]);

  if (!kinds.length) {
    box.innerHTML = `<p class="msg-empty">Todavía no tenemos catálogo suficiente para montar un plan así.</p>`;
    return;
  }

  box.innerHTML = kinds.map(kind => {
    const { item, exact } = plan.picks[kind];
    return `
      <section class="plan-piece">
        <div class="plan-piece-head">
          <span class="plan-piece-label">${PLAN_PIECES[kind].label}</span>
          <button type="button" class="plan-reroll" data-kind="${kind}">🔄 Otra</button>
        </div>
        ${buildItemCard(item, { groupMin: GROUP_SIZES[plan.players].range[0] })}
        ${exact ? '' : `<p class="plan-note">Es lo más cercano que tenemos a lo que pedís.</p>`}
      </section>
    `;
  }).join('');
}

// ── Fuera de carta ──

const SECRET_ORDER = ['ready', 'quick', 'planned'];

async function loadSecretItems() {
  const snap = await getDocs(query(
    collection(db, 'items'),
    where('secret', '==', true),
    where('active', '==', true)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderSecret() {
  getApp().innerHTML = `
    <div class="screen">
      <button class="back-btn" id="back-btn">← Volver</button>
      <header class="cat-screen-header">
        <span>✦</span>
        <h2>Fuera de carta</h2>
      </header>
      <p class="screen-intro">Bueno... has encontrado algo que normalmente no enseñamos.</p>
      <div id="content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  bindBack('#home');

  const content = document.getElementById('content');

  try {
    const items   = await loadSecretItems();
    const ratings = await loadRatings(items.map(i => i.id));

    const ordered = weightedOrder(items.map(item => ({
      ...item,
      _avg:   ratings[item.id]?.avg   ?? 0,
      _votes: ratings[item.id]?.count ?? 0,
    })));

    if (!ordered.length) {
      content.innerHTML = `<p class="msg-empty">Todavía no hay nada fuera de carta.</p>`;
      return;
    }

    const sections = [
      ...SECRET_ORDER.map(key => ({
        label: AVAILABILITY_LABELS[key],
        items: ordered.filter(i => i.availability === key),
      })),
      { label: 'Más ideas', items: ordered.filter(i => !SECRET_ORDER.includes(i.availability)) },
    ].filter(s => s.items.length);

    content.innerHTML = sections.map(buildItemSection).join('');
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="msg-empty">No se pudo cargar. Comprueba tu conexión.</p>`;
  }
}

// ── Ficha de detalle ──

const DIFFICULTY_LABELS = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };
const MODE_LABELS = {
  competitive: 'Competitivo', cooperative: 'Cooperativo', party: 'Party', chill: 'Tranquilo',
};
const MODE_ICONS = {
  competitive: '⚔️', cooperative: '🤝', party: '🎉', chill: '😌',
};

const fmtAvg = n => n.toFixed(1).replace('.', ',');

function playersLabel(d, openEnded = false) {
  if (d.minPlayers == null) return '';
  if (openEnded && d.maxPlayers == null) return `${d.minPlayers} jugadores o más`;
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

async function renderItem(id, sub) {
  if (sub === 'notes') return renderCatalogNotes(id);

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
    if (CATALOG_SCREENS[item.category]) { showCatalogDetail(item, ratings[id], comments); return; }
    backBtn.dataset.fallback = item.category === 'beverage'
      ? `#category/beverage/${blockKeyFor(item)}`
      : `#category/${item.category}`;
    content.innerHTML = buildDetail(item, ratings[id], comments);
    bindDetail(item, content, comments);
    bindVariants(item, content);
    loadPairs(item, content);
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
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
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
      facts.push(playersLabel(d, true), durationLabel(d), DIFFICULTY_LABELS[d.difficulty]);
      break;
    case 'beverage':
      facts.push(
        AVAILABILITY_LABELS[item.availability],
        BEVERAGE_TYPES[d.type] ?? d.type,
        { hot: '☕ Caliente', cold: '🧊 Frío', either: '☕ / 🧊 Frío o caliente' }[d.temperature],
        d.alcoholic === true ? '🍺 Con alcohol' : d.alcoholic === false ? '🥤 Sin alcohol' : null,
        CAFFEINE_LABELS[d.caffeineLevel],
        d.steepingTime > 0 ? `Infusión ${d.steepingTime} min` : null,
        d.preparationTime > 0 ? `${d.preparationTime} min` : null,
        needsFinishing(item) ? 'Ayúdame a acabarlo' : null
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

function versionsLabel(item) {
  const n = item.variants?.length ?? 0;
  return n > 1 ? `${n} versiones` : '';
}

const listHtml = (title, list, ordered) => list?.length
  ? `<h4>${title}</h4><${ordered ? 'ol' : 'ul'}>${list.map(t => `<li>${esc(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`
  : '';

function buildHowTo(item, variant) {
  const html =
    listHtml('Ingredientes', variant?.ingredients ?? item.ingredients) +
    listHtml('Pasos',        variant?.steps       ?? item.steps, true) +
    listHtml('Toppings',     item.toppings) +
    listHtml('Trucos',       item.tips);

  return html ? `<section class="detail-section"><h3>Cómo se hace</h3>${html}</section>` : '';
}

function variantText(item, index) {
  const total = item.variants.length;
  return `Versión ${index + 1} de ${total} · ${item.variants[index].name}`;
}

function buildVariants(item) {
  const variants = item.variants ?? [];
  if (!variants.length) return '';

  return `
    <section class="detail-section" id="variants">
      <h3>Versiones</h3>
      <div class="variant-nav">
        ${variants.length > 1 ? `<button type="button" class="chip" data-dir="-1" aria-label="Versión anterior">‹</button>` : ''}
        <p class="variant-indicator" id="variant-indicator" role="status" aria-live="polite">${esc(variantText(item, 0))}</p>
        ${variants.length > 1 ? `<button type="button" class="chip" data-dir="1" aria-label="Versión siguiente">›</button>` : ''}
      </div>
      <p class="variant-desc" id="variant-desc">${esc(variants[0].description ?? '')}</p>
    </section>
  `;
}

function bindVariants(item, root) {
  const variants = item.variants ?? [];
  const nav = root.querySelector('#variants');
  if (!nav) return;

  let index = 0;
  const show = () => {
    root.querySelector('#variant-indicator').textContent = variantText(item, index);
    root.querySelector('#variant-desc').textContent = variants[index].description ?? '';
    root.querySelector('#how-to').innerHTML = buildHowTo(item, variants[index]);
  };

  nav.addEventListener('click', e => {
    const btn = e.target.closest('[data-dir]');
    if (!btn) return;
    index = (index + Number(btn.dataset.dir) + variants.length) % variants.length;
    show();
  });
}

async function loadPairs(item, root) {
  const ids = item.pairsWith ?? [];
  if (!ids.length) return;

  const results = await Promise.allSettled(ids.map(id => getDoc(doc(db, 'items', id))));
  const items = results
    .filter(r => r.status === 'fulfilled' && r.value.exists())
    .map(r => ({ id: r.value.id, ...r.value.data() }))
    .filter(i => i.active !== false && i.secret !== true);
  if (!items.length) return;

  const box = root.querySelector('#pairs');
  if (!box) return;
  box.querySelector('#pairs-list').innerHTML = items.map(buildItemCard).join('');
  box.hidden = false;
}

function buildDetail(item, rating, comments) {
  const emoji  = CATEGORIES[item.category]?.emoji ?? '📦';
  const cat    = esc(item.category);
  const facts  = buildFacts(item);
  const expiry = expiryNote(item);

  const hero = item.image
    ? `<img class="detail-hero" src="${esc(item.image)}" alt="${esc(item.name)}"
         onerror="this.outerHTML='<div class=\\'detail-hero detail-hero--fallback\\' data-cat=\\'${cat}\\'>${emoji}</div>'">`
    : `<div class="detail-hero detail-hero--fallback" data-cat="${cat}">${emoji}</div>`;

  const notes = `
    <section class="detail-notes">
      <h3>Lo que opinó la gente</h3>
      <div id="notes-list"></div>

      <div class="vote">
        <p class="vote-label">¿Qué te pareció?</p>
        <div class="stars" role="group" aria-label="Tu valoración">
          ${[1, 2, 3, 4, 5].map(n =>
            `<button type="button" class="star" data-stars="${n}" aria-label="${n} de 5" aria-pressed="false">★</button>`
          ).join('')}
        </div>
        <p class="vote-msg" id="vote-msg" role="status"></p>
      </div>

      <div class="note-form">
        <textarea id="note-text" rows="3" maxlength="500" placeholder="Deja una nota: qué tal estuvo, cómo lo hicisteis…"></textarea>
        <input id="note-name" type="text" maxlength="40" placeholder="Tu nombre (opcional)" autocomplete="off">
        <button type="button" class="btn-primary" id="btn-note" disabled>Dejar una nota</button>
        <p class="note-msg" id="note-msg" role="status"></p>
      </div>
    </section>
  `;

  return `
    <article class="detail">
      ${hero}
      <h2 class="detail-name">${esc(item.name)}</h2>
      ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ''}
      ${facts.length ? `<div class="detail-facts">${facts.map(f => `<span class="fact">${esc(f)}</span>`).join('')}</div>` : ''}
      <p class="detail-rating" id="detail-rating">${ratingText(rating)}</p>
      ${item.tags?.length ? `<p class="detail-tags">${item.tags.map(esc).join(' · ')}</p>` : ''}
      ${expiry ? `<p class="detail-note">${esc(expiry)}</p>` : ''}
      ${item.serveTip ? `<section class="detail-section"><h3>Cómo tomarlo</h3><p>${esc(item.serveTip)}</p></section>` : ''}
      ${buildVariants(item)}
      <div id="how-to">${buildHowTo(item, item.variants?.[0])}</div>
      <section class="detail-section" id="pairs" hidden>
        <h3>Va bien con</h3>
        <div class="items-list" id="pairs-list"></div>
      </section>
      ${notes}
    </article>
  `;
}

// ── Votos y notas ──

const NOTES_VISIBLE = 3;
const NAME_KEY = 'bunker.name';

function ratingText(rating) {
  const votes = rating?.count ?? 0;
  return votes ? `★ ${fmtAvg(rating.avg)} · ${votes} ${votes === 1 ? 'voto' : 'votos'}` : '';
}

function starsHtml(avg) {
  const fill = Math.round(Math.min(5, Math.max(0, avg)) * 2) * 10;
  return `<span class="rating-stars" style="--fill:${fill}%" aria-hidden="true">★★★★★</span>`;
}

function ratingHtml(rating) {
  const votes = rating?.count ?? 0;
  if (!votes) return '';
  return `${starsHtml(rating.avg)}<span class="rating-text">${fmtAvg(rating.avg)} · ${votes} ${votes === 1 ? 'voto' : 'votos'}</span>`;
}

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(value) {
  try {
    localStorage.setItem(NAME_KEY, value);
  } catch {}
}

function noteHtml(c) {
  return `
    <blockquote class="note">
      <p>“${esc(c.text)}”</p>
      <footer>— ${esc(c.name || 'Alguien del búnker')}</footer>
    </blockquote>
  `;
}

function buildNotesList(comments, showAll) {
  if (!comments.length) {
    return `<p class="notes-empty">Todavía nadie ha dejado una nota. ¿Empiezas tú?</p>`;
  }

  const shown = showAll ? comments : comments.slice(0, NOTES_VISIBLE);
  const more  = comments.length > shown.length
    ? `<button type="button" class="btn-see-all" id="btn-more-notes">Ver las ${comments.length} notas</button>`
    : '';

  return shown.map(noteHtml).join('') + more;
}

async function loadMyRating(itemId) {
  const uid = await currentUserId();
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'ratings', `${itemId}_${uid}`));
  return snap.exists() ? snap.data().stars : null;
}

async function saveRating(itemId, stars) {
  const user = await ensureUser();
  const ref  = doc(db, 'ratings', `${itemId}_${user.uid}`);
  const prev = await getDoc(ref);

  if (prev.exists()) {
    await updateDoc(ref, { stars, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      itemId,
      uid: user.uid,
      stars,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function saveNote(itemId, name, text) {
  const user = await ensureUser();
  await addDoc(collection(db, 'comments'), {
    itemId,
    uid: user.uid,
    name,
    text,
    createdAt: serverTimestamp(),
    hidden: false,
  });
}

function paintStars(root, stars) {
  root.querySelectorAll('.star').forEach(btn => {
    const value = Number(btn.dataset.stars);
    btn.classList.toggle('on', value <= (stars ?? 0));
    btn.setAttribute('aria-pressed', String(value === stars));
  });
}

function bindDetail(item, root, initialComments) {
  const stars   = root.querySelector('.stars');
  const voteMsg = root.querySelector('#vote-msg');
  const noteMsg = root.querySelector('#note-msg');
  const list    = root.querySelector('#notes-list');
  const text    = root.querySelector('#note-text');
  const name    = root.querySelector('#note-name');
  const noteBtn = root.querySelector('#btn-note');

  let comments = initialComments;
  let showAll   = false;

  name.value = savedName();

  const syncNoteButton = () => { noteBtn.disabled = !text.value.trim(); };
  text.addEventListener('input', syncNoteButton);
  syncNoteButton();

  loadMyRating(item.id)
    .then(mine => paintStars(stars, mine))
    .catch(() => {});

  const renderList = () => {
    list.innerHTML = buildNotesList(comments, showAll);
    list.querySelector('#btn-more-notes')?.addEventListener('click', () => {
      showAll = true;
      renderList();
    });
  };
  renderList();

  stars.addEventListener('click', async e => {
    const btn = e.target.closest('.star');
    if (!btn) return;

    const value = Number(btn.dataset.stars);
    voteMsg.textContent = '';
    paintStars(stars, value);

    try {
      await saveRating(item.id, value);
      voteMsg.textContent = 'Guardado. Gracias.';
      const ratings = await loadRatings([item.id]);
      root.querySelector('#detail-rating').textContent = ratingText(ratings[item.id]);
    } catch (err) {
      console.error(err);
      voteMsg.textContent = 'No se pudo guardar. Prueba otra vez.';
      loadMyRating(item.id).then(mine => paintStars(stars, mine)).catch(() => {});
    }
  });

  noteBtn.addEventListener('click', async () => {
    const body = text.value.trim();
    if (!body) return;

    noteBtn.disabled = true;
    noteMsg.textContent = '';

    try {
      const author = name.value.trim().slice(0, 40);
      saveName(author);
      await saveNote(item.id, author, body.slice(0, 500));

      text.value = '';
      const fresh = await loadComments(item.id);
      if (fresh.length) comments = fresh;
      showAll = false;
      renderList();
      noteMsg.textContent = 'Nota guardada.';
    } catch (err) {
      console.error(err);
      noteMsg.textContent = 'No se pudo guardar. Prueba otra vez.';
    } finally {
      syncNoteButton();
    }
  });
}

function buildItemCard(item, { groupMin } = {}) {
  const emoji  = CATEGORIES[item.category]?.emoji ?? '📦';
  const meta   = buildMeta(item, groupMin);
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
        ${needsFinishing(item) ? `<p class="item-meta"><span class="food-pill is-quick">Ayúdame a acabarlo</span></p>` : ''}
      </div>
    </a>
  `;
}

function buildMeta(item, groupMin) {
  const d = item.details ?? {};
  const parts = [];

  switch (item.category) {
    case 'boardgame':
      parts.push(...[playersLabel(d, true), durationLabel(d)].filter(Boolean));
      break;
    case 'videogame':
      parts.push(...[(d.platforms ?? []).join(' / '), playersLabel(d)].filter(Boolean));
      if (tournamentApplies(item, groupMin)) parts.push('🏆 Torneo');
      break;
    case 'beverage':
      if (d.type)        parts.push(BEVERAGE_TYPES[d.type] ?? d.type);
      if (d.temperature === 'hot')  parts.push('☕ Caliente');
      if (d.temperature === 'cold') parts.push('🧊 Frío');
      if (d.alcoholic === true)     parts.push('Con alcohol');
      else if (d.type === 'mocktail') parts.push('Sin alcohol');
      break;
    case 'food':
      if (d.preparationTime) parts.push(`${d.preparationTime} min`);
      if (d.vegetarian)      parts.push('🌱');
      break;
  }

  if ((item.category === 'beverage' || item.category === 'food') && AVAILABILITY_LABELS[item.availability])
    parts.unshift(AVAILABILITY_LABELS[item.availability]);

  if (versionsLabel(item)) parts.push(versionsLabel(item));

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

const RATING_PRIOR_VOTES = 3;
const RATING_PRIOR_MEAN  = 3;

function smoothedAverage(item) {
  const votes = item._votes ?? 0;
  const avg   = item._avg   ?? 0;
  return (RATING_PRIOR_MEAN * RATING_PRIOR_VOTES + avg * votes) / (RATING_PRIOR_VOTES + votes);
}

function weightedOrder(items, factor = () => 1) {
  const pool = items.map(item => ({
    item,
    w: Math.pow(smoothedAverage(item), 1.5) * factor(item),
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

router();
