import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { MapPin, Phone, ArrowLeft, Navigation, Image, Loader2, X } from "lucide-react";

const loadGoogleMaps = (key) => {
  if (!key) return Promise.reject(new Error("Missing Google Maps API key"));
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);

  const existing = document.getElementById("gmaps-script");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.google.maps));
      existing.addEventListener("error", (e) => reject(e));
    });
  }

  const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
    key
  )}&libraries=places`;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error("Google maps failed to load"));
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

export default function JakDojazdModal({ salonId, onClose, backendBase }) {
  const GMKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [routeData, setRouteData] = useState({ route_description: "", image_urls: [] });
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [showNavChoice, setShowNavChoice] = useState(false);
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const isDark = document.documentElement.classList.contains("dark");

  // 🔹 Blokada pinch-zoom
  useEffect(() => {
    const preventZoom = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchmove", preventZoom, { passive: false });
    return () => document.removeEventListener("touchmove", preventZoom);
  }, []);

  // 🔹 Pobranie danych salonu i geolokalizacji
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const stored = JSON.parse(localStorage.getItem("selectedSalon"));
        if (stored && stored.id === salonId) {
          setSalon(stored);
        } else {
          const res = await axios.get(`${backendBase}/api/salons/${salonId}`);
          setSalon(res.data);
        }

        const routeRes = await axios.get(`${backendBase}/api/salons/${salonId}/route`);
        setRouteData(routeRes.data || { route_description: "", image_urls: [] });

        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => setUserPos(null),
            { enableHighAccuracy: true, timeout: 7000 }
          );
        }

        const target = stored || (await axios.get(`${backendBase}/api/salons/${salonId}`)).data;
        const fullAddress = `${target.street || ""} ${target.street_number || ""}, ${
          target.postal_code || ""
        } ${target.city || ""}`.trim();

        if (fullAddress) {
          const geo = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              fullAddress
            )}`
          );
          if (geo.data && geo.data.length > 0) {
            setCoords({
              lat: parseFloat(geo.data[0].lat),
              lng: parseFloat(geo.data[0].lon),
            });
          }
        }

        if (GMKEY) {
          await loadGoogleMaps(GMKEY);
          setMapsReady(true);
        } else {
          setMapsReady(false);
        }
      } catch (err) {
        console.error("❌ Błąd ładowania danych dojazdu:", err);
      } finally {
        setLoading(false);
      }
    };

    if (salonId) load();
  }, [salonId, backendBase]);

  // 🔹 Inicjalizacja mapy
  useEffect(() => {
    if (!mapsReady || !coords || !mapContainerRef.current) return;

    const google = window.google;
    const center = new google.maps.LatLng(coords.lat, coords.lng);
    const map = new google.maps.Map(mapContainerRef.current, {
      center,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: isDark
        ? [
            { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1f2937" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
          ]
        : [],
    });

    mapRef.current = map;

    const marker = new google.maps.Marker({
      position: center,
      map,
      title: salon?.name || "Salon",
    });

    const infoWindow = new google.maps.InfoWindow({
      disableAutoPan: false,
      content: `
        <div style="
          font-family: 'Inter', sans-serif;
          background: #fff;
          color: #111827;
          padding: 4px 8px 5px 8px;
          line-height: 1.3;
          font-size: 13px;
          border-radius: 6px;
          box-shadow: none;
        ">
          <div style="font-weight:600; font-size:13.5px; margin-bottom:2px;">
            ${salon?.name || "Salon"}
          </div>
          <div>${salon?.street || ""} ${salon?.street_number || ""}</div>
          <div>${salon?.postal_code || ""} ${salon?.city || ""}</div>
        </div>
      `,
    });

    google.maps.event.addListener(infoWindow, "domready", () => {
      const closeButtons = document.querySelectorAll(".gm-ui-hover-effect");
      closeButtons.forEach((btn) => (btn.style.display = "none"));
    });

    marker.addListener("click", () => infoWindow.open(map, marker));
    map.addListener("click", () => infoWindow.close());

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({ map });
    directionsRendererRef.current = directionsRenderer;

    if (userPos) {
      directionsService.route(
        {
          origin: new google.maps.LatLng(userPos.lat, userPos.lng),
          destination: center,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK") {
            directionsRenderer.setDirections(result);
            const bounds = new google.maps.LatLngBounds();
            result.routes[0].overview_path.forEach((p) => bounds.extend(p));
            map.fitBounds(bounds, 60);
          } else {
            map.setCenter(center);
            map.setZoom(15);
          }
        }
      );
    } else {
      map.setCenter(center);
      map.setZoom(15);
    }

    return () => {
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
      mapRef.current = null;
    };
  }, [mapsReady, coords, userPos, salon, isDark]);

  // 🔹 Nawigacja (po adresie)
  const openInGoogleMaps = () => {
    const address = `${salon?.street || ""} ${salon?.street_number || ""}, ${
      salon?.postal_code || ""
    } ${salon?.city || ""}`.trim();
    const encoded = encodeURIComponent(address);
    const originParam = userPos ? `&saddr=${userPos.lat},${userPos.lng}` : "";
    const appUrl = `comgooglemaps://?daddr=${encoded}${originParam}&directionsmode=driving`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}${originParam}&travelmode=driving`;
    window.location.href = appUrl;
    setTimeout(() => (window.location.href = webUrl), 1000);
  };

  const openInAppleMaps = () => {
    const address = `${salon?.street || ""} ${salon?.street_number || ""}, ${
      salon?.postal_code || ""
    } ${salon?.city || ""}`.trim();
    const encoded = encodeURIComponent(address);
    const originParam = userPos ? `${userPos.lat},${userPos.lng}` : "";
    window.location.href = `maps://?saddr=${originParam}&daddr=${encoded}`;
  };

  const handleNavigate = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) setShowNavChoice(true);
    else openInGoogleMaps();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className={`fixed inset-0 z-[9999] ${
        isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      } flex flex-col overscroll-none`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Górny pasek */}
      <div
        className={`flex items-center gap-2 px-5 py-4 border-b ${
          isDark ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <button
          onClick={onClose}
          className={`flex items-center gap-2 ${
            isDark
              ? "text-gray-300 hover:text-white"
              : "text-gray-600 hover:text-gray-900"
          } transition`}
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Powrót</span>
        </button>
      </div>

      {/* Treść */}
      <div className="flex-1 overflow-y-scroll px-5 pb-8 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <Loader2 className="animate-spin mr-2" /> Ładowanie danych...
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold mt-4 mb-2">{salon?.name}</h2>

            <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                <span>
                  {salon?.street} {salon?.street_number}, {salon?.postal_code} {salon?.city}
                </span>
              </div>
              {salon?.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={16} />
                  <span>{salon.phone}</span>
                </div>
              )}
            </div>

            {/* Opis */}
            {routeData.route_description ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-line leading-relaxed">
                {routeData.route_description}
              </p>
            ) : (
              <p className="text-gray-500 text-sm mb-4">Brak opisu trasy.</p>
            )}

            {/* Zdjęcia */}
            {routeData.image_urls?.length > 0 ? (
  <div className="relative w-full overflow-x-auto scrollbar-none mb-6">
    <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>

    <div className="flex gap-3 px-1">
      {routeData.image_urls.map((url, i) => (
        <motion.img
          key={i}
          src={url}
          alt={`Jak dojechać ${i}`}
          onClick={() => setActiveImage(url)}
          className="flex-shrink-0 w-[85%] sm:w-[60%] h-56 object-cover rounded-2xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition"
          whileTap={{ scale: 0.97 }}
        />
      ))}
    </div>

    {/* 🔸 Drobne wskaźniki pod spodem */}
    {routeData.image_urls.length > 1 && (
      <div className="flex justify-center mt-3 gap-1">
        {routeData.image_urls.map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 bg-gray-400/40 rounded-full"
          ></div>
        ))}
      </div>
    )}
  </div>
) : (
  <div className="flex flex-col items-center justify-center text-gray-400 text-sm mt-4 mb-6">
    <Image size={22} />
    <p>Brak zdjęć dojazdu</p>
  </div>
)}


            {/* Mapa */}
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
              {mapsReady && coords ? (
                <div ref={mapContainerRef} style={{ width: "100%", height: 260 }} />
              ) : (
                <div
                  style={{ width: "100%", height: 260 }}
                  className="flex items-center justify-center text-gray-400"
                >
                  <div className="text-center p-4">
                    <p className="mb-2">Mapa niedostępna</p>
                    <p className="text-sm">Sprawdź klucz Google Maps lub połączenie.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Przycisk Nawiguj */}
            <button
              onClick={handleNavigate}
              className="w-full flex items-center justify-center gap-2 bg-[#E57B2C] hover:bg-[#d96b1c] text-white py-3 rounded-xl font-medium transition"
            >
              <Navigation size={18} /> Nawiguj
            </button>
          </>
        )}
      </div>

      {/* Modal powiększonego zdjęcia */}
      <AnimatePresence>
        {activeImage && (
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveImage(null)}
          >
            <motion.img
              src={activeImage}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            />
            <button
              className="absolute top-6 right-6 text-white bg-black/50 p-2 rounded-full"
              onClick={() => setActiveImage(null)}
            >
              <X size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal wyboru map */}
      {showNavChoice && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]"
          onClick={() => setShowNavChoice(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-[85%] max-w-sm shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Otwórz nawigację w:
            </h3>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  openInGoogleMaps();
                  setShowNavChoice(false);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#E57B2C] hover:bg-[#d96b1c] text-white py-2 rounded-lg font-medium transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  width="20"
                  height="20"
                >
                  <path
                    fill="#fff"
                    d="M24 9.5c3.9 0 6.5 1.7 8 3.1l5.9-5.9C34.9 3.7 30 2 24 2 14.9 2 7.2 6.7 3.3 13.9l6.8 5.3C12.1 12.7 17.5 9.5 24 9.5z"
                  />
                </svg>
                Google Maps
              </button>

              <button
                onClick={() => {
                  openInAppleMaps();
                  setShowNavChoice(false);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#E57B2C] hover:bg-[#d96b1c] text-white py-2 rounded-lg font-medium transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="white"
                >
                  <path d="M16.365 1.43c-.97.048-2.126.676-2.805 1.483-.612.73-1.117 1.826-.92 2.89 1.098.034 2.228-.557 2.89-1.36.633-.771 1.11-1.856.835-3.013zM21.75 17.25c-.492 1.136-1.083 2.25-1.968 3.282-.76.88-1.732 1.91-3.028 1.918-1.214.007-1.606-.732-3.032-.726-1.427.006-1.852.731-3.066.724-1.296-.008-2.272-1.034-3.032-1.915-.884-1.032-1.475-2.146-1.967-3.282-1.043-2.404-1.865-6.79.775-9.237.847-.79 1.977-1.27 3.129-1.287 1.227-.012 2.38.804 3.032.804.633 0 1.937-.99 3.27-.847.554.022 2.109.223 3.115 1.702-1.181.74-1.986 2.077-1.97 3.516.024 2.078 1.311 4.08 3.3 4.866-.257.676-.537 1.347-.828 2.042z" />
                </svg>
                Apple Maps
              </button>

              <button
                onClick={() => setShowNavChoice(false)}
                className="mt-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
