import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Upload } from "lucide-react";

export default function EmployeeManager() {
  const { firebaseUser } = useAuth();
  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // 🧍‍♂️ Formularz
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    description: "",
    password: "",
    image: null,
    image_url: "",
  });

  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      description: "",
      password: "",
      image: null,
      image_url: "",
    });
    setEditMode(false);
    setEditId(null);
  };

  // 🔹 Pobierz listę salonów właściciela
  const loadSalons = async () => {
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await axios.get(`${backendBase}/api/salons/mine/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSalons(resp.data);
    } catch (err) {
      console.error("❌ Błąd pobierania salonów:", err);
    }
  };

  // 🔹 Pobierz pracowników wybranego salonu
  const loadEmployees = async (salonId) => {
    try {
      const token = await firebaseUser.getIdToken();
      const resp = await axios.get(`${backendBase}/api/employees/mine`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { salon_id: salonId },
      });
      setEmployees(resp.data);
    } catch (err) {
      console.error("❌ Błąd ładowania pracowników:", err);
    }
  };

  useEffect(() => {
    if (firebaseUser) loadSalons();
  }, [firebaseUser]);

  useEffect(() => {
    if (selectedSalon) loadEmployees(selectedSalon.id);
  }, [selectedSalon]);

  // 🔹 Dodawanie / Edycja pracownika
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");
    setLoading(true);
    setMsg(editMode ? "✏️ Aktualizowanie pracownika..." : "⏳ Tworzenie konta pracownika...");

    try {
      const token = await firebaseUser.getIdToken();
      const formData = new FormData();
      formData.append("salon_id", selectedSalon.id);
      formData.append("name", form.name);
      formData.append("phone", form.phone);
      formData.append("description", form.description);
      if (form.image) formData.append("image", form.image);

      if (editMode) {
        await axios.put(`${backendBase}/api/employees/${editId}`, formData, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        });
        setMsg("✅ Zaktualizowano pracownika!");
      } else {
        formData.append("email", form.email);
        formData.append("password", form.password);
        await axios.post(`${backendBase}/api/employees/invite`, formData, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        });
        setMsg("✅ Pracownik dodany!");
      }

      resetForm();
      loadEmployees(selectedSalon.id);
    } catch (err) {
      console.error(err);
      setMsg("❌ " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Przejście w tryb edycji
  const handleEditEmployee = (emp) => {
    setEditMode(true);
    setEditId(emp.id);
    setForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone || "",
      description: emp.description || "",
      password: "",
      image: null,
      image_url: emp.image_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 🔹 Usuwanie pracownika
  const handleDeleteEmployee = async (id) => {
    if (!window.confirm("Czy na pewno chcesz usunąć tego pracownika?")) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.delete(`${backendBase}/api/employees/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg("🗑️ Pracownik usunięty!");
      loadEmployees(selectedSalon.id);
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd przy usuwaniu pracownika");
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 px-6 py-10"
      style={{ maxWidth: 700, margin: "0 auto" }}
    >
      <h2 className="text-2xl font-semibold mb-6">👥 Zarządzanie pracownikami</h2>

      {/* 🔹 Wybór salonu */}
      <div className="mb-6">
        <label className="block mb-2 font-medium text-sm">🏠 Wybierz salon</label>
        <select
          value={selectedSalon?.id || ""}
          onChange={(e) => {
            const s = salons.find((x) => x.id === Number(e.target.value));
            setSelectedSalon(s || null);
          }}
          className="p-3 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">-- wybierz salon --</option>
          {salons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.city})
            </option>
          ))}
        </select>
      </div>

      {!selectedSalon ? (
        <p>👉 Wybierz salon, aby zobaczyć i zarządzać pracownikami</p>
      ) : (
        <>
          {/* 🔹 Formularz */}
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 space-y-3 border dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold">
              {editMode ? "✏️ Edytuj pracownika" : "➕ Dodaj pracownika"}
            </h3>
            <input
              placeholder="Imię i nazwisko"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="p-3 border rounded-lg w-full dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="p-3 border rounded-lg w-full dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              disabled={editMode}
              required
            />
            {!editMode && (
              <input
                type="password"
                placeholder="Hasło pracownika"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="p-3 border rounded-lg w-full dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                required
              />
            )}
            <input
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="p-3 border rounded-lg w-full dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
            />

            {/* 🖼️ Upload zdjęcia */}
            <div className="flex items-center gap-3">
              <label className="flex items-center cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                <Upload className="mr-2" size={18} />
                <span>{form.image_url ? "Zmień zdjęcie" : "Dodaj zdjęcie"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setForm({ ...form, image: e.target.files[0] })}
                />
              </label>


              {(form.image || form.image_url) && (
                <img
                  src={
                    form.image
                      ? URL.createObjectURL(form.image)
                      : `${backendBase}/${form.image_url}`
                  }
                  alt="Podgląd"
                  className="w-14 h-14 rounded-md object-cover border"
                />
              )}
            </div>

            <textarea
              placeholder="Opis (np. fryzjer męski, barber)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="p-3 border rounded-lg w-full dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
            />

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="bg-[#E57B2C] hover:bg-[#d36f25] text-white px-5 py-2.5 rounded-lg font-medium transition disabled:opacity-60"
              >
                {loading
                  ? editMode
                    ? "Zapisywanie..."
                    : "Tworzenie..."
                  : editMode
                  ? "💾 Zapisz zmiany"
                  : "📨 Utwórz konto pracownika"}
              </button>

              {editMode && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-gray-500 text-sm hover:underline"
                >
                  Anuluj edycję
                </button>
              )}
            </div>
          </form>

          {/* 🔹 Lista pracowników */}
          <h3 className="text-lg font-semibold mb-2">📋 Lista pracowników</h3>
          {employees.length === 0 ? (
            <p>Brak pracowników</p>
          ) : (
            <div className="grid gap-3">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 p-4 rounded-xl shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    {emp.image_url ? (
					
					
                      <img
                        src={`${backendBase}/${emp.image_url}`} 
                        alt={emp.name}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 text-xs">
                        brak
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{emp.name}</p>
                      <p className="text-sm text-gray-500">{emp.email}</p>
                      <p className="text-xs text-gray-400">
                        {emp.phone || "-"} · {emp.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditEmployee(emp)}
                      className="text-blue-500 hover:underline text-sm"
                    >
                      Edytuj
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(emp.id)}
                      className="text-red-500 hover:underline text-sm"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p
            className={`mt-6 text-sm font-medium ${
              msg.startsWith("✅") ? "text-green-500" : "text-red-500"
            }`}
          >
            {msg}
          </p>
        </>
      )}
    </div>
  );
}
