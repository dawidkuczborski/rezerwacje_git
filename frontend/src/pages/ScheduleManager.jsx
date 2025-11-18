import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";

export default function ScheduleManager() {
  const { firebaseUser } = useAuth();
  const backendBase = "http://localhost:5000";

  const [tab, setTab] = useState("hours"); // "hours" | "holidays" | "vacations"
  const [schedule, setSchedule] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [msg, setMsg] = useState("");

  const days = [
    "Niedziela",
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota",
  ];

  // 🧭 Pomocnicze formatowanie dat
  const fmtDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return dt.toISOString().split("T")[0]; // YYYY-MM-DD
  };

  const prettyDate = (d) => {
    try {
      return new Date(d).toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
    } catch {
      return d;
    }
  };

  // 🔹 Ładowanie pracowników
  useEffect(() => {
    if (!firebaseUser) return;
    const loadEmployees = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const emp = await axios.get(`${backendBase}/api/employees/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setEmployees(emp.data);
      } catch (err) {
        console.error("❌ Błąd ładowania pracowników:", err);
      }
    };
    loadEmployees();
  }, [firebaseUser]);

  // 🔹 Ładowanie świąt i urlopów
  useEffect(() => {
    if (!firebaseUser) return;
    const loadExtras = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const [hol, vac] = await Promise.all([
          axios.get(`${backendBase}/api/schedule/holidays`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${backendBase}/api/schedule/vacations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setHolidays(hol.data);
        setVacations(vac.data);
      } catch (err) {
        console.error("❌ Błąd ładowania dni wolnych lub urlopów:", err);
        setMsg("❌ Błąd ładowania dni wolnych lub urlopów");
      }
    };
    loadExtras();
  }, [firebaseUser]);

  // 🔹 Ładowanie harmonogramu
  const loadSchedule = async (employeeId) => {
    try {
      const token = await firebaseUser.getIdToken();
      const res = await axios.get(`${backendBase}/api/schedule/employee/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.length) {
        setSchedule(res.data);
      } else {
        setSchedule(
          Array.from({ length: 7 }, (_, i) => ({
            day_of_week: i,
            open_time: "09:00",
            close_time: "17:00",
            is_day_off: i === 0,
          }))
        );
      }
      setMsg("");
    } catch (err) {
      console.error("❌ Błąd ładowania harmonogramu:", err);
      setMsg("❌ Błąd ładowania harmonogramu");
    }
  };

  // 🔹 Zapis harmonogramu
  const saveSchedule = async () => {
    if (!selectedEmployee) {
      setMsg("⚠️ Wybierz pracownika przed zapisem!");
      return;
    }
    try {
      const token = await firebaseUser.getIdToken();
      await axios.post(
        `${backendBase}/api/schedule/employee/${selectedEmployee}`,
        { schedule },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMsg("✅ Harmonogram zapisany");
    } catch {
      setMsg("❌ Błąd zapisu harmonogramu");
    }
  };

  // 🔹 Dodawanie dnia wolnego (święta)
  const addHoliday = async (date, reason) => {
    try {
      const formattedDate = fmtDate(date); // tylko YYYY-MM-DD
      const token = await firebaseUser.getIdToken();
      await axios.post(
        `${backendBase}/api/schedule/holidays`,
        { date: formattedDate, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMsg("✅ Dzień wolny dodany");

      const hol = await axios.get(`${backendBase}/api/schedule/holidays`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHolidays(hol.data);
    } catch (err) {
      console.error("❌ Błąd przy dodawaniu dnia wolnego:", err);
      setMsg("❌ Błąd przy dodawaniu dnia wolnego");
    }
  };

  // 🔹 Dodawanie urlopu
  const addVacation = async (employee_id, start_date, end_date, reason) => {
    try {
      const token = await firebaseUser.getIdToken();
      const formattedStart = fmtDate(start_date);
      const formattedEnd = fmtDate(end_date);

      await axios.post(
        `${backendBase}/api/schedule/vacations`,
        {
          employee_id,
          start_date: formattedStart,
          end_date: formattedEnd,
          reason,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMsg("✅ Urlop dodany");
      const vac = await axios.get(`${backendBase}/api/schedule/vacations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVacations(vac.data);
    } catch (err) {
      console.error("❌ Błąd przy dodawaniu urlopu:", err);
      setMsg("❌ Błąd przy dodawaniu urlopu");
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <h2>🕒 Harmonogram pracy</h2>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setTab("hours")}>Godziny pracy</button>{" "}
        <button onClick={() => setTab("holidays")}>Święta / dni wolne</button>{" "}
        <button onClick={() => setTab("vacations")}>Urlopy pracowników</button>
      </div>

      {/* --- GODZINY PRACY --- */}
      {tab === "hours" && (
        <div>
          <h3>👥 Wybierz pracownika:</h3>
          <select
            value={selectedEmployee}
            onChange={(e) => {
              setSelectedEmployee(e.target.value);
              loadSchedule(e.target.value);
            }}
            style={{ marginBottom: 15 }}
          >
            <option value="">-- Wybierz pracownika --</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>

          {selectedEmployee && (
            <>
              <table
                border="1"
                cellPadding="6"
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th>Dzień</th>
                    <th>Otwarcie</th>
                    <th>Zamknięcie</th>
                    <th>Wolne</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((d, idx) => (
                    <tr key={idx}>
                      <td>{days[d.day_of_week]}</td>
                      <td>
                        <input
                          type="time"
                          value={d.open_time}
                          onChange={(e) =>
                            setSchedule((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, open_time: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={d.close_time}
                          onChange={(e) =>
                            setSchedule((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, close_time: e.target.value } : x
                              )
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={d.is_day_off}
                          onChange={(e) =>
                            setSchedule((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, is_day_off: e.target.checked } : x
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button style={{ marginTop: 10 }} onClick={saveSchedule}>
                💾 Zapisz harmonogram
              </button>
            </>
          )}
        </div>
      )}

      {/* --- ŚWIĘTA --- */}
      {tab === "holidays" && (
        <div>
          <h3>🎉 Święta i dni wolne</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addHoliday(e.target.date.value, e.target.reason.value);
              e.target.reset();
            }}
          >
            <input type="date" name="date" required />
            <input placeholder="Powód" name="reason" />
            <button type="submit">➕ Dodaj</button>
          </form>
          <ul>
            {holidays.map((h) => (
              <li key={h.id}>
                📅 {prettyDate(h.date)} — {h.reason || "brak powodu"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- URLOPY --- */}
      {tab === "vacations" && (
        <div>
          <h3>🏖️ Urlopy pracowników</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addVacation(
                e.target.employee.value,
                e.target.start.value,
                e.target.end.value,
                e.target.reason.value
              );
              e.target.reset();
            }}
          >
            <select name="employee" required>
              <option value="">Wybierz pracownika</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
            <input type="date" name="start" required />
            <input type="date" name="end" required />
            <input placeholder="Powód" name="reason" />
            <button type="submit">➕ Dodaj urlop</button>
          </form>

          <ul>
            {vacations.map((v) => (
              <li key={v.id}>
                🧍‍♂️ {v.employee_name} — {prettyDate(v.start_date)} →{" "}
                {prettyDate(v.end_date)} ({v.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ marginTop: 15 }}>{msg}</p>
    </div>
  );
}
