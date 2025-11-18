import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";

export default function EmployeeServicesManager() {
  const { firebaseUser } = useAuth();
  const backendBase = "http://localhost:5000";

  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [msg, setMsg] = useState("");

  // --- Pobierz listę salonów właściciela ---
  const loadSalons = async () => {
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await axios.get(`${backendBase}/api/salons/mine/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSalons(resp.data);
    } catch (err) {
      console.error("❌ Błąd pobierania salonów:", err);
    }
  };

  // --- Pobierz pracowników, usługi i przypisania wybranego salonu ---
  const loadSalonData = async (salonId) => {
    try {
      const token = await firebaseUser.getIdToken();

      const [empRes, srvRes, assignRes] = await Promise.all([
        axios.get(`${backendBase}/api/employees/mine`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { salon_id: salonId },
        }),
        axios.get(`${backendBase}/api/services/mine`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { salon_id: salonId },
        }),
        axios.get(`${backendBase}/api/employee-services`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { salon_id: salonId },
        }),
      ]);

      // 🔹 Zbuduj mapę przypisań { [employee_id]: [service_id, ...] }
      const map = {};
      assignRes.data.forEach((row) => {
        if (!map[row.employee_id]) map[row.employee_id] = [];
        if (row.service_id) map[row.employee_id].push(row.service_id);
      });

      setEmployees(empRes.data);
      setServices(srvRes.data);
      setAssignments(map);
    } catch (err) {
      console.error("❌ Błąd pobierania danych salonu:", err);
    }
  };

  useEffect(() => {
    if (firebaseUser) loadSalons();
  }, [firebaseUser]);

  useEffect(() => {
    if (selectedSalon) loadSalonData(selectedSalon.id);
  }, [selectedSalon]);

  // --- Przełącz przypisanie (checkbox) ---
  const toggleAssignment = async (employeeId, serviceId, assigned) => {
    try {
      const token = await firebaseUser.getIdToken();
      await axios.post(
        `${backendBase}/api/employee-services/toggle`,
        { employee_id: employeeId, service_id: serviceId, assigned },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMsg("✅ Zaktualizowano przypisanie");
      loadSalonData(selectedSalon.id);
    } catch (err) {
      console.error("❌ Błąd aktualizacji przypisania:", err);
      setMsg("❌ Nie udało się zaktualizować przypisania");
    }
  };

  return (
    <div style={{ maxWidth: 950, margin: "0 auto" }}>
      <h2>🔗 Przypisywanie usług do pracowników</h2>

      {/* --- Wybór salonu --- */}
      <label>
        🏠 Wybierz salon:
        <select
          value={selectedSalon?.id || ""}
          onChange={(e) => {
            const s = salons.find((x) => x.id === Number(e.target.value));
            setSelectedSalon(s || null);
          }}
          style={{ marginLeft: 10 }}
        >
          <option value="">-- wybierz salon --</option>
          {salons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.city})
            </option>
          ))}
        </select>
      </label>

      {!selectedSalon ? (
        <p>👉 Wybierz salon, aby przypisać usługi do pracowników</p>
      ) : employees.length === 0 || services.length === 0 ? (
        <p>⏳ Ładowanie danych...</p>
      ) : (
        <>
          <p style={{ color: msg.startsWith("✅") ? "green" : "red" }}>{msg}</p>

          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={{ textAlign: "left" }}>Pracownik</th>
                {services.map((srv) => (
                  <th key={srv.id}>{srv.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <b>{emp.name}</b>
                    <br />
                    <small>{emp.email}</small>
                  </td>
                  {services.map((srv) => (
                    <td key={srv.id} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={assignments[emp.id]?.includes(srv.id) || false}
                        onChange={(e) =>
                          toggleAssignment(emp.id, srv.id, e.target.checked)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
