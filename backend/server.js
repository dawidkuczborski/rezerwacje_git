// server_optimized.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import pkg from "pg";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { pathToRegexp } from "path-to-regexp";

dotenv.config();
const { Pool } = pkg;


// -------------------- WEB PUSH INIT --------------------
webpush.setVapidDetails(
    "mailto:admin@yourapp.com",
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);


const loginLocks = new Map();

// -------------------- Helpers / Small utilities --------------------
const ensureDirSync = (dirPath) => {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (e) {
        if (e.code !== "EEXIST") throw e;
    }
};

const safeFilename = (originalName) => {
    const base = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    return `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${base}`;
};

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

class Cache {
    constructor() {
        this.map = new Map();
    }
    set(key, value, ttlMs = 30_000) {
        const expires = Date.now() + ttlMs;
        this.map.set(key, { value, expires });
        setTimeout(() => {
            const v = this.map.get(key);
            if (v && v.expires <= Date.now()) this.map.delete(key);
        }, ttlMs + 50);
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry) return null;
        if (entry.expires <= Date.now()) {
            this.map.delete(key);
            return null;
        }
        return entry.value;
    }
    del(key) {
        this.map.delete(key);
    }
}
const cache = new Cache();

// -------------------- Firebase Admin init --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
    console.warn(
        "⚠️ serviceAccountKey.json missing — Firebase admin will not initialize. Ensure file exists for auth verification in local dev."
    );
}

let firebaseInitialized = false;
try {
    if (fs.existsSync(serviceAccountPath)) {
        const sa = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
        admin.initializeApp({
            credential: admin.credential.cert(sa),
        });
        firebaseInitialized = true;
        console.log("✅ Firebase admin initialized");
    } else {
        console.warn("⚠️ Firebase admin not initialized (serviceAccountKey.json not found). verifyToken will still allow unauthenticated requests.");
    }
} catch (err) {
    console.error("❌ Firebase init error:", err);
}

// -------------------- Postgres pool --------------------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.PG_CONNECTION || "",
    ssl: false,
});


pool.on("error", (err) => {
    console.error("Unexpected PG client error", err);
});

// -------------------- Express app --------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// serve uploads directory (ensure exists)
ensureDirSync(path.join(__dirname, "uploads"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -------------------- Multer storages (improved) --------------------
const makeStorage = (subpathFn) =>
    multer.diskStorage({
        destination: (req, file, cb) => {
            try {
                const basePath = path.join(__dirname, "uploads", subpathFn(req));
                ensureDirSync(basePath);
                cb(null, basePath);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            cb(null, safeFilename(file.originalname));
        },
    });

const uploadSalonImage = multer({ storage: makeStorage(() => "salons") });
const uploadServiceImage = multer({
    storage: makeStorage((req) => `salon_${req.body.salon_id || "unknown"}/services`),
});
const uploadEmployeeImage = multer({
    storage: makeStorage((req) => `salon_${req.body.salon_id || "unknown"}/employees`),
});

// export-like for compatibility with previous code style if others import from this file
export { uploadSalonImage, uploadServiceImage, uploadEmployeeImage };

// -------------------- DB init: tables + useful indexes --------------------
const initTables = async () => {
    // Create tables (same schema as original) and add indexes to speed up queries

    await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'client',
    is_provider BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);


    await pool.query(`
    CREATE TABLE IF NOT EXISTS salons (
      id SERIAL PRIMARY KEY,
      owner_uid VARCHAR(255) REFERENCES users(uid) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      city VARCHAR(100),
      street VARCHAR(100),
      street_number VARCHAR(20),
      postal_code VARCHAR(20),
      phone VARCHAR(50),
      description TEXT,
      image_url VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      uid VARCHAR(255) UNIQUE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      description TEXT,
      image_url VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      description TEXT,
      image_url VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_services (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (employee_id, service_id)
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_schedule (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      open_time TIME NOT NULL,
      close_time TIME NOT NULL,
      is_day_off BOOLEAN DEFAULT false,
      UNIQUE (employee_id, day_of_week)
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS salon_holidays (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      reason VARCHAR(255),
      UNIQUE (salon_id, date)
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      client_uid VARCHAR(255) REFERENCES users(uid) ON DELETE SET NULL,
      service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      status VARCHAR(50) DEFAULT 'booked',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS service_addons (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS service_addon_links (
      id SERIAL PRIMARY KEY,
      service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
      addon_id INTEGER REFERENCES service_addons(id) ON DELETE CASCADE,
      UNIQUE (service_id, addon_id)
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_addons (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
      addon_id INTEGER REFERENCES service_addons(id) ON DELETE CASCADE,
      UNIQUE (appointment_id, addon_id)
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_vacations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS salon_categories (
      id SERIAL PRIMARY KEY,
      salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE (salon_id, category_id)
    );
  `);

    // 🔹 Krótkie blokady czasu (np. przerwy, szkolenia, spotkania)
    await pool.query(`
  CREATE TABLE IF NOT EXISTS employee_time_off (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS salon_clients (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    client_uid VARCHAR(255) REFERENCES users(uid) ON DELETE CASCADE,
    first_appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (salon_id, client_uid)
  );
`);

    // seed categories safely
    await pool.query(`
    INSERT INTO categories (name)
    VALUES 
      ('Fryzjer'),
      ('Barber'),
      ('Kosmetyczka'),
      ('Spa'),
      ('Manicure / Pedicure')
    ON CONFLICT (name) DO NOTHING;
  `);

    // Useful indexes to speed up heavy queries:
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_employee_date ON appointments (employee_id, date, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_employee_schedule_emp_day ON employee_schedule (employee_id, day_of_week)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_addons_id ON service_addons (id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_employee_services_service ON employee_services (service_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_salon_holidays_salon_date ON salon_holidays (salon_id, date)`);


    await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        subscription JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`);


    console.log("✅ Tables and indexes ensured");
};

// run initTables but don't block app start too long — log errors if any
initTables().catch((err) => console.error("❌ initTables error:", err));

// -------------------- Middleware: verifyToken --------------------
const verifyToken = asyncHandler(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // No token → allow guest
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(" ")[1];

        // Firebase not initialized → skip verification (local dev mode)
        if (!firebaseInitialized) {
            console.warn("⚠️ Firebase admin not initialized; skipping token verification");
            req.user = null;
            return next();
        }

        // Verify token with Firebase
        const decoded = await admin.auth().verifyIdToken(token);

        // Try fetch user from local DB
        const userResult = await pool.query(
            "SELECT * FROM users WHERE uid = $1 LIMIT 1",
            [decoded.uid]
        );

        if (userResult.rows.length === 0) {
            req.user = {
                uid: decoded.uid,
                email: decoded.email,
                role: "guest",
            };
        } else {
            req.user = userResult.rows[0];
        }

        next();
    } catch (err) {
        console.warn(
            "verifyToken warning — token invalid or verification failed:",
            err?.message || err
        );
        req.user = null;
        next();
    }
});


// -------------------------------------
// Provider access
// -------------------------------------
function requireProviderRole(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: "Brak autoryzacji" });
    }

    if (req.user.is_provider === true) {
        return next();
    }

    return res.status(403).json({ error: "Tylko właściciele salonów mają dostęp" });
}

// -------------------------------------
// Employee OR Provider access
// -------------------------------------
function requireEmployeeOrProviderRole(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: "Brak autoryzacji" });
    }

    if (req.user.role === "employee" || req.user.is_provider === true) {
        return next();
    }

    return res.status(403).json({ error: "Brak uprawnień" });
}

// -------------------- GLOBAL SALON ACCESS MIDDLEWARE --------------------
app.use(async (req, res, next) => {
    try {
        const uid = req.user?.uid;

        // brak zalogowania → skip
        if (!uid) return next();

        // sprawdzany salon w query/body/header
        const requestedSalonId = Number(
            req.query.salon_id ||
            req.body.salon_id ||
            req.headers["x-salon-id"]
        );

        // endpoint nie wymaga salonu → przepuść
        if (!requestedSalonId) return next();

        // salony providera
        const providerSalonsRes = await pool.query(
            `SELECT id FROM salons WHERE owner_uid = $1`,
            [uid]
        );
        const providerSalonIds = providerSalonsRes.rows.map(s => s.id);

        // salon pracownika
        const empRes = await pool.query(
            `SELECT salon_id FROM employees WHERE uid = $1`,
            [uid]
        );
        const employeeSalonId = empRes.rows[0]?.salon_id ?? null;

        const allowed = new Set([
            ...providerSalonIds,
            ...(employeeSalonId ? [employeeSalonId] : [])
        ]);

        if (!allowed.has(requestedSalonId)) {
            return res.status(403).json({
                error: "Brak dostępu do tego salonu",
                forceLogout: true
            });
        }

        req.salon_id = requestedSalonId;
        next();

    } catch (err) {
        console.error("GLOBAL SALON CHECK ERROR:", err);
        next();
    }
});




// -------------------- Helper DB functions --------------------
const getOwnerSalonId = async (ownerUid) => {
    if (!ownerUid) return null;
    const res = await pool.query("SELECT id FROM salons WHERE owner_uid = $1 LIMIT 1", [ownerUid]);
    return res.rows[0]?.id ?? null;
};

// -------------------- Routes (kept same names + behavior) --------------------

// Auth: register
app.post(
    "/api/auth/register",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { email, name, role, phone } = req.body;
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak UID użytkownika" });

        const phoneRegex = /^[0-9]{9}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ error: "Numer telefonu musi zawierać dokładnie 9 cyfr" });
        }

        const existing = await pool.query("SELECT * FROM users WHERE uid = $1", [uid]);
        if (existing.rows.length > 0)
            return res.status(200).json({ message: "Użytkownik już istnieje", user: existing.rows[0] });

        const result = await pool.query(
            `INSERT INTO users (uid, email, name, phone, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [uid, email, name, phone, role || "client"]
        );

        res.status(201).json({ message: "✅ Użytkownik zarejestrowany", user: result.rows[0] });
    })
);


app.post(
    "/api/auth/link-client-phone",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak UID użytkownika" });

        // 1. Pobranie numeru telefonu nowo zarejestrowanego użytkownika
        const userRes = await pool.query(
            `SELECT phone FROM users WHERE uid = $1`,
            [uid]
        );

        if (!userRes.rows.length) {
            return res.status(404).json({ error: "Nie znaleziono użytkownika w bazie" });
        }

        const phone = userRes.rows[0].phone;

        // 2. Pobranie klientów z takim numerem
        const clients = await pool.query(
            `
            SELECT id, salon_id, employee_id, first_name, last_name 
            FROM salon_clients
            WHERE phone = $1 AND client_uid IS NULL
            `,
            [phone]
        );

        if (clients.rows.length === 0) {
            return res.json({
                success: true,
                message: "Brak klientów do powiązania"
            });
        }

        // 3. Aktualizacja klienta + wszystkich jego rezerwacji
        for (const c of clients.rows) {
            // przypisz UID do salon client
            await pool.query(
                `
                UPDATE salon_clients
                SET client_uid = $1
                WHERE id = $2
                `,
                [uid, c.id]
            );

            // zaktualizuj rezerwacje
            await pool.query(
                `
                UPDATE appointments
                SET client_uid = $1
                WHERE client_local_id = $2
                `,
                [uid, c.id]
            );
        }

        res.json({
            success: true,
            linked_count: clients.rows.length,
            linked_clients: clients.rows
        });
    })
);


// Auth: me
app.get(
    "/api/auth/me",
    verifyToken,
    asyncHandler(async (req, res) => {

        console.log("🔹 /api/auth/me → START");
        console.log("🔸 Authenticated UID:", req.user?.uid);

        if (!req.user?.uid) {
            return res.status(401).json({ error: "Brak użytkownika" });
        }

        // 1️⃣ Pobieramy usera z bazy
        const existing = await pool.query(
            "SELECT * FROM users WHERE uid = $1",
            [req.user.uid]
        );

        if (existing.rows.length === 0) {
            return res.json({
                uid: req.user.uid,
                email: req.user.email,
                role: "client",
                is_provider: false
            });
        }

        const userData = existing.rows[0];

        console.log("🔹 Rola:", userData.role);
        console.log("🔹 is_provider:", userData.is_provider);

        // 2️⃣ Provider – pobierz wszystkie salony ownera
        if (userData.is_provider === true) {
            const salons = await pool.query(
                "SELECT id, name FROM salons WHERE owner_uid = $1",
                [userData.uid]
            );

            console.log("✔ Salony providera:", salons.rows);

            userData.salons = salons.rows; // może być 0,1,n
        }

        // 3️⃣ Employee – pobierz jeden salon_id
        if (userData.role === "employee") {
            const employeeRow = await pool.query(
                "SELECT salon_id FROM employees WHERE uid = $1",
                [userData.uid]
            );

            if (employeeRow.rows.length > 0) {
                userData.salon_id = employeeRow.rows[0].salon_id;
                console.log("✔ Salon pracownika:", userData.salon_id);
            }
        }

        console.log("🔚 /api/auth/me → END");
        res.json(userData);
    })
);



// ✅ Update user profile
app.put(
    "/api/auth/me",
    verifyToken,
    asyncHandler(async (req, res) => {
        if (!req.user?.uid) return res.status(401).json({ error: "Brak autoryzacji" });
        const { name, phone } = req.body;

        if (phone && !/^[0-9]{9}$/.test(phone)) {
            return res.status(400).json({ error: "Numer telefonu musi mieć 9 cyfr" });
        }

        const result = await pool.query(
            `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone)
       WHERE uid = $3 RETURNING *`,
            [name, phone, req.user.uid]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono użytkownika" });

        res.json({ message: "✅ Profil zaktualizowany", user: result.rows[0] });
    })
);


// -------------------- WEB PUSH PUBLIC KEY --------------------
app.get("/vapid/public", (req, res) => {
    res.json({ key: process.env.VAPID_PUBLIC });
});
// -------------------- WEB PUSH SUBSCRIBE --------------------
app.post(
    "/push/subscribe",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { subscription } = req.body;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // znajdź pracownika po UID
        const empRes = await pool.query(
            "SELECT id FROM employees WHERE uid=$1",
            [uid]
        );

        if (empRes.rows.length === 0) {
            return res.status(403).json({
                error: "Tylko pracownik może subskrybować powiadomienia"
            });
        }

        const employeeId = empRes.rows[0].id;

        await pool.query(
            `INSERT INTO push_subscriptions (employee_id, subscription)
             VALUES ($1, $2)`,
            [employeeId, subscription]
        );

        res.json({ success: true });
    })
);
// -------------------- WEB PUSH SEND --------------------
app.post(
    "/push/send",
    asyncHandler(async (req, res) => {
        const { employee_id, title, body, url } = req.body;

        if (!employee_id || !title) {
            return res.status(400).json({ error: "Brak wymaganych danych" });
        }

        const rows = await pool.query(
            "SELECT subscription FROM push_subscriptions WHERE employee_id=$1",
            [employee_id]
        );

        for (const row of rows.rows) {
            try {
                const sub =
                    typeof row.subscription === "string"
                        ? JSON.parse(row.subscription)
                        : row.subscription;

                const payloadString = JSON.stringify({
                    title: String(title || ""),
                    body: String(body || ""),
                    url: String(url || "/")
                });

                await webpush.sendNotification(sub, payloadString);
            } catch (err) {
                console.log("❌ Push send error:", err.message);
            }
        }

        res.json({ success: true, sent: rows.rows.length });
    })
);


// 🔍 Ultra-fast Advanced salon search (optimized)
app.get(
    "/api/salons/search",
    asyncHandler(async (req, res) => {
        const { q = "", city = "", postal = "", category = "" } = req.query;

        // 🔹 Proste cache key — identyczne zapytanie => błyskawiczna odpowiedź
        const cacheKey = `salon_search:${q}:${city}:${postal}:${category}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        // 🔹 Ujednolicenie zapytania (usuwa zbędne LIKE '%%')
        const search = q.trim().toLowerCase();
        const cityVal = city.trim().toLowerCase();
        const postalVal = postal.trim().toLowerCase();
        const categoryVal = category.trim().toLowerCase();

        // 🔹 Bazowy SQL
        let sql = `
      SELECT s.*
      FROM salons s
      WHERE s.is_active = TRUE
    `;
        const params = [];
        let idx = 1;

        // 🔹 Szybkie wyszukiwanie po nazwie / opisie / mieście / usługach
        if (search) {
            sql += `
        AND (
          LOWER(s.name) LIKE $${idx}
          OR LOWER(s.city) LIKE $${idx}
          OR LOWER(s.description) LIKE $${idx}
          OR EXISTS (
            SELECT 1 FROM services srv
            WHERE srv.salon_id = s.id AND LOWER(srv.name) LIKE $${idx}
          )
        )
      `;
            params.push(`%${search}%`);
            idx++;
        }

        // 🔹 Filtrowanie po mieście
        if (cityVal) {
            sql += ` AND LOWER(s.city) LIKE $${idx}`;
            params.push(`%${cityVal}%`);
            idx++;
        }

        // 🔹 Filtrowanie po kodzie pocztowym lub nazwie miasta
        if (postalVal) {
            sql += ` AND (s.postal_code LIKE $${idx} OR LOWER(s.city) LIKE $${idx})`;
            params.push(`%${postalVal}%`);
            idx++;
        }

        // 🔹 Filtrowanie po kategorii (tylko gdy potrzebne)
        if (categoryVal) {
            sql += `
        AND EXISTS (
          SELECT 1
          FROM salon_categories sc
          JOIN categories c ON c.id = sc.category_id
          WHERE sc.salon_id = s.id AND LOWER(c.name) LIKE $${idx}
        )
      `;
            params.push(`%${categoryVal}%`);
            idx++;
        }

        sql += ` ORDER BY s.name ASC LIMIT 50;`;

        try {
            console.time("/api/salons/search");
            const result = await pool.query(sql, params);
            console.timeEnd("/api/salons/search");

            // 🔹 Cache na 30 s
            cache.set(cacheKey, result.rows, 30_000);

            res.json(result.rows);
        } catch (err) {
            console.error("❌ Błąd wyszukiwania salonów:", err);
            res.status(500).json({ message: "Błąd podczas wyszukiwania salonów" });
        }
    })
);

