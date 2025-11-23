import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Edit3, Upload, X } from "lucide-react";
import { motion } from "framer-motion";

export default function ServicesManager() {
    const { firebaseUser } = useAuth();
    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);
    const [services, setServices] = useState([]);
    const [addons, setAddons] = useState([]);
    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [editingAddon, setEditingAddon] = useState(null);

    const backendBase = import.meta.env.VITE_API_URL;

    // formularze widoczne / niewidoczne
    const [showServiceForm, setShowServiceForm] = useState(false);
    const [showAddonForm, setShowAddonForm] = useState(false);

    // --- Formularz usługi ---
    const [serviceForm, setServiceForm] = useState({
        name: "",
        duration_minutes: "",
        price: "",
        description: "",
        image: null,
        image_url: "",
    });

    // zaznaczone dodatki dla usługi
    const [selectedAddonIds, setSelectedAddonIds] = useState([]);

    const resetServiceForm = () => {
        setServiceForm({
            name: "",
            duration_minutes: "",
            price: "",
            description: "",
            image: null,
            image_url: "",
        });
        setSelectedAddonIds([]);
        setEditingService(null);
    };

    // --- Formularz dodatku ---
    const [addonForm, setAddonForm] = useState({
        name: "",
        duration_minutes: "",
        price: "",
        description: "",
    });

    const resetAddonForm = () => {
        setAddonForm({
            name: "",
            duration_minutes: "",
            price: "",
            description: "",
        });
        setEditingAddon(null);
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

    // --- Pobierz usługi i dodatki dla salonu ---
    const loadSalonData = async (salonId) => {
        try {
            const token = await firebaseUser.getIdToken();
            const [servicesResp, addonsResp] = await Promise.all([
                axios.get(`${backendBase}/api/services/by-salon/${salonId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                axios.get(`${backendBase}/api/service-addons/all?salon_id=${salonId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);
            setServices(servicesResp.data || []);
            setAddons(addonsResp.data || []);
        } catch (err) {
            console.error("❌ Błąd pobierania danych salonu:", err);
        }
    };

    // --- Pobierz dodatki powiązane z usługą ---
    const loadServiceAddons = async (serviceId) => {
        try {
            const token = await firebaseUser.getIdToken();
            const resp = await axios.get(
                `${backendBase}/api/services/${serviceId}/addons`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSelectedAddonIds((resp.data || []).map((a) => a.id));
        } catch (err) {
            console.error("❌ Błąd pobierania dodatków usługi:", err);
        }
    };

    useEffect(() => {
        if (firebaseUser) loadSalons();
    }, [firebaseUser]);

    useEffect(() => {
        if (selectedSalon) {
            loadSalonData(selectedSalon.id);
            resetServiceForm();
            resetAddonForm();
            setShowServiceForm(false);
            setShowAddonForm(false);
        }
    }, [selectedSalon]);

    // --- Dodawanie lub edycja usługi ---
    const handleSubmitService = async (e) => {
        e.preventDefault();
        if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");

        try {
            setLoading(true);
            const token = await firebaseUser.getIdToken();
            const formData = new FormData();
            formData.append("salon_id", selectedSalon.id);
            formData.append("name", serviceForm.name);
            formData.append("duration_minutes", serviceForm.duration_minutes);
            formData.append("price", serviceForm.price);
            formData.append("description", serviceForm.description);
            if (serviceForm.image) formData.append("image", serviceForm.image);

            let resp;
            if (editingService) {
                resp = await axios.put(
                    `${backendBase}/api/services/${editingService.id}`,
                    formData,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "multipart/form-data",
                        },
                    }
                );
                setMsg("✅ Usługa zaktualizowana!");
            } else {
                resp = await axios.post(`${backendBase}/api/services`, formData, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                });
                setMsg("✅ Usługa dodana!");
            }

            // powiązania dodatków z usługą
            const serviceId = editingService
                ? editingService.id
                : resp.data?.service?.id;

            if (serviceId) {
                await axios.post(
                    `${backendBase}/api/services/${serviceId}/addons`,
                    { addon_ids: selectedAddonIds },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );
            }

            resetServiceForm();
            setShowServiceForm(false);
            await loadSalonData(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd przy zapisie usługi");
        } finally {
            setLoading(false);
        }
    };

    // --- Edycja usługi ---
    const handleEditService = async (srv) => {
        setEditingService(srv);
        setShowServiceForm(true);
        setShowAddonForm(false);
        setServiceForm({
            name: srv.name,
            duration_minutes: srv.duration_minutes,
            price: srv.price,
            description: srv.description,
            image: null,
            image_url: srv.image_url,
        });
        await loadServiceAddons(srv.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // --- Usuwanie usługi ---
    const handleDeleteService = async (id) => {
        if (!window.confirm("Na pewno usunąć tę usługę?")) return;
        try {
            const token = await firebaseUser.getIdToken();
            await axios.delete(`${backendBase}/api/services/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await loadSalonData(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd przy usuwaniu");
        }
    };

    // --- Dodawanie / edycja dodatku ---
    const handleSubmitAddon = async (e) => {
        e.preventDefault();
        if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");

        try {
            setLoading(true);
            const token = await firebaseUser.getIdToken();

            const payload = {
                salon_id: selectedSalon.id,
                name: addonForm.name,
                duration_minutes: addonForm.duration_minutes,
                price: addonForm.price,
                description: addonForm.description,
            };

            if (editingAddon) {
                await axios.put(
                    `${backendBase}/api/service-addons/${editingAddon.id}`,
                    payload,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                setMsg("✅ Dodatek zaktualizowany!");
            } else {
                await axios.post(
                    `${backendBase}/api/service-addons`,
                    payload,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                setMsg("✅ Dodatek dodany!");
            }

            resetAddonForm();
            setShowAddonForm(false);
            await loadSalonData(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd przy zapisie dodatku");
        } finally {
            setLoading(false);
        }
    };

    const handleEditAddon = (addon) => {
        setEditingAddon(addon);
        setShowAddonForm(true);
        setShowServiceForm(false);
        setAddonForm({
            name: addon.name,
            duration_minutes: addon.duration_minutes,
            price: addon.price,
            description: addon.description || "",
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDeleteAddon = async (id) => {
        if (!window.confirm("Na pewno usunąć ten dodatek?")) return;
        try {
            const token = await firebaseUser.getIdToken();
            await axios.delete(`${backendBase}/api/service-addons/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await loadSalonData(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd przy usuwaniu dodatku");
        }
    };

    // --- UI ---
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold">Usługi</h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj usługami i dodatkami w swoich salonach.
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
                                        onError={(e) => (e.target.style.display = "none")}
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

                    {/* PRZYCISKI: DODAJ USŁUGĘ / DODAJ DODATEK */}
                    {selectedSalon && (
                        <div className="flex gap-3 mb-5">
                            <button
                                type="button"
                                onClick={() => {
                                    resetServiceForm();
                                    setShowServiceForm(true);
                                    setShowAddonForm(false);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Plus size={18} />
                                Dodaj usługę
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    resetAddonForm();
                                    setShowAddonForm(true);
                                    setShowServiceForm(false);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-50 rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Plus size={18} />
                                Dodaj dodatek
                            </button>
                        </div>
                    )}

                    {/* FORMULARZ USŁUGI */}
                    {selectedSalon && showServiceForm && (
                        <form
                            onSubmit={handleSubmitService}
                            className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <Plus size={18} />
                                    {editingService ? "Edytuj usługę" : "Dodaj nową usługę"}
                                </h2>

                                {editingService && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            resetServiceForm();
                                            setShowServiceForm(false);
                                        }}
                                        className="text-sm text-gray-400 hover:text-red-500 flex items-center"
                                    >
                                        <X size={16} className="mr-1" /> Anuluj
                                    </button>
                                )}
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <input
                                    placeholder="Nazwa usługi"
                                    value={serviceForm.name}
                                    onChange={(e) =>
                                        setServiceForm({ ...serviceForm, name: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Cena (PLN)"
                                    type="number"
                                    step="0.01"
                                    value={serviceForm.price}
                                    onChange={(e) =>
                                        setServiceForm({ ...serviceForm, price: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Czas trwania (min)"
                                    type="number"
                                    value={serviceForm.duration_minutes}
                                    onChange={(e) =>
                                        setServiceForm({
                                            ...serviceForm,
                                            duration_minutes: e.target.value,
                                        })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <div className="flex items-center gap-3">
                                    <label className="flex items-center cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                                        <Upload className="mr-2" size={18} />
                                        Zmień zdjęcie
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) =>
                                                setServiceForm({
                                                    ...serviceForm,
                                                    image: e.target.files[0],
                                                })
                                            }
                                        />
                                    </label>

                                    {serviceForm.image ? (
                                        <img
                                            src={URL.createObjectURL(serviceForm.image)}
                                            alt="Podgląd"
                                            className="w-14 h-14 object-cover rounded-xl border"
                                        />
                                    ) : serviceForm.image_url ? (
                                        <img
                                            src={`${backendBase}/uploads/${serviceForm.image_url}`}
                                            alt="Podgląd"
                                            className="w-14 h-14 object-cover rounded-xl border"
                                        />
                                    ) : null}
                                </div>
                            </div>

                            <textarea
                                placeholder="Opis usługi"
                                value={serviceForm.description}
                                onChange={(e) =>
                                    setServiceForm({
                                        ...serviceForm,
                                        description: e.target.value,
                                    })
                                }
                                className="w-full p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 resize-none text-sm"
                                rows={3}
                            />

                            {/* DODATKI DO ZAZNACZENIA */}
                            {addons.length > 0 && (
                                <div>
                                    <div className="text-[13px] font-medium text-gray-800 dark:text-gray-100 mb-2">
                                        Dodatki (opcjonalne):
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {addons.map((addon) => {
                                            const isSelected = selectedAddonIds.includes(addon.id);
                                            return (
                                                <button
                                                    key={addon.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedAddonIds((prev) =>
                                                            prev.includes(addon.id)
                                                                ? prev.filter((x) => x !== addon.id)
                                                                : [...prev, addon.id]
                                                        )
                                                    }
                                                    className={
                                                        "px-3 py-1.5 rounded-full text-[13px] border transition " +
                                                        (isSelected
                                                            ? "bg-[#e57b2c] border-[#e57b2c] text-white"
                                                            : "bg-gray-100 dark:bg-[#1f1f1f] border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200")
                                                    }
                                                >
                                                    {addon.name}{" "}
                                                    {(addon.price || addon.duration_minutes) && (
                                                        <span className="text-[11px] opacity-80 ml-1">
                                                            {addon.price && `+${addon.price} zł `}
                                                            {addon.duration_minutes &&
                                                                `· +${addon.duration_minutes} min`}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px] font-medium disabled:opacity-60"
                            >
                                {loading
                                    ? "Zapisywanie..."
                                    : editingService
                                        ? "💾 Zaktualizuj usługę"
                                        : "💾 Zapisz usługę"}
                            </button>
                        </form>
                    )}

                    {/* FORMULARZ DODATKU */}
                    {selectedSalon && showAddonForm && (
                        <form
                            onSubmit={handleSubmitAddon}
                            className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <Plus size={18} />
                                    {editingAddon ? "Edytuj dodatek" : "Dodaj nowy dodatek"}
                                </h2>

                                {editingAddon && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            resetAddonForm();
                                            setShowAddonForm(false);
                                        }}
                                        className="text-sm text-gray-400 hover:text-red-500 flex items-center"
                                    >
                                        <X size={16} className="mr-1" /> Anuluj
                                    </button>
                                )}
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <input
                                    placeholder="Nazwa dodatku"
                                    value={addonForm.name}
                                    onChange={(e) =>
                                        setAddonForm({ ...addonForm, name: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Cena (PLN)"
                                    type="number"
                                    step="0.01"
                                    value={addonForm.price}
                                    onChange={(e) =>
                                        setAddonForm({ ...addonForm, price: e.target.value })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />

                                <input
                                    placeholder="Dodatkowy czas (min)"
                                    type="number"
                                    value={addonForm.duration_minutes}
                                    onChange={(e) =>
                                        setAddonForm({
                                            ...addonForm,
                                            duration_minutes: e.target.value,
                                        })
                                    }
                                    className="p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                />
                            </div>

                            <textarea
                                placeholder="Opis dodatku (opcjonalnie)"
                                value={addonForm.description}
                                onChange={(e) =>
                                    setAddonForm({
                                        ...addonForm,
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
                                    ? "Zapisywanie..."
                                    : editingAddon
                                        ? "💾 Zaktualizuj dodatek"
                                        : "💾 Zapisz dodatek"}
                            </button>
                        </form>
                    )}

                    {/* LISTA USŁUG */}
                    {selectedSalon && (
                        <div className="mt-4">
                            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                                Usługi w salonie {selectedSalon.name}
                            </h3>
                            <div className="grid gap-4">
                                {services.map((srv) => (
                                    <div
                                        key={srv.id}
                                        className="flex items-center justify-between bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 p-4 rounded-3xl shadow-sm"
                                    >
                                        <div className="flex items-center gap-4">
                                            {srv.image_url ? (
                                                <img
                                                    src={`${backendBase}/uploads/${srv.image_url}`}
                                                    alt={srv.name}
                                                    className="w-16 h-16 rounded-xl object-cover"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center text-gray-500 text-sm">
                                                    brak
                                                </div>
                                            )}

                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-gray-50">
                                                    {srv.name}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    {srv.price} zł · {srv.duration_minutes} min
                                                </p>
                                                {srv.description && (
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {srv.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleEditService(srv)}
                                                className="p-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                            >
                                                <Edit3 size={18} className="text-blue-500" />
                                            </button>

                                            <button
                                                onClick={() => handleDeleteService(srv.id)}
                                                className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                            >
                                                <Trash2 size={18} className="text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {services.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Brak usług w tym salonie.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* LISTA DODATKÓW */}
                    {selectedSalon && (
                        <div className="mt-6">
                            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                                Dodatki w salonie {selectedSalon.name}
                            </h3>

                            <div className="grid gap-3">
                                {addons.map((addon) => (
                                    <div
                                        key={addon.id}
                                        className="flex items-center justify-between bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl"
                                    >
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-gray-50">
                                                {addon.name}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {addon.price} zł
                                                {addon.duration_minutes
                                                    ? ` · +${addon.duration_minutes} min`
                                                    : ""}
                                            </p>
                                            {addon.description && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {addon.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditAddon(addon)}
                                                className="p-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                            >
                                                <Edit3 size={18} className="text-blue-500" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteAddon(addon.id)}
                                                className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                            >
                                                <Trash2 size={18} className="text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {addons.length === 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Brak dodatków w tym salonie.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {msg && (
                        <p
                            className={`mt-6 text-sm font-medium ${msg.startsWith("✅") ? "text-green-500" : "text-red-500"
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
