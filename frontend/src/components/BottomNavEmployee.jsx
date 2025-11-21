import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, LogOut, Users, Umbrella, Clock } from "lucide-react";
import { useAuth } from "./AuthProvider";
import TimeOffModal from "./TimeOffModal";

export default function BottomNavEmployee() {
    const location = useLocation();
    const { logout } = useAuth();

    const [timeOffOpen, setTimeOffOpen] = useState(false);

    const isEmployeePage = location.pathname.startsWith("/employee");
    if (!isEmployeePage) return null;

    // 🔥 Wylogowanie (bez zmian)
    const handleLogout = () => {
        if (!window.confirm("Czy na pewno chcesz się wylogować?")) return;

        const theme = localStorage.getItem("theme");
        localStorage.clear();
        if (theme) localStorage.setItem("theme", theme);

        logout();
        window.location.href = "/login";
    };

    return (
        <>
            <nav
                className="
                    fixed bottom-0 left-0 w-full h-[70px]
                    bg-white dark:bg-neutral-900 shadow-lg border-t
                    flex items-center justify-around z-[9000]
                "
            >
                {/* 🟠 KALENDARZ — BEZ ZMIAN */}
                <NavLink
                    to="/employee/calendar"
                    className={({ isActive }) =>
                        `flex flex-col items-center justify-center text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                        }`
                    }
                >
                    <CalendarDays size={22} />
                    <span className="text-[11px] mt-1">Kalendarz</span>
                </NavLink>

                {/* 🟢 KLIENCI — NOWY LINK */}
                <NavLink
                    to="/employee/clients"
                    className={({ isActive }) =>
                        `flex flex-col items-center justify-center text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                        }`
                    }
                >
                    <Users size={22} />
                    <span className="text-[11px] mt-1">Klienci</span>
                </NavLink>

                {/* 🔵 URLOPY — TERAZ LINK DO /employee/vacations */}
                <NavLink
                    to="/employee/vacations"
                    className={({ isActive }) =>
                        `flex flex-col items-center justify-center text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                        }`
                    }
                >
                    <Umbrella size={22} />
                    <span className="text-[11px] mt-1">Urlopy</span>
                </NavLink>

                {/* 🟣 BLOKADA — MODAL (bez zmian) */}
                <button
                    onClick={() => setTimeOffOpen(true)}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-orange-500"
                >
                    <Clock size={22} />
                    <span className="text-[11px] mt-1">Blokada</span>
                </button>

                {/* 🔴 WYLOGUJ — BEZ ZMIAN */}
                <button
                    onClick={handleLogout}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-red-500 transition"
                >
                    <LogOut size={22} />
                    <span className="text-[11px] mt-1">Wyloguj</span>
                </button>
            </nav>

            {/* Modal blokady */}
            <TimeOffModal
                open={timeOffOpen}
                onClose={() => setTimeOffOpen(false)}
                onUpdated={() => { }}
            />
        </>
    );
}
