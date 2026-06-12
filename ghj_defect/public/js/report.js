import {
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, compressImage, configLooksUnset, showMsg, clearMsg } from './app.js';
import { ACCESS_CODE, SEGMENTS } from './firebase-config.js';

const msg = document.getElementById('msg');
const authCard = document.getElementById('auth-card');
const formCard = document.getElementById('form-card');
const codeInput = document.getElementById('access-code');
const segmentSelect = document.getElementById('segment');
const areaSelect = document.getElementById('area');
const titleInput = document.getElementById('title');
const typeGroup = document.getElementById('type-group');
const priorityGroup = document.getElementById('priority-group');
const capturePhotoInput = document.getElementById('capture-photo');
const galleryPhotoInput = document.getElementById('gallery-photo');
const photoPreviewContainer = document.getElementById('photo-preview-container');
const addDefectBtn = document.getElementById('add-defect-btn');
const defectsListContainer = document.getElementById('defects-list-container');
const defectsList = document.getElementById('defects-list');
const authBtn = document.getElementById('auth-btn');
const submitBtn = document.getElementById('submit-btn');
const form = document.getElementById('report-form');

// Areas for each segment (placeholders as requested)
const AREAS = {
  'Public Area': ['Entrance', 'Hallway', 'Stairs', 'Parking'],
  'Rooms': ['Room 1', 'Room 2', 'Room 3', 'Room 4'],
  'Lobby': ['Main Lobby', 'Side Area', 'Entrance Hall'],
  'Kitchen': ['Main Area', 'Pantry', 'Storage'],
};

let selectedType = null;
let selectedPriority = null;
let currentPhoto = null;
let defectsArray = [];

for (const s of SEGMENTS) {
  const opt = document.createElement('option');
  opt.value = s;
  opt.textContent = s;
  segmentSelect.appendChild(opt);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  btn.childNodes[btn.childNodes.length - 1].textContent = label;
}

function unlock() {
  authCard.hidden = true;
  formCard.hidden = false;
  clearMsg(msg);
}

// Segment & Area Selection
segmentSelect.addEventListener('change', () => {
  const segment = segmentSelect.value;
  areaSelect.value = '';
  areaSelect.innerHTML = '<option value="" disabled selected>Select after choosing segment</option>';

  if (segment && AREAS[segment]) {
    for (const area of AREAS[segment]) {
      const opt = document.createElement('option');
      opt.value = area;
      opt.textContent = area;
      areaSelect.appendChild(opt);
    }
  }
});

// Type Selection
typeGroup.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-select')) {
    typeGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    selectedType = e.target.dataset.value;
  }
});

// Priority Selection
priorityGroup.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-select')) {
    priorityGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    selectedPriority = e.target.dataset.value;
  }
});

// Photo Upload Handlers
function handlePhotoSelected(file) {
  if (file) {
    currentPhoto = file;
    photoPreviewContainer.innerHTML = `
      <div class="photo-preview-box">
        <img src="${URL.createObjectURL(file)}" alt="Photo preview" />
        <button type="button" class="btn-remove-photo" title="Remove photo">✕</button>
      </div>
    `;
    photoPreviewContainer.querySelector('.btn-remove-photo').addEventListener('click', (e) => {
      e.preventDefault();
      currentPhoto = null;
      photoPreviewContainer.innerHTML = '';
      capturePhotoInput.value = '';
      galleryPhotoInput.value = '';
    });
  }
}

capturePhotoInput.addEventListener('change', () => {
  if (capturePhotoInput.files[0]) {
    handlePhotoSelected(capturePhotoInput.files[0]);
  }
});

galleryPhotoInput.addEventListener('change', () => {
  if (galleryPhotoInput.files[0]) {
    handlePhotoSelected(galleryPhotoInput.files[0]);
  }
});

