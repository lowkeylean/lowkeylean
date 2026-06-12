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

function isToday(date) {
  if (!date) return false;
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
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

    // Count today's reports and completions
    const reportedToday = defects.filter((d) => isToday(d.created_at)).length;
    const completedToday = defects.filter((d) => d.status === 'Completed' && isToday(d.completed_at)).length;

    animateCount(document.getElementById('total'), total);
    animateCount(document.getElementById('completed'), completed);
    animateCount(document.getElementById('active'), active);

    // Show today's counts
    document.getElementById('total-today').textContent = reportedToday > 0 ? `(+${reportedToday} today)` : '';
    document.getElementById('completed-today').textContent = completedToday > 0 ? `(+${completedToday} today)` : '';

    document.getElementById('pct').textContent = `${pct}%`;
    document.getElementById('ratio').textContent = `${completed} of ${total} resolved`;
    requestAnimationFrame(() => {
      document.getElementById('bar').style.width = `${Math.min(pct, 100)}%`;
    });

    // Combined area breakdown with expandable completed defects
    const wrap = document.getElementById('segments');
    wrap.innerHTML = '';

    for (const area of AREAS) {
      const defectsInArea = defects.filter((d) => d.area === area);
      const completedInArea = defectsInArea.filter((d) => d.status === 'Completed');
      const reportedInArea = defectsInArea.filter((d) => d.status !== 'Completed');

      const areaDiv = document.createElement('div');
      areaDiv.className = 'area-section-dashboard';
      areaDiv.innerHTML = `
        <div class="area-summary">
          <div class="area-info">
            <span class="area-name">${area}</span>
            <span class="area-counts">Reported: ${reportedInArea.length} | Completed: ${completedInArea.length}</span>
          </div>
          <button type="button" class="btn-toggle-completed" data-area="${area}">
            Show completed (${completedInArea.length})
          </button>
        </div>
        <div class="completed-defects-list" style="display: none;">
          ${completedInArea.length === 0
            ? '<p style="text-align: center; color: var(--text-3); padding: 10px;">No completed defects in this area.</p>'
            : completedInArea.map((d) => `
              <div class="completed-defect-mini">
                <strong>${d.title}</strong>
                <span class="tag tag-priority priority-${(d.priority || 'low').toLowerCase()}">${d.priority || 'N/A'}</span>
                <div style="font-size: 0.7rem; color: var(--text-3); margin-top: 4px;">
                  Reported by ${d.reported_by} | Completed by ${d.completed_by || 'N/A'}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-3); margin-top: 2px;">
                  ${formatDate(d.created_at)} → ${formatDate(d.completed_at)}
                </div>
              </div>
            `).join('')
          }
        </div>
      `;

      // Add toggle handler
      const toggleBtn = areaDiv.querySelector('.btn-toggle-completed');
      const listDiv = areaDiv.querySelector('.completed-defects-list');
      toggleBtn.addEventListener('click', () => {
        const isVisible = listDiv.style.display !== 'none';
        listDiv.style.display = isVisible ? 'none' : 'block';
        toggleBtn.textContent = isVisible
          ? `Show completed (${completedInArea.length})`
          : `Hide completed (${completedInArea.length})`;
      });

      wrap.appendChild(areaDiv);
    }
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
setInterval(load, 20000);