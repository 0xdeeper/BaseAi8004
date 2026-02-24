// src/a2a-handler.ts

import { z } from "zod";
import type { Request, Response } from "express";
import { generateResponse } from "./agent.js";
import { handleToolCall } from "./tools.js";

/* ======================================================
   JSON-RPC Schema (strict but flexible)
====================================================== */

const JsonRpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.literal("message/send"),
  params: z.object({
    message: z.union([
      z.string().min(1).max(2000),
      z.object({
        role: z.string(),
        content: z.array(
          z.object({
            type: z.string(),
            name: z.string().optional(),
            arguments: z
              .record(z.string(), z.any())
              .optional(),
          })
        ),
      }),
    ]),
  }),
});
function jsonRpcError(
  res: Response,
  id: string | number | null | undefined,
  code: number,
  message: string
) {
  return res.status(200).json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

/* ======================================================
   MAIN HANDLER
====================================================== */

export async function handleA2A(req: Request, res: Response) {
  const parsed = JsonRpcSchema.safeParse(req.body);

  if (!parsed.success) {
    return jsonRpcError(res, req.body?.id ?? null, -32600, "Invalid request");
  }

  const { id, params } = parsed.data;
  const message = params.message;

  try {
    /* ===============================================
       CASE 1: Plain string message (normal chat)
    =============================================== */
    if (typeof message === "string") {
      const reply = await generateResponse(message);

      return res.json({
        jsonrpc: "2.0",
        id,
        result: { message: reply },
      });
    }

    /* ===============================================
       CASE 2: Structured content (tool call)
    =============================================== */

    // We only process first content item for now
    const first = message.content?.[0];

    if (!first) {
      return jsonRpcError(res, id, -32602, "Empty content");
    }

    if (first.type !== "tool_call") {
      return jsonRpcError(res, id, -32602, "Unsupported content type");
    }

    const toolName = first.name;
    const toolArgs = first.arguments ?? {};

    if (!toolName) {
      return jsonRpcError(res, id, -32602, "Tool name missing");
    }

    const toolResult = await handleToolCall(toolName, toolArgs);

    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tool: toolName,
        output: toolResult,
      },
    });
  } catch (err: any) {
    // Clean timeout detection
    const message =
      err?.name === "AbortError"
        ? "LLM request timed out"
        : err instanceof Error
        ? err.message
        : "Internal server error";

    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message,
      },
    });
  }
}