// Add Defect Handler
addDefectBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  // Validation
  if (!segmentSelect.value) {
    return showMsg(msg, 'error', 'Please select a segment.');
  }
  if (!areaSelect.value) {
    return showMsg(msg, 'error', 'Please select an area.');
  }
  if (!titleInput.value.trim()) {
    return showMsg(msg, 'error', 'Please enter a defect title.');
  }
  if (!selectedType) {
    return showMsg(msg, 'error', 'Please select a defect type.');
  }
  if (!selectedPriority) {
    return showMsg(msg, 'error', 'Please select a priority level.');
  }
  if (!currentPhoto) {
    return showMsg(msg, 'error', 'Please attach a photo.');
  }

  setLoading(addDefectBtn, true, 'Adding…');
  try {
    const photoData = await compressImage(currentPhoto);

    const defect = {
      segment: segmentSelect.value,
      area: areaSelect.value,
      title: titleInput.value.trim(),
      type: selectedType,
      priority: selectedPriority,
      photo: photoData,
    };

    defectsArray.push(defect);
    showMsg(msg, 'ok', 'Defect added to list.');

    // Reset form
    form.reset();
    segmentSelect.value = '';
    areaSelect.value = '';
    areaSelect.innerHTML = '<option value="" disabled selected>Select after choosing segment</option>';
    titleInput.value = '';
    selectedType = null;
    selectedPriority = null;
    currentPhoto = null;
    photoPreviewContainer.innerHTML = '';
    typeGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
    priorityGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
    capturePhotoInput.value = '';
    galleryPhotoInput.value = '';

    // Update defects list
    renderDefectsList();
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    setLoading(addDefectBtn, false, '+ Add defect');
  }
});

function renderDefectsList() {
  if (defectsArray.length === 0) {
    defectsListContainer.hidden = true;
    defectsList.innerHTML = '';
    return;
  }

  defectsListContainer.hidden = false;
  defectsList.innerHTML = defectsArray.map((d, idx) => `
    <div class="defect-entry">
      <div class="defect-header">
        <div class="defect-info">
          <strong>${d.title}</strong>
          <span class="defect-meta">${d.segment} · ${d.area}</span>
        </div>
        <button type="button" class="btn-remove-defect" data-index="${idx}" title="Remove">✕</button>
      </div>
      <div class="defect-tags">
        <span class="tag tag-type">${d.type}</span>
        <span class="tag tag-priority priority-${d.priority.toLowerCase()}">${d.priority}</span>
      </div>
    </div>
  `).join('');

  // Add remove handlers
  defectsList.querySelectorAll('.btn-remove-defect').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index);
      defectsArray.splice(idx, 1);
      renderDefectsList();
    });
  });
}

// Submit Form
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  if (defectsArray.length === 0) {
    return showMsg(msg, 'error', 'Please add at least one defect.');
  }

  setLoading(submitBtn, true, 'Submitting…');
  try {
    await authReady();

    for (const defect of defectsArray) {
      await addDoc(collection(db, 'defects'), {
        segment: defect.segment,
        area: defect.area,
        title: defect.title,
        type: defect.type,
        priority: defect.priority,
        status: 'Reported',
        before_picture_url: defect.photo,
        after_picture_url: null,
        remarks: null,
        created_at: serverTimestamp(),
      });
    }

    const count = defectsArray.length;
    showMsg(msg, 'ok', `${count} defect${count > 1 ? 's' : ''} reported successfully.`);
    defectsArray = [];
    renderDefectsList();
    form.reset();
    segmentSelect.value = '';
    areaSelect.value = '';
    areaSelect.innerHTML = '<option value="" disabled selected>Select after choosing segment</option>';
    selectedType = null;
    selectedPriority = null;
    currentPhoto = null;
    photoPreviewContainer.innerHTML = '';
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    setLoading(submitBtn, false, 'Submit all defects');
  }
});

// Auth Handler
authBtn.addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (!code) return showMsg(msg, 'error', 'Please enter the access code.');
  if (code !== ACCESS_CODE) return showMsg(msg, 'error', 'Invalid access code.');
  sessionStorage.setItem('accessCode', code);
  unlock();
});

codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') authBtn.click();
});

(function init() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  if (sessionStorage.getItem('accessCode') === ACCESS_CODE) unlock();
})();
