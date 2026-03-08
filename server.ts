import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: any;
try {
  db = new Database("monitor.db");
  console.log("Database initialized successfully");
} catch (err) {
  console.error("Failed to initialize database:", err);
  // Fallback to in-memory if disk is not writable (though it should be)
  db = new Database(":memory:");
  console.log("Using in-memory database fallback");
}

// Initialize database
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      window_title TEXT,
      app_name TEXT
    );
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      image_data TEXT
    );
    CREATE TABLE IF NOT EXISTS blocklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT UNIQUE
    );
  `);
} catch (err) {
  console.error("Failed to run migrations:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // API Routes - Defined BEFORE static files
  app.get("/api/test", (req, res) => {
    console.log("Hit /api/test");
    res.json({ status: "ok", message: "Server is reachable", timestamp: new Date().toISOString() });
  });

  app.post("/api/report", (req, res) => {
    const { window_title, app_name, screenshot } = req.body;
    
    if (window_title || app_name) {
      const stmt = db.prepare("INSERT INTO activity (window_title, app_name) VALUES (?, ?)");
      stmt.run(window_title || "Unknown", app_name || "Unknown");
    }

    if (screenshot) {
      const stmt = db.prepare("INSERT INTO screenshots (image_data) VALUES (?)");
      stmt.run(screenshot);
      
      db.prepare("DELETE FROM screenshots WHERE id NOT IN (SELECT id FROM screenshots ORDER BY timestamp DESC LIMIT 50)").run();
    }

    res.json({ status: "ok" });
  });

  app.get("/api/activity", (req, res) => {
    const logs = db.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 100").all();
    res.json(logs);
  });

  app.get("/api/screenshots", (req, res) => {
    const screenshots = db.prepare("SELECT * FROM screenshots ORDER BY timestamp DESC LIMIT 20").all();
    res.json(screenshots);
  });

  app.get("/api/blocklist", (req, res) => {
    const list = db.prepare("SELECT * FROM blocklist").all();
    res.json(list);
  });

  app.post("/api/blocklist", (req, res) => {
    const { keyword } = req.body;
    if (keyword) {
      try {
        db.prepare("INSERT INTO blocklist (keyword) VALUES (?)").run(keyword);
      } catch (e) {}
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/blocklist/:id", (req, res) => {
    db.prepare("DELETE FROM blocklist WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  app.delete("/api/clear", (req, res) => {
    db.prepare("DELETE FROM activity").run();
    db.prepare("DELETE FROM screenshots").run();
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
