import React, { useState, useEffect } from "react";
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

import { motion } from "framer-motion";

import NewAppointmentModal from "../components/NewAppointmentModal";
import VacationModal from "../components/VacationModal";
import TimeOffModal from "../components/TimeOffModal";

export default function BottomNavEmployee() {
    const location = useLocation();

    const [openFabMenu, setOpenFabMenu] = useState(false);
    const [openNotifications, setOpenNotifications] = useState(false);

    const [openAppointment, setOpenAppointment] = useState(false);
    const [openVacation, setOpenVacation] = useState(false);
    const [openTimeOff, setOpenTimeOff] = useState(false);

    const [notifications, setNotifications] = useState([]);

    // ======================================================
    // 🔥 POBIERANIE POWIADOMIEŃ
    // ======================================================
    async function fetchNotifications() {
        try {
            const token = localStorage.getItem("authToken");
            if (!token) return;

            const res = await fetch(import.meta.env.VITE_API_URL + "/notifications", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
            });

            if (!res.ok) return;

            const data = await res.json();
            if (Array.isArray(data)) setNotifications(data);
        } catch (err) {
            console.error("❌ Błąd pobierania powiadomień:", err);
        }
    }

    // ======================================================
    // 🔥 OZNACZ JEDNO POWIADOMIENIE
    // ======================================================
    async function markNotificationAsRead(notification, navigateToUrl = true) {
        try {
            const token = localStorage.getItem("authToken");
            if (!token) return;

            await fetch(import.meta.env.VITE_API_URL + "/notifications/mark-read", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
                body: JSON.stringify({ id: notification.id }),
            });
        } catch (err) {
            console.error("❌ mark-read:", err);
        } finally {
            setNotifications((prev) => prev.filter((n) => n.id !== notification.id));

            if (navigateToUrl && notification.url) {
                window.location.href = notification.url;
            }
        }
    }

    // ======================================================
    // 🔥 OZNACZ WSZYSTKIE POWIADOMIENIA
    // ======================================================
    async function markAllNotifications() {
        try {
            const token = localStorage.getItem("authToken");
            if (!token) return;

            await fetch(import.meta.env.VITE_API_URL + "/notifications/mark-all-read", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
            });

            setNotifications([]); // lokalnie usuń
        } catch (err) {
            console.error("❌ mark-all-read:", err);
        }
    }

    // ======================================================
    // 🔥 AUTO REFRESH CO 10 SEK
    // ======================================================
    useEffect(() => {
        if (!location.pathname.startsWith("/employee")) return;

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 10000);

        return () => clearInterval(interval);
    }, [location.pathname]);

    if (!location.pathname.startsWith("/employee")) return null;

    return (
        <>
            {/* 🔔 DZWONEK */}
            <div className="fixed bottom-[95px] right-6 z-[9999]">
                <button
                    className="relative p-3 bg-white dark:bg-neutral-900 rounded-full shadow-lg border"
                    onClick={() => setOpenNotifications(true)}
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

            {/* TŁO */}
            {openNotifications && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
                    onClick={() => setOpenNotifications(false)}
                />
            )}

            {/* PANEL */}
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

                        {notifications.length > 0 && (
                            <button
                                onClick={markAllNotifications}
                                className="text-xs text-red-600 underline mr-3"
                            >
                                Usuń wszystkie
                            </button>
                        )}

                        <button onClick={() => setOpenNotifications(false)}>
                            <X size={22} />
                        </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-1">
                        {notifications.map((n) => (
                            <motion.div
                                key={n.id}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                onDragEnd={(event, info) => {
                                    if (Math.abs(info.offset.x) > 80) {
                                        markNotificationAsRead(n, false);
                                    }
                                }}
                                className="
                                    p-3 bg-gray-100 dark:bg-gray-800 rounded-xl 
                                    shadow cursor-pointer active:scale-[0.97]
                                "
                                onClick={() => markNotificationAsRead(n)}
                            >
                                <div className="font-semibold">{n.title}</div>
                                <div className="text-xs opacity-70 whitespace-pre-line">
                                    {n.body}
                                </div>
                            </motion.div>
                        ))}

                        {notifications.length === 0 && (
                            <p className="text-gray-500 text-center text-sm mt-6">
                                Brak powiadomień
                            </p>
                        )}
                    </div>
                </div>
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
                        <NavLink
                            to="/employee/calendar"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                                }`
                            }
                        >
                            <CalendarDays size={22} />
                            <span className="text-[11px] mt-1">Kalendarz</span>
                        </NavLink>

                        <NavLink
                            to="/employee/reservations"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                                }`
                            }
                        >
                            <List size={22} />
                            <span className="text-[11px] mt-1">Rezerwacje</span>
                        </NavLink>

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

                        <NavLink
                            to="/employee/clients"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                                }`
                            }
                        >
                            <Users size={22} />
                            <span className="text-[11px] mt-1">Klienci</span>
                        </NavLink>

                        <NavLink
                            to="/employee/settings"
                            className={({ isActive }) =>
                                `flex flex-col items-center flex-1 text-xs ${isActive ? "text-orange-600" : "text-gray-500"
                                }`
                            }
                        >
                            <Settings size={22} />
                            <span className="text-[11px] mt-1">Ustawienia</span>
                        </NavLink>
                    </>
                ) : (
                    <>
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
