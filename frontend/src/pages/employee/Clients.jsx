import { useEffect, useState } from "react";
import { Search, Phone, MessageCircle, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../../components/AuthProvider";
import NewAppointmentModal from "../../components/NewAppointmentModal";

export default function Clients() {
    const { firebaseUser } = useAuth();
    const backend = import.meta.env.VITE_API_URL;

    const [clients, setClients] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);

    const [employees, setEmployees] = useState([]);
    const [employeeFilter, setEmployeeFilter] = useState("all");

    const [query, setQuery] = useState("");
    const [selectedClient, setSelectedClient] = useState(null);

    const [loading, setLoading] = useState(false);
    const salonId = localStorage.getItem("selected_salon_id");

    const [rebookModalOpen, setRebookModalOpen] = useState(false);
    const [rebookPrefill, setRebookPrefill] = useState(null);

    const formatDate = (date) =>
        new Date(date).toLocaleDateString("pl-PL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });

    const formatTime = (t) => (t ? t.slice(0, 5) : "");

    const loadEmployees = async () => {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();

        const res = await fetch(
            `${backend}/api/vacations/init?salon_id=${salonId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();

        if (data.is_provider) {
            const merged = data.salons.flatMap((s) =>
                s.employees.map((e) => ({
                    id: e.id,
                    name: `${e.name} (${s.salon_name})`,
                }))
            );
            setEmployees(merged);
        } else {
            setEmployees(data.employees);
            setEmployeeFilter("all");
        }
    };

    const loadClients = async (reset = false) => {
        if (!firebaseUser) return;

        setLoading(true);
        const token = await firebaseUser.getIdToken();

        // jeśli backend jest pusty → będzie "/api/clients"
        const baseUrl = backend ? `${backend}/api/clients` : `/api/clients`;

        // poprawne ustawianie parametrów
        const params = new URLSearchParams();
        params.set("salon_id", salonId);
        params.set("page", page);
        params.set("limit", limit);
        if (query.trim() !== "") params.set("q", query);
        if (employeeFilter !== "all") params.set("employee_id", employeeFilter);

        const finalUrl = `${baseUrl}?${params.toString()}`;

        const res = await fetch(finalUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (reset) setClients(data.items);
        else setClients((prev) => [...prev, ...data.items]);

        setTotal(data.total);
        setLoading(false);
    };


    useEffect(() => {
        loadEmployees();
    }, [firebaseUser]);

    useEffect(() => {
        setPage(1);
        loadClients(true);
    }, [employeeFilter, query]);

    useEffect(() => {
        if (page > 1) loadClients();
    }, [page]);

    const loadMore = () => {
        if (clients.length < total) setPage((p) => p + 1);
    };

    const openClient = async (clientId) => {
        if (!firebaseUser) return;

        const token = await firebaseUser.getIdToken();

        const res = await fetch(`${backend}/api/clients/${clientId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        setSelectedClient(data);
    };

    const openRebookModal = (appointment) => {
        setRebookPrefill({
            client_id: selectedClient.client.id,
            employee_id: appointment.employee_id,
            service_id: appointment.service_id,
            addons: Array.isArray(appointment.addons)
                ? appointment.addons.map((a) => a.addon_id || a.id)
                : [],
        });

        setRebookModalOpen(true);
    };

    return (
        <div className="w-full bg-[#f7f7f7] min-h-screen pb-24">

            {/* WSPÓLNY HEADER – ten sam wygląd, zmienia się tylko treść */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">

                {!selectedClient && (
                    <h1 className="text-white text-[26px] font-semibold">Klienci</h1>

                )}

                {selectedClient && (
                    <button
                        onClick={() => setSelectedClient(null)}
                        className="text-white flex items-center gap-2 text-[18px] py-[7px]"
                    >
                        <ArrowLeft size={20} strokeWidth={2.2} />
                        Powrót
                    </button>

                )}
            </div>

            {/* LIST VIEW – WHITE PANEL */}
            {!selectedClient && (
                <div className="-mt-6">
                    <div className="bg-white rounded-t-[32px] px-6 py-6 shadow-sm">

                        {/* SEARCH */}
                        <div className="relative mb-4">
                            <Search
                                size={18}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="text"
                                placeholder="Szukaj po imieniu, nazwisku lub numerze"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-2xl py-3 pl-11 pr-4 text-[15px]"
                            />
                        </div>

                        {/* SELECT */}
                        <select
                            value={employeeFilter}
                            onChange={(e) => setEmployeeFilter(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-2xl py-3 px-4 text-[15px] mb-4"
                        >
                            <option value="all">Wszyscy pracownicy</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.name}
                                </option>
                            ))}
                        </select>

                        {/* CLIENT LIST */}
                        <div className="space-y-3">
                            {clients.map((c, i) => (
                                <motion.div
                                    key={c.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.02 }}
                                    onClick={() => openClient(c.id)}
                                    className="bg-white border border-gray-200 rounded-3xl px-5 py-4"
                                >
                                    <div className="text-[16px] font-semibold text-gray-900">
                                        {c.first_name} {c.last_name}
                                    </div>
                                    <div className="text-gray-500 text-sm mt-1">{c.phone}</div>
                                </motion.div>
                            ))}

                            {clients.length < total && (
                                <button
                                    onClick={loadMore}
                                    className="w-full bg-[#e57b2c] text-white rounded-full py-2.5 mt-2"
                                >
                                    {loading ? "Ładowanie..." : "Pokaż więcej"}
                                </button>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* DETAILS VIEW – WHITE PANEL */}
            {selectedClient && (
                <div className="-mt-6">
                    <div className="bg-white rounded-t-[32px] px-6 py-6 shadow-sm">

                        <h2 className="text-[24px] font-bold">
                            {selectedClient.client.first_name} {selectedClient.client.last_name}
                        </h2>

                        <div className="text-gray-600 text-[16px] mt-1">
                            {selectedClient.client.phone}
                        </div>

                        {/* ACTION BUTTONS */}
                        <div className="flex gap-3 mt-5">
                            <a
                                href={`sms:${selectedClient.client.phone}`}
                                className="flex-1 bg-[#e57b2c] text-white py-3 rounded-2xl flex items-center justify-center gap-2 font-medium"
                            >
                                <MessageCircle size={18} /> SMS
                            </a>

                            <a
                                href={`tel:${selectedClient.client.phone}`}
                                className="flex-1 bg-green-600 text-white py-3 rounded-2xl flex items-center justify-center gap-2 font-medium"
                            >
                                <Phone size={18} /> Telefon
                            </a>
                        </div>

                        {/* Upcoming */}
                        <div className="mt-7">
                            <h3 className="text-[18px] font-semibold">Nadchodzące wizyty</h3>

                            {selectedClient.upcoming_appointments.length === 0 && (
                                <div className="text-gray-400 text-sm mt-1">Brak wizyt</div>
                            )}

                            {selectedClient.upcoming_appointments.map((a, i) => (
                                <div
                                    key={i}
                                    className="bg-white border border-orange-200 rounded-2xl px-4 py-4 mt-3"
                                >
                                    <div className="font-medium text-[15px]">
                                        {formatDate(a.date)} • {formatTime(a.start_time)} — {formatTime(a.end_time)}
                                    </div>

                                    <div className="text-sm text-gray-500 mt-1">
                                        {a.service_name}, {a.employee_name}
                                    </div>

                                    <button
                                        onClick={() => openRebookModal(a)}
                                        className="text-[#e57b2c] text-sm font-medium mt-3"
                                    >
                                        Umów ponownie
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Past */}
                        <div className="mt-8 mb-14">
                            <h3 className="text-[18px] font-semibold">Zakończone wizyty</h3>

                            {selectedClient.past_appointments.length === 0 && (
                                <div className="text-gray-400 text-sm mt-1">Brak historii</div>
                            )}
                        </div>

                    </div>
                </div>
            )}

            <NewAppointmentModal
                open={rebookModalOpen}
                onClose={() => setRebookModalOpen(false)}
                prefill={rebookPrefill}
                activeDay={null}
                onCreated={() => {
                    setRebookModalOpen(false);
                    if (selectedClient?.client?.id) openClient(selectedClient.client.id);
                    else loadClients(true);
                }}
            />
        </div>
    );
}
