const msg = document.getElementById('msg');
const authCard = document.getElementById('auth-card');
const formCard = document.getElementById('form-card');
const codeInput = document.getElementById('access-code');
const segmentSelect = document.getElementById('segment');
const fileInput = document.getElementById('before');
const preview = document.getElementById('before-preview');
const submitBtn = document.getElementById('submit-btn');

function show(type, text) {
  msg.className = `msg ${type}`;
  msg.textContent = text;
}

function clearMsg() {
  msg.className = 'msg';
  msg.textContent = '';
}

function accessCode() {
  return sessionStorage.getItem('accessCode') || '';
}

async function loadSegments() {
  const res = await fetch('/api/segments');
  const segments = await res.json();
  for (const s of segments) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    segmentSelect.appendChild(opt);
  }
}

async function tryUnlock(code) {
  const res = await fetch('/api/auth/check', {
    method: 'POST',
    headers: { 'x-access-code': code },
  });
  if (res.ok) {
    sessionStorage.setItem('accessCode', code);
    authCard.hidden = true;
    formCard.hidden = false;
    clearMsg();
    return true;
  }
  return false;
}

document.getElementById('auth-btn').addEventListener('click', async () => {
  const code = codeInput.value.trim();
  if (!code) return show('error', 'Please enter the access code.');
  if (!(await tryUnlock(code))) show('error', 'Invalid access code.');
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
  clearMsg();

  if (fileInput.files.length !== 1) {
    return show('error', 'Exactly 1 before photo is required.');
  }

  const formData = new FormData();
  formData.append('segment', segmentSelect.value);
  formData.append('before', fileInput.files[0]);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/defects', {
      method: 'POST',
      headers: { 'x-access-code': accessCode() },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit defect');
    show('ok', `Defect #${data.id} reported in ${data.segment}.`);
    e.target.reset();
    preview.style.display = 'none';
  } catch (err) {
    show('error', err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Defect';
  }
});

(async function init() {
  await loadSegments();
  const saved = accessCode();
  if (saved && (await tryUnlock(saved))) return;
  sessionStorage.removeItem('accessCode');
})();
