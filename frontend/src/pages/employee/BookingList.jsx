// src/pages/employee/BookingList.jsx
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthProvider";

export default function BookingList() {
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("today");
  const [theme] = useState(localStorage.getItem("theme") || "dark");
  const isDark = theme === "dark";

  const fetchBookings = useCallback(async () => {
    try {
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${backendBase}/api/appointments/employee`, { headers });
      setBookings(res.data || []);
    } catch (err) {
      console.error("Błąd pobierania rezerwacji:", err);
    }
  }, [backendBase, firebaseUser]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const todayStr = new Date().toISOString().split("T")[0];

  const filtered = bookings.filter((b) => {
    if (filter === "today") return b.date === todayStr;
    if (filter === "upcoming") return b.date > todayStr;
    if (filter === "past") return b.date < todayStr;
    return true;
  });

  return (
    <div className={`p-4 min-h-screen ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <h2 className="text-xl font-semibold mb-4">📋 Moje rezerwacje</h2>

      <div className="flex gap-2 mb-4">
        {["today", "upcoming", "past"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              filter === f
                ? "bg-[#E57B2C] text-white"
                : isDark
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {f === "today" ? "Dziś" : f === "upcoming" ? "Nadchodzące" : "Historia"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">Brak rezerwacji</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className={`rounded-lg p-3 border ${
                isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
              }`}
            >
              <div className="font-semibold">{b.service_name}</div>
              <div className="text-sm text-gray-400">{b.client_name}</div>
              <div className="text-sm mt-1">
                {b.date} • {b.start_time} - {b.end_time}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
