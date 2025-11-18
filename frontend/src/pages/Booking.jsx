import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import axios from "axios";
import { useAuth } from "../components/AuthProvider";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * BookingOptimized.jsx
 * Full smart refactor of the provided Booking component.
 * - Keeps all original features (rebook restore, lock employee, addons, localStorage, theme)
 * - Adds aggressive memoization and debouncing
 * - In-memory GET cache
 * - Cancels inflight slot requests
 * - Correctly adds addon durations to computed end time and slot queries
 *
 * Drop-in replacement for original Booking.jsx
 */

/* ----------------------------- Utilities ----------------------------- */
const debounce = (fn, ms = 250) => {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
const formatPrice = (v) => Number(v || 0).toFixed(2);
const pad = (n) => String(n).padStart(2, "0");
const formatIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const prettyDateStr = (d) =>
  d.toLocaleDateString("pl-PL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const shortName = (full) => {
  if (!full) return "";
  const parts = full.split(" ");
  const first = parts[0] || "";
  const lastInitial = parts[1] ? parts[1][0] : "";
  return `${first} ${lastInitial ? lastInitial + "." : ""}`;
};

/* ----------------------------- Small reusable hooks ----------------------------- */
function useLocalStorageJSON(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}



/* ----------------------------- Memoized Subcomponents ----------------------------- */
const EmployeeSelector = memo(function EmployeeSelector({
  employees,
  selectedEmployee,
  onSelectEmployee,
  lockEmployeeSelection,
  backendBase,
  isDark,
  PRIMARY,
  subtextClass,
}) {
  if (lockEmployeeSelection) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-3">
      <div
  onPointerDown={() => onSelectEmployee("any")}
  className="min-w-[72px] text-center cursor-pointer"
>
  <div
    className="w-16 h-16 rounded-full mx-auto mb-2 relative flex items-center justify-center"
    style={{
      background: isDark ? "#171717" : "#f2f2f2",
      border:
        selectedEmployee === "any"
          ? `3px solid ${PRIMARY}`
          : `3px solid ${isDark ? "#171717" : "#f2f2f2"}`,
      position: "relative",
    }}
  >
    <div className="text-[26px]">👤</div>

    {/* ✅ dodaj ptaszek */}
    {selectedEmployee === "any" && (
      <div
        className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full flex items-center justify-center"
        style={{
          background: PRIMARY,
          boxShadow: `0 2px 6px ${PRIMARY}66`,
        }}
      >
        <Check size={12} color="#fff" />
      </div>
    )}
  </div>

  <div
    className={`text-[12px] ${
      selectedEmployee === "any" ? "" : subtextClass
    }`}
    style={{ color: selectedEmployee === "any" ? PRIMARY : undefined }}
  >
    Dowolna
  </div>
</div>


      {employees.map((emp) => {
        const selected = selectedEmployee === emp.id;
        return (
          <div key={emp.id} className="min-w-[88px] text-center cursor-pointer" onPointerDown={() => onSelectEmployee(emp.id)}>
            <div className="relative mx-auto mb-2 w-16 h-16">
              <div
                className="absolute inset-0 rounded-full p-[3px] box-border flex items-center justify-center"
                style={{ background: `linear-gradient(180deg, ${PRIMARY}, ${PRIMARY})`, opacity: selected ? 1 : 0.3 }}
              >
                <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center`} style={{ background: isDark ? "#111" : "#fff" }}>
                  {emp.image_url ? (
                    <img src={`${backendBase}/${emp.image_url}`} alt={emp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`${isDark ? "text-white" : "text-gray-900"} text-lg`}>{emp.name ? emp.name[0].toUpperCase() : "?"}</div>
                  )}
                </div>
              </div>
              {selected && (
                <div className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: PRIMARY, boxShadow: `0 2px 6px ${PRIMARY}66` }}>
                  <Check size={12} color="#fff" />
                </div>
              )}
            </div>
            <div className={`text-[12px] ${selected ? "" : subtextClass} truncate`} style={{ color: selected ? PRIMARY : undefined }}>
              {emp.name}
            </div>
          </div>
        );
      })}
    </div>
  );
});
//tu zmieniam
const CalendarGrid = memo(function CalendarGrid({ monthDate, availableDays, date, onSelectDate, isDark, subtextClass, PRIMARY  }) {
  const buildMonthGrid = useCallback((d) => {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const startOffset = (first.getDay() + 6) % 7; // Monday start
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
  }, []);

  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate, buildMonthGrid]);
  const today = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);













  return (
    <>
      <div className="grid grid-cols-7 gap-2 mb-1">
        {["PON.", "WT.", "ŚR.", "CZW.", "PT.", "SOB.", "NIED."].map((w) => (
          <div key={w} className={`text-center text-sm ${subtextClass}`}>{w}</div>
        ))}
      </div>

      <div className="rounded-lg p-3 mb-3 bg-transparent shadow-none">
        <div className="grid grid-cols-7 gap-2 justify-items-center">
          {monthGrid.flat().map((cellDate, idx) => {
            const isCurrentMonth = cellDate.getMonth() === monthDate.getMonth();
            const isSelected = cellDate.toDateString() === date.toDateString();
            const iso = formatIsoDate(cellDate);
            const isAvailable = availableDays.includes(iso);
            const isPast = cellDate < today;
            const isClickable = isAvailable && !isPast;

            return (
              <button
                key={idx}
                onPointerDown={() => { if (!isClickable) return; onSelectDate(new Date(cellDate)); }}
                disabled={!isClickable}
                className={`w-11 h-11 rounded-full flex items-center justify-center m-[2px] transition-all duration-100 ${isClickable ? "cursor-pointer" : "opacity-25 cursor-not-allowed"}`}
                style={{ background: isSelected ? PRIMARY : "transparent", color: isSelected ? "#fff" : (isCurrentMonth ? (isDark ? "#d2d2d2" : "#111827") : (isDark ? "#666" : "#aaa")), border: "none" }}
              >
                <div className="text-sm pointer-events-none">{cellDate.getDate()}</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
});

const SlotsList = memo(function SlotsList({ slots, selectedSlot, onSelectSlot, loadingSlots, isDark, PRIMARY, subtextClass }) {
  if (loadingSlots) return <div className={`${subtextClass}`}>Ładowanie terminów…</div>;
  if (!slots.length) return <div className={`${subtextClass}`}>Brak dostępnych terminów</div>;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
      {slots.map((s, i) => {
        const isSelected = selectedSlot && selectedSlot.employee_id === s.employee_id && selectedSlot.start_time === s.start_time;
        return (
          <div key={i} className="flex-shrink-0">
            <button
              onPointerDown={() => onSelectSlot(s)}
              onTouchStart={(e) => e.stopPropagation()}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-[22px] min-w-[76px] min-h-[54px] text-center transition-transform duration-100`}
              style={{ background: isSelected ? PRIMARY : (isDark ? "#0f0f10" : "#ffffff"), color: isSelected ? "#fff" : (isDark ? "#fff" : "#111827"), border: isSelected ? `2px solid ${PRIMARY}` : `1px solid ${isDark ? "#3d3c3c" : "#e5e7eb"}`, boxShadow: isSelected ? `0 6px 18px ${PRIMARY}33` : "none", touchAction: "manipulation" }}
            >
              <div className="text-sm font-extrabold leading-none mb-0.5 select-none pointer-events-none">{s.start_time}</div>
              <div className={`text-xs leading-none pointer-events-none ${isSelected ? "" : subtextClass}`}>{shortName(s.employee_name)}</div>
            </button>
          </div>
        );
      })}
    </div>
  );
});

