// server_optimized.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import pkg from "pg";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { pathToRegexp } from "path-to-regexp";

dotenv.config();
const { Pool } = pkg;










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
  ssl: { rejectUnauthorized: false }, // zawsze SSL, Render tego wymaga
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

  console.log("✅ Tables and indexes ensured");
};

// run initTables but don't block app start too long — log errors if any
initTables().catch((err) => console.error("❌ initTables error:", err));

// -------------------- Middleware: verifyToken --------------------
const verifyToken = asyncHandler(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(" ")[1];
    if (!firebaseInitialized) {
      // fallback: if firebase not initialized (local dev), try to decode minimal info or skip
      console.warn("⚠️ Firebase admin not initialized; skipping token verification");
      req.user = null;
      return next();
    }
    const decoded = await admin.auth().verifyIdToken(token);
    // try local DB for user
    const userResult = await pool.query("SELECT * FROM users WHERE uid = $1 LIMIT 1", [decoded.uid]);
    if (userResult.rows.length === 0) {
      req.user = { uid: decoded.uid, email: decoded.email, role: "guest" };
    } else {
      req.user = userResult.rows[0];
    }
    next();
  } catch (err) {
    console.warn("verifyToken warning — token invalid or verification failed:", err && err.message ? err.message : err);
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

// Auth: me
app.get(
  "/api/auth/me",
  verifyToken,
  asyncHandler(async (req, res) => {
    if (!req.user?.uid) return res.status(401).json({ error: "Brak użytkownika" });

    const existing = await pool.query("SELECT * FROM users WHERE uid = $1", [req.user.uid]);
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // fetch from firebase user if possible
    if (!firebaseInitialized) {
      return res.json({ uid: req.user.uid, email: req.user.email, name: req.user.name || "Użytkownik", role: "client" });
    }

    const fbUser = await admin.auth().getUser(req.user.uid);
    const newUser = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: fbUser.displayName || "Użytkownik",
      role: "client",
    };

    await pool.query(
      "INSERT INTO users (uid, email, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [newUser.uid, newUser.email, newUser.name, newUser.role]
    );

    res.json(newUser);
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

      // 🔹 Znajdź salon zalogowanego użytkownika
      const empRes = await pool.query(
        "SELECT salon_id FROM employees WHERE uid = $1 LIMIT 1",
        [uid]
      );
      if (empRes.rows.length === 0)
        return res.status(403).json({ error: "Nie znaleziono przypisanego salonu" });

      const salonId = empRes.rows[0].salon_id;
      const date =
        req.query.date ||
        new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
      const dayOfWeek = new Date(date).getDay();

      // ✅ Cache 10 minut dla stałych danych
      const cacheKey = `salon_${salonId}`;
      const cacheTTL = 10 * 60 * 1000;
      let baseData = salonCache.get(cacheKey);
      const isExpired = !baseData || Date.now() - baseData.ts > cacheTTL;

      if (isExpired) {
        console.log("♻️ Odświeżanie danych stałych dla salonu", salonId);

        // ⭐ MUSI BYĆ 5 ELEMENTÓW — W TYM timeOffRes
        const [
          holidaysRes,
          vacationsRes,
          timeOffRes,
          scheduleRes,
          employeesRes
        ] = await Promise.all([
          pool.query("SELECT date FROM salon_holidays WHERE salon_id=$1", [salonId]),

          pool.query(
            `SELECT employee_id, start_date, end_date 
             FROM employee_vacations 
             WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)`,
            [salonId]
          ),

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

        // ⭐ Nie cache’ujemy timeOff — to dane dynamiczne
        baseData = {
          holidays: holidaysRes.rows,
          vacations: vacationsRes.rows,
          schedule: scheduleRes.rows,
          employees: employeesRes.rows,
          ts: Date.now(),
        };

        salonCache.set(cacheKey, baseData);
      }

      // ⭐ Zawsze świeże rezerwacje
      const appointmentsRes = await pool.query(
        `SELECT 
          a.id, a.employee_id, a.date::date AS date,
          a.start_time, a.end_time,
          COALESCE(u.name, 'Klient') AS client_name,
          COALESCE(s.name, 'Usługa') AS service_name,
          COALESCE(STRING_AGG(sa.name, ', ' ORDER BY sa.name), '') AS addons
         FROM appointments a
         LEFT JOIN users u ON a.client_uid=u.uid
         LEFT JOIN services s ON a.service_id=s.id
         LEFT JOIN appointment_addons aa ON a.id=aa.appointment_id
         LEFT JOIN service_addons sa ON aa.addon_id=sa.id
         WHERE a.salon_id=$1 
           AND a.date=$2
           AND a.status!='cancelled'
         GROUP BY a.id,a.employee_id,a.date,a.start_time,a.end_time,u.name,s.name
         ORDER BY a.start_time ASC`,
        [salonId, date]
      );

      // ⭐ Zawsze świeże BLOCKED TIME (time_off)
      const timeOffFresh = await pool.query(
        `SELECT id, employee_id, date, start_time, end_time, reason
         FROM employee_time_off
         WHERE employee_id IN (SELECT id FROM employees WHERE salon_id=$1)
           AND date=$2`,
        [salonId, date]
      );

      const isHoliday = baseData.holidays.some(
		  (h) => toYMD(h.date) === date
		);


      // 🔹 Zbuduj strukturę pracowników (wizyta, blokada, grafik)
      const employees = baseData.employees.map((emp) => {
        const schedule = baseData.schedule.find(
          (s) =>
            Number(s.employee_id) === Number(emp.employee_id) &&
            Number(s.day_of_week) === Number(dayOfWeek)
        );

        const isVacation = baseData.vacations.some((v) => {
  if (Number(v.employee_id) !== Number(emp.employee_id)) return false;

  const start = new Date(v.start_date);
  const end = new Date(v.end_date);

  // ⭐ KLUCZOWE — ustaw koniec urlopu na 23:59:59
  end.setHours(23, 59, 59, 999);

  const current = new Date(date);

  return current >= start && current <= end;
});


        const isDayOff = isHoliday || isVacation || schedule?.is_day_off;

        return {
		  employee_id: emp.employee_id,
		  employee_name: emp.employee_name,
		  employee_image_url: emp.employee_image_url,
		  is_active: emp.is_active,   // ⭐ DODAJ TO ❗❗❗

		  day_off: isDayOff,

		  working_hours: {
			open: schedule?.open_time?.slice(0, 5) || "09:00",
			close: schedule?.close_time?.slice(0, 5) || "17:00",
		  },
	vacations: baseData.vacations.filter(
		(v) => Number(v.employee_id) === Number(emp.employee_id)
	  ),
		  // ⭐ świeże rezerwacje
		  appointments: appointmentsRes.rows.filter(
			(a) => a.employee_id === emp.employee_id
		  ),

		  // ⭐ świeże przerwy / blokady czasu
		  time_off: timeOffFresh.rows
			.filter((t) => Number(t.employee_id) === Number(emp.employee_id))
			.map((t) => ({
			  ...t,
			  id: t.id,
			  time_off_id: t.id,
			  employee_id: emp.employee_id,
			})),
		};

      });

      res.json({ date, employees });

    } catch (error) {
      console.error("❌ Błąd /api/calendar/shared:", error);
      res.status(500).json({ error: error.message });
    }
  })
);


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
        return res
          .status(400)
          .json({ error: "Brak daty — nie można zapisać zmiany" });

      // 🔹 Znajdź salon pracownika
      const salonRes = await pool.query(
        "SELECT salon_id FROM employees WHERE uid=$1 LIMIT 1",
        [uid]
      );
      if (salonRes.rows.length === 0)
        return res
          .status(404)
          .json({ error: "Nie znaleziono przypisanego salonu" });

      const salonId = salonRes.rows[0].salon_id;

      // 🔹 Sprawdź, czy wizyta należy do salonu
      const check = await pool.query(
        "SELECT * FROM appointments WHERE id=$1 AND salon_id=$2",
        [id, salonId]
      );
      if (check.rows.length === 0)
        return res
          .status(404)
          .json({ error: "Nie znaleziono wizyty w tym salonie" });

      // 🔹 Sprawdzenie konfliktu wizyt
      if (!force) {
        const conflict = await pool.query(
          `SELECT 
  a.id, u.name AS client_name, s.name AS service_name
FROM appointments a
LEFT JOIN users u ON a.client_uid=u.uid
LEFT JOIN services s ON a.service_id=s.id
WHERE a.employee_id=$1
  AND a.date=$2
  AND a.status NOT IN ('cancelled')

  AND a.id::text!=$5::text
  AND ((a.start_time, a.end_time) OVERLAPS ($3::time, $4::time))

`,
          [employee_id, date, start_time, end_time, id]
        );
        if (conflict.rows.length > 0)
          return res.status(409).json({
            error: "Termin koliduje z inną wizytą tego pracownika",
            conflicts: conflict.rows,
          });
      }

      // 🔹 Aktualizuj termin
      const updated = await pool.query(
        `UPDATE appointments
         SET employee_id=$1, date=$2, start_time=$3, end_time=$4, changed_at=NOW()
         WHERE id=$5 AND salon_id=$6
         RETURNING *`,
        [employee_id, date, start_time, end_time, id, salonId]
      );
      if (updated.rowCount === 0)
        return res.status(404).json({ error: "Nie udało się zaktualizować" });

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

    // 🔹 Pobierz dane wizyty wraz z klientem, pracownikiem, usługą i dodatkami
    const apptRes = await pool.query(
      `
      SELECT 
        a.*, 
        u.name AS client_name,
        u.phone AS client_phone,
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
      LEFT JOIN employees e ON a.employee_id = e.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN appointment_addons aa ON a.id = aa.appointment_id
      LEFT JOIN service_addons sa ON aa.addon_id = sa.id
      WHERE a.id = $1
      GROUP BY a.id, u.name, u.phone, e.name, s.name, s.price, s.salon_id;
      `,
      [id]
    );

    if (apptRes.rows.length === 0) {
      return res.status(404).json({ error: "Nie znaleziono wizyty" });
    }

    const appointment = apptRes.rows[0];
    const salonId = appointment.salon_id;

    // 🔹 Pobierz dostępnych pracowników, usługi i dodatki (z prawidłowym powiązaniem przez service_addon_links)
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

    // 🔹 Opcjonalnie: log, żeby potwierdzić unikalność dodatków
    console.log("🔹 Ilość dodatków:", addonsRes.rows.length);

    // 🔹 Zwrot danych do frontu
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
          COALESCE(u.name, 'Klient') AS client_name,
          COALESCE(s.name, 'Usługa') AS service_name,
          COALESCE(STRING_AGG(sa.name, ', ' ORDER BY sa.name), '') AS addons
         FROM appointments a
         LEFT JOIN users u ON a.client_uid=u.uid
         LEFT JOIN services s ON a.service_id=s.id
         LEFT JOIN appointment_addons aa ON a.id = aa.appointment_id
         LEFT JOIN service_addons sa ON aa.addon_id = sa.id
         WHERE a.salon_id=$1
           AND a.date BETWEEN $2 AND $3
           AND a.status!='cancelled'
         GROUP BY a.id,a.employee_id,a.date,a.start_time,a.end_time,u.name,s.name
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

    // 🔹 Walidacja wejścia
    if (!client_id || !employee_id || !service_id || !date || !start_time || !end_time) {
      return res.status(400).json({ error: "Brak wymaganych danych" });
    }

    // 🔹 Sprawdź salon pracownika
    const empRes = await pool.query(
      "SELECT salon_id, name FROM employees WHERE id = $1",
      [employee_id]
    );

    if (empRes.rows.length === 0)
      return res.status(404).json({ error: "Nie znaleziono pracownika" });

    const salon_id = empRes.rows[0].salon_id;

    // 🔹 Pobierz UID klienta (bo appointments trzyma client_uid)
    const userRes = await pool.query(
      "SELECT uid FROM users WHERE id = $1",
      [client_id]
    );

    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "Nie znaleziono klienta" });

    const client_uid = userRes.rows[0].uid;

    // 🔹 Transakcja zapisu
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 🔸 Dodaj wizytę
      const newApptRes = await client.query(
        `
        INSERT INTO appointments 
          (client_uid, employee_id, service_id, date, start_time, end_time, created_at)
        VALUES 
          ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *;
        `,
        [client_uid, employee_id, service_id, date, start_time, end_time]
      );

      const newAppointment = newApptRes.rows[0];
      const appointment_id = newAppointment.id;

      // 🔸 Dodaj dodatki
      if (addons.length > 0) {
        const values = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
        const params = [appointment_id, ...addons.map(Number)];

        await client.query(
          `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`,
          params
        );
      }

      await client.query("COMMIT");

      // 📡 Socket.io: powiadom o nowej wizycie
      io.emit("calendar_updated", {
        type: "create",
        salon_id,
        appointment: newAppointment,
      });

      // 🔹 Zwróć rezultat
      res.json({
        message: "✅ Wizyta została utworzona",
        appointment: newAppointment,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Błąd podczas tworzenia wizyty:", err);
      return res.status(500).json({ error: "Błąd podczas tworzenia wizyty" });
    } finally {
      client.release();
    }
  })
);
















