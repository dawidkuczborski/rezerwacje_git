import React, { useEffect } from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
    useLocation,
    useNavigate
} from "react-router-dom";
import AuthProvider, { useAuth } from "./components/AuthProvider";
import BottomNav from "./components/BottomNav";
import BottomNavEmployee from "./components/BottomNavEmployee";
import ScrollToTop from "./components/ScrollToTop";
import NotificationModalRouteWrapper from "./components/NotificationModalRouteWrapper";
// import NotificationAppointmentModal from "./components/NotificationAppointmentModal"; // 👈 już niepotrzebne
import NotificationAppointmentPage from "./pages/NotificationAppointmentPage";

// NOWE: jedna strona logowania
import Login from "./pages/Login";

// Rejestracja
import RegisterClient from "./pages/RegisterClient";
import RegisterProvider from "./pages/RegisterProvider";

// Flow klienta
import SalonSelect from "./pages/SalonSelect";
import ServiceSelect from "./pages/ServiceSelect";
import Booking from "./pages/Booking";
import MyAppointments from "./pages/MyAppointments.jsx";
import ProfileClient from "./pages/ProfileClient.jsx";

// Panel właściciela
import Profile from "./pages/Profile";
import SalonManager from "./pages/SalonManager";
import EmployeeManager from "./pages/EmployeeManager";
import SalonHolidaysManager from "./pages/SalonHolidaysManager";
import ServicesManager from "./pages/ServicesManager";
import EmployeeServicesManager from "./pages/EmployeeServicesManager";
import ScheduleManager from "./pages/ScheduleManager";
import PortfolioManager from "./pages/PortfolioManager";
import ChooseSalon from "./pages/ChooseSalon";

// Panel pracownika
import EmployeeCalendar from "./pages/employee/EmployeeCalendar";
import EmployeeCalendarMonthView from "./pages/employee/EmployeeCalendarMonthView";
import Vacations from "./pages/employee/Vacations";
import Clients from "./pages/employee/Clients";
import Settings from "./pages/employee/Settings";
import Reservations from "./pages/employee/Reservations";

