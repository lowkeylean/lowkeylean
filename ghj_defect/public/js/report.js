import {
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, compressAndUpload, configLooksUnset, showMsg, clearMsg } from './app.js';
import { ACCESS_CODE } from './firebase-config.js';

const msg = document.getElementById('msg');
const authCard = document.getElementById('auth-card');
const formCard = document.getElementById('form-card');
const codeInput = document.getElementById('access-code');
const areaGroup = document.getElementById('area-group');
const roomNameSection = document.getElementById('room-name-section');
const roomNameLabel = document.getElementById('room-name-label');
const roomNameInput = document.getElementById('room-name');
const reportedByInput = document.getElementById('reported-by');
const departmentSelect = document.getElementById('department');
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
const areaSection = document.getElementById('area-section');

let selectedArea = null;
let selectedType = null;
let selectedPriority = null;
let currentPhoto = null;
let defectsArray = [];
let reportingInfo = {
  area: null,
  roomName: null,
  reportedBy: null,
  department: null,
};

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

// Area Selection
areaGroup.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-select')) {
    areaGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    selectedArea = e.target.dataset.value;

    // Update Room No. / Name label and placeholder
    const isRooms = selectedArea === 'Rooms';
    roomNameLabel.textContent = isRooms ? 'Room No.' : 'Name';
    roomNameInput.placeholder = isRooms ? 'e.g., 101' : 'e.g., Main Lobby';
    roomNameSection.hidden = false;
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

// Priority Selection with color coding
priorityGroup.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-select')) {
    priorityGroup.querySelectorAll('.btn-select').forEach(btn => {
      btn.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });
    e.target.classList.add('active');
    selectedPriority = e.target.dataset.value;

    // Color code priority buttons
    const colors = {
      Low: { bg: 'rgba(46, 204, 142, 0.15)', color: '#2ecc8e', border: 'rgba(46, 204, 142, 0.4)' },
      Medium: { bg: 'rgba(245, 166, 35, 0.15)', color: '#f5a623', border: 'rgba(245, 166, 35, 0.4)' },
      High: { bg: 'rgba(84, 169, 255, 0.15)', color: '#54a9ff', border: 'rgba(84, 169, 255, 0.4)' },
      Critical: { bg: 'rgba(255, 92, 92, 0.15)', color: '#ff5c5c', border: 'rgba(255, 92, 92, 0.4)' },
    };
    const scheme = colors[selectedPriority];
    e.target.style.backgroundColor = scheme.bg;
    e.target.style.color = scheme.color;
    e.target.style.borderColor = scheme.border;
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

  // Validation for first defect
  if (defectsArray.length === 0) {
    if (!selectedArea) {
      return showMsg(msg, 'error', 'Please select an area.');
    }
    if (!roomNameInput.value.trim()) {
      return showMsg(msg, 'error', `Please enter ${selectedArea === 'Rooms' ? 'room no.' : 'name'}.`);
    }
    if (!reportedByInput.value.trim()) {
      return showMsg(msg, 'error', 'Please enter reported by name.');
    }
    if (!departmentSelect.value) {
      return showMsg(msg, 'error', 'Please select a department.');
    }
    // Save reporting info for subsequent defects
    reportingInfo = {
      area: selectedArea,
      roomName: roomNameInput.value.trim(),
      reportedBy: reportedByInput.value.trim(),
      department: departmentSelect.value,
    };
  }

  // Validation for all defects
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
    const photoData = await compressAndUpload(currentPhoto);

    const defect = {
      area: reportingInfo.area,
      roomName: reportingInfo.roomName,
      reportedBy: reportingInfo.reportedBy,
      department: reportingInfo.department,
      title: titleInput.value.trim(),
      type: selectedType,
      priority: selectedPriority,
      photo: photoData,
    };

    defectsArray.push(defect);
    showMsg(msg, 'ok', 'Defect added to list.');

    // Reset defect-specific fields for next defect
    titleInput.value = '';
    selectedType = null;
    selectedPriority = null;
    currentPhoto = null;
    photoPreviewContainer.innerHTML = '';
    typeGroup.querySelectorAll('.btn-select').forEach(btn => {
      btn.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });
    priorityGroup.querySelectorAll('.btn-select').forEach(btn => {
      btn.classList.remove('active');
      btn.style.borderColor = '';
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });
    capturePhotoInput.value = '';
    galleryPhotoInput.value = '';

    // Hide area/reporting section after first defect
    if (defectsArray.length === 1) {
      areaSection.hidden = true;
    }

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
    submitBtn.hidden = true;
    return;
  }

  defectsListContainer.hidden = false;
  submitBtn.hidden = false;
  defectsList.innerHTML = defectsArray.map((d, idx) => `
    <div class="defect-entry">
      <div class="defect-header">
        <div class="defect-info">
          <strong>${d.title}</strong>
          <span class="defect-meta">${d.area} ${d.roomName ? '(' + d.roomName + ')' : ''} · ${d.reportedBy}</span>
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
      if (defectsArray.length === 0) {
        areaSection.hidden = false;
      }
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
        area: defect.area,
        room_name: defect.roomName,
        reported_by: defect.reportedBy,
        department: defect.department,
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
    reportingInfo = { area: null, roomName: null, reportedBy: null, department: null };
    renderDefectsList();
    form.reset();
    areaSection.hidden = false;
    selectedArea = null;
    selectedType = null;
    selectedPriority = null;
    currentPhoto = null;
    photoPreviewContainer.innerHTML = '';
    areaGroup.querySelectorAll('.btn-select').forEach(btn => btn.classList.remove('active'));
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