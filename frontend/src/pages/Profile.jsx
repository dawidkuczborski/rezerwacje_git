import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import {
  LogOut,
  Settings,
  Users,
  Scissors,
  Calendar,
  Building2,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";

export default function Profile() {
  const { firebaseUser, loading } = useAuth();
  const [info, setInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // 🔐 Pobieranie danych profilu
  useEffect(() => {
    const load = async () => {
      if (!firebaseUser) {
        setInfo(null);
        setLoadingInfo(false);
        return;
      }
      try {
        setError(null);
        const token = await firebaseUser.getIdToken(true);
        const resp = await axios.get(`${backendBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setInfo(resp.data);
      } catch (err) {
        console.error("❌ Błąd pobierania profilu:", err);
        setError("Nie udało się pobrać danych użytkownika");
      } finally {
        setLoadingInfo(false);
      }
    };
    load();
  }, [firebaseUser]);

  // 🕓 Stany ładowania
  if (loading || loadingInfo)
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-300">
        <Loader2 className="animate-spin mr-2" size={20} /> Ładowanie profilu...
      </div>
    );

  // 🚪 Brak zalogowania
  if (!firebaseUser) {
    navigate("/login-admin");
    return null;
  }

  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-500">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
        >
          Odśwież
        </button>
      </div>
    );

  // 🔎 Pobieramy rolę i flagę providera
  const role = info?.role || "client";
  const isProvider = info?.is_provider === true;

  // 🔒 Autoryzacja — dostęp tylko dla employee lub provider
  if (!isProvider && role !== "employee") {
    navigate("/login-admin");
    return null;
  }

  // 🚪 Wylogowanie
  const handleLogout = async () => {
    try {
      const { getAuth, signOut } = await import("firebase/auth");
      const auth = getAuth();
      await signOut(auth);
      navigate("/login-admin");
    } catch (err) {
      console.error("❌ Błąd przy wylogowaniu:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-md p-8 mt-10">
        
        {/* Nagłówek profilu */}
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              👤 Profil użytkownika
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {firebaseUser.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition"
          >
            <LogOut size={16} /> Wyloguj
          </button>
        </div>

        {/* Dane użytkownika */}
        <div className="space-y-2 mb-8">
          <p>
            <strong>Rola:</strong>{" "}
            {isProvider ? "Właściciel salonu" : "Pracownik"}
          </p>
          
          {info?.phone && (
            <p>
              <strong>Telefon:</strong> {info.phone}
            </p>
          )}

          {info?.name && (
            <p>
              <strong>Imię i nazwisko:</strong> {info.name}
            </p>
          )}
        </div>

        {/* Panel PROVIDERA */}
        {isProvider && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              💈 Panel właściciela
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <ActionButton
                icon={<Building2 size={18} />}
                label="Konfiguracja salonu"
                onClick={() => navigate("/panel/salon")}
              />
              <ActionButton
                icon={<Users size={18} />}
                label="Pracownicy"
                onClick={() => navigate("/panel/employees")}
              />
              <ActionButton
                icon={<Scissors size={18} />}
                label="Usługi"
                onClick={() => navigate("/panel/services")}
              />
              <ActionButton
                icon={<Settings size={18} />}
                label="Przypisz usługi"
                onClick={() => navigate("/panel/assign")}
              />
              <ActionButton
                icon={<Calendar size={18} />}
                label="Harmonogram"
                onClick={() => navigate("/panel/schedule")}
              />
              <ActionButton
                icon={<ImageIcon size={18} />}
                label="Portfolio"
                onClick={() => navigate("/panel/portfolio")}
              />
            </div>
          </div>
        )}

        {/* Panel PRACOWNIKA (ale nie właściciela) */}
        {role === "employee" && !isProvider && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              ✂️ Panel pracownika
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <ActionButton
                icon={<Calendar size={18} />}
                label="Moje wizyty"
                onClick={() => navigate("/employee/bookings")}
              />
              <ActionButton
                icon={<Settings size={18} />}
                label="Mój profil"
                onClick={() => navigate("/employee/settings")}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// 💡 Komponent przycisku akcji
function ActionButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm font-medium"
    >
      {icon}
      {label}
    </button>
  );
}
