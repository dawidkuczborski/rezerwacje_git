import { useEffect, useState } from "react";
import axios from "axios";
import { X, Pencil, Save, Phone, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AppointmentModal({ open, onClose, appointmentId, onUpdated }) {

    const [appointment, setAppointment] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [addons, setAddons] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);

    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState(false);

    const backendBase = import.meta.env.VITE_API_URL;

    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
    });

    // -------------------------------
    //  FIX FUNKCJI DATY – lokalna data bez UTC
    // -------------------------------
    const toLocalDate = (d) => {
        if (!d) return "";
        const date = new Date(d);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    // -------------------------------
    //  LOAD APPOINTMENT DETAILS
    // -------------------------------
    useEffect(() => {
        if (!open || !appointmentId) return;

        const load = async () => {
            try {
                const res = await axios.get(
                    `${backendBase}/api/appointments/${appointmentId}/details`
                );
                const data = res.data;

                const appt = {
                    ...data?.appointment,
                    addons: (data?.appointment?.addons || []).map((a) => a.id),
                    date: toLocalDate(data?.appointment?.date),
                };

                setAppointment(appt);
                setEmployees(data?.available_employees || []);
                setServices(data?.available_services || []);
                setAddons(data?.available_addons || []);

                if (appt.employee_id && appt.service_id && appt.date) {
                    fetchAvailableTimes(appt.employee_id, appt.service_id, appt.date, appt.addons);
                }
            } catch (err) {
                console.error("LOAD ERROR:", err);
            }
        };

        load();
    }, [open, appointmentId]);

    // -------------------------------
    //      FETCH AVAILABLE TIMES (jak w NewAppointmentModal)
    // -------------------------------
    const fetchAvailableTimes = async (empId, srvId, date, addonIds) => {
        if (!empId || !srvId || !date) {
            setAvailableTimes([]);
            return;
        }

        try {
            const baseParams = {
                employee_id: empId,
                service_id: srvId,
                date: toLocalDate(date),
            };

            if (addonIds?.length) baseParams.addons = addonIds.join(",");

            const res = await axios.get(
                `${backendBase}/api/appointments/employee/available`,
                {
                    ...authHeaders(),
                    params: {
                        ...baseParams,
                        salon_id: localStorage.getItem("selected_salon_id"),
                    },
                }
            );

            const normalized = (res.data?.slots || []).map((s) => ({
                ...s,
                label:
                    s.type === "normal"
                        ? `${s.start_time} – ${s.end_time}`
                        : s.type === "blocked"
                            ? `⛔ ${s.start_time} – ${s.end_time} (blokada/urlop)`
                            : s.type === "outside_hours"
                                ? `⚠️ ${s.start_time} – ${s.end_time} (poza grafikiem)`
                                : `🛌 ${s.start_time} – ${s.end_time} (wolne)`,
            }));

            setAvailableTimes(normalized);
        } catch (err) {
            console.error("SLOTS ERROR:", err);
            setAvailableTimes([]);
        }
    };

    // auto reload slots
    useEffect(() => {
        if (!appointment) return;

        fetchAvailableTimes(
            appointment.employee_id,
            appointment.service_id,
            appointment.date,
            appointment.addons
        );
    }, [
        appointment?.employee_id,
        appointment?.service_id,
        appointment?.date,
        JSON.stringify(appointment?.addons),
    ]);

    // -------------------------------
    //         SAVE CHANGES
    // -------------------------------
    const handleSave = async () => {
        if (!appointment) return;

        setSaving(true);

        try {
            const payload = {
                service_id: appointment.service_id,
                employee_id: appointment.employee_id,
                addons: appointment.addons,
                start_time: appointment.start_time,
                end_time: appointment.end_time,
                date: toLocalDate(appointment.date),
            };

            await axios.put(
                `${backendBase}/api/appointments/${appointmentId}/details`,
                payload
            );

            onUpdated?.();

            setSavedPopup(true);
            setTimeout(() => {
                setSavedPopup(false);
                setEditMode(false);
                onClose();
            }, 800);
        } catch (err) {
            console.error("SAVE ERROR:", err);
            alert("Nie udało się zapisać zmian.");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const formatDatePL = (d) => {
        try {
            return new Date(d).toLocaleDateString("pl-PL");
        } catch {
            return d;
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-end"
            >
                <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    exit={{ y: 80 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-full bg-white dark:bg-[#1a1a1a] overflow-y-auto flex flex-col"
                >
                    {/* SAVED POPUP */}
                    {savedPopup && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl"
                        >
                            <CheckCircle size={16} /> Zapisano!
                        </motion.div>
                    )}

                    {/* HEADER */}
                    <div className="bg-[#e57b2c] dark:bg-[#b86422] px-6 pt-[calc(env(safe-area-inset-top)+22px)] pb-10 text-white flex justify-between items-center">
                        <h2 className="text-[20px] font-semibold">
                            {editMode ? "Edytuj wizytę" : "Szczegóły wizyty"}
                        </h2>

                        <div className="flex gap-2">
                            {!editMode && (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="p-2 hover:bg-white/20 rounded-xl"
                                >
                                    <Pencil size={20} />
                                </button>
                            )}

                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/20 rounded-xl"
                            >
                                <X size={22} />
                            </button>
                        </div>
                    </div>

                    {/* BODY */}
                    <div className="-mt-6 bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-8 space-y-8 flex-1">

                        {/* CLIENT */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">Klient</label>
                            <div className="mt-1">
                                <div className="font-semibold">
                                    {appointment?.client_name}
                                </div>

                                {appointment?.client_phone ? (
                                    <a
                                        href={`tel:${appointment.client_phone}`}
                                        className="text-orange-600 text-sm flex items-center gap-1 mt-1"
                                    >
                                        <Phone size={14} /> {appointment.client_phone}
                                    </a>
                                ) : (
                                    <div className="text-gray-400 text-sm mt-1">
                                        Brak telefonu
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* EMPLOYEE */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">Pracownik</label>

                            {editMode ? (
                                <select
                                    value={appointment?.employee_id || ""}
                                    onChange={(e) =>
                                        setAppointment((p) => ({
                                            ...p,
                                            employee_id: Number(e.target.value),
                                        }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                >
                                    <option value="">Wybierz...</option>
                                    {employees.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="mt-1">{appointment?.employee_name}</div>
                            )}
                        </div>

                        {/* SERVICE */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">Usługa</label>

                            {editMode ? (
                                <select
                                    value={appointment?.service_id || ""}
                                    onChange={(e) =>
                                        setAppointment((p) => ({
                                            ...p,
                                            service_id: Number(e.target.value),
                                        }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                >
                                    <option value="">Wybierz...</option>
                                    {services.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.price} zł)
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="mt-1 flex justify-between">
                                    <span>{appointment?.service_name}</span>
                                    <span>{appointment?.service_price} zł</span>
                                </div>
                            )}

                        </div>

                        {/* ADDONS */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">Dodatki</label>

                            {editMode ? (
                                <div className="mt-2 space-y-2">
                                    {addons
                                        .filter(
                                            (a) =>
                                                !a.service_id ||
                                                a.service_id === appointment?.service_id
                                        )
                                        .map((a) => (
                                            <label
                                                key={a.id}
                                                className="flex items-center gap-2 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={appointment?.addons?.includes(
                                                        a.id
                                                    )}
                                                    onChange={() =>
                                                        setAppointment((prev) => {
                                                            const exists =
                                                                prev.addons.includes(
                                                                    a.id
                                                                );
                                                            return {
                                                                ...prev,
                                                                addons: exists
                                                                    ? prev.addons.filter(
                                                                        (id) =>
                                                                            id !==
                                                                            a.id
                                                                    )
                                                                    : [
                                                                        ...prev.addons,
                                                                        a.id,
                                                                    ],
                                                            };
                                                        })
                                                    }
                                                />
                                                {a.name} ({a.price} zł)
                                            </label>
                                        ))}
                                </div>
                            ) : appointment?.addons?.length ? (
                                <ul className="mt-2 text-sm list-disc list-inside">
                                    {appointment.addons
                                        .map((id) =>
                                            addons.find((a) => a.id === id)
                                        )
                                        .filter(Boolean)
                                        .map((a) => (
                                            <li key={a.id}>
                                                {a.name} ({a.price} zł)
                                            </li>
                                        ))}
                                </ul>
                            ) : (
                                <div className="text-gray-400 text-sm mt-1">
                                    Brak
                                </div>
                            )}
                        </div>

                        {/* DATE */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">
                                Data wizyty
                            </label>
                            {editMode ? (
                                <input
                                    type="date"
                                    value={toLocalDate(appointment?.date)}
                                    onChange={(e) =>
                                        setAppointment((p) => ({
                                            ...p,
                                            date: e.target.value,
                                        }))
                                    }
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                />
                            ) : (
                                <div className="mt-1">
                                    {formatDatePL(appointment?.date)}
                                </div>
                            )}
                        </div>

                        {/* TIME SLOTS — tak samo jak w NewAppointmentModal */}
                        <div className="border-b pb-4 dark:border-gray-700">
                            <label className="text-sm text-gray-500">Godzina</label>

                            {editMode ? (
                                <select
                                    value={appointment?.start_time || ""}
                                    onChange={(e) => {
                                        const slot = availableTimes.find(
                                            (s) => s.start_time === e.target.value
                                        );
                                        if (!slot || slot.type === "blocked") return;

                                        setAppointment((p) => ({
                                            ...p,
                                            start_time: slot.start_time,
                                            end_time: slot.end_time,
                                        }));
                                    }}
                                    className="bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-gray-700 rounded-2xl px-4 mt-1"
                                    style={{ width: "350px", height: "48px" }}
                                >
                                    <option value="">Wybierz termin...</option>
                                    {availableTimes.map((s, i) => (
                                        <option key={i} value={s.start_time} disabled={s.type === "blocked"}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="mt-1">
                                    {appointment?.start_time
                                        ? `${appointment.start_time.slice(0, 5)} – ${appointment.end_time.slice(0, 5)}`
                                        : "—"}
                                </div>
                            )}

                        </div>

                        {/* TOTAL */}
                        <div className="pt-4 flex justify-between text-sm font-medium">
                            <span>Łącznie</span>
                            <span>
                                {(() => {
                                    const base =
                                        Number(appointment?.service_price) || 0;
                                    const addonsTotal = appointment?.addons
                                        ?.map(
                                            (id) =>
                                                addons.find((a) => a.id === id)
                                                    ?.price || 0
                                        )
                                        .reduce(
                                            (sum, v) =>
                                                sum + Number(v),
                                            0
                                        );

                                    return (base + addonsTotal).toFixed(2);
                                })()}{" "}
                                zł
                            </span>
                        </div>
                    </div>

                    {/* FOOTER */}
                    {editMode && (
                        <div className="p-6 flex justify-end gap-3">
                            <button
                                onClick={() => setEditMode(false)}
                                disabled={saving}
                                className="px-6 py-3 rounded-2xl bg-gray-200 dark:bg-gray-700"
                            >
                                Anuluj
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-3 rounded-2xl text-white bg-[#e57b2c] flex items-center gap-2"
                            >
                                {saving ? "Zapisywanie…" : (
                                    <>
                                        <Save size={18} /> Zapisz
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
