// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

// 🔧 Twoja konfiguracja Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDXAlNi7av5C8lVFq9UxLf_98FDjkrYn5o",
  authDomain: "rezerwacje-fdb9d.firebaseapp.com",
  projectId: "rezerwacje-fdb9d",
  storageBucket: "rezerwacje-fdb9d.firebasestorage.app",
  messagingSenderId: "613922466279",
  appId: "1:613922466279:web:686146fff5904006433542",
  measurementId: "G-VQ2Q07HYEQ",
};

// 🚀 Inicjalizacja aplikacji Firebase
const app = initializeApp(firebaseConfig);

// ✅ Ustaw trwałość logowania (zostajesz zalogowany po zamknięciu aplikacji)
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("🔐 Firebase persistence ustawione na local (pozostajesz zalogowany)");
  })
  .catch((error) => {
    console.error("❌ Błąd ustawiania persistence:", error);
  });

export default app;
