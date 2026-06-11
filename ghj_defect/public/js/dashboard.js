import {
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset, showMsg } from './app.js';
import { SEGMENTS } from './firebase-config.js';

const msg = document.getElementById('msg');

function animateCount(el, target) {
  const start = performance.now();
  const duration = 700;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function load() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  try {
    await authReady();
    const snap = await getDocs(collection(db, 'defects'));
    const defects = snap.docs.map((s) => s.data());

    const total = defects.length;
    const completed = defects.filter((d) => d.status === 'Completed').length;
    const active = total - completed;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;

    animateCount(document.getElementById('total'), total);
    animateCount(document.getElementById('completed'), completed);
    animateCount(document.getElementById('active'), active);

    document.getElementById('pct').textContent = `${pct}%`;
    document.getElementById('ratio').textContent = `${completed} of ${total} resolved`;
    requestAnimationFrame(() => {
      document.getElementById('bar').style.width = `${Math.min(pct, 100)}%`;
    });

    // Per-segment breakdown
    const counts = SEGMENTS.map((s) => ({
      name: s,
      count: defects.filter((d) => d.segment === s).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    const wrap = document.getElementById('segments');
    wrap.innerHTML = '';
    for (const c of counts) {
      const row = document.createElement('div');
      row.className = 'seg-row';
      row.innerHTML = `
        <span class="name"></span>
        <span class="track"><span class="fill"></span></span>
        <span class="count"></span>
      `;
      row.querySelector('.name').textContent = c.name;
      row.querySelector('.count').textContent = c.count;
      wrap.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector('.fill').style.width = `${(c.count / max) * 100}%`;
      });
    }
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
setInterval(load, 20000);
