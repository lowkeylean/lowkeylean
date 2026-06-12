import {
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset, showMsg } from './app.js';

const msg = document.getElementById('msg');
const AREAS = ['Rooms', 'Public Area', 'Restaurant'];

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

function formatDate(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

    // Per-area breakdown
    const counts = AREAS.map((a) => ({
      name: a,
      count: defects.filter((d) => d.area === a).length,
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

    // Completed defects list
    const completedDefects = defects.filter((d) => d.status === 'Completed').reverse();
    const completedWrap = document.getElementById('completed-list');
    if (completedDefects.length === 0) {
      completedWrap.innerHTML = '<p style="text-align: center; color: var(--text-3); padding: 20px;">No completed defects yet.</p>';
    } else {
      completedWrap.innerHTML = completedDefects.map((d) => `
        <div class="completed-defect">
          <div class="completed-header">
            <strong>${d.title}</strong>
            <span class="tag tag-priority priority-${(d.priority || 'low').toLowerCase()}">${d.priority || 'N/A'}</span>
          </div>
          <div class="completed-meta">
            <span><strong>Area:</strong> ${d.area} ${d.room_name ? '(' + d.room_name + ')' : ''}</span>
            <span><strong>Reported by:</strong> ${d.reported_by}</span>
            <span><strong>Completed by:</strong> ${d.completed_by || 'N/A'}</span>
          </div>
          <div class="completed-dates">
            <span class="date-item"><strong>Reported:</strong> ${formatDate(d.created_at)}</span>
            <span class="date-item"><strong>Completed:</strong> ${formatDate(d.completed_at)}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
setInterval(load, 20000);