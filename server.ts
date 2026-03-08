import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dotenv from 'dotenv';

dotenv.config();

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

  // 1. MIDDLEWARES DE BASE
  app.use(express.json({ limit: '10mb' }));
  
  // Logger pour le débug
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // 2. ROUTES API (PRIORITÉ MAXIMALE)
  app.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV || "development",
      time: new Date().toISOString(),
      db: db ? "connected" : "error"
    });
  });

  app.get("/api/test", (req, res) => {
    res.json({ status: "ok", message: "API is working" });
  });

  app.get("/api/blocklist", (req, res) => {
    try {
      const list = db.prepare("SELECT * FROM blocklist").all();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/report", (req, res) => {
    const { window_title, app_name, screenshot } = req.body;
    try {
      if (window_title || app_name) {
        db.prepare("INSERT INTO activity (window_title, app_name) VALUES (?, ?)")
          .run(window_title || "Unknown", app_name || "Unknown");
      }
      if (screenshot) {
        db.prepare("INSERT INTO screenshots (image_data) VALUES (?)").run(screenshot);
        db.prepare("DELETE FROM screenshots WHERE id NOT IN (SELECT id FROM screenshots ORDER BY timestamp DESC LIMIT 50)").run();
      }
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Report failed" });
    }
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

  // 3. VITE / STATIQUE (EN DERNIER)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: false,
      root: process.cwd(),
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      },
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
