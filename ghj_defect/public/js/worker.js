import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, compressImage, configLooksUnset, showMsg } from './app.js';

const msg = document.getElementById('msg');
const list = document.getElementById('list');

function badgeClass(status) {
  return status.toLowerCase().replace(' ', '-');
}

function formatDate(ts) {
  if (!ts) return 'just now';
  return ts.toDate().toLocaleString();
}

function renderDefect(d) {
  const el = document.createElement('article');
  el.className = 'defect';
  el.innerHTML = `
    <button type="button" class="defect-head">
      <span>
        ${d.segment}
        <span class="meta">Reported ${formatDate(d.created_at)}</span>
      </span>
      <span class="badge ${badgeClass(d.status)}">${d.status}</span>
    </button>
    <div class="defect-body">
      <img class="before" alt="Before photo" loading="lazy" />
      <form>
        <div class="file-input">
          <label>After photo</label>
          <input type="file" name="after" accept="image/*" capture="environment" required />
          <img class="preview" alt="After photo preview" />
        </div>
        <label>Remarks</label>
        <textarea name="remarks" placeholder="Describe the fix…" required></textarea>
        <button type="submit" class="success">Mark as Completed</button>
      </form>
    </div>
  `;
  el.querySelector('img.before').src = d.before_picture_url;

  const head = el.querySelector('.defect-head');
  head.addEventListener('click', async () => {
    const wasOpen = el.classList.contains('open');
    document.querySelectorAll('.defect.open').forEach((o) => o.classList.remove('open'));
    if (wasOpen) return;
    el.classList.add('open');

    // Selecting a task moves it to In Progress
    if (d.status === 'Reported') {
      try {
        await updateDoc(doc(db, 'defects', d.id), { status: 'In Progress' });
        d.status = 'In Progress';
        const badge = el.querySelector('.badge');
        badge.textContent = 'In Progress';
        badge.className = 'badge in-progress';
      } catch (err) {
        showMsg(msg, 'error', err.message);
      }
    }
  });

  const fileInput = el.querySelector('input[type="file"]');
  const preview = el.querySelector('.preview');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  });

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const remarks = e.target.remarks.value.trim();
    if (fileInput.files.length !== 1) {
      return showMsg(msg, 'error', 'An after photo is required.');
    }
    if (!remarks) {
      return showMsg(msg, 'error', 'Remarks are required.');
    }

    btn.disabled = true;
    btn.textContent = 'Completing…';
    try {
      const afterPicture = await compressImage(fileInput.files[0]);
      await updateDoc(doc(db, 'defects', d.id), {
        status: 'Completed',
        after_picture_url: afterPicture,
        remarks,
      });
      showMsg(msg, 'ok', `Defect in ${d.segment} marked as completed. 🎉`);
      el.remove();
      if (!list.querySelector('.defect')) renderEmpty();
    } catch (err) {
      showMsg(msg, 'error', err.message);
      btn.disabled = false;
      btn.textContent = 'Mark as Completed';
    }
  });

  return el;
}

function renderEmpty() {
  list.innerHTML = '<p class="empty">No active defects. All clear! ✨</p>';
}

async function load() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet — edit public/js/firebase-config.js.');
    return;
  }
  try {
    await authReady();
    const snap = await getDocs(query(collection(db, 'defects'), orderBy('created_at', 'desc')));
    const active = snap.docs
      .map((s) => ({ id: s.id, ...s.data() }))
      .filter((d) => d.status !== 'Completed');
    list.innerHTML = '';
    if (active.length === 0) return renderEmpty();
    active.forEach((d) => list.appendChild(renderDefect(d)));
  } catch (err) {
    showMsg(msg, 'error', err.message);
  }
}

load();
