// src/pages/Booking.jsx
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../components/AuthProvider";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Booking.jsx
 * Final: top (scrollable) + bottom summary (non-sticky).
 * - Sloty mniejsze, bardziej zaokrąglone
 * - Kliknięcie slotu nie zmienia wybranego pracownika
 * - Pracownicy mają obręcz w kolorze #E57B2C i ptaszek po wybraniu
 * - Dodatki rozwijane w dolnym podsumowaniu, preselect z localStorage (selectedService.selectedAddons)
 * - Sloty: ramka #3d3c3c, tło #0f0f10, borderRadius 22
 * - Podsumowanie (nie sticky) tło #2c2c2d
 */

export default function Booking() {
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  // THEME: dark / light
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  const darkTheme = {
    RING_COLOR: "#E57B2C",
    SLOT_BORDER: "#3d3c3c",
    PAGE_BG: "#0f0f10",
    BOTTOM_BG: "#1c1c1c",
    TEXT: "#ffffff",
    SUBTEXT: "#bfbfbf",
    CARD_BG: "#111111",
    SECOND_BG: "#0d0d0d",
    BORDER_LIGHT: "#2a2a2a",
    MUTED_BG: "#121212",
    ADDON_SELECTED_BG: "#2b1a0f",
    SUCCESS_BG: "#2b1a14",
    MODAL_BG: "rgba(0,0,0,0.92)",
  };

  const lightTheme = {
    RING_COLOR: "#E57B2C",
    SLOT_BORDER: "#d0d0d0",
    PAGE_BG: "#f6f6f6",
    BOTTOM_BG: "#f0f0f0",
    TEXT: "#111111",
    SUBTEXT: "#666666",
    CARD_BG: "#ffffff",
    SECOND_BG: "#f2f2f2",
    BORDER_LIGHT: "#dddddd",
    MUTED_BG: "#fafafa",
    ADDON_SELECTED_BG: "#f3e6dc",
    SUCCESS_BG: "#ffece6",
    MODAL_BG: "rgba(0,0,0,0.5)",
  };

  const colors = theme === "dark" ? darkTheme : lightTheme;

  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {
      // ignore
    }
  }, [theme]);

  // state
  const [service, setService] = useState(null);
  const [addons, setAddons] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]); // objects
  const [selectedEmployee, setSelectedEmployee] = useState("any");
  const [date, setDate] = useState(new Date());
  const [monthDate, setMonthDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [msg, setMsg] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [computedEndTime, setComputedEndTime] = useState(null);
  const [addonsOpen, setAddonsOpen] = useState(false); // bottom dropdown open flag
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableDays, setAvailableDays] = useState([]);

  useEffect(() => {
    if (!service) return;
    const loadAvailableDays = async () => {
      try {
        const now = monthDate;
        const params = {
          service_id: service.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
        };
        if (selectedEmployee !== "any" && selectedEmployee)
          params.employee_id = selectedEmployee;

        const res = await axios.get(`${backendBase}/api/appointments/available-days`, { params });
        setAvailableDays(res.data || []);
      } catch (err) {
        console.error("Błąd pobierania dostępnych dni:", err);
        setAvailableDays([]);
      }
    };
    loadAvailableDays();
  }, [service, monthDate, selectedEmployee]);

  // 🔹 Automatycznie przełącz datę na najbliższy dostępny dzień, jeśli obecny nie ma slotów
  useEffect(() => {
    if (!availableDays.length) return;
    const todayIso = formatIsoDate(date);

    // jeśli obecna data NIE jest dostępna → przeskocz
    if (!availableDays.includes(todayIso)) {
      // znajdź najbliższą przyszłą datę z listy availableDays
      const nextAvailable = availableDays.find(d => new Date(d) >= new Date(todayIso));
      if (nextAvailable) {
        setDate(new Date(nextAvailable));
        setMonthDate(new Date(nextAvailable));
      }
    }
  }, [availableDays]);

  const formatPrice = (v) => Number(v || 0).toFixed(2);
  const formatIsoDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const prettyDate = (d) =>
    d.toLocaleDateString("pl-PL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // load service from localStorage (once)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("selectedService"));
      if (stored) setService(stored);
    } catch (e) {
      // ignore
    }
  }, []);

  // load addons from API and preselect those from stored service.selectedAddons (IDs)
  useEffect(() => {
    if (!service) return;
    const load = async () => {
      try {
        const token = firebaseUser ? await firebaseUser.getIdToken() : null;
        const res = await axios.get(
          `${backendBase}/api/service-addons/by-service/${service.id}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : {}
        );
        const fetched = res.data || [];
        setAddons(fetched);

        // preselect from stored service (IDs)
        try {
          const stored = JSON.parse(localStorage.getItem("selectedService"));
          const preIds = stored?.selectedAddons || [];
          if (Array.isArray(preIds) && preIds.length) {
            const mapped = fetched.filter((a) => preIds.includes(a.id));
            setSelectedAddons(mapped);
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.error("Błąd pobierania dodatków:", err);
        setAddons([]);
      }
    };
    load();
  }, [service, firebaseUser]);

  // load employees
  useEffect(() => {
    if (!service) return;
    const loadEmployees = async () => {
      try {
        const res = await axios.get(
          `${backendBase}/api/employees/by-service/${service.id}`
        );
        setEmployees(res.data || []);
      } catch (err) {
        console.error("Błąd pobierania pracowników:", err);
        setEmployees([]);
      }
    };
    loadEmployees();
  }, [service]);

  // load slots
  const loadSlots = useCallback(
    async (selDate) => {
      if (!service) return;
      setLoadingSlots(true);
      try {
        const params = new URLSearchParams({
          service_id: service.id,
          date: formatIsoDate(selDate),
        });
        if (selectedEmployee !== "any" && selectedEmployee)
          params.append("employee_id", selectedEmployee);
        if (selectedAddons.length > 0)
          selectedAddons.forEach((a) => params.append("addons", a.id));
        const res = await axios.get(
          `${backendBase}/api/appointments/available?${params.toString()}`
        );

        // ensure uniqueness by employee_id + start_time (API might return duplicates)
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
        console.error("❌ Błąd pobierania terminów:", err);
        setSlots([]);
        setMsg("❌ Błąd pobierania terminów");
      } finally {
        setLoadingSlots(false);
      }
    },
    [service, selectedEmployee, selectedAddons, backendBase]
  );

  // refresh slots
  useEffect(() => {
    if (service) loadSlots(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, date, selectedEmployee, selectedAddons]);

  // slot click: toggles selection by (employee_id + start_time)
  const handleSlotClick = (slot) => {
    if (
      selectedSlot &&
      selectedSlot.employee_id === slot.employee_id &&
      selectedSlot.start_time === slot.start_time
    ) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot(slot);
      // NOTE: per requirement: clicking slot should NOT change selectedEmployee
    }
  };

  // compute end time dynamically when slot, addons or service change
  useEffect(() => {
    if (!service) {
      setComputedEndTime(null);
      return;
    }

    // total duration = service + addons
    const base = Number(service.duration_minutes || 0);
    const extra = selectedAddons.reduce(
      (s, a) => s + Number(a.duration_minutes || 0),
      0
    );
    const total = base + extra;

    // if slot selected → compute end time from start time
    if (selectedSlot) {
      const [h, m] = selectedSlot.start_time.split(":").map(Number);
      const start = new Date();
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + total * 60000);
      setComputedEndTime(
        `${String(end.getHours()).padStart(2, "0")}:${String(
          end.getMinutes()
        ).padStart(2, "0")}`
      );
    } else {
      // if no slot yet → clear end time
      setComputedEndTime(null);
    }
  }, [selectedSlot, service, selectedAddons]);

  // confirm booking
  const confirmBooking = async () => {
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

      // ✅ Pokazujemy sukces (bez zamykania modala!)
      setMsg("✅ Rezerwacja potwierdzona!");

      // 🔁 automatyczne czyszczenie po 6 sekundach
      // (u Ciebie było w komentarzu — możesz dodać timeout jeśli chcesz)
    } catch (err) {
      console.error("❌ Błąd rezerwacji:", err);
      setMsg(err.response?.data?.error || "❌ Nie udało się zarezerwować terminu");
    }
  };

  // calendar helpers
  const weekdays = ["PON.", "WT.", "ŚR.", "CZW.", "PT.", "SOB.", "NIED."];

  const buildMonthGrid = (d) => {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const startOffset = (first.getDay() + 6) % 7; // Mon start
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

  const prevMonth = () => {
    const m = new Date(monthDate);
    m.setMonth(m.getMonth() - 1);
    setMonthDate(m);
  };
  const nextMonth = () => {
    const m = new Date(monthDate);
    m.setMonth(m.getMonth() + 1);
    setMonthDate(m);
  };

  // totals
  const totalPrice = Number(service?.price || 0) + selectedAddons.reduce((s, a) => s + Number(a.price || 0), 0);
  const totalDuration = Number(service?.duration_minutes || 0) + selectedAddons.reduce((s, a) => s + Number(a.duration_minutes || 0), 0);

  const shortName = (full) => {
    if (!full) return "";
    const parts = full.split(" ");
    const first = parts[0] || "";
    const lastInitial = parts[1] ? parts[1][0] : "";
    return `${first} ${lastInitial ? lastInitial + "." : ""}`;
  };

  // toggle addon (object) — updates state and localStorage IDs
  const toggleAddon = (addon) => {
    const exists = selectedAddons.some((a) => a.id === addon.id);
    let updated;
    if (exists) {
      updated = selectedAddons.filter((a) => a.id !== addon.id);
    } else {
      updated = [...selectedAddons, addon];
    }
    setSelectedAddons(updated);

    // persist IDs to localStorage.selectedService.selectedAddons
    try {
      const stored = JSON.parse(localStorage.getItem("selectedService")) || {};
      stored.selectedAddons = updated.map((a) => a.id);
      localStorage.setItem("selectedService", JSON.stringify(stored));
    } catch (e) {
      console.error("Błąd zapisu dodatków do localStorage", e);
    }
  };

  return (
    <div style={{ background: colors.PAGE_BG, color: colors.TEXT, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", padding: "10px clamp(5px, 4vw, 10px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button
          onMouseEnter={() => import("./ServiceSelect.jsx")}   // ✅ prefetch strony Services
          onTouchStart={() => import("./ServiceSelect.jsx")}   // ✅ prefetch na mobile
          onPointerDown={() => navigate("/services")}          // ✅ przejście do /services
          aria-label="Powrót"
          style={{
            background: "transparent",
            border: "none",
            color: colors.TEXT,
            fontSize: 22,
            cursor: "pointer",
            padding: 6,
            transition: "transform .15s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.9)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          ←
        </button>

        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Umów wizytę</h1>

        {/* Theme switch */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: `1px solid ${colors.SLOT_BORDER}`,
            borderRadius: 8,
            color: colors.TEXT,
            fontSize: 13,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          {theme === "dark" ? "☀️ Jasny" : "🌙 Ciemny"}
        </button>
      </div>

      {/* Top scrollable content */}
      <div style={{ paddingBottom: 10 /* less space as bottom summary isn't sticky */ }}>
        {/* employees row */}
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, marginBottom: 14 }}>
          {/* any */}
          <div onPointerDown={() => { setSelectedEmployee("any"); setSelectedSlot(null); }} style={{ minWidth: 72, textAlign: "center", cursor: "pointer" }}>
            <div style={{
              width: 64, height: 64, borderRadius: 999,
              background: colors.SECOND_BG, border: selectedEmployee === "any" ? `3px solid ${colors.RING_COLOR}` : `3px solid ${colors.SECOND_BG}`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", position: "relative"
            }}>
              <div style={{ fontSize: 26 }}>👤</div>
            </div>
            <div style={{ fontSize: 12, color: selectedEmployee === "any" ? colors.RING_COLOR : colors.SUBTEXT }}>Dowolna</div>
          </div>

          {employees.map((emp) => {
            const selected = selectedEmployee === emp.id;
            return (
              <div key={emp.id} style={{ minWidth: 88, textAlign: "center", cursor: "pointer" }} onPointerDown={() => { setSelectedEmployee(emp.id); setSelectedSlot(null); }}>
                <div style={{ position: "relative", margin: "0 auto 8px", width: 64, height: 64 }}>
                  {/* ring */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 999, padding: 3,
                    background: `linear-gradient(180deg, ${colors.RING_COLOR}, ${colors.RING_COLOR})`,
                    boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", opacity: selected ? 1 : 0.14
                  }}>
                    <div style={{
                      width: "100%", height: "100%", borderRadius: 999, background: colors.CARD_BG,
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
                    }}>
                      {emp.image_url ? (
                        <img src={`${backendBase}/uploads/${emp.image_url}`} alt={emp.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ color: colors.TEXT, fontSize: 18 }}>{emp.name ? emp.name[0].toUpperCase() : "?"}</div>
                      )}
                    </div>
                  </div>

                  {/* check badge when selected */}
                  {selected && (
                    <div style={{
                      position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: 999,
                      background: colors.RING_COLOR, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 6px ${colors.RING_COLOR}66`
                    }}>
                      <Check size={12} color={colors.TEXT} />
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 12, color: selected ? colors.RING_COLOR : colors.SUBTEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {emp.name}
                </div>
              </div>
            );
          })}
        </div>

        {/* calendar header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevMonth} style={{ background: "transparent", border: "none", color: colors.TEXT, cursor: "pointer", padding: 6 }} aria-label="Poprzedni miesiąc"><ChevronLeft size={18} /></button>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {monthDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
            </div>
            <button onClick={nextMonth} style={{ background: "transparent", border: "none", color: colors.TEXT, cursor: "pointer", padding: 6 }} aria-label="Następny miesiąc"><ChevronRight size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: colors.SUBTEXT }}>Wybierz datę</div>
        </div>

        {/* weekdays */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 6 }}>
          {weekdays.map((w) => <div key={w} style={{ textAlign: "center", color: colors.SUBTEXT, fontSize: 12 }}>{w}</div>)}
        </div>

        {/* calendar grid (centered on mobile) */}
        <div
          style={{
            background: colors.SECOND_BG,
            padding: "12px 0",               // 🔹 symetryczny padding
            borderRadius: 12,
            boxShadow: theme === "dark" ? "0 4px 10px rgba(0,0,0,0.6)" : "0 4px 10px rgba(0,0,0,0.04)",
            marginBottom: 12,
            display: "flex",
            justifyContent: "center",        // 🔹 poziome wyśrodkowanie
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
              justifyItems: "center",
              width: "100%",
              maxWidth: "100%",
              // 🔹 ograniczamy szerokość
              transform: window.innerWidth < 480 ? "scale(0.95)" : "none", // 🔹 delikatne dopasowanie
              transformOrigin: "center",     // 🔹 środek jako punkt odniesienia
            }}
          >
            {buildMonthGrid(monthDate).flat().map((cellDate, idx) => {
              const isCurrentMonth = cellDate.getMonth() === monthDate.getMonth();
              const isSelected = cellDate.toDateString() === date.toDateString();
              const iso = formatIsoDate(cellDate);
              const isAvailable = availableDays.includes(iso);

              return (
                <button
                  key={idx}
                  onPointerDown={() => {
                    setDate(new Date(cellDate));
                    setMonthDate(new Date(cellDate.getFullYear(), cellDate.getMonth(), 1));
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: isSelected
                      ? colors.RING_COLOR
                      : isCurrentMonth
                      ? colors.SECOND_BG
                      : colors.PAGE_BG,
                    color: isSelected
                      ? colors.CARD_BG
                      : isCurrentMonth
                      ? colors.TEXT
                      : colors.SUBTEXT,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "2px auto",
                    transition: "all .12s",
                    opacity: isAvailable ? 1 : 0.25,
                    pointerEvents: isAvailable ? "auto" : "none",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    outline: "none",
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      lineHeight: "1",
                      fontSize: 14,
                      pointerEvents: "none",
                    }}
                  >
                    {cellDate.getDate()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* NOTE: full prettyDate(date) removed as requested */}

        {/* slots */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>Wybierz godzinę</h3>

          {loadingSlots ? (
            <div style={{ color: colors.SUBTEXT }}>Ładowanie terminów…</div>
          ) : slots.length ? (
            <div
              style={{
                display: "flex",
                gap: 10,
                overflowX: "auto",
                paddingBottom: 6,
                scrollbarWidth: "none",       // Firefox
                msOverflowStyle: "none",       // IE, Edge
              }}
              className="hide-scrollbar"
            >
              {slots.map((s, i) => {
                const empColor = colors.RING_COLOR; // fixed color per requirement
                const isSelected = selectedSlot && selectedSlot.employee_id === s.employee_id && selectedSlot.start_time === s.start_time;
                return (
                  <div key={i} style={{ flex: "0 0 auto" }}>
                    <button
                      onPointerDown={() => handleSlotClick(s)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "6px 10px",
                        borderRadius: 22,
                        background: isSelected ? empColor : colors.SECOND_BG,
                        color: isSelected ? colors.CARD_BG : colors.TEXT,
                        cursor: "pointer",
                        minWidth: 76,              // 🔸 zachowujemy oryginalny rozmiar
                        minHeight: 54,
                        border: isSelected
                          ? `2px solid ${empColor}`
                          : `1px solid ${colors.SLOT_BORDER}`,
                        boxShadow: isSelected
                          ? `0 6px 18px ${empColor}33`
                          : "none",
                        textAlign: "center",
                        lineHeight: "1.05",
                        transition: "transform .1s ease, background .2s ease",

                        // 🧠 kluczowe poprawki mobilne:
                        touchAction: "manipulation",             // brak 300ms delay
                        WebkitTapHighlightColor: "transparent",  // brak szarego highlightu
                        userSelect: "none",                      // nie zaznacza tekstu
                        WebkitUserSelect: "none",
                        outline: "none",                         // brak niebieskiego focusa
                        transform: "translateZ(0)",              // lepsza responsywność
                        willChange: "transform",                 // podbija wydajność
                        tapHighlightColor: "transparent",
                      }}
                      onTouchStart={(e) => e.stopPropagation()}   // zapobiega ghost tapom w scrollu
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          lineHeight: "1",
                          marginBottom: 1,
                          pointerEvents: "none", // ⛔️ wyłącza kliknięcia na tekście
                          userSelect: "none",
                          WebkitUserSelect: "none",
                        }}
                      >
                        {s.start_time}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: isSelected ? (theme === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)") : colors.SUBTEXT,
                          lineHeight: "1",
                          pointerEvents: "none",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                        }}
                      >
                        {shortName(s.employee_name)}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: colors.SUBTEXT }}>{msg || "Brak dostępnych terminów"}</div>
          )}
        </div>

        {/* Removed top summary — all summary moved to bottom */}
      </div> {/* end top scrollable area */}

      {/* --- Non-sticky bottom summary (as requested) --- */}
      <div style={{
        background: colors.BOTTOM_BG,
        borderRadius: 14,
        padding: 14,
        marginTop: 8,
        marginBottom: 28,
        maxWidth: 1100,
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{service?.name || "—"}</div>
            <div style={{ color: colors.SUBTEXT, marginTop: 6 }}>
              {selectedSlot
                ? (selectedSlot.employee_name?.split(" ")[0] || selectedSlot.employee_name)
                : selectedEmployee === "any"
                  ? "Dowolna osoba"
                  : (employees.find(e => e.id === selectedEmployee)?.name?.split(" ")[0] || "—")}
            </div>

            {/* + Dodatki button + count */}
            <div style={{ marginTop: 10 }}>
              <button
                onPointerDown={() => setAddonsOpen(!addonsOpen)}
                onTouchStart={(e) => e.stopPropagation()} // 🔹 zapobiega ghost-tapom przy scrollowaniu
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: colors.CARD_BG,
                  border: `1px solid ${colors.BORDER_LIGHT}`,
                  color: colors.TEXT,
                  borderRadius: 25,
                  cursor: "pointer",
                  fontSize: 13,

                  // 🔸 kluczowe mobilne fixy:
                  touchAction: "manipulation",             // usuwa 300ms delay tapnięcia
                  WebkitTapHighlightColor: "transparent",  // usuwa szary blink na iOS
                  userSelect: "none",                      // nie pozwala zaznaczyć tekstu
                  WebkitUserSelect: "none",
                  outline: "none",                         // usuwa focus outline
                  transform: "translateZ(0)",              // wymusza GPU compositing
                  willChange: "transform",                 // optymalizacja wydajności
                  transition: "background .2s ease, transform .15s ease",
                }}
              >
                <Plus size={14} />
                <span style={{ pointerEvents: "none" }}>
                  Dodatki{selectedAddons.length ? ` (${selectedAddons.length})` : ""}
                </span>
              </button>

              {/* dropdown list (stays open until toggled) */}
              {addonsOpen && (
                <div style={{
                  marginTop: 8,
                  background: colors.MUTED_BG,
                  border: `1px solid ${colors.BORDER_LIGHT}`,
                  borderRadius: 10,
                  padding: 10,
                  maxWidth: 520
                }}>
                  {addons.length === 0 ? (
                    <div style={{ color: colors.SUBTEXT }}>Brak dodatków</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {addons.map((a) => {
                        const selected = selectedAddons.some((x) => x.id === a.id);
                        return (
                          <div
                            key={a.id}
                            onPointerDown={() => toggleAddon(a)}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: selected ? colors.ADDON_SELECTED_BG : colors.CARD_BG,
                              cursor: "pointer"
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 14, color: colors.TEXT }}>{a.name}</div>
                              <div style={{ fontSize: 12, color: colors.SUBTEXT }}>
                                +{formatPrice(a.price)} zł • +{a.duration_minutes} min
                              </div>
                            </div>
                            <div>
                              {selected ? <Check size={18} color={colors.RING_COLOR} /> : <div style={{ width: 18, height: 18 }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: "right", minWidth: 120 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{formatPrice(totalPrice)} zł</div>
            <div style={{ color: colors.SUBTEXT, marginTop: 6 }}>
              {selectedSlot
                ? `${selectedSlot.start_time} – ${computedEndTime || selectedSlot.end_time}`
                : `${totalDuration} min`}
            </div>

          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              if (!selectedSlot) return; // ⛔️ brak slotu — nic nie rób
              setShowSummaryModal(true);
            }}
            disabled={!selectedSlot}
            style={{
              width: "100%",
              background: selectedSlot ? colors.RING_COLOR : (theme === "dark" ? "#333" : "#ccc"),
              border: "none",
              color: colors.CARD_BG,
              padding: "12px 14px",
              fontSize: 16,
              borderRadius: 10,
              cursor: selectedSlot ? "pointer" : "not-allowed",
              fontWeight: 600,
              transition: "background .2s ease, transform .15s ease",
              transform: "translateZ(0)",
              willChange: "transform",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
              outline: "none",
            }}
          >
            Dalej
          </button>
        </div>
      </div>

      {/* confirmation modal */}
      {showSummaryModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: colors.MODAL_BG,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            color: colors.TEXT,
            fontFamily: "Inter, system-ui, sans-serif",
            transition: "opacity 0.3s ease",
            padding: "24px 16px",
          }}
        >
          {/* ✅ Jeśli rezerwacja zakończona sukcesem */}
          {msg.includes("✅") ? (
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                textAlign: "center",
                padding: "40px 24px",
                background: colors.SECOND_BG,
                borderRadius: 20,
                boxShadow: theme === "dark" ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.06)",
              }}
            >
              <h2
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: colors.RING_COLOR,
                  marginBottom: 16,
                }}
              >
                🎉 Gratulacje!
              </h2>
              <p style={{ fontSize: 16, color: colors.SUBTEXT, lineHeight: 1.5 }}>
                Twoja wizyta została umówiona na{" "}
                <strong>
                  {prettyDate(date)}, godz. {selectedSlot?.start_time}
                </strong>
                .
              </p>
              <p style={{ color: colors.SUBTEXT, fontSize: 14, marginTop: 10 }}>
                Dziękujemy za skorzystanie z naszych usług!
              </p>

              <button
                onPointerDown={() => {
                  setMsg("");             // wyczyść komunikat
                  setShowSummaryModal(false); // zamknij modal
                  window.location.href = "/salons"; // 🔁 przekierowanie do salonów
                }}
                onTouchStart={(e) => e.stopPropagation()} // 🧤 zapobiega ghost-tapom w modalu
                style={{
                  marginTop: 28,
                  background: colors.RING_COLOR,
                  border: "none",
                  color: colors.CARD_BG,
                  fontWeight: 600,
                  borderRadius: 10,
                  fontSize: 16,
                  padding: "14px 0",
                  width: "100%",
                  cursor: "pointer",

                  // ✅ kluczowe fixy dla dotyku:
                  touchAction: "manipulation",             // brak 300ms opóźnienia tapnięcia
                  WebkitTapHighlightColor: "transparent",  // brak szarego blinku na iOS
                  userSelect: "none",                      // brak zaznaczania tekstu
                  WebkitUserSelect: "none",
                  outline: "none",                         // usuwa niebieską ramkę focusa
                  transform: "translateZ(0)",              // poprawia płynność dotyku
                  willChange: "transform",
                  transition: "background .2s ease, transform .15s ease",
                }}
              >
                Zamknij
              </button>
            </div>
          ) : (
            <>
              {/* 🔙 Nagłówek */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  maxWidth: 480,
                  marginBottom: 20,
                }}
              >
                <button
                  onPointerDown={() => setShowSummaryModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: colors.TEXT,
                    fontSize: 22,
                    cursor: "pointer",
                    marginRight: 10,
                  }}
                >
                  ←
                </button>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                  Sprawdź i potwierdź
                </h2>
              </div>

              {/* 📅 Data + godzina */}
              <div
                style={{
                  color: colors.SUBTEXT,
                  fontSize: 15,
                  marginBottom: 4,
                  width: "100%",
                  maxWidth: 480,
                }}
              >
                {prettyDate(date)} · {selectedSlot?.start_time}
              </div>

              {/* 🏠 Salon info */}
              {(() => {
                try {
                  const salon = JSON.parse(localStorage.getItem("selectedSalon"));
                  if (salon)
                    return (
                      <div
                        style={{
                          fontSize: 14,
                          color: colors.SUBTEXT,
                          marginBottom: 18,
                          width: "100%",
                          maxWidth: 480,
                        }}
                      >
                        {salon.name} · {salon.street} {salon.street_number},{" "}
                        {salon.city}
                      </div>
                    );
                } catch {
                  return null;
                }
              })()}

              {/* 💈 Szczegóły usługi */}
              <div
                style={{
                  width: "100%",
                  maxWidth: 480,
                  background: colors.SECOND_BG,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${colors.BORDER_LIGHT}`,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: colors.TEXT }}>
                      {service?.name || "Usługa"}
                    </div>
                    <div style={{ color: colors.SUBTEXT, fontSize: 13, marginTop: 4 }}>
                      Pracownik:{" "}
                      {selectedSlot
                        ? (selectedSlot.employee_name?.split(" ")[0] || selectedSlot.employee_name)
                        : selectedEmployee === "any"
                          ? "Dowolna osoba"
                          : (employees.find((e) => e.id === selectedEmployee)?.name?.split(" ")[0] || "—")}
                    </div>

                    {/* Dodatki */}
                    {selectedAddons.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            color: colors.SUBTEXT,
                            fontSize: 13,
                            marginBottom: 4,
                          }}
                        >
                          Dodatki:
                        </div>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 18,
                            color: colors.TEXT,
                            listStyleType: "disc",
                          }}
                        >
                          {selectedAddons.map((a) => (
                            <li
                              key={a.id}
                              style={{ fontSize: 13, marginBottom: 2 }}
                            >
                              {a.name} (+{formatPrice(a.price)} zł, +{a.duration_minutes} min)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: colors.TEXT }}>
                      {formatPrice(totalPrice)} zł
                    </div>
                    <div
                      style={{
                        color: colors.SUBTEXT,
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      {selectedSlot?.start_time} – {computedEndTime}
                    </div>
                  </div>
                </div>

                <hr style={{ borderColor: colors.BORDER_LIGHT, margin: "12px 0" }} />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 15,
                    color: colors.TEXT
                  }}
                >
                  <span>Suma</span>
                  <strong>{formatPrice(totalPrice)} zł</strong>
                </div>
              </div>

              {/* 💰 Płatność */}
              <div
                style={{
                  width: "100%",
                  maxWidth: 480,
                  textAlign: "center",
                  fontSize: 15,
                  marginBottom: 16,
                }}
              >
                <div style={{ color: colors.SUBTEXT }}>
                  Do zapłaty na miejscu:{" "}
                  <strong style={{ color: colors.TEXT }}>
                    {formatPrice(totalPrice)} zł
                  </strong>
                </div>
              </div>

              {/* 🟠 Przycisk potwierdzenia */}
              <button
                onClick={confirmBooking}
                style={{
                  width: "100%",
                  maxWidth: 480,
                  background: colors.RING_COLOR,
                  color: colors.CARD_BG,
                  border: "none",
                  padding: "14px 0",
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: theme === "dark" ? "0 4px 12px rgba(229,123,44,0.3)" : "0 4px 12px rgba(229,123,44,0.12)",
                }}
              >
                Potwierdź i umów
              </button>

              {/* ❌ Błąd */}
              {msg && !msg.includes("✅") && (
                <div
                  style={{
                    marginTop: 14,
                    background: colors.SUCCESS_BG,
                    padding: "8px 12px",
                    borderRadius: 8,
                    color: theme === "dark" ? "#ff7676" : "#b33",
                    textAlign: "center",
                    fontSize: 13,
                    width: "100%",
                    maxWidth: 480,
                  }}
                >
                  {msg}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* message */}
      {msg && <div style={{ position: "fixed", left: 20, bottom: 100, background: colors.SUCCESS_BG, padding: "8px 12px", borderRadius: 8, color: colors.TEXT }}>{msg}</div>}
    </div>
  );
}
