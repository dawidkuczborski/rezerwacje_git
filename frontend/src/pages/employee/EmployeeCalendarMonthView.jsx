import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { MultiBackend, TouchTransition, MouseTransition } from "dnd-multi-backend";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import axios from "axios";
import { useAuth } from "../../components/AuthProvider";

import AppointmentModal from "../../components/AppointmentModal";
import TimeOffModal from "../../components/TimeOffModal";

import io from "socket.io-client";

const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5000", {
  transports: ["websocket"],
  withCredentials: true,
});


const defaultDayStart = 6 * 60;
const defaultDayEnd = 23 * 60;
const HOUR_HEIGHT = 100;
const weekDays = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];
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

const styles = `
  .calendar-root { font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; user-select:none; background: #F9FAFB; }
  .cal-header { }
  .top-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; }
  .avatar-lg { width:36px; height:36px; border-radius:999px; object-fit:cover; box-shadow:0 1px 3px rgba(2,6,23,0.06); }
  .month-title { font-size:16px; font-weight:700; }

  /* container with single vertical scroll */
  .vertical-scroll {
    height: calc(100vh - 120px); /* header + paddings assumed ~120px; dopasuj jeśli potrzebne */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .calendar-body {
    display:flex;
    gap:10px;
    padding:10px 4px;
    overflow: hidden; /* horizontal handled separately */
    box-sizing: border-box;
    padding-bottom: 25px;
  }

  .times-column {
    width:56px;
    flex:0 0 56px;
    color:#6B7280;
    font-weight:600;
    font-size:12px;
    position: -webkit-sticky;
    position: sticky;
    left: 0;
    top: 72px; /* adjust if header height differs */
    background: linear-gradient(90deg, rgba(249,250,251,0.95), rgba(249,250,251,0.8));
    z-index: 50;
    align-self: flex-start;
    padding-top: 8px;
  }
  .times-column-inner { padding:0 4px; box-sizing:border-box; }

  .columns-wrap { display:flex; gap:0; overflow-x:auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-left:8px; padding-right:8px; }
  .day-col { background:transparent; border-radius:12px; position:relative; scroll-snap-align:center; min-width:50%; box-sizing:border-box; display:flex; flex-direction:column; overflow:visible; padding: 0 6px; }
  .day-header { display:flex; gap:8px; align-items:center; padding:8px 6px; border-bottom:1px solid rgba(0,0,0,0.04); justify-content:space-between; flex-shrink:0; background:transparent; }
  .work-hours { font-size:11px; color:#6B7280; }

  /* IMPORTANT: time-grid nie przewija - wszystko przewija .vertical-scroll */
  .time-grid { position:relative; padding:0px 6px; background:transparent; overflow: visible; }

  .event-card {
    position: absolute;
    border-radius: 10px;
    padding: 4px 6px;
    box-shadow: 0 4px 12px rgba(12, 18, 26, 0.06);
    font-weight: 500;
    font-size: 12px;
    color: #111827;
    max-width: 160px;
    word-wrap: break-word;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }
  .event-card:hover { transform: scale(1.03); box-shadow: 0 6px 18px rgba(0,0,0,0.15); z-index:50; }
  .event-card-content { overflow-y:auto; max-height:100%; scrollbar-width:none; }
  .event-card-content::-webkit-scrollbar { display:none; }

  .floating-add { position:fixed; right:20px; bottom:90px; z-index:60; width:56px; height:56px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:linear-gradient(180deg,#fb923c,#ef4444); color:white; box-shadow:0 10px 30px rgba(15,23,42,0.16); }
  .drag-line { position:absolute; left:0; right:0; height:0; border-top:2px dashed rgba(229,91,16,0.7); pointer-events:none; opacity:0; transform:scaleY(0.95); transition:opacity 0.2s ease, transform 0.2s ease; }
  .drag-line.visible { opacity:1; transform:scaleY(1); }

  .timeoff-block { border-radius:14px; padding:10px 12px; background:rgba(255,99,99,0.14); border:1px dashed rgba(220,38,38,0.4); box-shadow:0 2px 8px rgba(0,0,0,0.05); display:flex; flex-direction:column; gap:6px; font-size:13px; color:#991B1B; }
  .timeoff-block.expired { background: rgba(200,200,200,0.18); border-color: rgba(120,120,120,0.4); color: #6B7280; opacity:0.7; }
  .offhours-block { background: rgba(180,200,255,0.18); border:1px dashed rgba(120,150,220,0.45); border-radius:14px; padding:8px 10px; font-size:12px; color:#1e3a8a; display:flex; align-items:center; z-index:1; }
  .dayoff-block { background: rgba(0,0,0,0.06); border:1px dashed rgba(0,0,0,0.15); border-radius:14px; display:flex; align-items:center; justify-content:center; padding:16px; text-align:center; font-size:13px; font-weight:600; color:#6B7280; letter-spacing:0.2px; backdrop-filter: blur(2px); z-index:3; user-select:none; pointer-events:none; }

  /* hide scrollbars */
  .columns-wrap::-webkit-scrollbar, .times-column-inner::-webkit-scrollbar { display: none; }
  .columns-wrap, .times-column-inner { scrollbar-width: none; }
`;

