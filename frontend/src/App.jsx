import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AuthProvider, { useAuth } from "./components/AuthProvider";
import BottomNav from "./components/BottomNav";
import BottomNavEmployee from "./components/BottomNavEmployee";

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
import ServicesManager from "./pages/ServicesManager";
import EmployeeServicesManager from "./pages/EmployeeServicesManager";
import ScheduleManager from "./pages/ScheduleManager";
import PortfolioManager from "./pages/PortfolioManager";

// Panel pracownika
import EmployeeCalendar from "./pages/employee/EmployeeCalendar";
import EmployeeCalendarMonthView from "./pages/employee/EmployeeCalendarMonthView";

function AppRoutes() {
  const { firebaseUser, backendUser, loading } = useAuth();

  // 🔥 ELEGANCKI SPINNER ŁADOWANIA
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
    if (backendUser.is_provider) return "/panel";
    if (backendUser.role === "employee") return "/employee/calendar";
    if (backendUser.role === "client") return "/calendar";
    return "/login";
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to={redirectByRole()} replace />} />

      {/* 🔥 Jeden login dla wszystkich */}
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

      {/* 🔥 Kalendarz klienta */}
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

      {/* Flow klienta */}
      <Route
        path="/salons"
        element={
          isLoggedIn && backendUser?.role === "client" ? (
            <SalonSelect
              onSelect={(s) => {
                localStorage.setItem("selectedSalon", JSON.stringify(s));
                window.location.href = "/services";
              }}
            />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/services"
        element={
          isLoggedIn && backendUser?.role === "client" ? (
            <ServiceSelect
              onSelect={(srv) => {
                localStorage.setItem("selectedService", JSON.stringify(srv));
                window.location.href = "/booking";
              }}
            />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

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

      {/* Panel właściciela */}
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
        path="/panel/salon"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <SalonManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/panel/employees"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <EmployeeManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/panel/services"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <ServicesManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/panel/assign"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <EmployeeServicesManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/panel/schedule"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <ScheduleManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      <Route
        path="/panel/portfolio"
        element={
          isLoggedIn && backendUser?.is_provider ? (
            <PortfolioManager />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      {/* Panel pracownika */}
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
        path="/employee/:employeeId/calendar-month"
        element={
          isLoggedIn && backendUser?.role === "employee" ? (
            <EmployeeCalendarMonthView />
          ) : (
            <Navigate to={redirectByRole()} replace />
          )
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={redirectByRole()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="pb-[70px] transition-colors duration-500">
          <AppRoutes />
        </div>

        <BottomNav />
        <BottomNavEmployee />
      </Router>
    </AuthProvider>
  );
}
