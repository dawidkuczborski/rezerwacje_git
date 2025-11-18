import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Edit3, Upload, X } from "lucide-react";

export default function ServicesManager() {
  const { firebaseUser } = useAuth();
  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [services, setServices] = useState([]);
  const [addons, setAddons] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // --- Formularz usługi ---
  const [serviceForm, setServiceForm] = useState({
    name: "",
    duration_minutes: "",
    price: "",
    description: "",
    image: null,
    image_url: "",
  });

  const resetForm = () =>
    setServiceForm({
      name: "",
      duration_minutes: "",
      price: "",
      description: "",
      image: null,
      image_url: "",
    });

  // --- Pobierz salony właściciela ---
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

  // --- Pobierz usługi i dodatki ---
  const loadSalonData = async (salonId) => {
    try {
      const token = await firebaseUser.getIdToken();
      const [servicesResp, addonsResp] = await Promise.all([
        axios.get(`${backendBase}/api/services/by-salon/${salonId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${backendBase}/api/service-addons/all?salon_id=${salonId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setServices(servicesResp.data);
      setAddons(addonsResp.data);
    } catch (err) {
      console.error("❌ Błąd pobierania danych salonu:", err);
    }
  };

  useEffect(() => {
    if (firebaseUser) loadSalons();
  }, [firebaseUser]);

  useEffect(() => {
    if (selectedSalon) loadSalonData(selectedSalon.id);
  }, [selectedSalon]);

  // --- Dodawanie lub edycja usługi ---
  const handleSubmitService = async (e) => {
    e.preventDefault();
    if (!selectedSalon) return setMsg("⚠️ Najpierw wybierz salon!");
    try {
      setLoading(true);
      const token = await firebaseUser.getIdToken();
      const formData = new FormData();
      formData.append("salon_id", selectedSalon.id);
      formData.append("name", serviceForm.name);
      formData.append("duration_minutes", serviceForm.duration_minutes);
      formData.append("price", serviceForm.price);
      formData.append("description", serviceForm.description);
      if (serviceForm.image) formData.append("image", serviceForm.image);

      if (editingService) {
        // tryb edycji
        await axios.put(`${backendBase}/api/services/${editingService.id}`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        });
        setMsg("✅ Usługa zaktualizowana!");
      } else {
        // tryb dodawania
        await axios.post(`${backendBase}/api/services`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        });
        setMsg("✅ Usługa dodana!");
      }

      resetForm();
      setEditingService(null);
      loadSalonData(selectedSalon.id);
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd przy zapisie usługi");
    } finally {
      setLoading(false);
    }
  };

  // --- Edycja (wczytaj dane) ---
  const handleEditService = (srv) => {
    setEditingService(srv);
    setServiceForm({
      name: srv.name,
      duration_minutes: srv.duration_minutes,
      price: srv.price,
      description: srv.description,
      image: null,
      image_url: srv.image_url,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- Usuwanie usługi ---
  const handleDeleteService = async (id) => {
    if (!window.confirm("Na pewno usunąć tę usługę?")) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.delete(`${backendBase}/api/services/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      loadSalonData(selectedSalon.id);
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd przy usuwaniu");
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 px-6 py-10"
      style={{ maxWidth: 900, margin: "0 auto" }}
    >
      <h1 className="text-2xl font-semibold mb-6">💈 Zarządzanie usługami</h1>

      {/* --- Wybór salonu --- */}
      <div className="mb-6">
        <label className="block text-sm mb-2 font-medium">Wybierz salon</label>
        <select
          className="w-full max-w-sm p-3 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
          value={selectedSalon?.id || ""}
          onChange={(e) => {
            const s = salons.find((x) => x.id === Number(e.target.value));
            setSelectedSalon(s || null);
          }}
        >
          <option value="">-- wybierz salon --</option>
          {salons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.city})
            </option>
          ))}
        </select>
      </div>

      {/* --- Formularz usługi --- */}
      {selectedSalon && (
        <form
          onSubmit={handleSubmitService}
          className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 space-y-4 border dark:border-gray-700"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus size={18} />
              {editingService ? "Edytuj usługę" : "Dodaj nową usługę"}
            </h2>
            {editingService && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditingService(null);
                }}
                className="flex items-center text-sm text-gray-400 hover:text-red-500 transition"
              >
                <X size={16} className="mr-1" /> Anuluj
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <input
              placeholder="Nazwa usługi"
              value={serviceForm.name}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, name: e.target.value })
              }
              className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              required
            />
            <input
              placeholder="Cena (PLN)"
              type="number"
              step="0.01"
              value={serviceForm.price}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, price: e.target.value })
              }
              className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              required
            />
            <input
              placeholder="Czas trwania (min)"
              type="number"
              value={serviceForm.duration_minutes}
              onChange={(e) =>
                setServiceForm({
                  ...serviceForm,
                  duration_minutes: e.target.value,
                })
              }
              className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              required
            />

            <div className="flex items-center gap-3">
              <label className="flex items-center cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                <Upload className="mr-2" size={18} />
                <span>Zmień zdjęcie</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      image: e.target.files[0],
                    })
                  }
                />
              </label>
              {serviceForm.image ? (
  <img
    src={URL.createObjectURL(serviceForm.image)} // 👈 lokalny podgląd wybranego pliku
    alt="Podgląd"
    className="w-14 h-14 object-cover rounded-md border"
  />
) : serviceForm.image_url ? (
<img
  src={`${backendBase}/uploads/${serviceForm.image_url}`}
  alt="Podgląd"
  className="w-14 h-14 object-cover rounded-md border"
/>
) : null}

            </div>
          </div>

          <textarea
            placeholder="Opis usługi (opcjonalnie)"
            value={serviceForm.description}
            onChange={(e) =>
              setServiceForm({ ...serviceForm, description: e.target.value })
            }
            className="w-full p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
            rows={3}
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-[#E57B2C] hover:bg-[#d36f25] text-white px-5 py-2.5 rounded-lg font-medium transition disabled:opacity-60"
          >
            {loading
              ? "Zapisywanie..."
              : editingService
              ? "💾 Zaktualizuj usługę"
              : "💾 Zapisz usługę"}
          </button>
        </form>
      )}

      {/* --- Lista usług --- */}
      {selectedSalon && (
        <div className="grid gap-4">
          {services.map((srv) => (
            <div
              key={srv.id}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 p-4 rounded-xl shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center gap-4">
                {srv.image_url ? (
                  <img
                    src={`${backendBase}/uploads/${srv.image_url}`}

                    alt={srv.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
				 

				  
				  
                ) : (
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                    brak
                  </div>
                )}
                <div>
                  <p className="font-semibold">{srv.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {srv.price} zł · {srv.duration_minutes} min
                  </p>
                  <p className="text-xs text-gray-400">{srv.description}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleEditService(srv)}
                  className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                >
                  <Edit3 size={18} className="text-blue-500" />
                </button>
                <button
                  onClick={() => handleDeleteService(srv.id)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                >
                  <Trash2 size={18} className="text-red-500" />
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
    </div>
  );
}
