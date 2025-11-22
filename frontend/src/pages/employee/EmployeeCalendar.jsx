// EmployeeCalendar.jsx
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { MultiBackend, TouchTransition, MouseTransition } from "dnd-multi-backend";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import axios from "axios";
import { useAuth } from "../../components/AuthProvider";
import NewAppointmentModal from "../../components/NewAppointmentModal";

import AppointmentModal from "../../components/AppointmentModal";
import TimeOffModal from "../../components/TimeOffModal";
import { useNavigate } from "react-router-dom";

import { socket } from "../../socket";


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
      transition: TouchTransition
    }
  ]
};

/* ---------- utility helpers ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
};
const minutesToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(Math.floor(m % 60))}`;
const formatHHMM = (timeStr) => (timeStr ? timeStr.split(":").slice(0, 2).join(":") : "");
const formatTime = (t) => (t ? t.substring(0, 5) : "");
const snap5 = (min) => Math.round(min / 5) * 5;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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
// 🎨 Stała lista wyraźnych pastelowych kolorów z przezroczystością
const pastelPalette = [
  "hsla(0, 70%, 70%, 0.50)",    // czerwony pastelowy
  "hsla(23, 75%, 70%, 0.50)",   // pomarańczowy
  "hsla(140, 45%, 65%, 0.50)",  // zielony
  "hsla(200, 55%, 70%, 0.50)",  // niebieski
  "hsla(265, 60%, 72%, 0.50)",  // fiolet
  "hsla(325, 55%, 72%, 0.50)",  // róż
];

// 🎨 Funkcja przypisuje kolor "deterministycznie" — ten sam kolor dla tej samej usługi
function stringToPastelColor(str) {
  if (!str) return pastelPalette[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % pastelPalette.length;
  return pastelPalette[index];
}



/* ---------- DraggableEvent (bez zmian logicznych) ---------- */
function DraggableEvent({ appointment, children, isEditing, onSelect, onEnterEditMode, resizing }) {
  const [dragEnabled, setDragEnabled] = useState(false);
  const holdTimer = useRef(null);

  const hasHeld = useRef(false);
  const moved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: ItemTypes.APPOINTMENT,
      item: { ...appointment, dragMode: true },
      canDrag: () => dragEnabled && isEditing && !resizing.current,
      collect: (monitor) => ({ isDragging: monitor.isDragging() })
    }),
    [dragEnabled, isEditing, resizing.current]
  );

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const clearGlobalListeners = useRef(() => {});

  const handlePointerDown = (e) => {
    // żeby nie bąbelkowało wyżej
    e.stopPropagation();

    hasHeld.current = false;
    moved.current = false;

    const x = e.clientX;
    const y = e.clientY;
    startPos.current = { x, y };

    clearTimeout(holdTimer.current);

    // 🔥 USTAWIAMY LONG-PRESS
    holdTimer.current = setTimeout(() => {
      // jeśli w międzyczasie był ruch => nie wchodzi w tryb edycji
      if (moved.current || resizing.current) return;

      hasHeld.current = true;
      setDragEnabled(true);
      onEnterEditMode(appointment.id);
    }, 1900);

    // 🔥 GLOBALNE LISTENERY – łapią scroll i puszczenie palca
    const onMove = (ev) => {
      const mx = ev.clientX;
      const my = ev.clientY;

      const dx = Math.abs(mx - startPos.current.x);
      const dy = Math.abs(my - startPos.current.y);

      // JEŚLI PALCEM RUSZĘ (scroll, przesunięcie) → anuluj long-press
      if (dx > 5 || dy > 5) {
        moved.current = true;
        clearTimeout(holdTimer.current);
        removeListeners();
      }
    };

    const onUpOrCancel = (ev) => {
      removeListeners();
      clearTimeout(holdTimer.current);

      // jeśli long-press się odpalił → nic, zostajemy w trybie edycji
      if (hasHeld.current) return;

      // jeśli nie było ruchu → normalny click otwiera modal
      if (!moved.current) {
        onSelect(appointment);
      }
    };

    const removeListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUpOrCancel);
      window.removeEventListener("pointercancel", onUpOrCancel);
    };

    clearGlobalListeners.current = removeListeners;

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUpOrCancel, { passive: true });
    window.addEventListener("pointercancel", onUpOrCancel, { passive: true });
  };

  // na wszelki wypadek – posprzątaj przy unmount
  useEffect(() => {
    return () => {
      clearTimeout(holdTimer.current);
      clearGlobalListeners.current?.();
    };
  }, []);

  return (
    <div
      ref={drag}
      onPointerDown={handlePointerDown}
      style={{
        touchAction: isEditing ? "none" : "pan-y",
        cursor: dragEnabled && !resizing.current ? "grabbing" : "pointer",
        opacity: isDragging ? 0.6 : 1,
        userSelect: "none"
      }}
    >
      {children}
    </div>
  );
}


/* ---------- EditableTimeOff (bez zmian logicznych) ---------- */
function EditableTimeOff({ off, employee_id, children, isEditing, onEnterEditMode, onSelect, resizing }) {
  const holdTimer = useRef(null);

  
  const pointerDownTime = useRef(0);
  const moved = useRef(false);
  const pointerDownPos = useRef(null);   // ← DODAJ TO TUTAJ

  const held = useRef(false);

  const handlePointerDown = (e) => {
  console.log("🔵 DOWN on", appointment.id, "target:", e.target);

  e.stopPropagation();
  if (e.pointerId) e.target.setPointerCapture(e.pointerId);

  pointerUpFired.current = false; // <-- DODANE
  pointerDownTime.current = performance.now();
  hasHeld.current = false;
  moved.current = false;

  clearTimeout(holdTimer.current);

  holdTimer.current = setTimeout(() => {
    if (pointerUpFired.current) return; // <-- KLUCZOWE!
    console.log("🟢 LONG PRESS TRIGGER", appointment.id);
    hasHeld.current = true;
    setDragEnabled(true);
    onEnterEditMode(appointment.id);
  }, 1900);
};

  const handlePointerMove = (e) => {
  if (hasHeld.current) return;

  const touch = e.touches?.[0];
  if (!touch) return;

  const x = touch.clientX;
  const y = touch.clientY;

  if (!moved.current && pointerDownPos.current == null) {
    pointerDownPos.current = { x, y };
    return;
  }

  const dx = Math.abs(x - pointerDownPos.current.x);
  const dy = Math.abs(y - pointerDownPos.current.y);

  // 🔥 scroll = anuluj long-press
  if (dx > 10 || dy > 10) {
    moved.current = true;
    clearTimeout(holdTimer.current);
  }
};


  const handlePointerUp = (e) => {
    clearTimeout(holdTimer.current);
    if (resizing.current) return;
    const pressTime = performance.now() - pointerDownTime.current;
    if (!moved.current && !held.current && pressTime < 200) {
      onSelect(off);
      return;
    }
    if (held.current) return;
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        touchAction: isEditing ? "none" : "pan-y",
        userSelect: "none",
        position: "absolute",
        zIndex: isEditing ? 999 : 5
      }}
    >
      {children}
    </div>
  );
}

