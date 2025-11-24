// src/pages/ServiceSelect.jsx
import React, { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import axios from "axios";
import { ArrowLeft, Star, MapPin, Phone, Plus, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JakDojazdModal from "../components/JakDojazdModal";
import Reviews from "../components/Reviews.jsx";
import SalonPortfolio from "../components/SalonPortfolio.jsx";


// Lazy-load komponent docelowy
const Booking = lazy(() => import("./Booking.jsx"));

export default function ServiceSelect({ onSelect }) {
  const [services, setServices] = useState([]);
  const [addons, setAddons] = useState({});
  const [selectedAddons, setSelectedAddons] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("uslugi");
  const [showRouteModal, setShowRouteModal] = useState(false);

  const [salon, setSalon] = useState(() =>
    JSON.parse(localStorage.getItem("selectedSalon"))
  );

  const navigate = useNavigate();
  const backendBase = import.meta.env.VITE_API_URL;
  const PRIMARY = "#E57B2C";

  // 🌓 motyw
  useEffect(() => {
    const theme = localStorage.getItem("theme") || "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);
  const isDark = document.documentElement.classList.contains("dark");

  // 🔁 Salon — aktualizacja przy wejściu
  useEffect(() => {
    const current = JSON.parse(localStorage.getItem("selectedSalon"));
    if (current && current.id !== salon?.id) setSalon(current);
  }, []);

  // ⚡️ Prefetch Booking
  useEffect(() => {
    import("./Booking.jsx");
  }, []);

  // 🧠 Główne pobieranie usług + dodatków
  useEffect(() => {
    if (!salon?.id) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const cacheKey = `services_${salon.id}`;
        const cached = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);
        const isCacheValid = cached && cacheTime && Date.now() - cacheTime < 6 * 60 * 60 * 1000; // 6h

        if (isCacheValid) {
          const parsed = JSON.parse(cached);
          setServices(parsed.services);
          setAddons(parsed.addons);
          setLoading(false);
          return;
        }

        const storedService = JSON.parse(localStorage.getItem("selectedService"));
        const fromRebook = storedService?.fromRebook;
        const rebookEmployeeId = storedService?.employee_id;

        // Pobranie usług salonu
        const res = await axios.get(`${backendBase}/api/services/by-salon/${salon.id}`);
        let allServices = res.data || [];

        // Tryb rebook → filtruj po pracowniku
        if (fromRebook && rebookEmployeeId) {
          const empRes = await axios.get(`${backendBase}/api/services/by-employee/${rebookEmployeeId}`);
          const empServices = empRes.data || [];
          allServices = allServices.filter(svc =>
            empServices.some(empSvc => empSvc.id === svc.id)
          );
        } else {
          // Filtruj tylko usługi przypisane do pracowników (asynchronicznie)
          const checks = await Promise.all(
            allServices.map(async (svc) => {
              try {
                const r = await axios.get(`${backendBase}/api/employees/by-service/${svc.id}`);
                return { svc, hasEmployees: Array.isArray(r.data) && r.data.length > 0 };
              } catch {
                return { svc, hasEmployees: false };
              }
            })
          );
          allServices = checks.filter(c => c.hasEmployees).map(c => c.svc);
        }

        // Pobierz dodatki równolegle
        const addonsMap = {};
        const addonPromises = allServices.map(async (s) => {
          try {
            const r = await axios.get(`${backendBase}/api/service-addons/by-service/${s.id}`);
            addonsMap[s.id] = r.data || [];
          } catch {
            addonsMap[s.id] = [];
          }
        });
        await Promise.all(addonPromises);

        // Cache
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ services: allServices, addons: addonsMap })
        );
        localStorage.setItem(`${cacheKey}_time`, Date.now());

        setServices(allServices);
        setAddons(addonsMap);
      } catch (err) {
        console.error("❌ Błąd pobierania usług:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [salon, backendBase]);

  // 📦 Toggle rozwijania dodatków
  const toggleAddons = useCallback((id) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const toggleAddon = useCallback((serviceId, addonId) => {
    setSelectedAddons((prev) => {
      const current = prev[serviceId] || [];
      return current.includes(addonId)
        ? { ...prev, [serviceId]: current.filter((id) => id !== addonId) }
        : { ...prev, [serviceId]: [...current, addonId] };
    });
  }, []);

  // 💰 Obliczenia
  const calculateTotals = useCallback(
    (service) => {
      const selected = selectedAddons[service.id] || [];
      const serviceAddons = addons[service.id] || [];
      const chosen = serviceAddons.filter((a) => selected.includes(a.id));
      const extraPrice = chosen.reduce((sum, a) => sum + Number(a.price || 0), 0);
      const extraTime = chosen.reduce((sum, a) => sum + Number(a.duration_minutes || 0), 0);
      return {
        totalPrice: Number(service.price) + extraPrice,
        totalDuration: Number(service.duration_minutes) + extraTime,
      };
    },
    [selectedAddons, addons]
  );

  // 🧭 Wybór usługi
  const handleSelect = useCallback(
    async (service) => {
      const selected = selectedAddons[service.id] || [];
      const { totalPrice, totalDuration } = calculateTotals(service);

      const start_time = "00:00";
      const end_time = (() => {
        const [h, m] = start_time.split(":").map(Number);
        const start = new Date();
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + totalDuration * 60000);
        return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      })();


const fullService = {
  ...service,
  selectedAddons: selected,
  totalPrice,
  totalDuration,
  start_time,
  end_time,
};

// 🧹 usuń flagę fromRebook
delete fullService.fromRebook;

localStorage.setItem("selectedService", JSON.stringify(fullService));
          // 🔐 jeśli nie zalogowany → przekieruj na login z powrotem do booking
          if (!localStorage.getItem("authToken")) {
              localStorage.setItem("redirect_after_login", "/booking");
              navigate("/login");
              return;
          }




// 🧹 wyczyść stare dane przed zapisaniem nowej usługi
localStorage.removeItem("lockEmployeeSelection");
localStorage.removeItem("booking-cache"); // reset cache booking
localStorage.removeItem("selectedEmployee");
localStorage.removeItem("selectedAddons");

// 🧠 zapisz aktualnie wybraną usługę
localStorage.setItem("selectedService", JSON.stringify(fullService));
if (onSelect) onSelect(fullService);

// ⏩ przejście do Booking
await import("./Booking.jsx");
requestAnimationFrame(() => navigate("/booking"));
  }, [selectedAddons, addons, calculateTotals, navigate, onSelect]); // <- zamknięcie funkcji

  // 💀 Stany ładowania / brak salonu
  if (!salon)
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-gray-900 text-gray-300" : "bg-gray-50 text-gray-600"}`}>
        ⚠️ Nie wybrano salonu.{" "}
        <a href="/salons" className="ml-2 underline" style={{ color: PRIMARY }}>
          Wybierz salon
        </a>
      </div>
    );


  return (
    <div className={`min-h-screen px-5 py-6 font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      {/* 🔙 Nagłówek */}
      <div className="flex items-center mb-6">
        <button
          onPointerDown={() => navigate("/salons")}
          className={`flex items-center gap-2 active:scale-95 transition ${isDark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-black"}`}
        >
          <ArrowLeft size={22} />
          <span>Powrót</span>
        </button>
      </div>

      {/* 🧾 Nagłówek salonu */}
<SalonHeader
  salon={salon}
  backendBase={backendBase}
  PRIMARY={PRIMARY}
  isDark={isDark}
  openRoute={() => setShowRouteModal(true)}
  goToOpinions={() => setActiveTab("opinie")} // 👈 dodaj to
/>



      {/* 📑 Zakładki */}
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} />

      {/* 💈 Sekcje */}
      {activeTab === "uslugi" && (
        <ServiceList
          services={services}
          addons={addons}
          expanded={expanded}
          toggleAddons={toggleAddons}
          toggleAddon={toggleAddon}
          selectedAddons={selectedAddons}
          calculateTotals={calculateTotals}
          handleSelect={handleSelect}
          isDark={isDark}
          backendBase={backendBase}
          PRIMARY={PRIMARY}
        />
      )}

      {activeTab === "opinie" && (
  <Reviews salon={salon} backendBase={backendBase} isDark={isDark} />
)}

      {activeTab === "portfolio" && (
  <Portfolio salon={salon} backendBase={backendBase} isDark={isDark} />
)}

	  
	  {showRouteModal && (
  <JakDojazdModal
    salonId={salon.id}
    backendBase={backendBase}
    onClose={() => setShowRouteModal(false)}
  />
)}

	  
	  
    </div>
  );
}

/* ===========================
      🔹 PODKOMPONENTY
=========================== */



const SalonHeader = ({ salon, backendBase, PRIMARY, isDark, openRoute, goToOpinions }) => {
  const [average, setAverage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!salon?.id) return;
    const fetchRating = async () => {
      try {
        const res = await axios.get(`${backendBase}/api/reviews/by-salon/${salon.id}`);
        setAverage(res.data.average || 0);
        setTotal(res.data.total || 0);
      } catch (err) {
        console.error("❌ Błąd pobierania ocen salonu:", err);
      }
    };
    fetchRating();
  }, [salon?.id, backendBase]);

  return (
    <div className="flex items-center gap-4 mb-8">
      <div
        className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${
          isDark ? "bg-gray-800" : "bg-gray-200"
        }`}
      >
        {salon.image_url ? (
          <img
            loading="lazy"
            src={`${backendBase}/uploads/${salon.image_url}`}
            alt={salon.name}
            className="w-full h-full object-cover"
            onError={(e) => (e.target.style.display = "none")}
          />
        ) : (
          <div className="text-gray-500 text-sm">📷</div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold mb-1">{salon.name}</h1>
        <p
          className={`text-sm mb-2 ${
            isDark ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {salon.description || "Brak opisu salonu."}
        </p>

        <div
          className={`flex items-center gap-2 text-sm mb-1 ${
            isDark ? "text-gray-400" : "text-gray-700"
          }`}
        >
          <MapPin size={16} />
          <span>
            {salon.street} {salon.street_number}, {salon.city}
          </span>
        </div>

        <div
          className={`flex items-center gap-2 text-sm mt-1 ${
            isDark ? "text-gray-300" : "text-gray-700"
          }`}
        >
          <Phone size={16} />
          <span>{salon.phone || "Brak numeru"}</span>
        </div>

        <button
          type="button"
          onClick={openRoute}
          className="text-sm hover:underline"
          style={{ color: PRIMARY }}
        >
          Jak dojechać?
        </button>

        <div
  className={`flex items-center text-sm mt-2 cursor-pointer select-none ${
    isDark
      ? "text-gray-300 hover:text-white"
      : "text-gray-700 hover:text-black"
  }`}
  onClick={goToOpinions} // 👈 kliknięcie przełącza na zakładkę "Opinie"
>
  <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1" />
  <span>{!isNaN(average) ? Number(average).toFixed(1) : "—"}</span>
  <span
    className={`ml-2 ${
      isDark ? "text-gray-500" : "text-gray-400"
    }`}
  >
    ({total} opinii)
  </span>
</div>

      </div>
    </div>
  );
};










const Tabs = ({ activeTab, setActiveTab, isDark }) => (
  <div className={`flex justify-around border-b mb-6 ${isDark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"}`}>
    {["uslugi", "opinie", "portfolio"].map((tab) => (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`pb-2 transition ${
          activeTab === tab
            ? `border-b-2 ${isDark ? "border-[#E57B2C] text-white" : "border-[#E57B2C] text-gray-900"}`
            : isDark
            ? "hover:text-white"
            : "hover:text-black"
        }`}
      >
        {tab === "uslugi" ? "Usługi" : tab === "opinie" ? "Opinie" : "Portfolio"}
      </button>
    ))}
  </div>
);

const ServiceList = React.memo(({ services, addons, expanded, toggleAddons, toggleAddon, selectedAddons, calculateTotals, handleSelect, isDark, backendBase, PRIMARY }) => (
  <>
    <h2 className="text-xl font-semibold mb-4">Popularne usługi</h2>
    {services.length === 0 ? (
      <p className={isDark ? "text-gray-500" : "text-gray-600"}>Brak usług w tym salonie.</p>
    ) : (
      <div className="flex flex-col gap-4">
        {services.map((s) => {
          const { totalPrice, totalDuration } = calculateTotals(s);
          const serviceAddons = addons[s.id] || [];
          return (
            <div key={s.id}>
              <div className={`flex items-center justify-between rounded-2xl px-5 py-4 border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ${isDark ? "bg-gray-900" : "bg-gray-100"}`}>
                    {s.image_url ? (
                      <img
                        loading="lazy"
                        src={`${backendBase}/uploads/${s.image_url}`}
                        alt={s.name}
                        className="object-cover w-full h-full"
                        onError={(e) => (e.target.style.display = "none")}
                      />
                    ) : (
                      <div className="text-gray-400 text-sm">brak</div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">{s.name}</h3>
                    <p className={`${isDark ? "text-gray-200" : "text-gray-800"} text-[15px] font-semibold`}>{totalPrice.toFixed(2)} zł</p>
                    <p className={`${isDark ? "text-gray-400" : "text-gray-500"} text-[13px]`}>{totalDuration} min</p>
                    {serviceAddons.length > 0 && (
                      <button
                        onClick={() => toggleAddons(s.id)}
                        className={`flex items-center gap-1 mt-2 text-sm px-3 py-1 rounded-full transition ${
                          isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        <Plus size={14} /> Dodatki
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleSelect(s)}
                  className="px-6 py-2 rounded-full font-medium transition shadow-sm active:scale-95"
                  style={{ background: PRIMARY, color: "#fff" }}
                >
                  Wybierz
                </button>
              </div>
              {expanded === s.id && serviceAddons.length > 0 && (
                <div className={`border-t-0 rounded-b-2xl px-5 py-3 text-sm mt-[-6px] ${isDark ? "bg-gray-900 border border-gray-700 text-gray-300" : "bg-gray-50 border border-gray-200 text-gray-700"}`}>
                  <p className={`mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Dodatki:</p>
                  <ul className="space-y-2">
                    {serviceAddons.map((addon) => {
                      const selected = selectedAddons[s.id]?.includes(addon.id) || false;
                      return (
                        <li
                          key={addon.id}
                          onClick={() => toggleAddon(s.id, addon.id)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition ${
                            selected
                              ? "bg-[#E57B2C]/30"
                              : isDark
                              ? "bg-gray-800 hover:bg-gray-700"
                              : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <div>
                            <p className="font-medium">{addon.name}</p>
                            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                              +{addon.price} zł · +{addon.duration_minutes} min
                            </p>
                          </div>
                          {selected ? <Check size={18} style={{ color: PRIMARY }} /> : <Plus size={18} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
		
		
		
		
      </div>
    )}
  </>
  
));



const Portfolio = ({ salon, backendBase, isDark }) => (
  <SalonPortfolio salon={salon} backendBase={backendBase} isDark={isDark} />
);

