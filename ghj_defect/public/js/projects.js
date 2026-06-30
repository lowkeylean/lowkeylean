import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset, showMsg, clearMsg } from './app.js';
import { loadLocations, getLocationsByType } from './locations.js';
import { ACCESS_CODE } from './firebase-config.js';

const msg = document.getElementById('msg');
const root = document.getElementById('projects-root');
const chipsEl = document.getElementById('filter-chips');
const newBtn = document.getElementById('new-project-btn');

// New-project modal
const npModal = document.getElementById('np-modal');
const npClose = document.getElementById('np-close');
const npAuth = document.getElementById('np-auth');
const npCode = document.getElementById('np-code');
const npUnlock = document.getElementById('np-unlock');
const npForm = document.getElementById('np-form');
const npAreaGroup = document.getElementById('np-area-group');
const npLocSection = document.getElementById('np-loc-section');
const npLocLabel = document.getElementById('np-loc-label');
const npLoc = document.getElementById('np-loc');
const npLocOptions = document.getElementById('np-loc-options');
const npTitle = document.getElementById('np-title-input');
const npPic = document.getElementById('np-pic');
const npDepartment = document.getElementById('np-department');
const npPriorityGroup = document.getElementById('np-priority-group');
const npStart = document.getElementById('np-start');
const npTarget = document.getElementById('np-target');
const npScope = document.getElementById('np-scope');
const npSubmit = document.getElementById('np-submit');

// Detail / update modal
const pdModal = document.getElementById('pd-modal');
const pdTitle = document.getElementById('pd-title');
const pdSub = document.getElementById('pd-sub');
const pdBody = document.getElementById('pd-body');
const pdClose = document.getElementById('pd-close');

const STATUSES = ['Planned', 'In Progress', 'On Hold', 'Completed'];
const STATUS_RANK = { 'In Progress': 0, Planned: 1, 'On Hold': 2, Completed: 3 };
const PRIORITY_COLORS = {
  Low: { bg: 'rgba(46, 204, 142, 0.15)', color: '#2ecc8e', border: 'rgba(46, 204, 142, 0.4)' },
  Medium: { bg: 'rgba(245, 166, 35, 0.15)', color: '#f5a623', border: 'rgba(245, 166, 35, 0.4)' },
  High: { bg: 'rgba(84, 169, 255, 0.15)', color: '#54a9ff', border: 'rgba(84, 169, 255, 0.4)' },
  Critical: { bg: 'rgba(255, 92, 92, 0.15)', color: '#ff5c5c', border: 'rgba(255, 92, 92, 0.4)' },
};

let projects = [];
let activeFilter = 'all';
let lastTrigger = null;

// New-project form working state
let npArea = null;
let npPriority = null;
let npLocations = [];
let npValidNames = new Set();

// ---------- helpers ----------
function unlocked() {
  return sessionStorage.getItem('accessCode') === ACCESS_CODE;
}

// True while the new-project or detail modal is open. Used to pause the
// background refresh so it can't re-render the list out from under an open
// modal (which would detach the triggering card and break focus restore).
function modalOpen() {
  return !pdModal.hidden || !npModal.hidden;
}

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function pillClass(status) {
  return String(status || '').toLowerCase().replace(/\s+/g, '-');
}

function locLabel(p) {
  return p.area === 'Rooms' ? `Room ${p.room_name}` : p.room_name;
}

