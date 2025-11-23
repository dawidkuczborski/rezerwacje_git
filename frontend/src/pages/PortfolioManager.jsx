import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Upload, Image as ImageIcon, X } from "lucide-react";
import { motion } from "framer-motion";

export default function PortfolioManager() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);

    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState("");
    const [newGroupName, setNewGroupName] = useState("");

    const [portfolio, setPortfolio] = useState({});
    const [msg, setMsg] = useState("");
    const [uploading, setUploading] = useState(false);

    // widoczność formularzy
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);

    // ==========================
    //  ŁADOWANIE DANYCH
    // ==========================

    // salony
    useEffect(() => {
        if (!firebaseUser) return;

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

        loadSalons();
    }, [firebaseUser, backendBase]);

    // grupy + portfolio po wyborze salonu
    useEffect(() => {
        if (!selectedSalon) return;

        setShowGroupForm(false);
        setShowUploadForm(false);
        setNewGroupName("");
        setSelectedGroup("");

        loadGroups();
        loadPortfolio();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSalon]);

    const loadGroups = async () => {
        if (!selectedSalon) return;
        try {
            const res = await axios.get(
                `${backendBase}/api/salons/${selectedSalon.id}/portfolio-groups`
            );
            setGroups(res.data || []);
        } catch (err) {
            console.error("❌ Błąd pobierania grup:", err);
        }
    };

    const loadPortfolio = async () => {
        if (!selectedSalon) return;
        try {
            const res = await axios.get(
                `${backendBase}/api/salons/${selectedSalon.id}/portfolio`
            );
            setPortfolio(res.data || {});
        } catch (err) {
            console.error("❌ Błąd pobierania portfolio:", err);
        }
    };

    // ==========================
    //  GRUPY
    // ==========================
    const handleAddGroup = async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) return setMsg("⚠️ Podaj nazwę grupy");

        try {
            const token = await firebaseUser.getIdToken();
            await axios.post(
                `${backendBase}/api/salons/${selectedSalon.id}/portfolio-groups`,
                { name: newGroupName },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewGroupName("");
            setMsg("✅ Grupa dodana!");
            await loadGroups();
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd dodawania grupy");
        }
    };

    const handleDeleteGroup = async (groupId) => {
        if (!window.confirm("Na pewno usunąć tę grupę?")) return;
        try {
            const token = await firebaseUser.getIdToken();
            await axios.delete(`${backendBase}/api/portfolio-groups/${groupId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMsg("✅ Grupa usunięta!");
            await loadGroups();
            await loadPortfolio();
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd usuwania grupy");
        }
    };

    // ==========================
    //  ZDJĘCIA
    // ==========================
    const handleUpload = async (e) => {
        const files = e.target.files;
        if (!files?.length || !selectedSalon) return;

        const formData = new FormData();
        for (let f of files) formData.append("portfolio_images", f);
        if (selectedGroup) formData.append("group_id", selectedGroup);

        try {
            setUploading(true);
            const token = await firebaseUser.getIdToken();
            await axios.post(
                `${backendBase}/api/salons/${selectedSalon.id}/portfolio`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
            setMsg("✅ Zdjęcia dodane!");
            await loadPortfolio();
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd dodawania zdjęć");
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePhoto = async (photoId) => {
        if (!window.confirm("Na pewno usunąć to zdjęcie?")) return;
        try {
            const token = await firebaseUser.getIdToken();
            await axios.delete(`${backendBase}/api/portfolio/${photoId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMsg("✅ Zdjęcie usunięte!");
            await loadPortfolio();
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd usuwania zdjęcia");
        }
    };

    // ==========================
    //  RENDER
    // ==========================
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER – taki jak w innych stronach panelu */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <ImageIcon size={24} />
                    Portfolio
                </h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Zarządzaj zdjęciami swoich salonów.
                </p>
            </div>

            {/* BIAŁA KARTA */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm max-w-3xl mx-auto">
                    {/* LISTA SALONÓW (jak w ServicesManager) */}
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

                    {/* PRZYCISKI GÓRNE: DODAJ GRUPĘ / DODAJ ZDJĘCIA */}
                    {selectedSalon && (
                        <div className="flex gap-3 mb-5">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGroupForm((v) => !v);
                                    if (!showGroupForm) setShowUploadForm(false);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-[#e57b2c] text-white rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Plus size={18} />
                                Dodaj grupę
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowUploadForm((v) => !v);
                                    if (!showUploadForm) setShowGroupForm(false);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-50 rounded-2xl py-2.5 text-[14px] font-medium"
                            >
                                <Plus size={18} />
                                Dodaj zdjęcia
                            </button>
                        </div>
                    )}

                    {/* FORMULARZ DODAWANIA GRUPY – ukryty dopóki nie klikniesz */}
                    {selectedSalon && showGroupForm && (
                        <form
                            onSubmit={handleAddGroup}
                            className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <Plus size={18} />
                                    Dodaj nową grupę
                                </h2>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowGroupForm(false);
                                        setNewGroupName("");
                                    }}
                                    className="text-sm text-gray-400 hover:text-red-500 flex items-center"
                                >
                                    <X size={16} className="mr-1" /> Anuluj
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    placeholder="Nazwa grupy (np. Brody, Fryzury...)"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    className="flex-grow p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="px-6 py-3 rounded-2xl bg-[#e57b2c] text-white text-[15px] font-medium"
                                >
                                    💾 Dodaj
                                </button>
                            </div>
                        </form>
                    )}

                    {/* SEK CJA DODAWANIA ZDJĘĆ – ukryta dopóki nie klikniesz */}
                    {selectedSalon && showUploadForm && (
                        <div className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                    <ImageIcon size={18} />
                                    Dodaj zdjęcia
                                </h2>

                                <button
                                    type="button"
                                    onClick={() => setShowUploadForm(false)}
                                    className="text-sm text-gray-400 hover:text-red-500 flex items-center"
                                >
                                    <X size={16} className="mr-1" /> Zamknij
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 items-center">
                                <div className="w-full sm:w-auto flex-1">
                                    <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-200 mb-1">
                                        Dodaj do grupy:
                                    </label>
                                    <select
                                        className="w-full p-3 rounded-xl bg-white dark:bg-[#1f1f1f] border dark:border-gray-700 text-sm"
                                        value={selectedGroup}
                                        onChange={(e) => setSelectedGroup(e.target.value)}
                                    >
                                        <option value="">Bez grupy</option>
                                        {groups.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <label className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#e57b2c] text-white text-[14px] font-medium cursor-pointer active:scale-95 transition">
                                    <Upload size={18} />
                                    {uploading ? "Wysyłanie..." : "Wybierz zdjęcia"}
                                    <input
                                        type="file"
                                        multiple
                                        hidden
                                        onChange={handleUpload}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* LISTA GRUP I ZDJĘĆ */}
                    {selectedSalon &&
                        Object.keys(portfolio).map((groupName) => (
                            <div
                                key={groupName}
                                className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 p-5 rounded-3xl mb-4 shadow-sm"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100">
                                        {groupName}
                                    </h3>

                                    {groupName !== "Bez grupy" && (
                                        <button
                                            onClick={() => {
                                                const g = groups.find(
                                                    (x) => x.name === groupName
                                                );
                                                if (g) handleDeleteGroup(g.id);
                                            }}
                                            className="flex items-center gap-1 text-[13px] text-red-500 hover:underline"
                                        >
                                            <Trash2 size={14} />
                                            Usuń grupę
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {portfolio[groupName].map((img) => (
                                        <div
                                            key={img.id}
                                            className="relative rounded-2xl overflow-hidden group border border-gray-200 dark:border-gray-700"
                                        >
                                            <img
                                                src={img.url}
                                                alt=""
                                                className="w-full h-40 object-cover"
                                            />
                                            <button
                                                onClick={() => handleDeletePhoto(img.id)}
                                                className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 transition"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

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
