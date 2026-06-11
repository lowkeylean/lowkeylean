import {
  collection,
  query,
  where,
  getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db, authReady, configLooksUnset } from './app.js';

async function load() {
  if (configLooksUnset()) {
    document.getElementById('total').textContent = '⚙️';
    document.getElementById('completed').textContent = '⚙️';
    document.getElementById('pct').textContent = 'Set up Firebase config';
    return;
  }
  await authReady();
  const defects = collection(db, 'defects');
  const [totalSnap, completedSnap] = await Promise.all([
    getCountFromServer(defects),
    getCountFromServer(query(defects, where('status', '==', 'Completed'))),
  ]);
  const total = totalSnap.data().count;
  const completed = completedSnap.data().count;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;

  document.getElementById('total').textContent = total;
  document.getElementById('completed').textContent = completed;
  document.getElementById('pct').textContent = `${pct}%`;
  document.getElementById('bar').style.width = `${Math.min(pct, 100)}%`;
}

load();
setInterval(load, 15000);