/* ---------- DroppableTimeGrid ---------- */
function DroppableTimeGrid({
  day,
  employee,
  onDrop,
  currentDate,
  dayStartMin,
  dayEndMin,
  HOUR_HEIGHT,
  nowMin,
  children
}) {


  const containerRef = useRef(null);
  const [dragLinePos, setDragLinePos] = useState(null);
  const [dragTime, setDragTime] = useState(null);
  const [shadowEvent, setShadowEvent] = useState(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const SNAP_THRESHOLD_MINUTES = 1;

  const getMinutesFromPageY = (pageY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return dayStartMin;
    const topOnPage = rect.top + window.scrollY;
    const offsetY = pageY - topOnPage;
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
      canDrop: () => true,
      hover: (item, monitor) => {
        if (!monitor.canDrop()) return;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const pageY = clientOffset.y + window.scrollY;
        const currentMinutesRaw = getMinutesFromPageY(pageY);
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
        boundedStart = snap5(boundedStart);
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
          height: heightPx
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
        const currentMinutesRaw = getMinutesFromPageY(pageY);
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
        const dropStart = snap5(boundedStart);
        const dropEnd = dropStart + duration;

        if (item.dragMode !== true && employee?.working_hours) {
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
          dragMode: true
        });
      },
      collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() })
    }),
    [employee?.day_off, employee?.employee_id, employee?.appointments, dayStartMin, dayEndMin, HOUR_HEIGHT]
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
  className="absolute left-1 right-1 flex items-center justify-center rounded-xl pointer-events-none text-xs font-semibold"
  style={{
    top: 0,
    height: `${((timeToMinutes(formatHHMM(employee.working_hours.open)) - dayStartMin) / 60) * HOUR_HEIGHT}px`,
    background:
      "repeating-linear-gradient(135deg, rgba(180,180,180,0.10) 0px, rgba(180,180,180,0.10) 6px, rgba(180,180,180,0.18) 6px, rgba(180,180,180,0.18) 12px)",
    border: "1px solid rgba(200,200,200,0.25)",
    color: "rgba(210,210,210,0.75)",
    borderRadius: 12,
   
  }}
>
  Poza godzinami pracy
</div>

          )}
          {timeToMinutes(formatHHMM(employee.working_hours.close)) < dayEndMin && (
            <div
  className="absolute left-1 right-1 flex items-center justify-center rounded-xl pointer-events-none text-xs font-semibold"
  style={{
    bottom: 0,
    height: `${((dayEndMin - timeToMinutes(formatHHMM(employee.working_hours.close))) / 60) * HOUR_HEIGHT}px`,
    background:
      "repeating-linear-gradient(135deg, rgba(180,180,180,0.10) 0px, rgba(180,180,180,0.10) 6px, rgba(180,180,180,0.18) 6px, rgba(180,180,180,0.18) 12px)",
    border: "1px solid rgba(200,200,200,0.25)",
    color: "rgba(210,210,210,0.75)",
    borderRadius: 12,
   
  }}
>
  Poza godzinami pracy
</div>

          )}
        </>
      )}

      {employee?.day_off && (
  <div
    className="absolute inset-0 flex items-center justify-center pointer-events-none"
    style={{
      zIndex: 2,
      background: "repeating-linear-gradient(135deg, rgba(150,150,150,0.16) 0px, rgba(150,150,150,0.16) 6px, rgba(150,150,150,0.23) 6px, rgba(150,150,150,0.23) 12px)",
      border: "1px solid rgba(180,180,180,0.45)",
      
      
      color: "rgba(210,210,210,0.9)",
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: 0.4,
      backdropFilter: "blur(2px)",
      borderRadius: 12
    }}
  >
    💤 Dzień wolny
  </div>
)}

    

      {children}
{/* LINIA „TERAZ” */}
{nowMin !== null &&
  nowMin >= dayStartMin &&
  nowMin <= dayEndMin && (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: ((nowMin - dayStartMin) / 60) * HOUR_HEIGHT,
        zIndex: 150,
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          borderTop: "2px solid #ff4444",
          position: "absolute",
          left: 0,
          right: 0
        }}
      />
     <div
  style={{
    position: "absolute",
    left: "50%",
    top: -12,
    transform: "translateX(-50%)",
    background: "#ff4444",
    color: "white",
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 8,
    fontWeight: 700,
    whiteSpace: "nowrap",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
  }}
>
  {`${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(
    nowMin % 60
  ).padStart(2, "0")}`}