/* ---------- utils ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
};
const minutesToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(Math.floor(m % 60))}`;
const formatHHMM = (timeStr) => (timeStr ? timeStr.split(":").slice(0, 2).join(":") : "");
const formatTime = (t) => (t ? t.substring(0, 5) : "");
function formatDateLocal(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseYYYYMMDDToDate(dateStr) {
  if (!dateStr) return new Date();
  const parts = dateStr.split("-");
  if (parts.length < 3) return new Date(dateStr);
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return new Date(y, m, d);
}
function makeLocalDateTime(dateStr, timeStr) {
  const date = parseYYYYMMDDToDate(dateStr);
  if (!timeStr) return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const [h = "0", min = "0", s = "0"] = timeStr.split(":");
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(h), Number(min), Number(s || 0));
}
function fixDateLocal(isoStr) {
  if (!isoStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  return formatDateLocal(d);
}
function stringToPastelColor(str) {
  if (!str) return "#FFF1E6";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 70 + (Math.abs(hash) % 10);
  const l = 85 + (Math.abs(hash) % 5);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
function isDayOffFlag(raw) {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === "object") {
    const v = raw.is_day_off ?? raw.day_off;
    return isDayOffFlag(v);
  }
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    return v === "1" || v === "true" || v === "tak" || v === "yes";
  }
  return false;
}

/* ---------- DraggableEvent (hold-to-drag + vibrate) ---------- */
function DraggableEvent({ appointment, children }) {
  const [dragEnabled, setDragEnabled] = useState(false);
  const holdTimeout = useRef(null);

  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: ItemTypes.APPOINTMENT,
      item: appointment,
      canDrag: () => dragEnabled,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [dragEnabled, appointment]
  );

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const handlePointerDown = (e) => {
    if (navigator?.vibrate) navigator.vibrate(10);
    // aktywuj drag po krótkim przytrzymaniu
    holdTimeout.current = setTimeout(() => {
      setDragEnabled(true);
    }, 180);
  };
  const cancelHold = () => {
    clearTimeout(holdTimeout.current);
    setDragEnabled(false);
  };
  const handlePointerMove = () => {
    // jeśli użytkownik przesuwa palcem, to anulujemy hold — to prawdopodobnie scroll
    clearTimeout(holdTimeout.current);
  };

  return (
    <div
      ref={drag}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerMove={handlePointerMove}
      style={{
        cursor: dragEnabled ? "grabbing" : "pointer",
        userSelect: "none",
        touchAction: "auto",
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 999 : 5,
        transform: isDragging ? "scale(1.02)" : "none",
        boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,0.25)" : "0 4px 12px rgba(12,18,26,0.06)",
      }}
    >
      {children}
    </div>
  );
}

