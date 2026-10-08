import { db, ensureUser, currentUserId } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, getDoc, limit, setDoc, updateDoc, addDoc, serverTimestamp
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
      cat,
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

  const sections = state.cat === 'food' ? groupFood(filtered) : null;
  let listHtml;
  let shownCount;

  if (sections) {
    const shown = state.showAll
      ? sections
      : sections.map(s => ({ ...s, items: s.items.slice(0, FOOD_SECTION_ITEMS) }));
    shownCount = shown.reduce((n, s) => n + s.items.length, 0);
    listHtml   = shown.map(buildItemSection).join('');
  } else {
    const displayed = state.showAll ? filtered : filtered.slice(0, INITIAL_ITEMS);
    shownCount = displayed.length;
    listHtml   = `<div class="items-list">${displayed.map(buildItemCard).join('')}</div>`;
  }

  const hasMore = filtered.length > shownCount;

  content.innerHTML = `
    <p class="result-count">${filtered.length} ${filtered.length === 1 ? 'opción' : 'opciones'}</p>
    ${listHtml}
    ${hasMore ? `<button class="btn-see-all" id="btn-see-all">Ver todas (${filtered.length})</button>` : ''}
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

const FOOD_SECTION_ITEMS = 3;

function primaryType(item) {
  const type = item.details?.type;
  return Array.isArray(type) ? type[0] : type;
}

function groupFood(items) {
  const known = new Set(FOOD_GROUPS.map(g => g.type));

  return [
    ...FOOD_GROUPS.map(g => ({ label: g.label, items: items.filter(i => primaryType(i) === g.type) })),
    { label: 'Más ideas', items: items.filter(i => !known.has(primaryType(i))) },
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
  if (d.minPlayers == null) return false;
  const max = d.maxPlayers ?? d.minPlayers;
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
  const others    = weightedOrder(items).filter(i => i.id !== currentId);
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
        ${buildItemCard(item)}
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
    bindDetail(item, content, comments);
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
        <button type="button" class="btn-primary" id="btn-note">Dejar una nota</button>
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
      <footer>— ${esc(c.name || 'Alguien de la reunión')}</footer>
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
    if (!body) {
      noteMsg.textContent = 'Escribe algo primero.';
      return;
    }

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
      noteBtn.disabled = false;
    }
  });
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

const RATING_PRIOR_VOTES = 3;
const RATING_PRIOR_MEAN  = 3;

function smoothedAverage(item) {
  const votes = item._votes ?? 0;
  const avg   = item._avg   ?? 0;
  return (RATING_PRIOR_MEAN * RATING_PRIOR_VOTES + avg * votes) / (RATING_PRIOR_VOTES + votes);
}

function weightedOrder(items) {
  const pool = items.map(item => ({
    item,
    w: Math.pow(smoothedAverage(item), 1.5),
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
