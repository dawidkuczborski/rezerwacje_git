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

export default function TimeOffModal({
    open,
    onClose,
    timeOff,
    onUpdated
}) {
    const backendBase = import.meta.env.VITE_API_URL;
    const { firebaseUser } = useAuth();

    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);
    const [employees, setEmployees] = useState([]);

    const [isProvider, setIsProvider] = useState(false);
    const [selfEmployeeId, setSelfEmployeeId] = useState(null);

    // 🔥 POBIERAMY PRAWDZIWĄ LISTĘ PRACOWNIKÓW TAK JAK VacationModal
    useEffect(() => {
        const loadEmployees = async () => {
            if (!open || !firebaseUser) return;

            const token = await firebaseUser.getIdToken();

            const res = await axios.get(`${backendBase}/api/vacations/init`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    salon_id: Number(localStorage.getItem("selected_salon_id"))
                }
            });

            console.log("🔸 timeOff INIT:", res.data);

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

                // Jeśli dodajemy nową blokadę — ustaw pierwszego
                if (!timeOff && merged.length > 0) {
                    setForm((f) => ({ ...f, employee_id: merged[0].id }));
                }
            } else {
                // employee
                setIsProvider(false);
                const emp = res.data.employees?.[0];

                if (emp) {
                    setSelfEmployeeId(emp.id);
                    setEmployees([{ id: emp.id, name: emp.name }]);

                    setForm((f) => ({ ...f, employee_id: emp.id }));
                }
            }
        };

        loadEmployees();
    }, [open, firebaseUser]);

    // 🔥 Jeśli edycja → wypełnij formularz
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
                await axios.put(`${backendBase}/api/schedule/time-off/${form.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            } else {
                await axios.post(`${backendBase}/api/schedule/time-off`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
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

        if (!confirm("Na pewno chcesz usunąć blokadę?")) return;

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
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Clock size={18} />
                                {form.id ? "Edycja blokady czasu" : "Nowa blokada czasu"}
                            </h2>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/20 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="flex-1 p-6 space-y-6">

                            {/* EMPLOYEE SELECT */}
                            <div className="border-b pb-4">
                                <label className="text-sm text-gray-500">Pracownik</label>

                                <select
                                    value={form.employee_id ?? ""}
                                    disabled={!isProvider}
                                    onChange={(e) =>
                                        setForm({ ...form, employee_id: Number(e.target.value) })
                                    }
                                    className={`
                                        mt-1 w-full border rounded-lg p-2
                                        dark:bg-gray-800 dark:border-gray-700
                                        ${!isProvider && "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700"}
                                    `}
                                >
                                    {isProvider ? (
                                        <>
                                            <option value="">— wybierz —</option>
                                            {employees.map((emp) => (
                                                <option key={emp.id} value={emp.id}>
                                                    {emp.name}
                                                </option>
                                            ))}
                                        </>
                                    ) : (
                                        selfEmployeeId && (
                                            <option value={selfEmployeeId}>
                                                {employees.find(
                                                    (e) => Number(e.id) === Number(selfEmployeeId)
                                                )?.name || "Pracownik"}
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            {/* DATE */}
                            <div className="border-b pb-4">
                                <label className="text-sm text-gray-500">Data</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) =>
                                        setForm({ ...form, date: fixDate(e.target.value) })
                                    }
                                    className="mt-1 w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700"
                                />
                            </div>

                            {/* TIME RANGE */}
                            <div className="flex gap-6 border-b pb-4">
                                <div className="flex-1">
                                    <label className="text-sm text-gray-500">Od</label>
                                    <input
                                        type="time"
                                        value={form.start_time}
                                        onChange={(e) =>
                                            setForm({ ...form, start_time: e.target.value })
                                        }
                                        className="mt-1 w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700"
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="text-sm text-gray-500">Do</label>
                                    <input
                                        type="time"
                                        value={form.end_time}
                                        onChange={(e) =>
                                            setForm({ ...form, end_time: e.target.value })
                                        }
                                        className="mt-1 w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700"
                                    />
                                </div>
                            </div>

                            {/* OPTIONAL REASON */}
                            <div className="border-b pb-4">
                                <label className="text-sm text-gray-500">Powód</label>
                                <textarea
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                    rows={3}
                                    className="mt-1 w-full border rounded-lg p-2 resize-none 
                                        dark:bg-gray-800 dark:border-gray-700"
                                />
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t p-4 flex justify-between">

                            {form.id && (
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold flex items-center gap-2"
                                >
                                    <Trash2 size={16} /> Usuń
                                </button>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2
                                    ${saving ? "bg-gray-400" : "bg-orange-500 hover:bg-orange-600"}
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
