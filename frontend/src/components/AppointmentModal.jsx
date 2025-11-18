import { useEffect, useState } from "react";
import axios from "axios";
import { X, Pencil, Save, Phone, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";


export default function AppointmentModal({ open, onClose, appointmentId, onUpdated, socket }) {

  const [appointment, setAppointment] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [addons, setAddons] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);

  const backendBase = import.meta.env.VITE_API_URL;

  // Załaduj dane
  useEffect(() => {
    if (!open || !appointmentId) return;
    const load = async () => {
      try {
        const res = await axios.get(`${backendBase}/api/appointments/${appointmentId}/details`);
        const data = res.data;
        const appt = {
          ...data.appointment,
            addons: data.appointment.addons || [],

        };
        setAppointment(appt);
        setEmployees(data.available_employees || []);
        setServices(data.available_services || []);
        setAddons(data.available_addons || []);

        if (appt.employee_id && appt.service_id && appt.date) {
          fetchAvailableTimes(appt.employee_id, appt.service_id, appt.date, appt.addons);
        }
      } catch (err) {
        console.error("Błąd ładowania:", err);
      }
    };
    load();
  }, [open, appointmentId, backendBase]);

  const fetchAvailableTimes = async (empId, srvId, date, selectedAddons) => {
    if (!empId || !srvId || !date) return setAvailableTimes([]);
    try {
      const formattedDate =
        typeof date === "string" ? date.split("T")[0] : new Date(date).toISOString().split("T")[0];
      const params = { employee_id: empId, service_id: srvId, date: formattedDate };
      if (selectedAddons?.length) params.addons = selectedAddons.join(",");
      const res = await axios.get(`${backendBase}/api/appointments/available`, { params });
      setAvailableTimes(res.data?.slots || res.data || []);
    } catch {
      setAvailableTimes([]);
    }
  };

  useEffect(() => {
    if (!appointment) return;
    fetchAvailableTimes(appointment.employee_id, appointment.service_id, appointment.date, appointment.addons);
  }, [appointment?.employee_id, appointment?.service_id, appointment?.date, appointment?.addons]);

  const handleSave = async () => {
  if (!appointment) return;
  setSaving(true);
  try {
    const formattedDate =
      typeof appointment.date === "string"
        ? appointment.date.split("T")[0]
        : new Date(appointment.date).toISOString().split("T")[0];

    const payload = {
      service_id: appointment.service_id,
      employee_id: appointment.employee_id,
      addons: appointment.addons || [],
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      date: formattedDate,
    };

    if (!payload.service_id || !payload.employee_id || !payload.start_time) {
      alert("Uzupełnij wymagane pola.");
      setSaving(false);
      return;
    }

 
   // 🔹 1️⃣ Zapisz wizytę w backendzie
await axios.put(`${backendBase}/api/appointments/${appointmentId}/details`, payload);


    // 🔹 3️⃣ Odśwież lokalny stan w kalendarzu (onUpdated z EmployeeCalendar)
    if (onUpdated) {
      await onUpdated();
    }

    // 🔹 4️⃣ Pokaz komunikat i zamknij modal
    setSavedPopup(true);
    setTimeout(() => {
      setSavedPopup(false);
      setEditMode(false);
      onClose();
    }, 800);
  } catch (err) {
    console.error("❌ Błąd zapisu:", err.response?.data || err);
    alert("Nie udało się zapisać zmian.");
  } finally {
    setSaving(false);
  }
};


 if (!open) return null;


  const formatDatePL = (d) => {
    try {
      const date = typeof d === "string" ? new Date(d) : d;
      return date.toLocaleDateString("pl-PL");
    } catch {
      return d;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full max-w-3xl bg-white rounded-none md:rounded-2xl overflow-y-auto shadow-2xl flex flex-col"
          >
            {/* Toast */}
            <AnimatePresence>
              {savedPopup && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg"
                >
                  <CheckCircle size={16} /> Zapisano!
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-400 text-white px-6 py-4 flex justify-between items-center shadow-md z-10">
              <h2 className="text-lg font-semibold">
                {editMode ? "Edytuj wizytę" : "Szczegóły wizyty"}
              </h2>
              <div className="flex gap-2">
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="p-2 rounded-lg hover:bg-white/20 transition"
                  >
                    <Pencil size={18} />
                  </button>
                )}
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20">
                  <X size={18} />
                </button>
              </div>
            </div>

			{/* Content */}
			{!appointment ? (
			  // 🔸 Loader widoczny, dopóki dane się ładują
			  <div className="flex flex-1 items-center justify-center text-gray-500">
				<div className="animate-pulse text-center">
				  <div className="w-6 h-6 mx-auto mb-2 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
				  <div>Ładowanie wizyty...</div>
				</div>
			  </div>
			) : (
			  // 🔸 Normalna zawartość po załadowaniu
			  <div className="flex-1 p-6 space-y-6 text-gray-800">
				{/* Klient */}
				<div className="border-b pb-4">
				  <label className="text-sm text-gray-500">Klient</label>
				  <div className="mt-1">
                                          <div className="font-semibold">
                                              {appointment.client_name?.trim() || "Klient"}
                                          </div>

                                          {appointment.client_phone?.trim() ? (
                                              <a
                                                  href={`tel:${appointment.client_phone}`}
                                                  className="text-orange-600 text-sm flex items-center gap-1 mt-1"
                                              >
                                                  <Phone size={14} /> {appointment.client_phone}
                                              </a>
                                          ) : (
                                              <div className="text-gray-400 text-sm mt-1">Brak telefonu</div>
                                          )}

				  </div>
				</div>

              {/* Pracownik */}
              <div className="border-b pb-4">
                <label className="text-sm text-gray-500">Pracownik</label>
                {editMode ? (
                  <select
                    value={appointment.employee_id ?? ""}
                    onChange={(e) =>
                      setAppointment((p) => ({ ...p, employee_id: Number(e.target.value) }))
                    }
                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">Wybierz...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1">{appointment.employee_name}</div>
                )}
              </div>

              {/* Usługa */}
              <div className="border-b pb-4">
                <label className="text-sm text-gray-500">Usługa</label>
                {editMode ? (
                  <select
                    value={appointment.service_id ?? ""}
                    onChange={(e) =>
                      setAppointment((p) => ({ ...p, service_id: Number(e.target.value) }))
                    }
                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">Wybierz...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.price} zł)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 flex justify-between">
                    <span>{appointment.service_name}</span>
                    <span className="text-gray-600">{appointment.service_price} zł</span>
                  </div>
                )}
              </div>

              {/* Dodatki */}
              <div className="border-b pb-4">
                <label className="text-sm text-gray-500">Dodatki</label>
                {editMode ? (
                  <div className="mt-2 space-y-2">
                    {addons
  .filter((a) => !a.service_id || a.service_id === appointment.service_id)


  .map((a) => (
    <label key={a.id} className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
              checked={appointment.addons?.some(ad => ad.id === a.id)}

        onChange={() =>
          setAppointment((prev) => {
            const current = prev.addons || [];
            const newAddons = current.includes(a.id)
              ? current.filter((x) => x !== a.id)
              : [...current, a.id];
            return { ...prev, addons: newAddons };
          })
        }
      />
      {a.name} ({a.price} zł)
    </label>
  ))}

                  </div>
                ) : appointment.addons?.length ? (
                                              <ul className="mt-2 text-sm list-disc list-inside">
                                                  {appointment.addons.map((add) => (
                                                      <li key={add.id}>
                                                          {add.name} ({add.price} zł)
                                                      </li>
                                                  ))}
                                              </ul>

                ) : (
                  <div className="text-gray-400 mt-1 text-sm">Brak</div>
                )}
              </div>

              {/* Data */}
              <div className="border-b pb-4">
                <label className="text-sm text-gray-500">Data wizyty</label>
                {editMode ? (
                  <input
                    type="date"
                    value={appointment.date?.split("T")[0] || ""}
                    onChange={(e) =>
                      setAppointment((p) => ({ ...p, date: e.target.value }))
                    }
                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-400"
                  />
                ) : (
                  <div className="mt-1">{formatDatePL(appointment.date)}</div>
                )}
              </div>

              {/* Godzina */}
              <div className="border-b pb-4">
                <label className="text-sm text-gray-500">Godzina</label>
                {editMode ? (
                  <select
                    value={appointment.start_time || ""}
                    onChange={(e) => {
                      const slot = availableTimes.find((s) => s.start_time === e.target.value);
                      setAppointment((p) => ({
                        ...p,
                        start_time: slot?.start_time,
                        end_time: slot?.end_time,
                      }));
                    }}
                    className="mt-1 w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">Wybierz termin...</option>
                    {availableTimes.map((s, i) => (
                      <option key={i} value={s.start_time}>
                        {s.start_time} – {s.end_time}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1">
                    {appointment.start_time
                      ? `${appointment.start_time.slice(0, 5)} – ${appointment.end_time?.slice(0, 5)}`
                      : "—"}
                  </div>
                )}
              </div>

              {/* Łącznie */}
              <div className="pt-4 flex justify-between text-sm font-medium">
                <span>Łącznie</span>
                <span className="text-gray-900">
                  {(() => {
                    const base = Number(appointment.service_price) || 0;
                                              const addonsTotal = appointment.addons?.reduce(
                                                  (sum, ad) => sum + Number(ad.price || 0),
                                                  0
                                              );

                    return (base + addonsTotal).toFixed(2);
                  })()}{" "}
                  zł
                </span>
              </div>
            </div>
          )} {/* <---- DODAJ TO */}

            {/* Footer */}
            {editMode && (
              <div className="sticky bottom-0 bg-gray-50 border-t flex justify-end gap-3 px-6 py-4">
                <button
                  onClick={() => setEditMode(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`px-4 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${
                    saving
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {saving ? "Zapisywanie..." : (<><Save size={16}/> Zapisz</>)}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