// ✅ Anulowanie wizyty
app.put("/api/appointments/:id/cancel", asyncHandler(async (req, res) => {
    await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.json({ message: "Appointment cancelled" });
}));
// ✅ Aktualizacja / zmiana terminu wizyty — z zachowaniem dodatków i historią
app.put(
    "/api/appointments/:id",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { date, start_time, end_time, status, addons } = req.body;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // 🔹 Pobierz istniejącą wizytę
        const apptRes = await pool.query("SELECT * FROM appointments WHERE id = $1", [id]);
        if (apptRes.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono wizyty" });
        const appt = apptRes.rows[0];

        if (appt.client_uid !== uid)
            return res.status(403).json({ error: "Brak uprawnień do edycji tej wizyty" });

        // 🔸 Jeśli to tylko anulowanie
        if (status && !date && !start_time && !end_time) {
            const allowed = ["cancelled", "booked", "finished"];
            if (!allowed.includes(status))
                return res.status(400).json({ error: "Nieprawidłowy status" });

            const result = await pool.query(
                "UPDATE appointments SET status=$1 WHERE id=$2 RETURNING *",
                [status, id]
            );

            // 🔹 Powiadom frontend tylko przy anulowaniu
            if (status === "cancelled") {
                io.emit("calendar_updated", {
                    type: "delete",
                    appointment_id: result.rows[0].id,
                });
                console.log("📡 Wysłano calendar_updated (DELETE):", result.rows[0].id);
            }

            return res.json({
                message: "✅ Status wizyty zaktualizowany",
                appointment: result.rows[0],
            });
        }

        // 🔸 Walidacja
        if (!date || !start_time)
            return res.status(400).json({ error: "Brak wymaganych danych (date/start_time)" });

        // 🔹 Pobierz usługę i dodatki (aktualne lub przesłane)
        const svcRes = await pool.query(
            "SELECT duration_minutes FROM services WHERE id=$1",
            [appt.service_id]
        );
        const baseDuration = Number(svcRes.rows[0]?.duration_minutes || 30);

        // Jeśli klient wysłał dodatki → użyj ich, jeśli nie → pobierz z bazy
        let addonIds = [];
        if (Array.isArray(addons) && addons.length > 0) {
            addonIds = addons.map(Number);
        } else {
            const existAddons = await pool.query(
                `SELECT addon_id FROM appointment_addons WHERE appointment_id = $1`,
                [id]
            );
            addonIds = existAddons.rows.map((r) => r.addon_id);
        }

        // 🔹 Suma czasu z dodatków
        let addonsDuration = 0;
        if (addonIds.length > 0) {
            const addRes = await pool.query(
                `SELECT COALESCE(SUM(duration_minutes),0) AS total
         FROM service_addons WHERE id = ANY($1::int[])`,
                [addonIds]
            );
            addonsDuration = Number(addRes.rows[0]?.total || 0);
        }

        const totalMin = baseDuration + addonsDuration;

        // 🔹 Oblicz end_time
        const [sh, sm] = start_time.split(":").map(Number);
        const startDate = new Date(`${date}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
        const endDate = new Date(startDate.getTime() + totalMin * 60000);
        const finalEndTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

        // 🔹 Sprawdź konflikt
        const conflict = await pool.query(
            `SELECT 1 FROM appointments
       WHERE employee_id = $1 AND date = $2
         AND status = 'booked' AND id != $5
         AND ((start_time, end_time) OVERLAPS ($3::time, $4::time))`,
            [appt.employee_id, date, start_time, finalEndTime, id]
        );
        if (conflict.rows.length > 0)
            return res.status(409).json({ error: "Termin koliduje z inną rezerwacją" });

        // 🔹 Transakcja
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 📅 aktualizacja wizyty + historia
            const updateRes = await client.query(
                `UPDATE appointments
         SET previous_date = date,
             previous_start_time = start_time,
             previous_end_time = end_time,
             date = $1,
             start_time = $2,
             end_time = $3,
             changed_at = NOW(),
             status = COALESCE($4, status)
         WHERE id = $5
         RETURNING *`,
                [date, start_time, finalEndTime, status || null, id]
            );

            // 🔹 Zaktualizuj dodatki tylko jeśli klient je podał
            if (Array.isArray(addons) && addons.length > 0) {
                await client.query("DELETE FROM appointment_addons WHERE appointment_id = $1", [id]);
                const values = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
                const params = [id, ...addons.map(Number)];
                await client.query(
                    `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`,
                    params
                );
            }

            await client.query("COMMIT");

            // 📡 Powiadom frontend o zmianie terminu wizyty (z identyfikatorem salonu i pracownika)
            io.emit("calendar_updated", {
                type: "update",
                salon_id: appt.salon_id,       // 🔹 dodane
                employee_id: appt.employee_id, // 🔹 dodane
                appointment: updateRes.rows[0],
            });

            console.log("📡 Wysłano calendar_updated (UPDATE):", updateRes.rows[0].id);


            res.json({
                message: "✅ Termin wizyty zmieniony (z dodatkami)",
                appointment: updateRes.rows[0],
            });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("❌ Błąd przy aktualizacji wizyty:", err);
            res.status(500).json({ error: "Błąd przy zapisie zmiany terminu" });
        } finally {
            client.release();
        }
    })
);

// =======================
// 💬 SYSTEM OPINII SALONÓW
// =======================

// 📋 Tworzenie tabel opinii i historii opinii
await pool.query(`
  CREATE TABLE IF NOT EXISTS salon_reviews (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    client_uid VARCHAR(255) REFERENCES users(uid) ON DELETE CASCADE,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (salon_id, client_uid)
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS salon_review_history (
    id SERIAL PRIMARY KEY,
    review_id INTEGER REFERENCES salon_reviews(id) ON DELETE CASCADE,
    old_rating INTEGER,
    old_content TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// 🧠 Middleware: tylko zalogowany klient
function requireClient(req, res, next) {
    if (!req.user || req.user.role !== "client") {
        return res.status(403).json({ error: "Tylko zalogowani klienci mogą dodawać opinie" });
    }
    next();
}

// 🧾 Pobierz wszystkie opinie dla salonu
app.get(
    "/api/reviews/by-salon/:salonId",
    asyncHandler(async (req, res) => {
        const { salonId } = req.params;
        const reviews = await pool.query(
            `
      SELECT r.*, u.name AS client_name
      FROM salon_reviews r
      LEFT JOIN users u ON u.uid = r.client_uid
      WHERE r.salon_id = $1
      ORDER BY r.created_at DESC
      `,
            [salonId]
        );

        // policz średnią
        const avgRes = await pool.query(
            `SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS count FROM salon_reviews WHERE salon_id = $1`,
            [salonId]
        );

        res.json({
            average: avgRes.rows[0]?.avg_rating || 0,
            total: Number(avgRes.rows[0]?.count || 0),
            reviews: reviews.rows,
        });
    })
);


app.get(
    "/api/salons/ratings",
    asyncHandler(async (req, res) => {
        console.log("🟡 DEBUG: START /api/salons/ratings");

        const salons = await pool.query("SELECT id, name FROM salons ORDER BY id ASC");
        console.log("🟢 Wszystkie salony:", salons.rows);

        const reviews = await pool.query("SELECT salon_id, rating FROM salon_reviews ORDER BY salon_id ASC");
        console.log("🟢 Wszystkie opinie (salon_id → liczba rekordów):");
        const grouped = reviews.rows.reduce((acc, r) => {
            acc[r.salon_id] = (acc[r.salon_id] || 0) + 1;
            return acc;
        }, {});
        console.log(grouped);

        const result = await pool.query(`
      SELECT 
        s.id AS salon_id,
        COALESCE(r.avg_rating, 0) AS average,
        COALESCE(r.total_reviews, 0) AS total,
        s.name
      FROM salons s
      LEFT JOIN (
        SELECT 
          salon_id,
          ROUND(AVG(rating)::numeric, 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM salon_reviews
        GROUP BY salon_id
      ) r ON r.salon_id = s.id
      WHERE s.is_active = true
      ORDER BY s.name ASC;
    `);

        console.log("🟢 Wynik SQL (ratings):", result.rows);

        res.json(result.rows);
    })
);




///salon select łącznie 1 endpoint////
app.get(
    "/api/salon-select/init",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // ⬅️ PAGINACJA
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        // 🔥 Wykonujemy 4 zapytania równolegle
        const [userRes, appointmentRes, salonsRes, countRes] = await Promise.all([

            // 1) User
            pool.query(
                `SELECT uid, name, email FROM users WHERE uid = $1 LIMIT 1`,
                [uid]
            ),

            // 2) Appointments
            pool.query(`
                SELECT 
                    a.*, 
                    s.name AS service_name, 
                    s.price AS service_price, 
                    e.name AS employee_name,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'addon_id', sa.id,
                                'addon_name', sa.name,
                                'addon_price', sa.price,
                                'addon_duration', sa.duration_minutes
                            )
                        ) FILTER (WHERE sa.id IS NOT NULL),
                        '[]'
                    ) AS addons
                FROM appointments a
                JOIN services s ON a.service_id = s.id
                JOIN employees e ON a.employee_id = e.id
                LEFT JOIN appointment_addons aa ON aa.appointment_id = a.id
                LEFT JOIN service_addons sa ON aa.addon_id = sa.id
                WHERE a.client_uid = $1
                GROUP BY a.id, s.name, s.price, e.name
                ORDER BY a.date DESC, a.start_time DESC
            `, [uid]),

            // 3) PAGINOWANE salony + oceny
            pool.query(`
                SELECT 
                    s.id,
                    s.name,
                    s.city,
                    s.street,
                    s.street_number,
                    s.phone,
                    s.description,
                    s.image_url,
                    COALESCE(r.avg_rating, 0) AS average,
                    COALESCE(r.total_reviews, 0) AS total_reviews
                FROM salons s
                LEFT JOIN (
                    SELECT 
                        salon_id,
                        ROUND(AVG(rating)::numeric, 1) AS avg_rating,
                        COUNT(*) AS total_reviews
                    FROM salon_reviews
                    GROUP BY salon_id
                ) r ON r.salon_id = s.id
                WHERE s.is_active = true
                ORDER BY s.name ASC
                LIMIT $1 OFFSET $2;
            `, [limit, offset]),

            // 4) Ilość wszystkich salonów (do paginacji)
            pool.query(`SELECT COUNT(*) FROM salons WHERE is_active = true;`)
        ]);
        ///zmiany///
        // 🔧 Mapa ocen { salonId: { average, total } }
        const ratingsMap = {};
        for (const s of salonsRes.rows) {
            ratingsMap[s.id] = {
                average: Number(s.average) || 0,
                total: Number(s.total_reviews) || 0
            };
        }

        res.json({
            user: userRes.rows[0] || null,
            appointments: appointmentRes.rows,
            salons: salonsRes.rows,
            ratings: ratingsMap,
            totalSalons: Number(countRes.rows[0].count),
            page,
            limit
        });
    })
);






// ➕ Dodaj opinię
app.post(
    "/api/reviews",
    verifyToken,
    requireClient,
    asyncHandler(async (req, res) => {
        const { salon_id, rating, content } = req.body;
        const uid = req.user?.uid;

        if (!salon_id || !rating) return res.status(400).json({ error: "Brak wymaganych danych" });

        // sprawdź, czy już istnieje
        const exists = await pool.query(
            "SELECT id FROM salon_reviews WHERE salon_id = $1 AND client_uid = $2",
            [salon_id, uid]
        );
        if (exists.rows.length > 0)
            return res.status(400).json({ error: "Masz już opinię o tym salonie" });

        const result = await pool.query(
            `
      INSERT INTO salon_reviews (salon_id, client_uid, rating, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
            [salon_id, uid, rating, content || ""]
        );
        res.json({ message: "✅ Opinia dodana", review: result.rows[0] });
    })
);

// ✏️ Edytuj opinię (z historią)
app.put(
    "/api/reviews/:id",
    verifyToken,
    requireClient,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { rating, content } = req.body;
        const uid = req.user?.uid;

        const existing = await pool.query(
            "SELECT * FROM salon_reviews WHERE id = $1 AND client_uid = $2",
            [id, uid]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono opinii" });

        const old = existing.rows[0];

        // zapisz historię
        await pool.query(
            `INSERT INTO salon_review_history (review_id, old_rating, old_content)
       VALUES ($1, $2, $3)`,
            [id, old.rating, old.content]
        );

        // aktualizuj opinię
        const updated = await pool.query(
            `UPDATE salon_reviews
       SET rating = $1, content = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
            [rating, content, id]
        );

        res.json({ message: "✅ Opinia zaktualizowana", review: updated.rows[0] });
    })
);

// 🗑️ Usuń opinię
app.delete(
    "/api/reviews/:id",
    verifyToken,
    requireClient,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const uid = req.user?.uid;
        const del = await pool.query(
            "DELETE FROM salon_reviews WHERE id = $1 AND client_uid = $2 RETURNING id",
            [id, uid]
        );
        if (del.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono opinii lub brak uprawnień" });
        res.json({ message: "🗑️ Opinia usunięta" });
    })
);

// 📜 Historia zmian dla jednej opinii
app.get(
    "/api/reviews/:id/history",
    verifyToken,
    requireClient,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const uid = req.user?.uid;

        // sprawdź, czy użytkownik jest właścicielem tej opinii
        const check = await pool.query(
            "SELECT id FROM salon_reviews WHERE id=$1 AND client_uid=$2",
            [id, uid]
        );
        if (check.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do historii tej opinii" });

        const result = await pool.query(
            `SELECT * FROM salon_review_history WHERE review_id = $1 ORDER BY changed_at DESC`,
            [id]
        );
        res.json(result.rows);
    })
);
// 🔧 BEZPIECZNA FUNKCJA KONWERSJI DATY → YYYY-MM-DD
function toYMD(value) {
    if (!value) return null;

    // Already YYYY-MM-DD
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
    }

    // Date object
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return value.toISOString().slice(0, 10);
    }

    // Try parse automatically
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
    }

    return null;
}





// ✅ Współdzielony kalendarz — szybki, z cache stałych danych
const salonCache = new Map(); // salonId => { holidays, vacations, schedule, employees, ts }

app.get(
    "/api/calendar/shared",
    verifyToken,
    asyncHandler(async (req, res) => {
        try {
            const uid = req.user?.uid;
            if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

            // ----------------------------------------------------
            // 1️⃣ Salon przekazany przez FRONTEND ma zawsze pierwszeństwo
            // ----------------------------------------------------
            let salonId = req.query.salon_id ? Number(req.query.salon_id) : null;

            console.log("➡ salon_id z frontendu:", salonId);

            // ----------------------------------------------------
            // 2️⃣ Jeśli frontend NIE podał salonu → sprawdzamy jako pracownik
            // ----------------------------------------------------
            if (!salonId) {
                const empRes = await pool.query(
                    "SELECT salon_id FROM employees WHERE uid=$1 LIMIT 1",
                    [uid]
                );

                if (empRes.rows.length > 0) {
                    salonId = empRes.rows[0].salon_id;
                    console.log("➡ salon_id z konta PRACOWNIKA:", salonId);
                }
            }

            // ----------------------------------------------------
            // 3️⃣ Jeśli nadal brak → sprawdzamy czy provider
            // ----------------------------------------------------
            if (!salonId) {
                const userRes = await pool.query(
                    "SELECT is_provider FROM users WHERE uid=$1 LIMIT 1",
                    [uid]
                );

                const isProvider = userRes.rows[0]?.is_provider === true;

                if (isProvider) {
                    return res.status(400).json({
                        error: "Provider musi wybrać salon (brak salon_id)"
                    });
                }
            }

            // ----------------------------------------------------
            // 4️⃣ Jeśli nadal brak salonu → koniec
            // ----------------------------------------------------
            if (!salonId) {
                return res.status(403).json({
                    error: "Brak przypisanego salonu."
                });
            }

            console.log("✔ Finalnie używamy salon_id:", salonId);


            // ----------------------------------------------------
            // ⛔️ BLOKADA LOGOWANIA (employee / provider)
            // ----------------------------------------------------
            const lockExpiration = loginLocks.get(uid);
            if (lockExpiration && lockExpiration > Date.now()) {
                return res.status(403).json({
                    error: "Dostęp zablokowany na 5 minut.",
                    lockedUntil: lockExpiration
                });
            }

            // ----------------------------------------------------
            // 🔐 PRIORYTET RÓL — employee > provider
            // ----------------------------------------------------
            const empRole = await pool.query(
                "SELECT salon_id FROM employees WHERE uid=$1 LIMIT 1",
                [uid]
            );

            const isEmployee = empRole.rows.length > 0;

            // ----------------------------------------------------
            // 🔐 EMPLOYEE — dostęp tylko do jednego salonu
            // ----------------------------------------------------
            if (isEmployee) {
                const employeeSalon = empRole.rows[0].salon_id;

                if (Number(salonId) !== Number(employeeSalon)) {
                    console.warn("🚨 Employee manipulacja salon_id:", { uid, salonId });

                    loginLocks.set(uid, Date.now() + 5 * 60 * 1000);

                    return res.status(440).json({
                        error: "Nieautoryzowana zmiana salonu — wylogowano.",
                        forceLogout: true,
                        correctSalonId: employeeSalon,
                        lockForMinutes: 5
                    });
                }

                salonId = employeeSalon;
                console.log("✔ Employee — prawidłowy salon:", employeeSalon);
            }

            // ----------------------------------------------------
            // 🔐 PROVIDER — dostęp tylko do salonów, których jest właścicielem
            // ----------------------------------------------------
            else {
                // Pobieramy wszystkie salony providera
                const providerSalonsRes = await pool.query(
                    "SELECT id FROM salons WHERE owner_uid=$1",
                    [uid]
                );

                const providerSalonIds = providerSalonsRes.rows.map(r => Number(r.id));

                console.log("Salony providera:", providerSalonIds);

                // Czy salon o który pyta użytkownik należy do niego?
                const hasAccess = providerSalonIds.includes(Number(salonId));

                if (!hasAccess) {
                    console.warn("🚨 Provider próba wejścia do NIE swojego salonu:", {
                        uid,
                        attemptedSalonId: salonId,
                        providerSalonIds
                    });

                    return res.status(440).json({
                        error: "Nie masz dostępu do tego salonu — wylogowano.",
                        forceLogout: true,
                        correctSalonId: null,
                        lockForMinutes: 5
                    });
                }

                console.log("✔ Provider — właściciel salonu:", salonId);
            }






            // ----------------------------------------------------
            // 5️⃣ RESZTA TWOJEGO KODU — BEZ ZMIAN
            // ----------------------------------------------------

            const date =
                req.query.date ||
                new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
            const dayOfWeek = new Date(date).getDay();

            const cacheKey = `salon_${salonId}`;
            const cacheTTL = 10 * 60 * 1000;
            let baseData = salonCache.get(cacheKey);
            const isExpired = !baseData || Date.now() - baseData.ts > cacheTTL;

            if (isExpired) {
                const [
                    holidaysRes,
                    scheduleRes,
                    employeesRes
                ] = await Promise.all([
                    pool.query("SELECT date FROM salon_holidays WHERE salon_id=$1", [salonId]),
                    pool.query(
                        `SELECT employee_id, open_time, close_time, is_day_off, day_of_week
                         FROM employee_schedule
                         WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                        [salonId]
                    ),
                    pool.query(
                        `SELECT 
                           id AS employee_id,
                           name AS employee_name,
                           image_url AS employee_image_url,
                           is_active
                         FROM employees
                         WHERE salon_id=$1 AND is_active=true
                         ORDER BY name ASC`,
                        [salonId]
                    ),
                ]);

                baseData = {
                    holidays: holidaysRes.rows,
                    schedule: scheduleRes.rows,
                    employees: employeesRes.rows,
                    ts: Date.now(),
                };

                salonCache.set(cacheKey, baseData);
            }

            // ZAWSZE świeże dane
            const appointmentsRes = await pool.query(
                `SELECT 
        a.id,
        a.employee_id,
        a.date::date,
        a.start_time,
        a.end_time,

        CASE 
            WHEN a.client_uid IS NOT NULL THEN 
                COALESCE(u.name, 'Klient')
            ELSE
                CONCAT(
                    COALESCE(sc.first_name, 'Klient'), 
                    ' ',
                    COALESCE(sc.last_name, ''),
                    ' (bez konta)'
                )
        END AS client_name,

        a.client_uid,
        a.client_local_id,

        COALESCE(s.name, 'Usługa') AS service_name,
        COALESCE(STRING_AGG(sa.name, ', ' ORDER BY sa.name), '') AS addons

     FROM appointments a

     LEFT JOIN users u 
        ON a.client_uid = u.uid

     LEFT JOIN salon_clients sc 
        ON sc.id = a.client_local_id

     LEFT JOIN services s 
        ON a.service_id = s.id

     LEFT JOIN appointment_addons aa 
        ON a.id = aa.appointment_id

     LEFT JOIN service_addons sa 
        ON aa.addon_id = sa.id

     WHERE a.salon_id = $1 
       AND a.date = $2 
       AND a.status != 'cancelled'

     GROUP BY 
        a.id, 
        u.name, 
        sc.first_name, 
        sc.last_name, 
        s.name

     ORDER BY a.start_time ASC`,
                [salonId, date]
            );


            const timeOffFresh = await pool.query(
                `SELECT id, employee_id, date, start_time, end_time, reason
                 FROM employee_time_off
                 WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)
                   AND date=$2`,
                [salonId, date]
            );

            const vacationsFresh = await pool.query(
                `SELECT employee_id, start_date, end_date 
                 FROM employee_vacations 
                 WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                [salonId]
            );

            const isHoliday = baseData.holidays.some((h) => toYMD(h.date) === date);

            const employees = baseData.employees.map((emp) => {
                const schedule = baseData.schedule.find(
                    (s) =>
                        Number(s.employee_id) === Number(emp.employee_id) &&
                        Number(s.day_of_week) === Number(dayOfWeek)
                );

                const isVacation = vacationsFresh.rows.some((v) => {
                    if (Number(v.employee_id) !== Number(emp.employee_id)) return false;

                    const start = new Date(v.start_date);
                    const end = new Date(v.end_date);
                    end.setHours(23, 59, 59, 999);

                    const current = new Date(date);

                    return current >= start && current <= end;
                });

                const isDayOff = isHoliday || isVacation || schedule?.is_day_off;

                return {
                    employee_id: emp.employee_id,
                    employee_name: emp.employee_name,
                    employee_image_url: emp.employee_image_url,
                    is_active: emp.is_active,
                    day_off: isDayOff,
                    working_hours: {
                        open: schedule?.open_time?.slice(0, 5) || "09:00",
                        close: schedule?.close_time?.slice(0, 5) || "17:00",
                    },
                    vacations: vacationsFresh.rows.filter(
                        (v) => Number(v.employee_id) === Number(emp.employee_id)
                    ),
                    appointments: appointmentsRes.rows.filter(
                        (a) => Number(a.employee_id) === Number(emp.employee_id)
                    ),
                    time_off: timeOffFresh.rows.filter(
                        (t) => Number(t.employee_id) === Number(emp.employee_id)
                    ),
                };
            });

            res.json({ date, employees });

        } catch (error) {
            console.error("❌ Błąd /api/calendar/shared:", error);
            res.status(500).json({ error: error.message });
        }
    })
);

////lista rezerwacji//////




async function resolveSalonAccess(uid, salonIdFromQuery) {
    let salonId = salonIdFromQuery ? Number(salonIdFromQuery) : null;

    // 1️⃣ Salon z query — priorytet
    if (!salonId) {
        const empRes = await pool.query(
            "SELECT salon_id FROM employees WHERE uid=$1 LIMIT 1",
            [uid]
        );

        if (empRes.rows.length > 0) {
            salonId = empRes.rows[0].salon_id;
        }
    }

    // 2️⃣ Jeśli nadal brak → provider musi wybrać salon
    if (!salonId) {
        const userRes = await pool.query(
            "SELECT is_provider FROM users WHERE uid=$1 LIMIT 1",
            [uid]
        );

        const isProvider = userRes.rows[0]?.is_provider === true;

        if (isProvider) {
            throw new Error("Provider musi wybrać salon (brak salon_id)");
        }
    }

    if (!salonId) {
        throw new Error("Brak przypisanego salonu.");
    }

    // 3️⃣ Sprawdzenie blokady logowania
    const lockExpiration = loginLocks.get(uid);
    if (lockExpiration && lockExpiration > Date.now()) {
        throw new Error("Dostęp zablokowany na 5 minut.");
    }

    // 4️⃣ employee czy provider?
    const empRole = await pool.query(
        "SELECT salon_id FROM employees WHERE uid=$1 LIMIT 1",
        [uid]
    );

    const isEmployee = empRole.rows.length > 0;

    if (isEmployee) {
        const employeeSalon = empRole.rows[0].salon_id;

        if (Number(salonId) !== Number(employeeSalon)) {
            loginLocks.set(uid, Date.now() + 5 * 60 * 1000);

            throw new Error("Nieautoryzowana zmiana salonu — wylogowano.");
        }

        salonId = employeeSalon;
    } else {
        // provider
        const providerSalonsRes = await pool.query(
            "SELECT id FROM salons WHERE owner_uid=$1",
            [uid]
        );

        const providerSalonIds = providerSalonsRes.rows.map((s) => Number(s.id));

        if (!providerSalonIds.includes(Number(salonId))) {
            loginLocks.set(uid, Date.now() + 5 * 60 * 1000);

            throw new Error("Provider nie ma dostępu do tego salonu — wylogowano.");
        }
    }

    // 5️⃣ pobranie danych z cache/przygotowanie baseData
    const cacheKey = `salon_${salonId}`;
    const cacheTTL = 10 * 60 * 1000;
    let baseData = salonCache.get(cacheKey);
    const isExpired = !baseData || Date.now() - baseData.ts > cacheTTL;

    if (isExpired) {
        const [holidaysRes, scheduleRes, employeesRes] = await Promise.all([
            pool.query("SELECT date FROM salon_holidays WHERE salon_id=$1", [salonId]),

            pool.query(
                `SELECT employee_id, open_time, close_time, is_day_off, day_of_week
                 FROM employee_schedule
                 WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                [salonId]
            ),

            pool.query(
                `SELECT 
                    id AS employee_id,
                    name AS employee_name,
                    image_url AS employee_image_url,
                    is_active
                 FROM employees
                 WHERE salon_id=$1
                 ORDER BY name ASC`,
                [salonId]
            ),
        ]);

        baseData = {
            holidays: holidaysRes.rows,
            schedule: scheduleRes.rows,
            employees: employeesRes.rows,
            ts: Date.now(),
        };

        salonCache.set(cacheKey, baseData);
    }

    return { resolvedSalonId: salonId, baseData };
}

app.get(
    "/api/calendar/shared/multi",
    verifyToken,
    asyncHandler(async (req, res) => {
        try {
            const uid = req.user?.uid;
            if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

            let salonId = req.query.salon_id ? Number(req.query.salon_id) : null;
            const datesRaw = req.query.dates;

            if (!datesRaw)
                return res.status(400).json({ error: "Brak parametru ?dates=YYYY-MM-DD,YYYY-MM-DD" });

            const dates = datesRaw.split(",").map((d) => d.trim()).filter(Boolean);

            if (!dates.length)
                return res.status(400).json({ error: "Brak prawidłowych dat" });

            // 🔐 pełna logika salonu + employee/provider jak w /shared
            const { resolvedSalonId, baseData } = await resolveSalonAccess(uid, salonId);

            const result = { days: {} };

            await Promise.all(
                dates.map(async (date) => {
                    const dayOfWeek = new Date(date).getDay();

                    // --- APPOINTMENTS + ceny usług i dodatków ---
                    const appointmentsRes = await pool.query(
                        `SELECT 
                            a.id,
                            a.employee_id,
                            a.date::date,
                            a.start_time,
                            a.end_time,

                            CASE 
                                WHEN a.client_uid IS NOT NULL THEN 
                                    COALESCE(u.name, 'Klient')
                                ELSE
                                    CONCAT(
                                        COALESCE(sc.first_name, 'Klient'), 
                                        ' ',
                                        COALESCE(sc.last_name, ''),
                                        ' (bez konta)'
                                    )
                            END AS client_name,

                            s.name AS service_name,
                            s.price AS service_price,

                            COALESCE(STRING_AGG(sa.name, ', ' ORDER BY sa.name), '') AS addons,
                            COALESCE(SUM(sa.price), 0) AS addons_price,

                            (s.price + COALESCE(SUM(sa.price), 0)) AS total_price

                        FROM appointments a
                        LEFT JOIN users u ON a.client_uid = u.uid
                        LEFT JOIN salon_clients sc ON sc.id = a.client_local_id
                        LEFT JOIN services s ON a.service_id = s.id
                        LEFT JOIN appointment_addons aa ON a.id = aa.appointment_id
                        LEFT JOIN service_addons sa ON aa.addon_id = sa.id

                        WHERE a.salon_id = $1 
                          AND a.date = $2 
                          AND a.status != 'cancelled'

                        GROUP BY 
                            a.id, 
                            u.name, 
                            sc.first_name, 
                            sc.last_name, 
                            s.name, 
                            s.price

                        ORDER BY a.start_time ASC`,
                        [resolvedSalonId, date]
                    );

                    // --- TIME OFF ---
                    const timeOffRes = await pool.query(
                        `SELECT id, employee_id, date, start_time, end_time, reason
                         FROM employee_time_off
                         WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)
                           AND date=$2`,
                        [resolvedSalonId, date]
                    );

                    // --- VACATIONS ---
                    const vacationsRes = await pool.query(
                        `SELECT employee_id, start_date, end_date 
                         FROM employee_vacations
                         WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                        [resolvedSalonId]
                    );

                    const isHoliday = baseData.holidays.some((h) => toYMD(h.date) === date);

                    // --- TYLKO aktywni pracownicy ---
                    const dayEmployees = baseData.employees
                        .filter((e) => e.is_active) // <-- ważne!
                        .map((emp) => {
                            const schedule = baseData.schedule.find(
                                (s) =>
                                    Number(s.employee_id) === Number(emp.employee_id) &&
                                    Number(s.day_of_week) === Number(dayOfWeek)
                            );

                            const isVacation = vacationsRes.rows.some((v) => {
                                if (Number(v.employee_id) !== Number(emp.employee_id)) return false;

                                const start = new Date(v.start_date);
                                const end = new Date(v.end_date);
                                end.setHours(23, 59, 59, 999);

                                const current = new Date(date);
                                return current >= start && current <= end;
                            });

                            const isDayOff =
                                isHoliday ||
                                isVacation ||
                                schedule?.is_day_off;

                            return {
                                employee_id: emp.employee_id,
                                employee_name: emp.employee_name,
                                employee_image_url: emp.employee_image_url,
                                is_active: emp.is_active,

                                day_off: isDayOff,

                                working_hours: {
                                    open: schedule?.open_time?.slice(0, 5) || "09:00",
                                    close: schedule?.close_time?.slice(0, 5) || "17:00",
                                },

                                appointments: appointmentsRes.rows.filter(
                                    (a) => Number(a.employee_id) === Number(emp.employee_id)
                                ),

                                time_off: timeOffRes.rows.filter(
                                    (t) => Number(t.employee_id) === Number(emp.employee_id)
                                ),
                            };
                        });

                    result.days[date] = { date, employees: dayEmployees };
                })
            );

            res.json(result);
        } catch (err) {
            console.error("❌ Błąd /api/calendar/shared/multi:", err);
            res.status(500).json({ error: err.message });
        }
    })
);










