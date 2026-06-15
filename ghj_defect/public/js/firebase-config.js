// Your Firebase web app config.
export const firebaseConfig = {
  apiKey: 'AIzaSyBDegSU5Q8yfN64Ql5DdOoAeLCeWC-HxLo',
  authDomain: 'ghjdefectapp.firebaseapp.com',
  projectId: 'ghjdefectapp',
  storageBucket: 'ghjdefectapp.firebasestorage.app',
  messagingSenderId: '1029272488695',
  appId: '1:1029272488695:web:ab593923f91b008a2ce1f2',
};

// Shared access code required to report a defect. Note: this is served to the
// browser, so it gates the UI rather than the database — it is not a secret.
// Server-side protection comes from Firebase auth + the Firestore rules.
export const ACCESS_CODE = 'Hyatt123';

export const SEGMENTS = ['Public Area', 'Rooms', 'Lobby', 'Kitchen'];
