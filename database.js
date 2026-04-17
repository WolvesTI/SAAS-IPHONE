const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Crear/Conectar a la base de datos SQLite
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
    initDatabase();
  }
});

// Inicializar todas las tablas
function initDatabase() {
  db.serialize(() => {
    // Tabla de usuarios (común a los 3 SaaS)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tablas de CyberGuard
    db.run(`
      CREATE TABLE IF NOT EXISTS cg_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        target_url TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        score INTEGER,
        findings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cg_vulnerabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id INTEGER,
        name TEXT,
        severity TEXT,
        description TEXT,
        remediation TEXT,
        FOREIGN KEY (scan_id) REFERENCES cg_scans(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cg_threats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        source TEXT,
        severity TEXT,
        status TEXT DEFAULT 'active',
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cg_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        scan_id INTEGER,
        title TEXT,
        format TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (scan_id) REFERENCES cg_scans(id)
      )
    `);

    // Tablas de EngineerGo
    db.run(`
      CREATE TABLE IF NOT EXISTS eg_professionals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        email TEXT,
        phone TEXT,
        skills TEXT,
        hourly_rate INTEGER,
        rating REAL DEFAULT 0,
        lat REAL,
        lng REAL,
        is_available BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS eg_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        professional_id INTEGER,
        service_type TEXT,
        status TEXT DEFAULT 'pending',
        price INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id),
        FOREIGN KEY (professional_id) REFERENCES eg_professionals(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS eg_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER,
        amount INTEGER,
        status TEXT DEFAULT 'pending',
        method TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES eg_bookings(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS eg_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER,
        rating INTEGER,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES eg_bookings(id)
      )
    `);

    // Tablas de iSecure Audit
    db.run(`
      CREATE TABLE IF NOT EXISTS is_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        device_model TEXT,
        ios_version TEXT,
        passcode_type TEXT,
        score INTEGER,
        status TEXT,
        findings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS is_audit_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER,
        check_name TEXT,
        check_value BOOLEAN,
        severity TEXT,
        points INTEGER,
        FOREIGN KEY (audit_id) REFERENCES is_audits(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS is_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER,
        format TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES is_audits(id)
      )
    `);

    console.log('Tablas inicializadas correctamente.');
  });
}

// Helper function para queries con Promesas
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = { db, query, run, get };