////koniec listy rezerwacji////

// ✅ Drag & drop / aktualizacja terminu wizyty
app.put(
    "/api/calendar/shared/:id",
    verifyToken,
    asyncHandler(async (req, res) => {
        try {
            const { id } = req.params;
            const { employee_id, date, start_time, end_time, force } = req.body;
            const uid = req.user?.uid;

            if (!uid)
                return res.status(401).json({ error: "Brak autoryzacji" });

            if (!date)
                return res.status(400).json({ error: "Brak daty — nie można zapisać zmiany" });


            /* --------------------------------------------------------------
               1️⃣ Rozpoznanie użytkownika (EMPLOYEE lub PROVIDER)
               — TAKA SAMA LOGIKA jak w GET /api/calendar/shared
            --------------------------------------------------------------- */

            let salonId = null;
            let isEmployee = false;

            // Czy to employee?
            const empRes = await pool.query(
                "SELECT id, salon_id FROM employees WHERE uid=$1 LIMIT 1",
                [uid]
            );

            if (empRes.rows.length > 0) {
                isEmployee = true;
                salonId = empRes.rows[0].salon_id;

                // Employee może zmieniać TYLKO swoje salony
            } else {
                // Provider → pobierz salony
                const providerSalonRes = await pool.query(
                    "SELECT id FROM salons WHERE owner_uid=$1",
                    [uid]
                );

                const allowedSalons = providerSalonRes.rows.map((r) => r.id);

                // Pobierz salon wizyty
                const apptSalon = await pool.query(
                    "SELECT salon_id FROM appointments WHERE id=$1",
                    [id]
                );

                if (apptSalon.rows.length === 0)
                    return res.status(404).json({ error: "Nie znaleziono wizyty" });

                const apptSalonId = apptSalon.rows[0].salon_id;

                if (!allowedSalons.includes(apptSalonId)) {
                    return res.status(403).json({
                        error: "Provider nie ma dostępu do tego salonu"
                    });
                }

                salonId = apptSalonId;
            }


            /* --------------------------------------------------------------
               2️⃣ Sprawdzenie czy wizyta istnieje w tym salonie
            --------------------------------------------------------------- */

            const check = await pool.query(
                "SELECT * FROM appointments WHERE id=$1 AND salon_id=$2",
                [id, salonId]
            );

            if (check.rows.length === 0)
                return res.status(404).json({ error: "Nie znaleziono wizyty w tym salonie" });


            /* --------------------------------------------------------------
               3️⃣ Sprawdzenie konfliktów
            --------------------------------------------------------------- */
            if (!force) {
                const conflict = await pool.query(
                    `SELECT 
                      a.id, u.name AS client_name, s.name AS service_name
                     FROM appointments a
                     LEFT JOIN users u ON a.client_uid=u.uid
                     LEFT JOIN services s ON a.service_id=s.id
                     WHERE a.employee_id=$1
                       AND a.date=$2
                       AND a.status!='cancelled'
                       AND a.id::text!=$5::text
                       AND ((a.start_time, a.end_time) OVERLAPS ($3::time, $4::time))`,
                    [employee_id, date, start_time, end_time, id]
                );

                if (conflict.rows.length > 0)
                    return res.status(409).json({
                        error: "Termin koliduje z inną wizytą tego pracownika",
                        conflicts: conflict.rows,
                    });
            }


            /* --------------------------------------------------------------
               4️⃣ Aktualizacja wizyty
            --------------------------------------------------------------- */

            const updated = await pool.query(
                `UPDATE appointments
                 SET employee_id=$1, date=$2, start_time=$3, end_time=$4, changed_at=NOW()
                 WHERE id=$5 AND salon_id=$6
                 RETURNING *`,
                [employee_id, date, start_time, end_time, id, salonId]
            );

            io.emit("calendar_updated", {
                type: "update",
                salon_id: salonId,
                appointment: updated.rows[0],
            });

            res.json({
                success: true,
                message: "✅ Termin zaktualizowany",
                appointment: updated.rows[0],
            });

        } catch (error) {
            console.error("❌ Błąd PUT /api/calendar/shared/:id:", error);
            res.status(500).json({ error: error.message });
        }
    })
);

// ✅ Szczegóły wizyty (dla modala edycji)
app.get(
    "/api/appointments/:id/details",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        // 🔹 Pobierz dane wizyty — obsługa client_uid + client_local_id
        const apptRes = await pool.query(
            `
      SELECT 
    a.id,
    to_char(a.date, 'YYYY-MM-DD') AS date,
    a.start_time,
    a.end_time,
    a.service_id,
    a.employee_id,
    a.client_uid,
    a.client_local_id,
    a.changed_at,
 

        -- 👇 NAZWA KLIENTA: najpierw z users, jeśli nie ma to z salon_clients
        COALESCE(
          u.name,
          NULLIF(trim(CONCAT_WS(' ', sc.first_name, sc.last_name)), '')
        ) AS client_name,

        -- 👇 TELEFON: najpierw z users, jeśli brak to z salon_clients
        COALESCE(u.phone, sc.phone) AS client_phone,

        e.name AS employee_name,

        s.name AS service_name,
        s.price AS service_price,
        s.salon_id AS salon_id,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', sa.id,
              'name', sa.name,
              'price', sa.price,
              'duration_minutes', sa.duration_minutes
            )
          ) FILTER (WHERE sa.id IS NOT NULL),
          '[]'
        ) AS addons

      FROM appointments a
      LEFT JOIN users u ON a.client_uid = u.uid
      LEFT JOIN salon_clients sc ON a.client_local_id = sc.id
      LEFT JOIN employees e ON a.employee_id = e.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN appointment_addons aa ON a.id = aa.appointment_id
      LEFT JOIN service_addons sa ON aa.addon_id = sa.id

      WHERE a.id = $1

      GROUP BY 
        a.id,
        u.name,
        u.phone,
        sc.first_name,
        sc.last_name,
        sc.phone,
        e.name,
        s.name,
        s.price,
        s.salon_id;
      `,
            [id]
        );

        if (apptRes.rows.length === 0) {
            return res.status(404).json({ error: "Nie znaleziono wizyty" });
        }

        const appointment = apptRes.rows[0];
        const salonId = appointment.salon_id;

        // 🔹 Pobierz dostępnych pracowników, usługi i dodatki
        const [employeesRes, servicesRes, addonsRes] = await Promise.all([
            pool.query(
                `SELECT id, name 
         FROM employees 
         WHERE salon_id = $1 AND is_active = true 
         ORDER BY name`,
                [salonId]
            ),
            pool.query(
                `SELECT id, name, price, duration_minutes 
         FROM services 
         WHERE salon_id = $1 AND is_active = true 
         ORDER BY name`,
                [salonId]
            ),
            pool.query(
                `
        SELECT DISTINCT sa.id,
                        sa.name,
                        sa.price,
                        sa.duration_minutes,
                        sal.service_id
        FROM service_addons sa
        LEFT JOIN service_addon_links sal ON sal.addon_id = sa.id
        WHERE sa.salon_id = $1
          AND sa.is_active = true
        ORDER BY sa.name;
        `,
                [salonId]
            ),
        ]);

        console.log("🔹 Ilość dodatków:", addonsRes.rows.length);

        res.json({
            appointment,
            available_employees: employeesRes.rows,
            available_services: servicesRes.rows,
            available_addons: addonsRes.rows,
        });
    })
);
// ✅ Aktualizacja szczegółów wizyty (z modala w panelu)
app.put(
    "/api/appointments/:id/details",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { service_id, employee_id, addons = [], start_time, end_time, date } = req.body;

        // 🔹 Walidacja
        if (!service_id || !employee_id || !start_time || !date) {
            return res.status(400).json({ error: "Brak wymaganych danych" });
        }

        // 🔹 Pobierz dane wizyty
        const apptRes = await pool.query("SELECT * FROM appointments WHERE id = $1", [id]);
        if (apptRes.rows.length === 0) {
            return res.status(404).json({ error: "Nie znaleziono wizyty" });
        }

        const appt = apptRes.rows[0];

        // 🔹 Walidacja salonu (czy należy do pracownika)
        const empRes = await pool.query("SELECT salon_id FROM employees WHERE id = $1", [employee_id]);
        if (empRes.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono pracownika" });
        const salon_id = empRes.rows[0].salon_id;

        // 🔹 Aktualizacja w transakcji
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 🔸 Aktualizacja głównej wizyty
            const updated = await client.query(
                `
        UPDATE appointments
        SET service_id = $1,
            employee_id = $2,
            date = $3,
            start_time = $4,
            end_time = $5,
            changed_at = NOW()
        WHERE id = $6
        RETURNING *;
        `,
                [service_id, employee_id, date, start_time, end_time, id]
            );

            // 🔸 Aktualizacja dodatków
            await client.query("DELETE FROM appointment_addons WHERE appointment_id = $1", [id]);
            if (Array.isArray(addons) && addons.length > 0) {
                const values = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
                const params = [id, ...addons.map(Number)];
                await client.query(`INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`, params);
            }

            await client.query("COMMIT");

            // 📡 Powiadom front o aktualizacji
            io.emit("calendar_updated", {
                type: "update",
                salon_id,
                appointment: updated.rows[0],
            });

            res.json({
                message: "✅ Wizyta zaktualizowana pomyślnie",
                appointment: updated.rows[0],
            });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("❌ Błąd przy zapisie wizyty:", err);
            res.status(500).json({ error: "Błąd przy aktualizacji wizyty" });
        } finally {
            client.release();
        }
    })
);
///nowy modal////
// =========================
//  EMPLOYEE VACATIONS API
// =========================


app.get(
    "/api/vacations/init",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        console.log("🔹 Init vacations start / UID:", uid);

        const salonId = Number(req.query.salon_id || null);
        console.log("➡ salon_id z frontu:", salonId);

        //
        // 1️⃣ Pobierz is_provider z USERS
        //
        const u = await pool.query(
            "SELECT role, is_provider FROM users WHERE uid = $1 LIMIT 1",
            [uid]
        );

        if (u.rows.length === 0) {
            return res.status(403).json({ error: "Użytkownik nie istnieje" });
        }

        const { is_provider } = u.rows[0];

        //
        // 2️⃣ PROVIDER
        //
        if (is_provider === true) {
            console.log("🔸 PROVIDER DETECTED");

            // Jeśli front wyśle salon_id → zwracamy tylko ten salon
            if (salonId) {
                console.log("🔸 Pobieram tylko salon:", salonId);

                const salonRes = await pool.query(
                    `SELECT id AS salon_id, name AS salon_name
                     FROM salons
                     WHERE id = $1 AND owner_uid = $2`,
                    [salonId, uid]
                );

                if (salonRes.rows.length === 0) {
                    return res.status(403).json({ error: "Salon nie należy do providera" });
                }

                const empRes = await pool.query(
                    `SELECT id AS employee_id, name AS employee_name
                     FROM employees
                     WHERE salon_id = $1 AND is_active = true
                     ORDER BY name ASC`,
                    [salonId]
                );

                return res.json({
                    is_provider: true,
                    salons: [
                        {
                            salon_id: salonId,
                            salon_name: salonRes.rows[0].salon_name,
                            employees: empRes.rows.map(e => ({
                                id: e.employee_id,
                                name: e.employee_name
                            }))
                        }
                    ]
                });
            }

            // ⏬ Stare zachowanie – jeśli NIE podano salon_id
            console.log("🔸 Provider → pobieram WSZYSTKIE salony");

            const salonsRes = await pool.query(
                `SELECT id AS salon_id, name AS salon_name
                 FROM salons
                 WHERE owner_uid = $1`,
                [uid]
            );

            const salons = salonsRes.rows;
            const salonIds = salons.map(s => s.salon_id);

            const empRes = await pool.query(
                `SELECT id AS employee_id, name AS employee_name, salon_id
                 FROM employees
                 WHERE salon_id = ANY($1) AND is_active = true
                 ORDER BY salon_id, name ASC`,
                [salonIds]
            );

            const employees = empRes.rows;

            const result = salons.map(salon => ({
                salon_id: salon.salon_id,
                salon_name: salon.salon_name,
                employees: employees
                    .filter(e => e.salon_id === salon.salon_id)
                    .map(e => ({
                        id: e.employee_id,
                        name: e.employee_name
                    }))
            }));

            return res.json({
                is_provider: true,
                salons: result
            });
        }

        //
        // 3️⃣ EMPLOYEE
        //
        console.log("🔸 Nie provider → sprawdzam employees…");

        const emp = await pool.query(
            `SELECT id AS employee_id, name, salon_id
             FROM employees
             WHERE uid = $1 
             LIMIT 1`,
            [uid]
        );

        if (emp.rows.length > 0) {
            const row = emp.rows[0];

            return res.json({
                is_provider: false,
                salon_id: row.salon_id,
                employees: [
                    {
                        id: row.employee_id,
                        name: row.name
                    }
                ]
            });
        }

        //
        // 4️⃣ client
        //
        return res.status(403).json({ error: "Brak uprawnień" });
    })
);


app.post(
    "/api/vacations",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { employee_id: bodyEmployeeId, start_date, end_date, reason } = req.body;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });
        if (!start_date || !end_date) {
            return res.status(400).json({ error: "Brak daty urlopu" });
        }

        console.log("➡ /api/vacations → START", { uid, bodyEmployeeId });

        // 1️⃣ Pobierz dane użytkownika
        const uRes = await pool.query(
            "SELECT role, is_provider FROM users WHERE uid = $1 LIMIT 1",
            [uid]
        );

        if (uRes.rowCount === 0) {
            return res.status(403).json({ error: "Brak użytkownika" });
        }

        const isProvider = uRes.rows[0].is_provider === true;

        let targetEmployeeId = null;
        let salonId = null;

        // ======================================================
        // 2️⃣ PROVIDER — może wybrać tylko pracownika z WYBRANEGO salonu
        // ======================================================
        if (isProvider) {
            console.log("🔸 PROVIDER detected");

            if (!bodyEmployeeId) {
                return res.status(400).json({ error: "Musisz wybrać pracownika" });
            }

            targetEmployeeId = Number(bodyEmployeeId);

            // Pobierz salon pracownika
            const empRow = await pool.query(
                `SELECT salon_id FROM employees WHERE id = $1`,
                [targetEmployeeId]
            );

            if (empRow.rowCount === 0) {
                return res.status(400).json({ error: "Pracownik nie istnieje" });
            }

            salonId = empRow.rows[0].salon_id;

            // Sprawdź, czy salon należy do providera
            const checkOwner = await pool.query(
                `SELECT 1 FROM salons WHERE id = $1 AND owner_uid = $2`,
                [salonId, uid]
            );

            if (checkOwner.rowCount === 0) {
                return res.status(403).json({
                    error: "Nie możesz dodawać urlopów pracownikom spoza Twoich salonów"
                });
            }
        }

        // ======================================================
        // 3️⃣ EMPLOYEE — może dodać urlop tylko SOBIE
        // ======================================================
        else {
            console.log("🔸 EMPLOYEE detected");

            const empRes = await pool.query(
                `SELECT id, salon_id FROM employees WHERE uid = $1 LIMIT 1`,
                [uid]
            );

            if (empRes.rowCount === 0) {
                return res.status(403).json({
                    error: "Nie znaleziono przypisanego pracownika"
                });
            }

            targetEmployeeId = empRes.rows[0].id;
            salonId = empRes.rows[0].salon_id;

            // Pracownik NIE może wybrać innego pracownika
            if (
                bodyEmployeeId &&
                Number(bodyEmployeeId) !== Number(targetEmployeeId)
            ) {
                return res.status(403).json({
                    error: "Nie możesz dodać urlopu innemu pracownikowi"
                });
            }
        }

        console.log("✔ Final employee ID:", targetEmployeeId);
        console.log("✔ Salon ID:", salonId);

        // ======================================================
        // 4️⃣ Zapis urlopu
        // ======================================================
        const result = await pool.query(
            `
            INSERT INTO employee_vacations (employee_id, start_date, end_date, reason)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `,
            [targetEmployeeId, start_date, end_date, reason || null]
        );

        // 5️⃣ Wyczyść cache + powiadom socket.io
        salonCache.delete(`salon_${salonId}`);

        io.emit("calendar_updated", {
            type: "vacation_added",
            salon_id: salonId,
            employee_id: targetEmployeeId,
            vacation: result.rows[0],
        });

        console.log("✔ Vacation saved:", result.rows[0]);

        res.json({
            success: true,
            vacation: result.rows[0],
        });
    })
);











app.get(
    "/api/appointments/details/new",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;

        if (!uid) {
            return res.status(401).json({ error: "Brak użytkownika" });
        }

        // 1️⃣ Sprawdź rolę użytkownika
        const userRes = await pool.query(
            `SELECT is_provider FROM users WHERE uid = $1 LIMIT 1`,
            [uid]
        );

        const isProvider = userRes.rows[0]?.is_provider === true;

        let salon_id;

        // 2️⃣ Provider → musi podać salon_id
        if (isProvider) {
            salon_id = req.query.salon_id;

            if (!salon_id) {
                return res.status(400).json({
                    error: "Brak salon_id — provider musi wskazać salon"
                });
            }

            // sprawdzamy czy salon należy do providera
            const check = await pool.query(
                `SELECT id FROM salons WHERE id = $1 AND owner_uid = $2`,
                [salon_id, uid]
            );

            if (check.rowCount === 0) {
                return res.status(403).json({
                    error: "Ten salon nie należy do Twojego konta"
                });
            }
        }

        // 3️⃣ Pracownik → pobieramy salon z employees
        else {
            const salonRes = await pool.query(
                `
                SELECT salon_id
                FROM employees
                WHERE uid = $1
                LIMIT 1
            `,
                [uid]
            );

            if (salonRes.rows.length === 0) {
                return res.status(403).json({
                    error: "Nie znaleziono salonu dla pracownika"
                });
            }

            salon_id = salonRes.rows[0].salon_id;
        }

        // 4️⃣ Pobieramy klientów
        const clientsRes = await pool.query(
            `
            SELECT DISTINCT ON (phone)
                id,
                first_name,
                last_name,
                phone,
                client_uid,
                created_at
            FROM salon_clients
            WHERE salon_id = $1
            ORDER BY phone, created_at DESC
        `,
            [salon_id]
        );

        // 5️⃣ Pobieramy pracowników
        const employeesRes = await pool.query(
            `
            SELECT id, name
            FROM employees
            WHERE salon_id = $1
            AND is_active = TRUE
            ORDER BY name
        `,
            [salon_id]
        );

        // 6️⃣ Pobieramy usługi
        const servicesRes = await pool.query(
            `
            SELECT id, name, price, duration_minutes
            FROM services
            WHERE salon_id = $1
            AND is_active = TRUE
            ORDER BY name
        `,
            [salon_id]
        );

        // 7️⃣ Pobieramy dodatki
        const addonsRes = await pool.query(
            `
            SELECT DISTINCT
                sa.id,
                sa.name,
                sa.price,
                sa.duration_minutes,
                sal.service_id
            FROM service_addons sa
            LEFT JOIN service_addon_links sal ON sal.addon_id = sa.id
            WHERE sa.salon_id = $1
            AND sa.is_active = TRUE
            ORDER BY sa.name
        `,
            [salon_id]
        );

        // 8️⃣ Odpowiedź
        res.json({
            clients: clientsRes.rows,
            employees: employeesRes.rows,
            services: servicesRes.rows,
            addons: addonsRes.rows
        });
    })
);


