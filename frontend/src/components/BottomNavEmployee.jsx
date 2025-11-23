import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
    CalendarDays,
    List,
    Users,
    Settings,
    Plus,
    X,
    Umbrella,
    Clock,
} from "lucide-react";

import NewAppointmentModal from "../components/NewAppointmentModal";
import VacationModal from "../components/VacationModal";
import TimeOffModal from "../components/TimeOffModal";

export default function BottomNavEmployee() {
    const location = useLocation();

    const [openFabMenu, setOpenFabMenu] = useState(false);

    const [openAppointment, setOpenAppointment] = useState(false);
    const [openVacation, setOpenVacation] = useState(false);
    const [openTimeOff, setOpenTimeOff] = useState(false);

    if (!location.pathname.startsWith("/employee")) return null;

    return (
        <>
            {/* TŁO POD MENU (ciemne tło) */}
            {openFabMenu && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9800]"
                    onClick={() => setOpenFabMenu(false)}
                />
            )}

            {/* MENU DOLNE */}
            <nav
                className="
                    fixed bottom-0 left-0 w-full h-[75px]
                    bg-white dark:bg-neutral-900 shadow-lg border-t
                    flex items-center justify-between px-4
                    z-[9999]
                "
            >
                {!openFabMenu ? (
                    <>
                        {/* ────── NORMALNE MENU ────── */}

                        {/* 1. KALENDARZ */}
                        <NavLink
                            to="/employee/calendar"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive
                                    ? "text-orange-600"
                                    : "text-gray-500"
                                }`
                            }
                        >
                            <CalendarDays size={22} />
                            <span className="text-[11px] mt-1">
                                Kalendarz
                            </span>
                        </NavLink>

                        {/* 2. REZERWACJE */}
                        <NavLink
                            to="/employee/reservations"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive
                                    ? "text-orange-600"
                                    : "text-gray-500"
                                }`
                            }
                        >
                            <List size={22} />
                            <span className="text-[11px] mt-1">
                                Rezerwacje
                            </span>
                        </NavLink>

                        {/* 3. FAB */}
                        <div className="flex-1 flex items-center justify-center">
                            <button
                                onClick={() =>
                                    setOpenFabMenu((v) => !v)
                                }
                                className="
                                    w-14 h-14 rounded-full bg-orange-500 text-white
                                    flex items-center justify-center shadow-xl
                                    active:scale-95 transition
                                "
                            >
                                <Plus size={28} />
                            </button>
                        </div>

                        {/* 4. KLIENCI */}
                        <NavLink
                            to="/employee/clients"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive
                                    ? "text-orange-600"
                                    : "text-gray-500"
                                }`
                            }
                        >
                            <Users size={22} />
                            <span className="text-[11px] mt-1">Klienci</span>
                        </NavLink>

                        {/* 5. USTAWIENIA */}
                        <NavLink
                            to="/employee/settings"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive
                                    ? "text-orange-600"
                                    : "text-gray-500"
                                }`
                            }
                        >
                            <Settings size={22} />
                            <span className="text-[11px] mt-1">
                                Ustawienia
                            </span>
                        </NavLink>
                    </>
                ) : (
                    <>
                        {/* ────── TRYB AKCJI ────── */}

                        {/* 1. DODAJ REZERWACJĘ */}
                        <button
                            onClick={() => {
                                setOpenAppointment(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs text-gray-700 dark:text-gray-200"
                        >
                            <Plus size={22} />
                            <span className="text-[11px] mt-1">
                                Rezerwacja
                            </span>
                        </button>

                        {/* 2. DODAJ URLOP */}
                        <button
                            onClick={() => {
                                setOpenVacation(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs text-gray-700 dark:text-gray-200"
                        >
                            <Umbrella size={22} />
                            <span className="text-[11px] mt-1">Urlop</span>
                        </button>

                        {/* 3. FAB = ZAMKNIJ */}
                        <div className="flex-1 flex items-center justify-center">
                            <button
                                onClick={() =>
                                    setOpenFabMenu(false)
                                }
                                className="
                                    w-14 h-14 rounded-full bg-gray-700 dark:bg-gray-600 text-white
                                    flex items-center justify-center shadow-xl
                                    active:scale-95 transition
                                "
                            >
                                <X size={28} />
                            </button>
                        </div>

                        {/* 4. DODAJ BLOKADĘ */}
                        <button
                            onClick={() => {
                                setOpenTimeOff(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs text-gray-700 dark:text-gray-200"
                        >
                            <Clock size={22} />
                            <span className="text-[11px] mt-1">
                                Blokada
                            </span>
                        </button>

                        {/* 5. USTAWIENIA */}
                        <NavLink
                            to="/employee/settings"
                            onClick={() => setOpenFabMenu(false)}
                            className="flex flex-col items-center flex-1 text-xs text-gray-700 dark:text-gray-200"
                        >
                            <Settings size={22} />
                            <span className="text-[11px] mt-1">
                                Ustawienia
                            </span>
                        </NavLink>
                    </>
                )}
            </nav>

            {/* MODALE */}
            <NewAppointmentModal
                open={openAppointment}
                onClose={() => setOpenAppointment(false)}
            />

            <VacationModal
                open={openVacation}
                onClose={() => setOpenVacation(false)}
            />

            <TimeOffModal
                open={openTimeOff}
                onClose={() => setOpenTimeOff(false)}
            />
        </>
    );
}
