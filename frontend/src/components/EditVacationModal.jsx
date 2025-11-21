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

    // Format date to YYYY-MM-DD
    const formatForInput = (d) => {
        if (!d) return "";
        const date = new Date(d);
        return date.toISOString().split("T")[0];
    };

    // Load vacation into form
    useEffect(() => {
        if (vacation) {
            setForm({
                start_date: formatForInput(vacation.start_date),
                end_date: formatForInput(vacation.end_date),
                reason: vacation.reason || ""
            });
        }
    }, [vacation]);

    if (!open || !vacation) return null;

    // SAVE
    const handleSave = async () => {
        setSaving(true);

        try {
            const token = await firebaseUser.getIdToken();

            await axios.put(
                `${backend}/api/vacations/${vacation.id}`,
                form,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Update vacation error:", err);
            alert(err.response?.data?.error || "B³¹d zapisywania zmian");
        } finally {
            setSaving(false);
        }
    };

    // DELETE
    const handleDelete = async () => {
        if (!confirm("Na pewno chcesz usun¹æ ten urlop?")) return;

        try {
            const token = await firebaseUser.getIdToken();

            await axios.delete(`${backend}/api/vacations/${vacation.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (onDeleted) onDeleted();
        } catch (err) {
            console.error("Delete vacation error:", err);
            alert(err.response?.data?.error || "B³¹d podczas usuwania urlopu");
        }
    };

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
                        {/* HEADER */}
                        <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-400 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
                            <h2 className="text-lg font-semibold font-sans">Edytuj urlop</h2>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/20 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="flex-1 p-6 space-y-6">

                            {/* START DATE */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="font-sans text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={14} /> Pocz¹tek urlopu
                                </label>

                                <input
                                    type="date"
                                    value={form.start_date}
                                    onChange={(e) =>
                                        setForm({ ...form, start_date: e.target.value })
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700"
                                />
                            </div>

                            {/* END DATE */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="font-sans text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Calendar size={14} /> Koniec urlopu
                                </label>

                                <input
                                    type="date"
                                    value={form.end_date}
                                    onChange={(e) =>
                                        setForm({ ...form, end_date: e.target.value })
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700"
                                />
                            </div>

                            {/* REASON */}
                            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                <label className="font-sans text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <FileText size={14} /> Powód (opcjonalnie)
                                </label>

                                <textarea
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                    placeholder="np. urlop wypoczynkowy"
                                    className="mt-1 w-full border rounded-lg p-2 h-24 resize-none dark:bg-gray-800 dark:border-gray-700"
                                />
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-between gap-3 px-6 py-4">

                            {isProvider && (
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2 font-sans"
                                >
                                    <Trash2 size={16} /> Usuñ
                                </button>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2 font-sans ${saving
                                        ? "bg-gray-400"
                                        : "bg-orange-500 hover:bg-orange-600"
                                    }`}
                            >
                                <Save size={16} />
                                {saving ? "Zapisywanie..." : "Zapisz"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
