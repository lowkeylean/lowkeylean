async function load() {
  const res = await fetch('/api/metrics');
  const m = await res.json();
  document.getElementById('total').textContent = m.totalReported;
  document.getElementById('completed').textContent = m.totalCompleted;
  document.getElementById('pct').textContent = `${m.completionPct}%`;
  document.getElementById('bar').style.width = `${Math.min(m.completionPct, 100)}%`;
}

load();
setInterval(load, 15000);
