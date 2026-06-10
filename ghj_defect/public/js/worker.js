const msg = document.getElementById('msg');
const list = document.getElementById('list');

function show(type, text) {
  msg.className = `msg ${type}`;
  msg.textContent = text;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function badgeClass(status) {
  return status.toLowerCase().replace(' ', '-');
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function renderDefect(d) {
  const el = document.createElement('article');
  el.className = 'defect';
  el.innerHTML = `
    <button type="button" class="defect-head">
      <span>
        #${d.id} · ${d.segment}
        <span class="meta">Reported ${formatDate(d.created_at)}</span>
      </span>
      <span class="badge ${badgeClass(d.status)}">${d.status}</span>
    </button>
    <div class="defect-body">
      <img class="before" src="${d.before_picture_url}" alt="Before photo for defect ${d.id}" loading="lazy" />
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

  const head = el.querySelector('.defect-head');
  head.addEventListener('click', async () => {
    const wasOpen = el.classList.contains('open');
    document.querySelectorAll('.defect.open').forEach((o) => o.classList.remove('open'));
    if (wasOpen) return;
    el.classList.add('open');

    // Selecting a task moves it to In Progress
    if (d.status === 'Reported') {
      const res = await fetch(`/api/defects/${d.id}/start`, { method: 'POST' });
      if (res.ok) {
        d.status = 'In Progress';
        const badge = el.querySelector('.badge');
        badge.textContent = 'In Progress';
        badge.className = 'badge in-progress';
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
    const formData = new FormData();
    formData.append('after', fileInput.files[0]);
    formData.append('remarks', e.target.remarks.value);

    btn.disabled = true;
    btn.textContent = 'Completing…';
    try {
      const res = await fetch(`/api/defects/${d.id}/complete`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete defect');
      show('ok', `Defect #${d.id} marked as completed. 🎉`);
      el.remove();
      if (!list.querySelector('.defect')) renderEmpty();
    } catch (err) {
      show('error', err.message);
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
  const res = await fetch('/api/defects?status=active');
  const defects = await res.json();
  list.innerHTML = '';
  if (defects.length === 0) return renderEmpty();
  defects.forEach((d) => list.appendChild(renderDefect(d)));
}

load();
