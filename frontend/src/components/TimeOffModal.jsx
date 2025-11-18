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
    onUpdated,
    employees: employeesProp,
}) {
    const backendBase = import.meta.env.VITE_API_URL;
    const { firebaseUser } = useAuth();

    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);
    const [employees, setEmployees] = useState([]);

    const [isProvider, setIsProvider] = useState(false);
    const [selfEmployeeId, setSelfEmployeeId] = useState(null);

    // set employees from props
    useEffect(() => {
        setEmployees(employeesProp || []);
    }, [employeesProp]);

    // Load role
    useEffect(() => {
        const loadRole = async () => {
            if (!firebaseUser) return;
            const token = await firebaseUser.getIdToken();

            const res = await axios.get(`${backendBase}/api/vacations/init`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setIsProvider(res.data.is_provider);

            if (!res.data.is_provider) {
                setSelfEmployeeId(res.data.employees?.[0]?.id ?? null);
            }
        };

        loadRole();
    }, [firebaseUser]);

    // Load real employee data (fix!)
    useEffect(() => {
        const loadSelfEmployee = async () => {
            if (!firebaseUser) return;
            const token = await firebaseUser.getIdToken();

            const res = await axios.get(`${backendBase}/api/me/employee`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.data?.id) {
                setSelfEmployeeId(res.data.id);

                // ensure employee appears in dropdown
                setEmployees((prev) =>
                    prev.some(
                        (e) =>
                            Number(e.employee_id) === Number(res.data.id) ||
                            Number(e.id) === Number(res.data.id)
                    )
                        ? prev
                        : [
                            ...prev,
                            {
                                employee_id: res.data.id,
                                employee_name: res.data.name,
                            },
                        ]
                );
            }
        };

        loadSelfEmployee();
    }, [firebaseUser]);

    // set form values
    useEffect(() => {
        if (!timeOff || Object.keys(timeOff).length === 0) {
            setForm(initialForm);
            return;
        }

        setForm({
            id: Number(timeOff.id),
            employee_id: timeOff.employee_id ?? null,
            date: fixDate(timeOff.date),
            start_time: timeOff.start_time ?? "",
            end_time: timeOff.end_time ?? "",
            reason: timeOff.reason ?? "",
        });
    }, [timeOff]);

    // auto-assign employee if not provider
    useEffect(() => {
        if (!form.id && !isProvider && selfEmployeeId) {
            setForm((f) => ({ ...f, employee_id: selfEmployeeId }));
        }
    }, [open, isProvider, selfEmployeeId]);

    const handleSave = async () => {
        if (!form.date || !form.start_time || !form.end_time || !form.employee_id) {
            alert("Uzupełnij wszystkie pola!");
            return;
        }

        const token = await firebaseUser?.getIdToken?.();

        const payload = {
            employee_id: form.employee_id,
            date: fixDate(form.date),
            start_time: form.start_time,
            end_time: form.end_time,
            reason: form.reason || null,
        };

        setSaving(true);
        try {
            if (form.id) {
                await axios.put(
                    `${backendBase}/api/schedule/time-off/${form.id}`,
                    payload,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
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
            alert(err.response?.data?.error || "Błąd podczas zapisu.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!form.id) return alert("Brak ID — nie można usunąć");

        if (!confirm("Czy na pewno chcesz usunąć tę blokadę?")) return;

        const token = await firebaseUser?.getIdToken?.();

        try {
            await axios.delete(`${backendBase}/api/schedule/time-off/${form.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            onClose();
            onUpdated && onUpdated();
        } catch (err) {
            alert(err.response?.data?.error || "Nie udało się usunąć blokady.");
        }
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="bg-white rounded-2xl w-full max-w-md p-6 relative shadow-2xl"
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b pb-2 mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Clock size={18} />{" "}
                                {form.id ? "Edycja blokady czasu" : "Nowa blokada czasu"}
                            </h2>
                            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        {savedPopup && (
                            <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-lg flex items-center gap-2 shadow-lg">
                                <CheckCircle size={14} /> Zapisano!
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-600">Pracownik</label>

                                <select
                                    value={form.employee_id ?? ""}
                                    disabled={!isProvider}
                                    onChange={(e) =>
                                        setForm({ ...form, employee_id: Number(e.target.value) })
                                    }
                                    className={`mt-1 w-full border rounded-lg p-2 ${!isProvider
                                            ? "bg-gray-100 opacity-70 cursor-not-allowed"
                                            : "bg-white"
                                        }`}
                                >
                                    {isProvider ? (
                                        <>
                                            <option value="">— wybierz pracownika —</option>
                                            {employees.map((emp) => (
                                                <option
                                                    key={emp.id ?? emp.employee_id}
                                                    value={emp.id ?? emp.employee_id}
                                                >
                                                    {emp.name ?? emp.employee_name}
                                                </option>
                                            ))}
                                        </>
                                    ) : (
                                        selfEmployeeId && (
                                            <option value={selfEmployeeId}>
                                                {(() => {
                                                    const emp = employees.find(
                                                        (e) =>
                                                            Number(e.employee_id) === Number(selfEmployeeId) ||
                                                            Number(e.id) === Number(selfEmployeeId)
                                                    );

                                                    return emp?.employee_name ?? emp?.name ?? "Pracownik";
                                                })()}
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600">Data</label>
                                <input
                                    type="date"
                                    className="mt-1 w-full border rounded-lg p-2"
                                    value={form.date}
                                    onChange={(e) =>
                                        setForm({ ...form, date: fixDate(e.target.value) })
                                    }
                                />
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-sm text-gray-600">Od</label>
                                    <input
                                        type="time"
                                        className="mt-1 w-full border rounded-lg p-2"
                                        value={form.start_time}
                                        onChange={(e) =>
                                            setForm({ ...form, start_time: e.target.value })
                                        }
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="text-sm text-gray-600">Do</label>
                                    <input
                                        type="time"
                                        className="mt-1 w-full border rounded-lg p-2"
                                        value={form.end_time}
                                        onChange={(e) =>
                                            setForm({ ...form, end_time: e.target.value })
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600">Powód</label>
                                <textarea
                                    className="mt-1 w-full border rounded-lg p-2"
                                    rows="3"
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-between border-t pt-4">
                            {form.id && (
                                <button
                                    onClick={handleDelete}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                >
                                    <Trash2 size={16} /> Usuń
                                </button>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-white ${saving ? "bg-gray-400" : "bg-orange-500 hover:bg-orange-600"
                                    }`}
                            >
                                <Save size={16} /> {saving ? "Zapisywanie..." : "Zapisz"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
