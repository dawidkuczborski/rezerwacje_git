import { useEffect, useState } from "react";
import axios from "axios";
import { X, Save, Calendar, User, FileText, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../components/AuthProvider";

export default function VacationModal({ open, onClose, onAdded }) {
    const { firebaseUser } = useAuth(); // <-- 🔥 KLUCZOWE!

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
                const token = await firebaseUser.getIdToken(); // 🔥 REQUIRED

                const res = await axios.get(
                    `${backendBase}/api/vacations/init`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                const list = res.data.employees || [];
                setEmployees(list);
                setIsProvider(res.data.is_provider);

                // auto select if only 1
                if (!res.data.is_provider && list.length === 1) {
                    setVacation(v => ({ ...v, employee_id: list[0].id }));
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
            const token = await firebaseUser.getIdToken(); // 🔥 again

            await axios.post(
                `${backendBase}/api/vacations`,
                vacation,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (onAdded) onAdded(); // bez await


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
                        className="w-full h-full max-w-md bg-white rounded-2xl overflow-y-auto shadow-2xl flex flex-col"
                    >
                        {/* SUCCESS toast */}
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
                        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-blue-400 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
                            <h2 className="text-lg font-semibold">Dodaj urlop</h2>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 p-6 space-y-6 text-gray-800">

                            {/* EMPLOYEE */}
                            <div>
                                <label className="text-sm text-gray-500 flex items-center gap-2">
                                    <User size={14} /> Pracownik
                                </label>

                                <select
                                    value={vacation.employee_id}
                                    disabled={!isProvider}
                                    onChange={(e) =>
                                        setVacation((v) => ({
                                            ...v,
                                            employee_id: Number(e.target.value)
                                        }))
                                    }
                                    className={`mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-400
                                        ${!isProvider ? "bg-gray-100 opacity-70 cursor-not-allowed" : ""}`}
                                >
                                    <option value="">Wybierz...</option>
                                    {employees.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* START DATE */}
                            <div>
                                <label className="text-sm text-gray-500 flex items-center gap-2">
                                    <Calendar size={14} /> Początek urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.start_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, start_date: e.target.value }))
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-400"
                                />
                            </div>

                            {/* END DATE */}
                            <div>
                                <label className="text-sm text-gray-500 flex items-center gap-2">
                                    <Calendar size={14} /> Koniec urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.end_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, end_date: e.target.value }))
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-400"
                                />
                            </div>

                            {/* REASON */}
                            <div>
                                <label className="text-sm text-gray-500 flex items-center gap-2">
                                    <FileText size={14} /> Powód (opcjonalnie)
                                </label>

                                <textarea
                                    value={vacation.reason}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, reason: e.target.value }))
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 h-24 resize-none focus:ring-2 focus:ring-blue-400"
                                    placeholder="np. urlop wypoczynkowy"
                                />
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="sticky bottom-0 bg-gray-50 border-t flex justify-end gap-3 px-6 py-4">
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                            >
                                Anuluj
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${saving
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-blue-500 hover:bg-blue-600"
                                    }`}
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
