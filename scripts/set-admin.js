// Run once to grant admin privileges to your Firebase user.
//
// Setup:
//   1. Firebase Console → Project Settings → Service accounts → Generate new private key
//   2. npm install firebase-admin  (inside /scripts)
//   3. node set-admin.js <path-to-key.json> <your-email>
//   4. Delete the key file. Never commit it.
//
// After running, sign out and back in on any active admin sessions.

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');

const [,, keyPath, email] = process.argv;

if (!keyPath || !email) {
  console.error('Usage: node set-admin.js <service-account.json> <email>');
  process.exit(1);
}

initializeApp({ credential: cert(require(keyPath)) });

getAuth()
  .getUserByEmail(email)
  .then(user => getAuth().setCustomUserClaims(user.uid, { admin: true }))
  .then(() => { console.log(`Done. Admin claim set for ${email}.`); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
