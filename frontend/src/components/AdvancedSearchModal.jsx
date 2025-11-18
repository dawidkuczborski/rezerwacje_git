// src/components/AdvancedSearchModal.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  SlidersHorizontal,
  Star,
  ArrowLeft,
} from "lucide-react";

export default function AdvancedSearchModal({ onClose, backendBase, navigate }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

  // 🚫 Zablokuj przewijanie tła
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // 🏷️ Pobranie kategorii
  useEffect(() => {
    axios
      .get(`${backendBase}/api/categories`)
      .then((res) => setCategories(res.data))
      .catch((err) => console.error("Błąd ładowania kategorii:", err));
  }, [backendBase]);

  // 📍 Szybsze, asynchroniczne pobieranie lokalizacji
  useEffect(() => {
    if (!city) {
      const geoTimeout = setTimeout(() => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude } = pos.coords;
              const res = await axios.get(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
              );
              const detectedCity =
                res.data?.address?.city ||
                res.data?.address?.town ||
                res.data?.address?.village ||
                "";
              if (detectedCity) setCity(detectedCity);
            } catch (e) {
              console.warn("Nie udało się pobrać lokalizacji:", e);
            }
          },
          () => setCity("Inowrocław"), // fallback
          { enableHighAccuracy: false, timeout: 3000 }
        );
      }, 500);
      return () => clearTimeout(geoTimeout);
    }
  }, [city]);

  // 🔍 Przyspieszone wyszukiwanie z anulowaniem zapytań
  useEffect(() => {
    const controller = new AbortController();
    const delay = setTimeout(async () => {
      if (!query && !city && !postal && !activeCategory) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const params = {
          q: query || "",
          city: city || "",
          postal: postal || "",
          category: activeCategory || "",
          active: true,
        };

        const res = await axios.get(`${backendBase}/api/salons/search`, {
          params,
          signal: controller.signal,
        });

        if (res.data.length === 0 && postal && !city) {
          const fallbackRes = await axios.get(
            `${backendBase}/api/salons/search`,
            {
              params: {
                q: query || "",
                city: postal,
                category: activeCategory,
                active: true,
              },
              signal: controller.signal,
            }
          );
          setResults(fallbackRes.data);
        } else {
          setResults(res.data);
        }
      } catch (e) {
        if (axios.isCancel(e)) return;
        console.error("❌ Błąd wyszukiwania:", e);
      } finally {
        setLoading(false);
      }
    }, 200); // 🔥 Skrócony debounce z 400 → 200 ms

    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [query, city, postal, activeCategory, backendBase]);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.18, ease: "easeOut" }} // ⚡️ Szybsza animacja
      className={`fixed inset-0 z-[9999] ${
        isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      } flex flex-col overscroll-none`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* 🔹 Pasek powrotu */}
      <div
        className={`flex items-center gap-2 px-5 py-4 border-b ${
          isDark ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Powrót</span>
        </button>
      </div>

      {/* 🔸 Pola wyszukiwania */}
      <div className="px-5 space-y-3 mb-3 mt-[5px]">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wpisz nazwę salonu lub rodzaj usługi..."
            className={`w-full pl-9 pr-3 py-3 rounded-xl text-sm ${
              isDark
                ? "bg-gray-800 text-gray-100 placeholder-gray-500"
                : "bg-gray-100 text-gray-900"
            }`}
          />
        </div>

        <div className="relative">
          <MapPin
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={city || postal}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d{2}-\d{3}$/.test(val)) {
                setPostal(val);
                setCity("");
              } else {
                setCity(val);
                setPostal("");
              }
            }}
            placeholder="Miasto lub kod pocztowy..."
            className={`w-full pl-9 pr-3 py-3 rounded-xl text-sm ${
              isDark
                ? "bg-gray-800 text-gray-100 placeholder-gray-500"
                : "bg-gray-100 text-gray-900"
            }`}
          />
        </div>
      </div>

      {/* 🔸 Kategorie */}
      <div
        className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>

        <button
          onClick={() => setActiveCategory("")}
          className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 font-medium transition-colors ${
            activeCategory === ""
              ? "bg-[#E57B2C] text-white"
              : isDark
              ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          <SlidersHorizontal size={16} />
          Filtry
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.name)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat.name
                ? "bg-[#E57B2C] text-white"
                : isDark
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* 📋 Wyniki */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <h3 className="text-lg font-semibold mb-3">Wyniki</h3>

        {loading && <p className="text-sm text-gray-400">Ładowanie...</p>}
        {!loading && results.length === 0 && (
          <p className="text-sm text-gray-400">Brak wyników.</p>
        )}

        <div className="space-y-4">
          {results.map((salon) => (
            <motion.div
              key={salon.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                localStorage.setItem("selectedSalon", JSON.stringify(salon));
                navigate("/services");
                onClose();
              }}
              className={`rounded-2xl overflow-hidden border shadow-sm cursor-pointer transition-all ${
                isDark
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="h-44 w-full overflow-hidden">
                {salon.image_url ? (
                  <img
                    src={`${backendBase}/uploads/${salon.image_url}`}
                    alt={salon.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Brak zdjęcia 📷
                  </div>
                )}
              </div>

              <div className="p-3">
                <h4 className="text-base font-semibold">{salon.name}</h4>
                <div className="flex items-center text-sm mb-1">
                  <Star
                    size={14}
                    className="text-yellow-400 fill-yellow-400 mr-1"
                  />
                  <span>4.8</span>
                  <span className="text-gray-400 ml-1">· 98 opinii</span>
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <MapPin size={14} className="mr-1" />
                  <span>
                    {salon.city}, {salon.street} {salon.street_number}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
