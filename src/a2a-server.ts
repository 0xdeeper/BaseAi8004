import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import express, { Request, Response } from "express";
import { generateResponse } from "./agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files from /public (so /chat.html works)
app.use(express.static(path.join(__dirname, "../public")));

// ============================================================================
// ROOT ROUTE
// ============================================================================
app.get("/a2a", (_req, res) => {
  res.status(405).send("This endpoint accepts POST JSON-RPC only.");
});
// ============================================================================
// AGENT CARD (A2A DISCOVERY)
// ============================================================================

app.get("/.well-known/agent-card.json", (_req: Request, res: Response) => {
  try {
    const p = path.join(__dirname, "../.well-known/agent-card.json");
    const raw = fs.readFileSync(p, "utf8");
    res.type("application/json").send(raw);
  } catch {
    res.status(500).json({ error: "Failed to load agent-card.json" });
  }
});
// ============================================================================
// A2A JSON-RPC ENDPOINT
// ============================================================================
app.post("/a2a", async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body ?? {};

  // Validate JSON-RPC
  if (jsonrpc !== "2.0") {
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid JSON-RPC version" },
    });
  }

  // Only support message/send for now
  if (method !== "message/send") {
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  }

  // Validate params
  if (!params?.message || typeof params.message !== "string") {
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "Missing or invalid 'message' parameter",
      },
    });
  }

  try {
    const reply = await generateResponse(params.message);

    return res.json({
      jsonrpc: "2.0",
      id,
      result: { message: reply },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message },
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🤖 A2A Server running on port ${PORT}`);
  console.log(`📋 Agent Card: /.well-known/agent-card.json`);
  console.log(`🔗 JSON-RPC endpoint: /a2a`);
});
