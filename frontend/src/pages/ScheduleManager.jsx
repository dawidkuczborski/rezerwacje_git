import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Clock3, Edit3 } from "lucide-react";
import { motion } from "framer-motion";

export default function ScheduleManager() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);

    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    const [schedule, setSchedule] = useState([]);
    const [showScheduleForm, setShowScheduleForm] = useState(false);

    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);

    const days = [
        "Niedziela",
        "Poniedziałek",
        "Wtorek",
        "Środa",
        "Czwartek",
        "Piątek",
        "Sobota",
    ];

    const normalizeTime = (t) => {
        if (!t) return "";
        // jeśli z bazy przychodzi np. "09:00:00" to obcinamy do "09:00"
        if (t.length >= 5) return t.slice(0, 5);
        return t;
    };

    // --- Pobierz salony właściciela ---
    const loadSalons = async () => {
        try {
            const token = await firebaseUser.getIdToken();
            const resp = await axios.get(`${backendBase}/api/salons/mine/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSalons(resp.data || []);
        } catch (err) {
            console.error("❌ Błąd pobierania salonów:", err);
        }
    };

    // --- Pobierz pracowników wybranego salonu ---
    const loadEmployees = async (salonId) => {
        if (!salonId) return;
        try {
            const token = await firebaseUser.getIdToken();
            const resp = await axios.get(`${backendBase}/api/employees/mine`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { salon_id: salonId },
            });
            setEmployees(resp.data || []);
        } catch (err) {
            console.error("❌ Błąd ładowania pracowników:", err);
        }
    };

    // --- Pobierz harmonogram pracownika ---
    const loadSchedule = async (employeeId) => {
        if (!employeeId) return;
        try {
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(
                `${backendBase}/api/schedule/employee/${employeeId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (Array.isArray(res.data) && res.data.length > 0) {
                const normalized = res.data
                    .sort((a, b) => a.day_of_week - b.day_of_week)
                    .map((row) => ({
                        day_of_week: row.day_of_week,
                        open_time: normalizeTime(row.open_time),
                        close_time: normalizeTime(row.close_time),
                        is_day_off: !!row.is_day_off,
                    }));
                setSchedule(normalized);
            } else {
                // domyślny grafik: niedziela wolna, reszta 09-17
                const defaults = Array.from({ length: 7 }, (_, i) => ({
                    day_of_week: i,
                    open_time: "09:00",
                    close_time: "17:00",
                    is_day_off: i === 0,
                }));
                setSchedule(defaults);
            }
            setMsg("");
        } catch (err) {
            console.error("❌ Błąd ładowania harmonogramu:", err);
            setMsg("❌ Błąd ładowania harmonogramu");
        }
    };

    useEffect(() => {
        if (firebaseUser) loadSalons();
    }, [firebaseUser]);

    useEffect(() => {
        if (selectedSalon) {
            setSelectedEmployee(null);
            setShowScheduleForm(false);
            setSchedule([]);
            loadEmployees(selectedSalon.id);
        } else {
            setEmployees([]);
        }
    }, [selectedSalon]);

    // --- Zapis harmonogramu ---
    const saveSchedule = async () => {
        if (!selectedEmployee) {
            setMsg("⚠️ Wybierz pracownika przed zapisem!");
            return;
        }
        try {
            setLoading(true);
            const token = await firebaseUser.getIdToken();
            await axios.post(
                `${backendBase}/api/schedule/employee/${selectedEmployee.id}`,
                { schedule },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMsg("✅ Harmonogram zapisany");
        } catch (err) {
            console.error("❌ Błąd zapisu harmonogramu:", err);
            setMsg("❌ Błąd zapisu harmonogramu");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <Clock3 size={24} />
                    Godziny pracy
                </h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj harmonogramem pracy pracowników w swoich salonach.
                </p>
            </div>

            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm max-w-3xl mx-auto">
                    {/* LISTA SALONÓW */}
                    <h2 className="text-[18px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Wybierz salon:
                    </h2>

                    <div className="space-y-3 mb-6">
                        {salons.length === 0 && (
                            <div className="text-[14px] text-gray-500 dark:text-gray-400">
                                Nie masz żadnych salonów.
                            </div>
                        )}

                        {salons.map((s, i) => (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => {
                                    setSelectedSalon(s);
                                }}
                                className={`cursor-pointer bg-white dark:bg-[#2a2a2a] border rounded-3xl px-5 py-4 flex items-center gap-4 transition 
                                    ${selectedSalon?.id === s.id
                                        ? "border-[#e57b2c]"
                                        : "border-gray-200 dark:border-gray-700"
                                    }
                                    hover:shadow-md`}
                            >
                                {s.image_url && (
                                    <img
                                        src={`${backendBase}/uploads/${s.image_url}`}
                                        alt={s.name}
                                        className="w-14 h-14 rounded-2xl object-cover"
                                        onError={(e) => {
                                            e.target.style.display = "none";
                                        }}
                                    />
                                )}
                                <div className="flex-1">
                                    <div className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                                        {s.name}
                                    </div>
                                    <div className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
                                        {s.city}, {s.street} {s.street_number}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* LISTA PRACOWNIKÓW SALONU */}
                    {selectedSalon && (
                        <div className="mt-2">
                            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                                Pracownicy w salonie {selectedSalon.name}
                            </h3>

                            <div className="space-y-3 mb-5">
                                {employees.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Brak pracowników w tym salonie.
                                    </p>
                                )}

                                {employees.map((emp, i) => (
                                    <motion.div
                                        key={emp.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        onClick={async () => {
                                            setSelectedEmployee(emp);
                                            setShowScheduleForm(true);
                                            await loadSchedule(emp.id);
                                        }}
                                        className={`cursor-pointer bg-white dark:bg-[#2a2a2a] border rounded-3xl px-5 py-3 flex items-center gap-4 transition 
                                            ${selectedEmployee?.id === emp.id
                                                ? "border-[#e57b2c]"
                                                : "border-gray-200 dark:border-gray-700"
                                            }
                                            hover:shadow-md`}
                                    >
                                        {emp.image_url ? (
                                            <img
                                                src={`${backendBase}/${emp.image_url}`}
                                                alt={emp.name}
                                                className="w-12 h-12 rounded-2xl object-cover"
                                                onError={(e) => {
                                                    e.target.style.display = "none";
                                                }}
                                            />
                                        ) : (
                                            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center text-gray-500 text-xs">
                                                brak
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <div className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                                                {emp.name}
                                            </div>
                                            {emp.description && (
                                                <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {emp.description}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PRZYCISK: EDYTUJ GODZINY PRACY */}
                    {selectedSalon && selectedEmployee && (
                        <div className="flex gap-3 mb-5">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!schedule.length) {
                                        await loadSchedule(selectedEmployee.id);
                                    }
                                    setShowScheduleForm(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Edit3 size={18} />
                                Edytuj godziny pracy – {selectedEmployee.name}
                            </button>
                        </div>
                    )}

                    {/* FORMULARZ GODZIN PRACY */}
                    {selectedSalon && selectedEmployee && showScheduleForm && (
                        <div className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <Clock3 size={18} />
                                    Godziny pracy – {selectedEmployee.name}
                                </h2>
                            </div>

                            <div className="space-y-3">
                                {schedule.map((d, idx) => (
                                    <div
                                        key={idx}
                                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3"
                                    >
                                        <div className="w-full sm:w-1/3">
                                            <p className="text-[14px] font-medium text-gray-900 dark:text-gray-100">
                                                {days[d.day_of_week]}
                                            </p>
                                        </div>

                                        <div className="flex-1 flex flex-wrap items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-gray-500 dark:text-gray-400">
                                                    od
                                                </span>
                                                <input
                                                    type="time"
                                                    value={d.open_time}
                                                    onChange={(e) =>
                                                        setSchedule((prev) =>
                                                            prev.map((x, i) =>
                                                                i === idx
                                                                    ? { ...x, open_time: e.target.value }
                                                                    : x
                                                            )
                                                        )
                                                    }
                                                    className="p-2 rounded-xl bg-white dark:bg-[#0f0f0f] border border-gray-300 dark:border-gray-700 text-sm"
                                                    disabled={d.is_day_off}
                                                />
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] text-gray-500 dark:text-gray-400">
                                                    do
                                                </span>
                                                <input
                                                    type="time"
                                                    value={d.close_time}
                                                    onChange={(e) =>
                                                        setSchedule((prev) =>
                                                            prev.map((x, i) =>
                                                                i === idx
                                                                    ? { ...x, close_time: e.target.value }
                                                                    : x
                                                            )
                                                        )
                                                    }
                                                    className="p-2 rounded-xl bg-white dark:bg-[#0f0f0f] border border-gray-300 dark:border-gray-700 text-sm"
                                                    disabled={d.is_day_off}
                                                />
                                            </div>

                                            <label className="flex items-center gap-2 ml-auto text-[13px] text-gray-700 dark:text-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={d.is_day_off}
                                                    onChange={(e) =>
                                                        setSchedule((prev) =>
                                                            prev.map((x, i) =>
                                                                i === idx
                                                                    ? { ...x, is_day_off: e.target.checked }
                                                                    : x
                                                            )
                                                        )
                                                    }
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                                                />
                                                Dzień wolny
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={saveSchedule}
                                className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px] font-medium disabled:opacity-60"
                            >
                                {loading ? "Zapisywanie..." : "💾 Zapisz harmonogram"}
                            </button>
                        </div>
                    )}

                    {msg && (
                        <p
                            className={`mt-4 text-sm font-medium ${msg.startsWith("✅")
                                ? "text-green-500"
                                : "text-red-500"
                                }`}
                        >
                            {msg}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
