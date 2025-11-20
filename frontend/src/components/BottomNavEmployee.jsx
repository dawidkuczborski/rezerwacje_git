import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, LogOut, User, Umbrella, Clock } from "lucide-react";
import { useAuth } from "./AuthProvider";
import VacationModal from "./VacationModal";
import TimeOffModal from "./TimeOffModal";

export default function BottomNavEmployee() {
    const location = useLocation();
    const { logout } = useAuth();

    const [vacationOpen, setVacationOpen] = useState(false);
    const [timeOffOpen, setTimeOffOpen] = useState(false);

    const isEmployeePage = location.pathname.startsWith("/employee");
    if (!isEmployeePage) return null;

    const toggleTheme = () => {
        const html = document.documentElement;
        const isDark = html.classList.contains("dark");
        const newTheme = isDark ? "light" : "dark";

        html.classList.toggle("dark", newTheme === "dark");
        localStorage.setItem("theme", newTheme);
        window.dispatchEvent(new Event("themeChanged"));
    };

    // 🔥 NOWA, POPRAWIONA FUNKCJA WYLOGOWANIA
    const handleLogout = () => {
        if (!window.confirm("Czy na pewno chcesz się wylogować?")) return;

        // zachowaj motyw
        const theme = localStorage.getItem("theme");

        // wyczyść wszystko
        localStorage.clear();

        // przywróć motyw
        if (theme) {
            localStorage.setItem("theme", theme);
        }

        // wylogowanie Firebase / systemowe
        logout();

        // przekierowanie
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

                <button
                    onClick={() => setVacationOpen(true)}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-blue-500"
                >
                    <Umbrella size={22} />
                    <span className="text-[11px] mt-1">Urlop</span>
                </button>

                <button
                    onClick={() => setTimeOffOpen(true)}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-orange-500"
                >
                    <Clock size={22} />
                    <span className="text-[11px] mt-1">Blokada</span>
                </button>

                <button
                    onClick={toggleTheme}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs"
                >
                    <User size={22} />
                    <span className="text-[11px] mt-1">Motyw</span>
                </button>

                <button
                    onClick={handleLogout}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-red-500 transition"
                >
                    <LogOut size={22} />
                    <span className="text-[11px] mt-1">Wyloguj</span>
                </button>
            </nav>

            <VacationModal
                open={vacationOpen}
                onClose={() => setVacationOpen(false)}
            />

            <TimeOffModal
                open={timeOffOpen}
                onClose={() => setTimeOffOpen(false)}
                onUpdated={() => { }}
            />
        </>
    );
}