app.post(
    "/api/appointments/new",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;

        if (!uid) {
            return res.status(401).json({ error: "Brak użytkownika" });
        }

        console.log("📩 NEW APPT BODY:", req.body);

        const salonRes = await pool.query(
            `
      SELECT salon_id
      FROM employees
      WHERE uid = $1
      LIMIT 1
      `,
            [uid]
        );

        if (salonRes.rows.length === 0) {
            return res.status(403).json({ error: "Brak salonu przypisanego do pracownika" });
        }

        const { salon_id } = salonRes.rows[0];

        const {
            client_id,
            employee_id,
            service_id,
            addons = [],
            date,
            start_time,
            end_time
        } = req.body;

        if (!client_id || !employee_id || !service_id || !date || !start_time) {
            return res.status(400).json({ error: "Brak wymaganych danych" });
        }

        // Pobieramy dane klienta
        const clientInfoRes = await pool.query(
            `SELECT uid, name, phone FROM users WHERE id = $1`,
            [client_id]
        );

        if (clientInfoRes.rows.length === 0) {
            return res.status(404).json({ error: "Nie znaleziono klienta" });
        }

        const row = clientInfoRes.rows[0];
        const client_uid = row.uid;

        const fullName = row.name || "";
        const [first_name, ...restName] = fullName.trim().split(" ");
        const last_name = restName.join(" ") || null;
        const phone = row.phone || null;

        const emp = await pool.query(
            `SELECT salon_id FROM employees WHERE id = $1`,
            [employee_id]
        );

        if (emp.rows.length === 0) {
            return res.status(404).json({ error: "Nie znaleziono pracownika" });
        }

        if (emp.rows[0].salon_id !== salon_id) {
            return res.status(403).json({ error: "Pracownik nie należy do salonu" });
        }

        const srv = await pool.query(
            `SELECT id FROM services WHERE id = $1 AND salon_id = $2`,
            [service_id, salon_id]
        );

        if (srv.rows.length === 0) {
            return res.status(404).json({ error: "Usługa niedostępna" });
        }

        const conflict = await pool.query(
            `
      SELECT 1 FROM appointments
      WHERE employee_id = $1
      AND date = $2
      AND status != 'cancelled'
      AND (start_time, end_time) OVERLAPS ($3::time, $4::time)
      `,
            [employee_id, date, start_time, end_time]
        );

        if (conflict.rows.length > 0) {
            return res.status(409).json({ error: "Termin jest zajęty" });
        }

        const db = await pool.connect();

        try {
            await db.query("BEGIN");

            const apptRes = await db.query(
                `
        INSERT INTO appointments (
          salon_id,
          client_uid,
          employee_id,
          service_id,
          date,
          start_time,
          end_time,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING *
        `,
                [salon_id, client_uid, employee_id, service_id, date, start_time, end_time]
            );

            const newAppt = apptRes.rows[0];

            // 🔥 Dopisz klienta — ZAWSZE nowy rekord
            await db.query(
                `INSERT INTO salon_clients (
           salon_id,
           employee_id,
           client_uid,
           first_appointment_id,
           first_name,
           last_name,
           phone
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
                [
                    salon_id,
                    employee_id,
                    client_uid,
                    newAppt.id,
                    first_name,
                    last_name,
                    phone
                ]
            );

            if (Array.isArray(addons) && addons.length > 0) {
                const values = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
                const params = [newAppt.id, ...addons.map(Number)];

                await db.query(
                    `
          INSERT INTO appointment_addons (appointment_id, addon_id)
          VALUES ${values}
          `,
                    params
                );
            }

            await db.query("COMMIT");

            io.emit("calendar_updated", {
                type: "new",
                salon_id,
                appointment: newAppt,
            });

            




            res.json({
                message: "Wizyta utworzona",
                appointment: newAppt,
            });

        } catch (err) {
            await db.query("ROLLBACK");
            console.error("❌ Błąd przy tworzeniu wizyty:", err);
            res.status(500).json({ error: "Błąd podczas tworzenia wizyty" });
        } finally {
            db.release();
        }
    })
);

app.post(
    "/api/appointments/create-from-panel",
    verifyToken,
    asyncHandler(async (req, res) => {
        const {
            client_id,
            employee_id,
            service_id,
            addons = [],
            date,
            start_time,
            end_time,
        } = req.body;

        if (!client_id || !employee_id || !service_id || !date || !start_time || !end_time) {
            return res.status(400).json({ error: "Brak wymaganych danych" });
        }

        const uid = req.user?.uid;

        // 1️⃣ salon wybrany przez PROVIDERA, jeśli istnieje
        let selectedSalonId = req.query.salon_id ? Number(req.query.salon_id) : null;

        console.log("➡ create-from-panel → UID:", uid, "selectedSalon:", selectedSalonId);

        // 2️⃣ Pobieramy salon pracownika z employee_id
        const empRes = await pool.query(
            `SELECT salon_id FROM employees WHERE id = $1`,
            [employee_id]
        );

        if (!empRes.rows.length) {
            return res.status(404).json({ error: "Pracownik nie istnieje" });
        }

        const employeeSalonId = empRes.rows[0].salon_id;

        // 3️⃣ Jeśli provider → musi zgadzać się salon
        const userRes = await pool.query(
            `SELECT is_provider FROM users WHERE uid = $1`,
            [uid]
        );

        const isProvider = userRes.rows[0]?.is_provider === true;

        if (isProvider) {
            if (!selectedSalonId) {
                return res.status(400).json({ error: "Provider musi podać salon_id" });
            }

            if (selectedSalonId !== employeeSalonId) {
                return res.status(403).json({
                    error: "Pracownik nie należy do wybranego salonu providera"
                });
            }
        }

        // 4️⃣ Używamy salonu pracownika (jest pewny)
        const salon_id = employeeSalonId;

        // 5️⃣ Szukamy klienta — czy to użytkownik, czy lokalny
        const userClient = await pool.query(
            `SELECT uid, name, phone FROM users WHERE id=$1`,
            [client_id]
        );

        let client_uid = null;
        let client_local_id = null;
        let first_name, last_name, phone;

        if (userClient.rows.length > 0) {
            const row = userClient.rows[0];
            client_uid = row.uid;
            phone = row.phone;

            const parts = (row.name || "").trim().split(" ");
            first_name = parts.shift() || "";
            last_name = parts.join(" ") || "";
        } else {
            // klient lokalny
            const localRes = await pool.query(
                `SELECT first_name, last_name, phone 
                 FROM salon_clients 
                 WHERE id=$1 AND salon_id=$2`,
                [client_id, salon_id]
            );

            if (!localRes.rows.length) {
                return res.status(404).json({ error: "Klient lokalny nie istnieje w tym salonie" });
            }

            const row = localRes.rows[0];
            client_local_id = client_id;
            first_name = row.first_name;
            last_name = row.last_name;
            phone = row.phone;
        }

        const db = await pool.connect();

        try {
            await db.query("BEGIN");

            const apptRes = await db.query(
                `
                INSERT INTO appointments (
                    salon_id, client_uid, client_local_id, employee_id,
                    service_id, date, start_time, end_time, status, created_at
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,'booked',NOW()
                )
                RETURNING *
                `,
                [
                    salon_id,
                    client_uid,
                    client_local_id,
                    employee_id,
                    service_id,
                    date,
                    start_time,
                    end_time,
                ]
            );

            const newAppt = apptRes.rows[0];

            // -- ZAPIS KLIENTA Z BLOKADĄ DUPLIKATÓW --

            if (!client_uid && !phone) {
                console.warn("❗ Pomijam dodanie klienta – brak uid i telefonu");
            } else {
                await db.query(
                    `
        INSERT INTO salon_clients (
            salon_id,
            employee_id,
            client_uid,
            first_appointment_id,
            first_name,
            last_name,
            phone
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
        `,
                    [
                        salon_id,
                        employee_id,
                        client_uid,
                        newAppt.id,
                        first_name,
                        last_name,
                        phone
                    ]
                );
            }


            // dodatki
            if (addons.length > 0) {
                await db.query(
                    `
                    INSERT INTO appointment_addons (appointment_id, addon_id)
                    VALUES ${addons.map((_, i) => `($1, $${i + 2})`).join(",")}
                    `,
                    [newAppt.id, ...addons]
                );
            }

            await db.query("COMMIT");

            io.emit("calendar_updated", {
                type: "new",
                salon_id,
                appointment: newAppt
            });

            res.json({
                message: "Wizyta została utworzona",
                appointment: newAppt,
            });

        } catch (err) {
            await db.query("ROLLBACK");
            console.error("❌ create-from-panel błąd:", err);
            res.status(500).json({ error: "Błąd podczas tworzenia wizyty" });
        } finally {
            db.release();
        }
    })
);






// =======================
// 🔥 Sloty dla PRACOWNIKA
// =======================
app.get(
    "/api/appointments/employee/available",
    verifyToken,
    requireEmployeeOrProviderRole, // tylko employee / provider
    asyncHandler(async (req, res) => {
        const { employee_id: empRaw, service_id, date } = req.query;
        let { addons, total_duration } = req.query;

        if (!service_id || !date) {
            return res.status(400).json({ error: "Brak service_id lub date" });
        }

        const employee_id = empRaw && !isNaN(Number(empRaw)) ? Number(empRaw) : null;
        if (!employee_id) {
            return res.status(400).json({ error: "Brak employee_id" });
        }

        // ---------- ADDONS ----------
        let addonIds = [];
        if (addons) {
            if (typeof addons === "object" && !Array.isArray(addons)) {
                addonIds = Object.values(addons).map(Number);
            } else if (Array.isArray(addons)) {
                addonIds = addons.map(Number);
            } else {
                addonIds = String(addons)
                    .split(",")
                    .map((x) => Number(x.trim()));
            }
            addonIds = addonIds.filter((n) => Number.isFinite(n) && n > 0);
        }

        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getUTCDay(); // tak jak w starym endpointzie

        // ---------- DŁUGOŚĆ USŁUGI ----------
        const serviceRes = await pool.query(
            `SELECT duration_minutes, salon_id FROM services WHERE id=$1`,
            [service_id]
        );
        if (!serviceRes.rows.length) {
            return res.status(404).json({ error: "Nie znaleziono usługi" });
        }

        let duration = Number(serviceRes.rows[0].duration_minutes || 0);
        const salon_id = serviceRes.rows[0].salon_id;

        if (addonIds.length > 0) {
            const addonQuery = await pool.query(
                `SELECT COALESCE(SUM(duration_minutes),0) AS total 
         FROM service_addons WHERE id = ANY($1::int[])`,
                [addonIds]
            );
            duration += Number(addonQuery.rows[0].total || 0);
        }

        if (total_duration) {
            const override = Number(total_duration);
            if (!isNaN(override) && override > 0) duration = override;
        }

        if (duration <= 0) {
            return res.json({ slots: [], is_day_off: false });
        }

        // ---------- GODZINY PRACY / GRAFIK ----------
        const scheduleRes = await pool.query(
            `
      SELECT open_time, close_time, is_day_off
      FROM employee_schedule
      WHERE employee_id = $1 AND day_of_week = $2
      `,
            [employee_id, dayOfWeek]
        );

        const schedule = scheduleRes.rows[0] || null;

        let workStart = null;
        let workEnd = null;
        if (schedule) {
            workStart = schedule.open_time; // 'HH:MM:SS'
            workEnd = schedule.close_time;
        }

        // ---------- URLOP / DZIEŃ WOLNY / ŚWIĘTO ----------
        const vacRes = await pool.query(
            `
      SELECT 1
      FROM employee_vacations
      WHERE employee_id = $1
        AND $2::date BETWEEN start_date AND end_date
      `,
            [employee_id, date]
        );
        const hasVacation = vacRes.rows.length > 0;

        let isHoliday = false;
        if (salon_id) {
            const holRes = await pool.query(
                `SELECT 1 FROM salon_holidays WHERE salon_id=$1 AND date=$2`,
                [salon_id, date]
            );
            isHoliday = holRes.rows.length > 0;
        }

        const isDayOffFlag =
            isHoliday ||
            hasVacation ||
            !schedule ||
            Boolean(schedule?.is_day_off);

        // ---------- BLOKADY CZASU ----------
        const timeOffRes = await pool.query(
            `
      SELECT start_time, end_time
      FROM employee_time_off
      WHERE employee_id = $1 AND date = $2
      `,
            [employee_id, date]
        );

        const timeOff = timeOffRes.rows.map((b) => ({
            start: toDate(date, b.start_time),
            end: toDate(date, b.end_time),
        }));

        // ---------- ISTNIEJĄCE WIZYTY ----------
        const appRes = await pool.query(
            `
      SELECT start_time, end_time
      FROM appointments
      WHERE employee_id = $1
        AND date = $2
        AND status != 'cancelled'
      `,
            [employee_id, date]
        );

        const appointments = appRes.rows.map((a) => ({
            start: toDate(date, a.start_time),
            end: toDate(date, a.end_time),
        }));

        // ---------- GENEROWANIE SLOTÓW NA CAŁY DZIEŃ ----------
        const DAY_START = "06:00";
        const DAY_END = "23:00";

        let cursor = toDate(date, DAY_START);
        const hardEnd = toDate(date, DAY_END);

        const slots = [];

        while (cursor < hardEnd) {
            const slotStart = new Date(cursor.getTime());
            const slotEnd = new Date(cursor.getTime() + duration * 60_000);

            if (slotEnd > hardEnd) break;

            // kolizja z inną wizytą → nie proponujemy
            const taken = appointments.some((a) => overlaps(slotStart, slotEnd, a.start, a.end));
            if (taken) {
                cursor = new Date(cursor.getTime() + 5 * 60_000);
                continue;
            }

            const blockedByOff = timeOff.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));

            let outsideHours = false;
            if (!schedule || !workStart || !workEnd) {
                outsideHours = true;
            } else {
                const ws = toDate(date, workStart);
                const we = toDate(date, workEnd);
                if (slotStart < ws || slotEnd > we) {
                    outsideHours = true;
                }
            }

            let type = "normal";

            if (blockedByOff || isHoliday || hasVacation) {
                type = "blocked";
            } else if (isDayOffFlag) {
                type = "day_off";
            } else if (outsideHours) {
                type = "outside_hours";
            }

            slots.push({
                start_time: formatTime(slotStart),
                end_time: formatTime(slotEnd),
                type,
            });

            // przesuwamy co 5 minut (gęstsza siatka, ale możesz zrobić co 15 min)
            cursor = new Date(cursor.getTime() + 5 * 60_000);
        }

        res.json({
            slots,
            is_day_off: isDayOffFlag,
            is_holiday: isHoliday,
            has_vacation: hasVacation,
        });
    })
);

// ------- helpers -------
function toDate(dateStr, time) {
    const [h, m] = String(time).split(":").map(Number);
    return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
}

function overlaps(s1, e1, s2, e2) {
    return s1 < e2 && e1 > s2;
}

function formatTime(d) {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}


///nowy modal///
app.get(
    "/api/calendar/shared/month",
    verifyToken,
    asyncHandler(async (req, res) => {
        try {
            const uid = req.user?.uid;
            if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

            const year = Number(req.query.year);
            const month = Number(req.query.month); // 1–12

            if (!year || !month) return res.status(400).json({ error: "Missing year or month" });

            // helper: unify date -> "YYYY-MM-DD"
            const toYMD = (val) => {
                if (val === null || val === undefined || val === "") return "";
                // Date object
                if (val instanceof Date && !isNaN(val.getTime())) {
                    const y = val.getFullYear();
                    const m = String(val.getMonth() + 1).padStart(2, "0");
                    const d = String(val.getDate()).padStart(2, "0");
                    return `${y}-${m}-${d}`;
                }
                // string (could be "YYYY-MM-DD" or ISO)
                const s = String(val);
                const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
                if (match) return match[1];
                // fallback try Date parsing (last resort) — use local parts to avoid timezone shifts
                const dt = new Date(s);
                if (!isNaN(dt.getTime())) {
                    const y = dt.getFullYear();
                    const m = String(dt.getMonth() + 1).padStart(2, "0");
                    const d = String(dt.getDate()).padStart(2, "0");
                    return `${y}-${m}-${d}`;
                }
                return s;
            };

            // small util: parse Y-M-D into local Date object (avoid "new Date('YYYY-MM-DD')" pitfalls)
            const parseYMD = (ymd) => {
                if (!ymd) return null;
                const parts = String(ymd).split("-");
                if (parts.length >= 3) {
                    const y = Number(parts[0]);
                    const m = Number(parts[1]) - 1;
                    const d = Number(parts[2]);
                    return new Date(y, m, d);
                }
                const dt = new Date(ymd);
                return isNaN(dt.getTime()) ? null : dt;
            };

            // map JS getDay() -> schedule day_of_week (handle case where DB uses 1..7 with Sunday=7)
            const mapJsDayToSchedule = (jsDay) => {
                // JS: 0=Sun,1=Mon,...6=Sat
                // many DBs use 1=Mon..7=Sun — map Sunday(0) -> 7
                return jsDay === 0 ? 7 : jsDay;
            };

            // safe boolean parser (handles '0','1','true','false', 0/1, boolean)
            const parseBool = (v) => {
                if (v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true") return true;
                return false;
            };

            // 🔹 Znajdź salon
            const empRes = await pool.query("SELECT salon_id FROM employees WHERE uid = $1 LIMIT 1", [uid]);
            if (empRes.rows.length === 0) return res.status(403).json({ error: "Nie znaleziono przypisanego salonu" });

            const salonId = empRes.rows[0].salon_id;

            // 🔹 Cache salonu — stałe dane
            const cacheKey = `salon_${salonId}`;
            const cacheTTL = 10 * 60 * 1000;
            let baseData = salonCache.get(cacheKey);
            const isExpired = !baseData || Date.now() - baseData.ts > cacheTTL;

            if (isExpired) {
                console.log("♻️ Odświeżanie CACHE – dane stałe");

                const [
                    holidaysRes,
                    vacationsRes,
                    // do NOT use a global time_off cache here for month view; we'll fetch month-specific time_off below
                    _timeOffAllRes,
                    scheduleRes,
                    employeesRes,
                ] = await Promise.all([
                    pool.query("SELECT date FROM salon_holidays WHERE salon_id=$1", [salonId]),

                    pool.query(
                        `SELECT employee_id, start_date, end_date
             FROM employee_vacations
             WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                        [salonId]
                    ),

                    // kept for compatibility but not used directly in month building
                    pool.query(
                        `SELECT id, employee_id, date, start_time, end_time, reason
             FROM employee_time_off
             WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                        [salonId]
                    ),

                    pool.query(
                        `SELECT employee_id, open_time, close_time, is_day_off, day_of_week
             FROM employee_schedule
             WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
                        [salonId]
                    ),

                    pool.query(
                        `SELECT
               id AS employee_id,
               name AS employee_name,
               image_url AS employee_image_url,
               is_active
             FROM employees
             WHERE salon_id=$1 AND is_active=true
             ORDER BY name ASC`,
                        [salonId]
                    ),
                ]);

                // normalize holidays and vacations right away
                const normalizedHolidays = (holidaysRes.rows || []).map((h) => ({ ...h, date: toYMD(h.date) }));
                const normalizedVacations = (vacationsRes.rows || []).map((v) => ({
                    ...v,
                    start_date: toYMD(v.start_date),
                    end_date: toYMD(v.end_date),
                }));

                // normalize schedule rows: ensure numeric day_of_week and parse is_day_off
                const normalizedSchedule = (scheduleRes.rows || []).map((s) => ({
                    ...s,
                    day_of_week: s.day_of_week !== null && s.day_of_week !== undefined ? Number(s.day_of_week) : null,
                    is_day_off: parseBool(s.is_day_off),
                }));

                baseData = {
                    holidays: normalizedHolidays,
                    vacations: normalizedVacations,
                    schedule: normalizedSchedule,
                    employees: employeesRes.rows || [],
                    ts: Date.now(),
                };

                salonCache.set(cacheKey, baseData);
            }

            // --------------------------
            // POBRANIE WIZYT DLA CAŁEGO MIESIĄCA
            // --------------------------
            const from = `${year}-${String(month).padStart(2, "0")}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

            const appointmentsRes = await pool.query(
                `SELECT 
    a.id, a.employee_id, a.date::date AS date,
    a.start_time, a.end_time,
    COALESCE(
  u.name,
  CONCAT(sc.first_name, ' ', sc.last_name),
  'Klient'
) AS client_name,
sc.first_name AS client_first_name,
sc.last_name AS client_last_name,
a.client_uid,

    COALESCE(s.name, 'Usługa') AS service_name,
    COALESCE(STRING_AGG(sa.name, ', ' ORDER BY sa.name), '') AS addons
   FROM appointments a
   LEFT JOIN users u ON a.client_uid = u.uid
   LEFT JOIN salon_clients sc
  ON sc.first_appointment_id = a.id
  AND sc.salon_id = a.salon_id

   LEFT JOIN services s ON a.service_id = s.id
   LEFT JOIN appointment_addons aa ON a.id = aa.appointment_id
   LEFT JOIN service_addons sa ON aa.addon_id = sa.id
   WHERE a.salon_id=$1
     AND a.date BETWEEN $2 AND $3
     AND a.status!='cancelled'
   GROUP BY
     a.id, a.employee_id, a.date, a.start_time, a.end_time,
     u.name, sc.first_name, sc.last_name, s.name
   ORDER BY a.date ASC, a.start_time ASC`,
                [salonId, from, to]
            );


            const allAppointments = appointmentsRes.rows || [];

            // --------------------------
            // POBRANIE BLOKAD CZASU (cały miesiąc) — i normalizacja daty
            // --------------------------
            const timeOffFresh = await pool.query(
                `SELECT id, employee_id, date, start_time, end_time, reason
         FROM employee_time_off
         WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)
           AND date BETWEEN $2 AND $3`,
                [salonId, from, to]
            );

            const monthTimeOff = (timeOffFresh.rows || []).map((t) => ({
                ...t,
                date: toYMD(t.date),
            }));

            // --------------------------
            // BUDOWANIE STRUKTURY DNIOWEJ
            // --------------------------
            const days = {};

            for (let day = 1; day <= lastDay; day++) {
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dateObj = parseYMD(dateStr);
                const jsDow = dateObj ? dateObj.getDay() : null; // 0-6
                const dow = mapJsDayToSchedule(jsDow); // 1..7 where 7 == Sunday possibly

                const isHoliday = (baseData.holidays || []).some((h) => {
                    return toYMD(h.date) === dateStr;
                });

                const employeesOnDay = (baseData.employees || []).map((emp) => {
                    const schedule = (baseData.schedule || []).find(
                        (s) =>
                            Number(s.employee_id) === Number(emp.employee_id) &&
                            s.day_of_week !== null &&
                            s.day_of_week !== undefined &&
                            Number(s.day_of_week) === Number(dow)
                    );

                    const isVacation = (baseData.vacations || []).some((v) => {
                        if (!v.start_date || !v.end_date) return false;
                        return dateStr >= toYMD(v.start_date) && dateStr <= toYMD(v.end_date);
                    });

                    const isDayOff = isHoliday || isVacation || Boolean(schedule && parseBool(schedule.is_day_off));

                    // appointments: normalize row.date -> YMD and compare
                    const appointments = (allAppointments || []).filter((a) => {
                        const ad = toYMD(a.date);
                        return Number(a.employee_id) === Number(emp.employee_id) && ad === dateStr;
                    });

                    // time_off: filter by employee and date (use normalized monthTimeOff)
                    const time_off = (monthTimeOff || []).filter((t) => {
                        return Number(t.employee_id) === Number(emp.employee_id) && t.date === dateStr;
                    }).map((t) => ({ ...t, time_off_id: t.id }));

                    return {
                        employee_id: emp.employee_id,
                        employee_name: emp.employee_name,
                        employee_image_url: emp.employee_image_url,
                        day_off: isDayOff,

                        working_hours: {
                            open: schedule?.open_time ? String(schedule.open_time).slice(0, 5) : "09:00",
                            close: schedule?.close_time ? String(schedule.close_time).slice(0, 5) : "17:00",
                        },

                        appointments,
                        time_off,
                    };
                });

                days[dateStr] = { date: dateStr, employees: employeesOnDay };
            }

            res.json({ year, month, days });
        } catch (error) {
            console.error("❌ Błąd /api/calendar/shared/month:", error);
            res.status(500).json({ error: error.message });
        }
    })
);
// ✅ Tworzenie nowej wizyty z panelu
app.post(
    "/api/appointments/create-from-panel",
    verifyToken,
    asyncHandler(async (req, res) => {
        const {
            client_id,
            employee_id,
            service_id,
            addons = [],
            date,
            start_time,
            end_time,
        } = req.body;

        if (!client_id || !employee_id || !service_id || !date || !start_time || !end_time) {
            return res.status(400).json({ error: "Brak wymaganych danych" });
        }

        // 🔍 Pracownik
        const empRes = await pool.query(
            "SELECT salon_id FROM employees WHERE id = $1",
            [employee_id]
        );

        if (empRes.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono pracownika" });

        const salon_id = empRes.rows[0].salon_id;

        // 🔍 Pobierz dane klienta z salon_clients
        const clientRes = await pool.query(
            `
      SELECT client_uid, first_name, last_name, phone
      FROM salon_clients
      WHERE id = $1 AND salon_id = $2
    `,
            [client_id, salon_id]
        );

        if (clientRes.rows.length === 0) {
            return res.status(404).json({ error: "Nie znaleziono klienta w tym salonie" });
        }

        const {
            client_uid,       // może być NULL!
            first_name,
            last_name,
            phone,
        } = clientRes.rows[0];

        const trx = await pool.connect();

        try {
            await trx.query("BEGIN");

            // ➕ dodaj wizytę
            const newApptRes = await trx.query(
                `
        INSERT INTO appointments 
        (salon_id, client_uid, employee_id, service_id, date, start_time, end_time, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked', NOW())
        RETURNING *;
        `,
                [salon_id, client_uid, employee_id, service_id, date, start_time, end_time]
            );

            const newAppointment = newApptRes.rows[0];
            const appointment_id = newAppointment.id;

            // 🔄 Upewniamy się, że klient istnieje w tej relacji
            await trx.query(
                `
        INSERT INTO salon_clients (
          salon_id,
          employee_id,
          client_uid,
          first_appointment_id,
          first_name,
          last_name,
          phone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (salon_id, client_uid) DO UPDATE SET
          first_name = COALESCE(salon_clients.first_name, EXCLUDED.first_name),
          last_name = COALESCE(salon_clients.last_name, EXCLUDED.last_name),
          phone = COALESCE(salon_clients.phone, EXCLUDED.phone)
        `,
                [
                    salon_id,
                    employee_id,
                    client_uid,
                    appointment_id,
                    first_name,
                    last_name,
                    phone
                ]
            );

            // ➕ Addons
            if (addons.length > 0) {
                const values = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
                const params = [appointment_id, ...addons.map(Number)];

                await trx.query(
                    `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`,
                    params
                );
            }

            await trx.query("COMMIT");

            io.emit("calendar_updated", {
                type: "create",
                salon_id,
                appointment: newAppointment,
            });

            res.json({
                message: "✅ Wizyta została utworzona",
                appointment: newAppointment,
            });

        } catch (err) {
            await trx.query("ROLLBACK");
            console.error("❌ Błąd podczas tworzenia wizyty:", err);
            return res.status(500).json({ error: "Błąd podczas tworzenia wizyty" });
        } finally {
            trx.release();
        }
    })
);




app.post("/api/appointments/create-from-panel", async (req, res) => {

    const client = await pool.connect();
    try {
        const {
            client_id,
            employee_id,
            service_id,
            addons = [],
            date,
            start_time,
            end_time,
        } = req.body;

        const salon_id = req.user.salon_id;

        if (!client_id || !employee_id || !service_id || !date || !start_time) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Pobierz dane klienta
        const clientInfoRes = await client.query(
            `SELECT uid, first_name, last_name, phone FROM users WHERE id = $1`,
            [client_id]
        );

        if (clientInfoRes.rowCount === 0) {
            return res.status(404).json({ error: "Klient nie istnieje" });
        }

        const { uid, first_name, last_name, phone } = clientInfoRes.rows[0];

        await client.query("BEGIN");

        // --- 1. Check if slot is free -----------------
        const slotCheck = await client.query(
            `
      SELECT 1 FROM appointments
      WHERE salon_id = $1
        AND employee_id = $2
        AND date = $3
        AND (
            (start_time < $5 AND end_time > $4)
        )
      `,
            [salon_id, employee_id, date, start_time, end_time]
        );

        if (slotCheck.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "Selected time slot is occupied" });
        }

        // --- 2. Load base service price ----------------
        const serviceRes = await client.query(
            `SELECT price FROM services WHERE id = $1 AND salon_id = $2`,
            [service_id, salon_id]
        );

        if (serviceRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Service not found" });
        }

        let total_price = serviceRes.rows[0].price;

        // --- 3. Addons price ---------------------------
        if (addons.length > 0) {
            const addRes = await client.query(
                `
        SELECT price FROM addons 
        WHERE id = ANY($1) 
          AND salon_id = $2
        `,
                [addons, salon_id]
            );
            total_price += addRes.rows.reduce((sum, a) => sum + a.price, 0);
        }

        // --- 4. Insert appointment ---------------------
        const insertRes = await client.query(
            `
      INSERT INTO appointments 
      (salon_id, user_id, employee_id, service_id, date, start_time, end_time, status, price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8)
      RETURNING id
      `,
            [salon_id, client_id, employee_id, service_id, date, start_time, end_time, total_price]
        );

        const appointment_id = insertRes.rows[0].id;

        // ➕ Dopisz klienta do salon_clients jeśli jeszcze go nie ma
        await client.query(
            `INSERT INTO salon_clients (
         salon_id,
         employee_id,
         client_uid,
         first_appointment_id,
         first_name,
         last_name,
         phone
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (salon_id, client_uid) DO UPDATE SET
         first_name = COALESCE(salon_clients.first_name, EXCLUDED.first_name),
         last_name = COALESCE(salon_clients.last_name, EXCLUDED.last_name),
         phone = COALESCE(salon_clients.phone, EXCLUDED.phone)
      `,
            [
                salon_id,
                employee_id,
                uid,
                appointment_id,
                first_name,
                last_name,
                phone
            ]
        );

        // --- 5. Add addons -----------------------------
        if (addons.length > 0) {
            const values = addons.map(a => `(${appointment_id}, ${a})`).join(",");
            await client.query(
                `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`
            );
        }

        await client.query("COMMIT");

        req.app.get("eventBus").emit("calendar_updated", salon_id);

        res.json({
            success: true,
            appointment_id,
            price: total_price
        });

    } catch (e) {
        await client.query("ROLLBACK");
        console.error("❌ create-from-panel ERROR:", e);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});


///api strony chose salon

// GET /api/provider/salons
app.get(
    "/api/provider/salons",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {

        const ownerUid = req.user.uid;

        const result = await pool.query(
            `SELECT 
                id, 
                name, 
                city, 
                street, 
                street_number, 
                postal_code,
                phone,
                image_url
            FROM salons
            WHERE owner_uid = $1 AND is_active = TRUE
            ORDER BY id DESC`,
            [ownerUid]
        );

        res.json(result.rows);
    })
);

/// api listy urlopów
app.get(
    "/api/vacations/list",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        const { year, month, page = 1, limit = 10, employee_id } = req.query;
        const salonId = Number(req.query.salon_id || null);
        const offset = (page - 1) * limit;

        //
        // 1️⃣ Pobierz usera
        //
        const u = await pool.query(
            "SELECT role, is_provider FROM users WHERE uid = $1 LIMIT 1",
            [uid]
        );

        if (u.rows.length === 0) {
            return res.status(403).json({ error: "Użytkownik nie istnieje" });
        }

        const isProvider = u.rows[0].is_provider === true;

        //
        // 2️⃣ PROVIDER
        //
        if (isProvider) {
            if (!salonId) {
                return res.status(400).json({ error: "Brak salon_id dla providera" });
            }

            // Provider może widzieć tylko swoje salony
            const salonCheck = await pool.query(
                "SELECT id FROM salons WHERE id = $1 AND owner_uid = $2 LIMIT 1",
                [salonId, uid]
            );

            if (salonCheck.rows.length === 0) {
                return res.status(403).json({ error: "Salon nie należy do providera" });
            }

            // 🔧 dynamiczne warunki
            const whereParts = ["e.salon_id = $1"];
            const params = [salonId];

            if (year) {
                params.push(Number(year));
                whereParts.push(`EXTRACT(YEAR FROM v.start_date) = $${params.length}`);
            }

            if (month) {
                params.push(Number(month));
                whereParts.push(`EXTRACT(MONTH FROM v.start_date) = $${params.length}`);
            }

            if (employee_id && employee_id !== "all") {
                params.push(Number(employee_id));
                whereParts.push(`v.employee_id = $${params.length}`);
            }

            const whereSQL = whereParts.join(" AND ");

            const listSQL = `
                SELECT
                    v.id,
                    v.employee_id,
                    v.start_date,
                    v.end_date,
                    v.reason,
                    v.created_at,

                    -- 🔥 tu dodajemy zdjęcie i imię pracownika
                    e.name AS employee_name,
                    e.image_url AS employee_image

                FROM employee_vacations v
                JOIN employees e ON e.id = v.employee_id
                WHERE ${whereSQL}
                ORDER BY v.start_date DESC
                LIMIT ${limit} OFFSET ${offset}
            `;

            const countSQL = `
                SELECT COUNT(*) AS total
                FROM employee_vacations v
                JOIN employees e ON e.id = v.employee_id
                WHERE ${whereSQL}
            `;

            const list = await pool.query(listSQL, params);
            const count = await pool.query(countSQL, params);

            return res.json({
                is_provider: true,
                total: Number(count.rows[0].total),
                page: Number(page),
                limit: Number(limit),
                items: list.rows
            });
        }

        //
        // 3️⃣ EMPLOYEE
        //
        const emp = await pool.query(
            `SELECT id AS employee_id
             FROM employees
             WHERE uid = $1
             LIMIT 1`,
            [uid]
        );

        if (emp.rows.length === 0) {
            return res.status(403).json({ error: "Brak uprawnień" });
        }

        const employeeId = emp.rows[0].employee_id;

        const whereParts = ["v.employee_id = $1"];
        const params = [employeeId];

        if (year) {
            params.push(Number(year));
            whereParts.push(`EXTRACT(YEAR FROM v.start_date) = $${params.length}`);
        }

        if (month) {
            params.push(Number(month));
            whereParts.push(`EXTRACT(MONTH FROM v.start_date) = $${params.length}`);
        }

        const whereSQL = whereParts.join(" AND ");

        const listSQL = `
            SELECT
                v.id,
                v.employee_id,
                v.start_date,
                v.end_date,
                v.reason,
                v.created_at,

                -- 🔥 tu również dodajemy zdjęcie i imię
                e.name AS employee_name,
                e.image_url AS employee_image

            FROM employee_vacations v
            JOIN employees e ON e.id = v.employee_id
            WHERE ${whereSQL}
            ORDER BY v.start_date DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const countSQL = `
            SELECT COUNT(*) AS total
            FROM employee_vacations v
            WHERE ${whereSQL}
        `;

        const list = await pool.query(listSQL, params);
        const count = await pool.query(countSQL, params);

        return res.json({
            is_provider: false,
            total: Number(count.rows[0].total),
            page: Number(page),
            limit: Number(limit),
            items: list.rows
        });
    })
);




