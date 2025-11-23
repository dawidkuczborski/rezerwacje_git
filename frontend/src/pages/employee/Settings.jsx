import { useEffect, useState } from "react";
import {
    Settings,
    ShieldCheck,
    UserCog,
    Bell,
    CalendarDays,
    FileText,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../components/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function PanelSettings() {
    const { firebaseUser, logout, backendUser } = useAuth();
    const backend = import.meta.env.VITE_API_URL;

    const navigate = useNavigate();

    const [isProvider, setIsProvider] = useState(false);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
    const [openGroup, setOpenGroup] = useState(null);

    // ==========================
    // TOGGLE THEME
    // ==========================
    const toggleTheme = () => {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        localStorage.setItem("theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
    };

    // ==========================
    // LOGOUT
    // ==========================
    const handleLogout = () => {
        const savedTheme = localStorage.getItem("theme");
        localStorage.clear();

        if (savedTheme) localStorage.setItem("theme", savedTheme);

        logout();
    };

    const toggleGroup = (id) => {
        setOpenGroup((prev) => (prev === id ? null : id));
    };

    // ==========================
    // LOAD USER DATA
    // ==========================
    const loadUserData = async () => {
        if (!firebaseUser) return;
        const token = await firebaseUser.getIdToken();

        const res = await fetch(`${backend}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        setIsProvider(data.is_provider || false);
        setLoading(false);
    };

    useEffect(() => {
        loadUserData();
    }, [firebaseUser]);

    if (loading) return <div className="p-6 text-gray-400">Ładowanie...</div>;

    // ==========================
    // PROVIDER MENU
    // ==========================
    const providerOptions = [
        {
            id: "salon",
            label: "Ustawienia salonu",
            icon: Settings,
            children: [
                { id: "data", label: "Konfiguracja salonu" },
                { id: "services", label: "Usługi salonu" },   
                { id: "hours", label: "Godziny otwarcia" },
                { id: "price", label: "Cennik" },
            ],

        },
        {
            id: "workers",
            label: "Pracownicy",
            icon: ShieldCheck,
            children: [
                { id: "list", label: "Lista pracowników" },
                { id: "add", label: "Dodaj pracownika" },
            ],
        },
        {
            id: "work",
            label: "Organizacja pracy",
            icon: CalendarDays,
            children: [
                { id: "vacations", label: "Urlopy" },
                { id: "schedule", label: "Harmonogram" },
            ],
        },
        {
            id: "info",
            label: "Informacje",
            icon: UserCog,
            children: [
                { id: "my-profile", label: "Mój profil" },
                { id: "notifications", label: "Powiadomienia" },
            ],
        },
        {
            id: "reports",
            label: "Raporty i rozliczenia",
            icon: FileText,
            children: [
                { id: "month", label: "Raporty miesięczne" },
                { id: "billing", label: "Rozliczenia" },
            ],
        },
    ];

    // ==========================
    // EMPLOYEE MENU
    // ==========================
    const employeeOptions = [
        {
            id: "profile",
            label: "Mój profil",
            icon: UserCog,
            children: [
                { id: "edit", label: "Edycja danych" },
                { id: "password", label: "Zmiana hasła" },
            ],
        },
        {
            id: "schedule",
            label: "Harmonogram",
            icon: CalendarDays,
            children: [{ id: "myschedule", label: "Mój grafik" }],
        },
        {
            id: "notifications",
            label: "Powiadomienia",
            icon: Bell,
            children: [{ id: "center", label: "Centrum powiadomień" }],
        },
        {
            id: "reports",
            label: "Raporty",
            icon: FileText,
            children: [{ id: "myreports", label: "Moje raporty" }],
        },
    ];

    const options = isProvider ? providerOptions : employeeOptions;

    // ==========================================================
    //                       RETURN UI
    // ==========================================================
    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">

            {/* HEADER */}
            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <Settings size={24} />
                    Ustawienia
                </h1>
            </div>

            {/* WHITE CARD */}
            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm">

                    {/* USER INFO */}
                    <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-3xl p-5 mb-6">
                        <div className="text-[18px] font-semibold text-gray-900 dark:text-gray-100">
                            {backendUser?.name}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 mt-1 text-[15px]">
                            {backendUser?.email}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-[15px]">
                            {backendUser?.phone}
                        </div>
                    </div>

                    {/* MENU */}
                    <div className="space-y-3">
                        {options.map((group, i) => (
                            <div key={group.id}>
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => toggleGroup(group.id)}
                                    className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <group.icon size={20} className="text-[#e57b2c]" />
                                        <span className="text-gray-900 dark:text-gray-100 text-[16px] font-medium">
                                            {group.label}
                                        </span>
                                    </div>

                                    {openGroup === group.id ? (
                                        <ChevronUp size={18} />
                                    ) : (
                                        <ChevronDown size={18} />
                                    )}
                                </motion.button>

                                {/* SUBMENU */}
                                <AnimatePresence>
                                    {openGroup === group.id && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="pl-5 space-y-2 mt-2"
                                        >
                                            {group.children.map((child) => {
                                                const handleClick = () => {
                                                    if (child.id === "data") {
                                                        navigate("/employee/salon");
                                                    }
                                                    if (child.id === "services") {
                                                        navigate("/employee/services"); 
                                                    }

                                                };

                                                return (
                                                    <div
                                                        key={child.id}
                                                        onClick={handleClick}
                                                        className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-[15px] text-gray-700 dark:text-gray-300 cursor-pointer"
                                                    >
                                                        {child.label}
                                                    </div>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>

                    {/* THEME + LOGOUT */}
                    <div className="mt-6 space-y-3 mb-20">
                        <button
                            onClick={toggleTheme}
                            className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3 text-[16px] font-medium text-gray-900 dark:text-gray-100"
                        >
                            Tryb: {theme === "light" ? "Jasny" : "Ciemny"}
                        </button>

                        {/* 🔥 Pomarańczowy przycisk WYLOGUJ */}
                        <button
                            onClick={handleLogout}
                            className="w-full bg-[#e57b2c] text-white rounded-2xl px-5 py-3 text-[16px] font-medium"
                        >
                            Wyloguj się
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
