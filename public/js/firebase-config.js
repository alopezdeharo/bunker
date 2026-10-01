import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBqSXEQ7bBkIKOSJ5SJF56GJzJjzMNlOI0",
  authDomain: "mibunker.firebaseapp.com",
  projectId: "mibunker",
  storageBucket: "mibunker.firebasestorage.app",
  messagingSenderId: "537806377750",
  appId: "1:537806377750:web:82b2aa1a43da24bae7eeac"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export async function getAuthInstance() {
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  return getAuth(app);
}
