// src/pages/MyAppointments.jsx
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../components/AuthProvider";
import {
  ArrowLeft,
  Clock,
  Calendar,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

/* ---------- Helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const formatIsoDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("pl-PL") : "";
const formatTime = (t) => (t ? t.slice(0, 5) : "");
const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/* ---------- CalendarGrid ---------- */
const CalendarGrid = ({
  monthDate,
  availableDays,
  selectedDate,
  onSelectDate,
  onMonthChange,
  loadingDays,
  isDark,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buildMonthGrid = (d) => {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const startOffset = (first.getDay() + 6) % 7; // monday start
    const totalCells = startOffset + last.getDate();
    const rows = Math.ceil(totalCells / 7);
    const cells = [];
    let current = new Date(first);
    current.setDate(first.getDate() - startOffset);
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < 7; c++) {
        row.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      cells.push(row);
    }
    return cells;
  };

  const monthGrid = buildMonthGrid(monthDate);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onMonthChange(-1)}
            className={`p-2 rounded-lg border ${
              isDark ? "border-gray-700 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-medium text-base capitalize">
            {monthDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
          </h3>
          <button
            onClick={() => onMonthChange(1)}
            className={`p-2 rounded-lg border ${
              isDark ? "border-gray-700 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {loadingDays && <Loader2 className="animate-spin text-[#E57B2C]" size={18} />}
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium mb-1">
        {["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"].map((d) => (
          <div key={d} className="text-gray-400">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {monthGrid.flat().map((cell, i) => {
          const iso = formatIsoDate(cell);
          const isPast = cell < today;
          const isAvailable = availableDays.includes(iso);
          const isCurrentMonth = cell.getMonth() === monthDate.getMonth();
          const isSelected = cell.toDateString() === selectedDate.toDateString();
          const disabled = !isAvailable || isPast || !isCurrentMonth;

          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onSelectDate(cell)}
              className={`h-10 w-10 flex items-center justify-center rounded-full text-sm transition-all duration-150 ${
                isSelected
                  ? "bg-[#E57B2C] text-white font-semibold"
                  : disabled
                  ? "opacity-30 cursor-not-allowed"
                  : isDark
                  ? "hover:bg-gray-700 text-gray-100"
                  : "hover:bg-orange-100 text-gray-800"
              }`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ---------- SlotsList ---------- */
const SlotsList = ({ slots, selectedSlot, onSelectSlot, loadingSlots, isDark }) => {
  if (loadingSlots) return (
    <div className="flex justify-center py-2">
      <Loader2 size={20} className="animate-spin text-[#E57B2C]" />
    </div>
  );

  if (!slots.length) return (
    <p className="text-center text-sm text-gray-400 mt-2">Brak dostępnych terminów.</p>
  );

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar mt-3">
      {slots.map((s, i) => {
        const isSelected = selectedSlot && selectedSlot.employee_id === s.employee_id && selectedSlot.start_time === s.start_time;
        return (
          <button
            key={i}
            onClick={() => onSelectSlot(s)}
            className={`flex flex-col items-center justify-center py-2 px-4 rounded-xl min-w-[86px] text-sm font-medium whitespace-nowrap transition-all ${
              isSelected
                ? "bg-[#E57B2C] text-white border border-[#E57B2C]"
                : isDark
                ? "bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
                : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-100"
            }`}
          >
            <div className="text-sm font-semibold leading-none">{s.start_time}</div>
            <div className="text-xs leading-none mt-0.5">{s.employee_name?.split(" ")[0] || s.employee_name}</div>
          </button>
        );
      })}
    </div>
  );
};

/* ---------- Main Component ---------- */
export default function MyAppointments() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const backendBase = import.meta.env.VITE_API_URL;

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const isDark = theme === "dark";

  // modal/reschedule state
  const [showModal, setShowModal] = useState(false);
  const [changingAppt, setChangingAppt] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthDate, setMonthDate] = useState(new Date());
  const [availableDays, setAvailableDays] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  /* ---------- Theme apply ---------- */
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", isDark);
    localStorage.setItem("theme", theme);
  }, [isDark, theme]);

  /* ---------- Load appointments ---------- */
  const loadAppointments = useCallback(async () => {
    try {
      if (!firebaseUser) return;
      setLoading(true);
      const token = await firebaseUser.getIdToken();
      const res = await axios.get(`${backendBase}/api/appointments/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(res.data || []);
    } catch (err) {
      console.error("❌ Błąd ładowania wizyt:", err);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, backendBase]);

  useEffect(() => {
    if (!firebaseUser) return;
    loadAppointments();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadAppointments();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [firebaseUser, loadAppointments]);

  /* ---------- Cancel appointment ---------- */
  const handleCancel = async (appt) => {
    if (!window.confirm("Czy na pewno chcesz anulować tę wizytę?")) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.put(
        `${backendBase}/api/appointments/${appt.id}`,
        { status: "cancelled" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await loadAppointments();
      alert("✅ Wizyta anulowana");
    } catch (err) {
      console.error("❌ Błąd anulowania:", err);
      alert("❌ Nie udało się anulować wizyty");
    }
  };

  /* ---------- Reschedule helpers ---------- */
  const computeTotalDuration = (appt) => {
    const base = Number(appt.service_duration_minutes || appt.service_duration || 30);
    const addons = (appt.addons || []).reduce((s, a) => s + Number(a.addon_duration || a.duration_minutes || 0), 0);
    return base + addons;
  };

  const loadMonthDays = async (appt, monthRef) => {
    setLoadingDays(true);
    try {
      const token = await firebaseUser.getIdToken();
      const params = {
        service_id: appt.service_id,
        year: monthRef.getFullYear(),
        month: monthRef.getMonth() + 1,
        employee_id: appt.employee_id,
      };
      const res = await axios.get(`${backendBase}/api/appointments/unavailable-days`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      const unavailable = res.data || [];
      const year = monthRef.getFullYear();
      const month = monthRef.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const allDays = Array.from({ length: daysInMonth }, (_, i) => formatIsoDate(new Date(year, month, i + 1)));
      const available = allDays.filter((d) => !unavailable.includes(d));
      setAvailableDays(available);
    } catch (err) {
      console.error("Błąd ładowania dni:", err);
      setAvailableDays([]);
    } finally {
      setLoadingDays(false);
    }
  };

  const loadSlots = async (appt, date) => {
    setLoadingSlots(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await axios.get(`${backendBase}/api/appointments/available`, {
        params: {
          service_id: appt.service_id,
          date: formatIsoDate(date),
          total_duration: computeTotalDuration(appt),
          employee_id: appt.employee_id,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      // dedupe by employee+start_time (safety)
      const unique = [];
      const seen = new Set();
      (res.data || []).forEach((s) => {
        const key = `${s.employee_id}__${s.start_time}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(s);
        }
      });
      setSlots(unique);
    } catch (err) {
      console.error("Błąd ładowania slotów:", err);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleMonthChange = (dir) => {
    const newM = new Date(monthDate);
    newM.setMonth(newM.getMonth() + dir);
    const now = new Date();
    const minM = new Date(now.getFullYear(), now.getMonth(), 1);
    if (newM >= minM) {
      setMonthDate(newM);
      if (changingAppt) loadMonthDays(changingAppt, newM);
    }
  };

  const handleSelectDate = (d) => {
    setSelectedDate(d);
    if (changingAppt) loadSlots(changingAppt, d);
  };

  const openChangeModal = async (appt) => {
    // only allow change for 'booked' future appointments
    const apptDate = new Date(appt.date);
    apptDate.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    if (appt.status !== "booked" || apptDate < today) {
      alert("Można zmieniać tylko nadchodzące, aktywne wizyty.");
      return;
    }

    setChangingAppt(appt);
    setShowModal(true);
    setSelectedSlot(null);
    setSelectedDate(new Date());
    setMonthDate(new Date());
    await loadMonthDays(appt, new Date());
  };

  const saveChange = async () => {
  if (!selectedSlot) return alert("Wybierz termin!");

  try {
    const token = await firebaseUser.getIdToken();

    // 🔸 Pobierz ID dodatków przypisanych do wizyty
    const addonIds = (changingAppt.addons || [])
      .map((ad) => ad.addon_id ?? ad.id ?? ad.addon?.id)
      .filter(Boolean);

    // 🔸 Przygotuj payload z pełnym zestawem danych
    const payload = {
      date: formatIsoDate(selectedDate),
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
    };

    // jeśli są dodatki – dodaj je do żądania
    if (addonIds.length > 0) {
      payload.addons = addonIds;
    }

    // 🔸 Wyślij zmieniony termin + dodatki
    await axios.put(
      `${backendBase}/api/appointments/${changingAppt.id}`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 🔸 Odśwież listę wizyt
    setShowModal(false);
    setChangingAppt(null);
    await loadAppointments();
    alert("✅ Termin został zmieniony razem z dodatkami!");
  } catch (err) {
    console.error("❌ Błąd przy zapisie zmiany:", err);
    alert(err.response?.data?.error || "❌ Błąd przy zmianie terminu");
  }
};


  /* ---------- lists: upcoming / past / cancelled ---------- */
 /* ---------- lists: upcoming / past / cancelled ---------- */
const now = new Date();

// 🕐 Pomocnicza funkcja — łączy datę ISO + godzinę
const toDateTime = (dateISO, timeStr) => {
  if (!dateISO || !timeStr) return null;
  const d = new Date(dateISO);
  if (isNaN(d)) return null;
  const [hh, mm, ss] = (timeStr || "00:00:00").split(":").map(Number);
  d.setHours(hh || 0);
  d.setMinutes(mm || 0);
  d.setSeconds(ss || 0);
  return d;
};

// 🔹 Nadchodzące wizyty — najbliższa pierwsza
const upcoming = appointments
  .filter((a) => {
    if (a.status !== "booked") return false;
    const start = toDateTime(a.date, a.start_time);
    return start && start >= now;
  })
  .sort((a, b) => {
    const aStart = toDateTime(a.date, a.start_time);
    const bStart = toDateTime(b.date, b.start_time);
    return aStart - bStart; // rosnąco → najbliższa pierwsza
  });

// 🔹 Zakończone — najnowsze pierwsze
const finished = appointments
  .filter((a) => {
    const end = toDateTime(a.date, a.end_time);
    return (
      a.status === "finished" ||
      (end && end < now)
    );
  })
  .sort((a, b) => {
    const aEnd = toDateTime(a.date, a.end_time);
    const bEnd = toDateTime(b.date, b.end_time);
    return bEnd - aEnd; // malejąco → najnowsza pierwsza
  });

// 🔹 Anulowane — też najnowsze pierwsze
const cancelled = appointments
  .filter((a) => a.status === "cancelled")
  .sort((a, b) => {
    const aStart = toDateTime(a.date, a.start_time);
    const bStart = toDateTime(b.date, b.start_time);
    return bStart - aStart;
  });


  /* ---------- render ---------- */
  

  return (
    <div className={`min-h-screen px-5 py-6 ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <div className="flex items-center mb-6">
        <button onClick={() => navigate("/salons")} className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-black"}`}>
          <ArrowLeft size={20} /> Wróć do salonów
        </button>
      </div>

      <h1 className="text-2xl font-semibold mb-6">Moje wizyty</h1>

     {/* UPCOMING */}
<section className="mb-8">
  <h2 className="text-lg font-semibold mb-3 text-[#E57B2C]">
    Nadchodzące wizyty
  </h2>

  {upcoming.length === 0 ? (
    <p className="text-gray-400">Brak zaplanowanych wizyt.</p>
  ) : (
    <div className="space-y-4">
      {upcoming.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl p-4 shadow-sm border transition-all ${
            isDark
              ? "bg-gray-800 border-gray-700 hover:border-gray-600"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          {/* GÓRNA CZĘŚĆ */}
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-base font-medium">
                {a.service_name}
                {a.addons?.length > 0 && (
                  <span className="text-sm font-normal text-gray-400">
                    {" "}
                    + {a.addons.map((ad) => ad.addon_name).join(", ")}
                  </span>
                )}
              </h3>
              <p className="text-sm mt-1 text-gray-400">{a.employee_name}</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-600">
                Oczekująca
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => openChangeModal(a)}
                  className="text-xs px-3 py-1.5 rounded-md bg-[#E57B2C] text-white"
                >
                  Zmień termin
                </button>
                <button
                  onClick={() => handleCancel(a)}
                  className="text-xs px-3 py-1.5 rounded-md border bg-transparent"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>

          {/* SZCZEGÓŁY */}
          <div
            className={`text-sm ${
              isDark ? "text-gray-400" : "text-gray-600"
            } space-y-1`}
          >
            <div className="flex items-center gap-2">
              <Calendar size={14} /> {formatDate(a.date)}
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} /> {formatTime(a.start_time)} –{" "}
              {formatTime(a.end_time)}
            </div>

            {/* DODATKI */}
            {a.addons?.length > 0 && (
              <div className="mt-1 text-xs text-gray-400">
                Dodatki:{" "}
                <span className="text-gray-500">
                  {a.addons.map((ad) => ad.addon_name).join(", ")}
                </span>
              </div>
            )}

            {/* ZMIANA TERMINU */}
            {a.changed_at && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-[#E57B2C] font-medium">
                  🔸 Nowy termin: {formatDate(a.date)} {formatTime(a.start_time)} –{" "}
                  {formatTime(a.end_time)}
                </div>
                <div className="text-xs text-gray-500 italic">
                  (Zmieniono z{" "}
                  {a.previous_date
                    ? `${formatDate(a.previous_date)} ${
                        a.previous_start_time?.slice(0, 5) || ""
                      }`
                    : "—"}{" "}
                  na {formatDate(a.date)} {a.start_time?.slice(0, 5)}{" "}
                  {`(${formatDateTime(a.changed_at)})`})
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</section>

{/* HISTORY — zakończone + anulowane */}
<section className="mb-8">
  <h2 className="text-lg font-semibold mb-3">
    Zakończone lub anulowane wizyty
  </h2>

  {appointments.filter(a => ["completed", "cancelled"].includes(a.status)).length === 0 ? (
    <p className="text-gray-400">Brak zakończonych lub anulowanych wizyt.</p>
  ) : (
    <div className="space-y-4">
      {appointments
        .filter(a => ["completed", "cancelled"].includes(a.status))
        .sort((a, b) => {
          const dateA = new Date(`${a.date}T${a.start_time}`);
          const dateB = new Date(`${b.date}T${b.start_time}`);
          return dateB - dateA; // najnowsze najpierw
        })
        .map(a => (
          <div
            key={a.id}
            className={`rounded-xl p-4 shadow-sm border transition-all ${
              isDark
                ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            {/* Górna część */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-base font-medium">
                  {a.service_name}
                  {a.addons?.length > 0 && (
                    <span className="text-sm font-normal text-gray-400">
                      {" "}+ {a.addons.map(ad => ad.addon_name).join(", ")}
                    </span>
                  )}
                </h3>
                <p className="text-sm mt-1 text-gray-400">{a.employee_name}</p>
              </div>

              {/* Chip statusu */}
              {a.status === "completed" ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/15 border border-gray-500/40 text-gray-400">
                  Zakończona
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-600/10 border border-red-200 text-red-600">
                  Anulowana
                </span>
              )}
            </div>

            {/* Szczegóły */}
            <div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} space-y-1`}>
              <div className="flex items-center gap-2">
                <Calendar size={14} /> {formatDate(a.date)}
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} /> {formatTime(a.start_time)} – {formatTime(a.end_time)}
              </div>

              {a.addons?.length > 0 && (
                <div className="mt-1 text-xs text-gray-400">
                  Dodatki:{" "}
                  <span className="text-gray-500">
                    {a.addons.map(ad => ad.addon_name).join(", ")}
                  </span>
                </div>
              )}

              {a.changed_at && (
                <div className="mt-1 text-xs text-gray-500 italic">
                  Ostatnia zmiana: {formatDateTime(a.changed_at)}
                </div>
              )}
            </div>

            {/* Umów ponownie */}
            <div className="mt-3 text-right">
              <button
                onClick={() => {
                  const addonIds = (a.addons || [])
                    .map(ad => ad.addon_id ?? ad.id ?? ad.addon?.id)
                    .filter(Boolean);
                  const payload = {
                    fromRebook: true,
                    service_id: a.service_id,
                    addon_ids: addonIds,
                    employee_id: a.employee_id,
                  };
                  localStorage.setItem("selectedService", JSON.stringify(payload));
                  localStorage.setItem("lockEmployeeSelection", "true");
                  const salonInfo = {
                    id: a.salon_id,
                    name: a.salon_name,
                    city: a.salon_city,
                    street: a.salon_street,
                    street_number: a.salon_street_number,
                    image_url: a.salon_image_url || a.image_url || null,
                  };
                  localStorage.setItem("selectedSalon", JSON.stringify(salonInfo));
                  navigate("/booking");
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  isDark
                    ? "bg-[#E57B2C]/20 text-[#E57B2C]"
                    : "bg-[#E57B2C]/10 text-[#E57B2C]"
                }`}
              >
                <RotateCcw size={14} /> Umów ponownie
              </button>
            </div>
          </div>
        ))}
    </div>
  )}
</section>


      {/* ---------- Modal (Reschedule) ---------- */}
      <AnimatePresence>
        {showModal && changingAppt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25 }} className={`relative w-full max-w-[480px] rounded-2xl shadow-xl p-6 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"} z-10`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Zmień termin</h3>
                <button onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>

              <p className="text-sm mb-4 text-gray-400 leading-snug">
  Wybierz nowy termin dla usługi{" "}
  <strong className="text-gray-200">
    {changingAppt.service_name}
  </strong>
  {changingAppt.addons?.length > 0 && (
    <>
      {" "}z dodatkami:{" "}
      <strong className="text-[#E57B2C]">
        {changingAppt.addons.map((a) => a.addon_name).join(", ")}
      </strong>
    </>
  )}
  .
</p>


              <CalendarGrid monthDate={monthDate} availableDays={availableDays} selectedDate={selectedDate} onSelectDate={handleSelectDate} onMonthChange={handleMonthChange} loadingDays={loadingDays} isDark={isDark} />

              <SlotsList slots={slots} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} loadingSlots={loadingSlots} isDark={isDark} />

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowModal(false)} className={`px-4 py-2 rounded-md text-sm border ${isDark ? "border-gray-600" : "border-gray-300"}`}>Anuluj</button>
                <button onClick={saveChange} disabled={!selectedSlot} className={`px-4 py-2 rounded-md text-sm font-medium transition ${selectedSlot ? "bg-[#E57B2C] text-white hover:bg-[#d36b1f]" : "opacity-50 cursor-not-allowed bg-[#E57B2C] text-white"}`}>Zapisz zmianę</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
