import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, compressAndUpload, configLooksUnset, showMsg } from './app.js';

const msg = document.getElementById('msg');
const list = document.getElementById('list');
const workerNameInput = document.getElementById('worker-name');

const AREAS = ['Rooms', 'Public Area', 'Restaurant'];
const CHEVRON =
  '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const CAMERA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

function pillClass(status) {
  return status.toLowerCase().replace(' ', '-');
}

function formatDate(ts) {
  if (!ts) return 'just now';
  return ts.toDate().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  btn.querySelector('.text').textContent = label;
}

function renderDefect(d) {
  const el = document.createElement('article');
  el.className = 'defect';
  el.innerHTML = `
    <button type="button" class="defect-head">
      <img class="thumb" alt="" />
      <span class="info">
        <strong></strong>
        <span class="meta"></span>
      </span>
      <span class="pill ${pillClass(d.status)}">${d.status}</span>
      ${CHEVRON}
    </button>
    <div class="defect-body">
      <div style="margin-bottom: 12px;">
        <div style="font-size: 0.75rem; color: var(--text-2); margin-bottom: 8px;">
          <strong style="color: var(--text);">${d.title || d.area}</strong> · ${d.room_name || d.area} · Reported by ${d.reported_by}
        </div>
        ${d.priority ? `<span class="tag tag-priority priority-${d.priority.toLowerCase()}">${d.priority}</span>` : ''}
      </div>
      <figure class="photo-frame">
        <img class="before" alt="Before photo" loading="lazy" />
        <figcaption>Before</figcaption>
      </figure>
      <form>
        <label class="field-label">After photo</label>
        <div class="photo-upload-container">
          <label class="photo-btn photo-capture">
            <input type="file" name="after-capture" accept="image/*" capture="environment" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>Take photo</span>
          </label>
          <label class="photo-btn photo-gallery">
            <input type="file" name="after-gallery" accept="image/*" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><rect x="7" y="7" width="4" height="4"/><path d="M7 11l4-4 5 5 4-4"/></svg>
            <span>Gallery</span>
          </label>
        </div>
        <div class="photo-preview-box" style="display: none;">
          <img class="preview" alt="After photo preview" />
        </div>
        <label class="field-label">Remarks</label>
        <textarea name="remarks" placeholder="Describe the fix…" required></textarea>
        <button type="submit" class="btn green"><span class="spinner"></span><span class="text">Mark as completed</span></button>
      </form>
    </div>
  `;
  if (d.before_picture_url) {
    el.querySelector('.thumb').src = d.before_picture_url;
    el.querySelector('img.before').src = d.before_picture_url;
  }
  el.querySelector('.info strong').textContent = d.title || d.area;
  el.querySelector('.info .meta').textContent = `${d.room_name || d.area} · Reported ${formatDate(d.created_at)}`;

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
        const pill = el.querySelector('.pill');
        pill.textContent = 'In Progress';
        pill.className = 'pill in-progress';
      } catch (err) {
        showMsg(msg, 'error', err.message);
      }
    }
  });

  const captureInput = el.querySelector('input[name="after-capture"]');
  const galleryInput = el.querySelector('input[name="after-gallery"]');
  const previewBox = el.querySelector('.photo-preview-box');
  const previewImg = el.querySelector('.preview');
  let selectedPhoto = null;

  function handlePhotoSelected(file) {
    if (file) {
      selectedPhoto = file;
      previewImg.src = URL.createObjectURL(file);
      previewBox.style.display = 'block';
    }
  }

  captureInput.addEventListener('change', () => {
    if (captureInput.files[0]) {
      galleryInput.value = '';
      handlePhotoSelected(captureInput.files[0]);
    }
  });

  galleryInput.addEventListener('change', () => {
    if (galleryInput.files[0]) {
      captureInput.value = '';
      handlePhotoSelected(galleryInput.files[0]);
    }
  });

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const remarks = e.target.remarks.value.trim();
    const workerName = workerNameInput.value.trim();

    if (!selectedPhoto) {
      return showMsg(msg, 'error', 'An after photo is required.');
    }
    if (!remarks) {
      return showMsg(msg, 'error', 'Remarks are required.');
    }
    if (!workerName) {
      return showMsg(msg, 'error', 'Please enter your name.');
    }

    setLoading(btn, true, 'Completing…');
    try {
      const afterPicture = await compressAndUpload(selectedPhoto);
      const now = new Date();
      await updateDoc(doc(db, 'defects', d.id), {
        status: 'Completed',
        after_picture_url: afterPicture,
        remarks,
        completed_by: workerName,
        completed_at: now,
      });
      showMsg(msg, 'ok', `Task completed by ${workerName}`);
      el.remove();
      if (!list.querySelector('.defect')) renderEmpty();
    } catch (err) {
      showMsg(msg, 'error', err.message);
      setLoading(btn, false, 'Mark as completed');
    }
  });

  return el;
}

function renderEmpty() {
  list.innerHTML = `
    <div class="empty">
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </span>
      <strong>Queue is clear</strong>
      <span>No active defects right now.</span>
    </div>
  `;
}

async function load() {
  if (configLooksUnset()) {
    list.innerHTML = '';
    showMsg(msg, 'error', 'Firebase is not configured yet.');
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

    // Group by area
    const grouped = {};
    for (const area of AREAS) {
      grouped[area] = active.filter((d) => d.area === area);
    }

    // Render sections for each area
    for (const area of AREAS) {
      const defectsInArea = grouped[area];
      if (defectsInArea.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'area-section';
      section.innerHTML = `<h2 class="area-header">${area}</h2>`;
      defectsInArea.forEach((d) => section.appendChild(renderDefect(d)));
      list.appendChild(section);
    }
  } catch (err) {
    list.innerHTML = '';
    showMsg(msg, 'error', err.message);
  }
}

load();
setInterval(load, 20000);