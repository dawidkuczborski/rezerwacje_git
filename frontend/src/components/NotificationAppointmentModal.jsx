import { useEffect, useState } from "react";
import axios from "axios";
import { Phone, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function NotificationAppointmentModal({ open, appointmentId }) {
    const [appointment, setAppointment] = useState(null);
    const navigate = useNavigate();

    // 🔥 tu pobieramy ID powiadomienia z URL
    const [params] = useSearchParams();
    const notificationId = params.get("notification_id");

    const backendBase = import.meta.env.VITE_API_URL;
    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` }
    });

    // ============================
    // 🔥 Pobieranie danych wizyty
    // ============================
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

    // ============================
    // 🔥 oznacz powiadomienie po ZAMKNIĘCIU modala
    // ============================
    const markNotificationRead = async () => {
        if (!notificationId) return;

        try {
            await axios.post(
                backendBase + "/notifications/mark-read",
                { id: notificationId },
                authHeaders()
            );
        } catch (err) {
            console.error("mark-read error", err);
        }
    };

    // ============================
    // 🔥 Zamknięcie modala
    // ============================
    const closeToCalendar = async () => {
        await markNotificationRead();
        navigate(-1); // wróć do poprzedniej strony
    };

    if (!open) return null;

    const formatDatePL = (d) => {
        try {
            return new Date(d).toLocaleDateString("pl-PL");
        } catch {
            return d;
        }
    };

    // 🟣 Czy zmieniono termin?
    const isChanged =
        appointment?.status === "booked" &&
        (
            appointment?.previous_date ||
            appointment?.previous_start_time ||
            appointment?.previous_end_time
        );

    // 🟩 Status PL
    const translateStatus = () => {
        const st = appointment?.status;

        if (st === "cancelled") return "Anulowana";
        if (st === "completed") return "Zakończona";
        if (isChanged) return "Zmieniona";
        return "Zarezerwowana";
    };

    // 🟦 Kolor statusu
    const statusBadge = () => {
        const st = appointment?.status;

        if (st === "cancelled")
            return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";

        if (st === "completed")
            return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";

        if (isChanged)
            return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";

        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end"
            >
                <motion.div
                    initial={{ y: 60 }}
                    animate={{ y: 0 }}
                    exit={{ y: 60 }}
                    className="w-full h-full bg-white dark:bg-[#1a1a1a] overflow-y-auto flex flex-col"
                >
                    {/* HEADER */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-8 text-white flex justify-center items-center rounded-t-3xl">
                        <h2 className="text-[20px] font-semibold">Szczegóły wizyty</h2>
                    </div>

                    {/* BODY */}
                    <div className="px-6 py-8 space-y-8 flex-1">
                        {!appointment ? (
                            <div className="text-center text-gray-400">Ładowanie…</div>
                        ) : (
                            <>
                                {/* STATUS */}
                                <div className={`px-4 py-2 rounded-xl inline-block ${statusBadge()}`}>
                                    Status: {translateStatus()}
                                </div>

                                {/* KLIENT */}
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

                                {/* PRACOWNIK */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Pracownik</label>
                                    <div className="mt-1">{appointment.employee_name}</div>
                                </div>

                                {/* USŁUGA */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Usługa</label>
                                    <div className="mt-1 flex justify-between">
                                        <span>{appointment.service_name}</span>
                                        <span>{appointment.service_price} zł</span>
                                    </div>
                                </div>

                                {/* DODATKI */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Dodatki</label>

                                    {!appointment.addons?.length ? (
                                        <div className="text-gray-400 text-sm mt-1">Brak</div>
                                    ) : (
                                        <ul className="mt-2 text-sm list-disc list-inside">
                                            {appointment.addons.map((a) => (
                                                <li key={a.id}>
                                                    {a.name} ({a.price} zł)
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* DATA */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Data wizyty</label>
                                    <div className="mt-1">{formatDatePL(appointment.date)}</div>
                                </div>

                                {/* GODZINA */}
                                <div className="border-b pb-4 dark:border-gray-700">
                                    <label className="text-sm text-gray-500">Godzina</label>
                                    <div className="mt-1">
                                        {appointment.start_time?.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}
                                    </div>
                                </div>

                                {/* HISTORIA ZMIAN */}
                                {appointment.status === "booked" && isChanged && (
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
                            onClick={closeToCalendar}
                            className="w-full bg-[#e57b2c] text-white rounded-2xl py-3 text-[16px] font-medium"
                        >
                            Zamknij
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