function formatDateStr(s) {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function isOverdue(p) {
  return p.target_date && p.status !== 'Completed' && p.target_date < todayStr();
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  const last = btn.childNodes[btn.childNodes.length - 1];
  if (last) last.textContent = label;
}

// ---------- list rendering ----------
function counts() {
  const c = { all: projects.length, Planned: 0, 'In Progress': 0, 'On Hold': 0, Completed: 0 };
  for (const p of projects) if (c[p.status] != null) c[p.status] += 1;
  return c;
}

function syncChips() {
  const c = counts();
  chipsEl.querySelectorAll('.chip').forEach((chip) => {
    const f = chip.dataset.filter;
    chip.classList.toggle('active', f === activeFilter);
    const n = c[f] ?? 0;
    const base = f === 'all' ? 'All' : f;
    chip.textContent = `${base} (${n})`;
  });
}

function projectCardHTML(p) {
  const overdue = isOverdue(p);
  const progress = Number(p.progress) || 0;
  const timeline = `${p.start_date ? formatDateStr(p.start_date) : 'No start'} → ${p.target_date ? formatDateStr(p.target_date) : 'No target'}`;
  const overdueBadge = overdue ? '<span class="overdue-badge">Overdue</span>' : '';
  return `<button type="button" class="project-card" data-id="${esc(p.id)}">
    <div class="project-card-top">
      <strong>${esc(p.title)}</strong>
      <span class="pill ${pillClass(p.status)}">${esc(p.status)}</span>
    </div>
    <div class="project-meta-line">
      <span class="project-loc">${esc(locLabel(p))} · ${esc(p.area)}</span>
      <span class="tag tag-priority priority-${esc(String(p.priority || '').toLowerCase())}">${esc(p.priority || '—')}</span>
    </div>
    <div class="project-meta-line project-sub">
      <span class="project-pic">PIC: ${esc(p.pic || '—')}</span>
      <span class="project-timeline ${overdue ? 'overdue' : ''}">${esc(timeline)} ${overdueBadge}</span>
    </div>
    <div class="project-progress">
      <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
      <span class="project-progress-pct">${progress}%</span>
    </div>
  </button>`;
}

function render() {
  syncChips();
  const filtered = projects
    .filter((p) => activeFilter === 'all' || p.status === activeFilter)
    .sort((a, b) => {
      const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (r !== 0) return r;
      const ta = a.target_date || '9999-99-99';
      const tb = b.target_date || '9999-99-99';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

  if (projects.length === 0) {
    root.innerHTML = `<div class="empty">
      <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h12"/></svg></span>
      <strong>No projects yet</strong>
      <span>Tap “New project” to plan your first one.</span>
    </div>`;
    return;
  }
  if (filtered.length === 0) {
    root.innerHTML = `<div class="empty"><strong>No ${esc(activeFilter)} projects</strong></div>`;
    return;
  }
  root.innerHTML = `<div class="project-list">${filtered.map(projectCardHTML).join('')}</div>`;
}

// ---------- detail / update modal ----------
function updateFormHTML(p) {
  const opts = STATUSES.map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s}</option>`).join('');
  return `<form id="pd-update-form" class="pd-update">
    <h4 class="pd-section-label">Update progress</h4>
    <label class="field-label" for="pd-status">Status</label>
    <select id="pd-status">${opts}</select>

    <label class="field-label" for="pd-progress">Progress: <span id="pd-progress-val">${Number(p.progress) || 0}%</span></label>
    <input type="range" id="pd-progress" min="0" max="100" step="5" value="${Number(p.progress) || 0}" />

    <label class="field-label" for="pd-target">Target date</label>
    <input type="date" id="pd-target" value="${esc(p.target_date || '')}" />

    <label class="field-label" for="pd-note">Latest update note</label>
    <textarea id="pd-note" placeholder="What changed since last time?"></textarea>

    <button type="submit" id="pd-save" class="btn"><span class="spinner"></span>Save update</button>
  </form>`;
}

function lockedUpdateHTML() {
  return `<div class="pd-update">
    <h4 class="pd-section-label">Update progress</h4>
    <p class="pd-locked-note">Enter the access code to update this project.</p>
    <label class="field-label" for="pd-code">Access code</label>
    <input type="password" id="pd-code" placeholder="Enter your access code" autocomplete="off" />
    <button type="button" id="pd-unlock" class="btn"><span class="spinner"></span>Unlock</button>
  </div>`;
}

function detailBodyHTML(p) {
  const overdue = isOverdue(p);
  const progress = Number(p.progress) || 0;
  const scope = p.scope
    ? `<div class="pd-scope">${esc(p.scope)}</div>`
    : '<div class="pd-scope pd-empty">No scope recorded.</div>';
  const lastUpdate = p.last_update
    ? `<div class="pd-last-update"><span class="pd-last-label">Latest note</span>${esc(p.last_update)}</div>`
    : '';
  const updateSection = unlocked() ? updateFormHTML(p) : lockedUpdateHTML();

  return `
    <div class="pd-grid">
      <div class="pd-cell"><span class="pd-k">Location</span><span class="pd-v">${esc(locLabel(p))} · ${esc(p.area)}</span></div>
      <div class="pd-cell"><span class="pd-k">PIC</span><span class="pd-v">${esc(p.pic || '—')}</span></div>
      <div class="pd-cell"><span class="pd-k">Priority</span><span class="pd-v">${esc(p.priority || '—')}</span></div>
      <div class="pd-cell"><span class="pd-k">Department</span><span class="pd-v">${esc(p.department || '—')}</span></div>
      <div class="pd-cell"><span class="pd-k">Start</span><span class="pd-v">${esc(formatDateStr(p.start_date))}</span></div>
      <div class="pd-cell"><span class="pd-k">Target</span><span class="pd-v ${overdue ? 'overdue' : ''}">${esc(formatDateStr(p.target_date))}${overdue ? ' · Overdue' : ''}</span></div>
    </div>

    <div class="project-progress pd-progress-row">
      <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
      <span class="project-progress-pct">${progress}%</span>
    </div>

    <h4 class="pd-section-label">Scope &amp; plan</h4>
    ${scope}
    ${lastUpdate}

    <div class="pd-meta">Created ${esc(formatTs(p.created_at))}${p.updated_at ? ` · Updated ${esc(formatTs(p.updated_at))}` : ''}</div>

    ${updateSection}
  `;
}

function openDetail(p, trigger) {
  lastTrigger = trigger || null;
  pdTitle.textContent = p.title;
  pdSub.innerHTML = `<span class="pill ${pillClass(p.status)}">${esc(p.status)}</span> · ${esc(locLabel(p))}`;
  pdBody.innerHTML = detailBodyHTML(p);
  wireDetail(p);
  pdModal.hidden = false;
  document.body.style.overflow = 'hidden';
  pdClose.focus();
}

function wireDetail(p) {
  const range = pdBody.querySelector('#pd-progress');
  if (range) {
    const val = pdBody.querySelector('#pd-progress-val');
    range.addEventListener('input', () => { val.textContent = `${range.value}%`; });
  }

  const unlockBtn = pdBody.querySelector('#pd-unlock');
  if (unlockBtn) {
    const codeInput = pdBody.querySelector('#pd-code');
    const tryUnlock = () => {
      if (codeInput.value.trim() !== ACCESS_CODE) {
        return showMsg(msg, 'error', 'Invalid access code.');
      }
      sessionStorage.setItem('accessCode', codeInput.value.trim());
      clearMsg(msg);
      pdBody.innerHTML = detailBodyHTML(p);
      wireDetail(p);
    };
    unlockBtn.addEventListener('click', tryUnlock);
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  }

  const form = pdBody.querySelector('#pd-update-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = pdBody.querySelector('#pd-status').value;
      let progress = parseInt(pdBody.querySelector('#pd-progress').value, 10) || 0;
      if (status === 'Completed') progress = 100;
      const target = pdBody.querySelector('#pd-target').value || null;
      const note = pdBody.querySelector('#pd-note').value.trim() || null;
      const saveBtn = pdBody.querySelector('#pd-save');

      setLoading(saveBtn, true, 'Saving…');
      try {
        await authReady();
        const update = {
          status,
          progress,
          target_date: target,
          updated_at: serverTimestamp(),
        };
        // Only touch last_update when the user actually wrote a note, so a
        // blank note can't overwrite a newer note with this modal's snapshot.
        if (note) update.last_update = note;
        await updateDoc(doc(db, 'projects', p.id), update);
        showMsg(msg, 'ok', 'Project updated.');
        closeDetail();
        await load();
      } catch (err) {
        showMsg(msg, 'error', err.message);
        setLoading(saveBtn, false, 'Save update');
      }
    });
  }
}

function closeDetail() {
  pdModal.hidden = true;
  document.body.style.overflow = '';
  if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
}

// ---------- new-project modal ----------
function syncNpAuth() {
  const ok = unlocked();
  npAuth.hidden = ok;
  npForm.hidden = !ok;
}

function openNew() {
  clearMsg(msg);
  syncNpAuth();
  npModal.hidden = false;
  document.body.style.overflow = 'hidden';
  (unlocked() ? npTitle : npCode).focus();
}

function closeNew() {
  npModal.hidden = true;
  document.body.style.overflow = '';
}

function renderNpOptions(filter = '') {
  const f = filter.trim().toLowerCase();
  const matches = npLocations
    .filter((o) => !f || o.name.toLowerCase().includes(f) || o.display.toLowerCase().includes(f))
    .slice(0, 60);
  npLocOptions.innerHTML = matches.length === 0
    ? '<div class="combo-empty">No matches</div>'
    : matches.map((o) => `<div class="combo-option" data-name="${esc(o.name)}">${esc(o.display)}</div>`).join('');
  npLocOptions.hidden = false;
}

function resetNpForm() {
  npForm.reset();
  npArea = null;
  npPriority = null;
  npLocations = [];
  npValidNames = new Set();
  npLocSection.hidden = true;
  npLocOptions.hidden = true;
  npAreaGroup.querySelectorAll('.btn-select').forEach((b) => b.classList.remove('active'));
  npPriorityGroup.querySelectorAll('.btn-select').forEach((b) => {
    b.classList.remove('active');
    b.style.cssText = '';
  });
}

// ---------- events ----------
chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  activeFilter = chip.dataset.filter;
  render();
});

root.addEventListener('click', (e) => {
  const card = e.target.closest('.project-card');
  if (!card) return;
  const p = projects.find((x) => x.id === card.dataset.id);
  if (p) openDetail(p, card);
});

newBtn.addEventListener('click', openNew);
npClose.addEventListener('click', closeNew);
npModal.addEventListener('click', (e) => { if (e.target === npModal) closeNew(); });
pdClose.addEventListener('click', closeDetail);
pdModal.addEventListener('click', (e) => { if (e.target === pdModal) closeDetail(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!pdModal.hidden) closeDetail();
  else if (!npModal.hidden) closeNew();
});

npUnlock.addEventListener('click', () => {
  if (npCode.value.trim() !== ACCESS_CODE) return showMsg(msg, 'error', 'Invalid access code.');
  sessionStorage.setItem('accessCode', npCode.value.trim());
  clearMsg(msg);
  syncNpAuth();
  npTitle.focus();
});
npCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') npUnlock.click(); });

npAreaGroup.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-select');
  if (!btn) return;
  npAreaGroup.querySelectorAll('.btn-select').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  npArea = btn.dataset.value;

  const isRooms = npArea === 'Rooms';
  npLocLabel.textContent = isRooms ? 'Room No.' : 'Name';
  npLoc.placeholder = isRooms ? 'Type a room number…' : 'Type to search…';
  npLocSection.hidden = false;

  await loadLocations();
  npLocations = getLocationsByType(npArea);
  npValidNames = new Set(npLocations.map((l) => l.name));
  npLoc.value = '';
  npLocOptions.hidden = true;
});

npLoc.addEventListener('focus', () => renderNpOptions(npLoc.value));
npLoc.addEventListener('input', () => renderNpOptions(npLoc.value));
npLoc.addEventListener('blur', () => { setTimeout(() => { npLocOptions.hidden = true; }, 150); });
npLocOptions.addEventListener('pointerdown', (e) => {
  const opt = e.target.closest('.combo-option');
  if (!opt) return;
  e.preventDefault();
  npLoc.value = opt.dataset.name;
  npLocOptions.hidden = true;
});

npPriorityGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-select');
  if (!btn) return;
  npPriorityGroup.querySelectorAll('.btn-select').forEach((b) => {
    b.classList.remove('active');
    b.style.cssText = '';
  });
  btn.classList.add('active');
  npPriority = btn.dataset.value;
  const c = PRIORITY_COLORS[npPriority];
  if (c) {
    btn.style.backgroundColor = c.bg;
    btn.style.color = c.color;
    btn.style.borderColor = c.border;
  }
});

npForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  if (!npArea) return showMsg(msg, 'error', 'Please select an area.');
  if (!npValidNames.has(npLoc.value.trim())) {
    return showMsg(msg, 'error', `Please select a valid ${npArea === 'Rooms' ? 'room' : 'location'} from the list.`);
  }
  if (!npTitle.value.trim()) return showMsg(msg, 'error', 'Please enter a project title.');
  if (!npPic.value.trim()) return showMsg(msg, 'error', 'Please enter the person in charge.');
  if (!npPriority) return showMsg(msg, 'error', 'Please select a priority.');
  if (npStart.value && npTarget.value && npTarget.value < npStart.value) {
    return showMsg(msg, 'error', 'Target date cannot be before the start date.');
  }

  setLoading(npSubmit, true, 'Creating…');
  try {
    await authReady();
    await addDoc(collection(db, 'projects'), {
      area: npArea,
      room_name: npLoc.value.trim(),
      title: npTitle.value.trim(),
      pic: npPic.value.trim(),
      department: npDepartment.value || null,
      priority: npPriority,
      status: 'Planned',
      progress: 0,
      start_date: npStart.value || null,
      target_date: npTarget.value || null,
      scope: npScope.value.trim() || null,
      last_update: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    showMsg(msg, 'ok', 'Project created.');
    resetNpForm();
    closeNew();
    await load();
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    setLoading(npSubmit, false, 'Create project');
  }
});

// ---------- data ----------
async function load() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  try {
    await authReady();
    const snap = await getDocs(collection(db, 'projects'));
    projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
// Pause the periodic refresh while a modal is open, so it never re-renders
// the list under the user's feet (preserves the card node + focus, and keeps
// the open update form consistent with what they're editing).
setInterval(() => { if (!modalOpen()) load(); }, 30000);