app.post("/api/appointments/create-from-panel", async (req, res) => {

  const client = await pool.connect();
  try {
    const {
      client_id,     // user = client
      employee_id,
      service_id,
      addons = [],
      date,
      start_time,
      end_time,
    } = req.body;

    const salon_id = req.user.salon_id; // z Twojego auth middleware

    if (!client_id || !employee_id || !service_id || !date || !start_time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

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

    // --- 5. Add addons -----------------------------
    if (addons.length > 0) {
      const values = addons.map(a => `(${appointment_id}, ${a})`).join(",");
      await client.query(
        `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES ${values}`
      );
    }

    await client.query("COMMIT");

    // --- 6. Notify calendars (Twój system SSE + events) ----
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
app.get("/api/schedule/time-off", verifyToken, requireEmployeeOrProviderRole, asyncHandler(async (req, res) => {
  const salonId = await getOwnerSalonId(req.user.uid);
  if (!salonId) return res.status(403).json({ error: "Brak przypisanego salonu" });

  const result = await pool.query(`
    SELECT t.*, e.name AS employee_name
    FROM employee_time_off t
    JOIN employees e ON e.id = t.employee_id
    WHERE e.salon_id = $1
    ORDER BY t.date, t.start_time;
  `, [salonId]);

  res.json(result.rows);
}));

// ➕ Dodaj nową blokadę czasu
app.post("/api/schedule/time-off", verifyToken, requireEmployeeOrProviderRole, asyncHandler(async (req, res) => {
  const { employee_id, date, start_time, end_time, reason } = req.body;

  if (!employee_id || !date || !start_time || !end_time)
    return res.status(400).json({ error: "Brak wymaganych pól" });

  await pool.query(`
    INSERT INTO employee_time_off (employee_id, date, start_time, end_time, reason)
    VALUES ($1, $2, $3, $4, $5)
  `, [employee_id, date, start_time, end_time, reason || null]);

  res.json({ message: "✅ Zablokowano czas pracownika" });
}));

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
      io.emit("calendar_updated", { type: "delete_time_off", time_off_id: id, employee_id: deleted.employee_id });
      console.log("📡 Wysłano calendar_updated (DELETE time_off):", id);
    } catch (emitErr) {
      console.warn("⚠️ Nie udało się wysłać socket eventu po usunięciu time_off:", emitErr);
    }

    res.json({ message: "🗑️ Blokada czasu usunięta", deleted_id: id });
  })
);


