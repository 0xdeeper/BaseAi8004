import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setDefaultResultOrder } from "dns";
import crypto from "node:crypto";

import express, { Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { generateResponse } from "./agent.js";

setDefaultResultOrder("ipv4first");

// ---------------------------------------------------------------------------
// ESM __dirname
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_MODE = (process.env.PUBLIC_MODE || "false").toLowerCase() === "true";

// Best-practice:
// - Local: bind 127.0.0.1 only
// - VPS behind Nginx: still bind 127.0.0.1 (Nginx is public)
// - VPS direct: bind 0.0.0.0 (less ideal)
const BIND_HOST =
  process.env.BIND_HOST ||
  (PUBLIC_MODE ? "127.0.0.1" : "127.0.0.1");

// Optional allowlist (useful on VPS during early phase)
const allowlist = new Set(
  (process.env.A2A_IP_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");

// If you deploy behind a proxy (Nginx/Cloudflare), you may enable this later.
// For local dev, leaving it false avoids trusting spoofed headers.
// app.set("trust proxy", PUBLIC_MODE ? 1 : false);

// Security headers
app.use(helmet());

// Limit JSON body size (prevents large payload DoS)
app.use(express.json({ limit: "32kb" }));

// Static demo UI
app.use(express.static(path.join(__dirname, "../public")));

// ---------------------------------------------------------------------------
// Logging (IP + UA + request id)
// ---------------------------------------------------------------------------
function getClientIp(req: Request): string {
  // If you later enable trust proxy, this becomes reliable behind Nginx/CF.
  const xf = req.headers["x-forwarded-for"]?.toString();
  return (xf ? xf.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

app.use((req, res, next) => {
  const rid = crypto.randomUUID();
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] || "unknown";

  (req as any)._meta = { rid, ip, ua };

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      JSON.stringify({
        rid,
        ip,
        ua,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
      })
    );
  });

  next();
});

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const a2aLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use("/a2a", a2aLimiter);

// ---------------------------------------------------------------------------
// Temporary allowlist gate (recommended when PUBLIC_MODE=true early on)
// If allowlist is empty -> allow all (useful for pure local dev).
// ---------------------------------------------------------------------------
app.use("/a2a", (req, res, next) => {
  if (allowlist.size === 0) return next();

  const ip = getClientIp(req);
  if (!allowlist.has(ip)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ---------------------------------------------------------------------------
// JSON-RPC validation (strict)
// ---------------------------------------------------------------------------
const JsonRpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.literal("message/send"),
  params: z.object({
    message: z.string().min(1).max(2000),
  }),
});

// Optional: block URLs for now (max safety for public exposure)
// Turn on later by setting BLOCK_URLS=true
const BLOCK_URLS = (process.env.BLOCK_URLS || "false").toLowerCase() === "true";
const urlRegex = /(https?:\/\/[^\s]+)/i;
function containsDangerousUrl(text: string): boolean {
  const lowered = text.toLowerCase();
  if (lowered.includes("file://") || lowered.includes("ftp://")) return true;
  if (lowered.includes("127.0.0.1") || lowered.includes("localhost")) return true;
  if (lowered.includes("169.254.") || lowered.includes("0.0.0.0")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (_req: Request, res: Response) => {
  res.send("🤖 A2A Agent is running");
});

app.get("/a2a", (_req, res) => {
  res.status(405).send("This endpoint accepts POST JSON-RPC only.");
});

app.get("/.well-known/agent-card.json", (_req: Request, res: Response) => {
  try {
    const p = path.join(__dirname, "../.well-known/agent-card.json");
    const raw = fs.readFileSync(p, "utf8");
    res.type("application/json").send(raw);
  } catch {
    res.status(500).json({ error: "Failed to load agent-card.json" });
  }
});

app.post("/a2a", async (req: Request, res: Response) => {
  const parsed = JsonRpcSchema.safeParse(req.body);

  if (!parsed.success) {
    const meta = (req as any)._meta || {};
    console.warn(
      JSON.stringify({ rid: meta.rid, ip: meta.ip, error: "Invalid JSON-RPC" })
    );

    return res.status(400).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: -32600, message: "Invalid request" },
    });
  }

  const { id, params } = parsed.data;
  const message = params.message;

  if (containsDangerousUrl(message)) {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { message: "Blocked: unsafe URL pattern." },
    });
  }

  if (BLOCK_URLS && urlRegex.test(message)) {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { message: "For safety, links are disabled right now." },
    });
  }

  try {
    const reply = await generateResponse(message);
    return res.json({ jsonrpc: "2.0", id, result: { message: reply } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return res.status(500).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: msg },
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, BIND_HOST, () => {
  console.log(`🤖 A2A Server running on http://${BIND_HOST}:${PORT}`);
  console.log(`📋 Agent Card: /.well-known/agent-card.json`);
  console.log(`🔗 JSON-RPC endpoint: /a2a`);
  console.log(`PUBLIC_MODE = ${PUBLIC_MODE}`);
});
