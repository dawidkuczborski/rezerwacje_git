import React, { useState, useEffect, useMemo } from "react";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import { FiEye, FiEyeOff } from "react-icons/fi";
import logo from "../assets/logo.png";

export default function LoginEmployee({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const backendBase = import.meta.env.VITE_API_URL;

  // 🎨 Synchronizacja motywu
  useEffect(() => {
    const applyTheme = (th) => {
      const dark = th === "dark";
      const bg = dark ? "#0f0f10" : "#f9fafb";
      const color = dark ? "#ffffff" : "#111827";
      document.documentElement.classList.toggle("dark", dark);
      document.body.style.background = bg;
      document.body.style.color = color;
      localStorage.setItem("theme", th);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", bg);
    };

    applyTheme(theme);
    const handleStorage = (e) => {
      if (e.key === "theme" && e.newValue) setTheme(e.newValue);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [theme]);

  const styles = useMemo(() => {
    const dark = theme === "dark";
    return {
      bgMain: dark ? "#0f0f10" : "#f9fafb",
      bgInput: dark ? "#1d1d1f" : "#ffffff",
      text: dark ? "#ffffff" : "#111827",
      subtext: dark ? "#9ca3af" : "#6b7280",
      border: dark ? "#3a3a3d" : "#d1d5db",
      inputPlaceholder: dark ? "#9ca3af" : "#6b7280",
      btnBg: dark ? "#2a2a2d" : "#e5e7eb",
      btnHover: dark ? "#3a3a3d" : "#d1d5db",
    };
  }, [theme]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMsg("⏳ Logowanie...");

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      if (!user.emailVerified) {
        setMsg("❌ Konto nie zostało jeszcze zweryfikowane. Sprawdź skrzynkę e-mail!");
        await sendEmailVerification(user);
        await auth.signOut();
        return;
      }

      const token = await user.getIdToken();
      const resp = await axios.get(`${backendBase}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.data.role !== "employee") {
        setMsg("❌ To konto nie jest kontem pracownika!");
        await auth.signOut();
        return;
      }

      setMsg("✅ Zalogowano pomyślnie!");
      if (onSuccess) onSuccess("employee");
      else window.location.href = "/employee/bookings";
    } catch (err) {
      console.error(err);
      let errorMsg = "Błąd logowania: ";
      if (err.code === "auth/user-not-found") errorMsg += "Nie znaleziono użytkownika.";
      else if (err.code === "auth/wrong-password") errorMsg += "Nieprawidłowe hasło.";
      else if (err.code === "auth/too-many-requests")
        errorMsg += "Zbyt wiele prób logowania. Spróbuj ponownie później.";
      else errorMsg += err.response?.data?.error || err.message;
      setMsg("❌ " + errorMsg);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setMsg("❌ Podaj adres e-mail, aby zresetować hasło.");
      return;
    }
    setIsResetting(true);
    setMsg("⏳ Wysyłam link resetujący...");

    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("📩 Wysłano wiadomość z linkiem do resetu hasła!");
    } catch (err) {
      console.error("Błąd resetowania hasła:", err);
      if (err.code === "auth/user-not-found")
        setMsg("❌ Nie znaleziono użytkownika o podanym adresie e-mail.");
      else if (err.code === "auth/invalid-email") setMsg("❌ Podaj poprawny adres e-mail.");
      else setMsg("❌ Wystąpił błąd podczas wysyłania e-maila resetującego.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 transition-colors duration-300"
      style={{ background: styles.bgMain, color: styles.text }}
    >
      <div
        className="w-full max-w-sm text-center flex flex-col justify-between h-[90vh]"
        style={{ color: styles.text }}
      >
        {/* Logo i tytuł */}
        <div className="flex flex-col items-center mt-10 mb-6">
          <img src={logo} alt="Logo" className="w-16 h-16 mb-2 object-contain" />
          <h1 className="text-3xl font-semibold">e-barber</h1>
          <h2 className="text-xl font-medium mt-2" style={{ color: styles.subtext }}>
            Logowanie pracownika
          </h2>
        </div>

        {/* Formularz */}
        <form onSubmit={handleLogin} className="space-y-5">
          <input
            type="email"
            placeholder="Adres e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: styles.bgInput,
              color: styles.text,
              borderColor: styles.border,
            }}
            className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                background: styles.bgInput,
                color: styles.text,
                borderColor: styles.border,
              }}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-gray-500 pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
              style={{ color: styles.subtext }}
            >
              {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
            </button>
          </div>

          <div className="text-right mt-1">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting}
              style={{ color: styles.subtext }}
              className="text-sm hover:underline focus:outline-none"
            >
              Nie pamiętam hasła
            </button>
          </div>

          <button
            type="submit"
            className="w-full py-3 mt-3 font-semibold rounded-xl transition-all"
            style={{
              background: styles.btnBg,
              color: styles.text,
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = styles.btnHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = styles.btnBg)}
          >
            Zaloguj się
          </button>
        </form>

        <div className="pb-3">
          {msg && (
            <p
              className={`mt-4 text-sm transition-colors duration-300 ${
                msg.startsWith("✅")
                  ? "text-green-400"
                  : msg.startsWith("❌")
                  ? "text-red-400"
                  : msg.startsWith("📩")
                  ? "text-yellow-400"
                  : ""
              }`}
            >
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
