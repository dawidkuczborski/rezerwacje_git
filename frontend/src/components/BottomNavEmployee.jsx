import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, Users, Umbrella, Clock, Settings } from "lucide-react";
import TimeOffModal from "./TimeOffModal";

export default function BottomNavEmployee() {
    const location = useLocation();
    const [timeOffOpen, setTimeOffOpen] = useState(false);

    const isEmployeePage = location.pathname.startsWith("/employee");
    if (!isEmployeePage) return null;

    return (
        <>
            <nav
                className="
                    fixed bottom-0 left-0 w-full h-[70px]
                    bg-white dark:bg-neutral-900 shadow-lg border-t
                    flex items-center justify-around z-[9000]
                "
            >
                {/* 🟠 KALENDARZ */}
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

                {/* 🟢 KLIENCI */}
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

                {/* 🔵 URLOPY */}
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

                {/* 🟣 BLOKADA */}
                <button
                    onClick={() => setTimeOffOpen(true)}
                    className="flex flex-col items-center justify-center text-gray-500 text-xs hover:text-orange-500"
                >
                    <Clock size={22} />
                    <span className="text-[11px] mt-1">Blokada</span>
                </button>

                {/* ⚙️ USTAWIENIA — NOWE */}
                <NavLink
                    to="/employee/settings"
                    className={({ isActive }) =>
                        `flex flex-col items-center justify-center text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                        }`
                    }
                >
                    <Settings size={22} />
                    <span className="text-[11px] mt-1">Ustawienia</span>
                </NavLink>
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
