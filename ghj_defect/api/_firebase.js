const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const adminDb = () => admin.firestore();

module.exports = { initAdmin, adminDb };
