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
const zone = document.getElementById('before-zone');
const fileInput = document.getElementById('before');
const preview = document.getElementById('before-preview');
const authBtn = document.getElementById('auth-btn');
const submitBtn = document.getElementById('submit-btn');

for (const s of SEGMENTS) {
  const opt = document.createElement('option');
  opt.value = s;
  opt.textContent = s;
  segmentSelect.appendChild(opt);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  // Last text node carries the label
  btn.childNodes[btn.childNodes.length - 1].textContent = label;
}

function unlock() {
  authCard.hidden = true;
  formCard.hidden = false;
  clearMsg(msg);
}

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

document.getElementById('report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  if (fileInput.files.length !== 1) {
    return showMsg(msg, 'error', 'A before photo is required.');
  }
  if (!SEGMENTS.includes(segmentSelect.value)) {
    return showMsg(msg, 'error', 'Please select a segment.');
  }

  setLoading(submitBtn, true, 'Submitting…');
  try {
    await authReady();
    const beforePicture = await compressImage(fileInput.files[0]);
    await addDoc(collection(db, 'defects'), {
      segment: segmentSelect.value,
      status: 'Reported',
      before_picture_url: beforePicture,
      after_picture_url: null,
      remarks: null,
      created_at: serverTimestamp(),
    });
    showMsg(msg, 'ok', `Defect reported in ${segmentSelect.value}.`);
    e.target.reset();
    zone.classList.remove('has-photo');
    zone.querySelector('.dz-title').textContent = 'Tap to capture photo';
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    setLoading(submitBtn, false, 'Submit defect');
  }
});

(function init() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet.');
    return;
  }
  if (sessionStorage.getItem('accessCode') === ACCESS_CODE) unlock();
})();
