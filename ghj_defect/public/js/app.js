// Shared Firebase setup + helpers used by all pages.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getFirestore,
  connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// When served by `firebase emulators:start`, talk to the local emulators
// instead of production.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}

// Every visitor gets an anonymous Firebase session so Firestore rules can
// require auth without users ever seeing a login screen.
export function authReady() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
      else signInAnonymously(auth).catch(reject);
    });
  });
}

export function configLooksUnset() {
  return firebaseConfig.apiKey === 'YOUR_API_KEY';
}

// Compress a photo client-side and upload to Vercel Blob. Returns the public URL.
export async function compressAndUpload(file) {
  const dataUrl = await compressImage(file);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const uploadRes = await fetch('/api/blob-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'x-filename': `defect-${Date.now()}.jpg`,
    },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error('Image upload failed');
  const { url } = await uploadRes.json();
  return url;
}

async function compressImage(file, maxDim = 1024, quality = 0.7) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 900_000) {
    return compressImage(file, Math.round(maxDim * 0.6), 0.55);
  }
  return dataUrl;
}

export function showMsg(el, type, text) {
  el.className = `msg ${type}`;
  el.textContent = text;
}

export function clearMsg(el) {
  el.className = 'msg';
  el.textContent = '';
}
