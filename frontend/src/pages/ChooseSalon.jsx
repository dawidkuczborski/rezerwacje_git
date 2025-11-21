import React, { useEffect, useState } from "react";
import { MapPin, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../components/AuthProvider";

export default function ChooseSalon() {
    const [salons, setSalons] = useState([]);
    const [loading, setLoading] = useState(true);

    const { firebaseUser } = useAuth();
    const backend = import.meta.env.VITE_API_URL;

    // FETCH SALONS
    useEffect(() => {
        if (!firebaseUser) return;

        const fetchSalons = async () => {
            try {
                const token = await firebaseUser.getIdToken();
                const res = await fetch(`${backend}/api/provider/salons`, {
                    headers: { Authorization: `Bearer ${token}` },
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
        window.location.href = "/employee/calendar";
    };

    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER w stylu Klienci/Urlopy */}
            <div className="bg-[#e57b2c] dark:bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+24px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <Building2 size={24} />
                    Wybierz salon
                </h1>
            </div>

            {/* WHITE CARD */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm">

                    {/* Loading */}
                    {loading && (
                        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                            Ładowanie salonów...
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && salons.length === 0 && (
                        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                            Brak przypisanych salonów.
                        </div>
                    )}

                    {/* LISTA SALONÓW */}
                    <div className="space-y-3 mt-2">
                        {salons.map((s, i) => (
                            <motion.button
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => selectSalon(s.id)}
                                className="w-full bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl px-5 py-4 flex items-center gap-4 text-left shadow-sm"
                            >
                                {/* IMAGE */}
                                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                    {s.image_url ? (
                                        <img
                                            src={`${backend}/uploads/${s.image_url}`}
                                            alt={s.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.style.display = "none";
                                            }}
                                        />
                                    ) : (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            Brak zdjęcia
                                        </span>
                                    )}
                                </div>

                                {/* TEXT */}
                                <div className="flex-1">
                                    <div className="text-[16px] font-semibold text-gray-900 dark:text-gray-100">
                                        {s.name}
                                    </div>

                                    <div className="flex items-center text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                                        <MapPin size={16} className="mr-1" />
                                        {s.city && s.street ? (
                                            <span className="truncate">
                                                {s.city}, {s.street} {s.street_number}
                                            </span>
                                        ) : (
                                            "Brak adresu"
                                        )}
                                    </div>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
