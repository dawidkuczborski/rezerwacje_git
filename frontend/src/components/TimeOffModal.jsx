import React, { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Trash2, Clock, CheckCircle } from "lucide-react";
import { useAuth } from "../components/AuthProvider";

function fixDate(value) {
    if (!value) return "";
    if (typeof value === "string" && value.length === 10) return value;

    try {
        const d = new Date(value);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
        ).padStart(2, "0")}`;
    } catch {
        return value;
    }
}

const initialForm = {
    id: null,
    employee_id: null,
    date: "",
    start_time: "",
    end_time: "",
    reason: "",
};

export default function TimeOffModal({ open, onClose, timeOff, onUpdated }) {
    const backendBase = import.meta.env.VITE_API_URL;
    const { firebaseUser } = useAuth();

    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);

    const [employees, setEmployees] = useState([]);
    const [isProvider, setIsProvider] = useState(false);

    useEffect(() => {
        if (!open || !firebaseUser) return;

        const load = async () => {
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(`${backendBase}/api/vacations/init`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    salon_id: Number(localStorage.getItem("selected_salon_id"))
                }
            });

            if (res.data.is_provider) {
                setIsProvider(true);

                const merged = res.data.salons.flatMap((s) =>
                    s.employees.map((e) => ({
                        id: e.id,
                        name: `${e.name} (${s.salon_name})`
                    }))
                );

                setEmployees(merged);

                if (!timeOff && merged.length > 0)
                    setForm((f) => ({ ...f, employee_id: merged[0].id }));
            } else {
                const emp = res.data.employees?.[0];
                setIsProvider(false);
                setEmployees([{ id: emp.id, name: emp.name }]);
                setForm((f) => ({ ...f, employee_id: emp.id }));
            }
        };

        load();
    }, [open]);

    useEffect(() => {
        if (!timeOff) {
            setForm(initialForm);
            return;
        }

        setForm({
            id: Number(timeOff.id),
            employee_id: timeOff.employee_id,
            date: fixDate(timeOff.date),
            start_time: timeOff.start_time,
            end_time: timeOff.end_time,
            reason: timeOff.reason || "",
        });
    }, [timeOff]);

    const handleSave = async () => {
        if (!form.date || !form.start_time || !form.end_time || !form.employee_id) {
            alert("Uzupełnij wszystkie pola!");
            return;
        }

        setSaving(true);

        const token = await firebaseUser.getIdToken();
        const payload = {
            employee_id: form.employee_id,
            date: fixDate(form.date),
            start_time: form.start_time,
            end_time: form.end_time,
            reason: form.reason || null,
        };

        try {
            if (form.id) {
                await axios.put(
                    `${backendBase}/api/schedule/time-off/${form.id}`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            } else {
                await axios.post(
                    `${backendBase}/api/schedule/time-off`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }

            setSavedPopup(true);
            setTimeout(() => {
                setSavedPopup(false);
                onClose();
                onUpdated && onUpdated();
            }, 600);
        } catch (err) {
            alert(err.response?.data?.error || "Błąd zapisu.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!form.id) return;
        if (!confirm("Na pewno chcesz usunąć blokadę czasu?")) return;

        const token = await firebaseUser.getIdToken();

        try {
            await axios.delete(`${backendBase}/api/schedule/time-off/${form.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            onClose();
            onUpdated && onUpdated();
        } catch (err) {
            alert(err.response?.data?.error || "Błąd usuwania.");
        }
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end"
            >
                <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    exit={{ y: 80 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full min-h-[100svh] bg-white dark:bg-[#1a1a1a] overflow-y-auto shadow-xl flex flex-col"
                    style={{
                        paddingTop: "env(safe-area-inset-top)",
                        paddingBottom: "env(safe-area-inset-bottom)"
                    }}
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

                    {/* HEADER */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-10 flex items-center justify-between text-white">
                        <h2 className="text-[20px] font-semibold flex items-center gap-2">
                            <Clock size={22} />
                            {form.id ? "Edycja blokady czasu" : "Nowa blokada czasu"}
                        </h2>

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-xl transition"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {/* CONTENT */}
                    <div className="-mt-6 bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-4 py-6 flex-1">
                        <div className="flex flex-col items-center space-y-6">

                            {/* EMPLOYEE */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400">
                                    Pracownik
                                </label>
                                <select
                                    disabled={!isProvider}
                                    value={form.employee_id ?? ""}
                                    onChange={(e) =>
                                        setForm({ ...form, employee_id: Number(e.target.value) })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4"
                                    style={{ width: "350px", height: "48px" }}
                                >
                                    {employees.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* DATE */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400">
                                    Data
                                </label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) =>
                                        setForm({ ...form, date: fixDate(e.target.value) })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            </div>

                            {/* TIME RANGE */}
                            <div className="flex gap-4">

                                {/* START TIME */}
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                        Od
                                    </label>
                                    <input
                                        type="time"
                                        value={form.start_time}
                                        onChange={(e) =>
                                            setForm({ ...form, start_time: e.target.value })
                                        }
                                        className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4"
                                        style={{ width: "165px", height: "48px" }}
                                    />
                                </div>

                                {/* END TIME */}
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                        Do
                                    </label>
                                    <input
                                        type="time"
                                        value={form.end_time}
                                        onChange={(e) =>
                                            setForm({ ...form, end_time: e.target.value })
                                        }
                                        className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4"
                                        style={{ width: "165px", height: "48px" }}
                                    />
                                </div>

                            </div>

                            {/* REASON */}
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-500 dark:text-gray-400">
                                    Powód (opcjonalnie)
                                </label>
                                <textarea
                                    rows={3}
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl p-3 resize-none mt-1"
                                    style={{ width: "350px" }}
                                />
                            </div>

                        </div>


                    </div>

                    {/* FOOTER */}
                    <div className="p-6 flex justify-between items-center">
                        {form.id && (
                            <button
                                onClick={handleDelete}
                                className="px-6 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2"
                            >
                                <Trash2 size={18} />
                                Usuń
                            </button>
                        )}

                        <button
                            disabled={saving}
                            onClick={handleSave}
                            className={`ml-auto px-6 py-3 rounded-2xl text-white font-medium flex items-center gap-2 ${saving ? "bg-gray-400" : "bg-[#e57b2c] hover:bg-[#cf6e27]"}`
                            }
                        >
                            {saving ? "Zapisywanie…" : (<><Save size={18} /> Zapisz</>)}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
