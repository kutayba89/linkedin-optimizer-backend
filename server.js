// Simple local dev server — no Vercel needed.
// Serves /public as static files and routes /api/* to the handler files.
// Run with:  node server.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// --- Load .env.local (simple parser, no dependency needed) ---
function loadEnv(file) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(".env.local");
loadEnv(".env");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// Collect the raw request body and expose helpers that mimic Vercel's req/res.
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function makeRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
  const originalEnd = res.end.bind(res);
  res.end = (...args) => originalEnd(...args);
  return res;
}

async function handleApi(req, res, routePath) {
  const modulePath = path.join(__dirname, "api", routePath + ".js");
  if (!fs.existsSync(modulePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "API route not found: " + routePath }));
    return;
  }

  try {
    const mod = await import("file://" + modulePath + "?t=" + Date.now());
    const handler = mod.default;
    const rawBody = await readBody(req);
    req.body = rawBody;
    makeRes(res);
    await handler(req, res);
  } catch (err) {
    console.error("API handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message || "Server error" }));
  }
}

function serveStatic(req, res, urlPath) {
  let filePath = decodeURIComponent(urlPath.split("?")[0]);
  if (filePath === "/") filePath = "/index.html";
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // prevent path traversal
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html");
      res.end("<h1>404 Not Found</h1>");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  if (url.startsWith("/api/")) {
    const routePath = url.split("?")[0].replace(/^\/api\//, "").replace(/\/$/, "");
    await handleApi(req, res, routePath);
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  console.log(`\n  Local dev server running:  http://localhost:${PORT}`);
  console.log(`  Optimizer tool:            http://localhost:${PORT}/app.html`);
  console.log(`  GEMINI_API_KEY loaded:     ${hasKey ? "yes ✅" : "NO ❌  (add it to .env.local)"}\n`);
});