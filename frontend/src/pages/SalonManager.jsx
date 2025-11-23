import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../components/AuthProvider";
import { Loader2, MapPin, Plus, Pencil, Trash2, ImagePlus } from "lucide-react";
import { motion } from "framer-motion";

export default function SalonManager() {
    const { firebaseUser, loading } = useAuth();
    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);
    const [categories, setCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [msg, setMsg] = useState("");
    const backend = import.meta.env.VITE_API_URL;

    // 🔥 NOWOŚĆ — czy formularz jest widoczny?
    const [showForm, setShowForm] = useState(false);

    // 🏙️ Formularz salonu
    const [form, setForm] = useState({
        name: "",
        city: "",
        street: "",
        street_number: "",
        postal_code: "",
        phone: "",
        description: "",
        image: null,
    });

    // 🗺️ Formularz „Jak dojechać”
    const [routeForm, setRouteForm] = useState({
        route_description: "",
        route_photos: [],
    });
    const [existingRoute, setExistingRoute] = useState(null);

    // 🔄 Pobierz kategorie
    useEffect(() => {
        axios.get(`${backend}/api/categories`).then((res) => {
            setCategories(res.data || []);
        });
    }, [backend]);

    // 🔄 Pobierz salony użytkownika
    useEffect(() => {
        const loadSalons = async () => {
            if (!firebaseUser) return;
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(`${backend}/api/salons/mine/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSalons(res.data || []);
        };
        loadSalons();
    }, [firebaseUser, backend]);

    // ✏️ Obsługa formularza
    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (files) setForm((prev) => ({ ...prev, image: files[0] }));
        else setForm((prev) => ({ ...prev, [name]: value }));
    };

    // 💾 Zapis / aktualizacja salonu
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();
        const formData = new FormData();

        Object.entries(form).forEach(([k, v]) => {
            if (v !== null && v !== "") formData.append(k, v);
        });

        let resp;

        if (selectedSalon) {
            resp = await axios.put(
                `${backend}/api/salons/${selectedSalon.id}`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
        } else {
            resp = await axios.post(`${backend}/api/salons`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data",
                },
            });
        }

        const salonId = selectedSalon ? selectedSalon.id : resp.data.salon.id;

        // 🔗 kategorie
        await axios.post(
            `${backend}/api/salons/${salonId}/categories`,
            { category_ids: selectedCategories },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        setMsg("✅ Salon zapisany pomyślnie");
        setShowForm(false); // ⬅️ zamknij formularz po zapisaniu

        // Reset
        setSelectedSalon(null);
        setExistingRoute(null);
        setForm({
            name: "",
            city: "",
            street: "",
            street_number: "",
            postal_code: "",
            phone: "",
            description: "",
            image: null,
        });
        setSelectedCategories([]);
        setRouteForm({ route_description: "", route_photos: [] });

        // Przeładuj listę
        const reload = await axios.get(`${backend}/api/salons/mine/all`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        setSalons(reload.data);
    };

    // ✏️ Edytuj salon
    const handleEdit = async (salon) => {
        setShowForm(true); // 🔥 pokaż formularz
        setSelectedSalon(salon);

        setForm({
            name: salon.name || "",
            city: salon.city || "",
            street: salon.street || "",
            street_number: salon.street_number || "",
            postal_code: salon.postal_code || "",
            phone: salon.phone || "",
            description: salon.description || "",
            image: null,
        });

        const token = await firebaseUser.getIdToken();

        const resp = await axios.get(
            `${backend}/api/salons/${salon.id}/categories`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        setSelectedCategories(resp.data.map((c) => c.id));

        const route = await axios.get(
            `${backend}/api/salons/${salon.id}/route`
        );
        setExistingRoute(route.data);
    };

    // 🗑️ Usuń
    const handleDelete = async (id) => {
        if (!window.confirm("Czy na pewno chcesz usunąć ten salon?")) return;

        const token = await firebaseUser.getIdToken();

        await axios.delete(`${backend}/api/salons/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        setSalons((prev) => prev.filter((s) => s.id !== id));
        setMsg("🗑️ Salon usunięty");

        if (selectedSalon?.id === id) {
            setShowForm(false);
            setSelectedSalon(null);
            setExistingRoute(null);
            setSelectedCategories([]);
        }
    };

    // „Jak dojechać”
    const handleRouteChange = (e) => {
        const { name, value, files } = e.target;
        if (files)
            setRouteForm((prev) => ({
                ...prev,
                route_photos: Array.from(files),
            }));
        else setRouteForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleRouteSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSalon) return;

        const token = await firebaseUser.getIdToken();
        const formData = new FormData();

        formData.append("route_description", routeForm.route_description || "");
        routeForm.route_photos.forEach((f) =>
            formData.append("route_photos", f)
        );

        const resp = await axios.post(
            `${backend}/api/salons/${selectedSalon.id}/route`,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data",
                },
            }
        );

        setExistingRoute(resp.data.route);
        setMsg("✔️ Dane trasy zapisane");
        setRouteForm({ route_description: "", route_photos: [] });
    };

    const inputClass =
        "w-full bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-2xl py-2.5 px-4 text-[15px] focus:ring-2 focus:ring-[#e57b2c]/60";

    if (loading)
        return (
            <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-300">
                <Loader2 className="animate-spin mr-2" size={20} /> Ładowanie...
            </div>
        );

    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <MapPin size={24} />
                    Salony
                </h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj swoimi salonami, kategoriami i opisem dojazdu.
                </p>
            </div>

            {/* BIAŁA KARTA */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm max-w-3xl mx-auto">

                    {/* LISTA + PRZYCISK */}
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <div>
                            <h2 className="text-[18px] font-semibold text-gray-900 dark:text-gray-100">
                                Twoje salony
                            </h2>
                            <p className="text-[13px] text-gray-500 dark:text-gray-400">
                                Wybierz salon do edycji.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setShowForm(true);
                                setSelectedSalon(null);
                                setExistingRoute(null);
                                setSelectedCategories([]);
                                setForm({
                                    name: "",
                                    city: "",
                                    street: "",
                                    street_number: "",
                                    postal_code: "",
                                    phone: "",
                                    description: "",
                                    image: null,
                                });
                            }}
                            className="flex items-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2 px-4 text-[14px] font-medium"
                        >
                            <Plus size={18} />
                            Nowy salon
                        </button>
                    </div>

                    {/* LISTA SALONÓW */}
                    <div className="space-y-3 mb-6">
                        {salons.length === 0 && (
                            <div className="text-[14px] text-gray-500 dark:text-gray-400">
                                Nie masz jeszcze salonów.
                            </div>
                        )}

                        {salons.map((s, i) => (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl px-5 py-4 flex items-center gap-4"
                            >
                                {s.image_url && (
                                    <img
                                        src={`${backend}/uploads/${s.image_url}`}
                                        alt={s.name}
                                        className="w-14 h-14 rounded-2xl object-cover"
                                    />
                                )}
                                <div className="flex-1">
                                    <div className="text-[15px] font-semibold">
                                        {s.name}
                                    </div>
                                    <div className="text-[13px] text-gray-500 dark:text-gray-400">
                                        {s.city}, {s.street} {s.street_number}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => handleEdit(s)}
                                        className="p-2 rounded-xl bg-gray-200 dark:bg-gray-700"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(s.id)}
                                        className="p-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-red-500 hover:text-white"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* 🔥 FORMULARZ — TYLKO GDY WIDAĆ */}
                    {showForm && (
                        <div className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl px-5 py-5 mb-4">
                            <h3 className="text-[16px] font-semibold mb-3">
                                {selectedSalon ? "✏️ Edytuj salon" : "➕ Dodaj nowy salon"}
                            </h3>

                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input name="name" placeholder="Nazwa salonu" value={form.name} onChange={handleChange} className={inputClass} />
                                    <input name="city" placeholder="Miasto" value={form.city} onChange={handleChange} className={inputClass} />
                                    <input name="street" placeholder="Ulica" value={form.street} onChange={handleChange} className={inputClass} />
                                    <input name="street_number" placeholder="Nr budynku" value={form.street_number} onChange={handleChange} className={inputClass} />
                                    <input name="postal_code" placeholder="Kod pocztowy" value={form.postal_code} onChange={handleChange} className={inputClass} />
                                    <input name="phone" placeholder="Telefon" value={form.phone} onChange={handleChange} className={inputClass} />
                                </div>

                                <textarea
                                    name="description"
                                    placeholder="Opis salonu"
                                    value={form.description}
                                    onChange={handleChange}
                                    className={inputClass + " min-h-[90px]"}
                                />

                                {/* Kategorie */}
                                <div>
                                    <div className="text-[13px] mb-2">Kategorie salonu:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((cat) => {
                                            const isSelected = selectedCategories.includes(cat.id);
                                            return (
                                                <button
                                                    type="button"
                                                    key={cat.id}
                                                    onClick={() =>
                                                        setSelectedCategories((prev) =>
                                                            prev.includes(cat.id)
                                                                ? prev.filter((x) => x !== cat.id)
                                                                : [...prev, cat.id]
                                                        )
                                                    }
                                                    className={
                                                        "px-3 py-1.5 rounded-full text-[13px] border " +
                                                        (isSelected
                                                            ? "bg-[#e57b2c] text-white border-[#e57b2c]"
                                                            : "bg-gray-100 dark:bg-[#1f1f1f] border-gray-300 dark:border-gray-700")
                                                    }
                                                >
                                                    {cat.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Zdjęcie */}
                                <div>
                                    <label className="block mb-2 text-[13px]">📷 Zdjęcie salonu:</label>
                                    <label className="flex items-center justify-between bg-white dark:bg-[#1f1f1f] border border-dashed rounded-2xl px-4 py-3 cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <ImagePlus size={18} />
                                            {form.image ? form.image.name : "Wybierz zdjęcie"}
                                        </div>
                                        <input type="file" accept="image/*" name="image" onChange={handleChange} className="hidden" />
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px]"
                                >
                                    {selectedSalon ? "💾 Zapisz zmiany" : "➕ Dodaj salon"}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* 🔥 Jak dojechać — tylko podczas edycji */}
                    {showForm && selectedSalon && (
                        <div className="bg-white dark:bg-[#2a2a2a] border rounded-3xl px-5 py-5 mt-4">
                            <div className="flex items-center gap-2 mb-3">
                                <MapPin size={18} className="text-[#e57b2c]" />
                                <h3 className="text-[16px] font-semibold">
                                    Jak dojechać – {selectedSalon.name}
                                </h3>
                            </div>

                            {existingRoute && (
                                <div className="mb-4">
                                    <p className="text-[14px] mb-2">
                                        {existingRoute.route_description}
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        {existingRoute.image_urls?.map((url, i) => (
                                            <img
                                                key={i}
                                                src={url}
                                                className="w-24 h-20 rounded-xl object-cover border"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleRouteSubmit} className="space-y-3">
                                <textarea
                                    name="route_description"
                                    placeholder="Opis trasy..."
                                    value={routeForm.route_description}
                                    onChange={handleRouteChange}
                                    className={inputClass + " min-h-[90px]"}
                                />

                                <label className="flex items-center justify-between bg-white dark:bg-[#1f1f1f] border border-dashed rounded-2xl px-4 py-3 cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <ImagePlus size={18} />
                                        {routeForm.route_photos.length > 0
                                            ? `${routeForm.route_photos.length} zdjęć`
                                            : "Wybierz zdjęcia trasy"}
                                    </div>
                                    <input
                                        type="file"
                                        name="route_photos"
                                        multiple
                                        accept="image/*"
                                        onChange={handleRouteChange}
                                        className="hidden"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[15px]"
                                >
                                    💾 Zapisz dane „Jak dojechać”
                                </button>
                            </form>
                        </div>
                    )}

                    {msg && (
                        <p className="mt-4 text-center text-[13px] text-gray-700 dark:text-gray-200">
                            {msg}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
