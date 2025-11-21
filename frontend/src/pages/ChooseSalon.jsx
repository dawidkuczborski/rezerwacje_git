import React, { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../components/AuthProvider";

export default function ChooseSalon() {
    const [salons, setSalons] = useState([]);
    const [loading, setLoading] = useState(true);

    const { firebaseUser } = useAuth();
    const isDark = document.documentElement.classList.contains("dark");
    const backend = import.meta.env.VITE_API_URL;

    // ---- FETCH SALONS FROM API ----
    useEffect(() => {
        if (!firebaseUser) return;

        const fetchSalons = async () => {
            try {
                const token = await firebaseUser.getIdToken();
                const res = await fetch(`${backend}/api/provider/salons`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await res.json();
                setSalons(data);
            } catch (err) {
                console.error("Błąd pobierania salonów:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSalons();
    }, [firebaseUser, backend]);

    const selectSalon = (id) => {
        localStorage.setItem("selected_salon_id", id);
        window.location.href = "/panel";
    };

    return (
        <div
            className={`min-h-screen px-5 py-8 font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
                }`}
        >
            {/* ---- HEADER ---- */}
            <div className="mb-6 text-center">
                <h1 className="text-3xl font-semibold mb-2">Wybierz salon</h1>
                <p
                    className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"
                        }`}
                >
                    Wybierz salon, w którym pracujesz
                </p>
            </div>

            {/* ---- LOADING ---- */}
            {loading && (
                <div
                    className={`rounded-xl p-5 border text-center text-sm shadow-sm ${isDark
                            ? "bg-gray-900 border-gray-700 text-gray-400"
                            : "bg-white border-gray-200 text-gray-600"
                        }`}
                >
                    Ładowanie salonów...
                </div>
            )}

            {/* ---- LISTA SALONÓW ---- */}
            <div className="space-y-4 mt-4">
                {!loading && salons.length === 0 && (
                    <div
                        className={`rounded-xl p-5 border text-center text-sm shadow-sm ${isDark
                                ? "bg-gray-900 border-gray-700 text-gray-400"
                                : "bg-white border-gray-200 text-gray-600"
                            }`}
                    >
                        Brak przypisanych salonów.
                    </div>
                )}

                {salons.map((s, i) => (
                    <motion.button
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.05 }}
                        whileTap={{ scale: 0.97 }}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => selectSalon(s.id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border shadow-md transition ${isDark
                                ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                                : "bg-white border-gray-200 hover:bg-gray-100"
                            }`}
                    >
                        {/* ---- IMAGE ---- */}
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
                            {s.image_url ? (
                                <img
                                    src={`${backend}/uploads/${s.image_url}`}
                                    alt={s.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.target.style.display = "none";
                                    }}
                                />
                            ) : (
                                <span
                                    className={`text-xs ${isDark
                                            ? "text-gray-400"
                                            : "text-gray-500"
                                        }`}
                                >
                                    Brak zdjęcia
                                </span>
                            )}
                        </div>

                        {/* ---- TEXT ---- */}
                        <div className="flex-1 text-left">
                            <div className="text-lg font-semibold mb-1">
                                {s.name}
                            </div>

                            <div
                                className={`flex items-center text-sm ${isDark
                                        ? "text-gray-300"
                                        : "text-gray-600"
                                    }`}
                            >
                                <MapPin
                                    size={16}
                                    className={`mr-1 ${isDark
                                            ? "text-gray-400"
                                            : "text-gray-500"
                                        }`}
                                />

                                {s.city && s.street ? (
                                    <span className="truncate">
                                        {s.city}, {s.street} {s.street_number}
                                    </span>
                                ) : (
                                    <span>Brak adresu</span>
                                )}
                            </div>
                        </div>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
