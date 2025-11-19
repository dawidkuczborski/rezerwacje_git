import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import {
  User,
  LogOut,
  ChevronRight,
  ChevronDown,
  Moon,
  Sun,
  Phone,
  Lock,
  Save,
} from "lucide-react";
import axios from "axios";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

export default function ProfileClient() {
  const { firebaseUser, loading } = useAuth();
  const [info, setInfo] = useState(null);
  const [theme, setTheme] = useState("dark");
  const navigate = useNavigate();
  const backendBase = import.meta.env.VITE_API_URL;

  // 🌓 Motyw
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    localStorage.setItem("theme", newTheme);
  };

  // 👤 Ładowanie profilu
  useEffect(() => {
    const loadProfile = async () => {
      if (!firebaseUser) {
        navigate("/login-client");
        return;
      }
      try {
        const token = await firebaseUser.getIdToken(true);
        const resp = await axios.get(`${backendBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setInfo(resp.data);
      } catch (err) {
        console.error("❌ Błąd profilu:", err);
      }
    };
    loadProfile();
  }, [firebaseUser, navigate]);

const handleLogout = async () => {
  try {
    const auth = getAuth();
    await auth.signOut();

    // 🧹 Wyczyść dane lokalne (żeby nie pamiętało poprzedniego konta)
    localStorage.removeItem("firebaseToken");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedSalon");
    localStorage.removeItem("selectedService");
    localStorage.removeItem("booking-cache");
    localStorage.removeItem("lockEmployeeSelection");
    localStorage.removeItem("theme"); // jeśli chcesz też resetować motyw

    // 🧹 Wyczyść dane sesji i stan komponentu
    sessionStorage.clear();
    setInfo(null);

    // 🔄 Odśwież stronę i przekieruj do logowania
    window.location.href = "/login-client";
  } catch (err) {
    console.error("❌ Błąd przy wylogowaniu:", err);
  }
};


if (loading || !info) return null;


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-850 text-gray-900 dark:text-gray-100 flex flex-col items-center py-16 px-4">
      {/* 👤 Nagłówek */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400">
          <User size={40} />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{info.name || "Użytkownik"}</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{info.email}</p>
      </div>

      {/* 📋 Sekcje */}
      <div className="w-full max-w-md space-y-3">
        <AccountSettings
          firebaseUser={firebaseUser}
          backendBase={backendBase}
          info={info}
          setInfo={setInfo}
        />

        {/* 🔔 Powiadomienia */}
        <ExpandableCard label="Powiadomienia">
          <label className="flex justify-between items-center">
            <span>SMS o rezerwacji</span>
            <input type="checkbox" className="accent-orange-500 w-4 h-4" />
          </label>
          <label className="flex justify-between items-center">
            <span>Powiadomienie e-mail</span>
            <input type="checkbox" className="accent-orange-500 w-4 h-4" />
          </label>
        </ExpandableCard>

        {/* 🔐 Prywatność */}
        <ExpandableCard label="Prywatność">
          <button className="text-left hover:text-orange-500 transition">
            Polityka prywatności
          </button>
          <button className="text-left text-red-500 hover:text-red-600 font-medium transition">
            Usuń konto
          </button>
        </ExpandableCard>

        {/* 🛟 Pomoc techniczna */}
        <ExpandableCard label="Pomoc techniczna">
          <button className="text-left hover:text-orange-500 transition">
            Zgłoś problem
          </button>
          <button className="text-left hover:text-orange-500 transition">
            Kontakt z pomocą
          </button>
        </ExpandableCard>

        {/* 🌓 Motyw */}
        <div className="w-full px-5 py-3 bg-gray-100 dark:bg-gray-900 rounded-xl flex justify-between items-center">
          <span className="text-sm font-medium">Motyw</span>
          <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
        </div>

        {/* 🚪 Wyloguj */}
        <button
          onClick={handleLogout}
          className="w-full flex justify-center items-center px-5 py-3 mt-6 rounded-xl text-orange-500 border border-orange-500/20 hover:bg-orange-500/10 transition"
        >
          <LogOut size={16} className="mr-2 text-orange-500" />
          Wyloguj się
        </button>
      </div>
    </div>
  );
}

/* 🧾 Formularz ustawień konta + zmiana hasła */
function AccountSettings({ firebaseUser, backendBase, info, setInfo }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: info.name || "", phone: info.phone || "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // ✅ Zmiana danych użytkownika
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await axios.put(`${backendBase}/api/auth/me`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo(resp.data.user);
      setMessage("✅ Zmiany zapisane pomyślnie!");
    } catch (err) {
      setMessage(err.response?.data?.error || "❌ Błąd zapisu danych");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden transition-all duration-300">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-5 py-3 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-800 transition"
      >
        <span>Ustawienia konta</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      <div
        className={`transition-all overflow-hidden ${
          open ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-5 flex flex-col gap-4 text-sm text-gray-700 dark:text-gray-200">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block mb-1 text-gray-500 dark:text-gray-400">
                Imię i nazwisko
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-orange-500 outline-none transition"
                placeholder="Jan Kowalski"
              />
            </div>

            <div>
              <label className="block mb-1 text-gray-500 dark:text-gray-400">
                Numer telefonu
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-orange-500 outline-none transition"
                placeholder="501234567"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`w-full flex justify-center items-center gap-2 py-2.5 rounded-lg font-medium transition ${
                saving
                  ? "bg-orange-400 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              } text-white`}
            >
              <Save size={16} />
              {saving ? "Zapisywanie..." : "Zapisz zmiany"}
            </button>

            {message && (
              <p
                className={`text-center text-sm mt-2 ${
                  message.includes("✅") ? "text-green-500" : "text-red-500"
                }`}
              >
                {message}
              </p>
            )}
          </form>

          {/* 🔒 Zmiana hasła */}
          <div className="pt-4 border-t border-gray-300 dark:border-gray-700 mt-2">
            <button
              type="button"
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="flex items-center gap-2 text-orange-500 hover:text-orange-600 font-medium transition"
            >
              <Lock size={16} />
              Zmień hasło
            </button>

            {showPasswordForm && <PasswordChangeForm firebaseUser={firebaseUser} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 🔐 Formularz zmiany hasła */
function PasswordChangeForm({ firebaseUser }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (form.newPassword !== form.confirmPassword) {
      setMsg("❌ Nowe hasła muszą się zgadzać");
      return;
    }

    if (form.newPassword.length < 6) {
      setMsg("❌ Hasło musi mieć co najmniej 6 znaków");
      return;
    }

    try {
      setLoading(true);
      const auth = getAuth();
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(
        user.email,
        form.currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, form.newPassword);
      setMsg("✅ Hasło zostało zmienione pomyślnie!");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setMsg("❌ Błąd przy zmianie hasła: " + (err.message || "nieznany"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handlePasswordChange} className="mt-4 flex flex-col gap-3">
      <input
        type="password"
        name="currentPassword"
        value={form.currentPassword}
        onChange={handleChange}
        placeholder="Aktualne hasło"
        className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-orange-500 outline-none transition"
      />
      <input
        type="password"
        name="newPassword"
        value={form.newPassword}
        onChange={handleChange}
        placeholder="Nowe hasło"
        className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-orange-500 outline-none transition"
      />
      <input
        type="password"
        name="confirmPassword"
        value={form.confirmPassword}
        onChange={handleChange}
        placeholder="Powtórz nowe hasło"
        className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-orange-500 outline-none transition"
      />

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-2 rounded-lg font-medium text-white transition ${
          loading ? "bg-orange-400" : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {loading ? "Zapisywanie..." : "Zmień hasło"}
      </button>

      {msg && (
        <p
          className={`text-sm mt-2 text-center ${
            msg.includes("✅") ? "text-green-500" : "text-red-500"
          }`}
        >
          {msg}
        </p>
      )}
    </form>
  );
}

/* 🔹 Rozwijane sekcje */
function ExpandableCard({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden transition-all duration-300">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-5 py-3 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-800 transition"
      >
        <span>{label}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      <div
        className={`transition-all overflow-hidden ${
          open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-5 flex flex-col gap-3 text-sm text-gray-700 dark:text-gray-300">
          {children}
        </div>
      </div>
    </div>
  );
}

/* 🔘 Przełącznik motywu */
function ThemeSwitch({ theme, toggleTheme }) {
  return (
    <button
      onClick={toggleTheme}
      className={`relative w-12 h-6 rounded-full flex items-center transition-colors duration-300 ${
        theme === "dark" ? "bg-gray-700" : "bg-gray-300"
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${
          theme === "dark"
            ? "translate-x-6 bg-gray-100"
            : "translate-x-0 bg-white"
        }`}
      />
      {theme === "dark" ? (
        <Moon size={14} className="absolute left-1 text-gray-300" />
      ) : (
        <Sun size={14} className="absolute right-1 text-yellow-400" />
      )}
    </button>
  );
}
