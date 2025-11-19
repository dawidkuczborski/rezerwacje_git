import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, User } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function BottomNav() {
    const location = useLocation();
    const { backendUser } = useAuth();

    // ⛔ BackendUser nie został jeszcze załadowany → NIE pokazuj menu
    if (backendUser === undefined) return null;

    // ⛔ Nie pokazuj klientowskiego menu pracownikowi
    if (backendUser?.role === "employee") return null;

    // ⛔ Nie pokazuj właścicielowi / providerowi
    if (backendUser?.is_provider) return null;

    // ⛔ Nie pokazuj na stronach logowania / rejestracji
    const hiddenRoutes = [
        "/login-client",
        "/login-admin",
        "/login-employee",
        "/register-client",
        "/register-provider",
        "/panel",
    ];
    if (hiddenRoutes.some((p) => location.pathname.startsWith(p))) return null;

    const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
    const [activeIndex, setActiveIndex] = useState(0);

    // Obserwacja zmian motywu
    useEffect(() => {
        const observer = new MutationObserver(() => {
            const isDark = document.documentElement.classList.contains("dark");
            setTheme(isDark ? "dark" : "light");
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    // Podświetlanie aktywnej ikonki
    useEffect(() => {
        if (location.pathname.startsWith("/salons")) setActiveIndex(0);
        else if (location.pathname.startsWith("/appointments")) setActiveIndex(1);
        else if (location.pathname.startsWith("/profile")) setActiveIndex(2);
    }, [location.pathname]);

    const isDark = theme === "dark";

    const navItems = [
        { to: "/salons", label: "Salony", icon: <Home size={22} /> },
        { to: "/appointments", label: "Wizyty", icon: <CalendarDays size={22} /> },
        { to: "/profile", label: "Profil", icon: <User size={22} /> },
    ];

    return (
        <nav
            className={`z-[8000] w-[94%] max-w-[430px] h-[72px] rounded-full border backdrop-blur-lg
      shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all duration-300
      ${isDark ? "bg-neutral-900/80 border-neutral-800 text-gray-300" : "bg-white/95 border-gray-200 text-gray-700"}
      px-3 py-2 relative overflow-hidden`}
            style={{
                position: "fixed",
                bottom: "12px",
                left: "50%",
                transform: "translateX(-50%)",
                pointerEvents: "auto",
            }}
        >
            {/* 🔥 Poświata aktywnego przycisku */}
            <div
                className={`absolute top-[6.5px] left-[8px] w-[calc(33.333%-8px)] h-[calc(99%-12px)]
                    rounded-[48px] shadow-inner transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
                    pointer-events-none
                    ${isDark ? "bg-orange-500/20" : "bg-orange-100/70"}`}
                style={{
                    transform: `translateX(calc(${activeIndex * 99}% + ${activeIndex * 5}px))`,
                }}
            ></div>

            <ul className="flex items-center justify-between h-full relative z-10">
                {navItems.map((item, index) => (
                    <li
                        key={item.to}
                        className={`flex-1 flex items-center justify-center
              ${index === 0 ? "-translate-x-[5px]" : ""}
              ${index === navItems.length - 1 ? "translate-x-[5px]" : ""}`}
                    >
                        <NavLink to={item.to} onClick={() => setActiveIndex(index)} className="w-full">
                            {({ isActive }) => (
                                <div
                                    className={`flex flex-col items-center justify-center rounded-full transition-all duration-300
                    ${isActive
                                            ? "scale-105 text-orange-600"
                                            : "scale-100 text-gray-500 hover:text-orange-500"}`}
                                    style={{
                                        paddingTop: "9px",
                                        paddingBottom: "11px",
                                        paddingInline: "18px",
                                        userSelect: "none",
                                    }}
                                >
                                    <div className="flex items-center justify-center">{item.icon}</div>
                                    <span className="text-[12px] mt-[4px] leading-none">{item.label}</span>
                                </div>
                            )}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
