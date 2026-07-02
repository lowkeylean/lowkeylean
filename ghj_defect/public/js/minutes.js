import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset, showMsg, clearMsg } from './app.js';
import { ACCESS_CODE } from './firebase-config.js';

const msg = document.getElementById('msg');
const dateInput = document.getElementById('brief-date');
const dateLabel = document.getElementById('brief-date-label');
const prevBtn = document.getElementById('prev-day');
const nextBtn = document.getElementById('next-day');
const unlockCard = document.getElementById('unlock-card');
const codeInput = document.getElementById('access-code');
const unlockBtn = document.getElementById('unlock-btn');
const form = document.getElementById('brief-form');
const occupancyInput = document.getElementById('occupancy');
const arrivalInput = document.getElementById('est-arrival');
const departureInput = document.getElementById('est-departure');
const morningNotes = document.getElementById('morning-notes');
const eveningNotes = document.getElementById('evening-notes');
const morningSaved = document.getElementById('morning-saved');
const eveningSaved = document.getElementById('evening-saved');
const updatedByInput = document.getElementById('updated-by');
const saveBtn = document.getElementById('save-btn');
const lastSaved = document.getElementById('last-saved');

const EDIT_FIELDS = [occupancyInput, arrivalInput, departureInput, morningNotes, eveningNotes, updatedByInput];

let loadedFor = null; // the date string the form currently shows
let loadedData = {}; // that day's data as loaded, to detect what changed on save

// ---------- helpers ----------
function unlocked() {
  return sessionStorage.getItem('accessCode') === ACCESS_CODE;
}

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function prettyDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (dateStr === todayStr()) return `Today · ${label}`;
  if (dateStr === shiftDate(todayStr(), -1)) return `Yesterday · ${label}`;
  return label;
}

function formatTs(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function numOrNull(input) {
  const v = input.value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  const last = btn.childNodes[btn.childNodes.length - 1];
  if (last) last.textContent = label;
}

function syncLock() {
  const ok = unlocked();
  unlockCard.hidden = ok;
  EDIT_FIELDS.forEach((el) => { el.disabled = !ok; });
  saveBtn.hidden = !ok;
}

// ---------- load / render ----------
function fillForm(data) {
  occupancyInput.value = data.occupancy ?? '';
  arrivalInput.value = data.est_arrival ?? '';
  departureInput.value = data.est_departure ?? '';
  morningNotes.value = data.morning_notes ?? '';
  eveningNotes.value = data.evening_notes ?? '';
  morningSaved.textContent = data.morning_updated_at ? `saved ${formatTs(data.morning_updated_at)}` : '';
  eveningSaved.textContent = data.evening_updated_at ? `saved ${formatTs(data.evening_updated_at)}` : '';
  lastSaved.textContent = data.updated_at
    ? `Last saved ${formatTs(data.updated_at)}${data.updated_by ? ` by ${data.updated_by}` : ''}`
    : 'No minutes recorded for this day yet.';
  if (data.updated_by && !updatedByInput.value) updatedByInput.value = data.updated_by;
}

async function load(dateStr) {
  dateLabel.textContent = prettyDate(dateStr);
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  try {
    await authReady();
    const snap = await getDoc(doc(db, 'briefings', dateStr));
    // Ignore stale responses if the user has already navigated to another day
    if (dateInput.value !== dateStr) return;
    loadedData = snap.exists() ? snap.data() : {};
    fillForm(loadedData);
    loadedFor = dateStr;
    clearMsg(msg);
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

function go(dateStr) {
  dateInput.value = dateStr;
  load(dateStr);
}

// ---------- events ----------
dateInput.addEventListener('change', () => {
  if (dateInput.value) load(dateInput.value);
});
prevBtn.addEventListener('click', () => go(shiftDate(dateInput.value || todayStr(), -1)));
nextBtn.addEventListener('click', () => go(shiftDate(dateInput.value || todayStr(), 1)));

unlockBtn.addEventListener('click', () => {
  if (codeInput.value.trim() !== ACCESS_CODE) return showMsg(msg, 'error', 'Invalid access code.');
  sessionStorage.setItem('accessCode', codeInput.value.trim());
  clearMsg(msg);
  syncLock();
});
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); unlockBtn.click(); } });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  const dateStr = dateInput.value;
  if (!dateStr) return showMsg(msg, 'error', 'Pick a date first.');
  if (loadedFor !== dateStr) return showMsg(msg, 'error', 'Still loading this day — try again in a moment.');

  const occupancy = numOrNull(occupancyInput);
  if (occupancy != null && (occupancy < 0 || occupancy > 100)) {
    return showMsg(msg, 'error', 'Occupancy must be between 0 and 100.');
  }
  const estArrival = numOrNull(arrivalInput);
  const estDeparture = numOrNull(departureInput);
  if ((estArrival != null && estArrival < 0) || (estDeparture != null && estDeparture < 0)) {
    return showMsg(msg, 'error', 'Arrivals and departures cannot be negative.');
  }

  const update = {
    occupancy,
    est_arrival: estArrival,
    est_departure: estDeparture,
    morning_notes: morningNotes.value.trim() || null,
    evening_notes: eveningNotes.value.trim() || null,
    updated_by: updatedByInput.value.trim() || null,
    updated_at: serverTimestamp(),
  };
  // Stamp each briefing section only when its text actually changed, so the
  // "saved" time next to Morning/Evening reflects that meeting's update.
  if (update.morning_notes !== (loadedData.morning_notes ?? null)) {
    update.morning_updated_at = serverTimestamp();
  }
  if (update.evening_notes !== (loadedData.evening_notes ?? null)) {
    update.evening_updated_at = serverTimestamp();
  }

  setLoading(saveBtn, true, 'Saving…');
  try {
    await authReady();
    await setDoc(doc(db, 'briefings', dateStr), update, { merge: true });
    showMsg(msg, 'ok', 'Minutes saved.');
    await load(dateStr);
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    setLoading(saveBtn, false, 'Save minutes');
  }
});

// ---------- init ----------
syncLock();
go(todayStr());
