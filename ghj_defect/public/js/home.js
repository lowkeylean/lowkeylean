import {
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset, showMsg } from './app.js';
import { ROOMS, PUBLIC_AREAS, RESTAURANTS } from './locations.js';
import {
  STATUS_LABELS,
  PRIORITY_ORDER,
  locationStatus,
} from './status.js';

const msg = document.getElementById('msg');
const root = document.getElementById('matrix-root');
const updatedEl = document.getElementById('updated');
const chipsEl = document.getElementById('filter-chips');
const summaryEl = document.getElementById('exec-summary');

// Modal
const modal = document.getElementById('loc-modal');
const modalTitle = document.getElementById('loc-modal-title');
const modalSub = document.getElementById('loc-modal-sub');
const modalBody = document.getElementById('loc-modal-body');
const modalClose = document.getElementById('loc-modal-close');

let byLocation = new Map(); // "Area||Name" -> defects[]
let activeFilter = 'all'; // all | red | amber | green
let lastTrigger = null;

// ---------- helpers ----------
function keyFor(area, name) {
  return `${area}||${name}`;
}

// Room numbers encode the floor as everything but the last two digits:
// '601' -> 6, '1204' -> 12, '2612' -> 26.
function floorOf(roomNo) {
  return parseInt(String(roomNo).slice(0, -2), 10);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function pillClass(status) {
  return String(status || '').toLowerCase().replace(/\s+/g, '-');
}

function entryFor(area, name) {
  const defects = byLocation.get(keyFor(area, name)) || [];
  return { area, name, defects, ...locationStatus(defects) };
}

function rollup(entries) {
  const c = { red: 0, amber: 0, green: 0 };
  for (const e of entries) c[e.status] += 1;
  return c;
}

function rollupHTML(c) {
  return `<span class="r"><b>${c.red}</b> attention</span> · `
    + `<span class="a"><b>${c.amber}</b> watch</span> · `
    + `<span class="g"><b>${c.green}</b> clear</span>`;
}

// ---------- rendering ----------
function tileHTML(e, wide) {
  const dim = activeFilter !== 'all' && e.status !== activeFilter ? ' dim' : '';
  const badge = e.open > 0 ? `<span class="tile-badge">${e.open}</span>` : '';
  const cls = `tile ${e.status}${wide ? ' tile-wide' : ''}${dim}`;
  const tip = `${e.name} — ${STATUS_LABELS[e.status]}${e.open ? `, ${e.open} open` : ''}`;
  return `<button class="${cls}" data-area="${esc(e.area)}" data-name="${esc(e.name)}" title="${esc(tip)}">${esc(e.name)}${badge}</button>`;
}

function renderRooms() {
  const entries = ROOMS.map((r) => ({ ...entryFor('Rooms', r), floor: floorOf(r) }));
  const floors = [...new Set(entries.map((e) => e.floor))].sort((a, b) => a - b);

  const cards = floors.map((floor) => {
    const fe = entries.filter((e) => e.floor === floor);
    const c = rollup(fe);
    const meta = c.red
      ? `<span class="floor-meta red">${c.red} attention</span>`
      : c.amber
        ? `<span class="floor-meta amber">${c.amber} watch</span>`
        : `<span class="floor-meta green">all clear</span>`;
    return `<div class="floor-card">
      <div class="floor-label">Floor ${floor}<span class="floor-count">${fe.length} rooms</span>${meta}</div>
      <div class="tile-grid">${fe.map((e) => tileHTML(e, false)).join('')}</div>
    </div>`;
  }).join('');

  return `<section class="matrix-section">
    <div class="section-head"><h2>Rooms</h2><span class="section-rollup">${rollupHTML(rollup(entries))}</span></div>
    ${cards}
  </section>`;
}

function renderNamedSection(title, area, names) {
  const entries = names.map((n) => entryFor(area, n));
  return `<section class="matrix-section">
    <div class="section-head"><h2>${esc(title)}</h2><span class="section-rollup">${rollupHTML(rollup(entries))}</span></div>
    <div class="area-card"><div class="tile-grid">${entries.map((e) => tileHTML(e, true)).join('')}</div></div>
  </section>`;
}

function renderSummary() {
  const all = [
    ...ROOMS.map((r) => entryFor('Rooms', r)),
    ...PUBLIC_AREAS.map((n) => entryFor('Public Area', n)),
    ...RESTAURANTS.map((n) => entryFor('Restaurant', n)),
  ];
  const c = rollup(all);
  summaryEl.querySelector('#sum-red').textContent = c.red;
  summaryEl.querySelector('#sum-amber').textContent = c.amber;
  summaryEl.querySelector('#sum-green').textContent = c.green;
}

function renderMatrix() {
  root.innerHTML = [
    renderNamedSection('Public Areas', 'Public Area', PUBLIC_AREAS),
    renderNamedSection('Restaurants', 'Restaurant', RESTAURANTS),
    renderRooms(),
  ].join('');
}

function syncFilterUI() {
  chipsEl.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === activeFilter);
  });
  summaryEl.querySelectorAll('.exec-stat').forEach((s) => {
    s.classList.toggle('selected', s.dataset.filter === activeFilter && activeFilter !== 'all');
  });
}

