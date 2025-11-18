import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { X, Save, CheckCircle, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function NewAppointmentModal({ open, onClose, activeDay, onCreated }) {
    const [clients, setClients] = useState([]);
    const [clientSearch, setClientSearch] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const [showNewClientForm, setShowNewClientForm] = useState(false);
    const [newClient, setNewClient] = useState({
        first_name: "",
        last_name: "",
        phone: "",
    });

    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [addons, setAddons] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);

    const [form, setForm] = useState({
        client_id: "",
        employee_id: "",
        service_id: "",
        addons: [],
        date: "",
        start_time: "",
        end_time: "",
    });

    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);
    const [creatingClient, setCreatingClient] = useState(false);

    const backendBase = import.meta.env.VITE_API_URL;

    const dropdownRef = useRef(null);

    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
    });

    const normalizeClients = (list) => {
        const filtered = (list || []).filter(
            (c) => c && c.id && (c.first_name || c.last_name || c.phone)
        );
        const map = new Map();
        filtered.forEach((c) => {
            if (!map.has(c.id)) map.set(c.id, c);
        });
        return [...map.values()];
    };

    // LOAD DATA
    useEffect(() => {
        if (!open) return;

        const load = async () => {
            try {
                const res = await axios.get(
                    `${backendBase}/api/appointments/details/new`,
                    authHeaders()
                );

                setClients(normalizeClients(res.data.clients || []));
                setEmployees(res.data.employees || []);
                setServices(res.data.services || []);
                setAddons(res.data.addons || []);

                setForm((prev) => ({
                    ...prev,
                    date: activeDay.toISOString().split("T")[0],
                }));
            } catch (err) {
                console.error("LOAD ERROR:", err);
            }
        };

        load();
    }, [open]);

    // FETCH SLOTS
    const fetchSlots = async (empId, srvId, date, addonList) => {
        if (!empId || !srvId || !date) return setAvailableTimes([]);

        try {
            const params = { employee_id: empId, service_id: srvId, date };

            if (addonList?.length) params.addons = addonList.join(",");

            const res = await axios.get(
                `${backendBase}/api/appointments/employee/available`,
                { params, ...authHeaders() }
            );

            setAvailableTimes(
                (res.data?.slots || []).map((s) => ({
                    ...s,
                    label:
                        s.type === "normal"
                            ? `${s.start_time} – ${s.end_time}`
                            : s.type === "blocked"
                                ? `⛔ ${s.start_time} – ${s.end_time} (blokada/urlop)`
                                : s.type === "outside_hours"
                                    ? `⚠️ ${s.start_time} – ${s.end_time} (poza grafikiem)`
                                    : `🛌 ${s.start_time} – ${s.end_time} (wolne)`,
                }))
            );
        } catch {
            setAvailableTimes([]);
        }
    };

    useEffect(() => {
        fetchSlots(form.employee_id, form.service_id, form.date, form.addons);
    }, [form.employee_id, form.service_id, form.date, JSON.stringify(form.addons)]);

    // CREATE CLIENT – /api/clients/create-local
    const handleCreateClient = async () => {
        const { first_name, last_name, phone } = newClient;

        if (!first_name && !last_name) {
            alert("Podaj imię lub nazwisko");
            return;
        }

        try {
            setCreatingClient(true);

            const res = await axios.post(
                `${backendBase}/api/clients/create-local`,
                newClient,
                authHeaders()
            );

            const created = res.data?.client;

            if (created?.id) {
                setClients((prev) => normalizeClients([...prev, created]));
                setForm((p) => ({ ...p, client_id: created.id }));
                setShowNewClientForm(false);
                setNewClient({ first_name: "", last_name: "", phone: "" });
            }
        } catch (err) {
            console.error("Błąd dodawania klienta:", err?.response?.data || err);
            alert("Błąd podczas dodawania klienta");
        } finally {
            setCreatingClient(false);
        }
    };

    // SAVE APPOINTMENT – /api/appointments/create-from-panel
    const handleSave = async () => {
        if (!form.client_id || !form.employee_id || !form.service_id || !form.start_time) {
            alert("Uzupełnij obowiązkowe pola!");
            return;
        }

        setSaving(true);

        try {
            await axios.post(
                `${backendBase}/api/appointments/create-from-panel`,
                {
                    ...form,
                    client_local_id: form.client_id, // 🔥 KLUCZOWA LINIJKA
                },
                authHeaders()
            );

            setSavedPopup(true);

            setTimeout(() => {
                setSavedPopup(false);
                onClose();
                onCreated?.();
            }, 900);
        } catch (err) {
            console.error("Błąd tworzenia wizyty:", err?.response?.data || err);
            alert("Nie udało się utworzyć wizyty");
        } finally {
            setSaving(false);
        }
    };

    // DROPDOWN CLOSE
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // FILTERED CLIENTS
    const filteredClients = clients.filter((c) => {
        if (!clientSearch) return true;
        const q = clientSearch.toLowerCase();
        return (
            c.first_name?.toLowerCase().includes(q) ||
            c.last_name?.toLowerCase().includes(q) ||
            c.phone?.toLowerCase().includes(q)
        );
    });

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-full max-w-3xl bg-white rounded-none md:rounded-2xl overflow-y-auto shadow-xl flex flex-col"
                >
                    {/* SUCCESS POPUP */}
                    {savedPopup && (
                        <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                            <CheckCircle size={16} /> Utworzono!
                        </div>
                    )}

                    {/* HEADER */}
                    <div className="sticky top-0 bg-orange-500 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
                        <h2 className="text-lg font-semibold">Nowa wizyta</h2>
                        <button onClick={onClose}><X size={18} /></button>
                    </div>

                    {/* FORM */}
                    <div className="flex-1 p-6 space-y-6 text-gray-800">
                        {/* CLIENT */}
                        <div className="border-b pb-4 relative" ref={dropdownRef}>
                            <label className="text-sm text-gray-500">Klient *</label>

                            <div
                                className="mt-2 border rounded-lg p-2 bg-white cursor-pointer"
                                onClick={() => setDropdownOpen((v) => !v)}
                            >
                                {form.client_id
                                    ? (() => {
                                        const c = clients.find((x) => x.id === form.client_id);
                                        return c
                                            ? `${c.first_name || ""} ${c.last_name || ""}${c.phone ? ` – ${c.phone}` : ""
                                            }`
                                            : "Wybierz klienta...";
                                    })()
                                    : "Wybierz klienta..."}
                            </div>

                            {dropdownOpen && (
                                <div className="absolute w-full bg-white border rounded-lg shadow-xl mt-1 z-50">
                                    <div className="p-2 border-b">
                                        <input
                                            autoFocus
                                            placeholder="Szukaj klienta…"
                                            className="w-full border rounded-lg p-2 text-sm"
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                        />
                                    </div>

                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredClients.map((c) => (
                                            <div
                                                key={c.id}
                                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                                onClick={() => {
                                                    setForm((p) => ({ ...p, client_id: c.id }));
                                                    setDropdownOpen(false);
                                                }}
                                            >
                                                {c.first_name} {c.last_name}{" "}
                                                {c.phone && <span className="text-gray-500">– {c.phone}</span>}
                                            </div>
                                        ))}

                                        {filteredClients.length === 0 && (
                                            <div className="px-3 py-2 text-gray-500 text-sm">
                                                Brak wyników
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm"
                                        onClick={() => {
                                            setShowNewClientForm(true);
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        <UserPlus size={14} /> Dodaj klienta
                                    </button>
                                </div>
                            )}

                            {showNewClientForm && (
                                <div className="p-3 mt-2 border rounded-lg bg-gray-50 space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            className="flex-1 border rounded-lg p-2 text-sm"
                                            placeholder="Imię"
                                            value={newClient.first_name}
                                            onChange={(e) =>
                                                setNewClient({ ...newClient, first_name: e.target.value })
                                            }
                                        />
                                        <input
                                            className="flex-1 border rounded-lg p-2 text-sm"
                                            placeholder="Nazwisko"
                                            value={newClient.last_name}
                                            onChange={(e) =>
                                                setNewClient({ ...newClient, last_name: e.target.value })
                                            }
                                        />
                                    </div>

                                    <input
                                        className="w-full border rounded-lg p-2 text-sm"
                                        placeholder="Telefon"
                                        value={newClient.phone}
                                        onChange={(e) =>
                                            setNewClient({ ...newClient, phone: e.target.value })
                                        }
                                    />

                                    <div className="flex justify-end gap-2">
                                        <button
                                            className="px-3 py-1 rounded-lg text-sm bg-gray-200 hover:bg-gray-300"
                                            onClick={() => setShowNewClientForm(false)}
                                        >
                                            Anuluj
                                        </button>

                                        <button
                                            className="px-3 py-1 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600"
                                            onClick={handleCreateClient}
                                            disabled={creatingClient}
                                        >
                                            {creatingClient ? "Dodaję..." : "Dodaj"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* EMPLOYEE */}
                        <div className="border-b pb-4">
                            <label className="text-sm text-gray-500">Pracownik *</label>
                            <select
                                className="mt-2 w-full border rounded-lg p-2"
                                value={form.employee_id}
                                onChange={(e) =>
                                    setForm({ ...form, employee_id: Number(e.target.value) })
                                }
                            >
                                <option value="">Wybierz...</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* SERVICE */}
                        <div className="border-b pb-4">
                            <label className="text-sm text-gray-500">Usługa *</label>
                            <select
                                className="mt-2 w-full border rounded-lg p-2"
                                value={form.service_id}
                                onChange={(e) =>
                                    setForm({ ...form, service_id: Number(e.target.value) })
                                }
                            >
                                <option value="">Wybierz...</option>
                                {services.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.price} zł)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* ADDONS */}
                        <div className="border-b pb-4">
                            <label className="text-sm text-gray-500">Dodatki</label>
                            <div className="mt-2 space-y-1">
                                {addons
                                    .filter((a) => !a.service_id || a.service_id === form.service_id)
                                    .map((a) => (
                                        <label key={a.id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={form.addons.includes(a.id)}
                                                onChange={() => {
                                                    setForm((p) => ({
                                                        ...p,
                                                        addons: p.addons.includes(a.id)
                                                            ? p.addons.filter((x) => x !== a.id)
                                                            : [...p.addons, a.id],
                                                    }));
                                                }}
                                            />
                                            {a.name} ({a.price} zł)
                                        </label>
                                    ))}
                            </div>
                        </div>

                        {/* DATE */}
                        <div className="border-b pb-4">
                            <label className="text-sm text-gray-500">Data *</label>
                            <input
                                type="date"
                                className="mt-2 w-full border rounded-lg p-2"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                            />
                        </div>

                        {/* TIME */}
                        <div className="border-b pb-4">
                            <label className="text-sm text-gray-500">Godzina *</label>
                            <select
                                className="mt-2 w-full border rounded-lg p-2"
                                value={form.start_time}
                                onChange={(e) => {
                                    const slot = availableTimes.find(
                                        (s) => s.start_time === e.target.value
                                    );
                                    if (!slot) return;
                                    setForm({
                                        ...form,
                                        start_time: slot.start_time,
                                        end_time: slot.end_time,
                                    });
                                }}
                            >
                                <option value="">Wybierz termin...</option>
                                {availableTimes.map((s, i) => (
                                    <option key={i} value={s.start_time}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* FOOTER */}
                    <div className="sticky bottom-0 bg-gray-50 border-t flex justify-end gap-3 px-6 py-4">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                        >
                            Anuluj
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${saving ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                                }`}
                        >
                            {saving ? "Zapisywanie..." : (
                                <>
                                    <Save size={16} /> Zapisz
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
