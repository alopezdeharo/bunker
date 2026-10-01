const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');

const [,, keyPath, email] = process.argv;

if (!keyPath || !email) {
  console.error('Uso: node set-admin.js <clave.json> <email>');
  process.exit(1);
}

initializeApp({ credential: cert(require(keyPath)) });

getAuth()
  .getUserByEmail(email)
  .then(user => getAuth().setCustomUserClaims(user.uid, { admin: true }))
  .then(() => { console.log(`Listo. Rol de administrador asignado a ${email}.`); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
