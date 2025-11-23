import "./index.css";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Rejestracja Service Workera
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/service-worker.js")
            .then((reg) => {
                console.log("Service Worker zarejestrowany:", reg);
            })
            .catch((err) => console.error("SW error:", err));
    });
}


import axios from "axios";
import { getAuth, signOut } from "firebase/auth";

// 🔥 GLOBAL AXIOS INTERCEPTOR — działa w całej aplikacji
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        const res = error?.response;

        // ⛔️ BLOKADA LOGOWANIA (backend odesłał 440)
        if (res?.status === 440 && res.data?.forceLogout) {
            console.warn("🚨 GLOBAL LOGOUT — manipulacja salon_id");

            // 🔥 Zachowujemy motyw!
            const savedTheme = localStorage.getItem("theme");

            // Czyścimy wszystkie dane
            localStorage.clear();

            // Przywracamy theme (dark/light)
            if (savedTheme) {
                localStorage.setItem("theme", savedTheme);
            }

            // 🔐 Zapisujemy czas blokady logowania
            if (res.data.lockForMinutes) {
                const unlockTime = Date.now() + res.data.lockForMinutes * 60 * 1000;
                localStorage.setItem("login_blocked_until", unlockTime);
            }

            // Wylogowanie Firebase
            const auth = getAuth();
            signOut(auth).then(() => {
                console.log("✔ Wylogowano przez manipulację salon_id, motyw zachowany");
                window.location.href = "/login";
            });

            return;
        }


        return Promise.reject(error);
    }
);

createRoot(document.getElementById("root")).render(<App />);
