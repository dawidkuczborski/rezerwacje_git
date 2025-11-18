// src/pages/SalonSelect.jsx
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  lazy,
  Suspense,
  useDeferredValue,
  startTransition,
} from "react";
import axios from "axios";
import { Search, MapPin, Star } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AdvancedSearchModal from "../components/AdvancedSearchModal";

const ServiceSelect = lazy(() => import("./ServiceSelect.jsx"));

export default function SalonSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseUser } = useAuth();

  // 🧹 Brak cache — zawsze świeże dane
  const [salons, setSalons] = useState([]);
  const [user, setUser] = useState(null);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [lastAppointment, setLastAppointment] = useState(null);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAppointmentDetails, setShowAppointmentDetails] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  const deferredSearch = useDeferredValue(search);
  const backendBase = import.meta.env.VITE_API_URL;

  // 🌓 Motyw
  useEffect(() => {
    const stored = localStorage.getItem("theme") || "dark";
    document.documentElement.classList.toggle("dark", stored === "dark");
  }, []);
  const isDark = document.documentElement.classList.contains("dark");
  const PRIMARY = "#E57B2C";

  // 🧹 Wyczyść ewentualne stare dane wizyt przy starcie
  useEffect(() => {
    sessionStorage.removeItem("nextAppointment");
    sessionStorage.removeItem("lastAppointment");
  }, []);

  // 📦 Pobranie pełnych danych przy pierwszym wejściu
  const loadAll = useCallback(async () => {
    try {
      if (!firebaseUser) return;
      setLoading(true);
      const token = await firebaseUser.getIdToken();

      const [userRes, apptRes, salonsRes] = await Promise.all([
        axios.get(`${backendBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${backendBase}/api/appointments/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${backendBase}/api/salons/public`),
      ]);

      const u = userRes.data;
      const s = salonsRes.data;
      const appointments = apptRes.data;

      processAppointments(appointments);
      setUser(u);
      setSalons(s);
    } catch (err) {
      console.error("❌ Błąd przy pobieraniu danych:", err);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, backendBase]);

  // 🔄 Szybkie odświeżanie tylko wizyt — zawsze świeże dane
  const refreshAppointments = useCallback(async () => {
    try {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await axios.get(`${backendBase}/api/appointments/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      processAppointments(res.data);
    } catch (err) {
      console.error("❌ Błąd przy odświeżaniu wizyt:", err);
    }
  }, [firebaseUser, backendBase]);




















// 🔧 Naprawiona funkcja — działa z datami w formacie ISO ("2025-11-12T00:00:00.000Z")
const processAppointments = (all = []) => {
  if (!Array.isArray(all) || all.length === 0) {
    setNextAppointment(null);
    setLastAppointment(null);
    return;
  }

  const now = new Date();

  // 🕐 Łączymy datę ISO + czas lokalny
  const toDateTime = (dateISO, timeStr) => {
    if (!dateISO || !timeStr) return null;

    const date = new Date(dateISO); // np. 2025-11-12T00:00:00.000Z
    if (isNaN(date)) return null;

    const [hours, minutes, seconds] = timeStr.split(":").map(Number);
    const local = new Date(date);
    local.setHours(hours || 0);
    local.setMinutes(minutes || 0);
    local.setSeconds(seconds || 0);
    return local;
  };

  const withTimes = all.map((a) => ({
    ...a,
    startDateTime: toDateTime(a.date, a.start_time),
    endDateTime: toDateTime(a.date, a.end_time),
  }));

  // 🔹 Najbliższa przyszła wizyta
  const upcoming =
    withTimes
      .filter(
        (a) =>
          a.status === "booked" &&
          a.startDateTime &&
          a.startDateTime > now
      )
      .sort((a, b) => a.startDateTime - b.startDateTime)[0] || null;

  // 🔹 Ostatnia przeszła wizyta
  const past =
    withTimes
      .filter((a) => a.endDateTime && a.endDateTime < now)
      .sort((a, b) => b.endDateTime - a.endDateTime)[0] || null;

  setNextAppointment(upcoming);
  setLastAppointment(past);

  // 👀 Debug info
  console.log("✅ processAppointments() wynik:");
  console.table(
    withTimes.map((a) => ({
      id: a.id,
      date: a.date,
      start: a.start_time,
      end: a.end_time,
      startDateTime: a.startDateTime?.toLocaleString(),
      endDateTime: a.endDateTime?.toLocaleString(),
    }))
  );
  console.log("➡️ next:", upcoming?.start_time, "➡️ last:", past?.start_time);
};





















  // 🧠 Ładowanie danych zawsze po zalogowaniu
  useEffect(() => {
    if (!firebaseUser) return;
    startTransition(() => loadAll());
  }, [firebaseUser, loadAll]);

  // ♻️ Odświeżaj wizyty przy powrocie do aplikacji
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && firebaseUser) {
        refreshAppointments();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [firebaseUser, refreshAppointments]);

  // 🚪 Odświeżaj wizyty przy wejściu na zakładkę
  useEffect(() => {
    if (location.pathname === "/salon-select" && firebaseUser) {
      refreshAppointments();
    }
  }, [location.pathname, firebaseUser, refreshAppointments]);

  useEffect(() => {
    if (location.state?.refresh) {
      console.log("🔁 Odświeżanie danych SalonSelect po kliknięciu w menu...");
      refreshAppointments(); // tylko wizyty
    }
  }, [location.state?.refresh]);

  // 🔍 Filtrowanie salonów
  const filteredSalons = useMemo(() => {
    const q = deferredSearch.toLowerCase();
    return salons.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q)
    );
  }, [salons, deferredSearch]);

  // 🔁 Umów ponownie
  const handleRebook = useCallback(
    (appt) => {
      if (!appt) return;
      const addonIds = (appt.addons || [])
        .map((a) => a.addon_id ?? a.id ?? a.addon?.id)
        .filter(Boolean);

      const payload = {
        fromRebook: true,
        service_id: appt.service_id,
        addon_ids: addonIds,
        employee_id: appt.employee_id,
      };

      localStorage.setItem("selectedService", JSON.stringify(payload));
      localStorage.setItem("lockEmployeeSelection", "true");

      const salonInfo = {
        id: appt.salon_id,
        name: appt.salon_name,
        city: appt.salon_city,
        street: appt.salon_street,
        street_number: appt.salon_street_number,
      };
      localStorage.setItem("selectedSalon", JSON.stringify(salonInfo));

      navigate("/booking");
    },
    [navigate]
  );

  const formatTime = (t) => (t ? t.slice(0, 5) : "");

  // ⏳ Widok
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        Ładowanie danych...
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen px-5 py-8 font-sans ${
        isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      <header className="mb-6">
        <h1 className="text-3xl font-semibold mb-2">
          {user ? `Cześć, ${user.name?.split(" ")[0]}!` : "Witaj!"}
        </h1>
        <p
          className={`text-sm ${
            isDark ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Znajdź najlepszego barbera lub stylistę w pobliżu
        </p>
      </header>

      <div className="relative mb-8">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 ${
            isDark ? "text-gray-400" : "text-gray-500"
          }`}
          size={20}
        />
        <input
          type="text"
          placeholder="Szukaj salonu, usługi lub miasta..."
          value={search}
          onFocus={() => setShowAdvancedSearch(true)}
          readOnly
          className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-[${PRIMARY}] ${
            isDark
              ? "bg-gray-800 text-gray-200 placeholder-gray-500 cursor-pointer"
              : "bg-white text-gray-900 placeholder-gray-400 cursor-pointer"
          }`}
        />
      </div>

      <AppointmentCard
        nextAppointment={nextAppointment}
        lastAppointment={lastAppointment}
        isDark={isDark}
        formatTime={formatTime}
        showAppointmentDetails={showAppointmentDetails}
        setShowAppointmentDetails={setShowAppointmentDetails}
        handleRebook={handleRebook}
      />

      <h2 className="text-xl font-semibold mb-4">Polecane salony</h2>
      {filteredSalons.length === 0 ? (
        <p className={isDark ? "text-gray-500" : "text-gray-600"}>
          Brak salonów spełniających kryteria.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {filteredSalons.map((salon, i) => (
            <SalonCard
              key={salon.id}
              salon={salon}
              index={i}
              isDark={isDark}
              backendBase={backendBase}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdvancedSearch && (
          <AdvancedSearchModal
            onClose={() => setShowAdvancedSearch(false)}
            backendBase={backendBase}
            navigate={navigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// 🧩 Karta wizyty
const AppointmentCard = React.memo(
  ({
    nextAppointment,
    lastAppointment,
    isDark,
    formatTime,
    showAppointmentDetails,
    setShowAppointmentDetails,
    handleRebook,
  }) => {
    const appt = nextAppointment || lastAppointment;
    if (!appt)
      return (
        <div
          className={`rounded-xl p-5 mb-6 border text-center text-sm shadow-sm ${
            isDark
              ? "bg-gray-900 border-gray-700 text-gray-400"
              : "bg-white border-gray-200 text-gray-600"
          }`}
        >
          Nie masz jeszcze żadnych wizyt.
        </div>
      );

    return (
      <div
        className={`rounded-xl p-5 mb-6 border shadow-sm ${
          isDark
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {nextAppointment
                ? "Moja najbliższa wizyta"
                : "Moja ostatnia wizyta"}
            </h3>
            <p
              className={`text-sm mt-0.5 ${
                isDark ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {appt.service_name} ·{" "}
              {new Date(appt.date).toLocaleDateString("pl-PL", {
                day: "numeric",
                month: "long",
              })}{" "}
              o {formatTime(appt.start_time)}
            </p>
          </div>
          <button
            onClick={() =>
              setShowAppointmentDetails(!showAppointmentDetails)
            }
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
              isDark
                ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {showAppointmentDetails ? "Ukryj" : "Szczegóły"}
          </button>
        </div>

        <AnimatePresence>
          {showAppointmentDetails && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.25 }}
              className={`mt-4 text-sm border-t pt-3 space-y-3 ${
                isDark
                  ? "border-gray-700 text-gray-300"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {appt.addons?.length > 0 && (
                <div className="pb-2 border-b mb-2">
                  <h4 className="text-sm font-medium mb-1.5">Dodatki</h4>
                  <ul className="text-sm space-y-1.5">
                    {appt.addons.map((a, idx) => (
                      <li
                        key={idx}
                        className={`flex justify-between ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        <span>{a.addon_name}</span>
                        <span className="text-gray-400 text-xs">
                          +{a.addon_price} zł ·{" "}
                          {a.addon_duration ? `${a.addon_duration} min` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-y-2">
                <Info label="Pracownik" value={appt.employee_name} />
                <Info
                  label="Data"
                  value={new Date(appt.date).toLocaleDateString("pl-PL")}
                />
                <Info
                  label="Godzina"
                  value={`${formatTime(appt.start_time)} – ${formatTime(
                    appt.end_time
                  )}`}
                />
                <Info
                  label="Cena łączna"
                  value={`${(
                    (+appt.service_price || 0) +
                    (appt.addons?.reduce(
                      (s, a) => s + (+a.addon_price || 0),
                      0
                    ) || 0)
                  ).toFixed(2)} zł`}
                />
              </div>

              {!nextAppointment && (
                <div className="pt-3">
                  <button
                    onClick={() => handleRebook(appt)}
                    className="w-full rounded-lg py-2.5 text-sm font-medium bg-[#E57B2C] text-white hover:bg-[#d36f25]"
                  >
                    Umów ponownie
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

const SalonCard = React.memo(({ salon, index, isDark, backendBase }) => {
  const navigate = useNavigate();
  const [average, setAverage] = useState(null);
  const [total, setTotal] = useState(null);

  useEffect(() => {
    if (!salon?.id) return;
    const fetchRating = async () => {
      try {
        const res = await axios.get(
          `${backendBase}/api/reviews/by-salon/${salon.id}`
        );
        setAverage(Number(res.data.average) || 0);
        setTotal(Number(res.data.total) || 0);
      } catch (err) {
        console.error("❌ Błąd pobierania ocen salonu:", err);
        setAverage(0);
        setTotal(0);
      }
    };
    fetchRating();
  }, [salon?.id, backendBase]);

  return (
    <motion.div
      key={salon.id}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      whileHover={{ scale: 1.02 }}
      className={`rounded-2xl overflow-hidden border shadow-md cursor-pointer ${
        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
      onClick={() => {
        localStorage.removeItem("selectedService");
        localStorage.removeItem("lockEmployeeSelection");
        localStorage.setItem("selectedSalon", JSON.stringify(salon));
        navigate("/services");
      }}
    >
      <div
        className={`h-44 w-full overflow-hidden flex items-center justify-center ${
          isDark ? "bg-gray-900" : "bg-gray-100"
        }`}
      >
        {salon.image_url ? (
          <img
            loading="lazy"
            decoding="async"
            src={`${backendBase}/uploads/${salon.image_url}?w=500&fit=cover`}
            srcSet={`${backendBase}/uploads/${salon.image_url}?w=400 400w, ${backendBase}/uploads/${salon.image_url}?w=800 800w`}
            sizes="(max-width: 768px) 100vw, 33vw"
            alt={salon.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.parentElement.innerHTML =
                '<div class="flex items-center justify-center text-gray-400 text-sm">Brak zdjęcia 📷</div>';
            }}
          />
        ) : (
          <div
            className={`text-sm flex flex-col items-center justify-center h-full ${
              isDark ? "text-gray-500" : "text-gray-400"
            }`}
          >
            <span className="text-2xl mb-1">📷</span>
            <span>Brak zdjęcia</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-lg font-semibold mb-1 truncate">
          {salon.name}
        </h3>

        <div
          className={`flex items-center text-sm mb-1 ${
            isDark ? "text-gray-300" : "text-gray-600"
          }`}
        >
          <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1" />
          <span>{!isNaN(average) ? Number(average).toFixed(1) : "—"}</span>
          <span
            className={`ml-1 ${
              isDark ? "text-gray-500" : "text-gray-400"
            }`}
          >
            · {total ?? 0} opinii
          </span>
        </div>

        <div
          className={`flex items-center text-sm ${
            isDark ? "text-gray-400" : "text-gray-500"
          }`}
        >
          <MapPin
            size={16}
            className={`mr-1 ${
              isDark ? "text-gray-500" : "text-gray-400"
            }`}
          />
          <span className="truncate">
            {salon.city}, {salon.street} {salon.street_number}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

const Info = ({ label, value }) => (
  <div>
    <span className="block text-xs text-gray-500">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);
