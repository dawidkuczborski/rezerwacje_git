import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Edit3, Upload, X } from "lucide-react";
import { motion } from "framer-motion";

export default function EmployeeManager() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);
    const [employees, setEmployees] = useState([]);

    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);

    const [showEmployeeForm, setShowEmployeeForm] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editId, setEditId] = useState(null);

    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        description: "",
        password: "",
        image: null,
        image_url: "",
    });

    const resetForm = () => {
        setForm({
            name: "",
            email: "",
            phone: "",
            description: "",
            password: "",
            image: null,
            image_url: "",
        });
        setEditMode(false);
        setEditId(null);
        setShowEmployeeForm(false);
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

    // --- Pobierz pracowników dla salonu ---
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

    useEffect(() => {
        if (firebaseUser) loadSalons();
    }, [firebaseUser]);

    useEffect(() => {
        if (selectedSalon) {
            resetForm();
            loadEmployees(selectedSalon.id);
        }
    }, [selectedSalon]);

    // --- Dodawanie / edycja pracownika ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");

        setLoading(true);
        setMsg(
            editMode
                ? "✏️ Aktualizowanie pracownika..."
                : "⏳ Tworzenie konta pracownika..."
        );

        try {
            const token = await firebaseUser.getIdToken();
            const formData = new FormData();
            formData.append("salon_id", selectedSalon.id);
            formData.append("name", form.name);
            formData.append("phone", form.phone);
            formData.append("description", form.description);
            if (form.image) formData.append("image", form.image);

            if (editMode) {
                await axios.put(`${backendBase}/api/employees/${editId}`, formData, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                });
                setMsg("✅ Zaktualizowano pracownika!");
            } else {
                formData.append("email", form.email);
                formData.append("password", form.password);
                await axios.post(`${backendBase}/api/employees/invite`, formData, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                });
                setMsg("✅ Pracownik dodany!");
            }

            resetForm();
            await loadEmployees(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ " + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    // --- Przejście w tryb edycji ---
    const handleEditEmployee = (emp) => {
        setEditMode(true);
        setEditId(emp.id);
        setShowEmployeeForm(true);
        setForm({
            name: emp.name || "",
            email: emp.email || "",
            phone: emp.phone || "",
            description: emp.description || "",
            password: "",
            image: null,
            image_url: emp.image_url || "",
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // --- Usuwanie ---
    const handleDeleteEmployee = async (id) => {
        if (!window.confirm("Czy na pewno chcesz usunąć tego pracownika?")) return;
        try {
            const token = await firebaseUser.getIdToken();
            await axios.delete(`${backendBase}/api/employees/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMsg("🗑️ Pracownik usunięty!");
            await loadEmployees(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd przy usuwaniu pracownika");
        }
    };

    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold">Pracownicy</h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj pracownikami w swoich salonach.
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

                    {/* PRZYCISK: Dodaj pracownika */}
                    {selectedSalon && (
                        <div className="flex gap-3 mb-5">
                            <button
                                type="button"
                                onClick={() => {
                                    resetForm();
                                    setShowEmployeeForm(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Plus size={18} />
                                Dodaj pracownika
                            </button>
                        </div>
                    )}

                    {/* FORMULARZ PRACOWNIKA */}
                    {selectedSalon && showEmployeeForm && (
                        <form
                            onSubmit={handleSubmit}
                            className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <Plus size={18} />
                                    {editMode
                                        ? "Edytuj pracownika"
                                        : "Dodaj nowego pracownika"}
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
                                    placeholder="Imię i nazwisko"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({ ...form, name: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) =>
                                        setForm({ ...form, email: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    disabled={editMode}
                                    required
                                />

                                {!editMode && (
                                    <input
                                        type="password"
                                        placeholder="Hasło pracownika"
                                        value={form.password}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                password: e.target.value,
                                            })
                                        }
                                        className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                        required
                                    />
                                )}

                                <input
                                    placeholder="Telefon"
                                    value={form.phone}
                                    onChange={(e) =>
                                        setForm({ ...form, phone: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                />

                                {/* Upload zdjęcia – jak w usługach */}
                                <div className="flex items-center gap-3 sm:col-span-2">
                                    <label className="flex items-center cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                                        <Upload className="mr-2" size={18} />
                                        {form.image_url || form.image
                                            ? "Zmień zdjęcie"
                                            : "Dodaj zdjęcie"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    image: e.target.files[0],
                                                })
                                            }
                                        />
                                    </label>

                                    {(form.image || form.image_url) && (
                                        <img
                                            src={
                                                form.image
                                                    ? URL.createObjectURL(form.image)
                                                    : `${backendBase}/${form.image_url}`
                                            }
                                            alt="Podgląd"
                                            className="w-14 h-14 object-cover rounded-xl border"
                                        />
                                    )}
                                </div>
                            </div>

                            <textarea
                                placeholder="Opis (np. fryzjer męski, barber)"
                                value={form.description}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        description: e.target.value,
                                    })
                                }
                                className="w-full p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 resize-none text-sm"
                                rows={3}
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px] font-medium disabled:opacity-60"
                            >
                                {loading
                                    ? editMode
                                        ? "Zapisywanie..."
                                        : "Tworzenie..."
                                    : editMode
                                        ? "💾 Zapisz zmiany"
                                        : "📨 Utwórz konto pracownika"}
                            </button>
                        </form>
                    )}

                    {/* LISTA PRACOWNIKÓW */}
                    {selectedSalon && (
                        <div className="mt-4">
                            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                                Pracownicy w salonie {selectedSalon.name}
                            </h3>

                            <div className="grid gap-4">
                                {employees.map((emp) => (
                                    <div
                                        key={emp.id}
                                        className="flex items-center justify-between bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 p-4 rounded-3xl shadow-sm"
                                    >
                                        <div className="flex items-center gap-4">
                                            {emp.image_url ? (
                                                <img
                                                    src={`${backendBase}/${emp.image_url}`}
                                                    alt={emp.name}
                                                    className="w-16 h-16 rounded-xl object-cover"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center text-gray-500 text-sm">
                                                    brak
                                                </div>
                                            )}

                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-gray-50">
                                                    {emp.name}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    {emp.email}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {emp.phone || "-"}
                                                    {emp.description
                                                        ? ` · ${emp.description}`
                                                        : ""}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleEditEmployee(emp)}
                                                className="p-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                            >
                                                <Edit3 size={18} className="text-blue-500" />
                                            </button>
                                            <button
                                                onClick={() =>
                                                    handleDeleteEmployee(emp.id)
                                                }
                                                className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                            >
                                                <Trash2 size={18} className="text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {employees.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Brak pracowników w tym salonie.
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
