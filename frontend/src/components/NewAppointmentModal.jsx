import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { X, Save, CheckCircle, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function NewAppointmentModal({ open, onClose, activeDay, onCreated, prefill }) {

    const [clients, setClients] = useState([]);
    const [clientSearch, setClientSearch] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const [showNewClientForm, setShowNewClientForm] = useState(false);
    const [newClient, setNewClient] = useState({
        first_name: "",
        last_name: "",
        phone: "",
        employee_ids: [],   // 👈 ważne
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

    // -------------------------
    // FIX — lokalna data (usuwa cofanie UTC)
    // -------------------------
    const toLocalDate = (d) => {
        if (!d) return "";
        const date = new Date(d);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const normalizeClients = (list) => {
        const filtered = (list || []).filter(
            (c) => c && c.id && (c.first_name || c.last_name || c.phone)
        );
        const unique = new Map();
        filtered.forEach((c) => unique.set(c.id, c));
        return [...unique.values()];
    };

    // -------------------------
    // LOAD DATA
    // -------------------------
    useEffect(() => {
        if (!open) return;

        const load = async () => {
            try {
                const res = await axios.get(
                    `${backendBase}/api/appointments/details/new`,
                    {
                        ...authHeaders(),
                        params: {
                            salon_id: localStorage.getItem("selected_salon_id")
                        }
                    }
                );

                setClients(normalizeClients(res.data.clients || []));
                setEmployees(res.data.employees || []);
                setServices(res.data.services || []);
                setAddons(res.data.addons || []);

                if (!prefill) {
                    setForm((prev) => ({
                        ...prev,
                        date: activeDay
                            ? toLocalDate(activeDay)
                            : toLocalDate(new Date()),
                    }));
                }

            } catch (err) {
                console.error("LOAD ERROR:", err);
            }
        };

        load();
    }, [open]);

    // -------------------------
    // PREFILL (umów ponownie)
    // -------------------------
    useEffect(() => {
        if (!open || !prefill) return;

        setForm((prev) => ({
            ...prev,
            client_id: prefill.client_id || "",
            employee_id: prefill.employee_id || "",
            service_id: prefill.service_id || "",
            addons: prefill.addons || [],
        }));
    }, [open, prefill]);

    // -------------------------
    // FETCH SLOTS
    // -------------------------
    const fetchSlots = async (empId, srvId, date, addonList) => {
        if (!empId || !srvId || !date) return setAvailableTimes([]);

        try {
            const params = {
                employee_id: empId,
                service_id: srvId,
                date: toLocalDate(date),
            };

            if (addonList?.length) params.addons = addonList.join(",");

            const res = await axios.get(
                `${backendBase}/api/appointments/employee/available`,
                {
                    ...authHeaders(),
                    params: {
                        ...params,
                        salon_id: localStorage.getItem("selected_salon_id")
                    }
                }
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

    // -------------------------
    // ADD CLIENT
    // -------------------------
    const handleCreateClient = async () => {
        const { first_name, last_name, phone, employee_ids } = newClient;

        if (!first_name || !last_name) {
            alert("Podaj imię i nazwisko");
            return;
        }
        if (!phone || phone.length !== 9) {
            alert("Numer telefonu musi mieć dokładnie 9 cyfr");
            return;
        }
        if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
            alert("Wybierz przynajmniej jednego pracownika");
            return;
        }

        try {
            setCreatingClient(true);

            const salonIdRaw = localStorage.getItem("selected_salon_id");
            const salon_id = salonIdRaw ? Number(salonIdRaw) : undefined;

            const res = await axios.post(
                `${backendBase}/api/clients/create`,
                {
                    salon_id,
                    employee_ids,
                    first_name,
                    last_name,
                    phone
                },
                authHeaders()
            );

            // nowy klient – bierzemy pierwszy z utworzonych
            const created = res.data?.created?.[0];
            if (created?.id) {
                setClients((prev) => normalizeClients([...prev, created]));
                setForm((p) => ({ ...p, client_id: created.id }));
            }

            setShowNewClientForm(false);
            setNewClient({
                first_name: "",
                last_name: "",
                phone: "",
                employee_ids: []
            });

        } catch (err) {
            console.error("Błąd dodawania klienta:", err);

            // 409 – klient z takim numerem już istnieje
            if (err.response?.status === 409 && err.response.data?.existing_clients?.length) {
                const existing = err.response.data.existing_clients[0];
                setClients((prev) => normalizeClients([...prev, existing]));
                setForm((p) => ({ ...p, client_id: existing.id }));
                setShowNewClientForm(false);
                setNewClient({
                    first_name: "",
                    last_name: "",
                    phone: "",
                    employee_ids: []
                });
                return;
            }

            alert(err.response?.data?.error || "Błąd podczas dodawania klienta");
        } finally {
            setCreatingClient(false);
        }
    };

    // -------------------------
    // SAVE
    // -------------------------
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
                    date: toLocalDate(form.date),
                    client_local_id: form.client_id
                },
                {
                    ...authHeaders(),
                    params: { salon_id: localStorage.getItem("selected_salon_id") }
                }
            );

            setSavedPopup(true);

            setTimeout(() => {
                setSavedPopup(false);
                onClose();
                onCreated?.();
            }, 900);

        } catch (err) {
            console.error("Błąd tworzenia wizyty:", err);
            alert("Nie udało się utworzyć wizyty");
        } finally {
            setSaving(false);
        }
    };

    // -------------------------
    // close dropdown on click outside
    // -------------------------
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

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

    // --------------------------------------------------------------
    // RENDER
    // --------------------------------------------------------------
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
                    className="w-full h-full max-w-3xl bg-white dark:bg-gray-900 dark:text-gray-100
                        rounded-none md:rounded-2xl overflow-y-auto shadow-xl flex flex-col"
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
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                            <X size={18} />
                        </button>
                    </div>

                    {/* FORM */}
                    <div className="flex-1 p-6 space-y-6 text-gray-800 dark:text-gray-100">

                        {/* CLIENT */}
                        <div className="border-b pb-4 dark:border-gray-700 relative" ref={dropdownRef}>
                            <label className="text-sm text-gray-500 dark:text-gray-400">Klient *</label>

                            <div
                                className="mt-2 border rounded-lg p-2 bg-white dark:bg-gray-800 dark:border-gray-700 cursor-pointer"
                                onClick={() => setDropdownOpen((v) => !v)}
                            >
                                {form.client_id
                                    ? (() => {
                                        const c = clients.find((x) => x.id === form.client_id);
                                        return c
                                            ? `${c.first_name || ""} ${c.last_name || ""}${c.phone ? ` – ${c.phone}` : ""}`
                                            : "Wybierz klienta...";
                                    })()
                                    : "Wybierz klienta..."}
                            </div>

                            {dropdownOpen && (
                                <div className="absolute w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl mt-1 z-50">
                                    <div className="p-2 border-b dark:border-gray-700">
                                        <input
                                            autoFocus
                                            placeholder="Szukaj klienta…"
                                            className="w-full border rounded-lg p-2 text-sm dark:bg-gray-900 dark:border-gray-700"
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                        />
                                    </div>

                                    <div className="max-h-48 overflow-y-auto">
                                        {filteredClients.map((c) => (
                                            <div
                                                key={c.id}
                                                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
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
                                            <div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">
                                                Brak wyników
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-300 text-sm"
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
                                <div className="p-3 mt-2 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 space-y-2">

                                    {/* Imię + nazwisko */}
                                    <div className="flex gap-2">
                                        <input
                                            className="flex-1 border rounded-lg p-2 text-sm dark:bg-gray-900 dark:border-gray-700"
                                            placeholder="Imię"
                                            value={newClient.first_name}
                                            onChange={(e) =>
                                                setNewClient({ ...newClient, first_name: e.target.value })
                                            }
                                        />
                                        <input
                                            className="flex-1 border rounded-lg p-2 text-sm dark:bg-gray-900 dark:border-gray-700"
                                            placeholder="Nazwisko"
                                            value={newClient.last_name}
                                            onChange={(e) =>
                                                setNewClient({ ...newClient, last_name: e.target.value })
                                            }
                                        />
                                    </div>

                                    {/* Telefon */}
                                    <input
                                        className="w-full border rounded-lg p-2 text-sm dark:bg-gray-900 dark:border-gray-700"
                                        placeholder="Telefon (9 cyfr)"
                                        value={newClient.phone}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/\D/g, "");
                                            if (v.length <= 9) {
                                                setNewClient({ ...newClient, phone: v });
                                            }
                                        }}
                                        maxLength={9}
                                    />

                                    {/* MULTISELECT PRACOWNIKÓW */}
                                    <div className="space-y-2">
                                        <div className="text-sm text-gray-600 dark:text-gray-300">
                                            Przypisz do pracowników *
                                        </div>

                                        <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                                            {employees.map((emp) => (
                                                <label
                                                    key={emp.id}
                                                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-700 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={newClient.employee_ids?.includes(emp.id)}
                                                        onChange={() => {
                                                            setNewClient((prev) => {
                                                                const arr = prev.employee_ids || [];
                                                                return arr.includes(emp.id)
                                                                    ? { ...prev, employee_ids: arr.filter((x) => x !== emp.id) }
                                                                    : { ...prev, employee_ids: [...arr, emp.id] };
                                                            });
                                                        }}
                                                    />

                                                    {emp.name}
                                                </label>
                                            ))}
                                        </div>

                                        {(!newClient.employee_ids || newClient.employee_ids.length === 0) && (
                                            <p className="text-xs text-red-400">
                                                Wybierz przynajmniej jednego pracownika
                                            </p>
                                        )}
                                    </div>

                                    {/* Buttons */}
                                    <div className="flex justify-end gap-2">
                                        <button
                                            className="px-3 py-1 rounded-lg text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                                            onClick={() => setShowNewClientForm(false)}
                                        >
                                            Anuluj
                                        </button>

                                        <button
                                            className="px-3 py-1 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
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
                        <div className="border-b pb-4 dark:border-gray-700 flex flex-col items-center">
                            <label className="text-sm text-gray-500 dark:text-gray-400 self-start">Pracownik *</label>

                            <select
                                className="mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-3"
                                style={{ width: "350px", height: "48px" }}
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
                        <div className="border-b pb-4 dark:border-gray-700 flex flex-col items-center">
                            <label className="text-sm text-gray-500 dark:text-gray-400 self-start">Usługa *</label>

                            <select
                                className="mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-3"
                                style={{ width: "350px", height: "48px" }}
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
                        <div className="border-b pb-4 dark:border-gray-700 flex flex-col items-center">
                            <label className="text-sm text-gray-500 dark:text-gray-400 self-start">Dodatki</label>

                            <div className="mt-2 space-y-1 self-start">
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
                        <div className="border-b pb-4 dark:border-gray-700 flex flex-col items-center">
                            <label className="text-sm text-gray-500 dark:text-gray-400 self-start">Data *</label>

                            <input
                                type="date"
                                className="mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-3"
                                style={{ width: "350px", height: "48px" }}
                                value={toLocalDate(form.date)}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                            />
                        </div>

                        {/* TIME */}
                        <div className="border-b pb-4 dark:border-gray-700 flex flex-col items-center">
                            <label className="text-sm text-gray-500 dark:text-gray-400 self-start">Godzina *</label>

                            <select
                                className="mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-3"
                                style={{ width: "350px", height: "48px" }}
                                value={form.start_time}
                                onChange={(e) => {
                                    const slot = availableTimes.find((s) => s.start_time === e.target.value);
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
                    <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-end gap-3 px-6 py-4">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
                        >
                            Anuluj
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`
                                px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2
                                ${saving
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-orange-500 hover:bg-orange-600"
                                }
                            `}
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
