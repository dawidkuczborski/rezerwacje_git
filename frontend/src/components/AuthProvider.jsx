import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = nie sprawdzono
  const [backendUser, setBackendUser] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // role-based storage key
  const path = window.location.pathname;
  let storageKey = "client_auth";
  if (path.startsWith("/employee")) storageKey = "employee_auth";
  if (path.startsWith("/panel")) storageKey = "provider_auth";

  /* 1) ładowanie backendUser z localStorage (szybki UI) */
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setBackendUser(JSON.parse(saved));
  }, [storageKey]);

  /* 2) Firebase listener */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setFirebaseUser(user);

          // 🔥 pobierz świeży token
          const token = await user.getIdToken(true);

          // 🔥 zapisz token (WSZĘDZIE)
          localStorage.setItem("authToken", token);
          console.log("🔐 authToken zaktualizowany:", token);

          // 🔥 pobierz usera z backendu
          const resp = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/auth/me`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          setBackendUser(resp.data);
          localStorage.setItem(storageKey, JSON.stringify(resp.data));
        } else {
          // brak usera → wyloguj
          setFirebaseUser(null);
          setBackendUser(null);
          localStorage.removeItem("authToken");
          localStorage.removeItem(storageKey);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
      } finally {
        setInitialLoading(false);
      }
    });

    return () => unsubscribe();
  }, [storageKey]);

  /* 3) LOGOUT — globalne, bezpośrednio z contextu */
  const logout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Błąd wylogowania:", err);
    }

    // 💥 wyczyść lokalne dane
    localStorage.removeItem("authToken");
    localStorage.removeItem("client_auth");
    localStorage.removeItem("employee_auth");
    localStorage.removeItem("provider_auth");

    console.log("👋 Wylogowano");
    window.location.href = "/login";
  };

  /* 4) co udostępniamy */
  const value = {
    firebaseUser,
    backendUser,
    loading: initialLoading,
    roleSession: storageKey,
    logout, // ✔️ teraz dostępne
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
