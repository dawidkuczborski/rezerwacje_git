import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { getAuth } from "firebase/auth";
import { ChevronDown, ChevronRight } from "lucide-react";

const Reviews = ({ salon, backendBase, isDark }) => {
  const [reviews, setReviews] = useState([]);
  const [average, setAverage] = useState(0);
  const [total, setTotal] = useState(0);
  const [myReview, setMyReview] = useState(null);
  const [form, setForm] = useState({ rating: 5, content: "" });
  const [showForm, setShowForm] = useState(false);
  const auth = getAuth();

  const fetchReviews = useCallback(async () => {
    try {
      const res = await axios.get(`${backendBase}/api/reviews/by-salon/${salon.id}`);
      setReviews(res.data.reviews);
      setAverage(res.data.average);
      setTotal(res.data.total);

      const user = auth.currentUser;
      if (user) {
        const my = res.data.reviews.find((r) => r.client_uid === user.uid);
        if (my) {
          setMyReview(my);
          setForm({ rating: my.rating, content: my.content });
          setShowForm(false); // zwinięty, bo użytkownik ma już opinię
        } else {
          setShowForm(true); // domyślnie rozwinięty, gdy nie ma opinii
        }
      }
    } catch (err) {
      console.error("❌ Błąd pobierania opinii:", err);
    }
  }, [backendBase, salon.id, auth]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Musisz być zalogowany, aby dodać opinię.");
        return;
      }
      const token = await user.getIdToken();

      if (myReview) {
        await axios.put(`${backendBase}/api/reviews/${myReview.id}`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(
          `${backendBase}/api/reviews`,
          { salon_id: salon.id, ...form },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      fetchReviews();
      setMyReview(null);
      setForm({ rating: 5, content: "" });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Błąd zapisu opinii");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Na pewno usunąć opinię?")) return;
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();
      await axios.delete(`${backendBase}/api/reviews/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchReviews();
    } catch (err) {
      console.error("Błąd usuwania opinii:", err);
    }
  };

  // ⭐️ Gwiazdki w formie emoji
  const renderStars = () => (
    <div className="flex items-center gap-1">
      <span className="mr-2 text-sm">Ocena:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => setForm({ ...form, rating: star })}
          className={`text-2xl transition-transform ${
            star <= form.rating ? "scale-110" : "opacity-50"
          } hover:scale-125`}
        >
          ⭐️
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <h2 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
        Opinie klientów
      </h2>

      <div className="text-sm">
        ⭐ Średnia ocena: <b>{average}</b> ({total} opinii)
      </div>

      {/* 🔽 Moja opinia (rozwijana sekcja) */}
      <div
        className={`rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${
          isDark ? "bg-gray-800 text-gray-100" : "bg-gray-100 text-gray-900"
        }`}
      >
        <button
          type="button"
          onClick={() => setShowForm((p) => !p)}
          className="flex items-center justify-between w-full px-4 py-3 font-medium text-sm focus:outline-none"
        >
          <span>Moja opinia</span>
          {showForm ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <div
          className={`transition-all duration-300 ${
            showForm ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          } overflow-hidden`}
        >
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {renderStars()}
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Napisz swoją opinię..."
              className={`w-full p-2 border rounded resize-none h-24 ${
                isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-300"
              }`}
            />

            <button
              type="submit"
              className="px-4 py-2 rounded-full bg-[#E57B2C] text-white hover:bg-[#d56e22] transition"
            >
              {myReview ? "Zaktualizuj opinię" : "Dodaj opinię"}
            </button>
          </form>
        </div>
      </div>

      {/* 💬 Lista opinii */}
      {reviews.map((r) => (
        <div
          key={r.id}
          className={`p-4 rounded-2xl border ${
            isDark ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.client_name || "Anonim"}</div>
              <div className="text-sm text-yellow-500">
                {"⭐️".repeat(r.rating)}{" "}
                <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                  ({new Date(r.created_at).toLocaleDateString()})
                </span>
              </div>
            </div>
            {auth.currentUser?.uid === r.client_uid && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMyReview(r);
                    setForm({ rating: r.rating, content: r.content });
                    setShowForm(true);
                  }}
                  className="text-sm text-blue-500 hover:text-blue-400"
                >
                  Edytuj
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-sm text-red-500 hover:text-red-400"
                >
                  Usuń
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap">{r.content}</p>
        </div>
      ))}

      {reviews.length === 0 && (
        <p className={isDark ? "text-gray-400" : "text-gray-600"}>
          Brak opinii — bądź pierwszy!
        </p>
      )}
    </div>
  );
};

export default Reviews;