</div>

    </div>
)}

      {dragLinePos !== null && (
        <div
          className={`absolute left-0 right-0 pointer-events-none transition-transform duration-200`}
          style={{
            top: `${dragLinePos}px`,
            zIndex: 200
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              borderTop: isSnapped ? "3px solid rgba(229,91,16,0.95)" : "2px dashed rgba(229,91,16,0.9)",
              pointerEvents: "none"
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
              zIndex: 201
            }}
          >
            {dragTime}
          </div>
        </div>
      )}

      {shadowEvent && (
        <div
          className="absolute left-1 right-1 rounded-xl pointer-events-none"
          style={{
            top: `${shadowEvent.top}px`,
            height: `${shadowEvent.height}px`,
            background: stringToPastelColor(shadowEvent.service_name),
            opacity: 0.8,
            zIndex: 100
          }}
        >
          <div className="overflow-hidden" style={{ lineHeight: "0.9" }}>
            <div className="font-semibold text-sm mb-0.5" style={{ lineHeight: "0.9" }}>
              {shadowEvent.start_time} - {shadowEvent.end_time}
            </div>
            <div className="text-sm mb-0" style={{ lineHeight: "0.9" }}>
              {shadowEvent.client_name}
            </div>
            <div className="text-xs opacity-80 -mt-1" style={{ lineHeight: "0.9" }}>
              {shadowEvent.service_name}
              {shadowEvent.addons && shadowEvent.addons.trim() !== "" && <span> + {shadowEvent.addons}</span>}
            </div>
          </div>
        </div>
      )}
	  
    </div>
  );
}
/* ---------- Main component EmployeeCalendar (przerobiony na Tailwind + dark mode) ---------- */
export default function EmployeeCalendar() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;

  // Theme management (class-based, like w Twoim Login)
    const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");



    useEffect(() => {
        const dark = theme === "dark";

        const bg = dark ? "#0f0f10" : "#f9fafb";
        const color = dark ? "#ffffff" : "#111827";

        document.documentElement.classList.toggle("dark", dark);
        document.body.style.background = bg;
        document.body.style.color = color;

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", bg);

    }, [theme]);

    useEffect(() => {
        const handler = () => {
            setTheme(localStorage.getItem("theme") || "dark");
        };

        window.addEventListener("themeChanged", handler);

        return () => window.removeEventListener("themeChanged", handler);
    }, []);

  // dynamic styles object (for inline fallbacks & dynamic elements)
    const styles = useMemo(() => {
        const dark = theme === "dark";
        return {
            bgMain: dark ? "#0f0f10" : "#f9fafb",
            bgPanel: dark ? "#0b0b0c" : "#ffffff",
            panelBorder: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            text: dark ? "#ffffff" : "#111827",
            subtext: dark ? "#9ca3af" : "#6b7280",
            mutedBg: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"
        };
    }, [theme]);



  const [payload, setPayload] = useState(() => {
  const cached = localStorage.getItem("calendar_cache");
  if (cached) {
    console.log("⚡ Wczytuję kalendarz z cache (instant visible)");
    return JSON.parse(cached);
  }
  return { employees: [] };
});


useEffect(() => {
  if (payload?.employees?.length) {
    console.log("💾 Zapisuję kalendarz do cache");
    localStorage.setItem("calendar_cache", JSON.stringify(payload));
  }
}, [payload]);


  const resizing = useRef(false);
  const pointerDownTime = useRef(0);
  const holdTimeout = useRef(null);
  // global long-press cancel hook
const cancelAllLongPress = useRef(() => {});


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
  // 🔥 live timestamp for current time indicator
const [nowMin, setNowMin] = useState(null);

  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);

  const [conflictModal, setConflictModal] = useState({ visible: false, retryAction: null });
  const [editingEventId, setEditingEventId] = useState(null);

  axios.interceptors.request.use((config) => {
    if (config.method === "get") {
      config.params = config.params || {};
      config.params._t = Date.now(); // anty-cache
      config.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
      config.headers["Pragma"] = "no-cache";
      config.headers["Expires"] = "0";
    }
    return config;
  });

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
        Expires: "0"
      }
    };
    return axios.get(url, mergedOptions);
  };

  // disable body scroll while resizing / editing
  useEffect(() => {
    if (resizing.current || editingEventId !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editingEventId]);

  const calendarRange = useMemo(() => {
  let start = defaultDayStart;
  let end = defaultDayEnd;

  if (payload?.employees?.length) {
    const times = [];

    for (const emp of payload.employees) {
      // 1. GODZINY PRACY
      if (emp.working_hours && !emp.day_off) {
        if (emp.working_hours.open)
          times.push(timeToMinutes(formatHHMM(emp.working_hours.open)));

        if (emp.working_hours.close)
          times.push(timeToMinutes(formatHHMM(emp.working_hours.close)));
      }

      // 2. TERMINEK — WIZYTY
      if (emp.appointments?.length) {
        emp.appointments.forEach((a) => {
          times.push(timeToMinutes(a.start_time));
          times.push(timeToMinutes(a.end_time));
        });
      }

      // 3. BLOKADY
      if (emp.time_off?.length) {
        emp.time_off.forEach((t) => {
          times.push(timeToMinutes(t.start_time));
          times.push(timeToMinutes(t.end_time));
        });
      }
    }

    // Jeśli nie ma nic sensownego – fallback na default
    const validTimes = times.filter((x) => !isNaN(x) && x >= 0 && x <= 24 * 60);

    if (validTimes.length > 0) {
      start = Math.min(...validTimes);
      end = Math.max(...validTimes);

      // minimalna wysokość
      if (end - start < 3 * 60) {
        end = start + 3 * 60;
      }
    }
  }

  return { dayStartMin: start, dayEndMin: end, HOUR_HEIGHT };
}, [payload.employees]);


  useEffect(() => {
    const fetchCalendar = async () => {
  console.log("🔄 pobieram kalendarz...");
  try {
       if (firebaseUser === undefined) {
  console.log("⏳ Firebase jeszcze nie odpowiedział – skip fetch");
  return;
}

if (firebaseUser === null) {
  console.log("❌ User wylogowany – skip fetch");
  return;
}

        const token = await firebaseUser.getIdToken?.();
        if (!token) return;
        const res = await axios.get(`${backendBase}/api/calendar/shared`, {
          headers: { Authorization: `Bearer ${token}` },
            params: {
                date: formatDateLocal(activeDay),
                salon_id: localStorage.getItem("selected_salon_id")},
            
        });
        const normalized = {
          ...res.data,
          employees: res.data.employees.map((e) => ({
            ...e,
            day_off: Boolean(e.day_off || e.is_day_off),
            time_off: e.time_off ?? [],
              appointments: e.appointments ?? []


          }))
        };
        setPayload(normalized);
      } catch (err) {
        console.error("❌ Błąd pobierania kalendarza:", err);
      }
    };
    if (firebaseUser) fetchCalendar();
  }, [firebaseUser, activeDay, backendBase]);

const refreshCalendar = useCallback(async () => {
  try {
    const user = firebaseUser;
    if (!user) return;

    const token = await user.getIdToken();
    if (!token) return;

      const res = await axios.get(`${backendBase}/api/calendar/shared`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
              date: formatDateLocal(activeDayRef.current),
              salon_id: Number(localStorage.getItem("selected_salon_id")),
              _t: Date.now()
          },
      });


    const normalized = {
      ...res.data,
      employees: res.data.employees.map((e) => ({
        ...e,
        day_off: Boolean(e.day_off || e.is_day_off),
        time_off: e.time_off ?? [],
          appointments: e.appointments ?? []


      }))
    };

    setPayload(normalized);
    console.log("🔄 Calendar refreshed");

  } catch (err) {
    console.error("❌ refreshCalendar error", err);
  }
}, [firebaseUser, backendBase]);

