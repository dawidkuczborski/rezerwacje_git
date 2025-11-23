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

    // 🔔 AKTYWACJA POWIADOMIEŃ WEB PUSH
    const enablePushNotifications = async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                alert("Musisz zezwolić na powiadomienia.");
                return;
            }

            // 1️⃣ Pobierz VAPID public key
            const resKey = await fetch(`${backend}/vapid/public`);
            const { key } = await resKey.json();

            // 2️⃣ Rejestracja service workera
            const reg = await navigator.serviceWorker.ready;

            // 3️⃣ Utwórz subskrypcję
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key),
            });

            // 4️⃣ Wyślij ją do backendu
            const token = await firebaseUser.getIdToken();
            await fetch(`${backend}/push/subscribe`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ subscription: sub })
            });

            alert("Powiadomienia zostały włączone! 🔔");

        } catch (err) {
            console.error("Push error:", err);
            alert("Błąd włączania powiadomień");
        }
    };

    function urlBase64ToUint8Array(base64) {
        const padding = "=".repeat((4 - (base64.length % 4)) % 4);
        const base64Safe = (base64 + padding)
            .replace(/\-/g, "+")
            .replace(/_/g, "/");
        const rawData = window.atob(base64Safe);
        const output = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            output[i] = rawData.charCodeAt(i);
        }
        return output;
    }


    const [isProvider, setIsProvider] = useState(false);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
    const [openGroup, setOpenGroup] = useState(null);

    const toggleTheme = () => {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        localStorage.setItem("theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
    };

    const handleLogout = () => {
        const savedTheme = localStorage.getItem("theme");
        localStorage.clear();

        if (savedTheme) localStorage.setItem("theme", savedTheme);

        logout();
    };

    const toggleGroup = (id) => {
        setOpenGroup((prev) => (prev === id ? null : id));
    };

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

    const providerOptions = [
        {
            id: "salon",
            label: "Ustawienia salonu",
            icon: Settings,
            children: [
                { id: "data", label: "Konfiguracja salonu" },
                { id: "services", label: "Usługi salonu" },
                { id: "portfolio", label: "Portfolio salonu" },
                { id: "holidays", label: "Dni wolne salonu" },
            ],
        },
        {
            id: "workers",
            label: "Pracownicy",
            icon: ShieldCheck,
            children: [
                { id: "employees", label: "Pracownicy" },
                { id: "assign", label: "Przypisz usługi" },
                { id: "schedule", label: "Dni i godziny pracy" },
            ],
        },
        {
            id: "Vacations",
            label: "Urlopy",
            icon: CalendarDays
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

        // 🔥 DODANE — "Urlopy" jako zwykły przycisk
        {
            id: "Vacations",
            label: "Urlopy",
            icon: CalendarDays
        }
    ];


    const options = isProvider ? providerOptions : employeeOptions;

    return (
        <div className="w-full min-h-screen pb-24 bg-[#f7f7f7] dark:bg-[#0d0d0d]">

            <div className="bg-[#e57b2c] pt-[calc(env(safe-area-inset-top)+14px)] pb-10 px-6">
                <h1 className="text-white text-[26px] font-semibold flex items-center gap-2">
                    <Settings size={24} />
                    Ustawienia
                </h1>
            </div>

            <div className="-mt-6">
                <div className="bg-white dark:bg-[#1a1a1a] rounded-t-[32px] px-6 py-6 shadow-sm">

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

                    <div className="space-y-3">
                        {options.map((group, i) => (
                            <div key={group.id}>
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => {
                                        if (!group.children) {
                                            // 🔥 bez submenu → przejście do urlopu
                                            if (group.id === "Vacations") navigate("/employee/vacations");
                                            return;
                                        }
                                        toggleGroup(group.id);
                                    }}
                                    className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <group.icon size={20} className="text-[#e57b2c]" />
                                        <span className="text-gray-900 dark:text-gray-100 text-[16px] font-medium">
                                            {group.label}
                                        </span>
                                    </div>

                                    {group.children && (
                                        openGroup === group.id ?
                                            <ChevronUp size={18} /> :
                                            <ChevronDown size={18} />
                                    )}
                                </motion.button>

                                <AnimatePresence>
                                    {group.children && openGroup === group.id && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="pl-5 space-y-2 mt-2"
                                        >
                                            {group.children.map((child) => {
                                                const handleClick = () => {
                                                    if (child.id === "data") navigate("/employee/salon");
                                                    if (child.id === "services") navigate("/employee/services");
                                                    if (child.id === "portfolio") navigate("/employee/portfolio");
                                                    if (child.id === "holidays") navigate("/employee/SalonHolidaysManager");
                                                    if (child.id === "employees") navigate("/employee/employees");
                                                    if (child.id === "assign") navigate("/employee/assign");
                                                    if (child.id === "schedule") navigate("/employee/schedule");
                                                    if (child.id === "vacations") navigate("/employee/vacations");
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

                                            {/* 🔥 DODAJ TO — tylko jeśli to sekcja Powiadomienia */}
                                            {group.id === "notifications" && (
                                                <div
                                                    onClick={enablePushNotifications}
                                                    className="bg-orange-500 text-white rounded-xl px-4 py-3 mt-2 text-[15px] font-medium cursor-pointer shadow-sm"
                                                >
                                                    🔔 Włącz powiadomienia PUSH
                                                </div>
                                            )}
                                        </motion.div>
                                    )}

                                </AnimatePresence>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 space-y-3 mb-20">
                        <button
                            onClick={toggleTheme}
                            className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3 text-[16px] font-medium text-gray-900 dark:text-gray-100"
                        >
                            Tryb: {theme === "light" ? "Jasny" : "Ciemny"}
                        </button>

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
