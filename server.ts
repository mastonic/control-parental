import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import fs from "fs/promises";
import cors from "cors";

dotenv.config();

// Global error handlers to catch crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: any;
try {
  db = new Database("monitor.db");
  console.log("Database initialized successfully");
} catch (err) {
  console.error("Failed to initialize database:", err);
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
    CREATE TABLE IF NOT EXISTS block_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      window_title TEXT,
      keyword TEXT,
      screenshot TEXT
    );
  `);
} catch (err) {
  console.error("Failed to run migrations:", err);
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 4000;

  console.log("Starting server in mode:", process.env.NODE_ENV || "development");

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API ROUTES
  app.get("/api/health", (req, res) => {
    console.log("Health check requested");
    res.json({ status: "ok", db: db ? "connected" : "error" });
  });

  app.get("/api/test", (req, res) => {
    res.json({ status: "ok", message: "API is working" });
  });

  app.get(["/api/activity", "/api/activity/"], (req, res) => {
    console.log("Fetching activity logs...");
    try {
      const logs = db.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 100").all();
      res.json(logs || []);
    } catch (err) {
      console.error("Database error in /api/activity:", err);
      res.status(500).json({ error: "Database error", details: String(err) });
    }
  });

  app.get(["/api/screenshots", "/api/screenshots/"], (req, res) => {
    console.log("Fetching screenshots...");
    try {
      const shots = db.prepare("SELECT * FROM screenshots ORDER BY timestamp DESC LIMIT 50").all();
      res.json(shots || []);
    } catch (err) {
      console.error("Database error in /api/screenshots:", err);
      res.status(500).json({ error: "Database error", details: String(err) });
    }
  });

  app.get(["/api/blocklist", "/api/blocklist/"], (req, res) => {
    console.log("Fetching blocklist...");
    try {
      const list = db.prepare("SELECT * FROM blocklist").all();
      res.json(list || []);
    } catch (err) {
      console.error("Database error in /api/blocklist:", err);
      res.status(500).json({ error: "Database error", details: String(err) });
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
      console.error("Report error:", err);
      res.status(500).json({ error: "Report failed" });
    }
  });

  app.post("/api/blocklist", (req, res) => {
    const { keyword } = req.body;
    if (keyword) {
      try {
        db.prepare("INSERT INTO blocklist (keyword) VALUES (?)").run(keyword);
      } catch (e) { }
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/blocklist/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM blocklist WHERE id = ?").run(req.params.id);
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  });

  // Block events (historique des blocages)
  app.get(["/api/block-events", "/api/block-events/"], (req, res) => {
    try {
      const events = db.prepare("SELECT * FROM block_events ORDER BY timestamp DESC LIMIT 100").all();
      res.json(events || []);
    } catch (err) {
      console.error("Database error in /api/block-events:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/block-event", (req, res) => {
    const { window_title, keyword, screenshot } = req.body;
    try {
      db.prepare("INSERT INTO block_events (window_title, keyword, screenshot) VALUES (?, ?, ?)")
        .run(window_title || "Unknown", keyword || "Unknown", screenshot || null);
      // Garder max 100 événements
      db.prepare("DELETE FROM block_events WHERE id NOT IN (SELECT id FROM block_events ORDER BY timestamp DESC LIMIT 100)").run();
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Block event error:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM activity").run();
      db.prepare("DELETE FROM screenshots").run();
      db.prepare("DELETE FROM block_events").run();
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Clear failed" });
    }
  });

  // VITE SETUP
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("Initializing Vite in development mode...");
      const { createServer: createViteServer } = await import('vite');
      const { default: react } = await import('@vitejs/plugin-react');
      const { default: tailwindcss } = await import('@tailwindcss/vite');

      const vite = await createViteServer({
        configFile: false,
        root: process.cwd(),
        server: {
          middlewareMode: true,
        },
        plugins: [react(), tailwindcss()],
        define: {
          'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
        },
        resolve: {
          alias: {
            '@': path.resolve(process.cwd(), '.'),
          },
        },
        appType: "spa",
      });
      app.use(vite.middlewares);

      // Explicit root route for development
      app.get("/", async (req, res) => {
        try {
          const indexPath = path.join(process.cwd(), "index.html");
          const template = await fs.readFile(indexPath, "utf-8");
          const html = await vite.transformIndexHtml(req.url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (e: any) {
          console.error("Vite root transform error:", e);
          res.status(500).end(`Vite Error: ${e.message}`);
        }
      });

      // SPA Fallback for development
      app.get("*", async (req, res, next) => {
        // Skip API routes
        if (req.url.startsWith("/api")) return next();

        try {
          const indexPath = path.join(process.cwd(), "index.html");
          console.log(`Serving index.html from: ${indexPath}`);
          const template = await fs.readFile(indexPath, "utf-8");
          const html = await vite.transformIndexHtml(req.url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (e: any) {
          vite.ssrFixStacktrace(e);
          console.error("Vite transform error:", e);
          res.status(500).end(`Vite Error: ${e.message}`);
        }
      });

      console.log("Vite middleware loaded successfully");
    } catch (viteErr) {
      console.error("Failed to start Vite:", viteErr);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");

    console.log(`Production mode: serving static files from ${distPath}`);

    app.use(express.static(distPath));

    app.get("*", async (req, res) => {
      if (req.url.startsWith("/api")) return res.status(404).json({ error: "API not found" });

      try {
        await fs.access(indexPath);
        res.sendFile(indexPath);
      } catch (err) {
        console.error(`Production error: index.html not found at ${indexPath}. Did you run 'npm run build'?`);
        res.status(500).send("Application not built. Please run 'npm run build' first.");
      }
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Server failed to start:", err);
});
