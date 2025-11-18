import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";
import { FiEye, FiEyeOff } from "react-icons/fi";
import logo from "../assets/logo.png";

export default function RegisterProvider({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const backendBase = "http://localhost:5000";

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg("Rejestruję...");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      const token = await cred.user.getIdToken();

      await axios.post(
        `${backendBase}/api/auth/register`,
        { email, name, role: "provider" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMsg("✅ Konto właściciela salonu utworzone!");
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setMsg("Błąd: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1d1d1f] px-6">
      <div className="w-full max-w-sm text-center text-white">
        <div className="flex flex-col items-center mt-10 mb-6">
          <img src={logo} alt="Logo" className="w-16 h-16 mb-2 object-contain" />
          <h1 className="text-3xl font-semibold">e-barber</h1>
          <h2 className="text-xl font-medium mt-2 text-gray-300">Rejestracja właściciela</h2>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <input
            type="text"
            placeholder="Imię i nazwisko"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <input
            type="email"
            placeholder="Adres e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#1d1d1f] border border-[#3a3a3d] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 pr-10"
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
            className="w-full py-3 mt-3 bg-[#2a2a2d] text-white font-semibold rounded-xl hover:bg-[#3a3a3d] transition-all"
          >
            Zarejestruj salon
          </button>
        </form>

        <div className="pb-3">
          <p className="text-gray-400 text-sm mt-6">
            Masz już konto?{" "}
            <a href="/login" className="text-white font-semibold hover:underline">
              Zaloguj się
            </a>
          </p>
          {msg && <p className="mt-4 text-sm text-gray-300">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
