// src/pages/Reservations.jsx
import React, {
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef,
} from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import AppointmentModal from "../../components/AppointmentModal";
import { socket } from "../../socket";

// ----------------- HELPERS -----------------
const pad2 = (n) => String(n).padStart(2, "0");

const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + (m || 0);
};

const minutesDiff = (start, end) =>
    Math.max(0, timeToMinutes(end) - timeToMinutes(start));

const formatHHMM = (timeStr) =>
    timeStr ? timeStr.split(":").slice(0, 2).join(":") : "";

const formatDateLocal = (date) => {
    if (!(date instanceof Date)) date = new Date(date);
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
};

const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const formatDateLabel = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = addDays(today, 1);

    if (d.getTime() === today.getTime()) return "Dziś";
    if (d.getTime() === tomorrow.getTime()) return "Jutro";

    const weekday = d.toLocaleDateString("pl-PL", { weekday: "long" });
    const dm = d.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
    });

    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} • ${dm}`;
};

const formatDateShort = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};

const initialsFromName = (name = "") => {
    const parts = name.trim().split(/\s+/);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
    return (
        (parts[0][0] || "").toUpperCase() +
        (parts[parts.length - 1][0] || "").toUpperCase()
    );
};

const formatPricePL = (value) =>
    `${(Number(value) || 0).toLocaleString("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} zł`;

// ----------------- Avatar pracownika -----------------
function EmployeeAvatar({ employee, backendBase }) {
    const [imgError, setImgError] = useState(false);

    const hasImage = employee?.employee_image_url && !imgError;

    if (hasImage) {
        return (
            <img
                src={`${backendBase}/${employee.employee_image_url}`}
                alt={employee.employee_name}
                className="w-12 h-12 rounded-full object-cover"
                onError={() => setImgError(true)}
            />
        );
    }

    return (
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
            {initialsFromName(employee?.employee_name)}
        </div>
    );
}

// ----------------- Main Component -----------------
export default function Reservations() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [days, setDays] = useState([]);
    const [initialLoaded, setInitialLoaded] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");

    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    const loadingMoreRef = useRef(false);

    // ----------------- MULTI FETCH -----------------
    const loadDays = useCallback(
        async (dateStrings) => {
            if (!firebaseUser) return;
            const token = await firebaseUser.getIdToken();
            const salonId = localStorage.getItem("selected_salon_id");

            // oznacz ładowanie
            setDays((prev) => {
                const map = new Map(prev.map((d) => [d.date, d]));
                for (const date of dateStrings) {
                    const existing = map.get(date);
                    map.set(date, {
                        date,
                        employees: existing?.employees || [],
                        loading: true,
                    });
                }
                return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
            });

            try {
                const res = await axios.get(
                    `${backendBase}/api/calendar/shared/multi`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { dates: dateStrings.join(","), salon_id: salonId },
                    }
                );

                const daysPayload = res.data?.days || {};

                setDays((prev) => {
                    const map = new Map(prev.map((d) => [d.date, d]));

                    for (const date of dateStrings) {
                        const dayData = daysPayload[date];
                        const normalizedEmployees = (dayData?.employees || []).map(
                            (e) => ({
                                ...e,
                                appointments: e.appointments || [],
                            })
                        );

                        map.set(date, {
                            date,
                            employees: normalizedEmployees,
                            loading: false,
                        });
                    }

                    return [...map.values()].sort((a, b) =>
                        a.date.localeCompare(b.date)
                    );
                });
            } catch (err) {
                console.error("❌ Błąd pobierania dni (multi)", err);
                setDays((prev) =>
                    prev.map((d) =>
                        dateStrings.includes(d.date)
                            ? { ...d, loading: false }
                            : d
                    )
                );
            }
        },
        [firebaseUser, backendBase]
    );

    // ----------------- LOAD MORE DAYS -----------------
    const handleLoadMore = useCallback(async () => {
        if (!days.length) return;

        const lastDateStr = days[days.length - 1].date;
        const lastDate = new Date(`${lastDateStr}T00:00:00`);

        const newDates = [];
        for (let i = 1; i <= 3; i++) {
            newDates.push(formatDateLocal(addDays(lastDate, i)));
        }

        await loadDays(newDates);
    }, [days, loadDays]);

    // ----------------- INIT -----------------
    useEffect(() => {
        if (!firebaseUser) return;
        if (initialLoaded) return;

        const base = new Date();
        base.setHours(0, 0, 0, 0);

        const dates = [];
        for (let i = 0; i < 7; i++) {
            dates.push(formatDateLocal(addDays(base, i)));
        }

        loadDays(dates);
        setInitialLoaded(true);
    }, [firebaseUser, initialLoaded, loadDays]);

    // ----------------- SOCKET REFRESH -----------------
    useEffect(() => {
        if (!firebaseUser) return;
        const handler = () => {
            const allDates = days.map((d) => d.date);
            if (allDates.length) loadDays(allDates);
        };
        socket.on("calendar_updated", handler);
        return () => socket.off("calendar_updated", handler);
    }, [firebaseUser, days, loadDays]);

    // ----------------- AUTOSCROLL (WINDOW) -----------------
    useEffect(() => {
        const onScroll = () => {
            if (loadingMoreRef.current) return;

            const scrollY = window.scrollY;
            const viewport = window.innerHeight;
            const full = document.body.scrollHeight;

            // Jeśli zostało mniej niż 300px do końca
            if (scrollY + viewport >= full - 300) {
                loadingMoreRef.current = true;

                (async () => {
                    try {
                        await handleLoadMore();
                    } finally {
                        loadingMoreRef.current = false;
                    }
                })();
            }
        };

        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, [handleLoadMore]);

    const handleOpenAppointment = (appointment) => {
        setSelectedAppointment(appointment);
        setModalOpen(true);
    };

    // ----------------- EMPLOYEES FILTER -----------------
    const allEmployees = useMemo(() => {
        const map = new Map();
        for (const day of days) {
            for (const e of day.employees || []) {
                if (!e.is_active) continue;
                if (!map.has(e.employee_id)) map.set(e.employee_id, e);
            }
        }
        return [...map.values()].sort((a, b) =>
            (a.employee_name || "").localeCompare(b.employee_name || "")
        );
    }, [days]);

    // ----------------- RENDER -----------------
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6 shadow-sm">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <Users size={24} />
                    Rezerwacje
                </h1>
            </div>

            {/* WHITE MAIN CARD */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm">
                    {/* EMPLOYEES FILTER */}
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                        <button
                            onClick={() => setSelectedEmployeeId("all")}
                            className={`px-4 py-2 rounded-2xl text-[14px] font-medium whitespace-nowrap
                                ${selectedEmployeeId === "all"
                                    ? "bg-[#e57b2c] text-white"
                                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                }`}
                        >
                            Wszyscy
                        </button>

                        {allEmployees.map((e) => (
                            <button
                                key={e.employee_id}
                                onClick={() => setSelectedEmployeeId(e.employee_id)}
                                className={`px-4 py-2 rounded-2xl text-[14px] font-medium whitespace-nowrap
                                    ${selectedEmployeeId === e.employee_id
                                        ? "bg-[#e57b2c] text-white"
                                        : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                    }`}
                            >
                                {e.employee_name}
                            </button>
                        ))}
                    </div>

                    {/* DAYS + APPOINTMENTS */}
                    <div className="space-y-6">
                        {days.map((day) => {
                            const flatAppointments = (day.employees || [])
                                .filter((e) => e.is_active)
                                .flatMap((emp) =>
                                    (emp.appointments || []).map((a) => ({
                                        ...a,
                                        _employee: emp,
                                    }))
                                )
                                .filter((a) =>
                                    selectedEmployeeId === "all"
                                        ? true
                                        : Number(a._employee.employee_id) ===
                                        Number(selectedEmployeeId)
                                )
                                .sort((a, b) =>
                                    (a.start_time || "").localeCompare(
                                        b.start_time || ""
                                    )
                                );

                            const dayTotalValue = flatAppointments.reduce(
                                (sum, a) => sum + (Number(a.total_price) || 0),
                                0
                            );

                            return (
                                <div key={day.date} className="space-y-2">
                                    {/* DAY TITLE */}
                                    <div className="flex justify-between items-center">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            {formatDateLabel(day.date)}
                                        </div>
                                        {day.loading && (
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                                Ładowanie...
                                            </div>
                                        )}
                                    </div>

                                    {/* SUMMARY CARD */}
                                    <div className="bg-gray-100 dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between">
                                        <div>
                                            <div className="text-[11px] uppercase text-gray-500 dark:text-gray-400">
                                                DZIEŃ
                                            </div>
                                            <div className="text-[13px] font-semibold">
                                                {formatDateShort(day.date)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] uppercase text-gray-500 dark:text-gray-400">
                                                WARTOŚĆ
                                            </div>
                                            <div className="text-[13px] font-semibold">
                                                {formatPricePL(dayTotalValue)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] uppercase text-gray-500 dark:text-gray-400">
                                                REZERWACJE
                                            </div>
                                            <div className="text-[13px] font-semibold">
                                                {flatAppointments.length}
                                            </div>
                                        </div>
                                    </div>

                                    {/* APPOINTMENT CARDS */}
                                    {flatAppointments.length === 0 && !day.loading ? (
                                        <div className="text-sm text-gray-500 dark:text-gray-400 px-2 py-2">
                                            Brak rezerwacji.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {flatAppointments.map((a, i) => {
                                                const duration = minutesDiff(
                                                    a.start_time,
                                                    a.end_time
                                                );

                                                return (
                                                    <motion.button
                                                        key={a.id}
                                                        onClick={() =>
                                                            handleOpenAppointment(a)
                                                        }
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="w-full bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl px-4 py-4 flex items-center gap-4 text-left"
                                                    >
                                                        <EmployeeAvatar
                                                            employee={a._employee}
                                                            backendBase={backendBase}
                                                        />

                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <div className="font-semibold text-[15px] truncate">
                                                                    {a.client_name}
                                                                </div>
                                                                <div className="text-[13px] font-semibold">
                                                                    {formatPricePL(
                                                                        a.total_price
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                                                                {formatHHMM(
                                                                    a.start_time
                                                                )}{" "}
                                                                • {duration} min •{" "}
                                                                {a.service_name}
                                                                {a.addons &&
                                                                    a.addons.trim() !==
                                                                    "" && (
                                                                        <> • {a.addons}</>
                                                                    )}
                                                            </div>

                                                            <div className="text-[12px] text-gray-400 dark:text-gray-500">
                                                                {
                                                                    a._employee
                                                                        .employee_name
                                                                }
                                                            </div>
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* MODAL */}
            {modalOpen && selectedAppointment && (
                <AppointmentModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    appointmentId={selectedAppointment.id}
                    onUpdated={async () => {
                        setModalOpen(false);
                        const all = days.map((d) => d.date);
                        if (all.length) await loadDays(all);
                    }}
                    socket={socket}
                />
            )}
        </div>
    );
}
