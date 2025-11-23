import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";

export default function AddClientModal({ open, onClose, onCreated }) {
    const backend = import.meta.env.VITE_API_URL;
    const salonId = localStorage.getItem("selected_salon_id");

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");

    const [employees, setEmployees] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    const { firebaseUser } = useAuth();

    // 🔥 Pobranie pracowników z API
    useEffect(() => {
        const loadEmployees = async () => {
            if (!firebaseUser) return;
            const token = await firebaseUser.getIdToken();

            const res = await fetch(
                `${backend}/api/vacations/init?salon_id=${salonId}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const data = await res.json();

            if (data.is_provider) {
                const merged = data.salons.flatMap((s) =>
                    s.employees.map((e) => ({
                        id: e.id,
                        name: `${e.name} (${s.salon_name})`,
                    }))
                );
                setEmployees(merged);
            } else {
                setEmployees(data.employees);
            }
        };

        if (open) loadEmployees();
    }, [open, firebaseUser]);

    const toggleEmployee = (id) => {
        setSelectedEmployees((prev) =>
            prev.includes(id)
                ? prev.filter((e) => e !== id)
                : [...prev, id]
        );
    };

    // 🔥 Dodane sprawdzanie duplikatu numeru (409)
    const createClient = async () => {
        if (selectedEmployees.length === 0) {
            alert("Wybierz przynajmniej jednego pracownika");
            return;
        }

        const token = await firebaseUser.getIdToken();

        const res = await fetch(`${backend}/api/clients/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                salon_id: Number(salonId),
                employee_ids: selectedEmployees,
                first_name: firstName,
                last_name: lastName,
                phone,
            }),
        });

        // 🔥 jeśli klient istnieje → backend zwróci 409 i dane klienta
        if (res.status === 409) {
            const data = await res.json();
            const c = data.existing_clients[0];

            alert(
                `Klient z tym numerem już istnieje:\n` +
                `${c.first_name} ${c.last_name}\n` +
                `Obsługiwany przez pracownika ID: ${c.employee_id}`
            );
            return;
        }

        if (!res.ok) {
            alert("Wystąpił nieoczekiwany błąd podczas dodawania klienta.");
            return;
        }

        // Reset formularza
        setFirstName("");
        setLastName("");
        setPhone("");
        setSelectedEmployees([]);

        onCreated();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-6 w-full max-w-md">

                <h2 className="text-xl font-semibold mb-4">Dodaj klienta</h2>

                <input
                    placeholder="Imię"
                    className="w-full mb-3 p-3 rounded-xl bg-gray-100 dark:bg-[#2a2a2a]"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                />

                <input
                    placeholder="Nazwisko"
                    className="w-full mb-3 p-3 rounded-xl bg-gray-100 dark:bg-[#2a2a2a]"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                />

                <input
                    placeholder="Telefon"
                    className="w-full mb-4 p-3 rounded-xl bg-gray-100 dark:bg-[#2a2a2a]"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />

                {/* PRACOWNICY — MULTI SELECT */}
                <div className="mb-4">
                    <div className="text-sm mb-2 text-gray-600">Przypisz do pracowników:</div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {employees.map((emp) => (
                            <label
                                key={emp.id}
                                className="flex items-center gap-2 p-2 rounded-xl bg-gray-100 dark:bg-[#2a2a2a]"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedEmployees.includes(emp.id)}
                                    onChange={() => toggleEmployee(emp.id)}
                                />
                                {emp.name}
                            </label>
                        ))}
                    </div>

                    {employees.length === 0 && (
                        <div className="text-sm text-gray-500 mt-2">
                            Brak pracowników do wyboru.
                        </div>
                    )}
                </div>

                {/* BUTTONS */}
                <div className="flex gap-3 mt-6">
                    <button
                        className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700"
                        onClick={onClose}
                    >
                        Anuluj
                    </button>

                    <button
                        className="flex-1 py-3 rounded-xl bg-[#e57b2c] text-white"
                        onClick={createClient}
                    >
                        Zapisz
                    </button>
                </div>
            </div>
        </div>
    );
}
