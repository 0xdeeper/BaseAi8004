import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import "dotenv/config";
import express, { Request, Response } from "express";
import { generateResponse } from "./agent.js";

const app = express();
app.use(express.json());

// ============================================================================
// ROOT ROUTE
// ============================================================================
app.get("/", (_req, res) => {
  res.send("🤖 A2A Agent is running");
});

// ============================================================================
// AGENT CARD (A2A DISCOVERY)
// ============================================================================
app.get("/.well-known/agent-card.json", async (_req: Request, res: Response) => {
  const agentCard = await import("../.well-known/agent-card.json", {
    assert: { type: "json" },
  });
  res.json(agentCard.default);
});

// ============================================================================
// A2A JSON-RPC ENDPOINT
// ============================================================================
app.post("/a2a", async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body;

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
      result: {
        message: reply,
      },
    });
  } catch (err: any) {
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: err?.message || "Internal server error",
      },
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
