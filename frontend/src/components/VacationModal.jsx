import { useEffect, useState } from "react";
import axios from "axios";
import { X, Save, Calendar, User, FileText, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../components/AuthProvider";

export default function VacationModal({ open, onClose, onAdded }) {
    const { firebaseUser } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [isProvider, setIsProvider] = useState(false);

    const [vacation, setVacation] = useState({
        employee_id: "",
        start_date: "",
        end_date: "",
        reason: "",
    });

    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);

    const backendBase = import.meta.env.VITE_API_URL;

    // LOAD employees
    useEffect(() => {
        if (!open || !firebaseUser) return;

        const load = async () => {
            try {
                const token = await firebaseUser.getIdToken();

                const res = await axios.get(`${backendBase}/api/vacations/init`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        salon_id: localStorage.getItem("selected_salon_id"), // 🔥 TU DODANE
                    }
                });

                console.log("Vacation init response:", res.data);

                // PROVIDER
                if (res.data.is_provider) {
                    setIsProvider(true);

                    // scal pracowników wszystkich salonów w jedną listę
                    const merged = res.data.salons.flatMap((s) =>
                        s.employees.map((e) => ({
                            id: e.id,
                            name: `${e.name} (${s.salon_name})`,
                            salon_id: s.salon_id,
                        }))
                    );

                    console.log("Provider employees merged:", merged);

                    setEmployees(merged);

                    if (merged.length > 0) {
                        setVacation((v) => ({ ...v, employee_id: merged[0].id }));
                    }

                    return;
                }

                // EMPLOYEE
                const list = res.data.employees || [];
                setEmployees(list);
                setIsProvider(false);

                if (list.length === 1) {
                    setVacation((v) => ({ ...v, employee_id: list[0].id }));
                }

            } catch (err) {
                console.error("Vacation init error:", err);
            }
        };

        load();
    }, [open, firebaseUser, backendBase]);

    const handleSave = async () => {
        if (!vacation.employee_id || !vacation.start_date || !vacation.end_date) {
            alert("Wypełnij wszystkie wymagane pola.");
            return;
        }

        setSaving(true);

        try {
            const token = await firebaseUser.getIdToken();

            await axios.post(`${backendBase}/api/vacations`, vacation, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (onAdded) onAdded();

            setSavedPopup(true);
            setTimeout(() => {
                setSavedPopup(false);
                onClose();
            }, 800);
        } catch (err) {
            console.error("❌ Error adding vacation:", err);
            alert(err.response?.data?.error || "Błąd zapisu urlopu");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 50, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-full max-w-md bg-white dark:bg-gray-900 dark:text-gray-100 rounded-none md:rounded-2xl overflow-y-auto shadow-2xl flex flex-col"
                    >
                        {/* Toast */}
                        <AnimatePresence>
                            {savedPopup && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg"
                                >
                                    <CheckCircle size={16} /> Zapisano!
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* HEADER */}
                        <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-400 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
                            <h2 className="text-lg font-semibold">Dodaj urlop</h2>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/20 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="flex-1 p-6 space-y-6 text-gray-800 dark:text-gray-100">

                            {/* EMPLOYEE SELECT */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <User size={14} /> Pracownik
                                </label>

                                <select
                                    value={String(vacation.employee_id || "")}
                                    disabled={!isProvider}
                                    onChange={(e) =>
                                        setVacation((v) => ({
                                            ...v,
                                            employee_id: Number(e.target.value),
                                        }))
                                    }
                                    className={`
                                        mt-1 w-full border rounded-lg p-2
                                        focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500
                                        dark:bg-gray-800 dark:border-gray-700
                                        ${!isProvider
                                            ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700"
                                            : ""
                                        }
                                    `}
                                >
                                    <option value="">Wybierz...</option>
                                    {employees.map((e) => (
                                        <option key={e.id} value={String(e.id)}>
                                            {e.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* START DATE */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={14} /> Początek urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.start_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, start_date: e.target.value }))
                                    }
                                    className="
                                        mt-1 w-full border rounded-lg p-2
                                        focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500
                                        dark:bg-gray-800 dark:border-gray-700
                                    "
                                />
                            </div>

                            {/* END DATE */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={14} /> Koniec urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.end_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, end_date: e.target.value }))
                                    }
                                    className="
                                        mt-1 w-full border rounded-lg p-2
                                        focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500
                                        dark:bg-gray-800 dark:border-gray-700
                                    "
                                />
                            </div>

                            {/* REASON */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <FileText size={14} /> Powód (opcjonalnie)
                                </label>

                                <textarea
                                    value={vacation.reason}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, reason: e.target.value }))
                                    }
                                    placeholder="np. urlop wypoczynkowy"
                                    className="
                                        mt-1 w-full border rounded-lg p-2 h-24 resize-none
                                        focus:ring-2 focus:ring-orange-400 dark:focus:ring-orange-500
                                        dark:bg-gray-800 dark:border-gray-700
                                    "
                                />
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-end gap-3 px-6 py-4">
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="
                                    px-4 py-2 rounded-lg
                                    bg-gray-200 hover:bg-gray-300
                                    dark:bg-gray-700 dark:hover:bg-gray-600
                                    disabled:opacity-50
                                "
                            >
                                Anuluj
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`
                                    px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2
                                    ${saving
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-orange-500 hover:bg-orange-600"
                                    }
                                `}
                            >
                                {saving ? "Zapisywanie..." : (<><Save size={16} /> Zapisz</>)}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
