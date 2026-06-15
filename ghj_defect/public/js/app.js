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

// Compress a photo client-side, then store it. Prefers Vercel Blob object
// storage; if that endpoint isn't reachable (e.g. not deployed on Vercel, or
// the Blob token isn't configured yet) it falls back to an inline base64 data
// URL so reporting never breaks. Both forms are valid <img src> values and
// satisfy the Firestore rules, so the app stays functional on any host.
//
// The image is sent as base64 inside a JSON body rather than as a raw binary
// stream: Vercel's Node runtime parses JSON bodies predictably, whereas a raw
// stream can be consumed before the function reads it, dropping the image.
export async function compressAndUpload(file) {
  const dataUrl = await compressImage(file);
  try {
    // Attach the visitor's Firebase ID token so the server can confirm the
    // upload comes from an authenticated session, not an anonymous script.
    const user = await authReady();
    const idToken = await user.getIdToken();
    const uploadRes = await fetch('/api/blob-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: dataUrl, filename: `defect-${Date.now()}.jpg` }),
    });
    if (uploadRes.ok) {
      const data = await uploadRes.json().catch(() => null);
      if (data && typeof data.url === 'string' && data.url) return data.url;
    }
  } catch (err) {
    console.warn('Blob upload unavailable, storing image inline.', err);
  }
  return dataUrl;
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
