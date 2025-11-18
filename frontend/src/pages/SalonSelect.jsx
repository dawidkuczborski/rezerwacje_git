// src/pages/SalonSelect.jsx
import React, {
    useEffect,
    useState,
    useMemo,
    useCallback,
    useRef,
    useDeferredValue,
    startTransition,
} from "react";
import axios from "axios";
import { Search, MapPin, Star } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AdvancedSearchModal from "../components/AdvancedSearchModal";

// --- Config
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const CACHE_KEY_PAGE = (p, l) => `salonSelect_page_${p}_limit_${l}`;
const CACHE_TTL_MS = 60_000; // keep in sessionStorage with timestamp

// --- Skeleton components
const SalonCardSkeleton = ({ isDark }) => (
    <div className={`rounded-2xl overflow-hidden border shadow-md p-4 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className={`h-44 w-full mb-4 ${isDark ? "bg-gray-700" : "bg-gray-100"}`} />
        <div className="space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-300/50" />
            <div className="h-3 w-1/2 rounded bg-gray-300/40" />
        </div>
    </div>
);

export default function SalonSelect() {
    const navigate = useNavigate();
    const location = useLocation();
    const { firebaseUser } = useAuth();

    const [salons, setSalons] = useState([]);
    const [ratingsMap, setRatingsMap] = useState({}); // { [salonId]: { average, total } }
    const [user, setUser] = useState(null);
    const [nextAppointment, setNextAppointment] = useState(null);
    const [lastAppointment, setLastAppointment] = useState(null);

    const [loading, setLoading] = useState(false); // page-level loading
    const [loadingInitial, setLoadingInitial] = useState(true); // for first paint
    const [page, setPage] = useState(DEFAULT_PAGE);
    const [limit] = useState(DEFAULT_LIMIT);
    const [totalSalons, setTotalSalons] = useState(0);

    const [search, setSearch] = useState("");
    const [showAppointmentDetails, setShowAppointmentDetails] = useState(false);
    const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

    const deferredSearch = useDeferredValue(search);
    const backendBase = import.meta.env.VITE_API_URL;

    const isMounted = useRef(true);
    useEffect(() => () => (isMounted.current = false), []);

    const isDark = document.documentElement.classList.contains("dark");
    const PRIMARY = "#E57B2C";

    // Abort controllers for requests
    const controllersRef = useRef(new Set());
    const addController = (c) => controllersRef.current.add(c);
    const removeController = (c) => controllersRef.current.delete(c);
    useEffect(() => {
        return () => {
            // abort any inflight requests on unmount
            controllersRef.current.forEach((c) => c.abort && c.abort());
            controllersRef.current.clear();
        };
    }, []);

    // small debounce helper
    const debounce = (fn, wait) => {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    };

    // processAppointments (same logic as original)
    const processAppointments = useCallback((all = []) => {
        if (!Array.isArray(all) || all.length === 0) {
            setNextAppointment(null);
            setLastAppointment(null);
            return;
        }

        const now = new Date();
        const toDateTime = (dateISO, timeStr) => {
            if (!dateISO || !timeStr) return null;
            const date = new Date(dateISO);
            if (isNaN(date)) return null;
            const [hours, minutes, seconds] = (timeStr || "").split(":").map(Number);
            const local = new Date(date);
            local.setHours(hours || 0);
            local.setMinutes(minutes || 0);
            local.setSeconds(seconds || 0);
            return local;
        };

        const withTimes = all.map((a) => ({
            ...a,
            startDateTime: toDateTime(a.date, a.start_time),
            endDateTime: toDateTime(a.date, a.end_time),
        }));

        const upcoming =
            withTimes
                .filter((a) => a.status === "booked" && a.startDateTime && a.startDateTime > now)
                .sort((a, b) => a.startDateTime - b.startDateTime)[0] || null;

        const past =
            withTimes
                .filter((a) => a.endDateTime && a.endDateTime < now)
                .sort((a, b) => b.endDateTime - a.endDateTime)[0] || null;

        setNextAppointment(upcoming);
        setLastAppointment(past);
    }, []);

    // read cache helper (sessionStorage)
    const readCachedPage = useCallback((p, l) => {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY_PAGE(p, l));
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj?.ts) return null;
            if (Date.now() - obj.ts > CACHE_TTL_MS) {
                sessionStorage.removeItem(CACHE_KEY_PAGE(p, l));
                return null;
            }
            return obj.data || null;
        } catch {
            return null;
        }
    }, []);

    const writeCachedPage = useCallback((p, l, data) => {
        try {
            sessionStorage.setItem(CACHE_KEY_PAGE(p, l), JSON.stringify({ ts: Date.now(), data }));
        } catch { }
    }, []);

    // CORE: fetch a page (returns { salons, ratings, totalSalons })
    const fetchPage = useCallback(
        async (pageToFetch = 1, opts = { signal: null }) => {
            const url = `${backendBase}/api/salon-select/init?page=${pageToFetch}&limit=${limit}`;
            // use axios with signal (AbortController)
            const config = opts.signal ? { signal: opts.signal } : {};
            const res = await axios.get(url, config);
            return res.data;
        },
        [backendBase, limit]
    );

    // LOAD INITIAL: instant paint + background fetch
    const loadInitial = useCallback(async () => {
        if (!firebaseUser) {
            setLoadingInitial(false);
            return;
        }

        setLoadingInitial(true);
        // try cached page first
        const cached = readCachedPage(DEFAULT_PAGE, limit);
        if (cached?.salons) {
            // show cached immediately (non-blocking)
            startTransition(() => {
                setSalons(cached.salons);
                setRatingsMap(cached.ratings || {});
                setTotalSalons(cached.totalSalons || 0);
            });
        }

        // always fetch fresh in background
        const ctrl = new AbortController();
        addController(ctrl);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(`${backendBase}/api/salon-select/init?page=${DEFAULT_PAGE}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: ctrl.signal,
            });

            if (!isMounted.current) return;
            const { user: u, appointments, salons: salonsPage, ratings, totalSalons: total } = res.data;

            // cache page for short TTL
            writeCachedPage(DEFAULT_PAGE, limit, { salons: salonsPage, ratings, totalSalons: total });

            // set data quickly (non-blocking UI)
            startTransition(() => {
                setUser(u || null);
                setSalons(salonsPage || []);
                setRatingsMap(ratings || {});
                setTotalSalons(total || 0);
                processAppointments(appointments || []);
                setPage(DEFAULT_PAGE);
            });
        } catch (err) {
            if (!axios.isCancel(err) && err.name !== "CanceledError") {
                console.error("INIT FETCH ERROR:", err);
            }
        } finally {
            removeController(ctrl);
            if (isMounted.current) setLoadingInitial(false);
        }
    }, [firebaseUser, backendBase, limit, readCachedPage, writeCachedPage, processAppointments]);

    // load more / pagination
    const loadMore = useCallback(
        async (nextPage) => {
            if (!firebaseUser || loading) return;
            setLoading(true);

            const ctrl = new AbortController();
            addController(ctrl);
            try {
                const token = await firebaseUser.getIdToken();
                const res = await axios.get(`${backendBase}/api/salon-select/init?page=${nextPage}&limit=${limit}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ctrl.signal,
                });
                if (!isMounted.current) return;

                const { salons: newSalons, ratings: newRatings } = res.data;

                startTransition(() => {
                    setSalons((prev) => [...prev, ...(newSalons || [])]);
                    setRatingsMap((prev) => ({ ...prev, ...(newRatings || {}) }));
                    setPage(nextPage);
                });

                // cache page
                writeCachedPage(nextPage, limit, { salons: newSalons, ratings: newRatings, totalSalons });
            } catch (err) {
                if (!axios.isCancel(err) && err.name !== "CanceledError") {
                    console.error("LOAD MORE ERROR:", err);
                }
            } finally {
                removeController(ctrl);
                if (isMounted.current) setLoading(false);
            }
        },
        [firebaseUser, backendBase, limit, loading, writeCachedPage, totalSalons]
    );

    // refresh appointments (debounced)
    const refreshAppointments = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const token = await firebaseUser.getIdToken();
            const res = await axios.get(`${backendBase}/api/appointments/mine`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            processAppointments(res.data);
        } catch (err) {
            console.error("❌ Błąd przy odświeżaniu wizyt:", err);
        }
    }, [firebaseUser, backendBase, processAppointments]);

    const debouncedRefresh = useMemo(() => debounce(refreshAppointments, 300), [refreshAppointments]);

    // initial & visibility effects
    useEffect(() => {
        if (!firebaseUser) return;
        loadInitial();
    }, [firebaseUser, loadInitial]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "visible" && firebaseUser) debouncedRefresh();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [firebaseUser, debouncedRefresh]);

    useEffect(() => {
        if (location.pathname === "/salon-select" && firebaseUser) debouncedRefresh();
    }, [location.pathname, firebaseUser, debouncedRefresh]);

    useEffect(() => {
        if (location.state?.refresh) refreshAppointments();
    }, [location.state?.refresh, refreshAppointments]);

    // Memoize stable salons ref to reduce re-renders
    const stableSalons = useMemo(() => salons, [salons]);

    // Filtering (deferred search)
    const filteredSalons = useMemo(() => {
        const q = (deferredSearch || "").trim().toLowerCase();
        if (!q) return stableSalons;
        return stableSalons.filter((s) => s.name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q));
    }, [stableSalons, deferredSearch]);

    // infinite scroll using intersection observer
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (!("IntersectionObserver" in window)) return;
        const el = loadMoreRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const next = page + 1;
                        const maxPage = Math.ceil((totalSalons || 0) / limit);
                        if (next <= maxPage) loadMore(next);
                    }
                });
            },
            { rootMargin: "200px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [page, totalSalons, loadMore, limit]);

    // Rebook handler (stable ref)
    const handleRebook = useCallback(
        (appt) => {
            if (!appt) return;
            const addonIds = (appt.addons || []).map((a) => a.addon_id ?? a.id ?? a.addon?.id).filter(Boolean);
            const payload = { fromRebook: true, service_id: appt.service_id, addon_ids: addonIds, employee_id: appt.employee_id };
            localStorage.setItem("selectedService", JSON.stringify(payload));
            localStorage.setItem("lockEmployeeSelection", "true");
            const salonInfo = { id: appt.salon_id, name: appt.salon_name, city: appt.salon_city, street: appt.salon_street, street_number: appt.salon_street_number };
            localStorage.setItem("selectedSalon", JSON.stringify(salonInfo));
            navigate("/booking");
        },
        [navigate]
    );

    const formatTime = (t) => (t ? t.slice(0, 5) : "");

    // UI
    if (loadingInitial) {
        // immediate paint skeleton layout (fast perceived load)
        return (
            <div className={`min-h-screen px-5 py-8 font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
                <header className="mb-6">
                    <h1 className="text-3xl font-semibold mb-2">Wczytywanie...</h1>
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Ładuję stronę...</p>
                </header>

                <div className="relative mb-8">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-gray-500"}`} size={20} />
                    <div className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm ${isDark ? "bg-gray-800" : "bg-white"}`} />
                </div>

                <div className="mb-6">
                    <div className={`rounded-xl p-5 border ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
                        <div className="h-6 w-1/3 rounded bg-gray-300/40 mb-2" />
                        <div className="h-3 w-1/4 rounded bg-gray-300/30" />
                    </div>
                </div>

                <h2 className="text-xl font-semibold mb-4">Polecane salony</h2>

                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                    {Array.from({ length: limit }).map((_, i) => (
                        <SalonCardSkeleton key={i} isDark={isDark} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen px-5 py-8 font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
            <header className="mb-6">
                <h1 className="text-3xl font-semibold mb-2">{user ? `Cześć, ${user.name?.split(" ")[0]}!` : "Witaj!"}</h1>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Znajdź najlepszego barbera lub stylistę w pobliżu</p>
            </header>

            <div className="relative mb-8">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-gray-500"}`} size={20} />
                <input
                    type="text"
                    placeholder="Szukaj salonu, usługi lub miasta..."
                    value={search}
                    onFocus={() => setShowAdvancedSearch(true)}
                    onChange={(e) => startTransition(() => setSearch(e.target.value))}
                    className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-[${PRIMARY}] ${isDark ? "bg-gray-800 text-gray-200 placeholder-gray-500" : "bg-white text-gray-900 placeholder-gray-400"}`}
                />
            </div>

            <AppointmentCard
                nextAppointment={nextAppointment}
                lastAppointment={lastAppointment}
                isDark={isDark}
                formatTime={formatTime}
                showAppointmentDetails={showAppointmentDetails}
                setShowAppointmentDetails={setShowAppointmentDetails}
                handleRebook={handleRebook}
            />

            <h2 className="text-xl font-semibold mb-4">Polecane salony</h2>

            {filteredSalons.length === 0 ? (
                <p className={isDark ? "text-gray-500" : "text-gray-600"}>Brak salonów spełniających kryteria.</p>
            ) : (
                <>
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                        {filteredSalons.map((salon, i) => (
                            <SalonCard key={salon.id} salon={salon} index={i} isDark={isDark} rating={ratingsMap[Number(salon.id)]} />
                        ))}
                    </div>

                    <div className="mt-8 flex justify-center">
                        {/* show more button */}
                        {salons.length < totalSalons ? (
                            <button
                                onClick={() => {
                                    const next = page + 1;
                                    loadMore(next);
                                }}
                                disabled={loading}
                                className="px-4 py-2 rounded-lg bg-[#E57B2C] text-white"
                            >
                                {loading ? "Ładowanie..." : "Pokaż więcej"}
                            </button>
                        ) : (
                            <div className="text-sm text-gray-400">To wszystkie salony.</div>
                        )}
                    </div>

                    {/* invisible sentinel for infinite scroll */}
                    <div ref={loadMoreRef} style={{ height: 1 }} />
                </>
            )}

            <AnimatePresence>
                {showAdvancedSearch && <AdvancedSearchModal onClose={() => setShowAdvancedSearch(false)} backendBase={backendBase} navigate={navigate} />}
            </AnimatePresence>
        </div>
    );
}

// AppointmentCard and SalonCard components kept and optimized
const AppointmentCard = React.memo(({ nextAppointment, lastAppointment, isDark, formatTime, showAppointmentDetails, setShowAppointmentDetails, handleRebook }) => {
    const appt = nextAppointment || lastAppointment;
    if (!appt)
        return (
            <div className={`rounded-xl p-5 mb-6 border text-center text-sm shadow-sm ${isDark ? "bg-gray-900 border-gray-700 text-gray-400" : "bg-white border-gray-200 text-gray-600"}`}>
                Nie masz jeszcze żadnych wizyt.
            </div>
        );

    return (
        <div className={`rounded-xl p-5 mb-6 border shadow-sm ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-base font-semibold">{nextAppointment ? "Moja najbliższa wizyta" : "Moja ostatnia wizyta"}</h3>
                    <p className={`text-sm mt-0.5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        {appt.service_name} · {new Date(appt.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })} o {formatTime(appt.start_time)}
                    </p>
                </div>
                <button onClick={() => setShowAppointmentDetails(!showAppointmentDetails)} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${isDark ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                    {showAppointmentDetails ? "Ukryj" : "Szczegóły"}
                </button>
            </div>

            <AnimatePresence>
                {showAppointmentDetails && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.25 }} className={`mt-4 text-sm border-t pt-3 space-y-3 ${isDark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"}`}>
                        {appt.addons?.length > 0 && (
                            <div className="pb-2 border-b mb-2">
                                <h4 className="text-sm font-medium mb-1.5">Dodatki</h4>
                                <ul className="text-sm space-y-1.5">
                                    {appt.addons.map((a, idx) => (
                                        <li key={idx} className={`flex justify-between ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                            <span>{a.addon_name}</span>
                                            <span className="text-gray-400 text-xs">+{a.addon_price} zł · {a.addon_duration ? `${a.addon_duration} min` : "—"}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-y-2">
                            <Info label="Pracownik" value={appt.employee_name} />
                            <Info label="Data" value={new Date(appt.date).toLocaleDateString("pl-PL")} />
                            <Info label="Godzina" value={`${formatTime(appt.start_time)} – ${formatTime(appt.end_time)}`} />
                            <Info label="Cena łączna" value={`${((+appt.service_price || 0) + (appt.addons?.reduce((s, a) => s + (+a.addon_price || 0), 0) || 0)).toFixed(2)} zł`} />
                        </div>

                        {!nextAppointment && (
                            <div className="pt-3">
                                <button onClick={() => handleRebook(appt)} className="w-full rounded-lg py-2.5 text-sm font-medium bg-[#E57B2C] text-white hover:bg-[#d36f25]">Umów ponownie</button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

const SalonCard = React.memo(({ salon, index, isDark, rating }) => {
    const navigate = useNavigate();

    return (
        <motion.div
            key={salon.id}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
            whileHover={{ scale: 1.02 }}
            className={`rounded-2xl overflow-hidden border shadow-md cursor-pointer ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
            onClick={() => {
                localStorage.removeItem("selectedService");
                localStorage.removeItem("lockEmployeeSelection");
                localStorage.setItem("selectedSalon", JSON.stringify(salon));
                navigate("/services");
            }}
        >
            <div className={`h-44 w-full overflow-hidden flex items-center justify-center ${isDark ? "bg-gray-900" : "bg-gray-100"}`}>
                {salon.image_url ? (
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`${import.meta.env.VITE_API_URL}/uploads/${salon.image_url}?w=500&fit=cover`}
                        srcSet={`${import.meta.env.VITE_API_URL}/uploads/${salon.image_url}?w=400 400w, ${import.meta.env.VITE_API_URL}/uploads/${salon.image_url}?w=800 800w`}
                        sizes="(max-width: 768px) 100vw, 33vw"
                        alt={salon.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.target.style.display = "none";
                            e.target.parentElement.innerHTML = '<div class="flex items-center justify-center text-gray-400 text-sm">Brak zdjęcia 📷</div>';
                        }}
                    />
                ) : (
                    <div className={`text-sm flex flex-col items-center justify-center h-full ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        <span className="text-2xl mb-1">📷</span>
                        <span>Brak zdjęcia</span>
                    </div>
                )}
            </div>

            <div className="p-4">
                <h3 className="text-lg font-semibold mb-1 truncate">{salon.name}</h3>

                <div className={`flex items-center text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1" />
                    <span>{rating && !isNaN(rating.average) ? Number(rating.average).toFixed(1) : "—"}</span>
                    <span className={`ml-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>· {rating?.total ?? 0} opinii</span>
                </div>

                <div className={`flex items-center text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    <MapPin size={16} className={`mr-1 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                    <span className="truncate">{salon.city}, {salon.street} {salon.street_number}</span>
                </div>
            </div>
        </motion.div>
    );
});

const Info = ({ label, value }) => (
    <div>
        <span className="block text-xs text-gray-500">{label}</span>
        <span className="font-medium">{value}</span>
    </div>
);
