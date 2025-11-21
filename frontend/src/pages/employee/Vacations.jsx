import { useEffect, useState } from "react";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../../components/AuthProvider";
import VacationModal from "../../components/VacationModal";
import EditVacationModal from "../../components/EditVacationModal";

export default function Vacations() {
    const { firebaseUser } = useAuth();
    const backend = import.meta.env.VITE_API_URL;

    const [vacations, setVacations] = useState([]);
    const [employees, setEmployees] = useState([]);

    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [employeeFilter, setEmployeeFilter] = useState("all");

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const [openAdd, setOpenAdd] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [selectedVacation, setSelectedVacation] = useState(null);

    const [isProvider, setIsProvider] = useState(false);
    const limit = 10;
    const salonId = localStorage.getItem("selected_salon_id");

    const isDark = document.documentElement.classList.contains("dark");

    // 🔧 Format daty PL
    const formatDate = (d) =>
        new Date(d).toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });

    // -------------------------
    // LOAD EMPLOYEES
    // -------------------------
    const loadEmployees = async () => {
        if (!firebaseUser) return;

        const token = await firebaseUser.getIdToken();

        const res = await fetch(
            `${backend}/api/vacations/init?salon_id=${salonId}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        const data = await res.json();

        setIsProvider(data.is_provider);

        if (data.is_provider) {
            const merged = data.salons.flatMap((s) =>
                s.employees.map((e) => ({
                    id: e.id,
                    name: `${e.name} (${s.salon_name})`,
                }))
            );
            setEmployees(merged);
        } else {
            setEmployees(data.employees);
            setEmployeeFilter(data.employees[0].id);
        }
    };

    // -------------------------
    // LOAD VACATIONS
    // -------------------------
    const loadVacations = async (reset = false) => {
        if (!firebaseUser) return;

        setLoading(true);

        const token = await firebaseUser.getIdToken();

        const url = new URL(`${backend}/api/vacations/list`);
        url.searchParams.set("year", year);
        url.searchParams.set("month", month);
        url.searchParams.set("page", page);
        url.searchParams.set("limit", limit);
        url.searchParams.set("salon_id", salonId);

        if (isProvider && employeeFilter !== "all") {
            url.searchParams.set("employee_id", employeeFilter);
        }

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (reset) setVacations(data.items);
        else setVacations((prev) => [...prev, ...data.items]);

        setTotal(data.total);
        setLoading(false);
    };

    // INIT
    useEffect(() => {
        loadEmployees();
    }, [firebaseUser]);

    // Reload on filters change
    useEffect(() => {
        setPage(1);
        loadVacations(true);
    }, [year, month, employeeFilter, isProvider]);

    // Pagination
    useEffect(() => {
        if (page > 1) loadVacations();
    }, [page]);

    const loadMore = () => {
        if (vacations.length < total) setPage((p) => p + 1);
    };

    // -------------------------
    // UI
    // -------------------------

    const years = [2023, 2024, 2025, 2026];

    const months = [
        { id: 1, name: "Styczeń" },
        { id: 2, name: "Luty" },
        { id: 3, name: "Marzec" },
        { id: 4, name: "Kwiecień" },
        { id: 5, name: "Maj" },
        { id: 6, name: "Czerwiec" },
        { id: 7, name: "Lipiec" },
        { id: 8, name: "Sierpień" },
        { id: 9, name: "Wrzesień" },
        { id: 10, name: "Październik" },
        { id: 11, name: "Listopad" },
        { id: 12, name: "Grudzień" },
    ];

    return (
        <div
            className={`min-h-screen px-5 py-8 font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
                }`}
        >
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-semibold flex items-center gap-2">
                    <CalendarDays size={26} />
                    Urlopy
                </h1>

                <button
                    onClick={() => setOpenAdd(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-md"
                >
                    <Plus size={18} />
                    Dodaj
                </button>
            </div>

            {/* FILTERS */}
            <div className="space-y-3 mb-6">
                {isProvider && (
                    <select
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-sm"
                    >
                        <option value="all">Wszyscy pracownicy</option>
                        {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.name}
                            </option>
                        ))}
                    </select>
                )}

                <div className="flex gap-3">
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-sm"
                    >
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>

                    <select
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-sm"
                    >
                        {months.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* LISTA URLOPÓW */}
            <div className="space-y-4">
                {vacations.map((v, i) => (
                    <motion.div
                        key={v.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.03 }}
                        className={`p-4 rounded-2xl border shadow-md flex gap-4 items-start ${isDark
                                ? "bg-gray-800 border-gray-700"
                                : "bg-white border-gray-200"
                            }`}
                    >
                        {/* Avatar */}
                        {v.employee_image && (
                            <img
                                src={`${backend}/${v.employee_image}`}
                                className="w-12 h-12 rounded-full object-cover"
                                onError={(e) => (e.target.style.display = "none")}
                            />
                        )}

                        <div className="flex-1">
                            <div className="font-semibold text-lg">
                                {v.employee_name}
                            </div>

                            <div className="text-sm mt-1 opacity-80">
                                {formatDate(v.start_date)} → {formatDate(v.end_date)}
                            </div>

                            {v.reason && (
                                <div className="text-sm italic opacity-70 mt-1">
                                    {v.reason}
                                </div>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    setSelectedVacation(v);
                                    setOpenEdit(true);
                                }}
                                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                <Pencil size={16} />
                            </button>

                            <button
                                onClick={() => {
                                    setSelectedVacation(v);
                                    setOpenEdit(true);
                                }}
                                className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* LOAD MORE */}
            {vacations.length < total && (
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={loadMore}
                        className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-md"
                    >
                        {loading ? "Ładowanie..." : "Pokaż więcej"}
                    </button>
                </div>
            )}

            {/* MODALS */}
            <VacationModal
                open={openAdd}
                onClose={() => setOpenAdd(false)}
                onAdded={() => {
                    setOpenAdd(false);
                    setPage(1);
                    loadVacations(true);
                }}
            />

            <EditVacationModal
                open={openEdit}
                vacation={selectedVacation}
                onClose={() => setOpenEdit(false)}
                onUpdated={() => {
                    setOpenEdit(false);
                    setPage(1);
                    loadVacations(true);
                }}
                onDeleted={() => {
                    setOpenEdit(false);
                    setPage(1);
                    loadVacations(true);
                }}
            />
        </div>
    );
}
