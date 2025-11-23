import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Edit3, X } from "lucide-react";
import { motion } from "framer-motion";

export default function SalonHolidaysManager() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);
    const [holidays, setHolidays] = useState([]);

    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);

    const [showHolidayForm, setShowHolidayForm] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState(null);

    const [form, setForm] = useState({
        date: "",
        reason: "",
    });

    const resetForm = () => {
        setForm({ date: "", reason: "" });
        setEditingHoliday(null);
        setShowHolidayForm(false);
    };

    const formatDate = (d) => {
        if (!d) return "";
        return new Date(d).toLocaleDateString("pl-PL", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    };

    /** ---- SALONS ---- */
    const loadSalons = async () => {
        try {
            const token = await firebaseUser.getIdToken();
            const resp = await axios.get(`${backendBase}/api/salons/mine/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSalons(resp.data || []);
        } catch (err) {
            console.error("❌ błąd pobierania salonów", err);
        }
    };

    /** ---- HOLIDAYS ---- */
    const loadHolidays = async (salonId) => {
        if (!salonId) return;

        try {
            const token = await firebaseUser.getIdToken();
            const resp = await axios.get(`${backendBase}/api/salons/${salonId}/holidays`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setHolidays(resp.data || []);
        } catch (err) {
            console.error("❌ błąd pobierania dni wolnych", err);
        }
    };

    useEffect(() => {
        if (firebaseUser) loadSalons();
    }, [firebaseUser]);

    useEffect(() => {
        if (selectedSalon) {
            resetForm();
            loadHolidays(selectedSalon.id);
        }
    }, [selectedSalon]);

    /** ---- CREATE / UPDATE ---- */
    const handleSubmitHoliday = async (e) => {
        e.preventDefault();

        if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");
        if (!form.date || !form.reason) return setMsg("⚠️ Wpisz datę i powód");

        try {
            setLoading(true);
            const token = await firebaseUser.getIdToken();

            if (editingHoliday) {
                // UPDATE — FIXED ENDPOINT
                await axios.put(
                    `${backendBase}/api/salon-holidays/${editingHoliday.id}`,
                    {
                        date: form.date,
                        reason: form.reason,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                setMsg("✅ Dzień wolny zaktualizowany");
            } else {
                // CREATE
                await axios.post(
                    `${backendBase}/api/salons/${selectedSalon.id}/holidays`,
                    {
                        date: form.date,
                        reason: form.reason,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                setMsg("✅ Dzień wolny dodany");
            }

            resetForm();
            loadHolidays(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd zapisu dnia wolnego");
        } finally {
            setLoading(false);
        }
    };

    /** ---- EDIT ---- */
    const handleEditHoliday = (h) => {
        setEditingHoliday(h);
        setForm({
            date: h.date,
            reason: h.reason || "",
        });
        setShowHolidayForm(true);

        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    /** ---- DELETE ---- */
    const handleDeleteHoliday = async (id) => {
        if (!window.confirm("Na pewno usunąć?")) return;

        try {
            const token = await firebaseUser.getIdToken();

            // FIXED ENDPOINT
            await axios.delete(`${backendBase}/api/salon-holidays/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            loadHolidays(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd usuwania dnia wolnego");
        }
    };

    /** ---- UI ---- */
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold">Dni wolne</h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj dniami wolnymi w swoich salonach.
                </p>
            </div>

            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm max-w-3xl mx-auto">

                    {/* SALON SELECT */}
                    <h2 className="text-[18px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Wybierz salon:
                    </h2>

                    <div className="space-y-3 mb-6">
                        {salons.map((s, i) => (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => setSelectedSalon(s)}
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
                                        className="w-14 h-14 rounded-2xl object-cover"
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

                    {/* ADD BUTTON */}
                    {selectedSalon && (
                        <button
                            onClick={() => {
                                resetForm();
                                setShowHolidayForm(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2.5 text-[14px] font-medium mb-5"
                        >
                            <Plus size={18} />
                            Dodaj dzień wolny
                        </button>
                    )}

                    {/* FORM */}
                    {selectedSalon && showHolidayForm && (
                        <form
                            onSubmit={handleSubmitHoliday}
                            className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Plus size={18} />
                                    {editingHoliday ? "Edytuj dzień wolny" : "Dodaj dzień wolny"}
                                </h2>

                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="text-sm text-gray-400 hover:text-red-500 flex items-center"
                                >
                                    <X size={16} className="mr-1" /> Anuluj
                                </button>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) =>
                                        setForm({ ...form, date: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Powód"
                                    value={form.reason}
                                    onChange={(e) =>
                                        setForm({ ...form, reason: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px] font-medium disabled:opacity-60"
                            >
                                {loading
                                    ? "Zapisywanie…"
                                    : editingHoliday
                                        ? "💾 Zaktualizuj"
                                        : "💾 Zapisz"}
                            </button>
                        </form>
                    )}

                    {/* LIST */}
                    {selectedSalon && (
                        <div className="mt-4">
                            <h3 className="text-[16px] font-semibold mb-3">
                                Dni wolne w salonie {selectedSalon.name}
                            </h3>

                            <div className="grid gap-4">
                                {holidays.map((h) => (
                                    <div
                                        key={h.id}
                                        className="flex items-center justify-between bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 p-4 rounded-3xl shadow-sm"
                                    >
                                        <div>
                                            <p className="font-semibold">
                                                {formatDate(h.date)}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {h.reason}
                                            </p>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleEditHoliday(h)}
                                                className="p-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                            >
                                                <Edit3 size={18} className="text-blue-500" />
                                            </button>

                                            <button
                                                onClick={() => handleDeleteHoliday(h.id)}
                                                className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30"
                                            >
                                                <Trash2 size={18} className="text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {holidays.length === 0 && (
                                    <p className="text-sm text-gray-500">
                                        Brak dni wolnych.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {msg && (
                        <p
                            className={`mt-6 text-sm font-medium ${msg.startsWith("✅")
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
