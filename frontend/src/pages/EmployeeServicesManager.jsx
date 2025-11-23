import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

export default function EmployeeServicesManager() {
    const { firebaseUser } = useAuth();
    const backendBase = import.meta.env.VITE_API_URL;

    const [salons, setSalons] = useState([]);
    const [selectedSalon, setSelectedSalon] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [msg, setMsg] = useState("");

    // -------------------------------
    // Pobierz salony
    // -------------------------------
    const loadSalons = async () => {
        try {
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(`${backendBase}/api/salons/mine/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSalons(res.data || []);
        } catch (err) {
            console.error("❌ Błąd pobierania salonów:", err);
        }
    };

    // -------------------------------
    // Pobierz dane salonu
    // -------------------------------
    const loadSalonData = async (salonId) => {
        try {
            const token = await firebaseUser.getIdToken();

            const [empRes, srvRes, assignRes] = await Promise.all([
                axios.get(`${backendBase}/api/employees/mine`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { salon_id: salonId },
                }),
                axios.get(`${backendBase}/api/services/by-salon/${salonId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                axios.get(`${backendBase}/api/employee-services`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { salon_id: salonId },
                }),
            ]);

            const map = {};
            assignRes.data.forEach((a) => {
                if (!map[a.employee_id]) map[a.employee_id] = [];
                map[a.employee_id].push(a.service_id);
            });

            setEmployees(empRes.data || []);
            setServices(srvRes.data || []);
            setAssignments(map);
        } catch (err) {
            console.error("❌ Błąd pobierania danych:", err);
        }
    };

    useEffect(() => {
        if (firebaseUser) loadSalons();
    }, [firebaseUser]);

    useEffect(() => {
        if (selectedSalon) loadSalonData(selectedSalon.id);
    }, [selectedSalon]);

    // -------------------------------
    // Toggle assignment
    // -------------------------------
    const toggleAssignment = async (employeeId, serviceId, assigned) => {
        try {
            const token = await firebaseUser.getIdToken();

            await axios.post(
                `${backendBase}/api/employee-services/toggle`,
                {
                    employee_id: employeeId,
                    service_id: serviceId,
                    assigned,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setMsg("✅ Zaktualizowano!");
            loadSalonData(selectedSalon.id);
        } catch (err) {
            console.error(err);
            setMsg("❌ Błąd aktualizacji");
        }
    };

    // -------------------------------
    // UI
    // -------------------------------
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">

            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold">
                    Przypisywanie usług
                </h1>
                <p className="text-white/80 text-[13px] mt-1">
                    Wybierz salon i zdecyduj, który pracownik wykonuje którą usługę.
                </p>
            </div>

            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm max-w-3xl mx-auto">

                    {/* SALONY */}
                    <h2 className="text-[18px] font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Wybierz salon:
                    </h2>

                    <div className="space-y-3 mb-6">
                        {salons.map((s, i) => (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => setSelectedSalon(s)}
                                className={`cursor-pointer bg-white dark:bg-[#2a2a2a] border rounded-3xl px-5 py-4 flex items-center gap-4 transition 
                                    ${selectedSalon?.id === s.id
                                        ? "border-[#e57b2c]"
                                        : "border-gray-200 dark:border-gray-700"
                                    }
                                    hover:shadow-md`}
                            >
                                {s.image_url && (
                                    <img
                                        src={`${backendBase}/uploads/${s.image_url}`}
                                        className="w-14 h-14 rounded-2xl object-cover"
                                        alt=""
                                    />
                                )}

                                <div className="flex-1">
                                    <div className="text-[15px] font-semibold">
                                        {s.name}
                                    </div>
                                    <div className="text-[13px] text-gray-500 dark:text-gray-400">
                                        {s.city}, {s.street} {s.street_number}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* BRAK SALONU */}
                    {!selectedSalon && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Wybierz salon, aby zarządzać przypisaniami
                        </p>
                    )}

                    {/* DANE SALONU */}
                    {selectedSalon && (
                        <div className="mt-6">

                            <h3 className="text-[16px] font-semibold mb-4 text-gray-900 dark:text-gray-100">
                                Usługi → Pracownicy
                            </h3>

                            {msg && (
                                <p
                                    className={`text-sm mb-4 ${msg.startsWith("✅")
                                            ? "text-green-500"
                                            : "text-red-500"
                                        }`}
                                >
                                    {msg}
                                </p>
                            )}

                            {/* LISTA USŁUG */}
                            <div className="space-y-5">
                                {services.map((srv) => (
                                    <div
                                        key={srv.id}
                                        className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            {srv.image_url ? (
                                                <img
                                                    src={`${backendBase}/uploads/${srv.image_url}`}
                                                    className="w-14 h-14 rounded-xl object-cover"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-xl bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-600">
                                                    brak
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                    {srv.name}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    {srv.price} zł · {srv.duration_minutes} min
                                                </p>
                                            </div>
                                        </div>

                                        {/* Lista pracowników */}
                                        <div className="space-y-3">
                                            {employees.map((emp) => {
                                                const checked = assignments[emp.id]?.includes(srv.id);

                                                return (
                                                    <label
                                                        key={emp.id}
                                                        className="flex items-center justify-between bg-gray-100 dark:bg-[#1f1f1f] border border-gray-300 dark:border-gray-800 rounded-2xl px-4 py-3"
                                                    >
                                                        <p className="text-[15px] font-medium truncate">
                                                            {emp.name}
                                                        </p>

                                                        <input
                                                            type="checkbox"
                                                            checked={checked || false}
                                                            onChange={(e) =>
                                                                toggleAssignment(emp.id, srv.id, e.target.checked)
                                                            }
                                                            className="w-5 h-5"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>

                                    </div>
                                ))}

                                {services.length === 0 && (
                                    <p className="text-sm text-gray-500">
                                        Brak usług w tym salonie.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