app.put(
    "/api/vacations/:id",
    verifyToken,
    asyncHandler(async (req, res) => {
        const id = req.params.id;
        const { start_date, end_date, reason } = req.body;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // 1️⃣ Pobierz urlop
        const vacationRes = await pool.query(
            `SELECT employee_id FROM employee_vacations WHERE id = $1`,
            [id]
        );

        if (vacationRes.rowCount === 0) {
            return res.status(404).json({ error: "Urlop nie istnieje" });
        }

        const vacation = vacationRes.rows[0];

        // 2️⃣ Pobierz użytkownika
        const userRes = await pool.query(
            `SELECT is_provider FROM users WHERE uid = $1 LIMIT 1`,
            [uid]
        );

        if (userRes.rowCount === 0) {
            return res.status(403).json({ error: "Brak użytkownika" });
        }

        const isProvider = userRes.rows[0].is_provider === true;

        // 3️⃣ Jeśli PROVIDER → OK
        if (!isProvider) {
            // 4️⃣ Jeśli EMPLOYEE → sprawdź czy urlop należy do niego
            const empRes = await pool.query(
                `SELECT id FROM employees WHERE uid = $1 LIMIT 1`,
                [uid]
            );

            if (empRes.rowCount === 0) {
                return res.status(403).json({
                    error: "Brak przypisanego pracownika"
                });
            }

            const employeeId = empRes.rows[0].id;

            if (employeeId !== vacation.employee_id) {
                return res.status(403).json({
                    error: "Nie masz uprawnień do edytowania tego urlopu"
                });
            }
        }

        // 5️⃣ Zapis aktualizacji
        await pool.query(
            `UPDATE employee_vacations
             SET start_date = $1, end_date = $2, reason = $3
             WHERE id = $4`,
            [start_date, end_date, reason, id]
        );

        res.json({ success: true, message: "Urlop zaktualizowany" });
    })
);
app.delete(
    "/api/vacations/:id",
    verifyToken,
    asyncHandler(async (req, res) => {
        const id = req.params.id;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // 1️⃣ Pobierz urlop
        const vacationRes = await pool.query(
            `SELECT employee_id FROM employee_vacations WHERE id = $1`,
            [id]
        );

        if (vacationRes.rowCount === 0) {
            return res.status(404).json({ error: "Urlop nie istnieje" });
        }

        const vacation = vacationRes.rows[0];

        // 2️⃣ Pobierz użytkownika
        const userRes = await pool.query(
            `SELECT is_provider FROM users WHERE uid = $1 LIMIT 1`,
            [uid]
        );

        const isProvider = userRes.rows[0].is_provider === true;

        // 3️⃣ Jeśli nie provider → sprawdzamy właściciela urlopu
        if (!isProvider) {
            const empRes = await pool.query(
                `SELECT id FROM employees WHERE uid = $1 LIMIT 1`,
                [uid]
            );

            if (empRes.rowCount === 0) {
                return res.status(403).json({
                    error: "Brak przypisanego pracownika"
                });
            }

            const employeeId = empRes.rows[0].id;

            if (employeeId !== vacation.employee_id) {
                return res.status(403).json({
                    error: "Nie masz uprawnień do usunięcia tego urlopu"
                });
            }
        }

        // 4️⃣ Usuń
        await pool.query(
            `DELETE FROM employee_vacations WHERE id = $1`,
            [id]
        );

        res.json({ success: true, message: "Urlop usunięty" });
    })
);








///PRACOWNIK/////
// Create salon (with optional image)
app.post(
    "/api/salons",
    verifyToken,
    requireProviderRole,
    uploadSalonImage.single("image"),
    asyncHandler(async (req, res) => {
        const { name, city, street, street_number, postal_code, phone, description } = req.body;
        const image_url = req.file ? `salons/${req.file.filename}` : null;


        const result = await pool.query(
            `INSERT INTO salons
        (owner_uid, name, city, street, street_number, postal_code, phone, description, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *`,
            [req.user.uid, name, city, street, street_number, postal_code, phone, description, image_url]
        );

        res.json({ message: "✅ Salon utworzony", salon: result.rows[0] });
    })
);

// Update salon
app.put(
    "/api/salons/:id",
    verifyToken,
    requireProviderRole,
    uploadSalonImage.single("image"),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, city, street, street_number, postal_code, phone, description } = req.body;
        const newImage = req.file ? `salons/${req.file.filename}` : null;


        const existing = await pool.query("SELECT image_url FROM salons WHERE id=$1 AND owner_uid=$2", [id, req.user.uid]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Salon nie znaleziony lub brak uprawnień" });
        }

        const currentImage = existing.rows[0].image_url;
        const finalImage = newImage || currentImage;

        const result = await pool.query(
            `UPDATE salons SET
        name=$1, city=$2, street=$3, street_number=$4,
        postal_code=$5, phone=$6, description=$7, image_url=$8
      WHERE id=$9 AND owner_uid=$10
      RETURNING *;`,
            [name, city, street, street_number, postal_code, phone, description, finalImage, id, req.user.uid]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: "Salon nie został znaleziony" });
        res.json({ message: "Salon zaktualizowany pomyślnie", salon: result.rows[0] });
    })
);

// Delete salon
app.delete(
    "/api/salons/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM salons WHERE id=$1 AND owner_uid=$2 RETURNING id", [id, req.user.uid]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Nie znaleziono salonu" });
        res.json({ message: "🗑️ Salon usunięty" });
    })
);

// Get salon for owner
app.get(
    "/api/salons/mine",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const result = await pool.query("SELECT * FROM salons WHERE owner_uid = $1 LIMIT 1", [req.user.uid]);
        res.json(result.rows[0] || {});
    })
);

// Invite employee (create firebase user + db record)
app.post(
    "/api/employees/invite",
    verifyToken,
    requireProviderRole,
    uploadEmployeeImage.single("image"),
    asyncHandler(async (req, res) => {
        const { name, email, phone, description, password, salon_id } = req.body;
        const image_url = req.file ? `uploads/salon_${salon_id}/employees/${req.file.filename}` : null;

        if (!password || password.length < 6) return res.status(400).json({ error: "Hasło musi mieć co najmniej 6 znaków" });
        if (!salon_id) return res.status(400).json({ error: "Brak salon_id — wybierz salon" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz uprawnień do tego salonu" });

        let userRecord;
        try {
            if (!firebaseInitialized) {
                // fallback: create pseudo-uid for local dev
                userRecord = { uid: `local_${Date.now()}`, email };
            } else {
                try {
                    userRecord = await admin.auth().getUserByEmail(email);
                    return res.status(400).json({ error: "Użytkownik o tym e-mailu już istnieje" });
                } catch (err) {
                    if (err.code === "auth/user-not-found") {
                        userRecord = await admin.auth().createUser({ email, password, displayName: name });
                    } else {
                        throw err;
                    }
                }
            }
        } catch (err) {
            console.error("❌ Firebase user creation error:", err);
            return res.status(500).json({ error: "Błąd podczas tworzenia konta Firebase" });
        }

        const result = await pool.query(
            `INSERT INTO employees (salon_id, uid, name, email, phone, description, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *`,
            [salon_id, userRecord.uid, name, email, phone, description, image_url]
        );

        res.json({ message: `✅ Pracownik ${name} dodany do salonu #${salon_id}`, employee: result.rows[0] });
    })
);
// ✅ Multer do zdjęć "Jak dojechać"
const uploadRouteImages = multer({
    storage: makeStorage((req) => `salon_${req.params.id || "unknown"}/route`),
});

// 🧭 Zapis / aktualizacja danych "Jak dojechać"
app.post(
    "/api/salons/:id/route",
    verifyToken,
    requireProviderRole,
    uploadRouteImages.array("route_photos", 10), // maks. 10 zdjęć
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { route_description } = req.body;
        const files = req.files || [];

        // 🔐 Sprawdzenie uprawnień
        const salonCheck = await pool.query(
            "SELECT id FROM salons WHERE id = $1 AND owner_uid = $2",
            [id, req.user.uid]
        );
        if (salonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak uprawnień do salonu" });

        // 📸 Przygotuj tablicę ścieżek do zdjęć
        const imagePaths = files.map(
            (f) => `salon_${id}/route/${f.filename}`
        );

        // 🔁 Wstaw lub zaktualizuj dane
        const result = await pool.query(
            `
      INSERT INTO salon_routes (salon_id, route_description, image_urls)
      VALUES ($1, $2, $3)
      ON CONFLICT (salon_id)
      DO UPDATE SET 
        route_description = EXCLUDED.route_description,
        image_urls = EXCLUDED.image_urls
      RETURNING *;
      `,
            [id, route_description || "", imagePaths]
        );

        res.json({
            message: "✅ Dane 'Jak dojechać' zapisane pomyślnie",
            route: result.rows[0],
        });
    })
);

// 🧭 Pobieranie danych "Jak dojechać"
app.get(
    "/api/salons/:id/route",
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const result = await pool.query(
            "SELECT route_description, image_urls FROM salon_routes WHERE salon_id = $1",
            [id]
        );

        if (result.rows.length === 0)
            return res.json({ route_description: "", image_urls: [] });

        // 🔗 Zamień ścieżki względne na pełne URL-e do obrazków
        const route = result.rows[0];
        const fullUrls = (route.image_urls || []).map(
            (u) => `${req.protocol}://${req.get("host")}/uploads/${u}`
        );

        res.json({
            route_description: route.route_description || "",
            image_urls: fullUrls,
        });
    })
);
// Edit employee
app.put(
    "/api/employees/:id",
    verifyToken,
    requireProviderRole,
    uploadEmployeeImage.single("image"),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, phone, description, salon_id } = req.body;
        const newImage = req.file ? `uploads/salon_${salon_id}/employees/${req.file.filename}` : null;

        const empCheck = await pool.query(
            `SELECT e.id, e.image_url
       FROM employees e
       JOIN salons s ON e.salon_id = s.id
       WHERE e.id = $1 AND s.owner_uid = $2`,
            [id, req.user.uid]
        );
        if (empCheck.rows.length === 0) return res.status(403).json({ error: "Brak uprawnień do edycji pracownika" });

        const currentImage = empCheck.rows[0].image_url;
        const finalImage = newImage || currentImage;

        const result = await pool.query(
            `UPDATE employees SET name=$1, phone=$2, description=$3, image_url=$4 WHERE id=$5 RETURNING *`,
            [name, phone, description, finalImage, id]
        );

        res.json({ message: "✅ Pracownik zaktualizowany", employee: result.rows[0] });
    })
);

