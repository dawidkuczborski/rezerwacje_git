import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";
import { FiEye, FiEyeOff } from "react-icons/fi";
import logo from "../assets/logo.png";

export default function RegisterClient({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");

  const backendBase = import.meta.env.VITE_API_URL;

  // 🔹 Automatycznie dobiera URL w zależności od środowiska
  const redirectUrl =
    window.location.hostname === "localhost"
      ? "http://localhost:5173/login-client"
      : "https://rezerwacje-fdb9d.web.app/login-client";

  // 🔹 ActionCodeSettings zgodne z nową polityką Firebase (2025)
  const actionCodeSettings = {
    url: redirectUrl,
    handleCodeInApp: true, // od kwietnia 2025 wymagane
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("⏳ Trwa rejestracja...");

    try {
      // 🔹 Tworzenie użytkownika w Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // 🔹 Ustawienie nazwy użytkownika
      await updateProfile(userCredential.user, { displayName: name });

      // 🔹 Wysłanie maila weryfikacyjnego (teraz z handleCodeInApp: true)
      await sendEmailVerification(userCredential.user, actionCodeSettings);

      // 🔹 Pobranie tokena autoryzacyjnego
      const token = await userCredential.user.getIdToken();

      // 🔹 Zapis użytkownika w bazie backendu
      await axios.post(
        `${backendBase}/api/auth/register`,
        { email, name, phone, role: "client" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 🔹 Komunikat dla użytkownika
      setMsg(
        "✅ Rejestracja zakończona pomyślnie! Sprawdź skrzynkę e-mail i potwierdź konto przed zalogowaniem."
      );

      // 🔹 Automatyczne przekierowanie do logowania po 3 s
      setTimeout(() => {
        window.location.href = "/login-client";
      }, 3000);
    } catch (err) {
      console.error("❌ Błąd rejestracji:", err);
      let errorMsg = "Wystąpił błąd podczas rejestracji.";

      if (err.code === "auth/email-already-in-use")
        errorMsg = "Ten adres e-mail jest już zarejestrowany.";
      else if (err.code === "auth/invalid-email")
        errorMsg = "Nieprawidłowy adres e-mail.";
      else if (err.code === "auth/weak-password")
        errorMsg = "Hasło musi mieć co najmniej 6 znaków.";
      else if (err.response?.data?.error)
        errorMsg = err.response.data.error;
      else errorMsg = err.message;

      setMsg("❌ " + errorMsg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1d1d1f] px-6">
      <div className="w-full max-w-sm text-center text-white">
        {/* Logo i nagłówek */}
        <div className="flex flex-col items-center mt-8 mb-6">
          <img src={logo} alt="Logo" className="w-16 h-16 mb-2 object-contain" />
          <h1 className="text-3xl font-semibold">e-barber</h1>
          <h2 className="text-xl font-medium mt-2 text-gray-300">
            Rejestracja klienta
          </h2>
        </div>

        {/* Formularz */}
        <form onSubmit={handleRegister} className="space-y-5">
          <input
            type="text"
            placeholder="Imię i nazwisko"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d]
                       text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <input
            type="email"
            placeholder="Adres e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d]
                       text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <input
            type="tel"
            placeholder="Numer telefonu (9 cyfr)"
            value={phone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= 9) setPhone(val);
            }}
            maxLength={9}
            pattern="[0-9]{9}"
            inputMode="numeric"
            className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d]
                       text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d]
                         text-white placeholder-gray-400 focus:outline-none focus:ring-2
                         focus:ring-gray-500 pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
            >
              {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full py-3 mt-3 bg-[#2a2a2d] text-white font-semibold rounded-xl
                       hover:bg-[#3a3a3d] transition-all"
          >
            Zarejestruj się
          </button>
        </form>

        <div className="pb-3">
          <p className="text-gray-400 text-sm mt-6">
            Masz już konto?{" "}
            <a
              href="/login-client"
              className="text-white font-semibold hover:underline"
            >
              Zaloguj się
            </a>
          </p>

          {msg && (
            <p
              className={`mt-4 text-sm ${
                msg.startsWith("✅")
                  ? "text-green-400"
                  : msg.startsWith("❌")
                  ? "text-red-400"
                  : "text-gray-300"
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