/* ---------- DroppableTimeGrid — uses verticalScrollRef to calc minutes ---------- */
function DroppableTimeGrid({
  day,
  employee,
  onDrop,
  currentDate,
  dayStartMin,
  dayEndMin,
  HOUR_HEIGHT,
  children,
  verticalScrollRef,
}) {
  const containerRef = useRef(null); // this is the day .time-grid element
  const [dragLinePos, setDragLinePos] = useState(null);
  const [dragTime, setDragTime] = useState(null);
  const [shadowEvent, setShadowEvent] = useState(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const SNAP_THRESHOLD_MINUTES = 1;

  // convert clientY to minute index, accounting for verticalScrollRef scrollTop
  const getMinutesFromClientY = (clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return dayStartMin;
    const vs = verticalScrollRef?.current;
    const vsScrollTop = vs ? vs.scrollTop : 0;
    // offset within content: (clientY - rect.top) + vsScrollTop
    const offsetY = clientY - rect.top + vsScrollTop;
    const minutesFromTop = (offsetY / HOUR_HEIGHT) * 60;
    return dayStartMin + minutesFromTop;
  };

  const buildSnapPoints = (duration) => {
    const pts = [];
    pts.push(dayStartMin);
    pts.push(dayEndMin - duration);
    if (employee?.appointments && Array.isArray(employee.appointments)) {
      employee.appointments.forEach((a) => {
        const aStart = timeToMinutes(a.start_time);
        const aEnd = timeToMinutes(a.end_time);
        if (!Number.isNaN(aEnd)) pts.push(aEnd);
        if (!Number.isNaN(aStart)) pts.push(aStart);
      });
    }
    const uniq = Array.from(new Set(pts)).sort((x, y) => x - y);
    return uniq;
  };

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: ItemTypes.APPOINTMENT,
      canDrop: () => !employee?.day_off,
      hover: (item, monitor) => {
        if (!monitor.canDrop()) return;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const currentMinutesRaw = getMinutesFromClientY(clientOffset.y);
        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);
        let boundedStart = Math.max(dayStartMin, Math.min(currentMinutesRaw, dayEndMin - duration));
        const snapPts = buildSnapPoints(duration);
        let nearest = boundedStart;
        let nearestDist = Infinity;
        for (const p of snapPts) {
          const d = Math.abs(boundedStart - p);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
          }
        }
        if (nearestDist <= SNAP_THRESHOLD_MINUTES) {
          boundedStart = nearest;
          setIsSnapped(true);
        } else {
          setIsSnapped(false);
        }
        const boundedEnd = boundedStart + duration;
        const topPx = ((boundedStart - dayStartMin) / 60) * HOUR_HEIGHT;
        const heightPx = ((boundedEnd - boundedStart) / 60) * HOUR_HEIGHT;
        setDragLinePos(topPx);
        setDragTime(minutesToHHMM(Math.round(boundedStart)));
        setShadowEvent({
          ...item,
          start_time: minutesToHHMM(Math.round(boundedStart)),
          end_time: minutesToHHMM(Math.round(boundedEnd)),
          top: topPx,
          height: heightPx,
        });
      },
      drop: (item, monitor) => {
        if (!monitor.canDrop()) {
          alert("❌ Ten pracownik ma dziś dzień wolny!");
          return;
        }
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const currentMinutesRaw = getMinutesFromClientY(clientOffset.y);
        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);
        let boundedStart = Math.max(dayStartMin, Math.min(currentMinutesRaw, dayEndMin - duration));
        const snapPts = buildSnapPoints(duration);
        let nearest = boundedStart;
        let nearestDist = Infinity;
        for (const p of snapPts) {
          const d = Math.abs(boundedStart - p);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
          }
        }
        if (nearestDist <= SNAP_THRESHOLD_MINUTES) boundedStart = nearest;
        const dropStart = Math.round(boundedStart);
        const dropEnd = dropStart + duration;
        if (employee?.working_hours) {
          const { open, close } = employee.working_hours;
          const startMin = timeToMinutes(open);
          const endMin = timeToMinutes(close);
          if (dropStart < startMin || dropEnd > endMin) {
            alert(`⛔ Poza godzinami pracy (${open} - ${close})`);
            return;
          }
        }
        onDrop({
          id: item.id,
          fromEmployeeId: item.employee_id,
          toEmployeeId: employee.employee_id,
          start_time: minutesToHHMM(dropStart),
          end_time: minutesToHHMM(dropEnd),
          date: day,
        });
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [employee?.day_off, employee?.employee_id, employee?.appointments, dayStartMin, dayEndMin, HOUR_HEIGHT, verticalScrollRef]
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
      setIsSnapped(false);
    }
  }, [isOver]);

  return (
    <div ref={setRefs} style={{ position: "relative" }}>
      {!employee?.day_off && employee?.working_hours && (
        <>
          {timeToMinutes(formatHHMM(employee.working_hours.open)) > dayStartMin && (
            <div
              className="offhours-block"
              style={{
                position: "absolute",
                top: 0,
                left: "4px",
                right: "4px",
                height: `${((timeToMinutes(formatHHMM(employee.working_hours.open)) - dayStartMin) / 60) * HOUR_HEIGHT}px`,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                pointerEvents: "none",
                background: "rgba(0,0,0,0.05)",
                borderRadius: "10px",
                color: "#6B7280",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              Poza godzinami pracy
            </div>
          )}

          {timeToMinutes(formatHHMM(employee.working_hours.close)) < dayEndMin && (
            <div
              className="offhours-block"
              style={{
                position: "absolute",
                bottom: 0,
                left: "4px",
                right: "4px",
                height: `${((dayEndMin - timeToMinutes(formatHHMM(employee.working_hours.close))) / 60) * HOUR_HEIGHT}px`,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                pointerEvents: "none",
                background: "rgba(0,0,0,0.05)",
                borderRadius: "10px",
                color: "#6B7280",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              Poza godzinami pracy
            </div>
          )}
        </>
      )}

      {employee?.day_off && (
        <div
          className="dayoff-block"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          💤 Dzień wolny
        </div>
      )}

      {children}

      {dragLinePos !== null && (
        <div className={`drag-line ${isOver ? "visible" : ""}`} style={{ top: `${dragLinePos}px`, zIndex: 200 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, borderTop: isSnapped ? "3px solid rgba(229,91,16,0.95)" : "2px dashed rgba(229,91,16,0.9)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 6, top: -18, background: "#E55B10", color: "white", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", pointerEvents: "none", zIndex: 201 }}>
            {dragTime}
          </div>
        </div>
      )}

      {shadowEvent && (
        <div className="event-card" style={{ position: "absolute", top: `${shadowEvent.top}px`, left: "4px", right: "4px", height: `${shadowEvent.height}px`, background: stringToPastelColor(shadowEvent.service_name), opacity: 0.8, zIndex: 100, pointerEvents: "none" }}>
          <div className="event-card-content" style={{ lineHeight: "0.8!important" }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 1, lineHeight: "0.8!important" }}>
              {shadowEvent.start_time} - {shadowEvent.end_time}
            </div>
            <div style={{ fontSize: 12, marginBottom: 0, lineHeight: "0.8!important" }}>{shadowEvent.client_name}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: -4, lineHeight: "0.8!important" }}>
              {shadowEvent.service_name}
              {shadowEvent.addons && shadowEvent.addons.trim() !== "" && <span> + {shadowEvent.addons}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Main component (single vertical scroll, sticky times) ---------- */
export default function EmployeeCalendarMonthView() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;

  const [daysData, setDaysData] = useState({});
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [activeDay, setActiveDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const employeesList = useMemo(() => {
    return Object.values(daysData)
      .flatMap((d) => d.employees || [])
      .filter((v, i, arr) => arr.findIndex((x) => x.employee_id === v.employee_id) === i);
  }, [daysData]);

  const activeDayRef = useRef(activeDay);
  useEffect(() => {
    activeDayRef.current = activeDay;
  }, [activeDay]);

  const columnsWrapRef = useRef(null);
  const dayRefs = useRef({});
  const verticalScrollRef = useRef(null); // IMPORTANT: single vertical scroll container
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTimeOff, setSelectedTimeOff] = useState(null);
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
  const [conflictModal, setConflictModal] = useState({ visible: false, retryAction: null });

  axios.defaults.headers.get["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  axios.defaults.headers.get["Pragma"] = "no-cache";
  axios.defaults.headers.get["Expires"] = "0";

  const axiosNoCache = async (url, options = {}) => {
    const timestamp = Date.now();
    const mergedOptions = {
      ...options,
      params: { ...(options.params || {}), _t: timestamp },
      headers: {
        ...(options.headers || {}),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    };
    return axios.get(url, mergedOptions);
  };

  const daysList = useMemo(() => {
    const d = new Date(yearMonth.year, yearMonth.month - 1, 1);
    const last = new Date(yearMonth.year, yearMonth.month, 0).getDate();
    const arr = [];
    for (let i = 1; i <= last; i++) {
      const dateStr = `${yearMonth.year}-${String(yearMonth.month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      arr.push(dateStr);
    }
    return arr;
  }, [yearMonth]);

  const calendarRange = useMemo(() => {
    let start = defaultDayStart;
    let end = defaultDayEnd;
    const allEmployees = Object.values(daysData).flatMap((d) => (d.employees || []));
    if (allEmployees.length) {
      const opens = allEmployees
        .filter((e) => e.working_hours && !e.day_off && e.working_hours.open)
        .map((e) => timeToMinutes(formatHHMM(e.working_hours.open)));
      const closes = allEmployees
        .filter((e) => e.working_hours && !e.day_off && e.working_hours.close)
        .map((e) => timeToMinutes(formatHHMM(e.working_hours.close)));
      if (opens.length > 0) start = Math.min(...opens);
      if (closes.length > 0) end = Math.max(...closes);
      if (end <= start) end = start + 8 * 60;
    }
    return { dayStartMin: start, dayEndMin: end, HOUR_HEIGHT };
  }, [daysData]);

  /* fetch month */
  useEffect(() => {
    const fetchMonth = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;
        const res = await axios.get(`${backendBase}/api/calendar/shared/month`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { year: yearMonth.year, month: yearMonth.month },
        });
        const normalized = res.data.days || {};
        for (const k of Object.keys(normalized)) {
          normalized[k].employees = (normalized[k].employees || []).map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
            time_off: e.time_off ?? [],
            appointments: e.appointments ?? [],
          }));
        }
        setDaysData(normalized);
      } catch (err) {
        console.error("❌ Błąd pobierania miesiąca:", err);
      }
    };
    fetchMonth();
  }, [firebaseUser, backendBase, yearMonth]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = original);
  }, []);

  useEffect(() => {
    socket.on("calendar_updated", async () => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;
        const res = await axios.get(`${backendBase}/api/calendar/shared/month`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { year: yearMonth.year, month: yearMonth.month },
        });
        const normalized = res.data.days || {};
        for (const k of Object.keys(normalized)) {
          normalized[k].employees = (normalized[k].employees || []).map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
            time_off: e.time_off ?? [],
            appointments: e.appointments ?? [],
          }));
        }
        setDaysData(normalized);
      } catch (err) {
        console.error("❌ Błąd podczas auto-refresh month:", err);
      }
    });
    return () => socket.off("calendar_updated");
  }, [firebaseUser, backendBase, yearMonth]);

  const employeeMeta = useMemo(() => {
    for (const d of Object.values(daysData)) {
      const emp = (d.employees || []).find((e) => String(e.employee_id) === String(employeeId));
      if (emp) return emp;
    }
    return null;
  }, [daysData, employeeId]);

  const handleModalUpdated = async () => {
    try {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken?.();
      if (!token) return;
      const res = await axiosNoCache(`${backendBase}/api/calendar/shared/month`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year: yearMonth.year, month: yearMonth.month },
      });
      const normalized = res.data.days || {};
      for (const k of Object.keys(normalized)) {
        normalized[k].employees = (normalized[k].employees || []).map((e) => ({
          ...e,
          day_off: Boolean(e.day_off || e.is_day_off),
          time_off: e.time_off ?? [],
          appointments: e.appointments ?? [],
        }));
      }
      setDaysData(normalized);
    } catch (err) {
      console.error("❌ Błąd odświeżenia po edycji:", err);
    }
  };

  const employeeForDay = useCallback(
    (dateStr) => {
      const day = daysData[dateStr];
      if (!day || !day.employees) return null;
      return day.employees.find((e) => String(e.employee_id) === String(employeeId)) || null;
    },
    [daysData, employeeId]
  );

  /* handleDrop unchanged */
  const handleDrop = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time, date }) => {
      try {
        if (!firebaseUser) {
          console.warn("⚠️ Brak zalogowanego użytkownika — przerwano handleDrop");
          return;
        }
        const token = await firebaseUser.getIdToken();
        const targetDay = daysData[date];
        const targetEmp = targetDay ? targetDay.employees.find((e) => String(e.employee_id) === String(toEmployeeId)) : null;

        if (targetEmp?.day_off === true) {
          alert("❌ Ten pracownik ma dziś dzień wolny!");
          return;
        }
        if (targetEmp?.working_hours) {
          const { open, close } = targetEmp.working_hours;
          if (start_time < open || end_time > close) {
            alert(`⛔ Poza godzinami pracy (${open} - ${close})`);
            return;
          }
        }

        await axios.put(
          `${backendBase}/api/calendar/shared/${id}`,
          { employee_id: toEmployeeId, date, start_time, end_time },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setDaysData((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            next[k] = { ...next[k], employees: (next[k].employees || []).map((emp) => ({ ...emp, appointments: [...(emp.appointments || [])] })) };
            for (const emp of next[k].employees) {
              const idx = emp.appointments.findIndex((a) => String(a.id) === String(id));
              if (idx !== -1) {
                emp.appointments.splice(idx, 1);
              }
            }
          }
          const t = next[date];
          if (t) {
            const emp = t.employees.find((e) => String(e.employee_id) === String(toEmployeeId));
            if (emp) {
              const moved = { id, start_time, end_time, employee_id: toEmployeeId, client_name: "", service_name: "" };
              emp.appointments = [...(emp.appointments || []), moved].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
            }
          }
          return next;
        });
      } catch (err) {
        if (err.response?.status === 409) {
          setConflictModal({
            visible: true,
            retryAction: () =>
              handleDropForce({
                id,
                fromEmployeeId,
                toEmployeeId,
                start_time,
                end_time,
                date,
              }),
          });
        } else {
          console.error("❌ Błąd aktualizacji terminu:", err);
          alert("Błąd aktualizacji wizyty!");
        }
      }
    },
    [firebaseUser, backendBase, daysData]
  );

  const handleDropForce = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time, date }) => {
      try {
        if (!firebaseUser) {
          console.warn("⚠️ Brak użytkownika — przerwano handleDropForce");
          return;
        }
        const token = await firebaseUser.getIdToken();
        await axios.put(
          `${backendBase}/api/calendar/shared/${id}`,
          { employee_id: toEmployeeId, date, start_time, end_time, force: true },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setConflictModal({ visible: false, retryAction: null });
        alert("✅ Zmieniono mimo kolizji.");
        await handleModalUpdated();
      } catch (error) {
        console.error("❌ Błąd wymuszonej zmiany:", error);
        alert("Nie udało się zapisać nawet z wymuszeniem.");
      }
    },
    [firebaseUser, backendBase]
  );

  const onPrevMonth = () => {
    setYearMonth((p) => {
      const d = new Date(p.year, p.month - 2, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };
  const onNextMonth = () => {
    setYearMonth((p) => {
      const d = new Date(p.year, p.month, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  /* drag month shift (unchanged) */
  useEffect(() => {
    let dragging = false;
    let switchTimeout = null;
    const edgeZone = 0.08;
    function onMove(e) {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const w = window.innerWidth;
      const leftEdge = w * edgeZone;
      const rightEdge = w - w * edgeZone;
      if (x < leftEdge) scheduleMonthShift(-1);
      else if (x > rightEdge) scheduleMonthShift(1);
    }
    function onStart() {
      dragging = true;
    }
    function onEnd() {
      dragging = false;
      clearTimeout(switchTimeout);
      switchTimeout = null;
    }
    function scheduleMonthShift(direction) {
      if (switchTimeout) return;
      switchTimeout = setTimeout(() => {
        setYearMonth((prev) => {
          const d = new Date(prev.year, prev.month - 1 + direction, 1);
          return { year: d.getFullYear(), month: d.getMonth() + 1 };
        });
        switchTimeout = null;
      }, 600);
    }
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    window.addEventListener("touchstart", onStart);
    window.addEventListener("touchend", onEnd);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    return () => {
      clearTimeout(switchTimeout);
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, []);

  /* initial scroll to today (horizontal) */
  useEffect(() => {
    if (!columnsWrapRef.current) return;
    const todayStr = formatDateLocal(new Date());
    const todayIndex = daysList.indexOf(todayStr);
    let targetDayStr = todayStr;
    if (todayIndex > 0) targetDayStr = daysList[todayIndex - 1];
    const targetEl = dayRefs.current[targetDayStr];
    const container = columnsWrapRef.current;
    if (targetEl && container) {
      container.scrollTo({ left: targetEl.offsetLeft - container.clientWidth / 2 + targetEl.clientWidth / 2, behavior: "smooth" });
    }
  }, [daysData, daysList]);

  /* clustering helper (same as first calendar) */
  const buildClusters = (items) => {
    const clusters = [];
    items.forEach((ev) => {
      let added = false;
      for (let cluster of clusters) {
        const overlaps = cluster.some((c) => !(ev.end <= c.start || ev.start >= c.end));
        if (overlaps) {
          cluster.push(ev);
          added = true;
          break;
        }
      }
      if (!added) clusters.push([ev]);
    });
    return clusters;
  };

  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="calendar-root p-4 min-h-screen relative">
        <style>{styles}</style>

        {/* === HEADER (Tailwind) === */}
<div
  className="
    sticky top-0 z-40
    pb-1
    bg-[#F9FAFB] dark:bg-[#0f0f10]
    border-b border-black/5 dark:border-white/10
    backdrop-blur-sm
  "
>
  {/* Top Row: Wróć + Dziś */}
  <div className="flex items-center gap-3 pt-2">
    <div
      onClick={() => (window.location.href = `/employee/${employeeId}/calendar`)}
      className="
        flex items-center gap-1
        text-[15px] font-semibold cursor-pointer
        text-gray-700 dark:text-gray-200
        px-1 py-1
      "
    >
      <span className="text-[20px] leading-none">←</span>
      <span>Wróć</span>
    </div>

    <div
      onClick={() => {
        const todayDate = new Date();
        const todayStr = formatDateLocal(todayDate);
        const todayMonth = todayDate.getMonth() + 1;
        const todayYear = todayDate.getFullYear();
        const todayIndex = daysList.indexOf(todayStr);
        const targetDayStr = todayIndex > 0 ? daysList[todayIndex - 1] : todayStr;

        const scrollToTarget = () => {
          const wrap = columnsWrapRef.current;
          const el = dayRefs.current[targetDayStr];
          if (wrap && el) {
            const offset =
              el.offsetLeft -
              wrap.clientWidth / 2 +
              el.clientWidth / 2;
            wrap.scrollTo({ left: offset, behavior: "smooth" });
          }
        };

        if (yearMonth.month !== todayMonth || yearMonth.year !== todayYear) {
          setYearMonth({ month: todayMonth, year: todayYear });
          setTimeout(scrollToTarget, 450);
        } else {
          scrollToTarget();
        }
      }}
      className="
        bg-[#E5E7EB] dark:bg-white/10
        text-gray-700 dark:text-gray-200
        px-3 py-1.5
        rounded-lg text-[14px] font-semibold
        cursor-pointer select-none
      "
    >
      Dziś
    </div>
  </div>

  {/* Month navigation + Employee picker */}
  <div className="flex items-center justify-between mt-3">
    {/* Month Navigation */}
    <div className="flex items-center gap-2">
      <button
        onClick={onPrevMonth}
        className="
          p-1.5 rounded-lg 
          bg-white/70 dark:bg-white/10 
          hover:bg-white dark:hover:bg-gray-700 
          transition
        "
      >
        <ChevronLeft size={18} className="text-gray-700 dark:text-gray-200" />
      </button>

      <div className="text-[16px] font-bold text-gray-800 dark:text-gray-100">
        {new Date(yearMonth.year, yearMonth.month - 1, 1).toLocaleDateString(
          "pl-PL",
          { month: "long", year: "numeric" }
        )}
      </div>

      <button
        onClick={onNextMonth}
        className="
          p-1.5 rounded-lg 
          bg-white/70 dark:bg-white/10 
          hover:bg-white dark:hover:bg-gray-700 
          transition
        "
      >
        <ChevronRight size={18} className="text-gray-700 dark:text-gray-200" />
      </button>
    </div>

    {/* Employee Picker */}
    {employeeMeta && (
      <div className="relative flex items-center gap-2">
        <img
          src={
            employeeMeta.employee_image_url
              ? `${backendBase}/${employeeMeta.employee_image_url}`
              : "/static/placeholder-avatar.png"
          }
          className="w-[36px] h-[36px] rounded-full object-cover shadow"
        />

        <div className="flex flex-col">
          <div
            className="
              flex items-center gap-1 font-bold text-gray-800 dark:text-gray-100
            "
          >
            {employeeMeta.employee_name}

            <span
              onClick={() => setShowEmployeePicker((p) => !p)}
              className="
                text-[15px] cursor-pointer 
                px-1
                transition-transform
                text-gray-600 dark:text-gray-300
              "
              style={{ transform: showEmployeePicker ? "rotate(180deg)" : "none" }}
            >
              ▼
            </span>
          </div>

          <div className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1">
            {formatHHMM(employeeMeta?.working_hours?.open)} –{" "}
            {formatHHMM(employeeMeta?.working_hours?.close)}
          </div>
        </div>

        {showEmployeePicker && (
          <div
            className="
              absolute top-[48px] right-0 
              bg-white dark:bg-[#1a1a1c]
              border border-black/10 dark:border-white/10
              rounded-xl shadow-xl 
              p-3 w-[200px] z-[200]
            "
          >
            {employeesList.map((emp) => (
              <div
                key={emp.employee_id}
                onClick={() => {
                  navigate(`/employee/${emp.employee_id}/calendar-month`);
                  setShowEmployeePicker(false);
                }}
                className="
                  flex items-center gap-2 mb-1 p-2
                  hover:bg-gray-100 dark:hover:bg-white/10
                  rounded-lg cursor-pointer
                "
              >
                <img
                  src={
                    emp.employee_image_url
                      ? `${backendBase}/${emp.employee_image_url}`
                      : "/static/placeholder-avatar.png"
                  }
                  className="w-[26px] h-[26px] rounded-full"
                />
                <span className="text-gray-700 dark:text-gray-200">
                  {emp.employee_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
</div>


        {/* --- vertical scroll container (single source of truth for vertical scrolling) --- */}
        <div className="vertical-scroll" ref={verticalScrollRef}>
          <div className="calendar-body" role="region" aria-label="Kalendarz miesięczny">
            <div className="times-column">
              <div className="times-column-inner">
                {(() => {
                  const hoursCount = Math.ceil((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60);
                  return Array.from({ length: hoursCount + 1 }).map((_, i) => (
                    <div key={i} style={{ height: HOUR_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {pad2(Math.floor(calendarRange.dayStartMin / 60) + i)}:00
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div ref={columnsWrapRef} className="columns-wrap" style={{ alignItems: "flex-start" }}>
              {daysList.map((dateStr) => {
                const dObj = parseYYYYMMDDToDate(dateStr);
                const jsDow = dObj.getDay();
                const dayName = weekDays[jsDow === 0 ? 6 : jsDow - 1];
                const emp = employeeForDay(dateStr);
                const isActive = dObj.toDateString() === activeDay.toDateString();

                return (
                  <div key={dateStr} ref={(el) => (dayRefs.current[dateStr] = el)} className="day-col" style={{ flex: `0 0 50%`, minHeight: `${((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT}px` }}>
                    <div className="day-header" style={{ background: isActive ? "rgba(229,91,16,0.10)" : "#F9FAFB", padding: "6px 4px", borderBottom: "1px solid rgba(0,0,0,0.05)", transition: "background 0.2s ease" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "1", width: 26, textAlign: "center" }}>{dObj.getDate()}</div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{dayName}</div>
                          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{emp ? `${formatHHMM(emp.working_hours?.open)} - ${formatHHMM(emp.working_hours?.close)}` : ""}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <DroppableTimeGrid
                        day={dateStr}
                        employee={emp || { day_off: true, working_hours: { open: "09:00", close: "17:00" } }}
                        onDrop={handleDrop}
                        currentDate={dObj}
                        dayStartMin={calendarRange.dayStartMin}
                        dayEndMin={calendarRange.dayEndMin}
                        HOUR_HEIGHT={calendarRange.HOUR_HEIGHT}
                        verticalScrollRef={verticalScrollRef}
                      >
                        <div className="time-grid" style={{ height: `${((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT}px` }}>
                          {/* time_off */}
                          {emp?.time_off &&
                            emp.time_off.map((off, i) => {
                              const offDateNormalized = fixDateLocal(off.date || dateStr);
                              if (offDateNormalized !== dateStr) return null;
                              const endDt = makeLocalDateTime(offDateNormalized, off.end_time || "00:00");
                              const startDt = makeLocalDateTime(offDateNormalized, off.start_time || "00:00");
                              const now = new Date();
                              const isExpired = endDt.getTime() <= now.getTime();
                              const start = timeToMinutes(off.start_time);
                              const end = timeToMinutes(off.end_time);
                              const topPx = ((start - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT;
                              const heightPx = ((end - start) / 60) * HOUR_HEIGHT;
                              return (
                                <div key={`off-${off.id ?? i}`} className={`timeoff-block ${isExpired ? "expired" : ""}`} style={{ position: "absolute", top: `${topPx}px`, left: "4px", right: "4px", height: `${heightPx}px`, zIndex: 3, cursor: "pointer" }} onClick={() => { setSelectedTimeOff({ ...off, id: Number(off.id), employee_id: emp ? emp.employee_id : Number(employeeId), salon_id: emp?.salon_id, date: off.date ?? dateStr, start_time: off.start_time, end_time: off.end_time, reason: off.reason ?? "" }); setTimeOffModalOpen(true); }}>
                                  <div style={{ fontWeight: 700 }}>🔒 Blokada czasu</div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{formatTime(off.start_time)} – {formatTime(off.end_time)}</div>
                                  <div style={{ fontSize: 12, opacity: 0.85, lineHeight: "1.3" }}>{off.reason || (isExpired ? "Blokada wygasła" : "Brak powodu")}</div>
                                </div>
                              );
                            })}

                          {/* appointments with clustering -> columns (like first calendar) */}
                          {(() => {
                            if (!emp?.appointments || !Array.isArray(emp.appointments)) return null;
                            const items = emp.appointments
                              .filter((a) => {
                                if (a.date) {
                                  const apDate = fixDateLocal(a.date);
                                  return apDate === dateStr;
                                }
                                return true;
                              })
                              .map((a) => ({
                                ...a,
                                start: timeToMinutes(a.start_time),
                                end: timeToMinutes(a.end_time),
                                top: ((timeToMinutes(a.start_time) - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT,
                                height: ((timeToMinutes(a.end_time) - timeToMinutes(a.start_time)) / 60) * HOUR_HEIGHT,
                              }))
                              .sort((a, b) => a.start - b.start);

                            const clusters = buildClusters(items);
                            const render = [];
                            clusters.forEach((cluster) => {
                              const cols = [];
                              cluster.forEach((ev) => {
                                let placed = false;
                                for (let col of cols) {
                                  const last = col[col.length - 1];
                                  if (last.end <= ev.start) {
                                    col.push(ev);
                                    placed = true;
                                    break;
                                  }
                                }
                                if (!placed) cols.push([ev]);
                              });
                              const totalCols = cols.length;
                              cols.forEach((col, colIndex) => {
                                const widthPercent = 100 / totalCols;
                                const leftPercent = (100 / totalCols) * colIndex;
                                col.forEach((a) => {
                                  render.push(
                                    <DraggableEvent key={`${dateStr}-${a.id}`} appointment={{ ...a, employee_id: emp.employee_id }}>
                                      <div
                                        className="event-card"
                                        style={{
                                          position: "absolute",
                                          top: `${a.top}px`,
                                          height: `${a.height}px`,
                                          left: `calc(${leftPercent}% + 4px)`,
                                          width: `calc(${widthPercent}% - 8px)`,
                                          background: stringToPastelColor(a.service_name),
                                          borderRadius: "14px",
                                          padding: a.height < 40 ? "2px 4px" : "6px 8px",
                                          display: "flex",
                                          flexDirection: "column",
                                          justifyContent: "center",
                                          cursor: "pointer",
                                          userSelect: "none",
                                          WebkitUserSelect: "none",
                                          MsUserSelect: "none",
                                          zIndex: 20 + colIndex,
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedAppointment({ ...a, date: dateStr });
                                          setModalOpen(true);
                                        }}
                                      >
                                        <div className="event-card-content">
                                          <div style={{ fontSize: a.height < 40 ? 10 : 12, fontWeight: 700, lineHeight: "1" }}>
                                            {formatHHMM(a.start_time)} - {formatHHMM(a.end_time)}
                                          </div>
                                          <div style={{ fontSize: a.height < 40 ? 10 : 12, fontWeight: 600, lineHeight: "1" }}>{a.client_name}</div>
                                          {a.height < 30 ? (
                                            <div style={{ fontSize: 9, opacity: 0.85, lineHeight: "1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                              {a.service_name}
                                            </div>
                                          ) : (
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>
                                              {a.service_name}
                                              {a.addons && a.addons.trim() !== "" && <> + {a.addons}</>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </DraggableEvent>
                                  );
                                });
                              });
                            });
                            return render;
                          })()}

                          <div style={{ height: "80px" }} />
                        </div>
                      </DroppableTimeGrid>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="floating-add" onClick={() => alert("Dodaj wizytę (DEMO)")}>
          <Plus size={28} color="white" />
        </div>

        {conflictModal.visible && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
            <div style={{ background: "white", borderRadius: 12, padding: 24, width: 320, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
              <h3 style={{ fontWeight: 700, marginBottom: 10 }}>⚠️ Kolizja wizyt</h3>
              <p style={{ fontSize: 14, marginBottom: 10 }}>Ta wizyta nakłada się z inną wizytą tego pracownika.</p>
              <p style={{ fontSize: 13, color: "#555" }}>Czy chcesz mimo to zapisać zmianę?</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
                <button onClick={() => setConflictModal({ visible: false, retryAction: null })} style={{ background: "#e5e7eb", padding: "6px 14px", borderRadius: 8, fontWeight: 600 }}>
                  Anuluj
                </button>
                <button onClick={() => conflictModal.retryAction?.()} style={{ background: "#ef4444", color: "white", padding: "6px 14px", borderRadius: 8, fontWeight: 600 }}>
                  Zapisz mimo kolizji
                </button>
              </div>
            </div>
          </div>
        )}

        {timeOffModalOpen && selectedTimeOff && (
          <TimeOffModal open={timeOffModalOpen} onClose={() => setTimeOffModalOpen(false)} timeOff={selectedTimeOff} onUpdated={async () => { setTimeOffModalOpen(false); await handleModalUpdated(); }} />
        )}

        {modalOpen && selectedAppointment && (
          <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} appointmentId={selectedAppointment.id} onUpdated={async () => { setModalOpen(false); await handleModalUpdated(); }} socket={socket} />
        )}
      </div>
    </DndProvider>
  );
}
