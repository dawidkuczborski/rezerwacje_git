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

    // FORMATOWANIE DATY
    const formatDate = (d) =>
        new Date(d).toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });

    // ---------------------------------
    // ŁADOWANIE PRACOWNIKÓW
    // ---------------------------------
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
            if (data.employees?.length > 0) {
                setEmployeeFilter(data.employees[0].id);
            }
        }
    };

    // ---------------------------------
    // ŁADOWANIE URLOPÓW
    // ---------------------------------
    const loadVacations = async (reset = false) => {
        if (!firebaseUser) return;

        setLoading(true);

        const token = await firebaseUser.getIdToken();

        const baseUrl = backend
            ? `${backend}/api/vacations/list`
            : `/api/vacations/list`;

        const url = new URL(baseUrl, window.location.origin);

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

    // reload on filters
    useEffect(() => {
        setPage(1);
        loadVacations(true);
    }, [year, month, employeeFilter, isProvider]);

    // pagination
    useEffect(() => {
        if (page > 1) loadVacations();
    }, [page]);

    const loadMore = () => {
        if (vacations.length < total) setPage((p) => p + 1);
    };

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
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">
            {/* HEADER */}
            <div className="bg-[#e57b2c] dark:bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <CalendarDays size={24} />
                    Urlopy
                </h1>
            </div>

            {/* WHITE CARD */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm">
                    {/* FILTERS */}
                    <div className="space-y-4 mb-4">
                        {isProvider && (
                            <select
                                value={employeeFilter}
                                onChange={(e) => setEmployeeFilter(e.target.value)}
                                className="w-full bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl py-3 px-4 text-[15px]"
                            >
                                <option value="all">Wszyscy pracownicy</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name}
                                    </option>
                                ))}
                            </select>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3">
                            <select
                                value={year}
                                onChange={(e) => setYear(Number(e.target.value))}
                                className="w-full bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl py-3 px-4 text-[15px]"
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
                                className="w-full bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl py-3 px-4 text-[15px]"
                            >
                                {months.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* ADD BUTTON */}
                        <button
                            onClick={() => setOpenAdd(true)}
                            className="w-full bg-[#e57b2c] dark:bg-[#e57b2c] text-white rounded-2xl py-3 flex items-center justify-center gap-2 text-[15px] font-medium"
                        >
                            <Plus size={18} />
                            Dodaj urlop
                        </button>
                    </div>

                    {/* LISTA URLOPÓW */}
                    <div className="space-y-3">
                        {vacations.map((v, i) => (
                            <motion.div
                                key={v.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.02 }}
                                className="bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 rounded-3xl px-5 py-4 flex items-start gap-4"
                            >
                                {/* AVATAR */}
                                {v.employee_image && (
                                    <img
                                        src={`${backend}/${v.employee_image}`}
                                        className="w-12 h-12 rounded-full object-cover mt-1"
                                        onError={(e) => {
                                            e.target.style.display = "none";
                                        }}
                                    />
                                )}

                                {/* TEXT */}
                                <div className="flex-1">
                                    <div className="text-[16px] font-semibold text-gray-900 dark:text-gray-100">
                                        {v.employee_name}
                                    </div>

                                    <div className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                                        {formatDate(v.start_date)} — {formatDate(v.end_date)}
                                    </div>

                                    {v.reason && (
                                        <div className="text-[13px] italic text-gray-500 dark:text-gray-400 mt-1">
                                            {v.reason}
                                        </div>
                                    )}
                                </div>

                                {/* ACTION BUTTONS */}
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedVacation(v);
                                            setOpenEdit(true);
                                        }}
                                        className="p-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                                    >
                                        <Pencil size={16} />
                                    </button>


                                </div>
                            </motion.div>
                        ))}

                        {/* LOAD MORE */}
                        {vacations.length < total && (
                            <button
                                onClick={loadMore}
                                className="w-full bg-[#e57b2c] dark:bg-[#e57b2c] text-white rounded-full py-2.5 mt-2"
                            >
                                {loading ? "Ładowanie..." : "Pokaż więcej"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* MODALE */}
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
