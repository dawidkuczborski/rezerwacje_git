import { useEffect, useState } from "react";

export default function ProviderSalonSelector({ salons, onSelect }) {
    const [selected, setSelected] = useState(() =>
        localStorage.getItem("selected_salon_id") || ""
    );

    const handleChoose = () => {
        if (!selected) return;
        localStorage.setItem("selected_salon_id", selected);
        onSelect(selected);
    };

    return (
        <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Wybierz salon</h2>

            <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full p-3 border rounded-xl"
            >
                <option value="">ó wybierz ó</option>
                {salons.map((s) => (
                    <option key={s.id} value={s.id}>
                        {s.name}
                    </option>
                ))}
            </select>

            <button
                onClick={handleChoose}
                className="mt-4 w-full p-3 bg-orange-500 text-white font-semibold rounded-xl"
            >
                Zatwierdü
            </button>
        </div>
    );
}