// Create service
app.post(
    "/api/services",
    verifyToken,
    requireProviderRole,
    uploadServiceImage.single("image"),
    asyncHandler(async (req, res) => {
        const { name, duration_minutes, price, description, salon_id } = req.body;
        const image_url = req.file ? `uploads/salon_${salon_id}/services/${req.file.filename}` : null;

        if (!salon_id || !name || !price) return res.status(400).json({ error: "Brak wymaganych danych" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz uprawnień do tego salonu" });

        const result = await pool.query(
            `INSERT INTO services (salon_id, name, duration_minutes, price, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [salon_id, name, duration_minutes, price, description, image_url]
        );

        res.json({ message: "💇‍♂️ Usługa dodana", service: result.rows[0] });
    })
);

// Update service (no image changes here beyond original behavior)
app.put(
    "/api/services/:id",
    verifyToken,
    requireProviderRole,
    uploadServiceImage.single("image"),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, duration_minutes, price, description, salon_id } = req.body;
        const newImage = req.file ? path.join(`salon_${salon_id}`, "services", req.file.filename) : null;

        const serviceCheck = await pool.query(
            `SELECT s.id, s.image_url FROM services s JOIN salons sa ON s.salon_id = sa.id WHERE s.id = $1 AND sa.owner_uid = $2`,
            [id, req.user.uid]
        );
        if (serviceCheck.rows.length === 0) return res.status(403).json({ error: "Brak uprawnień do tej usługi" });

        const currentImage = serviceCheck.rows[0].image_url;
        const finalImage = newImage || currentImage;

        const result = await pool.query(
            `UPDATE services SET name=$1, duration_minutes=$2, price=$3, description=$4, image_url=$5 WHERE id=$6 RETURNING *`,
            [name, duration_minutes, price, description, finalImage, id]
        );

        res.json({ message: "✅ Usługa zaktualizowana", service: result.rows[0] });
    })
);

///dodati////
// ================================
//   GET ALL ADDONS FOR A SALON
// ================================
app.get(
    "/api/service-addons/all",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salon_id } = req.query;

        if (!salon_id) return res.status(400).json({ error: "Brak salon_id" });

        // sprawdz właściciela
        const salonCheck = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [salon_id, req.user.uid]
        );
        if (salonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do salonu" });

        const result = await pool.query(
            `SELECT * FROM service_addons
             WHERE salon_id=$1 AND is_active=true
             ORDER BY name`,
            [salon_id]
        );

        res.json(result.rows);
    })
);


// ================================
//       CREATE ADDON (NO IMAGE)
// ================================
app.post(
    "/api/service-addons",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { name, salon_id, duration_minutes, price, description } = req.body;

        if (!name || !salon_id || !price)
            return res.status(400).json({ error: "Brak wymaganych danych" });

        const salonCheck = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [salon_id, req.user.uid]
        );
        if (salonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do salonu" });

        const result = await pool.query(
            `INSERT INTO service_addons (salon_id, name, duration_minutes, price, description)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING *`,
            [salon_id, name, duration_minutes, price, description]
        );

        res.json({ message: "➕ Dodatek dodany", addon: result.rows[0] });
    })
);


// ================================
//       UPDATE ADDON (NO IMAGE)
// ================================
app.put(
    "/api/service-addons/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, duration_minutes, price, description } = req.body;

        const addonCheck = await pool.query(
            `SELECT a.id
             FROM service_addons a
             JOIN salons s ON a.salon_id = s.id
             WHERE a.id=$1 AND s.owner_uid=$2`,
            [id, req.user.uid]
        );
        if (addonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu" });

        const result = await pool.query(
            `UPDATE service_addons
             SET name=$1, duration_minutes=$2, price=$3, description=$4
             WHERE id=$5
             RETURNING *`,
            [name, duration_minutes, price, description, id]
        );

        res.json({ message: "✏️ Dodatek zaktualizowany", addon: result.rows[0] });
    })
);


// ================================
//        DELETE ADDON (SOFT)
// ================================
app.delete(
    "/api/service-addons/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const addonCheck = await pool.query(
            `SELECT a.id
             FROM service_addons a
             JOIN salons s ON a.salon_id=s.id
             WHERE a.id=$1 AND s.owner_uid=$2`,
            [id, req.user.uid]
        );
        if (addonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu" });

        await pool.query(`UPDATE service_addons SET is_active=false WHERE id=$1`, [id]);

        res.json({ message: "🗑️ Dodatek usunięty" });
    })
);


// ================================
//   LINK ADDONS TO A SERVICE
// ================================
app.post(
    "/api/services/:serviceId/addons",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { serviceId } = req.params;
        const { addon_ids } = req.body;

        if (!Array.isArray(addon_ids))
            return res.status(400).json({ error: "addon_ids musi być tablicą" });

        const serviceCheck = await pool.query(
            `SELECT s.id, s.salon_id
             FROM services s
             JOIN salons sa ON s.salon_id = sa.id
             WHERE s.id=$1 AND sa.owner_uid=$2`,
            [serviceId, req.user.uid]
        );
        if (serviceCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do usługi" });

        // usuń stare powiązania
        await pool.query(`DELETE FROM service_addon_links WHERE service_id=$1`, [serviceId]);

        // dodaj nowe
        for (const addonId of addon_ids) {
            await pool.query(
                `INSERT INTO service_addon_links (service_id, addon_id)
                 VALUES ($1,$2)`,
                [serviceId, addonId]
            );
        }

        res.json({ message: "🔗 Powiązania zapisane" });
    })
);


// ================================
//    GET ADDONS LINKED TO SERVICE
// ================================
app.get(
    "/api/services/:serviceId/addons",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { serviceId } = req.params;

        const addons = await pool.query(
            `SELECT a.*
             FROM service_addons a
             JOIN service_addon_links l ON l.addon_id = a.id
             WHERE l.service_id = $1 AND a.is_active=true
             ORDER BY a.name`,
            [serviceId]
        );

        res.json(addons.rows);
    })
);


// ================================
//   DELETE A SINGLE LINK
// ================================
app.delete(
    "/api/service-addon-links/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        await pool.query(`DELETE FROM service_addon_links WHERE id=$1`, [id]);

        res.json({ message: "❌ Powiązanie usunięte" });
    })
);


///dodatki////


////dni wolne///
app.get(
    "/api/salons/:salonId/holidays",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salonId } = req.params;

        // sprawdź właściciela
        const check = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [salonId, req.user.uid]
        );
        if (check.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do salonu" });

        const result = await pool.query(
            `SELECT * FROM salon_holidays 
             WHERE salon_id=$1 
             ORDER BY date ASC`,
            [salonId]
        );

        res.json(result.rows);
    })
);
app.post(
    "/api/salons/:salonId/holidays",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salonId } = req.params;
        const { date, reason } = req.body;

        if (!date) return res.status(400).json({ error: "Brak daty" });

        // sprawdź właściciela
        const check = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [salonId, req.user.uid]
        );
        if (check.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu do salonu" });

        const result = await pool.query(
            `INSERT INTO salon_holidays (salon_id, date, reason)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [salonId, date, reason]
        );

        res.json({ message: "🎉 Dzień wolny dodany", holiday: result.rows[0] });
    })
);
app.put(
    "/api/salon-holidays/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { date, reason } = req.body;

        const check = await pool.query(
            `SELECT h.id 
             FROM salon_holidays h
             JOIN salons s ON s.id = h.salon_id
             WHERE h.id=$1 AND s.owner_uid=$2`,
            [id, req.user.uid]
        );

        if (check.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu" });

        const result = await pool.query(
            `UPDATE salon_holidays 
             SET date=$1, reason=$2 
             WHERE id=$3 
             RETURNING *`,
            [date, reason, id]
        );

        res.json({ message: "✏️ Dzień wolny zaktualizowany", holiday: result.rows[0] });
    })
);
app.delete(
    "/api/salon-holidays/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const check = await pool.query(
            `SELECT h.id 
             FROM salon_holidays h
             JOIN salons s ON s.id=h.salon_id
             WHERE h.id=$1 AND s.owner_uid=$2`,
            [id, req.user.uid]
        );

        if (check.rows.length === 0)
            return res.status(403).json({ error: "Brak dostępu" });

        await pool.query("DELETE FROM salon_holidays WHERE id=$1", [id]);

        res.json({ message: "🗑️ Dzień wolny usunięty" });
    })
);


///dni wolne///



// Get services for owner (mine)
app.get(
    "/api/services/mine",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salon_id } = req.query;
        if (!salon_id) return res.status(400).json({ error: "Brak salon_id w zapytaniu" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz dostępu do tego salonu" });

        const result = await pool.query(
            `SELECT id, name, duration_minutes, price, description, image_url, is_active, created_at
       FROM services WHERE salon_id = $1 ORDER BY created_at DESC`,
            [salon_id]
        );

        res.json(result.rows);
    })
);

// Assign service to employee
app.post(
    "/api/employee-services",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { employee_id, service_id } = req.body;
        await pool.query(
            `INSERT INTO employee_services (employee_id, service_id)
       VALUES ($1, $2)
       ON CONFLICT (employee_id, service_id) DO NOTHING`,
            [employee_id, service_id]
        );
        res.json({ message: "✅ Usługa przypisana do pracownika" });
    })
);

// Get employee-services for salon
app.get(
    "/api/employee-services",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salon_id } = req.query;
        if (!salon_id) return res.status(400).json({ error: "Brak salon_id w zapytaniu" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz dostępu do tego salonu" });

        const result = await pool.query(
            `SELECT e.id AS employee_id, e.name AS employee_name, e.email,
              s.id AS service_id, s.name AS service_name
       FROM employees e
       LEFT JOIN employee_services es ON e.id = es.employee_id
       LEFT JOIN services s ON es.service_id = s.id
       WHERE e.salon_id = $1
       ORDER BY e.id, s.id;`,
            [salon_id]
        );

        res.json(result.rows);
    })
);

