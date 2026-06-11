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
      <figure class="photo-frame">
        <img class="before" alt="Before photo" loading="lazy" />
        <figcaption>Before</figcaption>
      </figure>
      <form>
        <label class="field-label">After photo</label>
        <label class="dropzone">
          <input type="file" name="after" accept="image/*" capture="environment" required />
          <span class="dz-icon">${CAMERA}</span>
          <span class="dz-title">Tap to capture photo</span>
          <span class="dz-hint">Evidence of the completed work</span>
          <img class="preview" alt="After photo preview" />
        </label>
        <label class="field-label">Remarks</label>
        <textarea name="remarks" placeholder="Describe the fix…" required></textarea>
        <button type="submit" class="btn green"><span class="spinner"></span><span class="text">Mark as completed</span></button>
      </form>
    </div>
  `;
  el.querySelector('.thumb').src = d.before_picture_url;
  el.querySelector('img.before').src = d.before_picture_url;
  el.querySelector('.info strong').textContent = d.segment;
  el.querySelector('.info .meta').textContent = `Reported ${formatDate(d.created_at)}`;

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

  const zone = el.querySelector('.dropzone');
  const fileInput = el.querySelector('input[type="file"]');
  const preview = el.querySelector('.preview');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      preview.src = URL.createObjectURL(file);
      zone.classList.add('has-photo');
      zone.querySelector('.dz-title').textContent = 'Photo attached — tap to retake';
    } else {
      zone.classList.remove('has-photo');
      zone.querySelector('.dz-title').textContent = 'Tap to capture photo';
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

    setLoading(btn, true, 'Completing…');
    try {
      const afterPicture = await compressImage(fileInput.files[0]);
      await updateDoc(doc(db, 'defects', d.id), {
        status: 'Completed',
        after_picture_url: afterPicture,
        remarks,
      });
      showMsg(msg, 'ok', `${d.segment} defect closed.`);
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
    active.forEach((d) => list.appendChild(renderDefect(d)));
  } catch (err) {
    list.innerHTML = '';
    showMsg(msg, 'error', err.message);
  }
}

load();