// ✏️ Edytuj blokadę czasu
app.put("/api/schedule/time-off/:id", verifyToken, requireEmployeeOrProviderRole, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, start_time, end_time, reason, employee_id } = req.body;

  const result = await pool.query(`
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
  `, [date, start_time, end_time, reason, employee_id, id, req.user.uid]);

  if (result.rowCount === 0)
    return res.status(404).json({ error: "Nie znaleziono blokady lub brak uprawnień" });

  res.json({ message: "✅ Blokada czasu zaktualizowana", time_off: result.rows[0] });
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

    const client = await pool.connect();

    try {
      // 1️⃣ Transakcja z maksymalnym bezpieczeństwem
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");

      // 2️⃣ Limit czekania — maksymalnie 1 sekunda
      await client.query("SET LOCAL lock_timeout = '1s'");

      // 3️⃣ Blokujemy wszystkie rezerwacje tego dnia dla danego pracownika
      await client.query(
        `SELECT id FROM appointments 
         WHERE employee_id = $1 AND date = $2 
         FOR UPDATE`,
        [employee_id, date]
      );

      // 4️⃣ Sprawdź konflikt w tej samej transakcji
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

      // 5️⃣ Pobierz salon pracownika
      const salonRes = await client.query(
        `SELECT salon_id FROM employees WHERE id = $1`,
        [employee_id]
      );
      if (!salonRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono pracownika" });
      }
      const salon_id = salonRes.rows[0].salon_id;

      // 6️⃣ Wstaw rezerwację
      const insertRes = await client.query(
        `INSERT INTO appointments 
         (salon_id, employee_id, client_uid, service_id, date, start_time, end_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')
         RETURNING id`,
        [salon_id, employee_id, client_uid, service_id, date, start_time, end_time]
      );
      const appointmentId = insertRes.rows[0].id;

      // 7️⃣ Dodatki (opcjonalne)
      if (Array.isArray(addons) && addons.length > 0) {
        const vals = addons.map((_, i) => `($1, $${i + 2})`).join(", ");
        const params = [appointmentId, ...addons];
        await client.query(
          `INSERT INTO appointment_addons (appointment_id, addon_id)
           VALUES ${vals} ON CONFLICT DO NOTHING`,
          params
        );
      }

      // 8️⃣ Zatwierdź transakcję
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
    console.log("📡 Wysłano calendar_updated (NEW):", apptRes.rows[0].id);
  }
} catch (err) {
  console.error("⚠️ Nie udało się wysłać eventu calendar_updated (NEW):", err);
}




      res.json({
        message: "✅ Rezerwacja utworzona",
        appointment_id: appointmentId,
      });
    } catch (err) {
      await client.query("ROLLBACK");

      // ⏳ Zbyt długo czekał na blokadę
      if (err.code === "55P03") {
        return res
          .status(409)
          .json({ error: "Ten termin właśnie jest zajmowany przez innego klienta" });
      }

      // ⚡ PostgreSQL wykrył kolizję równoległą
      if (err.code === "40001") {
        return res
          .status(409)
          .json({ error: "Ten termin został właśnie zajęty przez innego klienta" });
      }

      console.error("❌ Błąd przy rezerwacji:", err.message);
      res.status(500).json({ error: "Błąd podczas tworzenia rezerwacji" });
    } finally {
      client.release();
    }
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