// Toggle assignment (checkbox)
app.post(
    "/api/employee-services/toggle",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { employee_id, service_id, assigned } = req.body;
        if (assigned) {
            await pool.query(`INSERT INTO employee_services (employee_id, service_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [employee_id, service_id]);
        } else {
            await pool.query(`DELETE FROM employee_services WHERE employee_id = $1 AND service_id = $2`, [employee_id, service_id]);
        }
        res.json({ message: "✅ Zaktualizowano przypisanie" });
    })
);

// Get employee schedule
app.get(
    "/api/schedule/employee/:employeeId",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { employeeId } = req.params;
        const result = await pool.query(`SELECT * FROM employee_schedule WHERE employee_id = $1 ORDER BY day_of_week`, [employeeId]);
        res.json(result.rows);
    })
);

// Save employee schedule (replace)
app.post(
    "/api/schedule/employee/:employeeId",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { employeeId } = req.params;
        const { schedule } = req.body;
        await pool.query("DELETE FROM employee_schedule WHERE employee_id = $1", [employeeId]);
        const insertPromises = schedule.map((d) =>
            pool.query(`INSERT INTO employee_schedule (employee_id, day_of_week, open_time, close_time, is_day_off) VALUES ($1,$2,$3,$4,$5)`,
                [employeeId, d.day_of_week, d.open_time, d.close_time, d.is_day_off]));
        await Promise.all(insertPromises);
        res.json({ message: "✅ Harmonogram zapisany dla pracownika" });
    })
);

// Get salon holidays
app.get(
    "/api/schedule/holidays",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const salon = await pool.query("SELECT id FROM salons WHERE owner_uid = $1 LIMIT 1", [req.user.uid]);
        if (salon.rows.length === 0) return res.status(400).json({ error: "Nie znaleziono salonu" });
        const salonId = salon.rows[0].id;
        const result = await pool.query("SELECT * FROM salon_holidays WHERE salon_id = $1 ORDER BY date", [salonId]);
        res.json(result.rows);
    })
);

// Add or update holiday
app.post(
    "/api/schedule/holidays",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { date, reason } = req.body;
        const salon = await pool.query("SELECT id FROM salons WHERE owner_uid = $1 LIMIT 1", [req.user.uid]);
        const salonId = salon.rows[0].id;
        await pool.query(
            `INSERT INTO salon_holidays (salon_id, date, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (salon_id, date) DO UPDATE SET reason = EXCLUDED.reason`,
            [salonId, date, reason]
        );
        res.json({ message: "✅ Dzień wolny dodany" });
    })
);

// Get vacations
app.get(
    "/api/schedule/vacations",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        // expecting salon_id in query or fallback to owner's salon
        let salonId = null;
        if (req.query?.salon_id) salonId = Number(req.query.salon_id);
        else salonId = await getOwnerSalonId(req.user.uid);
        if (!salonId) return res.status(403).json({ error: "Nie masz uprawnień do tego salonu (brak salon_id)" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salonId, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz uprawnień do tego salonu" });

        const result = await pool.query(`
      SELECT e.name AS employee_name, v.*
      FROM employee_vacations v
      JOIN employees e ON v.employee_id = e.id
      WHERE e.salon_id = $1
      ORDER BY start_date;
    `, [salonId]);
        res.json(result.rows);
    })
);

// Add vacation
app.post(
    "/api/schedule/vacations",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { employee_id, start_date, end_date, reason } = req.body;
        await pool.query(`INSERT INTO employee_vacations (employee_id, start_date, end_date, reason) VALUES ($1,$2,$3,$4)`, [employee_id, start_date, end_date, reason]);
        res.json({ message: "✅ Urlop dodany" });
    })
);
// ===========================
// 🕒 REZERWACJE CZASU PRACOWNIKA
// ===========================

// 📋 Lista blokad czasu (dla właściciela salonu)
app.get(
    "/api/schedule/time-off",
    verifyToken,
    requireEmployeeOrProviderRole,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        const salonIdFromQuery = req.query.salon_id
            ? Number(req.query.salon_id)
            : null;

        // 🔹 Pobierz info o użytkowniku
        const userRes = await pool.query(
            "SELECT is_provider FROM users WHERE uid = $1 LIMIT 1",
            [uid]
        );

        if (userRes.rowCount === 0) {
            return res.status(403).json({ error: "Użytkownik nie istnieje" });
        }

        const isProvider = userRes.rows[0].is_provider === true;

        let salonId;

        if (isProvider) {
            // PROVIDER → musi podać salon_id z frontu
            if (!salonIdFromQuery) {
                return res.status(400).json({
                    error: "Provider musi wybrać salon (brak salon_id)",
                });
            }

            // 🔐 Sprawdź, czy ten salon faktycznie należy do providera
            const salonCheck = await pool.query(
                "SELECT id FROM salons WHERE id = $1 AND owner_uid = $2",
                [salonIdFromQuery, uid]
            );

            if (salonCheck.rowCount === 0) {
                return res.status(403).json({
                    error: "Ten salon nie należy do zalogowanego providera",
                });
            }

            salonId = salonIdFromQuery;
        } else {
            // PRACOWNIK → bierzemy salon z tabeli employees
            const empRes = await pool.query(
                "SELECT salon_id FROM employees WHERE uid = $1 LIMIT 1",
                [uid]
            );

            if (empRes.rowCount === 0) {
                return res
                    .status(403)
                    .json({ error: "Brak przypisanego salonu" });
            }

            salonId = empRes.rows[0].salon_id;
        }

        const result = await pool.query(
            `
            SELECT t.*, e.name AS employee_name
            FROM employee_time_off t
            JOIN employees e ON e.id = t.employee_id
            WHERE e.salon_id = $1
            ORDER BY t.date, t.start_time;
        `,
            [salonId]
        );

        res.json(result.rows);
    })
);


// ➕ Dodaj nową blokadę czasu
app.post(
    "/api/schedule/time-off",
    verifyToken,
    requireEmployeeOrProviderRole,
    asyncHandler(async (req, res) => {
        const { employee_id: bodyEmployeeId, date, start_time, end_time, reason } = req.body;
        const uid = req.user?.uid;

        if (!uid) {
            return res.status(401).json({ error: "Brak autoryzacji" });
        }

        if (!date || !start_time || !end_time) {
            return res
                .status(400)
                .json({ error: "Brak wymaganych pól (data / godziny)" });
        }

        // 🔹 Pobierz dane użytkownika
        const uRes = await pool.query(
            "SELECT is_provider FROM users WHERE uid = $1 LIMIT 1",
            [uid]
        );

        if (uRes.rowCount === 0) {
            return res.status(403).json({ error: "Brak użytkownika" });
        }

        const isProvider = uRes.rows[0].is_provider === true;

        let targetEmployeeId;
        let salonId;

        // ======================================================
        // 1️⃣ PROVIDER — może wybrać dowolnego pracownika ZE SWOICH salonów
        // ======================================================
        if (isProvider) {
            if (!bodyEmployeeId) {
                return res
                    .status(400)
                    .json({ error: "Musisz wybrać pracownika" });
            }

            targetEmployeeId = Number(bodyEmployeeId);

            // 🔐 Sprawdź, czy ten pracownik należy do salonu providera
            const empRow = await pool.query(
                `
                SELECT e.id, e.salon_id
                FROM employees e
                JOIN salons s ON s.id = e.salon_id
                WHERE e.id = $1
                  AND s.owner_uid = $2
                LIMIT 1
            `,
                [targetEmployeeId, uid]
            );

            if (empRow.rowCount === 0) {
                return res.status(403).json({
                    error: "Nie możesz blokować czasu pracownikom spoza Twoich salonów",
                });
            }

            salonId = empRow.rows[0].salon_id;
        }

        // ======================================================
        // 2️⃣ EMPLOYEE — może dodać blokadę tylko SOBIE
        // ======================================================
        else {
            const empRes = await pool.query(
                `
                SELECT id, salon_id
                FROM employees
                WHERE uid = $1
                LIMIT 1
            `,
                [uid]
            );

            if (empRes.rowCount === 0) {
                return res.status(403).json({
                    error: "Nie znaleziono przypisanego pracownika",
                });
            }

            targetEmployeeId = empRes.rows[0].id;
            salonId = empRes.rows[0].salon_id;

            if (
                bodyEmployeeId &&
                Number(bodyEmployeeId) !== Number(targetEmployeeId)
            ) {
                return res.status(403).json({
                    error: "Nie możesz dodać blokady innemu pracownikowi",
                });
            }
        }

        // ======================================================
        // 3️⃣ Zapis blokady czasu
        // ======================================================
        const result = await pool.query(
            `
            INSERT INTO employee_time_off (employee_id, date, start_time, end_time, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `,
            [targetEmployeeId, date, start_time, end_time, reason || null]
        );

        const t = result.rows[0];

        // (opcjonalnie) jeśli używasz salonCache, możesz go tu wyczyścić
        if (typeof salonCache !== "undefined") {
            salonCache.delete(`salon_${salonId}`);
        }

        // 🔥 LIVE UPDATE — jak wcześniej
        try {
            io.emit("calendar_updated", {
                type: "time_off_added",
                employee_id: t.employee_id,
                time_off: t,
            });

            console.log(
                "📡 Wysłano calendar_updated (ADD time_off):",
                t.id
            );
        } catch (emitErr) {
            console.warn(
                "⚠️ Nie udało się wysłać socket eventu (ADD):",
                emitErr
            );
        }

        res.json({ message: "✅ Zablokowano czas pracownika", time_off: t });
    })
);



// 🗑️ Usuń blokadę czasu — właściciel salonu LUB pracownik (swoją własną)
app.delete(
    "/api/schedule/time-off/:id",
    verifyToken,
    requireEmployeeOrProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const uid = req.user?.uid;

        if (!uid) return res.status(401).json({ error: "Brak autoryzacji" });

        // Usuwamy tylko gdy:
        // - rekord należy do pracownika z salonu którego owner_uid = current user (właściciel)
        // OR
        // - rekord należy do pracownika, którego uid = current user (pracownik usuwa własny time_off)
        const result = await pool.query(
            `
      DELETE FROM employee_time_off t
      WHERE t.id = $1
        AND (
          t.employee_id IN (
            SELECT e.id FROM employees e
            JOIN salons s ON s.id = e.salon_id
            WHERE s.owner_uid = $2
          )
          OR t.employee_id IN (
            SELECT e.id FROM employees e WHERE e.uid = $2
          )
        )
      RETURNING id, employee_id;
      `,
            [id, uid]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Nie znaleziono lub brak uprawnień" });
        }

        // emit, żeby frontend odświeżył kalendarz
        try {
            const deleted = result.rows[0];
            io.emit("calendar_updated", {
                type: "delete_time_off",
                time_off_id: id,
                employee_id: deleted.employee_id,
            });

            console.log("📡 Wysłano calendar_updated (DELETE time_off):", id);
        } catch (emitErr) {
            console.warn("⚠️ Nie udało się wysłać socket eventu po usunięciu time_off:", emitErr);
        }

        res.json({ message: "🗑️ Blokada czasu usunięta", deleted_id: id });
    })
);


// ✏️ Edytuj blokadę czasu
app.put(
    "/api/schedule/time-off/:id",
    verifyToken,
    requireEmployeeOrProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { date, start_time, end_time, reason, employee_id } = req.body;

        const result = await pool.query(
            `
      UPDATE employee_time_off
      SET 
        date = $1, 
        start_time = $2, 
        end_time = $3, 
        reason = $4, 
        employee_id = $5
      WHERE id = $6
        AND employee_id IN (
          SELECT e.id FROM employees e
          JOIN salons s ON s.id = e.salon_id
          WHERE s.owner_uid = $7     -- właściciel
             OR e.uid = $7           -- pracownik edytujący swoje time_off
        )
      RETURNING *;
    `,
            [date, start_time, end_time, reason, employee_id, id, req.user.uid]
        );

        if (result.rowCount === 0)
            return res
                .status(404)
                .json({ error: "Nie znaleziono blokady lub brak uprawnień" });

        const updated = result.rows[0];

        // 🔥 LIVE UPDATE
        try {
            io.emit("calendar_updated", {
                type: "time_off_updated",
                employee_id: updated.employee_id,
                time_off: updated,
            });

            console.log("📡 Wysłano calendar_updated (UPDATE time_off):", updated.id);
        } catch (emitErr) {
            console.warn("⚠️ Socket emit UPDATE error:", emitErr);
        }

        res.json({
            message: "✅ Blokada czasu zaktualizowana",
            time_off: updated,
        });
    })
);

app.get("/api/me/employee", verifyToken, asyncHandler(async (req, res) => {
    const uid = req.user?.uid;

    const r = await pool.query(
        `SELECT id, name FROM employees WHERE uid = $1 LIMIT 1`,
        [uid]
    );

    if (r.rowCount === 0) return res.json({});

    res.json({
        id: r.rows[0].id,
        name: r.rows[0].name,
    });
}));


// Services by employee
app.get(
    "/api/services/by-employee/:employeeId",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { employeeId } = req.params;
        if (!employeeId) return res.status(400).json({ error: "Brak parametru employeeId" });

        const rel = await pool.query(`SELECT service_id FROM employee_services WHERE employee_id = $1`, [employeeId]);
        if (!rel.rows.length) return res.json([]);
        const serviceIds = rel.rows.map((r) => r.service_id);
        const services = await pool.query(`SELECT id, name, price, duration_minutes FROM services WHERE id = ANY($1::int[])`, [serviceIds]);
        res.json(services.rows);
    })
);
//potfolio
// ===============================
// 💎 PORTFOLIO Z GRUPAMI (v2)
// ===============================

// 📸 Storage dla zdjęć portfolio
const uploadPortfolioImages = multer({
    storage: makeStorage((req) => `salon_${req.params.id || "unknown"}/portfolio`),
});

// 📋 Upewnij się, że tabele istnieją
await pool.query(`
  CREATE TABLE IF NOT EXISTS salon_portfolio_groups (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (salon_id, name)
  );
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS salon_portfolio (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES salon_portfolio_groups(id) ON DELETE SET NULL,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
// ✅ Dodaj nową grupę portfolio
app.post(
    "/api/salons/:id/portfolio-groups",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim())
            return res.status(400).json({ error: "Nazwa grupy jest wymagana" });

        const salonCheck = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [id, req.user.uid]
        );
        if (salonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak uprawnień do salonu" });

        const result = await pool.query(
            `INSERT INTO salon_portfolio_groups (salon_id, name)
       VALUES ($1, $2)
       ON CONFLICT (salon_id, name) DO NOTHING
       RETURNING *`,
            [id, name.trim()]
        );

        if (result.rows.length === 0)
            return res.status(200).json({ message: "Grupa już istnieje" });

        res.json({ message: "✅ Grupa dodana", group: result.rows[0] });
    })
);
// ✅ Pobierz wszystkie grupy portfolio
app.get(
    "/api/salons/:id/portfolio-groups",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, name FROM salon_portfolio_groups WHERE salon_id=$1 ORDER BY name`,
            [id]
        );
        res.json(result.rows);
    })
);
// ✅ Usuń grupę portfolio
app.delete(
    "/api/portfolio-groups/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        // odłącz zdjęcia
        await pool.query(`UPDATE salon_portfolio SET group_id = NULL WHERE group_id=$1`, [id]);

        const result = await pool.query(
            `DELETE FROM salon_portfolio_groups 
       WHERE id=$1 AND salon_id IN (SELECT id FROM salons WHERE owner_uid=$2)
       RETURNING id`,
            [id, req.user.uid]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: "Nie znaleziono grupy lub brak uprawnień" });

        res.json({ message: "🗑️ Grupa portfolio usunięta" });
    })
);
// ✅ Dodaj zdjęcia do portfolio (z przypisaną grupą)
app.post(
    "/api/salons/:id/portfolio",
    verifyToken,
    requireProviderRole,
    uploadPortfolioImages.array("portfolio_images", 20),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { group_id } = req.body;
        const files = req.files || [];

        const salonCheck = await pool.query(
            "SELECT id FROM salons WHERE id=$1 AND owner_uid=$2",
            [id, req.user.uid]
        );
        if (salonCheck.rows.length === 0)
            return res.status(403).json({ error: "Brak uprawnień do salonu" });

        if (!files.length)
            return res.status(400).json({ error: "Brak przesłanych zdjęć" });

        const imagePaths = files.map((f) => `salon_${id}/portfolio/${f.filename}`);

        const insertPromises = imagePaths.map((p) =>
            pool.query(
                `INSERT INTO salon_portfolio (salon_id, group_id, image_url)
         VALUES ($1, $2, $3)`,
                [id, group_id || null, p]
            )
        );
        await Promise.all(insertPromises);

        res.json({
            message: "✅ Zdjęcia dodane do portfolio",
            added: imagePaths.length,
        });
    })
);
// ✅ Pobierz zdjęcia portfolio (zgrupowane)
app.get(
    "/api/salons/:id/portfolio",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(
            `
      SELECT p.id, p.image_url, g.name AS group_name, p.group_id
      FROM salon_portfolio p
      LEFT JOIN salon_portfolio_groups g ON g.id = p.group_id
      WHERE p.salon_id=$1
      ORDER BY g.name NULLS FIRST, p.created_at DESC
      `,
            [id]
        );

        const fullUrls = result.rows.map((r) => ({
            id: r.id,
            group_id: r.group_id,
            group_name: r.group_name || "Bez grupy",
            url: `${req.protocol}://${req.get("host")}/uploads/${r.image_url}`,
        }));

        // grupowanie po nazwie grupy
        const grouped = {};
        fullUrls.forEach((img) => {
            const key = img.group_name || "Bez grupy";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(img);
        });

        res.json(grouped);
    })
);
// ✅ Usuń pojedyncze zdjęcie portfolio
app.delete(
    "/api/portfolio/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const result = await pool.query(
            `DELETE FROM salon_portfolio 
       WHERE id=$1 AND salon_id IN (SELECT id FROM salons WHERE owner_uid=$2)
       RETURNING image_url`,
            [id, req.user.uid]
        );

        if (result.rows.length === 0)
            return res
                .status(404)
                .json({ error: "Nie znaleziono zdjęcia lub brak uprawnień" });

        const imagePath = path.join(__dirname, "uploads", result.rows[0].image_url);
        fs.unlink(imagePath, (err) => {
            if (err) console.warn("⚠️ Nie udało się usunąć pliku:", imagePath);
        });

        res.json({ message: "🗑️ Zdjęcie usunięte" });
    })
);
// -------------------- Heavy endpoint: /api/appointments/available --------------------
app.get(
    "/api/appointments/available",
    verifyToken,
    asyncHandler(async (req, res) => {
        console.time("/api/appointments/available");
        const { employee_id: employeeIdRaw, service_id, date } = req.query;
        let { addons, total_duration } = req.query;

        if (!service_id || service_id === "undefined" || !date) {
            console.warn("⚠️ Brak service_id lub date – zwracam pustą listę slotów:", req.query);
            return res.json([]);
        }

        const employee_id = employeeIdRaw && !isNaN(Number(employeeIdRaw)) ? Number(employeeIdRaw) : null;

        // Normalize addons query -> array of ints
        let addonIds = [];
        if (addons) {
            if (typeof addons === "object" && !Array.isArray(addons)) {
                addonIds = Object.values(addons).map(Number);
            } else if (Array.isArray(addons)) {
                addonIds = addons.map(Number);
            } else {
                addonIds = [Number(addons)];
            }
            addonIds = addonIds.filter((n) => Number.isFinite(n) && n > 0);
        }

        const cacheKey = `available:${service_id}:${date}:emp:${employee_id ?? "any"}:addons:${addonIds.join(",")}:td:${total_duration ?? ""}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log("🔁 cache hit -> /available");
            console.timeEnd("/api/appointments/available");
            return res.json(cached);
        }

        console.log("🧭 /available query:", req.query);

        const targetDate = new Date(date);
        // use getUTCDay for consistency with original
        const dayOfWeek = targetDate.getUTCDay();

        // 1) base duration from services
        const serviceRes = await pool.query(`SELECT duration_minutes FROM services WHERE id=$1`, [service_id]);
        let duration = Number(serviceRes.rows[0]?.duration_minutes || 0);

        // 2) addons durations sum (if any)
        if (addonIds.length > 0) {
            const addonQuery = await pool.query(`SELECT COALESCE(SUM(duration_minutes),0) AS total FROM service_addons WHERE id = ANY($1::int[])`, [addonIds]);
            const extra = Number(addonQuery.rows[0]?.total || 0);
            duration += extra;
            console.log(`➕ Dodatki (${addonIds.length}) dodają ${extra} min → razem ${duration} min`);
        }

        // 3) client override total_duration (take precedence)
        if (total_duration) {
            const totalFromClient = Number(total_duration);
            if (!isNaN(totalFromClient) && totalFromClient > 0) {
                duration = totalFromClient;
                console.log("🕒 Nadpisano długość usługi przez frontend:", totalFromClient, "min");
            }
        }

        // 4) get employees for the service (or single)
        let employees = [];
        if (employee_id) {
            const empRes = await pool.query("SELECT id, name FROM employees WHERE id = $1", [employee_id]);
            if (!empRes.rows.length) {
                console.timeEnd("/api/appointments/available");
                return res.status(404).json({ error: "Nie znaleziono pracownika" });
            }
            employees = empRes.rows;
        } else {
            const empRes = await pool.query(
                `SELECT e.id, e.name FROM employees e JOIN employee_services es ON es.employee_id = e.id WHERE es.service_id = $1 AND e.is_active = true`,
                [service_id]
            );
            if (!empRes.rows.length) {
                console.timeEnd("/api/appointments/available");
                return res.status(404).json({ error: "Brak pracowników wykonujących tę usługę" });
            }
            employees = empRes.rows;
        }

        // 5) check salon holiday (we take salon from first employee)
        const salonRes = await pool.query(
            `SELECT DISTINCT s.id FROM salons s JOIN employees e ON e.salon_id = s.id WHERE e.id = $1 LIMIT 1`,
            [employee_id || employees[0].id]
        );
        const salonId = salonRes.rows[0]?.id;
        if (salonId) {
            const hol = await pool.query("SELECT 1 FROM salon_holidays WHERE salon_id = $1 AND date = $2", [salonId, date]);
            if (hol.rows.length > 0) {
                console.log("🏖️ Salon ma dzień wolny:", date);
                cache.set(cacheKey, [], 10_000); // short cache for holidays
                console.timeEnd("/api/appointments/available");
                return res.json([]);
            }
        }

        // 6) For each employee, fetch schedule, vacations, and bookings in parallel (per employee)
        // We'll parallelize per-employee DB calls to speed up
        const results = [];
        await Promise.all(
            employees.map(async (emp) => {
                // schedule for that day
                const scheduleRes = await pool.query(
                    `SELECT open_time, close_time, is_day_off FROM employee_schedule WHERE employee_id = $1 AND day_of_week = $2`,
                    [emp.id, dayOfWeek]
                );
                if (!scheduleRes.rows.length || scheduleRes.rows[0].is_day_off) return;

                const { open_time, close_time } = scheduleRes.rows[0];
                const [openH, openM] = open_time.split(":").map(Number);
                const [closeH, closeM] = close_time.split(":").map(Number);
                const start = new Date(`${date}T${String(openH).padStart(2, "0")}:${String(openM).padStart(2, "0")}:00`);
                const end = new Date(`${date}T${String(closeH).padStart(2, "0")}:${String(closeM).padStart(2, "0")}:00`);

                // vacations
                const vacRes = await pool.query(
                    `SELECT 1 FROM employee_vacations WHERE employee_id = $1 AND $2::date BETWEEN start_date AND end_date`,
                    [emp.id, date]
                );
                if (vacRes.rows.length > 0) return;
                // bookings for that employee and day
                const appRes = await pool.query(
                    `SELECT start_time, end_time 
   FROM appointments 
   WHERE employee_id = $1 AND date = $2 AND status = 'booked'`,
                    [emp.id, date]
                );

                // 🔹 Dodaj — rezerwacje czasu / przerwy
                const offRes = await pool.query(
                    `SELECT start_time, end_time 
   FROM employee_time_off 
   WHERE employee_id = $1 AND date = $2`,
                    [emp.id, date]
                );

                // 🔹 Połącz wizyty i przerwy
                const booked = [...appRes.rows, ...offRes.rows].map((a) => ({
                    start: new Date(`${date}T${a.start_time}`),
                    end: new Date(`${date}T${a.end_time}`),
                }));

                // 🔹 Generowanie dostępnych slotów
                let current = new Date(start);
                while (current < end) {
                    const serviceEnd = new Date(current.getTime() + duration * 60000);
                    if (serviceEnd > end) break;

                    // sprawdzamy konflikt z wizytami i przerwami
                    const overlap = booked.some((b) => current < b.end && serviceEnd > b.start);

                    if (!overlap) {
                        results.push({
                            employee_id: emp.id,
                            employee_name: emp.name,
                            start_time: current.toTimeString().slice(0, 5),
                            end_time: serviceEnd.toTimeString().slice(0, 5),
                        });

                        // przesuwamy wskaźnik na koniec slotu
                        current = new Date(serviceEnd.getTime());
                    } else {
                        // przesuwamy się za koniec najbliższej kolizji (wizyty lub przerwy)
                        const nextFree = booked
                            .filter((b) => b.end > current)
                            .sort((a, b) => a.end - b.end)[0];

                        current = nextFree
                            ? new Date(nextFree.end.getTime())
                            : new Date(serviceEnd.getTime());
                    }
                }

                // ✅ DOMKNIĘCIE map(async (emp) => {...})
            }) // zamknięcie funkcji dla pojedynczego pracownika
        ); // zamknięcie Promise.all

        // po zakończeniu pętli (dla wszystkich pracowników)

        // sort results by start_time then employee_id
        results.sort((a, b) => {
            if (a.start_time === b.start_time) return a.employee_id - b.employee_id;
            return a.start_time.localeCompare(b.start_time);
        });

        // cache results for 20s
        cache.set(cacheKey, results, 20_000);
        console.log("🟢 Available slots count:", results.length);
        console.timeEnd("/api/appointments/available");
        res.json(results);


    })
);
// -------------------- Create appointment --------------------
app.post(
    "/api/appointments",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { employee_id, service_id, date, start_time, end_time, addons = [] } = req.body;
        const client_uid = req.user?.uid;

        if (!client_uid)
            return res.status(401).json({ error: "Brak autoryzacji" });
        if (!employee_id || !service_id || !date || !start_time || !end_time)
            return res.status(400).json({ error: "Brak wymaganych danych" });

        // Pobierz dane klienta
        const userRes = await pool.query(
            `SELECT name, phone FROM users WHERE uid = $1`,
            [client_uid]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "Klient nie istnieje w bazie" });
        }

        const fullName = userRes.rows[0].name || "";
        const [first_name, ...rest] = fullName.trim().split(" ");
        const last_name = rest.join(" ") || null;
        const phone = userRes.rows[0].phone || null;

        const client = await pool.connect();

        try {
            await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
            await client.query("SET LOCAL lock_timeout = '1s'");

            await client.query(
                `SELECT id FROM appointments
         WHERE employee_id = $1 AND date = $2
         FOR UPDATE`,
                [employee_id, date]
            );

            const conflict = await client.query(
                `SELECT 1 FROM appointments
         WHERE employee_id = $1 AND date = $2
         AND status = 'booked'
         AND ((start_time, end_time) OVERLAPS ($3::time, $4::time))`,
                [employee_id, date, start_time, end_time]
            );

            if (conflict.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({ error: "Ten termin jest już zajęty" });
            }

            // 🔥 LIMIT ile razy klient może zarezerwować daną usługę w jednym dniu
            const maxBookingsPerDay = 2;  // zmień na 1 jeśli ma być tylko 1 rezerwacja

            const limitCheck = await client.query(
                `SELECT COUNT(*) AS cnt
     FROM appointments
     WHERE client_uid = $1
       AND service_id = $2
       AND date = $3
       AND status = 'booked'`,
                [client_uid, service_id, date]
            );

            if (Number(limitCheck.rows[0].cnt) >= maxBookingsPerDay) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: maxBookingsPerDay === 1
                        ? "Możesz zarezerwować tylko jedną taką usługę dziennie."
                        : `Możesz zarezerwować maksymalnie ${maxBookingsPerDay} takie usługi dziennie.`
                });
            }


            const salonRes = await client.query(
                `SELECT salon_id FROM employees WHERE id = $1`,
                [employee_id]
            );

            if (!salonRes.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Nie znaleziono pracownika" });
            }

            const salon_id = salonRes.rows[0].salon_id;

            const insertRes = await client.query(
                `INSERT INTO appointments
         (salon_id, employee_id, client_uid, service_id, date, start_time, end_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
         RETURNING id`,
                [salon_id, employee_id, client_uid, service_id, date, start_time, end_time]
            );

            const appointmentId = insertRes.rows[0].id;

            if (!client_uid && !phone) {
                console.warn("❗ Pomijam dodanie klienta, brak uid i telefonu");
            } else {
                await client.query(
                    `INSERT INTO salon_clients (
            salon_id,
            employee_id,
            client_uid,
            first_appointment_id,
            first_name,
            last_name,
            phone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING`,
                    [
                        salon_id,
                        employee_id,
                        client_uid,
                        appointmentId,
                        first_name,
                        last_name,
                        phone
                    ]
                );
            }


            if (Array.isArray(addons) && addons.length > 0) {
                const vals = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
                const params = [appointmentId, ...addons];

                await client.query(
                    `INSERT INTO appointment_addons (appointment_id, addon_id)
           VALUES ${vals} ON CONFLICT DO NOTHING`,
                    params
                );
            }

            await client.query("COMMIT");

            try {
                const apptRes = await pool.query(
                    `SELECT a.*, e.name AS employee_name, e.salon_id, s.name AS service_name
           FROM appointments a
           JOIN employees e ON e.id = a.employee_id
           JOIN services s ON s.id = a.service_id
           WHERE a.id = $1`,
                    [appointmentId]
                );

                if (apptRes.rows.length > 0) {
                    io.emit("calendar_updated", {
                        type: "new",
                        appointment: apptRes.rows[0],
                    });
                }


            } catch (err) {
                console.error("⚠️ Nie udało się wysłać eventu calendar_updated (NEW):", err);
            }

            /* ------------------------------------------------------
    🔔 WEB PUSH – powiadom pracownika o nowej rezerwacji
 ------------------------------------------------------ */
            try {
                console.log("🔔 [PUSH] START (client booking) for employee_id:", employee_id);

                // pobierz subskrypcje pracownika
                const subs = await pool.query(
                    "SELECT subscription FROM push_subscriptions WHERE employee_id = $1",
                    [employee_id]
                );

                console.log("🔔 [PUSH] Subscriptions found:", subs.rows.length);

                // 🔹 Pobierz nazwę usługi
                const serviceRow = await pool.query(
                    `SELECT name FROM services WHERE id=$1`,
                    [service_id]
                );
                const serviceName = serviceRow.rows[0]?.name || "";

                // 🔹 Pobierz nazwy dodatków
                const addonIds = Array.isArray(addons) ? addons.map(Number) : [];
                let addonNames = [];

                if (addonIds.length > 0) {
                    const addRes = await pool.query(
                        `SELECT name FROM service_addons WHERE id = ANY($1::int[])`,
                        [addonIds]
                    );
                    addonNames = addRes.rows.map(a => a.name);
                }

                const addonsText =
                    addonNames.length > 0 ? " + " + addonNames.join(" + ") : "";

                // 🔹 Format daty PL
                const dt = new Date(date + "T" + start_time);
                const formattedDate = dt.toLocaleDateString("pl-PL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                });

                // 🔹 Imię i nazwisko klienta
                const clientFullName = `${first_name}${last_name ? " " + last_name : ""}`;

                // 🔹 Pełny tekst powiadomienia
                const bodyText = `${formattedDate}, godz. ${start_time}–${end_time}\n${clientFullName} — ${serviceName}${addonsText}`;

                for (const row of subs.rows) {
                    try {
                        const subscription = row.subscription;

                        const payloadString = JSON.stringify({
                            title: "Nowa rezerwacja!",
                            body: bodyText,
                            url: `/employee/appointment/${appointmentId}`,
                        });

                        await webpush.sendNotification(subscription, payloadString);

                        console.log("✔️ Push wysłany");

                    } catch (err) {
                        console.error("❌ PUSH ERROR:", err.message);

                        if (err.statusCode === 410 || err.statusCode === 404) {
                            console.log("🗑 Usuwam martwą subskrypcję");
                            await pool.query(
                                "DELETE FROM push_subscriptions WHERE subscription = $1",
                                [row.subscription]
                            );
                        }
                    }
                }
            } catch (err) {
                console.error("❌ GLOBAL PUSH ERROR:", err);
            }




            res.json({
                message: "✅ Rezerwacja utworzona",
                appointment_id: appointmentId,
            });

        } catch (err) {
            await client.query("ROLLBACK");

            if (err.code === "55P03") {
                return res
                    .status(409)
                    .json({ error: "Termin właśnie zajmowany przez innego klienta" });
            }

            if (err.code === "40001") {
                return res
                    .status(409)
                    .json({ error: "Termin został przed chwilą zajęty" });
            }

            console.error("❌ Błąd przy rezerwacji:", err.message);
            res.status(500).json({ error: "Błąd podczas tworzenia rezerwacji" });
        } finally {
            client.release();
        }
    })
);




app.get(
    "/api/clients",
    verifyToken,
    asyncHandler(async (req, res) => {
        const uid = req.user?.uid;
        let { q, employee_id, page = 1, limit = 20, salon_id } = req.query;

        // -------- AUTO-DETEKCJA SALONU --------
        let salonId = Number(salon_id);

        if (!salonId) {
            // jeśli nie ma w query → sprawdź czy to pracownik
            const emp = await pool.query(
                `SELECT salon_id FROM employees WHERE uid = $1 LIMIT 1`,
                [uid]
            );

            if (emp.rows.length > 0) {
                salonId = emp.rows[0].salon_id; // pracownik
            }
        }

        if (!salonId) {
            return res.status(400).json({ error: "Brak salon_id" });
        }
        // --------------------------------------

        const pageNum = Math.max(1, Number(page) || 1);
        const lim = Math.min(100, Math.max(1, Number(limit) || 20));
        const offset = (pageNum - 1) * lim;

        const whereParts = ["sc.salon_id = $1"];
        const params = [salonId];
        let idx = params.length + 1;

        // filtr po pracowniku
        if (employee_id && employee_id !== "all") {
            whereParts.push(`sc.employee_id = $${idx++}`);
            params.push(Number(employee_id));
        }

        // wyszukiwarka
        if (q && q.trim() !== "") {
            const like = `%${q.trim()}%`;
            whereParts.push(
                `(sc.first_name ILIKE $${idx} OR sc.last_name ILIKE $${idx} OR sc.phone ILIKE $${idx})`
            );
            params.push(like);
            idx++;
        }

        const whereSql = "WHERE " + whereParts.join(" AND ");

        // liczba wszystkich wyników
        const countRes = await pool.query(
            `SELECT COUNT(*) AS total FROM salon_clients sc ${whereSql}`,
            params
        );

        const total = Number(countRes.rows[0]?.total || 0);

        // właściwa lista klientów
        const listRes = await pool.query(
            `
            SELECT
                sc.id,
                sc.employee_id,
                sc.first_name,
                sc.last_name,
                sc.phone,
                sc.created_at,
                sc.first_appointment_id
            FROM salon_clients sc
            ${whereSql}
            ORDER BY sc.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
            `,
            [...params, lim, offset]
        );

        res.json({
            items: listRes.rows,
            total,
            page: pageNum,
            limit: lim,
        });
    })
);
app.get(
    "/api/clients/:id",
    verifyToken,
    asyncHandler(async (req, res) => {
        const clientLocalId = Number(req.params.id);

        if (!clientLocalId) {
            return res.status(400).json({ error: "Nieprawidłowe id klienta" });
        }

        // 1) Pobranie klienta
        const clientRes = await pool.query(
            `
            SELECT
                sc.*,
                u.email
            FROM salon_clients sc
            LEFT JOIN users u ON u.uid = sc.client_uid
            WHERE sc.id = $1
            `,
            [clientLocalId]
        );

        if (!clientRes.rows.length) {
            return res.status(404).json({ error: "Klient nie istnieje" });
        }

        const client = clientRes.rows[0];
        const salonId = client.salon_id;
        const clientUid = client.client_uid || null;

        // 2) NADCHODZĄCE — WSZYSTKIE booked
        const upcomingRes = await pool.query(
            `
            SELECT 
                a.*,
                e.name AS employee_name,
                s.name AS service_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'addon_id', sa.id,
                            'addon_name', sa.name,
                            'addon_price', sa.price,
                            'addon_duration', sa.duration_minutes
                        )
                    ) FILTER (WHERE sa.id IS NOT NULL),
                    '[]'
                ) AS addons
            FROM appointments a
            JOIN employees e ON e.id = a.employee_id
            JOIN services  s ON s.id = a.service_id
            LEFT JOIN appointment_addons aa ON aa.appointment_id = a.id
            LEFT JOIN service_addons sa ON aa.addon_id = sa.id
            WHERE a.salon_id = $1
              AND (
                    a.client_local_id = $2
                    OR ($3::text IS NOT NULL AND a.client_uid = $3)
                  )
              AND a.status = 'booked'
            GROUP BY a.id, e.name, s.name
            ORDER BY a.date ASC, a.start_time ASC
            `,
            [salonId, clientLocalId, clientUid]
        );

        // 3) ZAKOŃCZONE — WSZYSTKO CO NIE BOOKED
        const pastRes = await pool.query(
            `
            SELECT 
                a.*,
                e.name AS employee_name,
                s.name AS service_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'addon_id', sa.id,
                            'addon_name', sa.name,
                            'addon_price', sa.price,
                            'addon_duration', sa.duration_minutes
                        )
                    ) FILTER (WHERE sa.id IS NOT NULL),
                    '[]'
                ) AS addons
            FROM appointments a
            JOIN employees e ON e.id = a.employee_id
            JOIN services  s ON s.id = a.service_id
            LEFT JOIN appointment_addons aa ON aa.appointment_id = a.id
            LEFT JOIN service_addons sa ON aa.addon_id = sa.id
            WHERE a.salon_id = $1
              AND (
                    a.client_local_id = $2
                    OR ($3::text IS NOT NULL AND a.client_uid = $3)
                  )
              AND a.status != 'booked'
            GROUP BY a.id, e.name, s.name
            ORDER BY a.date DESC, a.start_time DESC
            LIMIT 200
            `,
            [salonId, clientLocalId, clientUid]
        );

        // 4) Odpowiedź
        res.json({
            client: {
                id: client.id,
                salon_id: client.salon_id,
                employee_id: client.employee_id,
                client_uid: client.client_uid,
                first_name: client.first_name,
                last_name: client.last_name,
                phone: client.phone,
                email: client.email || null,
                created_at: client.created_at,
                first_appointment_id: client.first_appointment_id,
            },
            upcoming_appointments: upcomingRes.rows,
            past_appointments: pastRes.rows,
        });
    })
);





app.post(
    "/api/clients/create",
    verifyToken,
    asyncHandler(async (req, res) => {
        let { salon_id, employee_ids, first_name, last_name, phone } = req.body;

        // -------------------------------------------------------
        // 1) KONWERSJA I AUTO-DETEKCJA SALONU
        // -------------------------------------------------------
        salon_id = Number(salon_id);

        // Jeśli salon_id nie przyszło z frontu → sprawdzamy czy user jest pracownikiem
        if (!salon_id) {
            const emp = await pool.query(
                "SELECT salon_id FROM employees WHERE uid = $1 LIMIT 1",
                [req.user.uid]
            );

            if (emp.rows.length > 0) {
                salon_id = emp.rows[0].salon_id; // zwykły pracownik
            }
        }

        // Jeśli nadal brak → provider NIE wybrał salonu
        if (!salon_id) {
            return res.status(400).json({ error: "Brak salon_id" });
        }

        // -------------------------------------------------------
        // 2) WALIDACJE
        // -------------------------------------------------------
        if (!Array.isArray(employee_ids) || employee_ids.length === 0)
            return res.status(400).json({ error: "Musisz wybrać przynajmniej jednego pracownika" });

        if (!first_name || !last_name)
            return res.status(400).json({ error: "Imię i nazwisko są wymagane" });

        const phoneTrimmed = String(phone || "").trim();
        if (phoneTrimmed.length > 0 && !/^[0-9]{9}$/.test(phoneTrimmed)) {
            return res.status(400).json({ error: "Numer telefonu musi mieć 9 cyfr" });
        }

        // -------------------------------------------------------
        // 3) SPRAWDZANIE DUPLIKATU TELEFONU
        // -------------------------------------------------------
        const existing = await pool.query(
            `
            SELECT 
                id, first_name, last_name, phone, employee_id
            FROM salon_clients 
            WHERE salon_id = $1 AND phone = $2
            `,
            [salon_id, phoneTrimmed]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: "Klient z takim numerem telefonu już istnieje",
                existing_clients: existing.rows
            });
        }

        // -------------------------------------------------------
        // 4) TWORZENIE KLIENTÓW – po jednym per employee_id
        // -------------------------------------------------------
        const createdClients = [];

        for (const empId of employee_ids) {
            const insertRes = await pool.query(
                `
                INSERT INTO salon_clients (
                    salon_id,
                    employee_id,
                    client_uid,
                    first_name,
                    last_name,
                    phone,
                    created_at
                )
                VALUES ($1, $2, NULL, $3, $4, $5, NOW())
                RETURNING id, salon_id, employee_id, first_name, last_name, phone, created_at
                `,
                [salon_id, empId, first_name, last_name, phoneTrimmed]
            );

            createdClients.push(insertRes.rows[0]);
        }

        // -------------------------------------------------------
        // 5) ODPOWIEDŹ
        // -------------------------------------------------------
        res.json({
            success: true,
            created: createdClients
        });
    })
);







// Get appointments for client
app.get(
    "/api/appointments/mine",
    verifyToken,
    asyncHandler(async (req, res) => {
        if (!req.user?.uid) return res.status(401).json({ error: "Brak autoryzacji" });
        const result = await pool.query(
            `
      SELECT 
        a.*, 
        s.name AS service_name, 
        s.price AS service_price, 
        e.name AS employee_name,
        COALESCE(
          json_agg(
            json_build_object(
              'addon_id', sa.id,
              'addon_name', sa.name,
              'addon_price', sa.price,
              'addon_duration', sa.duration_minutes
            )
          ) FILTER (WHERE sa.id IS NOT NULL),
          '[]'
        ) AS addons
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN appointment_addons aa ON aa.appointment_id = a.id
      LEFT JOIN service_addons sa ON aa.addon_id = sa.id
      WHERE a.client_uid = $1
      GROUP BY a.id, s.name, s.price, e.name
      ORDER BY a.date DESC, a.start_time DESC;
      `,
            [req.user.uid]
        );
        res.json(result.rows);
    })
);





// Get employees for owner's salon
app.get(
    "/api/employees/mine",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { salon_id } = req.query;
        if (!salon_id) return res.status(400).json({ error: "Brak salon_id w zapytaniu" });
        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz dostępu do tego salonu" });

        const result = await pool.query(
            `SELECT id, name, email, phone, description, image_url, is_active, created_at
       FROM employees WHERE salon_id = $1 ORDER BY created_at DESC`,
            [salon_id]
        );
        res.json(result.rows);
    })
);

// Public services list
app.get(
    "/api/services/public",
    verifyToken,
    asyncHandler(async (req, res) => {
        const cached = cache.get("services_public");
        if (cached) return res.json(cached);
        const result = await pool.query("SELECT * FROM services WHERE is_active = true ORDER BY name");
        cache.set("services_public", result.rows, 60_000); // 60s
        res.json(result.rows);
    })
);

// Public employees list
app.get(
    "/api/employees/public",
    verifyToken,
    asyncHandler(async (req, res) => {
        const result = await pool.query("SELECT id, name, description FROM employees WHERE is_active = true ORDER BY name");
        res.json(result.rows);
    })
);

// employees by service (client)
app.get(
    "/api/employees/by-service/:serviceId",
    asyncHandler(async (req, res) => {
        const { serviceId } = req.params;
        const result = await pool.query(
            `SELECT e.id, e.name, e.description, e.image_url
       FROM employees e
       JOIN employee_services es ON es.employee_id = e.id
       WHERE es.service_id = $1 AND e.is_active = true
       ORDER BY e.name;`,
            [serviceId]
        );
        res.json(result.rows);
    })
);

// Create service addon
app.post(
    "/api/service-addons",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { name, duration_minutes, price, description, service_ids, salon_id } = req.body;
        const salonCheck = await pool.query("SELECT id FROM salons WHERE id = $1 AND owner_uid = $2", [salon_id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Nie masz uprawnień do tego salonu" });

        const addonRes = await pool.query(`INSERT INTO service_addons (salon_id, name, duration_minutes, price, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [salon_id, name, duration_minutes, price, description]);
        const addonId = addonRes.rows[0].id;

        if (Array.isArray(service_ids) && service_ids.length > 0) {
            const promises = service_ids.map((sid) => pool.query(`INSERT INTO service_addon_links (service_id, addon_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sid, addonId]));
            await Promise.all(promises);
        }

        res.json({ message: "✅ Dodano usługę dodatkową", addon_id: addonId });
    })
);

// All addons for salon (owner)
app.get(
    "/api/service-addons/all",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const salonId = req.query.salon_id ? Number(req.query.salon_id) : await getOwnerSalonId(req.user.uid);
        const result = await pool.query(
            `SELECT a.*, COALESCE(json_agg(s.name) FILTER (WHERE s.id IS NOT NULL), '[]') AS linked_services
       FROM service_addons a
       LEFT JOIN service_addon_links l ON a.id = l.addon_id
       LEFT JOIN services s ON l.service_id = s.id
       WHERE a.salon_id = $1
       GROUP BY a.id
       ORDER BY a.name;`,
            [salonId]
        );
        res.json(result.rows);
    })
);

// Edit service (already declared above as put /api/services/:id) - duplicate avoided

// Delete service
app.delete(
    "/api/services/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(
            `DELETE FROM services WHERE id=$1 AND salon_id IN (SELECT id FROM salons WHERE owner_uid = $2) RETURNING id`,
            [id, req.user.uid]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Nie znaleziono usługi lub brak uprawnień" });
        res.json({ message: "🗑️ Usługa usunięta" });
    })
);

// Edit addon
app.put(
    "/api/service-addons/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, duration_minutes, price, description } = req.body;
        const addonCheck = await pool.query(`SELECT a.id FROM service_addons a JOIN salons s ON a.salon_id = s.id WHERE a.id = $1 AND s.owner_uid = $2`, [id, req.user.uid]);
        if (addonCheck.rows.length === 0) return res.status(403).json({ error: "Brak uprawnień do tego dodatku" });
        const result = await pool.query(`UPDATE service_addons SET name=$1, duration_minutes=$2, price=$3, description=$4 WHERE id=$5 RETURNING *`, [name, duration_minutes, price, description, id]);
        res.json({ message: "✅ Dodatek zaktualizowany", addon: result.rows[0] });
    })
);

// Delete addon
app.delete(
    "/api/service-addons/:id",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(`DELETE FROM service_addons WHERE id=$1 AND salon_id IN (SELECT id FROM salons WHERE owner_uid = $2) RETURNING id`, [id, req.user.uid]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Nie znaleziono dodatku lub brak uprawnień" });
        res.json({ message: "🗑️ Dodatek usunięty" });
    })
);

// Get addons for service (client)
app.get(
    "/api/service-addons/by-service/:serviceId",
    verifyToken,
    asyncHandler(async (req, res) => {
        const { serviceId } = req.params;
        const result = await pool.query(
            `SELECT a.* FROM service_addons a JOIN service_addon_links l ON a.id = l.addon_id WHERE l.service_id = $1 AND a.is_active = true ORDER BY a.name`,
            [serviceId]
        );
        res.json(result.rows);
    })
);

// Public salons list
app.get(
    "/api/salons/public",
    asyncHandler(async (req, res) => {
        const cached = cache.get("salons_public");
        if (cached) return res.json(cached);
        const result = await pool.query(`SELECT id, name, city, street, street_number, phone, description, image_url FROM salons WHERE is_active = true ORDER BY name`);
        cache.set("salons_public", result.rows, 60_000);
        res.json(result.rows);
    })
);

// Services by salon
app.get(
    "/api/services/by-salon/:salonId",
    asyncHandler(async (req, res) => {
        const { salonId } = req.params;
        const result = await pool.query(
            `SELECT s.id, s.name, s.duration_minutes, s.price, s.description, s.image_url, s.is_active, s.created_at,
              COALESCE(json_agg(es.employee_id) FILTER (WHERE es.employee_id IS NOT NULL), '[]') AS employee_ids
       FROM services s
       LEFT JOIN employee_services es ON es.service_id = s.id
       WHERE s.salon_id = $1 AND s.is_active = true
       GROUP BY s.id
       ORDER BY s.name;`,
            [salonId]
        );
        res.json(result.rows);
    })
);

// Single service
app.get(
    "/api/service/:id",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(`SELECT id, salon_id, name, duration_minutes, price, description, image_url, is_active FROM services WHERE id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Nie znaleziono usługi" });
        res.json(result.rows[0]);
    })
);