const AddonsPanel = memo(function AddonsPanel({ addons, addonsOpen, selectedAddons, toggleAddon, isDark, PRIMARY, borderClass, subtextClass }) {
  if (!addonsOpen) return null;
  return (
    <div className={`mt-2 p-2 rounded-md ${isDark ? "bg-gray-900 border-gray-800" : "bg-gray-50 border-gray-200"} border max-w-[520px]`}>
      {addons.length === 0 ? (
        <div className={`${subtextClass}`}>Brak dodatków</div>
      ) : (
        <div className="grid gap-2">
          {addons.map((a) => {
            const selected = selectedAddons.some((x) => x.id === a.id);
            return (
              <div key={a.id} onPointerDown={() => toggleAddon(a)} className={`flex justify-between items-center p-2 rounded-md cursor-pointer ${selected ? (isDark ? "bg-[#2b1a0f]" : "bg-[rgba(229,123,44,0.08)]") : (isDark ? "bg-gray-800" : "bg-white")}`}>
                <div>
                  <div className={`text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{a.name}</div>
                  <div className={`text-xs ${subtextClass}`}>+{formatPrice(a.price)} zł • +{a.duration_minutes} min</div>
                </div>
                <div>{selected ? <Check size={18} color={PRIMARY} /> : <div style={{ width: 18, height: 18 }} />}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ----------------------------- Main Component ----------------------------- */
export default function BookingOptimized() {
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  // localStorage backed states
  const [availableServices, setAvailableServices] = useLocalStorageJSON("allServices", []);
  const [service, setService] = useLocalStorageJSON("selectedService", null);

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => {
    if (!theme) return;
    localStorage.setItem("theme", theme);
    if (theme === "dark") document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark");
  }, [theme]);

  // page/UI state
  const [pageReady, setPageReady] = useState(true);
  const [showServiceSelect, setShowServiceSelect] = useState(false);
  const [addons, setAddons] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("any");
  const [date, setDate] = useState(new Date());
  const [monthDate, setMonthDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [msg, setMsg] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [computedEndTime, setComputedEndTime] = useState(null);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableDays, setAvailableDays] = useState([]);
  const [lockEmployeeSelection, setLockEmployeeSelection] = useState(false);
  const [isRestoringRebook, setIsRestoringRebook] = useState(false);

  // refs
  const didInitRef = useRef(false);
  const loadingServiceRef = useRef(false);
  const axiosCache = useRef(new Map());
  const cancelSource = useRef(null);
  const reloadSlotsRef = useRef(null);

  // theme helpers
  const isDark = theme === "dark";
  const PRIMARY = "#E57B2C";
  const pageBgClass = isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900";
  const subtextClass = isDark ? "text-gray-400" : "text-gray-500";
  const borderClass = isDark ? "border-gray-700" : "border-gray-200";
  const modalBg = isDark ? "bg-black/80" : "bg-black/50";
  const successBg = isDark ? "bg-[#2b1a14]" : "bg-rose-100";

  /* ----------------------------- Cached GET helper ----------------------------- */
  const cachedGet = useCallback(async (url, opts = {}) => {
    const key = url + (opts.params ? JSON.stringify(opts.params) : "");
    if (axiosCache.current.has(key)) return axiosCache.current.get(key);
    const res = await axios.get(url, opts);
    axiosCache.current.set(key, res);
    return res;
  }, []);

  /* ----------------------------- fetchServiceRelated ----------------------------- */
  const fetchServiceRelated = useCallback(async (svc, token = null) => {
    if (!svc || !(svc.id || svc.service_id)) return;
    if (loadingServiceRef.current) return;
    loadingServiceRef.current = true;
    try {
      if (!svc.id && svc.service_id) svc.id = svc.service_id;
      const headers = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const addonsRes = await cachedGet(`${backendBase}/api/service-addons/by-service/${svc.id}`, headers);
      const empRes = await cachedGet(`${backendBase}/api/employees/by-service/${svc.id}`, headers);
      setAddons(addonsRes.data || []);
      setEmployees(empRes.data || []);

      // restore selectedAddons if present in selectedService localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("selectedService") || "null") || {};
        const preIds = stored?.selectedAddons?.length ? stored.selectedAddons : stored?.addon_ids || [];
        if (Array.isArray(preIds) && preIds.length) {
          const mapped = (addonsRes.data || []).filter((a) => preIds.includes(a.id));
          setSelectedAddons(mapped);
        }
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("Błąd pobierania dodatków/pracowników:", err);
      setAddons([]);
      setEmployees([]);
    } finally {
      loadingServiceRef.current = false;
    }
  }, [backendBase, cachedGet]);

  /* ----------------------------- loadAvailableDays (debounced) ----------------------------- */
  const _loadAvailableDays = useCallback(async (svc, monthRef = monthDate, employeeId = selectedEmployee) => {
    if (!svc || !(svc.id || svc.service_id)) return;
    try {
      const serviceId = svc.id ?? svc.service_id;
      const params = { service_id: serviceId, year: monthRef.getFullYear(), month: monthRef.getMonth() + 1 };
      if (employeeId && employeeId !== "any") params.employee_id = employeeId;
      const res = await cachedGet(`${backendBase}/api/appointments/unavailable-days`, { params });
      const unavailable = res.data || [];

      const year = monthRef.getFullYear();
      const month = monthRef.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const allMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(year, month, i + 1);
        return formatIsoDate(d);
      });
      const available = allMonthDays.filter((d) => !unavailable.includes(d));
      setAvailableDays(available);
    } catch (err) {
      console.error("❌ Błąd pobierania dni:", err);
      setAvailableDays([]);
    }
  }, [backendBase, cachedGet, monthDate, selectedEmployee]);
  const loadAvailableDays = useRef(debounce(_loadAvailableDays, 220)).current;

  /* ----------------------------- loadSlots (debounced + cancel + dedupe) ----------------------------- */
  const _loadSlots = useCallback(async (selDate, employeeOverride = null, overrideServiceId = null) => {
    if (!service) return;
    setLoadingSlots(true);

    try {
      const employeeId = employeeOverride ?? selectedEmployee;

      // compute total duration = service + selectedAddons durations
      const baseDuration = Number(service?.duration_minutes || 0);
      const addonsDuration = selectedAddons.reduce((sum, a) => sum + Number(a.duration_minutes || 0), 0);
      const totalDuration = baseDuration + addonsDuration;

      const paramsObj = { service_id: overrideServiceId ?? service.id, date: formatIsoDate(selDate), total_duration: totalDuration };
      if (employeeId !== "any" && employeeId) paramsObj.employee_id = employeeId;

      // cancel previous
      if (cancelSource.current) cancelSource.current.cancel("cancelled");
      cancelSource.current = axios.CancelToken.source();

      const res = await axios.get(`${backendBase}/api/appointments/available`, {
        cancelToken: cancelSource.current.token,
        params: paramsObj,
      });

      // dedupe by employee+time
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
      setMsg(unique.length ? "" : "🚫 Brak wolnych terminów w tym dniu");
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error("❌ Błąd pobierania terminów:", err);
        setSlots([]);
        setMsg("❌ Błąd pobierania terminów");
      }
    } finally {
      setLoadingSlots(false);
    }
  }, [service, selectedEmployee, selectedAddons, backendBase]);

  const loadSlots = useRef(debounce(_loadSlots, 300)).current;
  
  
  
  useEffect(() => {
  reloadSlotsRef.current = _loadSlots;
}, [_loadSlots]);


  /* ----------------------------- Initialization ----------------------------- */
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const init = async () => {
      setPageReady(true);
      try {
        // show cached selectedService / allServices instantly (already done by hook)

        const storedService = JSON.parse(localStorage.getItem("selectedService") || "null");
        const storedAll = JSON.parse(localStorage.getItem("allServices") || "[]");
        if (storedAll?.length) setAvailableServices(storedAll);
        if (storedService) setService(storedService);

        const salon = JSON.parse(localStorage.getItem("selectedSalon") || "null");
        if (salon?.id) {
          cachedGet(`${backendBase}/api/services/by-salon/${salon.id}`)
            .then((res) => {
              const normalized = (res.data || []).map((svc) => ({
                ...svc,
                employee_ids: Array.isArray(svc.employee_ids) ? svc.employee_ids.map(Number).filter(Boolean) : svc.employee_id ? [Number(svc.employee_id)] : [],
              }));
              const filtered = normalized.filter((svc) => svc.employee_ids?.length > 0);
              setAvailableServices(filtered);
              localStorage.setItem("allServices", JSON.stringify(filtered));
            })
            .catch((e) => console.warn("⚠️ Błąd ładowania usług salonu:", e));
        }

        // restore rebook if present
        if (storedService?.fromRebook && storedService?.service_id) {
          setIsRestoringRebook(true);
          try {
            const svcId = storedService.service_id;
            const urlsToTry = [`${backendBase}/api/service/${svcId}`, `${backendBase}/api/services/${svcId}`];
            let svcData = null;
            for (const url of urlsToTry) {
              try {
                const res = await axios.get(url);
                svcData = res.data;
                break;
              } catch (err) {
                if (err.response?.status !== 404) throw err;
              }
            }
            if (svcData) {
              setService(svcData);
              localStorage.setItem("selectedService", JSON.stringify({ ...storedService, id: svcData.id, name: svcData.name, price: svcData.price, duration_minutes: svcData.duration_minutes }));

              await fetchServiceRelated(svcData);
              const addonsRes = await axios.get(`${backendBase}/api/service-addons/by-service/${svcData.id}`);
              const freshAddons = addonsRes.data || [];
              setAddons(freshAddons);

              if (storedService.addon_ids?.length) {
                const mapped = freshAddons.filter((a) => storedService.addon_ids.includes(a.id));
                setSelectedAddons(mapped);
                const updated = { ...storedService, selectedAddons: mapped.map((a) => a.id) };
                localStorage.setItem("selectedService", JSON.stringify(updated));
              }

              if (storedService.employee_id) {
                setSelectedEmployee(storedService.employee_id);
                setLockEmployeeSelection(true);
                localStorage.setItem("lockEmployeeSelection", "true");
              }

              const now = new Date();
              setDate(now);
              setMonthDate(now);

              // first load available days, then slots (await both)
              await _loadAvailableDays(svcData, now, storedService.employee_id ?? "any");
              await _loadSlots(now, storedService.employee_id ?? "any", svcData.id);
            }
          } catch (err) {
            console.error("❌ Błąd przy rebook:", err);
          } finally {
            setIsRestoringRebook(false);
          }
        } else if (storedService?.id) {
          // normal restore
          await fetchServiceRelated(storedService);
        }
      } catch (e) {
        console.warn("Błąd init:", e);
      } finally {
        setPageReady(true);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendBase, cachedGet, fetchServiceRelated]);

  /* ----------------------------- Effects: when service / employee / month / addons change ----------------------------- */
  useEffect(() => {
    if (!service || isRestoringRebook) return;
    let mounted = true;

    const run = async () => {
      try {
        if (service?.id && employees.length === 0) {
          const token = firebaseUser ? await firebaseUser.getIdToken().catch(() => null) : null;
          if (!mounted) return;
          await fetchServiceRelated(service, token);
          await loadAvailableDays(service, monthDate, selectedEmployee);
        }

        // always refresh slots when these change (debounced inside)
        await _loadSlots(date, selectedEmployee, service.id);
      } catch (err) {
        console.warn("⚠️ Error while refreshing booking data:", err);
      }
    };

    run();
    return () => { mounted = false; };
  }, [service?.id, date, selectedEmployee, selectedAddons, monthDate, isRestoringRebook]);

  useEffect(() => {
    if (!service || isRestoringRebook) return;
    loadAvailableDays(service, monthDate, selectedEmployee);
  }, [service?.id, monthDate, selectedEmployee, isRestoringRebook]);

  /* ----------------------------- booking cache restore ----------------------------- */
  useEffect(() => {
    const savedState = localStorage.getItem("booking-cache");
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.service) setService(state.service);
        if (state.selectedAddons) setSelectedAddons(state.selectedAddons);
        if (state.selectedEmployee) setSelectedEmployee(state.selectedEmployee);
        if (state.date) setDate(new Date(state.date));
      } catch (e) {
        console.warn("Nie udało się odczytać cache Booking:", e);
      }
    }
  }, []);

  useEffect(() => {
    const cache = { service, selectedAddons, selectedEmployee, date };
    localStorage.setItem("booking-cache", JSON.stringify(cache));
  }, [service, selectedAddons, selectedEmployee, date]);

  /* ----------------------------- Auto-skip to nearest available day ----------------------------- */
  useEffect(() => {
    if (!availableDays.length) return;
    const today = new Date();
    today.setHours(0,0,0,0);

    if (date < today) {
      const newDate = new Date(today);
      if (formatIsoDate(newDate) !== formatIsoDate(date)) {
        setDate(newDate);
        setMonthDate(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
      }
      return;
    }

    const currentIso = formatIsoDate(date);
    if (!availableDays.includes(currentIso)) {
      const nextAvailable = availableDays.map((d) => new Date(d)).find((d) => d >= today);
      if (nextAvailable && formatIsoDate(nextAvailable) !== currentIso) {
        setDate(nextAvailable);
        setMonthDate(new Date(nextAvailable.getFullYear(), nextAvailable.getMonth(), 1));
      }
    }
    // intentionally only dependency on availableDays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDays]);

  /* ----------------------------- Lock employee selection state ----------------------------- */
  useEffect(() => {
    try {
      const storedService = JSON.parse(localStorage.getItem("selectedService") || "null") || {};
      if (storedService?.fromRebook) {
        localStorage.setItem("lockEmployeeSelection", "true");
        setLockEmployeeSelection(true);
      } else {
        localStorage.removeItem("lockEmployeeSelection");
        setLockEmployeeSelection(false);
      }
    } catch (e) {
      localStorage.removeItem("lockEmployeeSelection");
      setLockEmployeeSelection(false);
    }
  }, []);

  /* ----------------------------- Filter available services when employees change ----------------------------- */
  useEffect(() => {
    const currentEmpIds = employees.map((e) => e.id);
    let rebookEmployeeId = null;
    try {
      const stored = JSON.parse(localStorage.getItem("selectedService") || "null") || {};
      if (stored.fromRebook && stored.employee_id) rebookEmployeeId = stored.employee_id;
    } catch {}

    const allowedEmpIds = rebookEmployeeId ? [rebookEmployeeId] : currentEmpIds;
    if (!allowedEmpIds.length) return;
    setAvailableServices((prev) => {
      const filtered = prev.filter((svc) => {
        if (!svc.employee_ids || svc.employee_ids.length === 0) return false;
        return svc.employee_ids.some((id) => allowedEmpIds.includes(id));
      });
      return filtered;
    });
  }, [employees]);

  /* ----------------------------- Compute end time (always uses base + addons durations) ----------------------------- */
  useEffect(() => {
    if (!service) { setComputedEndTime(null); return; }
    const base = Number(service.duration_minutes || 0);
    const extra = selectedAddons.reduce((s, a) => s + Number(a.duration_minutes || 0), 0);
    const total = base + extra;
    if (selectedSlot) {
      const [h, m] = selectedSlot.start_time.split(":").map(Number);
      const start = new Date();
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + total * 60000);
      setComputedEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
    } else {
      setComputedEndTime(null);
    }
  }, [selectedSlot, service, selectedAddons]);

  /* ----------------------------- Handlers ----------------------------- */
  const handleSlotClick = useCallback((slot) => {
    setSelectedSlot((prev) => {
      if (prev && prev.employee_id === slot.employee_id && prev.start_time === slot.start_time) return null;
      return slot;
    });
  }, []);

  const toggleAddon = useCallback((addon) => {
    setSelectedAddons((prev) => {
      const exists = prev.some((a) => a.id === addon.id);
      const updated = exists ? prev.filter((a) => a.id !== addon.id) : [...prev, addon];

      try {
        const stored = JSON.parse(localStorage.getItem("selectedService") || "null") || {};
        if (stored?.service_id) {
          stored.selectedAddons = updated.map((a) => a.id);
          localStorage.setItem("selectedService", JSON.stringify(stored));
        }
      } catch (e) {
        console.error("Błąd zapisu dodatków do localStorage", e);
      }

      // refresh slots to account for added/removed durations
      _loadSlots(date, selectedEmployee, service?.id);

      return updated;
    });
  }, [date, selectedEmployee, service?.id, _loadSlots]);

  const handleChangeService = useCallback(async (newServiceId) => {
    try {
      const selected = availableServices.find((s) => s.id === Number(newServiceId) || s.id === newServiceId);
      if (!selected) return;
      setService(selected);
      setSelectedAddons([]);
      setSelectedSlot(null);
      setSelectedEmployee("any");
      setAddonsOpen(false);
      setShowServiceSelect(false);
      localStorage.setItem("selectedService", JSON.stringify(selected));

      const [resAddons, resEmps] = await Promise.all([
        axios.get(`${backendBase}/api/service-addons/by-service/${selected.id}`),
        axios.get(`${backendBase}/api/employees/by-service/${selected.id}`),
      ]);
      setAddons(resAddons.data || []);
      setEmployees(resEmps.data || []);
      await loadSlots(date, "any", selected.id);
    } catch (err) {
      console.error("❌ Błąd przy zmianie usługi:", err);
    }
  }, [availableServices, backendBase, date, loadSlots]);

  const confirmBooking = useCallback(async () => {
    if (!selectedSlot || !service) return;
    try {
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      await axios.post(
        `${backendBase}/api/appointments`,
        {
          employee_id: selectedSlot.employee_id,
          service_id: service.id,
          date: formatIsoDate(date),
          start_time: selectedSlot.start_time,
          end_time: computedEndTime || selectedSlot.end_time,
          addons: selectedAddons.map((a) => a.id),
        },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setMsg("✅ Rezerwacja potwierdzona!");
    } catch (err) {
      console.error("❌ Błąd rezerwacji:", err);
      setMsg(err.response?.data?.error || "❌ Nie udało się zarezerwować terminu");
    }
  }, [selectedSlot, service, computedEndTime, selectedAddons, backendBase, firebaseUser, date]);

  const prevMonth = useCallback(() => {
    setMonthDate((m) => {
      const newMonth = new Date(m);
      newMonth.setMonth(newMonth.getMonth() - 1);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const isPastMonth = newMonth < thisMonth;

      if (isPastMonth) {
        setSlots([]);
        return m;
      }

      setSlots([]);
      return newMonth;
    });
  }, []);

  const nextMonth = useCallback(() => setMonthDate((m) => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; }), []);

  const totalPrice = useMemo(() => Number(service?.price || 0) + selectedAddons.reduce((s, a) => s + Number(a.price || 0), 0), [service, selectedAddons]);
  const totalDuration = useMemo(() => Number(service?.duration_minutes || 0) + selectedAddons.reduce((s, a) => s + Number(a.duration_minutes || 0), 0), [service, selectedAddons]);





  // --- Swipe gesture to change month ---
  const swipeStartX = useRef(null);

  const handleTouchStart = (e) => {
    swipeStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (swipeStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    const threshold = 50; // minimalna długość gestu w px

    if (deltaX > threshold) {
      // 👉 przesunięcie w prawo → poprzedni miesiąc
      prevMonth();
    } else if (deltaX < -threshold) {
      // 👈 przesunięcie w lewo → następny miesiąc
      nextMonth();
    }

    swipeStartX.current = null;
  };











  /* ----------------------------- Render ----------------------------- */
  return (
    <div className={`${pageBgClass} relative min-h-screen font-inter p-[10px] sm:p-[clamp(5px,4vw,10px)]`}>
      {(!pageReady || isRestoringRebook) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white z-[999] backdrop-blur-sm">
          <div className="px-4 py-2 rounded-md bg-black/60 text-sm">Ładowanie...</div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <button onPointerDown={() => { localStorage.removeItem("lockEmployeeSelection"); navigate("/services"); }} aria-label="Powrót" className={`bg-transparent border-0 text-[22px] cursor-pointer p-1 transition-transform duration-100 ${isDark ? "text-white" : "text-gray-900"}`}>
          ←
        </button>
        <h1 className="m-0 text-[22px] font-semibold">Umów wizytę</h1>
        
      </div>

      <div className="pb-2">
        <EmployeeSelector employees={employees} selectedEmployee={selectedEmployee} onSelectEmployee={(id) => { setSelectedEmployee(id); setSelectedSlot(null); }} lockEmployeeSelection={lockEmployeeSelection} backendBase={backendBase} isDark={isDark} PRIMARY={PRIMARY} subtextClass={subtextClass} />

        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} disabled={monthDate.getFullYear() === new Date().getFullYear() && monthDate.getMonth() === new Date().getMonth()} className={`bg-transparent border-0 p-1 transition ${isDark ? "text-white" : "text-gray-900"} ${monthDate.getFullYear() === new Date().getFullYear() && monthDate.getMonth() === new Date().getMonth() ? "opacity-60 cursor-not-allowed" : "hover:scale-110 cursor-pointer"}`} aria-label="Poprzedni miesiąc">
              <ChevronLeft size={18} />
            </button>

            <div className="text-base font-semibold">{monthDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}</div>

            <button onClick={nextMonth} className={`bg-transparent border-0 p-1 transition ${isDark ? "text-white" : "text-gray-900"} hover:scale-110 cursor-pointer`} aria-label="Następny miesiąc">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={`text-sm ${subtextClass}`}>Wybierz datę</div>
        </div>
<div
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
  className="select-none"
>
       <CalendarGrid
  monthDate={monthDate}
  availableDays={availableDays}
  date={date}
  onSelectDate={(d) => {
    setDate(d);
    setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }}
  isDark={isDark}
  subtextClass={subtextClass}
  PRIMARY={PRIMARY}
/>
 </div>

        <div className="mb-4">
          <h3 className="mb-2 text-sm">Wybierz godzinę</h3>
          <SlotsList slots={slots} selectedSlot={selectedSlot} onSelectSlot={handleSlotClick} loadingSlots={loadingSlots} isDark={isDark} PRIMARY={PRIMARY} subtextClass={subtextClass} />
        </div>
      </div>

      <div className={`rounded-xl ${isDark ? "bg-gray-800" : "bg-white"} p-4 mt-2 mb-7 max-w-[1100px] mx-auto border ${borderClass}`}>
        <div className="flex justify-between items-center gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">{service?.name || "—"}
              <div className="mt-1">
                <button onClick={() => setShowServiceSelect(!showServiceSelect)} className={`text-xs underline ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-800"}`}>Zmień usługę</button>
              </div>

              {showServiceSelect && (
                <div className={`mt-2 border rounded-lg p-2 ${isDark ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-300"}`}>
                  {availableServices.length === 0 ? (<div className={`text-sm ${subtextClass}`}>Brak innych usług</div>) : (
                    <select onChange={(e) => handleChangeService(e.target.value)} value={service?.id || ""} className={`w-full p-2 rounded-md text-sm ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}>
                      <option value="">Wybierz usługę</option>
                      {availableServices.filter((svc) => {
                        if (!employees || employees.length === 0) return true;
                        if (selectedEmployee !== "any") 
							svc.employee_ids?.includes(selectedEmployee);
                        const currentEmpIds = employees.map((e) => e.id);
                        return svc.employee_ids?.some((id) => currentEmpIds.includes(id));
                      }).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {formatPrice(s.price)} zł</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className={`mt-1 text-sm ${subtextClass}`}>{selectedSlot ? (selectedSlot.employee_name?.split(" ")[0] || selectedSlot.employee_name) : selectedEmployee === "any" ? "Dowolna osoba" : (employees.find(e => e.id === selectedEmployee)?.name?.split(" ")[0] || "—")}</div>

            <div className="mt-3">
              <button onPointerDown={() => setAddonsOpen((s) => !s)} onTouchStart={(e) => e.stopPropagation()} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border ${borderClass} ${isDark ? "bg-gray-800" : "bg-white"} ${isDark ? "text-white" : "text-gray-900"} cursor-pointer`}><Plus size={14} /><span className="pointer-events-none">Dodatki{selectedAddons.length ? ` (${selectedAddons.length})` : ""}</span></button>

              <AddonsPanel addons={addons} addonsOpen={addonsOpen} selectedAddons={selectedAddons} toggleAddon={toggleAddon} isDark={isDark} PRIMARY={PRIMARY} borderClass={borderClass} subtextClass={subtextClass} />
            </div>
          </div>

          <div className="text-right min-w-[120px]">
            <div className="text-lg font-extrabold">{formatPrice(totalPrice)} zł</div>
            <div className={`mt-1 text-sm ${subtextClass}`}>{selectedSlot ? `${selectedSlot.start_time} – ${computedEndTime || selectedSlot.end_time}` : `${totalDuration} min`}</div>
          </div>
        </div>

        <div className="mt-3">
          <button
  onPointerDown={() => { if (!selectedSlot) return; setShowSummaryModal(true); }}
  disabled={!selectedSlot}
  className={`w-full rounded-md py-3 text-base font-semibold transition-all active:scale-[0.96] active:brightness-90 ${
    selectedSlot ? "" : "opacity-60 cursor-not-allowed"
  }`}
  style={{
    background: selectedSlot ? PRIMARY : (isDark ? "#333" : "#cbd5e1"),
    color: "#fff",
    border: "none",
  }}
>
  Dalej
</button>
        </div>
      </div>

      {showSummaryModal && (
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 ${modalBg}`}>
          {msg.includes("✅") ? (
            <div className={`w-full max-w-[480px] text-center p-8 rounded-2xl ${isDark ? "bg-gray-800" : "bg-white"} shadow-lg`}>
              <h2 className="text-[26px] font-bold" style={{ color: PRIMARY }}>Gratulacje!</h2>
              <p className={`mt-4 text-base ${subtextClass}`}>Twoja wizyta została umówiona na <strong>{prettyDateStr(date)}, godz. {selectedSlot?.start_time}</strong>.</p>
              <p className={`mt-2 text-sm ${subtextClass}`}>Dziękujemy za skorzystanie z naszych usług!</p>
              <button
  onPointerDown={(e) => {
    e.currentTarget.classList.add("pressed");
    setMsg("");
    setShowSummaryModal(false);
    window.location.href = "/salons";
  }}
  onPointerUp={(e) => {
    e.currentTarget.classList.remove("pressed");
  }}
  onPointerLeave={(e) => {
    e.currentTarget.classList.remove("pressed");
  }}
  className="mt-6 w-full py-3 rounded-md font-semibold transition-all duration-150 select-none"
  style={{
    background: PRIMARY,
    color: "#fff",
    transformOrigin: "center",
  }}
>
  Zamknij
</button>


		   </div>
          ) : (
            <div className={`w-full max-w-[480px] p-6 rounded-2xl ${isDark ? "bg-gray-800" : "bg-white"} shadow-lg`}>
              <div className="flex items-center mb-4">
                <button
  onPointerDown={() => {
    setShowSummaryModal(false);

    if (msg.includes("Ten termin został właśnie zajęty")) {
      setSelectedSlot(null);
      setMsg("");
      // 🔁 Pewne odświeżenie slotów po zamknięciu modala
      setTimeout(() => {
        if (reloadSlotsRef.current) {
          reloadSlotsRef.current(date, selectedEmployee, service?.id);
        }
      }, 250); // lekkie opóźnienie, żeby modal zdążył się schować
    }
  }}
  className={`mr-3 p-1 ${isDark ? "text-white" : "text-gray-900"}`}
>
  ←
</button>

                <h2 className="text-xl font-bold m-0">Sprawdź i potwierdź</h2>
              </div>

              <div className={`text-sm ${subtextClass} mb-2`}>{prettyDateStr(date)} · {selectedSlot?.start_time}</div>

              {(() => {
                try {
                  const salon = JSON.parse(localStorage.getItem("selectedSalon") || "null");
                  if (salon) return <div className={`text-sm ${subtextClass} mb-4`}>{salon.name} · {salon.street} {salon.street_number}, {salon.city}</div>;
                } catch {}
                return null;
              })()}

              <div className={`p-4 rounded-lg mb-4 border ${borderClass} ${isDark ? "bg-gray-800" : "bg-white"}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-base font-semibold">{service?.name || "Usługa"}</div>
                    <div className={`text-sm mt-1 ${subtextClass}`}>Pracownik: {selectedSlot ? (selectedSlot.employee_name?.split(" ")[0] || selectedSlot.employee_name) : selectedEmployee === "any" ? "Dowolna osoba" : (employees.find((e) => e.id === selectedEmployee)?.name?.split(" ")[0] || "—")}</div>
                    {selectedAddons.length > 0 && (
                      <div className="mt-3">
                        <div className={`text-sm ${subtextClass} mb-1`}>Dodatki:</div>
                        <ul className="list-disc pl-5 text-sm" style={{ color: isDark ? "#fff" : "#111827" }}>{selectedAddons.map((a) => <li key={a.id} className="mb-1">{a.name} (+{formatPrice(a.price)} zł, +{a.duration_minutes} min)</li>)}</ul>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-base font-semibold">{formatPrice(totalPrice)} zł</div>
                    <div className={`text-sm mt-1 ${subtextClass}`}>{selectedSlot?.start_time} – {computedEndTime}</div>
                  </div>
                </div>

                <hr className={`my-3 border-t ${borderClass}`} />
                <div className="flex justify-between text-base"><span>Suma</span><strong>{formatPrice(totalPrice)} zł</strong></div>
              </div>

              <div className="text-center mb-4"><div className={`text-sm ${subtextClass}`}>Do zapłaty na miejscu: <strong className={`${isDark ? "text-white" : "text-gray-900"}`}>{formatPrice(totalPrice)} zł</strong></div></div>

              <button
  onPointerDown={(e) => {
    e.currentTarget.classList.add("pressed");
    confirmBooking();
  }}
  onPointerUp={(e) => {
    e.currentTarget.classList.remove("pressed");
  }}
  onPointerLeave={(e) => {
    e.currentTarget.classList.remove("pressed");
  }}
  className="w-full py-3 rounded-md font-semibold transition-all duration-150 select-none"
  style={{
    background: PRIMARY,
    color: "#fff",
    transformOrigin: "center",
  }}
>
  Potwierdź i umów
</button>

              {msg && !msg.includes("✅") && (<div className="mt-4 rounded-md p-2 text-center" style={{ background: successBg, color: isDark ? "#ff7676" : "#9b1f1f" }}>{msg}</div>)}
            </div>
          )}
        </div>
      )}

      {msg && (<div className="fixed left-5 bottom-24 rounded-md px-3 py-2" style={{ background: successBg, color: isDark ? "#fff" : "#111827" }}>{msg}</div>)}
    </div>
  );
}
