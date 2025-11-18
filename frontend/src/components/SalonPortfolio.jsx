import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";

export default function SalonPortfolio({ salon, backendBase, isDark }) {
  const [portfolio, setPortfolio] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, group: "", index: 0 });

  const touchStartX = useRef(null);
  const touchEndX = useRef(null);
  const touchStartY = useRef(null);
  const touchEndY = useRef(null);

  // 📸 Pobranie portfolio
  useEffect(() => {
    if (!salon?.id) return;
    const load = async () => {
      try {
        const res = await axios.get(`${backendBase}/api/salons/${salon.id}/portfolio`);
        setPortfolio(res.data);
      } catch (err) {
        console.error("❌ Błąd pobierania portfolio:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [salon, backendBase]);

  // 🚫 Blokada scrolla tła przy otwartym modalu
  useEffect(() => {
    document.body.style.overflow = modal.open ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [modal.open]);

  const groups = Object.keys(portfolio);

  const openModal = (group, index) => setModal({ open: true, group, index });
  const closeModal = () => setModal({ open: false, group: "", index: 0 });

  const nextImage = () => {
    const groupImages = portfolio[modal.group] || [];
    if (!groupImages.length) return;
    setModal((m) => ({
      ...m,
      index: (m.index + 1) % groupImages.length,
    }));
  };

  const prevImage = () => {
    const groupImages = portfolio[modal.group] || [];
    if (!groupImages.length) return;
    setModal((m) => ({
      ...m,
      index: (m.index - 1 + groupImages.length) % groupImages.length,
    }));
  };

  // 🔁 Zmiana grup
  const nextGroup = () => {
    if (!groups.length) return;
    const cur = groups.indexOf(modal.group);
    const nextIdx = (cur + 1) % groups.length;
    setModal({ open: true, group: groups[nextIdx], index: 0 });
  };

  const prevGroup = () => {
    if (!groups.length) return;
    const cur = groups.indexOf(modal.group);
    const prevIdx = (cur - 1 + groups.length) % groups.length;
    setModal({ open: true, group: groups[prevIdx], index: 0 });
  };

  // 👆 Obsługa gestów
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current == null || touchEndX.current == null) return;
    const dx = touchStartX.current - touchEndX.current;
    const dy = touchStartY.current - touchEndY.current;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx > 0) nextImage();
      else prevImage();
    }

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 80) {
      if (dy > 0) nextGroup();
      else prevGroup();
    }

    touchStartX.current = touchEndX.current = touchStartY.current = touchEndY.current = null;
  };

  // ⌨️ Obsługa klawiatury
  useEffect(() => {
    if (!modal.open) return;

    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
      else if (e.key === "ArrowUp") prevGroup();
      else if (e.key === "ArrowDown") nextGroup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open, modal.group, modal.index, portfolio, groups]);

  if (loading)
    return <p className={isDark ? "text-gray-400" : "text-gray-600"}>Ładowanie portfolio...</p>;

  if (!groups.length)
    return <p className={isDark ? "text-gray-400" : "text-gray-600"}>Brak zdjęć w portfolio.</p>;

  return (
    <div className="space-y-8 mt-8">
      {groups.map((group) => (
        <div key={group}>
          <h3 className="text-lg font-medium mb-3">{group}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {portfolio[group].map((img, i) => (
              <div
                key={img.id}
                className="relative group cursor-pointer"
                onClick={() => openModal(group, i)}
              >
                <img
                  src={img.url}
                  alt=""
                  className="w-full h-40 object-cover rounded-lg border dark:border-gray-700 hover:opacity-90 transition"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 🖼️ Modal */}
      {modal.open &&
        createPortal(
          <div
            className={`fixed inset-0 z-[99999] flex flex-col justify-center items-center ${
              isDark ? "bg-black/90" : "bg-white/95"
            }`}
            style={{
              height: "100dvh",
              minHeight: "100vh",
              overflow: "hidden",
            }}
            onClick={closeModal}
          >
            {/* ❌ Zamknięcie */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeModal();
              }}
              className={`absolute right-4 transition-transform active:scale-95 ${
                isDark ? "text-white hover:text-gray-300" : "text-black hover:text-gray-700"
              }`}
              style={{
                top: "max(env(safe-area-inset-top, 16px), 16px)",
                padding: 8,
              }}
              aria-label="Zamknij"
            >
              <X size={28} strokeWidth={1.8} />
            </button>

            {/* ◀ Poprzednie zdjęcie */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-transform active:scale-95 ${
                isDark ? "text-white hover:text-gray-300" : "text-black hover:text-gray-700"
              }`}
              style={{ padding: 8 }}
            >
              <ChevronLeft size={42} strokeWidth={1.5} />
            </button>

            {/* 🖼 Zdjęcie */}
            <div
              className="flex-grow flex items-center justify-center w-full h-full p-4 select-none"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={portfolio[modal.group][modal.index].url}
                alt=""
                className="max-h-[90dvh] max-w-[95vw] object-contain rounded-lg shadow-2xl transition-all duration-300"
              />
            </div>

            {/* ▶ Następne zdjęcie */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className={`absolute right-4 top-1/2 -translate-y-1/2 transition-transform active:scale-95 ${
                isDark ? "text-white hover:text-gray-300" : "text-black hover:text-gray-700"
              }`}
              style={{ padding: 8 }}
            >
              <ChevronRight size={42} strokeWidth={1.5} />
            </button>

            {/* 🔽 Pasek na dole z kontrolkami grup */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 flex items-center justify-between px-4 py-2 gap-4 rounded-full ${
                isDark ? "bg-black/40 text-gray-200" : "bg-white/70 text-gray-800"
              } backdrop-blur-md shadow-md max-w-[95vw] flex-nowrap`}
              style={{
                bottom: "max(env(safe-area-inset-bottom, 12px), 12px)",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevGroup();
                }}
                className={`flex items-center gap-1 text-xs sm:text-sm font-medium whitespace-nowrap transition-all active:scale-95 ${
                  isDark ? "hover:text-white" : "hover:text-black"
                }`}
              >
                <ChevronLeft size={16} strokeWidth={2} /> Poprzednia
              </button>

              <div
                className="text-xs sm:text-sm opacity-80 select-none text-center whitespace-nowrap"
                style={{ minWidth: "fit-content" }}
              >
                {modal.group} — {modal.index + 1} / {portfolio[modal.group].length}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextGroup();
                }}
                className={`flex items-center gap-1 text-xs sm:text-sm font-medium whitespace-nowrap transition-all active:scale-95 ${
                  isDark ? "hover:text-white" : "hover:text-black"
                }`}
              >
                Następna <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
