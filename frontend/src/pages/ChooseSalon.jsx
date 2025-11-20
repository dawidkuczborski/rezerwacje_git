import React, { useEffect, useState } from "react";

export default function ChooseSalon() {
    const [salons, setSalons] = useState([]);

    useEffect(() => {
        console.log("🔍 [ChooseSalon] MOUNT");

        const saved = localStorage.getItem("provider_salons");

        console.log("📦 localStorage.provider_salons →", saved);

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                console.log("📋 Parsed salons:", parsed);
                setSalons(parsed);
            } catch (err) {
                console.error("❌ Błąd parsowania provider_salons:", err);
            }
        } else {
            console.log("⚠️ Brak provider_salons w localStorage!");
        }
    }, []);

    const selectSalon = (id) => {
        console.log("🟢 [ChooseSalon] Wybrano salon ID:", id);

        localStorage.setItem("selected_salon_id", id);
        console.log("💾 Zapisano selected_salon_id →", localStorage.getItem("selected_salon_id"));

        window.location.href = "/panel";
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
            <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6 text-center">
                <h1 className="text-2xl font-semibold mb-4">Wybierz salon</h1>

                {salons.length === 0 ? (
                    <p className="text-gray-500">Brak przypisanych salonów.</p>
                ) : (
                    <div className="space-y-3">
                        {salons.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => selectSalon(s.id)}
                                className="w-full py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
