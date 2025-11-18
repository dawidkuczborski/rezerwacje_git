import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { MultiBackend, TouchTransition, MouseTransition } from "dnd-multi-backend";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import axios from "axios";
import io from "socket.io-client";

import AppointmentModal from "../../components/AppointmentModal";
import TimeOffModal from "../../components/TimeOffModal";
import { useAuth } from "../../components/AuthProvider";

const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5000");

const weekDays = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];

const HOUR_HEIGHT = 100;
const defaultDayStart = 6 * 60;
const defaultDayEnd = 23 * 60;

const ItemTypes = { APPOINTMENT: "appointment" };

const HTML5toTouch = {
  backends: [
    { id: "html5", backend: HTML5Backend, transition: MouseTransition },
    {
      id: "touch",
      backend: TouchBackend,
      options: { enableMouseEvents: true, delayTouchStart: 0 },
      transition: TouchTransition,
    },
  ],
};

const pad2 = (n) => String(n).padStart(2, "0");

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
};

const minutesToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(Math.floor(m % 60))}`;

const formatHHMM = (str) => (str ? str.slice(0, 5) : "");

function formatDateLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function stringToPastelColor(str) {
  if (!str) return "#FFEBD6";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  const s = 70 + (Math.abs(hash) % 10);
  const l = 85 + (Math.abs(hash) % 5);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function DraggableEvent({ appointment, children }) {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ItemTypes.APPOINTMENT,
    item: appointment,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }));

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, []);

  return (
    <div
      ref={drag}
      style={{
        cursor: "grab",
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 999 : 5,
        transform: isDragging ? "scale(1.02)" : "none",
      }}
    >
      {children}
    </div>
  );
}

function DroppableTimeGrid({
  employee,
  onDrop,
  currentDate,
  dayStartMin,
  dayEndMin,
  HOUR_HEIGHT,
  children,
}) {
  const containerRef = useRef(null);
  const [dragLinePos, setDragLinePos] = useState(null);
  const [dragTime, setDragTime] = useState(null);
  const [shadowEvent, setShadowEvent] = useState(null);

  const getMinutesFromPageY = (pageY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return dayStartMin;
    const offsetY = pageY - (rect.top + window.scrollY);
    return dayStartMin + (offsetY / HOUR_HEIGHT) * 60;
  };

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: ItemTypes.APPOINTMENT,
      canDrop: () => !employee.day_off,
      hover: (item, monitor) => {
        if (!monitor.canDrop()) return;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;

        const pageY = clientOffset.y + window.scrollY;
        const minutes = getMinutesFromPageY(pageY);
        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);

        const boundedStart = Math.max(dayStartMin, Math.min(minutes, dayEndMin - duration));
        const boundedEnd = boundedStart + duration;

        const topPx = ((boundedStart - dayStartMin) / 60) * HOUR_HEIGHT;
        const heightPx = ((boundedEnd - boundedStart) / 60) * HOUR_HEIGHT;

        setDragLinePos(topPx);
        setDragTime(minutesToHHMM(Math.round(boundedStart)));

        setShadowEvent({
          ...item,
          start_time: minutesToHHMM(boundedStart),
          end_time: minutesToHHMM(boundedEnd),
          top: topPx,
          height: heightPx,
        });
      },

      drop: (item, monitor) => {
        if (!monitor.canDrop()) return;

        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;

        const pageY = clientOffset.y + window.scrollY;
        const minutes = getMinutesFromPageY(pageY);

        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);
        const start = minutes;
        const end = start + duration;

        onDrop({
          ...item,
          toEmployeeId: employee.employee_id,
          start_time: minutesToHHMM(start),
          end_time: minutesToHHMM(end),
          date: formatDateLocal(currentDate),
        });
      },

      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [employee, dayStartMin, dayEndMin, HOUR_HEIGHT]
  );

  const setRefs = (el) => {
    containerRef.current = el;
    drop(el);
  };

  useEffect(() => {
    if (!isOver) {
      setDragLinePos(null);
      setDragTime(null);
      setShadowEvent(null);
    }
  }, [isOver]);

  return (
    <div ref={setRefs} style={{ position: "relative" }}>
      
      {children}

      {dragLinePos !== null && (
        <div
          style={{
            position: "absolute",
            top: dragLinePos,
            left: 0,
            right: 0,
            borderTop: "2px dashed #E55B10",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 6,
              top: -18,
              background: "#E55B10",
              color: "white",
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            {dragTime}
          </div>
        </div>
      )}

      {shadowEvent && (
        <div
          className="event-card"
          style={{
            position: "absolute",
            top: shadowEvent.top,
            left: 4,
            right: 4,
            height: shadowEvent.height,
            opacity: 0.6,
            background: stringToPastelColor(shadowEvent.service_name),
            borderRadius: 10,
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {shadowEvent.start_time} - {shadowEvent.end_time}
          </div>
        </div>
      )}
    </div>
  );
}
export default function EmployeeCalendarMonthView() {
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;

  const [payload, setPayload] = useState({ employees: [] });

  const initial = new Date();
  initial.setHours(0, 0, 0, 0);

  const [activeDay, setActiveDay] = useState(initial);
  const activeDayRef = useRef(activeDay);

  useEffect(() => {
    activeDayRef.current = activeDay;
  }, [activeDay]);

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedTimeOff, setSelectedTimeOff] = useState(null);
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);

  const [conflictModal, setConflictModal] = useState({
    visible: false,
    retryAction: null,
  });

  const monthScrollRef = useRef(null);
  const dayStripRef = useRef(null);

  axios.defaults.headers.get["Cache-Control"] =
    "no-store, no-cache, must-revalidate, proxy-revalidate";
  axios.defaults.headers.get["Pragma"] = "no-cache";
  axios.defaults.headers.get["Expires"] = 0;

  const axiosNoCache = async (url, options = {}) => {
    const timestamp = Date.now();
    const merged = {
      ...options,
      params: { ...(options.params || {}), _t: timestamp },
    };
    return axios.get(url, merged);
  };

  // ░░ GENERUJEMY DNI MIESIĄCA ░░
  const daysInMonthArray = useMemo(() => {
    const year = activeDay.getFullYear();
    const month = activeDay.getMonth();
    const last = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: last }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return {
        date: d,
        dateStr: formatDateLocal(d),
        day: d.getDate(),
        weekday: weekDays[(d.getDay() + 6) % 7],
      };
    });
  }, [activeDay]);

  // ░░ WYZNACZAMY GODZINY PRACY DLA PEŁNEGO MIESIĄCA ░░
  const calendarRange = useMemo(() => {
    if (!payload.employees.length)
      return {
        dayStartMin: defaultDayStart,
        dayEndMin: defaultDayEnd,
        HOUR_HEIGHT,
      };

    const emp = payload.employees[0];
    if (!emp || !emp.working_hours)
      return {
        dayStartMin: defaultDayStart,
        dayEndMin: defaultDayEnd,
        HOUR_HEIGHT,
      };

    const start = timeToMinutes(formatHHMM(emp.working_hours.open));
    const end = timeToMinutes(formatHHMM(emp.working_hours.close));

    return {
      dayStartMin: Math.min(start, defaultDayStart),
      dayEndMin: Math.max(end, defaultDayEnd),
      HOUR_HEIGHT,
    };
  }, [payload.employees]);

  // ░░ POBIERANIE KALENDARZA MIESIĄCA ░░
  useEffect(() => {
    const fetchMonth = async () => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;

        const year = activeDay.getFullYear();
        const month = activeDay.getMonth();

        const start = `${year}-${pad2(month + 1)}-01`;
        const end = `${year}-${pad2(month + 1)}-${pad2(
          new Date(year, month + 1, 0).getDate()
        )}`;

        const res = await axios.get(`${backendBase}/api/calendar/shared/month`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { start, end },
        });

        const normalized = {
          employees: res.data.employees.map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
            appointments: e.appointments || [],
            time_off: e.time_off || [],
          })),
        };

        setPayload(normalized);
      } catch (err) {
        console.error("❌ fetch month error:", err);
      }
    };

    fetchMonth();
  }, [firebaseUser, activeDay, backendBase]);

  // ░░ SOCKET AUTO-REFRESH ░░
  useEffect(() => {
    socket.off("calendar_updated");

    socket.on("calendar_updated", async () => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;

        const year = activeDayRef.current.getFullYear();
        const month = activeDayRef.current.getMonth();
        const start = `${year}-${pad2(month + 1)}-01`;
        const end = `${year}-${pad2(month + 1)}-${pad2(
          new Date(year, month + 1, 0).getDate()
        )}`;

        const res = await axios.get(`${backendBase}/api/calendar/shared/month`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { start, end },
        });

        const normalized = {
          employees: res.data.employees.map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
            appointments: e.appointments || [],
            time_off: e.time_off || [],
          })),
        };

        setPayload(normalized);
      } catch (err) {
        console.error("❌ socket refresh error:", err);
      }
    });

    return () => socket.off("calendar_updated");
  }, [firebaseUser, backendBase]);

  // ░░ SCROLLUJEMY DO AKTYWNEGO DNIA ░░
  useEffect(() => {
    if (!monthScrollRef.current) return;

    const container = monthScrollRef.current;
    const el = container.querySelector(
      `[data-date="${formatDateLocal(activeDay)}"]`
    );

    if (el) {
      container.scrollTo({
        left: el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeDay]);

  // ░░ OBSŁUGA DROP ░░
  const handleDrop = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time, date }) => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();

        await axios.put(
          `${backendBase}/api/calendar/shared/${id}`,
          { employee_id: toEmployeeId, date, start_time, end_time },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setPayload((prev) => {
          const employees = [...prev.employees];
          const emp = employees[0];
          const appts = [...emp.appointments];

          const idx = appts.findIndex((a) => a.id === id);
          if (idx !== -1) {
            appts[idx] = {
              ...appts[idx],
              employee_id: toEmployeeId,
              start_time,
              end_time,
              date,
            };
          }

          emp.appointments = appts;
          return { employees };
        });
      } catch (err) {
        console.error("❌ drop error:", err);
      }
    },
    [firebaseUser, backendBase]
  );

  // ░░ OBSŁUGA ODŚWIEŻENIA PO MODALU ░░
  const handleModalUpdated = async () => {
    try {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken?.();

      const year = activeDay.getFullYear();
      const month = activeDay.getMonth();
      const start = `${year}-${pad2(month + 1)}-01`;
      const end = `${year}-${pad2(month + 1)}-${pad2(
        new Date(year, month + 1, 0).getDate()
      )}`;

      const res = await axiosNoCache(
        `${backendBase}/api/calendar/shared/month`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { start, end },
        }
      );

      const normalized = {
        employees: res.data.employees.map((e) => ({
          ...e,
          day_off: Boolean(e.day_off || e.is_day_off),
          appointments: e.appointments || [],
          time_off: e.time_off || [],
        })),
      };

      setPayload(normalized);
    } catch (err) {
      console.error("❌ refresh error:", err);
    }
  };

  // ░░ START RENDEROWANIA ░░
  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="calendar-root p-4 min-h-screen relative">
        <style>{`
          .day-pill { 
            min-width:44px; 
            display:flex; 
            flex-direction:column; 
            align-items:center; 
            padding:8px 8px; 
            border-radius:10px; 
            cursor:pointer;
          }
          .day-pill.active { 
            background:#FFEBD6; 
            color:#E55B10; 
            font-weight:700; 
            box-shadow:0 4px 14px rgba(14, 20, 30, 0.06);
          }
        `}</style>

        {/* ░░ NAGŁÓWEK – ZMIANA MIESIĘCY ░░ */}
        <div className="cal-header mb-3 sticky top-0 bg-[#F9FAFB] pb-2 z-40">
          <div className="header-top flex items-center justify-center gap-4">
            <button
              onClick={() =>
                setActiveDay((prev) => {
                  const nd = new Date(prev);
                  nd.setMonth(prev.getMonth() - 1);
                  nd.setDate(1);
                  return nd;
                })
              }
              className="p-2 bg-white/60 hover:bg-white rounded-xl"
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {activeDay.toLocaleDateString("pl-PL", {
                month: "long",
                year: "numeric",
              })}
            </div>

            <button
              onClick={() =>
                setActiveDay((prev) => {
                  const nd = new Date(prev);
                  nd.setMonth(prev.getMonth() + 1);
                  nd.setDate(1);
                  return nd;
                })
              }
              className="p-2 bg-white/60 hover:bg-white rounded-xl"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* ░░ PASEK DNI ░░ */}
          <div
            ref={dayStripRef}
            className="day-strip flex overflow-x-auto gap-2 mt-3 pb-1 scrollbar-thin scrollbar-thumb-gray-300"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {daysInMonthArray.map((d) => {
              const isActive =
                d.date.toDateString() === activeDay.toDateString();

              return (
                <div
                  key={d.dateStr}
                  className={`day-pill ${isActive ? "active" : ""}`}
                  onClick={() => setActiveDay(d.date)}
                  style={{ scrollSnapAlign: "center" }}
                >
                  <div style={{ fontSize: 12 }}>{d.weekday}</div>
                  <div style={{ fontWeight: 700 }}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ░░ GŁÓWNA CZĘŚĆ — WSZYSTKIE DNI MIESIĄCA ░░ */}
        <div
          ref={monthScrollRef}
          className="columns-wrap flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 px-2"
          style={{ paddingTop: 10, paddingBottom: 30, scrollSnapType: "x mandatory" }}
        >
          {daysInMonthArray.map((dayObj) => {
            const emp = payload.employees[0];
            if (!emp) return null;

            const dayAppointments = emp.appointments.filter(
              (a) => a.date === dayObj.dateStr
            );

            const timeOff = emp.time_off.filter(
              (off) => off.date === dayObj.dateStr
            );

            const isDayOff = Boolean(emp.day_off);

            return (
              <div
                key={dayObj.dateStr}
                data-date={dayObj.dateStr}
                style={{
                  width: 260,
                  flex: "0 0 260px",
                  scrollSnapAlign: "center",
                  background: "#fff",
                  borderRadius: 14,
                  paddingBottom: 10,
                  boxShadow:
                    "0 2px 6px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Nagłówek dnia */}
                <div
                  style={{
                    textAlign: "center",
                    paddingTop: 10,
                    paddingBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {dayObj.weekday}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {dayObj.day}
                  </div>
                </div>

                {/* Time Grid */}
                <DroppableTimeGrid
                  employee={emp}
                  onDrop={handleDrop}
                  currentDate={dayObj.date}
                  dayStartMin={calendarRange.dayStartMin}
                  dayEndMin={calendarRange.dayEndMin}
                  HOUR_HEIGHT={HOUR_HEIGHT}
                >
                  <div
                    className="time-grid"
                    style={{
                      position: "relative",
                      height:
                        ((calendarRange.dayEndMin -
                          calendarRange.dayStartMin) /
                          60) *
                        HOUR_HEIGHT,
                      padding: "0 6px",
                      background: "transparent",
                    }}
                  >
                    {/* Dzień wolny */}
                    {isDayOff && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 12,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          background: "rgba(0,0,0,0.04)",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#4B5563",
                        }}
                      >
                        💤 Dzień wolny
                      </div>
                    )}

                    {/* Time Off */}
                    {!isDayOff &&
                      timeOff.map((off, i) => {
                        const start = timeToMinutes(off.start_time);
                        const end = timeToMinutes(off.end_time);

                        const top =
                          ((start - calendarRange.dayStartMin) / 60) *
                          HOUR_HEIGHT;

                        const height =
                          ((end - start) / 60) * HOUR_HEIGHT;

                        const now = new Date();
                        const endDT = new Date(
                          `${off.date}T${off.end_time}:00`
                        );
                        const isExpired = endDT < now;

                        return (
                          <div
                            key={off.id ?? i}
                            className={`timeoff-block ${
                              isExpired ? "expired" : ""
                            }`}
                            onClick={() => {
                              setSelectedTimeOff(off);
                              setTimeOffModalOpen(true);
                            }}
                            style={{
                              position: "absolute",
                              top,
                              left: 4,
                              right: 4,
                              height,
                              borderRadius: 12,
                              padding: "6px 8px",
                              background: isExpired
                                ? "rgba(200,200,200,0.18)"
                                : "rgba(255,100,100,0.18)",
                              border: isExpired
                                ? "1px dashed rgba(100,100,100,0.3)"
                                : "1px dashed rgba(200,50,50,0.5)",
                              color: isExpired
                                ? "#555"
                                : "#b91c1c",
                              fontSize: 12,
                              fontWeight: 600,
                              zIndex: 5,
                              cursor: "pointer",
                            }}
                          >
                            🔒 {off.start_time} – {off.end_time}
                            <div
                              style={{
                                fontSize: 11,
                                opacity: 0.8,
                                marginTop: 2,
                              }}
                            >
                              {off.reason || "Blokada"}
                            </div>
                          </div>
                        );
                      })}

                    {/* APPOINTMENTS */}
                    {!isDayOff &&
                      dayAppointments.map((a, i) => {
                        const start = timeToMinutes(a.start_time);
                        const end = timeToMinutes(a.end_time);

                        const top =
                          ((start - calendarRange.dayStartMin) / 60) *
                          HOUR_HEIGHT;
                        const height =
                          ((end - start) / 60) * HOUR_HEIGHT;

                        return (
                          <DraggableEvent
                            key={a.id}
                            appointment={a}
                          >
                            <div
                              className="event-card"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppointment(a);
                                setModalOpen(true);
                              }}
                              style={{
                                position: "absolute",
                                top,
                                left: 4,
                                right: 4,
                                height,
                                background: stringToPastelColor(
                                  a.service_name
                                ),
                                borderRadius: 10,
                                padding: "4px 6px",
                                fontSize: 12,
                                zIndex: 10,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  lineHeight: 1,
                                }}
                              >
                                {a.start_time} – {a.end_time}
                              </div>
                              <div>{a.client_name}</div>
                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.8,
                                }}
                              >
                                {a.service_name}
                              </div>
                            </div>
                          </DraggableEvent>
                        );
                      })}
                  </div>
                </DroppableTimeGrid>
              </div>
            );
          })}
        </div>

        {/* FAB – Dodawanie wizyty */}
        <div
          className="floating-add"
          onClick={() => alert("Dodawanie wizyty…")}
          style={{
            position: "fixed",
            right: 20,
            bottom: 90,
            zIndex: 60,
            width: 56,
            height: 56,
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(180deg,#fb923c,#ef4444)",
            color: "white",
            boxShadow:
              "0 10px 30px rgba(15,23,42,0.16)",
            cursor: "pointer",
          }}
        >
          <Plus size={28} color="white" />
        </div>
        {/* ░░ MODAL KOLIZJI ░░ */}
        {conflictModal.visible && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: 24,
                width: 320,
                textAlign: "center",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h3 style={{ fontWeight: 700, marginBottom: 10 }}>
                ⚠️ Kolizja wizyt
              </h3>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Ta wizyta nakłada się z inną wizytą tego pracownika.
              </p>
              <p style={{ fontSize: 13, color: "#555" }}>
                Czy chcesz mimo to zapisać zmianę?
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 12,
                  marginTop: 20,
                }}
              >
                <button
                  onClick={() =>
                    setConflictModal({
                      visible: false,
                      retryAction: null,
                    })
                  }
                  style={{
                    background: "#e5e7eb",
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  Anuluj
                </button>

                <button
                  onClick={() => conflictModal.retryAction?.()}
                  style={{
                    background: "#ef4444",
                    color: "white",
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  Zapisz mimo kolizji
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ░░ TIME OFF MODAL ░░ */}
        {timeOffModalOpen && selectedTimeOff && (
          <TimeOffModal
            open={timeOffModalOpen}
            onClose={() => setTimeOffModalOpen(false)}
            timeOff={selectedTimeOff}
            onUpdated={async () => {
              setTimeOffModalOpen(false);
              await handleModalUpdated(); // odśwież dane
            }}
          />
        )}

        {/* ░░ APPOINTMENT MODAL ░░ */}
        {modalOpen && selectedAppointment && (
          <AppointmentModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            appointmentId={selectedAppointment.id}
            onUpdated={async () => {
              setModalOpen(false);
              await handleModalUpdated();
            }}
            socket={socket}
          />
        )}
      </div>
    </DndProvider>
  );
}