// 2️⃣ TU WSTAWIASZ TEN useEffect (onWake)
useEffect(() => {
  const onWake = () => {
    console.log("📱 Powrót z tła — odświeżam kalendarz i łącze socket");

    if (socket.disconnected) {
      console.log("🔌 Socket reconnect...");
      socket.connect();
    }

    refreshCalendar();
  };

  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  window.addEventListener("pageshow", onWake);

  return () => {
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("focus", onWake);
    window.removeEventListener("pageshow", onWake);
  };
}, [refreshCalendar]);

// ⏱️ Aktualizator czasu "TERAZ"
useEffect(() => {
  const update = () => {
    const now = new Date();
    const sameDay =
      activeDay.toDateString() === new Date().toDateString();

    if (!sameDay) {
      setNowMin(null);
      return;
    }

    const mins = now.getHours() * 60 + now.getMinutes();
    setNowMin(mins);
  };

  update(); // jednorazowo
  const t = setInterval(update, 30 * 1000);
  return () => clearInterval(t);
}, [activeDay]);


// 🔥 dynamiczne przesuwanie wskaźnika czasu podczas scrollowania
useEffect(() => {
  const area = document.getElementById("calendar-scroll-area");
  if (!area) return;

  const onScroll = () => {
    const rect = area.getBoundingClientRect();
    const centerY = window.innerHeight / 2;
    const offsetFromTop = centerY - rect.top;
    const minutes = Math.round(offsetFromTop / (HOUR_HEIGHT / 60));

    if (minutes >= 0 && minutes <= 24 * 60) {
      setNowMin(minutes);
    }
  };

  area.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    area.removeEventListener("scroll", onScroll);
  };
}, [HOUR_HEIGHT]);


