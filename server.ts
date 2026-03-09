import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import fs from "fs/promises";

dotenv.config();

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
  `);
} catch (err) {
  console.error("Failed to run migrations:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Starting server in mode:", process.env.NODE_ENV || "development");

  app.use(express.json({ limit: '10mb' }));
  
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API ROUTER
  const apiRouter = express.Router();

  // Force JSON for all API responses
  apiRouter.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
  });

  apiRouter.get("/health", (req, res) => {
    console.log("Health check requested");
    res.json({ status: "ok", db: db ? "connected" : "error" });
  });

  apiRouter.get("/test", (req, res) => {
    res.json({ status: "ok", message: "API is working" });
  });

  apiRouter.get(["/activity", "/activity/"], (req, res) => {
    console.log("Fetching activity logs...");
    try {
      const logs = db.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 100").all();
      res.json(logs);
    } catch (err) {
      console.error("Database error in /api/activity:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  apiRouter.get(["/screenshots", "/screenshots/"], (req, res) => {
    console.log("Fetching screenshots...");
    try {
      const shots = db.prepare("SELECT * FROM screenshots ORDER BY timestamp DESC LIMIT 50").all();
      res.json(shots);
    } catch (err) {
      console.error("Database error in /api/screenshots:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  apiRouter.get(["/blocklist", "/blocklist/"], (req, res) => {
    console.log("Fetching blocklist...");
    try {
      const list = db.prepare("SELECT * FROM blocklist").all();
      res.json(list);
    } catch (err) {
      console.error("Database error in /api/blocklist:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  apiRouter.post("/report", (req, res) => {
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

  apiRouter.post("/blocklist", (req, res) => {
    const { keyword } = req.body;
    if (keyword) {
      try {
        db.prepare("INSERT INTO blocklist (keyword) VALUES (?)").run(keyword);
      } catch (e) {}
    }
    res.json({ status: "ok" });
  });

  apiRouter.delete("/blocklist/:id", (req, res) => {
    db.prepare("DELETE FROM blocklist WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  apiRouter.delete("/clear", (req, res) => {
    db.prepare("DELETE FROM activity").run();
    db.prepare("DELETE FROM screenshots").run();
    res.json({ status: "ok" });
  });

  // Catch-all for API router
  apiRouter.use("*", (req, res) => {
    console.warn(`API 404: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API route not found" });
  });

  // Mount API router
  app.use("/api", apiRouter);

  // VITE SETUP
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import('vite');
      const { default: react } = await import('@vitejs/plugin-react');
      const { default: tailwindcss } = await import('@tailwindcss/vite');

      const vite = await createViteServer({
        configFile: false,
        root: process.cwd(),
        server: { 
          middlewareMode: true,
          host: '0.0.0.0',
          port: 3000
        },
        plugins: [react(), tailwindcss()],
        define: {
          'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, '.'),
          },
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // SPA Fallback for development
      app.get("*", async (req, res, next) => {
        // Skip API routes
        if (req.url.startsWith("/api")) return next();
        
        try {
          const template = await fs.readFile(path.join(process.cwd(), "index.html"), "utf-8");
          const html = await vite.transformIndexHtml(req.url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (e: any) {
          vite.ssrFixStacktrace(e);
          console.error("Vite transform error:", e);
          res.status(500).end(e.message);
        }
      });
      
      console.log("Vite middleware loaded");
    } catch (viteErr) {
      console.error("Failed to start Vite:", viteErr);
    }
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

startServer().catch(err => {
  console.error("Server failed to start:", err);
});
