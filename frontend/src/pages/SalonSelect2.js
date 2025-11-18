import React, { useEffect, useState } from "react";
import axios from "axios";
import { Search, MapPin, Star } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function SalonSelect({ onSelect }) {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [salons, setSalons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const backendBase = import.meta.env.VITE_API_URL;

  // 🔹 Pobranie danych użytkownika
  useEffect(() => {
    const loadUser = async () => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();

        const res = await axios.get(`${backendBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
      } catch (err) {
        console.error("❌ Błąd pobierania użytkownika:", err);
      }
    };
    loadUser();
  }, [firebaseUser]);

  // 🔹 Pobranie salonów publicznych
  useEffect(() => {
    const loadSalons = async () => {
      try {
        const res = await axios.get(`${backendBase}/api/salons/public`);
        setSalons(res.data);
      } catch (err) {
        console.error("❌ Błąd pobierania salonów:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSalons();
  }, []);

  // 🔹 Filtrowanie salonów
  const filteredSalons = salons.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.city?.toLowerCase().includes(search.toLowerCase())
  );

  // 🔹 Loader
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400 text-lg">
        ⏳ Ładowanie salonów...
      </div>
    );

  return (
    <div className="min-h-screen bg-dark text-white px-5 py-8 font-sans">
      {/* 🧑‍💈 Nagłówek powitalny */}
      <header className="mb-6">
        <h1 className="text-3xl font-semibold mb-2">
          {user ? (
            <>Cześć, {user.name?.split(" ")[0]} </>
          ) : (
            "Witaj "
          )}
        </h1>
        <p className="text-gray-400 text-sm">
          Znajdź najlepszego barbera lub stylistę w pobliżu
        </p>
      </header>

      {/* 🔍 Wyszukiwarka */}
      <div className="relative mb-8">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
          size={20}
        />
        <input
          type="text"
          placeholder="Szukaj salonu, usługi lub miasta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-dark-gray rounded-xl pl-10 pr-4 py-3 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-accent focus:outline-none transition"
        />
      </div>

      {/* 📅 Placeholder dla wizyty */}
      <div className="bg-dark-gray rounded-2xl p-4 mb-8 flex items-center justify-between shadow-lg border border-neutral-800">
        <div>
          <p className="text-gray-200 font-medium">Moja najbliższa wizyta</p>
          <p className="text-gray-400 text-sm">💈 Strzyżenie – 13 lis, 15:00</p>
        </div>
        <button className="bg-dark px-4 py-2 rounded-xl text-gray-300 hover:bg-neutral-800 transition">
          Szczegóły
        </button>
      </div>

      {/* 🏠 Lista salonów */}
      <h2 className="text-xl font-semibold mb-4">Polecane salony</h2>

      {filteredSalons.length === 0 ? (
        <p className="text-gray-500">Brak salonów spełniających kryteria.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {filteredSalons.map((salon) => (
          <div
  key={salon.id}
  className="bg-dark-gray rounded-2xl overflow-hidden shadow-md border border-neutral-800 hover:scale-[1.03] hover:shadow-xl transition-transform duration-200 cursor-pointer group"
  onMouseEnter={() => import("./ServiceSelect.jsx")}   // ✅ prefetch desktop
  onTouchStart={() => import("./ServiceSelect.jsx")}   // ✅ prefetch mobile
  onClick={() => {                                     // ✅ bezpieczna nawigacja
    localStorage.setItem("selectedSalon", JSON.stringify(salon));
    navigate("/services");
  }}
>
              <div className="h-44 w-full overflow-hidden bg-neutral-900 flex items-center justify-center relative">
  {salon.image_url ? (
    <img
      src={`${backendBase}/uploads/${salon.image_url}`}
      alt={salon.name}
      className="w-full h-full object-cover group-hover:opacity-90 transition duration-300"
      onError={(e) => {
        e.target.onerror = null;
        e.target.style.display = "none";
        const parent = e.target.parentElement;
        if (parent) {
          parent.innerHTML =
            '<div class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Brak zdjęcia 📷</div>';
        }
      }}
    />
  ) : (
    <div className="text-gray-500 text-sm flex flex-col items-center justify-center h-full w-full">
      <span className="text-2xl mb-1">📷</span>
      <span>Brak zdjęcia</span>
    </div>
  )}
</div>

              
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-1 text-white truncate">
                  {salon.name}
                </h3>
                <div className="flex items-center text-gray-400 text-sm mb-1">
                  <Star size={16} className="text-accent mr-1" />
                  <span>4.8</span>
                  <span className="ml-1 text-gray-500">· 115 opinii</span>
                </div>
                <div className="flex items-center text-gray-500 text-sm">
                  <MapPin size={16} className="mr-1 text-gray-400" />
                  <span className="truncate">
                    {salon.city}, {salon.street} {salon.street_number}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
