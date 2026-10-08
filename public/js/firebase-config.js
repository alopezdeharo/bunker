import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDxiZkF-XJOXr8okyHYhOXL5NuoAG5kDag",
  authDomain: "mibunker.firebaseapp.com",
  projectId: "mibunker",
  storageBucket: "mibunker.firebasestorage.app",
  messagingSenderId: "281541110173",
  appId: "1:281541110173:web:f789b45a6b08d5cb37e774"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

const AUTH_URL = 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

async function authModule() {
  const { getAuth, signInAnonymously } = await import(AUTH_URL);
  const auth = getAuth(app);
  await auth.authStateReady();
  return { auth, signInAnonymously };
}

export async function currentUserId() {
  const { auth } = await authModule();
  return auth.currentUser?.uid ?? null;
}

export async function ensureUser() {
  const { auth, signInAnonymously } = await authModule();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}
