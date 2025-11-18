import React, { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Loader2, ImagePlus, MapPin, Save, ArrowLeft } from "lucide-react";

export default function SalonManager() {
  const { firebaseUser, loading } = useAuth();
  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [msg, setMsg] = useState("");
  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // 🏙️ Formularz salonu
  const [form, setForm] = useState({
    name: "",
    city: "",
    street: "",
    street_number: "",
    postal_code: "",
    phone: "",
    description: "",
    image: null,
  });

  // 🗺️ Formularz „Jak dojechać”
  const [routeForm, setRouteForm] = useState({
    route_description: "",
    route_photos: [],
  });
  const [existingRoute, setExistingRoute] = useState(null);

  // 🔄 Pobierz kategorie
  useEffect(() => {
    axios.get(`${backendBase}/api/categories`).then((res) => {
      setCategories(res.data || []);
    });
  }, []);

  // 🔄 Pobierz salony użytkownika
  useEffect(() => {
    const loadSalons = async () => {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await axios.get(`${backendBase}/api/salons/mine/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSalons(res.data || []);
    };
    loadSalons();
  }, [firebaseUser]);

  // ✏️ Obsługa formularza salonu
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files) setForm({ ...form, image: files[0] });
    else setForm({ ...form, [name]: value });
  };

  // 💾 Zapis / aktualizacja salonu
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = await firebaseUser.getIdToken();
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== null && v !== "") formData.append(k, v);
    });

    let resp;
    if (selectedSalon) {
      resp = await axios.put(
        `${backendBase}/api/salons/${selectedSalon.id}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );
    } else {
      resp = await axios.post(`${backendBase}/api/salons`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
    }

    const salonId = selectedSalon ? selectedSalon.id : resp.data.salon.id;

    // 🔗 Przypisz kategorie
    await axios.post(
      `${backendBase}/api/salons/${salonId}/categories`,
      { category_ids: selectedCategories },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setMsg("✅ Salon zapisany pomyślnie");
    setSelectedSalon(null);
    setForm({
      name: "",
      city: "",
      street: "",
      street_number: "",
      postal_code: "",
      phone: "",
      description: "",
      image: null,
    });

    const reload = await axios.get(`${backendBase}/api/salons/mine/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSalons(reload.data);
  };

  // 🧭 Wczytanie danych salonu
  const handleEdit = async (salon) => {
    setSelectedSalon(salon);
    setForm({
      name: salon.name || "",
      city: salon.city || "",
      street: salon.street || "",
      street_number: salon.street_number || "",
      postal_code: salon.postal_code || "",
      phone: salon.phone || "",
      description: salon.description || "",
      image: null,
    });

    // Pobierz kategorie
    const token = await firebaseUser.getIdToken();
    const resp = await axios.get(
      `${backendBase}/api/salons/${salon.id}/categories`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setSelectedCategories(resp.data.map((c) => c.id));

    // Pobierz dane "Jak dojechać"
    const route = await axios.get(`${backendBase}/api/salons/${salon.id}/route`);
    setExistingRoute(route.data);
  };

  // 🗑️ Usuń salon
  const handleDelete = async (id) => {
    if (!window.confirm("Czy na pewno chcesz usunąć ten salon?")) return;
    const token = await firebaseUser.getIdToken();
    await axios.delete(`${backendBase}/api/salons/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSalons((prev) => prev.filter((s) => s.id !== id));
    setMsg("🗑️ Salon usunięty");
  };

  // 🧭 Formularz "Jak dojechać"
  const handleRouteChange = (e) => {
    const { name, value, files } = e.target;
    if (files)
      setRouteForm({ ...routeForm, route_photos: Array.from(files) });
    else setRouteForm({ ...routeForm, [name]: value });
  };

  const handleRouteSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSalon) return alert("Najpierw wybierz salon.");
    const token = await firebaseUser.getIdToken();
    const formData = new FormData();
    formData.append("route_description", routeForm.route_description);
    routeForm.route_photos.forEach((f) => formData.append("route_photos", f));

    const resp = await axios.post(
      `${backendBase}/api/salons/${selectedSalon.id}/route`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      }
    );

    setMsg(resp.data.message);
    setExistingRoute(resp.data.route);
    setRouteForm({ route_description: "", route_photos: [] });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-300">
        <Loader2 className="animate-spin mr-2" size={20} /> Ładowanie...
      </div>
    );

  if (!firebaseUser)
    return <p className="text-center mt-10">Nie jesteś zalogowany.</p>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-md p-8 mt-10">
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          💈 Zarządzanie salonami
        </h2>

        {/* Lista salonów */}
        {salons.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2">Twoje salony:</h3>
            <div className="space-y-3">
              {salons.map((s) => (
                <div
                  key={s.id}
                  className="border border-gray-300 dark:border-gray-700 rounded-xl p-4 flex justify-between items-center bg-gray-50 dark:bg-gray-700"
                >
                  <div className="flex items-center gap-4">
                    {s.image_url && (
                      <img
                        src={`${backendBase}/uploads/${s.image_url}`}
                        alt={s.name}
                        className="w-20 h-14 object-cover rounded-lg"
                      />
                    )}
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-gray-500">
                        {s.city}, {s.street} {s.street_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton
                      label="Edytuj"
                      icon={<Save size={16} />}
                      onClick={() => handleEdit(s)}
                    />
                    <ActionButton
                      label="Usuń"
                      icon={<ArrowLeft size={16} />}
                      onClick={() => handleDelete(s.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formularz salonu */}
        <SalonForm
          form={form}
          handleChange={handleChange}
          handleSubmit={handleSubmit}
          selectedSalon={selectedSalon}
          categories={categories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />

        {/* Sekcja "Jak dojechać" */}
        {selectedSalon && (
          <JakDojscForm
            routeForm={routeForm}
            handleRouteChange={handleRouteChange}
            handleRouteSubmit={handleRouteSubmit}
            existingRoute={existingRoute}
          />
        )}

        {msg && <p className="mt-4 text-center text-sm">{msg}</p>}
      </div>
    </div>
  );
}

// 🧩 Komponent formularza salonu
function SalonForm({
  form,
  handleChange,
  handleSubmit,
  selectedSalon,
  categories,
  selectedCategories,
  setSelectedCategories,
}) {
  return (
    <form onSubmit={handleSubmit} className="grid gap-4 mb-8">
      <h3 className="text-lg font-semibold">
        {selectedSalon ? "✏️ Edytuj salon" : "➕ Dodaj nowy salon"}
      </h3>
      <input
        name="name"
        placeholder="Nazwa salonu"
        value={form.name}
        onChange={handleChange}
        className="input"
      />
      <input
        name="city"
        placeholder="Miasto"
        value={form.city}
        onChange={handleChange}
        className="input"
      />
      <input
        name="street"
        placeholder="Ulica"
        value={form.street}
        onChange={handleChange}
        className="input"
      />
      <input
        name="street_number"
        placeholder="Numer budynku"
        value={form.street_number}
        onChange={handleChange}
        className="input"
      />
      <input
        name="postal_code"
        placeholder="Kod pocztowy"
        value={form.postal_code}
        onChange={handleChange}
        className="input"
      />
      <input
        name="phone"
        placeholder="Telefon kontaktowy"
        value={form.phone}
        onChange={handleChange}
        className="input"
      />
      <textarea
        name="description"
        placeholder="Opis salonu"
        value={form.description}
        onChange={handleChange}
        className="input"
      />
      <div>
        <label className="block mb-2 text-sm font-medium">
          Kategorie salonu:
        </label>
        <div className="flex flex-wrap gap-3">
          {categories.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                value={cat.id}
                checked={selectedCategories.includes(cat.id)}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedCategories((prev) =>
                    prev.includes(id)
                      ? prev.filter((x) => x !== id)
                      : [...prev, id]
                  );
                }}
              />
              {cat.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block mb-2 text-sm font-medium">
          📷 Zdjęcie profilowe salonu:
        </label>
        <input
          type="file"
          accept="image/*"
          name="image"
          onChange={handleChange}
          className="input"
        />
      </div>

      <button
        type="submit"
        className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg"
      >
        {selectedSalon ? "💾 Zapisz zmiany" : "➕ Dodaj salon"}
      </button>
    </form>
  );
}

// 🗺️ Formularz „Jak dojechać”
function JakDojscForm({
  routeForm,
  handleRouteChange,
  handleRouteSubmit,
  existingRoute,
}) {
  return (
    <div className="border-t border-gray-300 dark:border-gray-700 pt-6">
      <h3 className="text-lg font-semibold mb-4">🗺️ Jak dojechać</h3>

      {existingRoute && (
        <div className="mb-4">
          {existingRoute.route_description && (
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              {existingRoute.route_description}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {existingRoute.image_urls?.map((url, i) => (
              <img
                key={i}
                src={url}
                alt="Trasa"
                className="w-28 h-20 object-cover rounded-lg border"
              />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleRouteSubmit} className="grid gap-4">
        <textarea
          name="route_description"
          placeholder="Opis trasy (np. salon obok apteki, wejście od parkingu...)"
          value={routeForm.route_description}
          onChange={handleRouteChange}
          className="input"
        />
        <input
          type="file"
          name="route_photos"
          multiple
          accept="image/*"
          onChange={handleRouteChange}
          className="input"
        />
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
        >
          💾 Zapisz dane „Jak dojechać”
        </button>
      </form>
    </div>
  );
}

// 🔘 Reusable przycisk
function ActionButton({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm transition"
    >
      {icon}
      {label}
    </button>
  );
}
