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
const fileInput = document.getElementById('before');
const preview = document.getElementById('before-preview');
const submitBtn = document.getElementById('submit-btn');

for (const s of SEGMENTS) {
  const opt = document.createElement('option');
  opt.value = s;
  opt.textContent = s;
  segmentSelect.appendChild(opt);
}

function unlock() {
  sessionStorage.setItem('accessCode', codeInput.value.trim() || sessionStorage.getItem('accessCode'));
  authCard.hidden = true;
  formCard.hidden = false;
  clearMsg(msg);
}

document.getElementById('auth-btn').addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (!code) return showMsg(msg, 'error', 'Please enter the access code.');
  if (code !== ACCESS_CODE) return showMsg(msg, 'error', 'Invalid access code.');
  unlock();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
});

document.getElementById('report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg(msg);

  if (fileInput.files.length !== 1) {
    return showMsg(msg, 'error', 'Exactly 1 before photo is required.');
  }
  if (!SEGMENTS.includes(segmentSelect.value)) {
    return showMsg(msg, 'error', 'Please select a segment.');
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  try {
    await authReady();
    const beforePicture = await compressImage(fileInput.files[0]);
    const ref = await addDoc(collection(db, 'defects'), {
      segment: segmentSelect.value,
      status: 'Reported',
      before_picture_url: beforePicture,
      after_picture_url: null,
      remarks: null,
      created_at: serverTimestamp(),
    });
    showMsg(msg, 'ok', `Defect reported successfully in ${segmentSelect.value}`);
    e.target.reset();
    preview.style.display = 'none';
  } catch (err) {
    showMsg(msg, 'error', err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Defect';
  }
});

(function init() {
  if (configLooksUnset()) {
    showMsg(msg, 'error', 'Firebase is not configured yet — edit public/js/firebase-config.js.');
    return;
  }
  if (sessionStorage.getItem('accessCode') === ACCESS_CODE) unlock();
})();
