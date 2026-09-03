import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOEq3KQ5cEm_I1LrTMEwgnoZ9yqwpKm7c",
  authDomain: "quickie-demo.firebaseapp.com",
  projectId: "quickie-demo",
  storageBucket: "quickie-demo.firebasestorage.app",
  messagingSenderId: "882236491985",
  appId: "1:882236491985:web:4e6227bd3dd412dc9a1df0",
  measurementId: "G-D2HB2J39SW"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline-first, igual que ALCANTEC: los pedidos, productos y perfiles
// se leen de caché local si no hay red, y se sincronizan solos al
// reconectar. persistentMultipleTabManager evita conflictos si el
// comercio o el repartidor tienen la app abierta en más de una pestaña.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
