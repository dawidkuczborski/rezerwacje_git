import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Trash2, Calendar, FileText } from "lucide-react";
import { useAuth } from "./AuthProvider";
import axios from "axios";

export default function EditVacationModal({
    open,
    onClose,
    vacation,
    onUpdated,
    onDeleted
}) {
    const { firebaseUser, backendUser } = useAuth();
    const backend = import.meta.env.VITE_API_URL;

    const isProvider = backendUser?.is_provider === true;

    const [form, setForm] = useState({
        start_date: "",
        end_date: "",
        reason: "",
    });

    const [saving, setSaving] = useState(false);

    const formatForInput = (d) => {
        if (!d) return "";
        const date = new Date(d);
        return date.toISOString().split("T")[0];
    };

    useEffect(() => {
        if (vacation) {
            setForm({
                start_date: formatForInput(vacation.start_date),
                end_date: formatForInput(vacation.end_date),
                reason: vacation.reason || "",
            });
        }
    }, [vacation]);

    if (!open || !vacation) return null;

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await firebaseUser.getIdToken();

            await axios.put(`${backend}/api/vacations/${vacation.id}`, form, {
                headers: { Authorization: `Bearer ${token}` }
            });

            onUpdated && onUpdated();
        } catch (err) {
            alert(err.response?.data?.error || "Błąd zapisywania zmian");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Na pewno chcesz usunąć ten urlop?")) return;

        try {
            const token = await firebaseUser.getIdToken();

            await axios.delete(`${backend}/api/vacations/${vacation.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            onDeleted && onDeleted();
        } catch (err) {
            alert(err.response?.data?.error || "Błąd podczas usuwania urlopu");
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-end"
            >
                <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    exit={{ y: 80 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-[100dvh] bg-white dark:bg-[#1a1a1a] overflow-y-auto shadow-xl flex flex-col"

                >

                    {/* HEADER — identycznie jak VacationModal */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-10 flex items-center justify-between text-white">
                        <h2 className="text-[20px] font-semibold flex items-center gap-2">
                            <Calendar size={22} />
                            Edytuj urlop
                        </h2>

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-xl transition"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {/* WHITE AREA — identyczny styl */}
                    <div className="-mt-6 bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-8 space-y-8 flex-1 text-gray-800 dark:text-gray-100">

                        <div className="flex flex-col items-center space-y-6">

                            {/* START DATE */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 font-sans">
                                    <Calendar size={16} /> Początek urlopu
                                </label>

                                <input
                                    type="date"
                                    value={form.start_date}
                                    onChange={(e) =>
                                        setForm({ ...form, start_date: e.target.value })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 
                       rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            </div>

                            {/* END DATE */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 font-sans">
                                    <Calendar size={16} /> Koniec urlopu
                                </label>

                                <input
                                    type="date"
                                    value={form.end_date}
                                    onChange={(e) =>
                                        setForm({ ...form, end_date: e.target.value })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 
                       rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            </div>

                            {/* REASON */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 font-sans">
                                    <FileText size={16} /> Powód (opcjonalnie)
                                </label>

                                <textarea
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 
                       rounded-2xl p-3 resize-none mt-1"
                                    style={{ width: "350px" }}
                                    rows={3}
                                />
                            </div>

                        </div>

                    </div>

                    {/* FOOTER */}
                    <div className="p-6 flex justify-between items-center">

                        {isProvider && (
                            <button
                                onClick={handleDelete}
                                className="px-6 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2"
                            >
                                <Trash2 size={18} /> Usuń
                            </button>
                        )}

                        <button
                            disabled={saving}
                            onClick={handleSave}
                            className={`
                                ml-auto px-6 py-3 rounded-2xl text-white font-medium flex items-center gap-2
                                ${saving ? "bg-gray-400" : "bg-[#e57b2c] hover:bg-[#cf6e27]"}
                            `}
                        >
                            <Save size={18} />
                            {saving ? "Zapisywanie…" : "Zapisz"}
                        </button>
                    </div>

                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