// Owner's salons list
app.get(
    "/api/salons/mine/all",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const result = await pool.query("SELECT * FROM salons WHERE owner_uid = $1 ORDER BY created_at DESC", [req.user.uid]);
        res.json(result.rows);
    })
);

// Categories
app.get(
    "/api/categories",
    asyncHandler(async (req, res) => {
        const result = await pool.query("SELECT * FROM categories ORDER BY name");
        res.json(result.rows);
    })
);

// Assign categories to salon
app.post(
    "/api/salons/:id/categories",
    verifyToken,
    requireProviderRole,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { category_ids } = req.body;
        if (!Array.isArray(category_ids)) return res.status(400).json({ error: "category_ids musi być tablicą" });

        const salonCheck = await pool.query("SELECT id FROM salons WHERE id=$1 AND owner_uid=$2", [id, req.user.uid]);
        if (salonCheck.rows.length === 0) return res.status(403).json({ error: "Brak uprawnień do salonu" });

        await pool.query("DELETE FROM salon_categories WHERE salon_id=$1", [id]);
        const promises = category_ids.map((catId) => pool.query(`INSERT INTO salon_categories (salon_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, catId]));
        await Promise.all(promises);

        res.json({ message: "✅ Kategorie przypisane do salonu" });
    })
);

// Get categories for salon
app.get(
    "/api/salons/:id/categories",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await pool.query(`SELECT c.id, c.name FROM salon_categories sc JOIN categories c ON c.id = sc.category_id WHERE sc.salon_id = $1 ORDER BY c.name`, [id]);
        res.json(result.rows);
    })
);

// -------------------- Heavy endpoint: /api/appointments/unavailable-days --------------------
app.get(
    "/api/appointments/unavailable-days",
    asyncHandler(async (req, res) => {
        console.time("/api/appointments/unavailable-days");
        const { service_id, employee_id, year, month } = req.query;
        if (!service_id && !employee_id) return res.status(400).json({ error: "Brak service_id lub employee_id" });
        if (!year || !month) return res.status(400).json({ error: "Brak parametru year lub month" });

        const cacheKey = `unavail:${service_id ?? "any"}:${employee_id ?? "any"}:${year}:${month}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log("🔁 cache hit -> /unavailable-days");
            console.timeEnd("/api/appointments/unavailable-days");
            return res.json(cached);
        }

        const dateRangeSQL = `
      WITH month_days AS (
        SELECT generate_series(
          make_date($1::int, $2::int, 1),
          (make_date($1::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date,
          interval '1 day'
        ) AS date
      )
    `;

        if (employee_id) {
            const query = `
        , emp AS ( SELECT id, salon_id FROM employees WHERE id = $3 ),
        schedule AS ( SELECT day_of_week, open_time, close_time, is_day_off FROM employee_schedule WHERE employee_id = $3 ),
        holidays AS ( SELECT date FROM salon_holidays WHERE salon_id = (SELECT salon_id FROM emp) ),
        vacations AS ( SELECT start_date, end_date FROM employee_vacations WHERE employee_id = $3 ),
        appointments_summary AS (
          SELECT date, SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS booked_minutes
          FROM appointments
          WHERE employee_id = $3 AND status = 'booked'
          GROUP BY date
        )
        SELECT to_char(d.date, 'YYYY-MM-DD') AS date
        FROM month_days d
        WHERE
          d.date IN (SELECT date FROM holidays)
          OR EXISTS (SELECT 1 FROM vacations v WHERE d.date BETWEEN v.start_date AND v.end_date)
          OR (EXTRACT(DOW FROM d.date) IN (SELECT day_of_week FROM schedule WHERE is_day_off = true))
          OR (
            (SELECT SUM(EXTRACT(EPOCH FROM (close_time - open_time)) / 60) FROM schedule s WHERE s.day_of_week = EXTRACT(DOW FROM d.date))
            <= COALESCE((SELECT booked_minutes FROM appointments_summary a WHERE a.date = d.date), 0)
          )
        ORDER BY date;
      `;
            const result = await pool.query(`${dateRangeSQL}${query}`, [year, month, employee_id]);
            const out = result.rows.map((r) => r.date);
            cache.set(cacheKey, out, 20_000);
            console.timeEnd("/api/appointments/unavailable-days");
            return res.json(out);
        }

        // any employee (service-based)
        const employeesRes = await pool.query(
            `SELECT e.id, e.salon_id FROM employees e JOIN employee_services es ON es.employee_id = e.id WHERE es.service_id = $1 AND e.is_active = true`,
            [service_id]
        );
        if (employeesRes.rows.length === 0) {
            console.timeEnd("/api/appointments/unavailable-days");
            return res.json([]);
        }

        const employees = employeesRes.rows;
        const salonId = employees[0].salon_id;

        const holidaysRes = await pool.query(`SELECT to_char(date,'YYYY-MM-DD') AS date FROM salon_holidays WHERE salon_id = $1`, [salonId]);
        const holidays = holidaysRes.rows.map((r) => r.date);

        const unavailableMap = new Map();
        // parallelize per-employee availability check
        await Promise.all(
            employees.map(async (emp) => {
                const q = await pool.query(
                    `${dateRangeSQL}
          SELECT to_char(d.date, 'YYYY-MM-DD') AS date
          FROM month_days d
          WHERE
            d.date IN (SELECT date FROM salon_holidays WHERE salon_id = $4)
            OR EXISTS (SELECT 1 FROM employee_vacations v WHERE v.employee_id = $3 AND d.date BETWEEN v.start_date AND v.end_date)
            OR (EXTRACT(DOW FROM d.date) IN (SELECT day_of_week FROM employee_schedule WHERE employee_id = $3 AND is_day_off = true))
            OR (
              (SELECT SUM(EXTRACT(EPOCH FROM (close_time - open_time)) / 60)
               FROM employee_schedule s
               WHERE s.employee_id = $3 AND s.day_of_week = EXTRACT(DOW FROM d.date)
              ) <= COALESCE((
                SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
                FROM appointments a
                WHERE a.employee_id = $3 AND a.date = d.date AND a.status = 'booked'
              ), 0)
            )`,
                    [year, month, emp.id, salonId]
                );

                q.rows.forEach((r) => {
                    const dateStr = r.date;
                    unavailableMap.set(dateStr, (unavailableMap.get(dateStr) || 0) + 1);
                });
            })
        );

        const totalEmps = employees.length;
        const fullyUnavailable = [...holidays];
        for (const [dateStr, count] of unavailableMap.entries()) {
            if (count === totalEmps) fullyUnavailable.push(dateStr);
        }
        const unique = [...new Set(fullyUnavailable)];
        cache.set(cacheKey, unique, 30_000);
        console.timeEnd("/api/appointments/unavailable-days");
        res.json(unique);
    })
);

// -------------------- Remaining CRUD endpoints repeated earlier (delete/edit etc.) --------------------
// Many of these are already implemented above; if there are duplicates in your original file,
// the routes above will match the original names/behavior. (Kept semantics identical.)

// Test root
//app.get("/", (req, res) => res.send("🚀 Backend (optimized local) działa poprawnie"));
// -------------------- Serve React frontend --------------------
const frontendPath = path.join(__dirname, "..", "frontend", "dist");
console.log("📁 Szukam frontendu w:", frontendPath);

if (!fs.existsSync(frontendPath)) {
    console.error("❌ Folder frontend/dist nie istnieje!");
} else {
    console.log("✅ Folder frontend/dist znaleziony:", fs.readdirSync(frontendPath));

    // 🔹 Serwowanie statycznych plików Reacta
    app.use(express.static(frontendPath));

    // 🔹 Fallback dla React Router (Express 5 kompatybilny)
    app.use((req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        res.sendFile(path.join(frontendPath, "index.html"));
    });
}
// -------------------- WebSocket (Socket.IO) + Start server --------------------
import http from "http";
import { Server } from "socket.io";

// Tworzymy serwer HTTP na bazie Expressa
const server = http.createServer(app);

// Inicjalizujemy Socket.IO — STABILNA KONFIGURACJA
const io = new Server(server, {
    cors: {
        origin: "*",              // lub: "http://192.168.0.4:5173"
        methods: ["GET", "POST"],
        credentials: true
    },

    // 🔥 WebSocket ONLY — brak fallbacku na polling → zero błędów 400
    transports: ["websocket"],

    // Stabilność połączenia (mobile/minimalizacja)
    pingInterval: 25000,
    pingTimeout: 60000,
});

// Logi połączeń
io.on("connection", (socket) => {
    console.log("🟢 Użytkownik połączony:", socket.id);

    socket.on("disconnect", (reason) => {
        console.log("🔴 Użytkownik rozłączony:", socket.id, "Powód:", reason);
    });
});

export { io };

// Start serwera HTTP + WebSocket
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server działa z WebSocket na http://0.0.0.0:${PORT}`);
});
