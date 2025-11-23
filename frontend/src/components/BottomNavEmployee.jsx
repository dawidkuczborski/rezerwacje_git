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
    Bell,
} from "lucide-react";

import NewAppointmentModal from "../components/NewAppointmentModal";
import VacationModal from "../components/VacationModal";
import TimeOffModal from "../components/TimeOffModal";

import { subscribeToPush } from "../utils/pushNotifications";

export default function BottomNavEmployee() {
    const location = useLocation();

    const [openFabMenu, setOpenFabMenu] = useState(false);
    const [openNotifications, setOpenNotifications] = useState(false);

    const [openAppointment, setOpenAppointment] = useState(false);
    const [openVacation, setOpenVacation] = useState(false);
    const [openTimeOff, setOpenTimeOff] = useState(false);

    // 🔔 PRZYKŁADOWE POWIADOMIENIA (na razie statyczne)
    const [notifications, setNotifications] = useState([
        { id: 1, text: "Nowa rezerwacja od Jan Kowalski" },
        { id: 2, text: "Klient odwołał wizytę" },
        { id: 3, text: "Jutro masz 5 wizyt" },
        { id: 4, text: "Ważna aktualizacja systemu" },
        { id: 5, text: "Nowa wiadomość w czacie" },
    ]);

    if (!location.pathname.startsWith("/employee")) return null;

    // ❌ usuwanie powiadomienia po przeciągnięciu
    const handleSwipeDelete = (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    return (
        <>
            {/* 🔔 DZWONEK NAD MENU (po prawej stronie) */}
            <div className="fixed bottom-[95px] right-6 z-[9999]">
                <button
                    className="relative p-3 bg-white dark:bg-neutral-900 rounded-full shadow-lg border"
                    onClick={async () => {
                        await subscribeToPush(); // 👉 tu rejestrujemy WebPush
                        setOpenNotifications(true);
                    }}
                >
                    <Bell size={26} />

                    {notifications.length > 0 && (
                        <span
                            className="
                                absolute -top-1 -right-1 bg-red-600 text-white 
                                text-[11px] w-5 h-5 flex items-center justify-center 
                                rounded-full
                            "
                        >
                            {notifications.length}
                        </span>
                    )}
                </button>
            </div>

            {/* 🔔 TŁO PANELU POWIADOMIEŃ */}
            {openNotifications && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
                    onClick={() => setOpenNotifications(false)}
                />
            )}

            {/* 🔔 PANEL POWIADOMIEŃ */}
            {openNotifications && (
                <div
                    className="
                        fixed top-0 right-0 w-[85%] max-w-[350px] h-full 
                        bg-white dark:bg-neutral-900 shadow-xl z-[9999]
                        p-4 flex flex-col
                    "
                >
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">Powiadomienia</h2>
                        <button onClick={() => setOpenNotifications(false)}>
                            <X size={22} />
                        </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-1">
                        {notifications.map((n) => (
                            <div
                                key={n.id}
                                draggable
                                onDragEnd={() => handleSwipeDelete(n.id)}
                                className="
                                    p-3 bg-gray-100 dark:bg-gray-800 rounded-xl 
                                    shadow text-sm cursor-grab active:scale-[0.97]
                                "
                            >
                                {n.text}
                            </div>
                        ))}

                        {notifications.length === 0 && (
                            <p className="text-gray-500 text-center text-sm mt-6">
                                Brak powiadomień
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* TŁO POD MENU */}
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
                        {/* 1. KALENDARZ */}
                        <NavLink
                            to="/employee/calendar"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive ? "text-orange-600" : "text-gray-500"}`
                            }
                        >
                            <CalendarDays size={22} />
                            <span className="text-[11px] mt-1">Kalendarz</span>
                        </NavLink>

                        {/* 2. REZERWACJE */}
                        <NavLink
                            to="/employee/reservations"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs
                                ${isActive ? "text-orange-600" : "text-gray-500"}`
                            }
                        >
                            <List size={22} />
                            <span className="text-[11px] mt-1">Rezerwacje</span>
                        </NavLink>

                        {/* 3. FAB */}
                        <div className="flex-1 flex items-center justify-center">
                            <button
                                onClick={() => setOpenFabMenu((v) => !v)}
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
                                ${isActive ? "text-orange-600" : "text-gray-500"}`
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
                                ${isActive ? "text-orange-600" : "text-gray-500"}`
                            }
                        >
                            <Settings size={22} />
                            <span className="text-[11px] mt-1">Ustawienia</span>
                        </NavLink>
                    </>
                ) : (
                    <>
                        {/* TRYB FAB */}
                        <button
                            onClick={() => {
                                setOpenAppointment(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs"
                        >
                            <Plus size={22} />
                            <span className="text-[11px] mt-1">Rezerwacja</span>
                        </button>

                        <button
                            onClick={() => {
                                setOpenVacation(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs"
                        >
                            <Umbrella size={22} />
                            <span className="text-[11px] mt-1">Urlop</span>
                        </button>

                        <div className="flex-1 flex items-center justify-center">
                            <button
                                onClick={() => setOpenFabMenu(false)}
                                className="
                                    w-14 h-14 rounded-full bg-gray-700 text-white
                                    flex items-center justify-center shadow-xl
                                    active:scale-95 transition
                                "
                            >
                                <X size={28} />
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                setOpenTimeOff(true);
                                setOpenFabMenu(false);
                            }}
                            className="flex flex-col items-center flex-1 text-xs"
                        >
                            <Clock size={22} />
                            <span className="text-[11px] mt-1">Blokada</span>
                        </button>

                        <NavLink
                            to="/employee/settings"
                            onClick={() => setOpenFabMenu(false)}
                            className="flex flex-col items-center flex-1 text-xs"
                        >
                            <Settings size={22} />
                            <span className="text-[11px] mt-1">Ustawienia</span>
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
