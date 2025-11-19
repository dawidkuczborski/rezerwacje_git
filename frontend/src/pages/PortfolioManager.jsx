import React, { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import axios from "axios";
import { Plus, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";

export default function PortfolioManager() {
  const { firebaseUser } = useAuth();
  const backendBase = import.meta.env.VITE_API_URL;

  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [portfolio, setPortfolio] = useState({});
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  // 🔹 Pobierz salony właściciela
  useEffect(() => {
    if (!firebaseUser) return;
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
    loadSalons();
  }, [firebaseUser]);

  // 🔹 Pobierz grupy i portfolio
  useEffect(() => {
    if (!selectedSalon) return;
    loadGroups();
    loadPortfolio();
  }, [selectedSalon]);

  const loadGroups = async () => {
    try {
      const res = await axios.get(`${backendBase}/api/salons/${selectedSalon.id}/portfolio-groups`);
      setGroups(res.data);
    } catch (err) {
      console.error("❌ Błąd pobierania grup:", err);
    }
  };

  const loadPortfolio = async () => {
    try {
      const res = await axios.get(`${backendBase}/api/salons/${selectedSalon.id}/portfolio`);
      setPortfolio(res.data);
    } catch (err) {
      console.error("❌ Błąd pobierania portfolio:", err);
    }
  };

  // 🔸 Dodaj grupę
  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return setMsg("⚠️ Podaj nazwę grupy");
    try {
      const token = await firebaseUser.getIdToken();
      await axios.post(
        `${backendBase}/api/salons/${selectedSalon.id}/portfolio-groups`,
        { name: newGroupName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewGroupName("");
      setMsg("✅ Grupa dodana!");
      loadGroups();
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd dodawania grupy");
    }
  };

  // 🔸 Usuń grupę
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("Na pewno usunąć tę grupę?")) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.delete(`${backendBase}/api/portfolio-groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg("✅ Grupa usunięta!");
      loadGroups();
      loadPortfolio();
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd usuwania grupy");
    }
  };

  // 🔸 Upload zdjęć
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const formData = new FormData();
    for (let f of files) formData.append("portfolio_images", f);
    if (selectedGroup) formData.append("group_id", selectedGroup);
    try {
      setUploading(true);
      const token = await firebaseUser.getIdToken();
      await axios.post(`${backendBase}/api/salons/${selectedSalon.id}/portfolio`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setMsg("✅ Zdjęcia dodane!");
      loadPortfolio();
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd dodawania zdjęć");
    } finally {
      setUploading(false);
    }
  };

  // 🔸 Usuń zdjęcie
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Na pewno usunąć to zdjęcie?")) return;
    try {
      const token = await firebaseUser.getIdToken();
      await axios.delete(`${backendBase}/api/portfolio/${photoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg("✅ Zdjęcie usunięte!");
      loadPortfolio();
    } catch (err) {
      console.error(err);
      setMsg("❌ Błąd usuwania zdjęcia");
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 px-6 py-10"
      style={{ maxWidth: 900, margin: "0 auto" }}
    >
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <ImageIcon size={22} />
        Portfolio salonu
      </h1>

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

      {/* --- Dodawanie grup --- */}
      {selectedSalon && (
        <form
          onSubmit={handleAddGroup}
          className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 space-y-4 border dark:border-gray-700"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus size={18} />
              Dodaj nową grupę zdjęć
            </h2>
          </div>

          <div className="flex gap-3">
            <input
              placeholder="Nazwa grupy (np. Brody, Fryzury...)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-grow p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              required
            />
            <button
              type="submit"
              className="bg-[#E57B2C] hover:bg-[#d36f25] text-white px-5 py-2.5 rounded-lg font-medium transition"
            >
              💾 Dodaj
            </button>
          </div>
        </form>
      )}

      {/* --- Upload zdjęć --- */}
      {selectedSalon && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 border dark:border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium">Dodaj do grupy:</label>
            <select
              className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">Bez grupy</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="cursor-pointer bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition">
              {uploading ? "⏳ Wysyłanie..." : "➕ Dodaj zdjęcia"}
              <input type="file" multiple hidden onChange={handleUpload} />
            </label>
          </div>
        </div>
      )}

      {/* --- Lista grup i zdjęć --- */}
      {selectedSalon &&
        Object.keys(portfolio).map((groupName) => (
          <div
            key={groupName}
            className="bg-white dark:bg-gray-800 p-5 rounded-xl mb-6 shadow-sm border dark:border-gray-700"
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">{groupName}</h3>
              {groupName !== "Bez grupy" && (
                <button
                  onClick={() => {
                    const g = groups.find((x) => x.name === groupName);
                    if (g) handleDeleteGroup(g.id);
                  }}
                  className="text-red-500 text-sm hover:underline"
                >
                  Usuń grupę
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {portfolio[groupName].map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-lg overflow-hidden group border dark:border-gray-700"
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-40 object-cover"
                  />
                  <button
                    onClick={() => handleDeletePhoto(img.id)}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

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