// 📜 Scrolluj automatycznie do aktualnej godziny
useEffect(() => {
  if (nowMin === null) return;
  if (!payload?.employees?.length) return;

  // pierwszy time-grid na stronie
  const grid = document.querySelector(".time-grid");
  if (!grid) return;

  const relative = nowMin - calendarRange.dayStartMin;
  if (relative < 0) return;
  if (relative > calendarRange.dayEndMin) return;

  const px = (relative / 60) * HOUR_HEIGHT - window.innerHeight / 2;

  grid.parentElement.parentElement.parentElement.scrollTo({
    top: px,
    behavior: "smooth"
  });
}, [nowMin, calendarRange]);



    useEffect(() => {
        if (!firebaseUser) return;

        const handler = async () => {
            try {
                const token = await firebaseUser.getIdToken?.();
                if (!token) return;

                const selectedSalonId = Number(localStorage.getItem("selected_salon_id"));

                const res = await axios.get(`${backendBase}/api/calendar/shared`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        date: formatDateLocal(activeDayRef.current),
                        salon_id: selectedSalonId
                    }
                });


                const normalized = {
                    ...res.data,
                    employees: res.data.employees.map((e) => ({
                        ...e,
                        day_off: Boolean(e.day_off || e.is_day_off),
                        time_off: e.time_off ?? [],
                        appointments: e.appointments ?? []
                    }))
                };

                setPayload(normalized);
                console.log("🔁 live socket refresh");
            } catch (err) {
                console.error("❌ socket refresh error", err);
            }
        };

        socket.on("calendar_updated", handler);
        return () => socket.off("calendar_updated", handler);
    }, [firebaseUser, backendBase]);









  useEffect(() => {
    const logInterval = setInterval(() => {
      console.log(
        "🕓 [LOG] Aktualny activeDay:",
        formatDateLocal(activeDay),
        "(",
        activeDay.toLocaleDateString("pl-PL", { weekday: "long" }),
        ")"
      );
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






    useEffect(() => {
        let startX = 0;
        let startY = 0;
        let startTime = 0;

        let isTouch = false;
        let isScrollingVertically = false;

        const distanceThreshold = 200;   // OGROMNY dystans
        const verticalBlock = 30;        // mały ruch w pionie kasuje swipe
        const speedThreshold = 1.0;      // bardzo szybki ruch ("flick")

        function onTouchStart(e) {
            if (editingEventId !== null || resizing.current) return;

            isTouch = true;
            isScrollingVertically = false;

            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = performance.now();
        }

        function onTouchMove(e) {
            if (!isTouch) return;

            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            if (Math.abs(dy) > verticalBlock) {
                isScrollingVertically = true;
                return;
            }

            if (isScrollingVertically) return;

            const timeElapsed = performance.now() - startTime;
            const speed = Math.abs(dx) / timeElapsed;

            const strongSwipe =
                Math.abs(dx) > distanceThreshold || speed > speedThreshold;

            if (!strongSwipe) return;

            if (dx < 0) {
                setActiveDay(prev => {
                    const d = new Date(prev);
                    d.setDate(prev.getDate() + 1);
                    return d;
                });
            } else {
                setActiveDay(prev => {
                    const d = new Date(prev);
                    d.setDate(prev.getDate() - 1);
                    return d;
                });
            }

            isTouch = false;
        }

        function onTouchEnd() {
            isTouch = false;
        }

        const area = document.getElementById("employee-calendar-page");
        if (!area) return;

        area.addEventListener("touchstart", onTouchStart, { passive: true });
        area.addEventListener("touchmove", onTouchMove, { passive: true });
        area.addEventListener("touchend", onTouchEnd, { passive: true });

        return () => {
            area.removeEventListener("touchstart", onTouchStart);
            area.removeEventListener("touchmove", onTouchMove);
            area.removeEventListener("touchend", onTouchEnd);
        };
    }, [editingEventId]);









  const handleDrop = useCallback(
    async ({ id, fromEmployeeId, toEmployeeId, start_time, end_time, date, dragMode = false }) => {
      console.group("🎯 DROP EVENT — handleDrop()");
      console.log("ID:", id);
      console.log("FROM EMP:", fromEmployeeId);
      console.log("TO EMP:", toEmployeeId);
      console.log("DATE:", date);
      console.log("START:", start_time);
      console.log("END:", end_time);
      console.groupEnd();
      try {
        if (!firebaseUser) {
          console.warn("⚠️ Brak zalogowanego użytkownika — przerwano handleDrop");
          return;
        }
        const token = await firebaseUser.getIdToken();
        const targetEmp = payload.employees.find((e) => e.employee_id === toEmployeeId);
        if (!dragMode && targetEmp?.day_off === true) {
          alert("❌ Ten pracownik ma dziś dzień wolny!");
          return;
        }
        if (!dragMode && targetEmp?.working_hours) {
          const wh = targetEmp.working_hours;
          const open = wh.open;
          const close = wh.close;
          if (start_time < open || end_time > close) {
            alert(`⛔ Poza godzinami pracy (${open} - ${close})`);
            return;
          }
        }
        const sendDate = date || formatDateLocal(activeDayRef.current || activeDay);
        await axios.put(`${backendBase}/api/calendar/shared/${id}`, {
          employee_id: toEmployeeId,
          date: sendDate,
          start_time,
          end_time
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

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
          setConflictModal({ visible: true, retryAction: () => handleDropForce({ id, fromEmployeeId, toEmployeeId, start_time, end_time }) });
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
        await axios.put(`${backendBase}/api/calendar/shared/${id}`, {
          employee_id: toEmployeeId,
          date,
          start_time,
          end_time,
          force: true
        }, { headers: { Authorization: `Bearer ${token}` } });
        setConflictModal({ visible: false, retryAction: null });
        alert("✅ Zmieniono mimo kolizji.");
      } catch (error) {
        console.error("❌ Błąd wymuszonej zmiany:", error);
        alert("Nie udało się zapisać nawet z wymuszeniem.");
      }
    }, [firebaseUser, backendBase]
  );

  /* ---------- resize helpers ---------- */
  const onResizeLive = useCallback(({ id, employee_id, start_time, end_time }) => {
    setPayload((prev) => {
      const employees = prev.employees.map((e) => ({ ...e, appointments: [...(e.appointments || [])] }));
      const emp = employees.find((e) => e.employee_id === employee_id);
      if (!emp) return prev;
      const app = emp.appointments.find((a) => a.id === id);
      if (!app) return prev;
      app.start_time = start_time;
      app.end_time = end_time;
      return { ...prev, employees };
    });
  }, []);

  const onResizeLive_TimeOff = useCallback(({ id, employee_id, start_time, end_time }) => {
    setPayload((prev) => {
      const employees = prev.employees.map((e) => ({ ...e, time_off: [...(e.time_off || [])] }));
      const emp = employees.find((e) => e.employee_id === employee_id);
      if (!emp) return prev;
      const off = emp.time_off.find((t) => t.id === id);
      if (!off) return prev;
      off.start_time = start_time;
      off.end_time = end_time;
      return { ...prev, employees };
    });
  }, []);

  const onResizeEnd = useCallback(async (id) => {
    const emp = payload.employees.find((e) => e.appointments.some((a) => a.id === id));
    if (!emp) {
      setEditingEventId(null);
      return;
    }
    const ap = emp.appointments.find((a) => a.id === id);
    if (!ap) {
      setEditingEventId(null);
      return;
    }
    await handleDrop({
      id,
      fromEmployeeId: emp.employee_id,
      toEmployeeId: emp.employee_id,
      start_time: ap.start_time,
      end_time: ap.end_time,
      date: formatDateLocal(activeDay),
      dragMode: true
    });
    setEditingEventId(null);
  }, [payload, handleDrop, activeDay]);

  const onResizeEnd_TimeOff = useCallback(async (id) => {
    const fixDate = (value) => {
      if (!value) return "";
      if (typeof value === "string" && value.length === 10) return value;
      try {
        const d = new Date(value);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } catch {
        return value;
      }
    };
    const emp = payload.employees.find((e) => e.time_off.some((t) => t.id === id));
    if (!emp) {
      resizing.current = false;
      return;
    }
    const off = emp.time_off.find((t) => t.id === id);
    if (!off) {
      resizing.current = false;
      return;
    }
    try {
      const token = await firebaseUser.getIdToken();
      const payloadToSend = {
        employee_id: emp.employee_id,
        date: fixDate(off.date),
        start_time: off.start_time,
        end_time: off.end_time,
        reason: off.reason || null
      };
      await axios.put(`${backendBase}/api/schedule/time-off/${id}`, payloadToSend, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.error("❌ Błąd zapisu time_off:", err.response?.data || err);
      alert(err.response?.data?.error || "Błąd podczas zapisu blokady czasu.");
    }
    resizing.current = false;
  }, [payload, firebaseUser, backendBase]);

  /* ---------- resize start (pointer based) ---------- */
  const handleResizeStart = (item, direction, e, type = "appointment") => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.overflow = "hidden";
    const isAppointment = type === "appointment";
    const isTimeOff = type === "time_off";
    const startY = e.clientY || e.touches?.[0]?.clientY;
    const startMin = timeToMinutes(item.start_time);
    const endMin = timeToMinutes(item.end_time);

    const onMove = (ev) => {
      const y = ev.clientY || ev.touches?.[0]?.clientY;
      const deltaPx = y - startY;
      const minuteDeltaRaw = (deltaPx / HOUR_HEIGHT) * 60;
      const delta = Math.round(minuteDeltaRaw / 5) * 5;
      let newStart = startMin;
      let newEnd = endMin;
      if (direction === "top") {
        newStart = startMin + delta;
        if (newStart > endMin - 5) newStart = endMin - 5;
      } else {
        newEnd = endMin + delta;
        if (newEnd <= startMin + 5) newEnd = startMin + 5;
      }
      if (isAppointment) {
        onResizeLive({ id: item.id, employee_id: item.employee_id, start_time: minutesToHHMM(newStart), end_time: minutesToHHMM(newEnd) });
      }
      if (isTimeOff) {
        onResizeLive_TimeOff({ id: item.id, employee_id: item.employee_id, start_time: minutesToHHMM(newStart), end_time: minutesToHHMM(newEnd) });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.overflow = "";
      if (isAppointment) onResizeEnd(item.id);
      if (isTimeOff) onResizeEnd_TimeOff(item.id);
      resizing.current = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
  };

  /* ---------- UI helpers ---------- */
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
          params: { date: formatDateLocal(activeDay), salon_id: localStorage.getItem("selected_salon_id") },
          
      });
      const normalized = {
        ...res.data,
        employees: res.data.employees.map((e) => ({
          ...e,
          day_off: Boolean(e.day_off || e.is_day_off),
          time_off: e.time_off ?? [],
            appointments: e.appointments ?? []


        }))
      };
      setPayload(normalized);
    } catch (err) {
      console.error("❌ Błąd odświeżenia po edycji:", err);
    }
  };

  /* ---------- render ---------- */
  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
<style>{`
  /* 🔥 UKRYCIE WSZYSTKICH scroll barów, ale bez blokowania samego scrolla */
  #employee-calendar-page * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  #employee-calendar-page *::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
    background: transparent !important;
  }

  /* 🔥 WYŁĄCZENIE zaznaczania tekstu */
  #employee-calendar-page {
    user-select: none !important;
    -webkit-user-select: none !important;
    -ms-user-select: none !important;
  }

  /* 🔥 Safari: wyłączamy overscroll TYLKO na elementach poziomo przewijanych */
  #employee-calendar-page .day-strip,
  #employee-calendar-page .employee-col {
    overscroll-behavior-x: contain !important;
  }

  /* 🔥 ALE NIE blokujemy vertical scrolla całej strony */
  #employee-calendar-page {
    overscroll-behavior-y: auto !important;
  }
`}</style>


     <div
  id="employee-calendar-page"
  className="min-h-screen relative py-4"

        style={{ width: "100vw", maxWidth: "100vw", overflowX: "hidden", background: styles.bgMain, color: styles.text }}
        onClick={(e) => {
  // 🔥 jeśli klik przyszedł po long-press — NIE resetuj
  if (editingEventId !== null) {
    e.stopPropagation();
    return;
  }
}}


      >
        {/* Header */}
        <div className="sticky top-0 z-40 pb-2" style={{ background: styles.bgMain }}>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() =>
                setActiveDay((prev) => {
                  const newDate = new Date(prev);
                  newDate.setMonth(prev.getMonth() - 1);
                  newDate.setDate(1);
                  return newDate;
                })
              }
              className="p-2 rounded-xl hover:bg-white/10 transition"
              aria-label="Poprzedni miesiąc"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="text-lg font-extrabold">
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
              className="p-2 rounded-xl hover:bg-white/10 transition"
              aria-label="Następny miesiąc"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* day strip */}
          <div
            ref={dayStripRef}
            className="day-strip flex overflow-x-auto no-scrollbar mt-2 mb-1 px-2"
            style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth" }}
          >
            {(() => {
              const year = activeDay.getFullYear();
              const month = activeDay.getMonth();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              return Array.from({ length: daysInMonth }).map((_, i) => {
                const mm = String(month + 1).padStart(2, "0");
                const dd = String(i + 1).padStart(2, "0");
                const d = new Date(`${year}-${mm}-${dd}T00:00:00`);
                const isActive = d.toDateString() === activeDay.toDateString();
                const dayName = weekDays[(d.getDay() + 6) % 7];
                return (
                  <div
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDay(d);
                    }}
                    className={`day-pill flex flex-col items-center p-2 rounded-xl cursor-pointer mr-2 scroll-mx-2 ${isActive ? "active" : ""}`}
                    style={{
                      scrollSnapAlign: "center",
                      flex: "0 0 auto",
                      background: isActive ? "rgba(212, 111, 39, 0.33)" : "transparent",
                      color: isActive ? "#E55B10" : styles.text,
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: isActive ? "0 4px 14px rgba(14,20,30,0.06)" : undefined
                    }}
                    aria-current={isActive ? "date" : undefined}
                  >
                    <div className="text-xs">{dayName}</div>
                    <div className="font-bold">{d.getDate()}</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Body */}
        {/* Body */}
<div
  id="calendar-scroll-area"
  className="flex"
  style={{
    gap: 10,
    padding: "10px 4px",
    overflowY: "auto",
    overflowX: "hidden",
    position: "relative"
  }}
>


          {/* Times column */}
          <div className="flex-shrink-0" style={{ width: 48, marginTop: 12 }}>
            <div className="text-gray-500 font-semibold text-sm">
              {(() => {
                const hoursCount = Math.ceil((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60);
                return Array.from({ length: hoursCount + 1 }).map((_, i) => (
                  <div key={i} className="flex items-center" style={{ height: HOUR_HEIGHT }}>
                    {pad2(Math.floor(calendarRange.dayStartMin / 60) + i)}:00
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Employee columns */}
          <div className="flex gap-3 overflow-x-auto w-full scroll-smooth">
            {payload.employees
              .filter((emp) => emp.is_active)
              .map((emp) => (
                <div
                  key={emp.employee_id}
                  className="employee-col rounded-xl relative"
                  style={{
                    flex: (() => {
                      const activeCount = payload.employees.filter((e) => e.is_active).length;
                      if (activeCount === 1) return "0 0 100%";
                      return "0 0 50%";
                    })(),
                    scrollSnapAlign: "start",
                    background: "transparent"
                  }}
                >
                  {/* Employee header */}
                <div
  className="flex items-center gap-3 p-2 border-b"
  style={{
    borderColor: styles.panelBorder,
    height: 64,         // ⭐ KLUCZOWE — STAŁA wysokość
    minHeight: 64,
    maxHeight: 64,
    overflow: "hidden"  // opcjonalnie
  }}
>

                    <img
                      src={emp.employee_image_url ? `${backendBase}/${emp.employee_image_url}` : "/static/placeholder-avatar.png"}
                      alt={emp.employee_name}
                      className="w-8 h-8 rounded-full object-cover shadow-sm"
                      onError={(e) => {
                        e.currentTarget.src = "/static/placeholder-avatar.png";
                      }}
                    />
                    <div>
                      <div
                        onClick={() => navigate(`/employee/${emp.employee_id}/calendar-month`)}
                        className="font-semibold underline cursor-pointer"
                        style={{ color: styles.text }}
                      >
                        {emp.employee_name}
                      </div>
                      {emp.day_off ? (
                        <div className="text-sm font-semibold" style={{ color: "#EF4444" }}>
                          💤 Dzień wolny
                        </div>
                      ) : (
                        <div className="text-sm" style={{ color: styles.subtext }}>
                          {formatHHMM(emp.working_hours?.open)} - {formatHHMM(emp.working_hours?.close)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Droppable grid */}
                 <DroppableTimeGrid
  employee={emp}
  onDrop={handleDrop}
  currentDate={activeDay}
  dayStartMin={calendarRange.dayStartMin}
  dayEndMin={calendarRange.dayEndMin}
  HOUR_HEIGHT={calendarRange.HOUR_HEIGHT}
  nowMin={nowMin}
>





                    <div
                      className="time-grid"
                      style={{
                        position: "relative",
                        padding: "0 6px",
                        height: `${((calendarRange.dayEndMin - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT}px`,
                        background: "transparent"
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEventId(null);
                      }}
                    >
                      {/* time_off blocks */}
{emp.time_off &&
  emp.time_off.map((off, i) => {
    const offDate = off.date || formatDateLocal(activeDay);
    const endIso = `${offDate}T${off.end_time || "00:00"}:00`;
    const startIso = `${offDate}T${off.start_time || "00:00"}:00`;

    const start = timeToMinutes(off.start_time);
    const end = timeToMinutes(off.end_time);
    const topPx = ((start - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT;
    const heightPx = ((end - start) / 60) * HOUR_HEIGHT;

    const offId = `off-${off.id ?? i}`;

    return (
      <div
        key={offId}
        className="timeoff-block rounded-xl p-2"
        style={{
          position: "absolute",
          top: `${topPx}px`,
          left: "4px",
          right: "4px",
          height: `${heightPx}px`,
          background:
            "repeating-linear-gradient(135deg, rgba(255,110,90,0.22) 0px, rgba(255,110,90,0.22) 6px, rgba(255,110,90,0.30) 6px, rgba(255,110,90,0.30) 12px)",
          border: "1px solid rgba(255,110,90,0.6)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          color: "#b91c1c",
          zIndex: 5,
          cursor: "pointer",
          touchAction: editingEventId === offId ? "none" : "pan-y",
          userSelect: "none"
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (editingEventId === offId) {
            setEditingEventId(null);
            return;
          }
          setSelectedTimeOff({
            ...off,
            id: Number(off.id),
            employee_id: emp.employee_id,
            date: off.date ?? formatDateLocal(activeDay),
            start_time: off.start_time,
            end_time: off.end_time,
            reason: off.reason ?? ""
          });
          setTimeOffModalOpen(true);
        }}

        /* ⭐⭐ TWÓJ DZIAŁAJĄCY LONG-PRESS ⭐⭐ */
        onPointerDown={(e) => {
          e.stopPropagation();
          pointerDownTime.current = performance.now();
          holdTimeout.current = setTimeout(() => {
            setEditingEventId(offId);
          }, 250);
        }}
        onPointerUp={() => {
          clearTimeout(holdTimeout.current);
        }}
        onPointerMove={(e) => {
          if (
            Math.abs(e.movementX) > 4 ||
            Math.abs(e.movementY) > 4
          ) {
            clearTimeout(holdTimeout.current);
          }
        }}
      >
        {/* edit handles */}
       {editingEventId === offId && (
  <>
    <div
      data-resize-handle="top"
      onPointerDown={(e) => {
        e.stopPropagation();
        resizing.current = true;
        handleResizeStart(
          { ...off, employee_id: emp.employee_id, id: off.id },
          "top",
          e,
          "time_off"
        );
      }}
      style={{
        position: "absolute",
        top: -10,
        left: "50%",
        transform: "translateX(-50%)",
        width: 26,
        height: 16,
        background: "#fff",
        border: "2px solid #E55B10",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        zIndex: 20
      }}
    >
      ▲
    </div>

    <div
      data-resize-handle="bottom"
      onPointerDown={(e) => {
        e.stopPropagation();
        resizing.current = true;
        handleResizeStart(
          { ...off, employee_id: emp.employee_id, id: off.id },
          "bottom",
          e,
          "time_off"
        );
      }}
      style={{
        position: "absolute",
        bottom: -10,
        left: "50%",
        transform: "translateX(-50%)",
        width: 26,
        height: 16,
        background: "#fff",
        border: "2px solid #E55B10",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        zIndex: 20
      }}
    >
      ▼
    </div>

    {/* 🔥 POPRAWIONY OVERLAY (JAK W APPOINTMENT) */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        border: "2px dashed #E55B10",
        borderRadius: 12,
        pointerEvents: "none",   // 🔥 kluczowe
        zIndex: 998
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    />
  </>
)}


            <div className="text-[10px] font-bold leading-none">
                🔒 Blokada czasu
            </div>

            <div className="text-[11px] font-semibold leading-none">
                {formatTime(off.start_time)} – {formatTime(off.end_time)}
            </div>

            <div className="text-[9px] opacity-80 leading-none truncate">
                {off.reason || "Brak powodu"}
            </div>

      </div>
    );
  })}


                      {/* appointments render */}
                      {(() => {
                        const items = (emp.appointments || [])
                          .filter((a) => a.status !== "cancelled")
                          .map((a) => ({
                            ...a,
                            start: timeToMinutes(a.start_time),
                            end: timeToMinutes(a.end_time),
                            top: ((timeToMinutes(a.start_time) - calendarRange.dayStartMin) / 60) * HOUR_HEIGHT,
                            height: ((timeToMinutes(a.end_time) - timeToMinutes(a.start_time)) / 60) * HOUR_HEIGHT
                          }))
                          .sort((a, b) => a.start - b.start);

                        // cluster overlapping events
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
                                <DraggableEvent
                                  key={a.id}
                                  appointment={{ ...a, employee_id: emp.employee_id }}
                                  isEditing={editingEventId === a.id}
                                  resizing={resizing}
                                  onSelect={(appt) => {
                                    if (editingEventId === a.id) {
                                      setEditingEventId(null);
                                      return;
                                    }
                                    setSelectedAppointment(a);
                                    setModalOpen(true);
                                  }}
                                  onEnterEditMode={(id) => setEditingEventId(id)}
                                >
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: `${a.top}px`,
                                      height: `${a.height}px`,
                                      left: `calc(${leftPercent}% + 6px)`,
                                      width: `calc(${widthPercent}% - 10px)`,
                                      zIndex: 20 + colIndex,
                                      pointerEvents: "none"
                                    }}
                                  >
                                    {/* resize handles */}
                                    {editingEventId === a.id && (
                                      <div
                                        data-resize-handle="top"
                                        onPointerDown={(e) => {
                                          e.stopPropagation();
                                          resizing.current = true;
                                          handleResizeStart(a, "top", e, "appointment");
                                        }}
                                        style={{
                                          position: "absolute",
                                          top: -12,
                                          left: "50%",
                                          transform: "translateX(-50%)",
                                          width: 26,
                                          height: 18,
                                          background: "#fff",
                                          border: "2px solid #E55B10",
                                          borderRadius: 6,
                                          cursor: "ns-resize",
                                          zIndex: 999,
                                          pointerEvents: "all",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center"
                                        }}
                                      >
                                        <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "8px solid #E55B10" }} />
                                      </div>
                                    )}

                                    {editingEventId === a.id && (
                                      <div
                                        data-resize-handle="bottom"
                                        onPointerDown={(e) => {
                                          e.stopPropagation();
                                          resizing.current = true;
                                          handleResizeStart(a, "bottom", e, "appointment");
                                        }}
                                        style={{
                                          position: "absolute",
                                          bottom: -12,
                                          left: "50%",
                                          transform: "translateX(-50%)",
                                          width: 26,
                                          height: 18,
                                          background: "#fff",
                                          border: "2px solid #E55B10",
                                          borderRadius: 6,
                                          cursor: "ns-resize",
                                          zIndex: 999,
                                          pointerEvents: "all",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center"
                                        }}
                                      >
                                        <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #E55B10" }} />
                                      </div>
                                    )}

                                    {/* event card */}
                                    <div
                                      className="rounded-xl shadow-md"
                                      style={{
                                        position: "absolute",
                                        inset: 0,
                                        background: stringToPastelColor(a.service_name),
                                        borderRadius: "14px",
                                        padding: a.height < 40 ? "2px 4px" : "2px 10px",
                                        userSelect: "none",
                                        overflow: "hidden",
                                        pointerEvents: "all",
                                        cursor: "pointer"
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (editingEventId === a.id) {
                                          setEditingEventId(null);
                                          return;
                                        }
                                        setSelectedAppointment(a);
                                        setModalOpen(true);
                                      }}
                                    >
                                      <div className="overflow-hidden">
                                                  <div className="leading-none font-semibold text-[10px] truncate">
                                                      {formatHHMM(a.start_time)} – {formatHHMM(a.end_time)}
                                                  </div>

                                                  <div className="leading-none font-semibold text-[11px] truncate">
                                                      {a.client_name}
                                                  </div>

                                                  <div className="leading-none text-[9px] opacity-80 truncate">
                                                      {a.service_name}
                                                      {a.addons && <> + {a.addons}</>}
                                                  </div>

                                      </div>
                                    </div>

                                    {/* edit border */}
                                   {editingEventId === a.id && (
  <div
    style={{
      position: "absolute",
      inset: 0,
      border: "2px dashed #E55B10",
      borderRadius: 14,
      pointerEvents: "none",   // 🔥 KLUCZOWA LINIA
      zIndex: 998
    }}
    onPointerDown={(e) => e.stopPropagation()}   // 🔥 blokuje klik
    onPointerMove={(e) => e.stopPropagation()}
    onPointerUp={(e) => e.stopPropagation()}     // 🔥 NIE pozwala eventowi pójść wyżej
    onClick={(e) => e.stopPropagation()}         // 🔥 blokada click bubbling
  />
)}

                                  </div>
                                </DraggableEvent>
                              );
                            });
                          });
                        });

                        return render;
                      })()}
                    </div>
                  </DroppableTimeGrid>
                </div>
              ))}
          </div>
        </div>

        {/* Floating add button */}
        <div
  className="fixed right-5"
  style={{ bottom: 90, zIndex: 60 }}
  onClick={() => setNewAppointmentOpen(true)}
>
  <button className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-b from-orange-400 to-red-500 text-white shadow-xl">
    <Plus size={28} color="white" />
  </button>
</div>


        {/* conflict modal */}
        {conflictModal.visible && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.4)" }}>
            <div className="bg-white dark:bg-[#0b0b0c] rounded-xl p-6 w-[320px] text-center shadow-2xl">
              <h3 className="font-bold mb-2">⚠️ Kolizja wizyt</h3>
              <p className="text-sm mb-2">Ta wizyta nakłada się z inną wizytą tego pracownika.</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Czy chcesz mimo to zapisać zmianę?</p>
              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={() => setConflictModal({ visible: false, retryAction: null })}
                  className="px-3 py-2 rounded-md font-semibold"
                  style={{ background: "#e5e7eb" }}
                >
                  Anuluj
                </button>
                <button
                  onClick={() => conflictModal.retryAction?.()}
                  className="px-3 py-2 rounded-md font-semibold text-white"
                  style={{ background: "#ef4444" }}
                >
                  Zapisz mimo kolizji
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TimeOff modal */}
        {timeOffModalOpen && selectedTimeOff && (
          <TimeOffModal
  open={timeOffModalOpen}
  onClose={() => setTimeOffModalOpen(false)}
  timeOff={selectedTimeOff}
  onUpdated={async () => {
              setTimeOffModalOpen(false);
              await handleModalUpdated();
            }}
          />
        )}




        {/* Appointment modal */}
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
		
		
		{newAppointmentOpen && (
  <NewAppointmentModal
    open={newAppointmentOpen}
    onClose={() => setNewAppointmentOpen(false)}
    activeDay={activeDay}
    employees={payload.employees}
    onCreated={async () => {
      setNewAppointmentOpen(false);
      await refreshCalendar();
    }}
  />
)}

		
		
      </div>
    </DndProvider>
  );
}
