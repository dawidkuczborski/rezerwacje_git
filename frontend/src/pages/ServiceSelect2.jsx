import React, { useEffect, useState } from "react";
import axios from "axios";
import { ArrowLeft, Star, MapPin, Phone, Plus, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ServiceSelect({ onSelect }) {
  const [services, setServices] = useState([]);
  const [addons, setAddons] = useState({}); // 🔹 { [serviceId]: [addonList] }
  const [selectedAddons, setSelectedAddons] = useState({}); // 🔹 { [serviceId]: [addonId, ...] }
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("uslugi");
  const navigate = useNavigate();

  const salon = JSON.parse(localStorage.getItem("selectedSalon"));
  const backendBase = import.meta.env.VITE_API_URL;

  // --- Pobierz usługi salonu
  useEffect(() => {
    if (!salon?.id) {
      setLoading(false);
      return;
    }

    const fetchServices = async () => {
      try {
        const res = await axios.get(`${backendBase}/api/services/by-salon/${salon.id}`);
        setServices(res.data);
      } catch (err) {
        console.error("Błąd pobierania usług:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, [salon]);

  // --- Pobierz dodatki dla każdej usługi
  useEffect(() => {
    if (services.length > 0) {
      services.forEach(async (s) => {
        try {
          const res = await axios.get(`${backendBase}/api/service-addons/by-service/${s.id}`);
          setAddons((prev) => ({ ...prev, [s.id]: res.data }));
        } catch (err) {
          console.error(`Błąd pobierania dodatków dla ${s.name}:`, err);
        }
      });
    }
  }, [services]);

  const toggleAddons = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  // --- Kliknięcie dodatku (dodaj/usuń)
  const toggleAddon = (serviceId, addonId) => {
    setSelectedAddons((prev) => {
      const current = prev[serviceId] || [];
      return current.includes(addonId)
        ? { ...prev, [serviceId]: current.filter((id) => id !== addonId) }
        : { ...prev, [serviceId]: [...current, addonId] };
    });
  };

  // --- Oblicz łączny koszt i czas (usługa + wybrane dodatki)
  const calculateTotals = (service) => {
    const selected = selectedAddons[service.id] || [];
    const serviceAddons = addons[service.id] || [];
    const chosen = serviceAddons.filter((a) => selected.includes(a.id));

    const extraPrice = chosen.reduce((sum, a) => sum + Number(a.price || 0), 0);
    const extraTime = chosen.reduce((sum, a) => sum + Number(a.duration_minutes || 0), 0);

    return {
      totalPrice: Number(service.price) + extraPrice,
      totalDuration: Number(service.duration_minutes) + extraTime,
    };
  };

  // --- Wybór usługi
  const handleSelect = (service) => {
    const selected = selectedAddons[service.id] || [];
    const { totalPrice, totalDuration } = calculateTotals(service);

    const fullService = {
      ...service,
      selectedAddons: selected,
      totalPrice,
      totalDuration,
    };

    localStorage.setItem("selectedService", JSON.stringify(fullService));
    if (onSelect) onSelect(fullService);
  };

  if (!salon)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-300 bg-dark">
        ⚠️ Nie wybrano salonu.{" "}
        <a href="/salons" className="text-[#f55f36] ml-2 underline">
          Wybierz salon
        </a>
      </div>
    );

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-lg bg-dark">
        ⏳ Ładowanie usług...
      </div>
    );

  return (
    <div className="min-h-screen bg-dark text-white px-5 py-6 font-sans">
      {/* 🔹 Pasek powrotu */}
      <div className="flex items-center mb-6">
  <button
    onMouseEnter={() => import("./SalonSelect.jsx")}   // ✅ prefetch strony salonów
    onTouchStart={() => import("./SalonSelect.jsx")}   // ✅ prefetch na mobile
    onPointerDown={() => navigate("/salons")}          // ✅ przejście do /salons
    className="text-gray-300 hover:text-white transition flex items-center gap-2 active:scale-95"
    style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
  >
    <ArrowLeft size={22} />
    <span>Powrót</span>
  </button>
</div>


      {/* 🔹 Nagłówek salonu */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center flex-shrink-0">
          {salon.image_url ? (
            <img
              src={`${backendBase}/uploads/${salon.image_url}`}
              alt={salon.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-gray-500 text-sm">📷</div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <h1 className="text-2xl font-semibold mb-1">{salon.name}</h1>
          <p className="text-gray-400 text-sm mb-2">
            {salon.description || "Brak opisu salonu."}
          </p>
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <MapPin size={16} />
            <span>
              {salon.street} {salon.street_number}, {salon.city}
            </span>
          </div>
          <button className="text-[#f55f36] text-sm hover:underline mb-2 self-start">
            Jak dojechać?
          </button>
          <div className="flex items-center gap-2 text-gray-300 text-sm">
            <Phone size={16} />
            <span>{salon.phone || "Brak numeru"}</span>
          </div>
          <div className="flex items-center text-gray-300 text-sm mt-2">
            <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1" />
            <span>4,9</span>
            <span className="text-gray-500 ml-2">(487 opinii)</span>
          </div>
        </div>
      </div>

      {/* 🔹 Zakładki */}
      <div className="flex justify-around border-b border-neutral-800 mb-6 text-gray-400">
        {["uslugi", "opinie", "portfolio"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 transition ${
              activeTab === tab
                ? "border-b-2 border-[#f55f36] text-white"
                : "hover:text-white"
            }`}
          >
            {tab === "uslugi"
              ? "Usługi"
              : tab === "opinie"
              ? "Opinie"
              : "Portfolio"}
          </button>
        ))}
      </div>

      {/* 🔹 Sekcje */}
      {activeTab === "uslugi" && (
        <>
          <h2 className="text-xl font-semibold mb-4">Popularne usługi</h2>

          {services.length === 0 ? (
            <p className="text-gray-500">Brak usług w tym salonie.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {services.map((s) => {
                const { totalPrice, totalDuration } = calculateTotals(s);
                const serviceAddons = addons[s.id] || [];

                return (
                  <div key={s.id}>
                    <div className="flex items-center justify-between bg-[#1c1c1c] border border-neutral-800 rounded-2xl px-5 py-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center">
                          <img
                            src="/placeholder-service.jpg"
                            alt={s.name}
                            className="object-cover w-full h-full"
                          />
                        </div>

                        <div>
                          <h3 className="text-white font-medium text-lg">{s.name}</h3>
                          <p className="text-gray-300 mt-1 font-semibold">
                            {totalPrice.toFixed(2)} zł · {totalDuration} min
                          </p>

                          {serviceAddons.length > 0 && (
                            <button
                              onClick={() => toggleAddons(s.id)}
                              className="flex items-center gap-1 mt-2 bg-neutral-700 text-gray-300 text-sm px-3 py-1 rounded-full hover:bg-neutral-600 transition"
                            >
                              <Plus size={14} /> Dodatki
                            </button>
                          )}
                        </div>
                      </div>

<button
  onMouseEnter={() => import("./Booking.jsx")}        // ✅ prefetch strony rezerwacji
  onTouchStart={() => import("./Booking.jsx")}        // ✅ prefetch na mobile
  onClick={() => {                                    // ✅ bezpieczne kliknięcie
    handleSelect(s);
    navigate("/booking");
  }}
  className="bg-[#f55f36] text-white px-6 py-2 rounded-full font-medium hover:bg-[#ff7b5a] transition shadow-sm active:scale-95"
  style={{ WebkitTapHighlightColor: "transparent" }}  // ✅ usunięto touchAction
>
  Wybierz
</button>

                    </div>

                    {/* 🔽 Dodatki */}
                    {expanded === s.id && serviceAddons.length > 0 && (
                      <div className="bg-neutral-900 border border-neutral-800 border-t-0 rounded-b-2xl px-5 py-3 text-sm text-gray-300 animate-[fadeIn_0.3s_ease]">
                        <p className="text-gray-400 mb-2">Dodatki:</p>
                        <ul className="space-y-2">
                          {serviceAddons.map((addon) => {
                            const selected =
                              selectedAddons[s.id]?.includes(addon.id) || false;
                            return (
                              <li
                                key={addon.id}
                                onClick={() => toggleAddon(s.id, addon.id)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition ${
                                  selected
                                    ? "bg-[#f55f36]/30"
                                    : "bg-neutral-800 hover:bg-neutral-700"
                                }`}
                              >
                                <div>
                                  <p className="font-medium">{addon.name}</p>
                                  <p className="text-gray-400 text-xs">
                                    +{addon.price} zł · +{addon.duration_minutes} min
                                  </p>
                                </div>
                                {selected ? (
                                  <Check className="text-[#f55f36]" size={18} />
                                ) : (
                                  <Plus size={18} />
                                )}
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
      )}

      {/* 🔹 Opinie */}
      {activeTab === "opinie" && (
        <div className="text-gray-400 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">
            Opinie klientów
          </h2>
          <p>⭐️⭐️⭐️⭐️⭐️ „Świetne cięcie, klimat jak w filmie.”</p>
          <p>⭐️⭐️⭐️⭐️ „Profesjonalnie i miło, polecam!”</p>
          <p>⭐️⭐️⭐️⭐️⭐️ „Najlepszy barber w mieście.”</p>
        </div>
      )}

      {/* 🔹 Portfolio */}
      {activeTab === "portfolio" && (
        <div className="text-gray-400">
          <h2 className="text-xl font-semibold text-white mb-4">Portfolio</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-2xl bg-neutral-800 flex items-center justify-center text-gray-600"
              >
                📸
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
