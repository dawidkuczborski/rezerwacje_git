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
                        salon_id: localStorage.getItem("selected_salon_id"),
                    }
                });

                if (res.data.is_provider) {
                    setIsProvider(true);

                    const merged = res.data.salons.flatMap((s) =>
                        s.employees.map((e) => ({
                            id: e.id,
                            name: `${e.name} (${s.salon_name})`,
                            salon_id: s.salon_id,
                        }))
                    );

                    setEmployees(merged);

                    if (merged.length > 0) {
                        setVacation((v) => ({ ...v, employee_id: merged[0].id }));
                    }
                    return;
                }

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
    }, [open, firebaseUser]);

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
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-end"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    exit={{ y: 80 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-[100dvh] bg-white dark:bg-[#1a1a1a] overflow-y-auto shadow-xl flex flex-col"

                >

                    {/* Toast */}
                    <AnimatePresence>
                        {savedPopup && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-2xl flex items-center gap-2 shadow-xl z-20"
                            >
                                <CheckCircle size={16} />
                                Zapisano!
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* HEADER — nowy styl */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-10 flex items-center justify-between text-white">
                        <h2 className="text-[20px] font-semibold flex items-center gap-2">
                            <Calendar size={22} />
                            Dodaj urlop
                        </h2>

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-xl transition"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {/* WHITE CARD */}
                    <div className="-mt-6 bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 space-y-8 flex-1 text-gray-800 dark:text-gray-100">

                        {/* EMPLOYEE */}
                        <div className="flex flex-col items-center space-y-6">

                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <User size={16} /> Pracownik
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
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 
                       rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
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
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={16} /> Początek urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.start_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, start_date: e.target.value }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 
                       dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            </div>

                            {/* END DATE */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={16} /> Koniec urlopu
                                </label>

                                <input
                                    type="date"
                                    value={vacation.end_date}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, end_date: e.target.value }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 
                       dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            </div>

                            {/* REASON */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <FileText size={16} /> Powód (opcjonalnie)
                                </label>

                                <textarea
                                    value={vacation.reason}
                                    onChange={(e) =>
                                        setVacation((v) => ({ ...v, reason: e.target.value }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 
                       dark:border-gray-700 rounded-2xl p-3 resize-none mt-1"
                                    style={{ width: "350px" }}
                                    rows={3}
                                />
                            </div>

                        </div>

                    </div>

                    {/* FOOTER */}
                    <div className="p-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-6 py-3 rounded-2xl bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
                        >
                            Anuluj
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`
                                px-6 py-3 rounded-2xl text-white font-medium flex items-center gap-2
                                ${saving ? "bg-gray-400 cursor-not-allowed" : "bg-[#e57b2c] hover:bg-[#cf6e27]"}
                            `}
                        >
                            {saving ? "Zapisywanie..." : (<><Save size={18} /> Zapisz</>)}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