function setFilter(f) {
  activeFilter = activeFilter === f && f !== 'all' ? 'all' : f;
  syncFilterUI();
  renderMatrix();
}

// ---------- modal ----------
function defectCardHTML(d) {
  const tags = `
    ${d.type ? `<span class="tag tag-type">${esc(d.type)}</span>` : ''}
    ${d.priority ? `<span class="tag tag-priority priority-${esc(d.priority.toLowerCase())}">${esc(d.priority)}</span>` : ''}`;

  let meta = `<div class="loc-defect-meta">Reported by ${esc(d.reported_by || '—')} · ${formatDate(d.created_at)}</div>`;
  if (d.status === 'Completed') {
    meta += `<div class="loc-defect-meta">Completed by ${esc(d.completed_by || '—')} · ${formatDate(d.completed_at)}</div>`;
  }
  const remark = d.remarks ? `<div class="loc-defect-remark">${esc(d.remarks)}</div>` : '';

  const thumbs = [];
  if (d.before_picture_url) thumbs.push(`<figure><img loading="lazy" src="${esc(d.before_picture_url)}" alt="Before"><figcaption>Before</figcaption></figure>`);
  if (d.after_picture_url) thumbs.push(`<figure><img loading="lazy" src="${esc(d.after_picture_url)}" alt="After"><figcaption>After</figcaption></figure>`);
  const thumbHTML = thumbs.length ? `<div class="loc-defect-thumbs">${thumbs.join('')}</div>` : '';

  return `<div class="loc-defect">
    <div class="loc-defect-top"><strong>${esc(d.title || 'Untitled defect')}</strong><span class="pill ${pillClass(d.status)}">${esc(d.status)}</span></div>
    <div class="loc-defect-tags">${tags}</div>
    ${meta}${remark}${thumbHTML}
  </div>`;
}

function sortBySeverity(a, b) {
  const pa = PRIORITY_ORDER[a.priority] ?? 9;
  const pb = PRIORITY_ORDER[b.priority] ?? 9;
  return pa - pb;
}

function timeOf(d) {
  const t = d.completed_at || d.created_at;
  if (!t) return 0;
  return (t.toDate ? t.toDate() : new Date(t)).getTime();
}

function openModal(area, name, trigger) {
  lastTrigger = trigger || null;
  const defects = (byLocation.get(keyFor(area, name)) || []).slice();
  const { status, open } = locationStatus(defects);

  const label = area === 'Rooms' ? `Room ${name}` : name;
  modalTitle.textContent = label;
  modalSub.innerHTML = `<span class="pill modal-status ${status}">${STATUS_LABELS[status]}</span> · ${area} · ${open} open · ${defects.length} total`;

  const openDefects = defects.filter((d) => d.status !== 'Completed').sort(sortBySeverity);
  const doneDefects = defects.filter((d) => d.status === 'Completed').sort((a, b) => timeOf(b) - timeOf(a));

  let body = '';
  if (defects.length === 0) {
    body = `<div class="modal-empty"><span class="big">✓</span>No defects recorded.<br>This location is all clear.</div>`;
  } else {
    if (openDefects.length) {
      body += `<div class="modal-group"><div class="modal-group-label">Open · ${openDefects.length}</div>${openDefects.map(defectCardHTML).join('')}</div>`;
    } else {
      body += `<div class="modal-empty" style="padding:18px 12px;">No open defects — all resolved.</div>`;
    }
    if (doneDefects.length) {
      body += `<div class="modal-group">
        <button type="button" class="btn btn-secondary modal-history-toggle">Show history (${doneDefects.length})</button>
        <div class="modal-history" hidden>${doneDefects.map(defectCardHTML).join('')}</div>
      </div>`;
    }
  }
  modalBody.innerHTML = body;

  const toggle = modalBody.querySelector('.modal-history-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const hist = modalBody.querySelector('.modal-history');
      const shown = !hist.hidden;
      hist.hidden = shown;
      toggle.textContent = shown ? `Show history (${doneDefects.length})` : `Hide history (${doneDefects.length})`;
    });
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  openModal(tile.dataset.area, tile.dataset.name, tile);
});

chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) setFilter(chip.dataset.filter);
});

summaryEl.addEventListener('click', (e) => {
  const stat = e.target.closest('.exec-stat');
  if (stat) setFilter(stat.dataset.filter);
});

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// ---------- data ----------
async function load() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  try {
    await authReady();
    const snap = await getDocs(collection(db, 'defects'));
    const map = new Map();
    snap.forEach((docSnap) => {
      const d = { id: docSnap.id, ...docSnap.data() };
      const k = keyFor(d.area, d.room_name);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    });
    byLocation = map;

    renderSummary();
    renderMatrix();
    if (updatedEl) {
      updatedEl.textContent = `updated ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
setInterval(load, 30000);