function AppRoutes() {
    const { firebaseUser, backendUser, loading } = useAuth();

    // 🔥 Spinner
    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                }}
            >
                <div
                    style={{
                        width: "38px",
                        height: "38px",
                        border: "4px solid rgba(229, 91, 16, 0.2)",
                        borderTopColor: "#E55B10",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                    }}
                />

                <style>
                    {`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                `}
                </style>
            </div>
        );
    }

    const isLoggedIn = !!firebaseUser;

    const redirectByRole = () => {
        if (!isLoggedIn || !backendUser) return "/login";
        if (backendUser.is_provider) return "/employee/calendar";
        if (backendUser.role === "employee") return "/employee/calendar";
        if (backendUser.role === "client") return "/salons";
        return "/login";
    };


    // Global listener — musi być załadowany zanim pojawią się komponenty
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.type === "NEW_NOTIFICATION") {
                const n = event.data.payload;
                window.dispatchEvent(
                    new CustomEvent("app-notification", { detail: n })
                );
            }
        });
    }

    return (
        <Routes>
            <Route path="/" element={<Navigate to="/salons" replace />} />


            {/* 🔥 Login */}
            <Route
                path="/login"
                element={
                    isLoggedIn && backendUser ? (
                        <Navigate to={redirectByRole()} replace />
                    ) : (
                        <Login />
                    )
                }
            />

            {/* Rejestracja */}
            <Route path="/register-client" element={<RegisterClient />} />
            <Route path="/register-provider" element={<RegisterProvider />} />

            {/* 🔥 Klient */}
            <Route
                path="/calendar"
                element={
                    isLoggedIn && backendUser?.role === "client" ? (
                        <MyAppointments />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route path="/salons" element={<SalonSelect />} />


            <Route path="/services" element={<ServiceSelect />} />


            <Route
                path="/booking"
                element={
                    isLoggedIn && backendUser?.role === "client" ? (
                        <div id="booking-wrapper" style={{ minHeight: "100vh" }}>
                            <Booking key="booking-persistent" />
                        </div>
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/appointments"
                element={
                    isLoggedIn && backendUser?.role === "client" ? (
                        <MyAppointments />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/profile"
                element={
                    isLoggedIn && backendUser?.role === "client" ? (
                        <ProfileClient />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            {/* 🔥 Panel właściciela */}
            <Route
                path="/panel"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <Profile />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/choose-salon"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <ChooseSalon />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/salon"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <SalonManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/employees"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <EmployeeManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/services"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <ServicesManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/assign"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <EmployeeServicesManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/schedule"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <ScheduleManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/portfolio"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <PortfolioManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />
            <Route
                path="/employee/SalonHolidaysManager"
                element={
                    isLoggedIn && backendUser?.is_provider ? (
                        <SalonHolidaysManager />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            {/* 🔥 Panel pracownika */}
            <Route
                path="/employee/calendar"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <EmployeeCalendar />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/vacations"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <Vacations />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/clients"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <Clients />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/settings"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <Settings />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />
            <Route
                path="/employee/reservations"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <Reservations />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            <Route
                path="/employee/:employeeId/calendar-month"
                element={
                    isLoggedIn && backendUser?.role === "employee" ? (
                        <EmployeeCalendarMonthView />
                    ) : (
                        <Navigate to={redirectByRole()} replace />
                    )
                }
            />

            {/* ⭐ Nowa trasa — modal powiadomienia */}
            <Route
                path="/notification/appointment/:id"
                element={
                    isLoggedIn ? (
                        <NotificationModalRouteWrapper />
                    ) : (
                        <Navigate to="/login" replace />
                    )
                }
            />
            


            {/* Fallback */}
            <Route path="*" element={<Navigate to={redirectByRole()} replace />} />
        </Routes>
    );
}

//
// ⭐ LAYOUT + NASŁUCH Z SERVICE WORKERA
//
function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    // Strony bez menu
    const hideMenuOn = ["/login", "/register-client", "/register-provider"];
    const shouldHideMenu = hideMenuOn.includes(location.pathname);

    // 🔥 TU NASŁUCHUJEMY NA KLIKNIĘCIA POWIADOMIEŃ, GDY APP JEST OTWARTA
    // 🔥 ODBIÓR WIADOMOŚCI z SERVICE WORKERA (kliknięcia + nowe powiadomienia)
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const handler = (event) => {

            /* ---------------------------------------------
               1️⃣ KLIKNIĘCIE POWIADOMIENIA
            --------------------------------------------- */
            if (event.data?.type === "OPEN_NOTIFICATION_URL") {
                const url = event.data.url;
                if (url) {
                    navigate(url);
                }
            }

            /* ---------------------------------------------
               2️⃣ NOWE POWIADOMIENIE, gdy app jest OTWARTA
            --------------------------------------------- */
            if (event.data?.type === "NEW_NOTIFICATION") {
                const notification = event.data.payload;

                // 🔥 Wyślij globalny event, który odbierze dzwonek (BottomNavEmployee)
                window.dispatchEvent(
                    new CustomEvent("app-notification", {
                        detail: notification
                    })
                );
            }
        };

        navigator.serviceWorker.addEventListener("message", handler);

        return () => {
            navigator.serviceWorker.removeEventListener("message", handler);
        };
    }, [navigate]);


    return (
        <>
            <ScrollToTop />

            <div className="pb-[70px] transition-colors duration-500">
                <AppRoutes />
            </div>

            {!shouldHideMenu && (
                <>
                    <BottomNav />
                    <BottomNavEmployee />
                </>
            )}
        </>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <Router>
                <AppLayout />
            </Router>
        </AuthProvider>
    );
}
