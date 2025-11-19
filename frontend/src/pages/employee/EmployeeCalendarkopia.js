import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { MultiBackend, TouchTransition, MouseTransition } from "dnd-multi-backend";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import axios from "axios";
import { useAuth } from "../../components/AuthProvider";
import io from "socket.io-client";
import AppointmentModal from "../../components/AppointmentModal";
import TimeOffModal from "../../components/TimeOffModal";




const socket = io(import.meta.env.VITE_API_URL, {
    autoConnect: false,
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
  .calendar-root { 
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; 
    user-select:none;
    background: #F9FAFB;
  }
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
  .calendar-body { display:flex; gap:10px; padding:10px 4px; overflow:hidden; }
  .times-column { width:48px; flex:0 0 48px; color:#6B7280; font-weight:600; font-size:12px; }
  .employee-col { background:transparent; border-radius:12px; position:relative; scroll-snap-align:start; }
  .employee-header { display:flex; gap:8px; align-items:center; padding:8px 6px; border-bottom:1px solid rgba(0,0,0,0.04); }
  .avatar { width:32px; height:32px; border-radius:50%; object-fit:cover; box-shadow:0 1px 3px rgba(2,6,23,0.06); }
  .work-hours { font-size:11px; color:#6B7280; }
  .time-grid { position:relative; padding:0px 6px; height: calc(var(--hours) * var(--hour-height)); background:transparent; }

  .event-card {
    position: absolute;
    left: 4px;
    right: 4px;
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

  .event-card:hover {
    transform: scale(1.03);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
    z-index: 50;
  }

  .event-card-content {
    overflow-y: auto;
    max-height: 100%;
    scrollbar-width: none;
  }
  .event-card-content::-webkit-scrollbar {
    display: none;
  }

  .event-card.small {
    font-size: 10px;
    padding: 2px 4px;
  }

  .floating-add {
    position:fixed;
    right:20px;
    bottom:90px;
    z-index:60;
    width:56px;
    height:56px;
    border-radius:999px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:linear-gradient(180deg,#fb923c,#ef4444);
    color:white;
    box-shadow:0 10px 30px rgba(15,23,42,0.16);
  }
  .drag-line {
    position:absolute;
    left:0;
    right:0;
    height:0;
    border-top:2px dashed rgba(229,91,16,0.7);
    pointer-events:none;
    opacity:0;
    transform:scaleY(0.95);
    transition:opacity 0.2s ease, transform 0.2s ease;
  }
  .drag-line.visible { opacity:1; transform:scaleY(1); }
  
  
  .timeoff-block {
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 99, 99, 0.14);
  border: 1px dashed rgba(220, 38, 38, 0.4);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);

  display: flex;
  flex-direction: column;
  gap: 6px;

  font-size: 13px;
  color: #991B1B;
}

.timeoff-block.expired {
  background: rgba(200,200,200,0.18);
  border-color: rgba(120,120,120,0.4);
  color: #6B7280;
  opacity: 0.7;
}


.offhours-block {
  background: rgba(180, 200, 255, 0.18);
  border: 1px dashed rgba(120, 150, 220, 0.45);
  border-radius: 14px;
  padding: 8px 10px;
  font-size: 12px;
  color: #1e3a8a;
  display: flex;
  align-items: center;
  z-index: 1;
}

.dayoff-block {
  background: rgba(0, 0, 0, 0.06);     /* delikatny jasny szary */
  border: 1px dashed rgba(0, 0, 0, 0.15);
  border-radius: 14px;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 16px;
  text-align: center;

  font-size: 13px;
  font-weight: 600;
  color: #6B7280;                      /* elegancki grey-500 */

  letter-spacing: 0.2px;

  backdrop-filter: blur(2px);          /* lekki efekt premium */
  z-index: 3;
  user-select: none;
  pointer-events: none;
}


  
`;

const pad2 = (n) => String(n).padStart(2, "0");
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
};
const minutesToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(Math.floor(m % 60))}`;
const formatHHMM = (timeStr) => (timeStr ? timeStr.split(":").slice(0, 2).join(":") : "");
// 🔧 usuwa sekundy z HH:MM:SS → HH:MM
const formatTime = (t) => (t ? t.substring(0, 5) : "");

function formatDateLocal(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


function fixDateLocal(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function DraggableEvent({ appointment, children }) {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ItemTypes.APPOINTMENT,
    item: appointment,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }));
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);
  return (
    <div
      ref={drag}
      style={{
        cursor: "grabbing",
        touchAction: "none",
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

function DroppableTimeGrid({ employee, onDrop, currentDate, dayStartMin, dayEndMin, HOUR_HEIGHT, children }) {
  const containerRef = useRef(null);
  const [dragLinePos, setDragLinePos] = useState(null);
  const [dragTime, setDragTime] = useState(null);
  const [shadowEvent, setShadowEvent] = useState(null);

  const getMinutesFromPageY = (pageY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return dayStartMin;
    const topOnPage = rect.top + window.scrollY;
    const offsetY = pageY - topOnPage;
    const minutesFromTop = (offsetY / HOUR_HEIGHT) * 60;
    return dayStartMin + minutesFromTop;
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
        const currentMinutes = getMinutesFromPageY(pageY);
        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);
        const boundedStart = Math.max(dayStartMin, Math.min(currentMinutes, dayEndMin - duration));
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
        const pageY = clientOffset.y + window.scrollY;
        const currentMinutes = getMinutesFromPageY(pageY);
        const duration = timeToMinutes(item.end_time) - timeToMinutes(item.start_time);
        const dropStart = Math.round(currentMinutes);
        const dropEnd = dropStart + duration;
        if (employee.working_hours) {
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
          date: formatDateLocal(currentDate),
        });
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [employee.day_off, employee.employee_id, dayStartMin, dayEndMin, HOUR_HEIGHT]
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
      {!employee.day_off && employee.working_hours && (
  <>
    {/* Przed godzinami pracy */}
    {timeToMinutes(formatHHMM(employee.working_hours.open)) > dayStartMin && (
      <div
        className="offhours-block"
        style={{
          position: "absolute",
          top: 0,
          left: "4px",
          right: "4px",
          height: `${
            ((timeToMinutes(formatHHMM(employee.working_hours.open)) - dayStartMin) /
              60) *
            HOUR_HEIGHT
          }px`,
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

    {/* Po godzinach pracy */}
    {timeToMinutes(formatHHMM(employee.working_hours.close)) < dayEndMin && (
      <div
        className="offhours-block"
        style={{
          position: "absolute",
          bottom: 0,
          left: "4px",
          right: "4px",
          height: `${
            ((dayEndMin - timeToMinutes(formatHHMM(employee.working_hours.close))) /
              60) *
            HOUR_HEIGHT
          }px`,
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



      {employee.day_off && (
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
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              borderTop: "2px dashed rgba(229,91,16,0.9)",
              pointerEvents: "none",
            }}
          />
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
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              zIndex: 201,
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
            top: `${shadowEvent.top}px`,
            left: "4px",
            right: "4px",
            height: `${shadowEvent.height}px`,
            background: stringToPastelColor(shadowEvent.service_name),
            opacity: 0.8,
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
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

export default function EmployeeCalendar() {
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

  const calendarRange = useMemo(() => {
    let start = defaultDayStart;
    let end = defaultDayEnd;
    if (payload?.employees?.length) {
      const opens = payload.employees
        .filter((e) => e.working_hours && !e.day_off && e.working_hours.open)
        .map((e) => timeToMinutes(formatHHMM(e.working_hours.open)));
      const closes = payload.employees
        .filter((e) => e.working_hours && !e.day_off && e.working_hours.close)
        .map((e) => timeToMinutes(formatHHMM(e.working_hours.close)));
      if (opens.length > 0) start = Math.min(...opens);
      if (closes.length > 0) end = Math.max(...closes);
      if (end <= start) end = start + 8 * 60;
    }
    return { dayStartMin: start, dayEndMin: end, HOUR_HEIGHT };
  }, [payload.employees]);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;
        const res = await axios.get(`${backendBase}/api/calendar/shared`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { date: formatDateLocal(activeDay) },
        });
        const normalized = {
          ...res.data,
          employees: res.data.employees.map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
          })),
        };
		console.log("📌 RAW API DATA:", res.data);

        setPayload(normalized);
      } catch (err) {
        console.error("❌ Błąd pobierania kalendarza:", err);
      }
    };
    if (firebaseUser) fetchCalendar();
  }, [firebaseUser, activeDay, backendBase]);

  useEffect(() => {
    socket.on("calendar_updated", async (payloadSocket) => {
      try {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken?.();
        if (!token) return;
        const res = await axios.get(`${backendBase}/api/calendar/shared`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { date: formatDateLocal(activeDay) },
        });
        const normalized = {
          ...res.data,
          employees: res.data.employees.map((e) => ({
            ...e,
            day_off: isDayOffFlag(e),
			time_off: e.time_off ?? [],     // ⬅️ DODANE
          })),
        };
        setPayload(normalized);
      } catch (err) {
        console.error("❌ Błąd podczas auto-odświeżania:", err);
      }
    });
    return () => socket.off("calendar_updated");
  }, [firebaseUser, activeDay, backendBase]);

  useEffect(() => {
    const logInterval = setInterval(() => {
      console.log("🕓 [LOG] Aktualny activeDay:", formatDateLocal(activeDay), "(", activeDay.toLocaleDateString("pl-PL", { weekday: "long" }), ")");
    }, 5000);
    return () => clearInterval(logInterval);
  }, [activeDay]);

  useEffect(() => {
    console.log("📅 Zmieniono activeDay na:", formatDateLocal(activeDay), "(", activeDay.toLocaleDateString("pl-PL", { weekday: "long" }), ")");
  }, [activeDay]);

  useEffect(() => {
    let dragging = false;
    let switchTimeout = null;
    const edgeZone = 0.1;
    function onMove(e) {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const w = window.innerWidth;
      const leftEdge = w * edgeZone;
      const rightEdge = w - w * edgeZone;
      if (x < leftEdge) scheduleDayChange(-1);
      else if (x > rightEdge) scheduleDayChange(1);
    }
    function onStart() {
      dragging = true;
    }
    function onEnd() {
      dragging = false;
      clearTimeout(switchTimeout);
      switchTimeout = null;
    }
    function scheduleDayChange(direction) {
      if (switchTimeout) return;
      switchTimeout = setTimeout(() => {
        setActiveDay((prev) => {
          const newDate = new Date(prev);
          newDate.setDate(prev.getDate() + direction);
          return newDate;
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
  }, [setActiveDay]);

  const handleDrop = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time, date }) => {
      try {
        if (!firebaseUser) {
          console.warn("⚠️ Brak zalogowanego użytkownika — przerwano handleDrop");
          return;
        }
        const token = await firebaseUser.getIdToken();
        const targetEmp = payload.employees.find((e) => e.employee_id === toEmployeeId);
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
        const sendDate = date || formatDateLocal(activeDayRef.current || activeDay);
        await axios.put(
          `${backendBase}/api/calendar/shared/${id}`,
          { employee_id: toEmployeeId, date: sendDate, start_time, end_time },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setPayload((prev) => {
          const employees = prev.employees.map((e) => ({ ...e, appointments: [...(e.appointments || [])] }));
          let moved = null;
          for (const e of employees) {
            const idx = e.appointments.findIndex((a) => a.id === id);
            if (idx !== -1) {
              moved = { ...e.appointments[idx] };
              e.appointments.splice(idx, 1);
              break;
            }
          }
          if (!moved) return prev;
          moved.start_time = start_time;
          moved.end_time = end_time;
          moved.employee_id = toEmployeeId;
          const target = employees.find((e) => e.employee_id === toEmployeeId);
          if (target) {
            target.appointments.push(moved);
            target.appointments.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
          }
          return { ...prev, employees };
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
              }),
          });
        } else {
          console.error("❌ Błąd aktualizacji terminu:", err);
          alert("Błąd aktualizacji wizyty!");
        }
      }
    },
    [firebaseUser, backendBase, activeDay, payload]
  );

  const handleDropForce = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time }) => {
      try {
        if (!firebaseUser) {
          console.warn("⚠️ Brak użytkownika — przerwano handleDropForce");
          return;
        }
        const token = await firebaseUser.getIdToken();
        const date = formatDateLocal(activeDayRef.current || new Date());
        await axios.put(
          `${backendBase}/api/calendar/shared/${id}`,
          { employee_id: toEmployeeId, date, start_time, end_time, force: true },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setConflictModal({ visible: false, retryAction: null });
        alert("✅ Zmieniono mimo kolizji.");
      } catch (error) {
        console.error("❌ Błąd wymuszonej zmiany:", error);
        alert("Nie udało się zapisać nawet z wymuszeniem.");
      }
    },
    [firebaseUser, backendBase]
  );
  
  
  
  

  const dayStripRef = useRef(null);

  useEffect(() => {
    const el = dayStripRef.current;
    if (el) {
      const activeEl = el.querySelector(".day-pill.active");
      if (activeEl) {
        const parent = el;
        const parentRect = parent.getBoundingClientRect();
        const childRect = activeEl.getBoundingClientRect();
        const offset = childRect.left - parentRect.left - parent.clientWidth / 2 + childRect.width / 2;
        parent.scrollBy({ left: offset, behavior: "smooth" });
      }
    }
  }, [activeDay]);

  const openAppointmentModal = (appointment) => {
    setSelectedAppointment(appointment);
    setModalOpen(true);
  };
  const handleModalUpdated = async () => {
    try {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken?.();
      const res = await axiosNoCache(`${backendBase}/api/calendar/shared`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: formatDateLocal(activeDay) },
      });
      const normalized = {
        ...res.data,
        employees: res.data.employees.map((e) => ({
  ...e,
  day_off: Boolean(e.day_off || e.is_day_off),
  time_off: e.time_off ?? [],  // ⬅️ DODANE
  appointments: e.appointments ?? [], // ⬅️ upewnij się że istnieją
})),

      };
      setPayload(normalized);
    } catch (err) {
      console.error("❌ Błąd odświeżenia po edycji:", err);
    }
  };

  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="calendar-root p-4 min-h-screen relative">
        <style>{styles}</style>

        <div className="cal-header mb-3 sticky top-0 bg-[#F9FAFB] pb-2 z-40">
          <div className="header-top flex items-center justify-center gap-4">
            <button
              onClick={() =>
                setActiveDay((prev) => {
                  const newDate = new Date(prev);
                  newDate.setMonth(prev.getMonth() - 1);
                  newDate.setDate(1);
                  return newDate;
                })
              }
              className="p-2 bg-white/60 hover:bg-white rounded-xl"
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {activeDay.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
            </div>

            <button
              onClick={() =>
                setActiveDay((prev) => {
                  const newDate = new Date(prev);
                  newDate.setMonth(prev.getMonth() + 1);
                  newDate.setDate(1);
                  return newDate;
                })
              }
              className="p-2 bg-white/60 hover:bg-white rounded-xl"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div
            ref={dayStripRef}
            className="day-strip flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 mt-2 mb-1"
            style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth", padding: "8px 0" }}
          >
            {(() => {
              const year = activeDay.getFullYear();
              const month = activeDay.getMonth();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              return Array.from({ length: daysInMonth }).map((_, i) => {
                const d = new Date(year, month, i + 1);
                const isActive = d.toDateString() === activeDay.toDateString();
                const dayName = weekDays[(d.getDay() + 6) % 7];
                return (
                  <div
                    key={i}
                    className={`day-pill ${isActive ? "active" : ""}`}
                    style={{ scrollSnapAlign: "center", flex: "0 0 auto" }}
                    onClick={() => setActiveDay(d)}
                  >
                    <div style={{ fontSize: 12 }}>{dayName}</div>
                    <div style={{ fontWeight: 700 }}>{d.getDate()}</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="calendar-body">
          <div className="times-column">
            {(() => {
              const hoursCount = Math.ceil((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60);
              return Array.from({ length: hoursCount + 1 }).map((_, i) => (
                <div key={i} style={{ height: HOUR_HEIGHT }} className="flex items-center">
                  {pad2(Math.floor(calendarRange.dayStartMin / 60) + i)}:00
                </div>
              ));
            })()}
          </div>

          <div className="columns-wrap flex gap-3 overflow-x-auto scroll-smooth scrollbar-thin scrollbar-thumb-gray-300 px-2">
            {payload.employees
			  .filter(emp => emp.is_active)   // ⬅️ tylko aktywni
			  .map((emp) => (

              <div
                key={emp.employee_id}
                className="employee-col"
                style={{
                  flex: `0 0 ${100 / Math.min(payload.employees.length || 1, 2)}%`,
                  scrollSnapAlign: "start",
                }}
              >
                <div className="employee-header">
                  <img
                    src={emp.employee_image_url ? `${backendBase}/${emp.employee_image_url}` : "/static/placeholder-avatar.png"}
                    alt={emp.employee_name}
                    className="avatar"
                    onError={(e) => {
                      e.currentTarget.src = "/static/placeholder-avatar.png";
                    }}
                  />

                  <div>
                    <div style={{ fontWeight: 700 }}>{emp.employee_name}</div>
                    {emp.day_off ? (
                      <div className="work-hours" style={{ color: "#EF4444", fontWeight: 600 }}>
                        💤 Dzień wolny
                      </div>
                    ) : (
                      <div className="work-hours">
                        {formatHHMM(emp.working_hours?.open)} - {formatHHMM(emp.working_hours?.close)}
                      </div>
                    )}
                  </div>
                </div>

                <DroppableTimeGrid
                  employee={emp}
                  onDrop={handleDrop}
                  currentDate={activeDay}
                  dayStartMin={calendarRange.dayStartMin}
                  dayEndMin={calendarRange.dayEndMin}
                  HOUR_HEIGHT={calendarRange.HOUR_HEIGHT}
                >
                 <div
  className="time-grid"
  style={{
    position: "relative",
    padding: "0 6px",
    height: `${((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT}px`,
    background: "transparent",
  }}
>

{/* 🔹 Debug — pokaż raw time off */}
{console.log("TIME OFF RAW FOR EMP:", emp.employee_id, emp.time_off)}
  {/* 🔹 Pokaż przerwy / rezerwacje czasu (time_off) */}
{emp.time_off &&
  emp.time_off.map((off, i) => {
    // Upewnij się, że off.date istnieje; jeśli nie, użyj activeDay
    const offDate = off.date || formatDateLocal(activeDay);
    // Zbuduj końcowy DateTime końca blokady (YYYY-MM-DDTHH:MM:SS)
    const endIso = `${offDate}T${(off.end_time || "00:00")}:00`;
    const startIso = `${offDate}T${(off.start_time || "00:00")}:00`;

    // Parsujemy i porównujemy z teraz
    const endDt = new Date(endIso);
    const startDt = new Date(startIso);
    const now = new Date();

    const isExpired = endDt.getTime() <= now.getTime();

    // style pozycji w kalendarzu
    const start = timeToMinutes(off.start_time);
    const end = timeToMinutes(off.end_time);
    const topPx = ((start - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT;
    const heightPx = ((end - start) / 60) * HOUR_HEIGHT;

    const containerStyle = {
      position: "absolute",
      top: `${topPx}px`,
      left: "4px",
      right: "4px",
      height: `${heightPx}px`,
      borderRadius: "8px",
      zIndex: 2,
      cursor: "pointer",
      display: "flex",
      alignItems: "flex-start",
      overflow: "hidden",
      padding: "6px",
      boxSizing: "border-box",
      // wygląd zależnie od stanu (wygasła / aktywna)
      background: isExpired ? "linear-gradient(180deg, rgba(229,229,229,0.6), rgba(240,240,240,0.6))" : "rgba(255, 100, 100, 0.18)",
      border: isExpired ? "1px dashed rgba(107,114,128,0.25)" : "1px dashed rgba(239,68,68,0.5)",
      color: isExpired ? "#6B7280" : "#B91C1C",
      opacity: isExpired ? 0.55 : 1,
    };

    return (
     <div
  key={`off-${off.id ?? i}`}
  className={`timeoff-block ${isExpired ? "expired" : ""}`}
  style={{
    position: "absolute",
    top: `${topPx}px`,
    left: "4px",
    right: "4px",
    height: `${heightPx}px`,
    zIndex: 3,
    cursor: "pointer",
  }}
  onClick={() => {
    setSelectedTimeOff({
      ...off,
      id: Number(off.id),
      employee_id: emp.employee_id,
      salon_id: emp.salon_id,
      date: off.date ?? formatDateLocal(activeDay),
      start_time: off.start_time,
      end_time: off.end_time,
      reason: off.reason ?? "",
    });
    setTimeOffModalOpen(true);
  }}
>
  {/* 🔒 Nagłówek */}
  <div style={{ fontWeight: 700 }}>
    🔒 Blokada czasu
  </div>

  {/* 🕒 Zakres godzin */}
  <div style={{ fontWeight: 600, fontSize: 13 }}>
    {formatTime(off.start_time)} – {formatTime(off.end_time)}

  </div>

  {/* ✏️ Powód */}
  <div style={{
    fontSize: 12,
    opacity: 0.85,
    lineHeight: "1.3"
  }}>
    {off.reason || (isExpired ? "Blokada wygasła" : "Brak powodu")}
  </div>
</div>


    );
  })}


  {/* 🔹 Pokaż wizyty */}
  {emp.appointments.map((a, i) => {

                      const start = timeToMinutes(a.start_time);
                      const end = timeToMinutes(a.end_time);
                      const topPx = ((start - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT;
                      const heightPx = ((end - start) / 60) * HOUR_HEIGHT;

                      const isOverlapping = emp.appointments.some(
                        (other, j) =>
                          j < i &&
                          timeToMinutes(other.start_time) < end &&
                          timeToMinutes(other.end_time) > start
                      );

                      const cardStyle = {
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: isOverlapping ? "auto" : "4px",
                        right: isOverlapping ? "4%" : "4px",
                        width: isOverlapping ? "70%" : "auto",
                        zIndex: isOverlapping ? 15 : 5,
                        boxShadow: isOverlapping ? "0 6px 16px rgba(0,0,0,0.15)" : "0 4px 12px rgba(12,18,26,0.06)",
                      };

                      return (
                        <DraggableEvent key={a.id} appointment={{ ...a, employee_id: emp.employee_id }}>
                          <div
                            className="event-card"
                            style={{
                              ...cardStyle,
                              background: stringToPastelColor(a.service_name),
                              borderRadius: "14px",
                              minHeight: heightPx < 40 ? "36px" : undefined,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              padding: heightPx < 40 ? "2px 4px" : "6px 8px",
                              color: "#111827",
                              cursor: "pointer",
                            }}
                            title={`${a.start_time} - ${a.end_time}\n${a.client_name}\n${a.service_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment(a);
                              setModalOpen(true);
                            }}
                          >
                            <div className="event-card-content">
                              <div style={{ fontSize: heightPx < 40 ? 10 : 12, fontWeight: 700, lineHeight: "1" }}>
                                {formatHHMM(a.start_time)} - {formatHHMM(a.end_time)}
                              </div>
                              <div style={{ fontSize: heightPx < 40 ? 10 : 12, fontWeight: 600, lineHeight: "1" }}>
                                {a.client_name}
                              </div>
                              {heightPx < 30 ? (
                                <div
                                  style={{
                                    fontSize: 9,
                                    opacity: 0.85,
                                    lineHeight: "1",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
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
                    })}
                  </div>
                </DroppableTimeGrid>
              </div>
            ))}
          </div>
        </div>

        <div className="floating-add" onClick={() => alert("Dodaj wizytę (DEMO)")}>
          <Plus size={28} color="white" />
        </div>
      </div>

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
            <h3 style={{ fontWeight: 700, marginBottom: 10 }}>⚠️ Kolizja wizyt</h3>
            <p style={{ fontSize: 14, marginBottom: 10 }}>Ta wizyta nakłada się z inną wizytą tego pracownika.</p>
            <p style={{ fontSize: 13, color: "#555" }}>Czy chcesz mimo to zapisać zmianę?</p>

            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setConflictModal({ visible: false, retryAction: null })}
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


		{timeOffModalOpen && selectedTimeOff && (
  <TimeOffModal
    open={timeOffModalOpen}
    onClose={() => setTimeOffModalOpen(false)}
    timeOff={selectedTimeOff}
    onUpdated={async () => {
      setTimeOffModalOpen(false);
      await handleModalUpdated(); // odśwież kalendarz
    }}
  />
)}

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
    </DndProvider>
  );
}
