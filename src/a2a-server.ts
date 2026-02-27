import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { setDefaultResultOrder } from "node:dns";
import { decide } from "./engine/decisionEngine.js";
import type { DecideInput } from "./engine/types.js";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { handleA2A } from "./a2a-handler.js";
import { paperExecutePlan } from "./paper/paper-executor.js";

// Prefer IPv4 first (Windows can be weird with localhost resolution)
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

// Bind host: keep localhost-only unless you explicitly expose it
const BIND_HOST = (process.env.BIND_HOST || "127.0.0.1").trim();

// Optional allowlist gate (useful on VPS during early phase)
const allowlist = new Set(
  (process.env.A2A_IP_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// Optional: block URLs (defense-in-depth)
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
// Express request meta typing
// ---------------------------------------------------------------------------
type RequestMeta = { rid: string; ip: string; ua: string };
type RequestWithMeta = Request & { _meta?: RequestMeta };

function getClientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] || "")?.toString();
  return (xf ? xf.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");

// Security headers
app.use(helmet());

// Limit JSON body size (prevents large payload DoS)
app.use(express.json({ limit: "32kb" }));

// Static demo UI
app.use(express.static(path.join(__dirname, "../public")));

// ---------------------------------------------------------------------------
// Logging (IP + UA + request id)
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const rid = crypto.randomUUID();
  const ip = getClientIp(req);
  const ua = (req.headers["user-agent"] || "unknown").toString();

  (req as RequestWithMeta)._meta = { rid, ip, ua };

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
const engineLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/engine", engineLimiter);

const paperLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/paper", paperLimiter);

// ---------------------------------------------------------------------------
// Optional allowlist gate
// If allowlist is empty -> allow all (useful for pure local dev).
// ---------------------------------------------------------------------------
app.use("/a2a", (req: Request, res: Response, next: NextFunction) => {
  if (allowlist.size === 0) return next();
  const ip = getClientIp(req);
  if (!allowlist.has(ip)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (_req: Request, res: Response) => {
  res.send("🤖 A2A Agent is running");
});

app.get("/a2a", (_req: Request, res: Response) => {
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
app.get("/chat", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/chat.html"));
});

app.post("/paper/execute-plan", (req: Request, res: Response) => {
  try {
    // Governance: keep paper endpoints disabled in PUBLIC_MODE
    if (PUBLIC_MODE) return res.status(403).json({ error: "Disabled in PUBLIC_MODE" });

    const body = req.body as any;
    const plan = body?.plan;
    const pricesUsd = body?.pricesUsd;

    if (!plan || !pricesUsd) {
      return res.status(400).json({ error: "Missing plan or pricesUsd" });
    }

    const report = paperExecutePlan(plan, pricesUsd);
    return res.status(200).json(report);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "paper exec error" });
  }
});


// ---------------------------------------------------------------------------
// Decision Engine (Phase B) - READ ONLY
// This endpoint returns intents + policy decisions + execution plans.
// It does NOT execute wallet transactions.
// ---------------------------------------------------------------------------
app.post("/engine/decide", (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<DecideInput>;

    // Minimal validation (fail closed)
    if (!body?.snapshot || !body?.portfolio) {
      return res.status(400).json({ error: "Missing snapshot or portfolio" });
    }
    if (body.snapshot.chain !== "base" || body.portfolio.chain !== "base") {
      return res.status(400).json({ error: "Only base chain supported" });
    }

    const out = decide(body as DecideInput);
    return res.status(200).json(out);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Engine error" });
  }
});

// IMPORTANT: lightweight URL blocking BEFORE handler (only for string messages)
app.post("/a2a", (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as any;
    const msg = body?.params?.message;

    // Only apply these blocks to legacy string message format.
    if (typeof msg === "string") {
      if (containsDangerousUrl(msg)) {
        const id = body?.id ?? null;
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: { message: "Blocked: unsafe URL pattern." },
        });
      }
      if (BLOCK_URLS && urlRegex.test(msg)) {
        const id = body?.id ?? null;
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: { message: "For safety, links are disabled right now." },
        });
      }
    }

    return next();
  } catch {
    // If anything is weird, just continue to handler which will validate/fail closed.
    return next();
  }
});

// Use the new hardened handler (supports legacy chat + structured tool calls)
app.post("/a2a", handleA2A);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, BIND_HOST, () => {
  console.log(`🤖 A2A Server running on http://${BIND_HOST}:${PORT}`);
  console.log(`📋 Agent Card: /.well-known/agent-card.json`);
  console.log(`🔗 JSON-RPC endpoint: /a2a`);
  console.log(`PUBLIC_MODE = ${PUBLIC_MODE}`);
});
