# Deploying GHJ Defect Manager to Firebase

Total time: ~10 minutes. Everything fits in Firebase's free (Spark) plan —
no credit card needed.

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and click **Add project**.
2. Name it (e.g. `ghj-defect`), disable Google Analytics (not needed),
   and create it.

## 2. Enable the services

In the Firebase console for your new project:

1. **Firestore**: Build → Firestore Database → **Create database** →
   choose a location near you → start in **production mode** (our
   `firestore.rules` file will be deployed in step 5).
2. **Anonymous Auth**: Build → Authentication → Get started →
   Sign-in method → **Anonymous** → Enable. (Users never see a login
   screen; this just lets security rules require a session.)

## 3. Get your web app config

1. Project settings (gear icon) → **Your apps** → **</>** (Web).
2. Register the app (any nickname, skip hosting setup here).
3. Copy the `firebaseConfig` object it shows you.
4. Paste the values into `public/js/firebase-config.js`, replacing the
   `YOUR_*` placeholders. You can also change the reporter `ACCESS_CODE`
   here (default `1234`).

## 4. Install the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

Then point this folder at your project (replace with your real project ID,
shown in Project settings):

```bash
firebase use --add        # pick your project, alias "default"
```

(or edit `.firebaserc` and replace `demo-ghj-defect` — that placeholder is a
special emulator-only project ID that makes `firebase emulators:start` work
without any setup.)

## 5. Deploy

```bash
firebase deploy
```

That single command deploys the security rules and the website. The CLI
prints your live URL, e.g. `https://ghj-defect.web.app`.

## 6. Install on phones (Chrome)

1. Open the URL in Chrome on the phone.
2. Chrome menu (⋮) → **Add to Home screen** / **Install app**.
3. The app now launches full-screen from its own icon, like a native app.

Share the URL + access code with reporters; workers and the dashboard
need only the URL.

## Notes & limits

- **Photos** are compressed in the browser (max 1024px JPEG) and stored
  inside Firestore documents, keeping the app on the free plan
  (Firebase Storage requires a billing account for new projects).
  Free quota: 1 GiB storage, 50k reads / 20k writes per day — plenty
  for a small operation.
- **Access code** gates the report form in the client and is meant to
  deter casual misuse, not determined attackers. If you later need real
  accounts, swap anonymous auth for email/Google sign-in and tighten
  `firestore.rules`.
- **Updating the app**: edit files, run `firebase deploy` again.
- **Local preview** (optional): `firebase emulators:start` then open
  http://localhost:5000 (uses local emulated Firestore/Auth).
