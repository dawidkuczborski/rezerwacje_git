import { useEffect, useState } from "react";
import axios from "axios";
import { X, Phone, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationAppointmentModal({ open, onClose, appointmentId }) {
    const [appointment, setAppointment] = useState(null);

    const backendBase = import.meta.env.VITE_API_URL;
    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` }
    });

    useEffect(() => {
        if (!open || !appointmentId) return;

        const load = async () => {
            try {
                const res = await axios.get(
                    `${backendBase}/api/appointments/${appointmentId}/notification-details`,
                    authHeaders()
                );
                setAppointment(res.data);
            } catch (err) {
                console.error("LOAD ERROR:", err);
            }
        };

        load();
    }, [open, appointmentId]);

    if (!open) return null;

    const formatDatePL = (d) => {
        try {
            return new Date(d).toLocaleDateString("pl-PL");
        } catch {
            return d;
        }
    };

    const statusBadge = (st) => {
        switch (st) {
            case "cancelled":
                return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
            case "completed":
                return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
            default:
                return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end"
            >
                <motion.div
                    initial={{ y: 60 }}
                    animate={{ y: 0 }}
                    exit={{ y: 60 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-full bg-white dark:bg-[#1a1a1a] overflow-y-auto rounded-t-3xl flex flex-col"
                >
                    {/* HEADER */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-8 text-white flex justify-between items-center rounded-t-3xl">
                        <h2 className="text-[20px] font-semibold">
                            Szczegó³y powiadomienia
                        </h2>

                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl">
                            <X size={22} />
                        </button>
                    </div>

                    {/* BODY */}
                    <div className="-mt-6 bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-8 space-y-8 flex-1">

                        {!appointment ? (
                            <div className="text-center text-gray-400">£adowanie…</div>
                        ) : (
                            <>
                                {/* STATUS */}
                                <div className={`px-4 py-2 rounded-xl inline-block ${statusBadge(appointment.status)}`}>
                                    Status: {appointment.status}
                                </div>

                                {/* CLIENT */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Klient</label>
                                    <div className="mt-1 font-semibold">{appointment.client_name}</div>

                                    {appointment.client_phone ? (
                                        <a
                                            href={`tel:${appointment.client_phone}`}
                                            className="text-orange-600 text-sm flex items-center gap-1 mt-1"
                                        >
                                            <Phone size={14} /> {appointment.client_phone}
                                        </a>
                                    ) : (
                                        <div className="text-gray-400 text-sm mt-1">Brak telefonu</div>
                                    )}
                                </div>

                                {/* EMPLOYEE */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Pracownik</label>
                                    <div className="mt-1">{appointment.employee_name}</div>
                                </div>

                                {/* SERVICE */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Us³uga</label>
                                    <div className="mt-1 flex justify-between">
                                        <span>{appointment.service_name}</span>
                                        <span>{appointment.service_price} z³</span>
                                    </div>
                                </div>

                                {/* ADDONS */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Dodatki</label>

                                    {!appointment.addons?.length ? (
                                        <div className="text-gray-400 text-sm mt-1">Brak</div>
                                    ) : (
                                        <ul className="mt-2 text-sm list-disc list-inside">
                                            {appointment.addons.map((a) => (
                                                <li key={a.id}>
                                                    {a.name} ({a.price} z³)
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* DATE */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Data wizyty</label>
                                    <div className="mt-1">{formatDatePL(appointment.date)}</div>
                                </div>

                                {/* TIME */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Godzina</label>
                                    <div className="mt-1">
                                        {appointment.start_time?.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}
                                    </div>
                                </div>

                                {/* HISTORY (changes) */}
                                {(appointment.changed_at ||
                                    appointment.previous_date ||
                                    appointment.previous_start_time) && (
                                        <div className="pt-4">
                                            <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                                                <History size={15} /> Historia zmian
                                            </div>

                                            <div className="space-y-2 text-sm">

                                                {appointment.previous_date && (
                                                    <div className="flex justify-between">
                                                        <span>Poprzednia data</span>
                                                        <span className="font-medium">
                                                            {formatDatePL(appointment.previous_date)}
                                                        </span>
                                                    </div>
                                                )}

                                                {(appointment.previous_start_time || appointment.previous_end_time) && (
                                                    <div className="flex justify-between">
                                                        <span>Poprzednia godzina</span>
                                                        <span className="font-medium">
                                                            {appointment.previous_start_time?.slice(0, 5)} –{" "}
                                                            {appointment.previous_end_time?.slice(0, 5)}
                                                        </span>
                                                    </div>
                                                )}

                                                {appointment.changed_at && (
                                                    <div className="flex justify-between">
                                                        <span>Ostatnia zmiana</span>
                                                        <span className="font-medium">
                                                            {new Date(appointment.changed_at).toLocaleString("pl-PL")}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                            </>
                        )}
                    </div>

                    {/* FOOTER */}
                    <div className="p-6">
                        <button
                            onClick={onClose}
                            className="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-2xl py-3 text-[16px] font-medium"
                        >
                            Zamknij
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
