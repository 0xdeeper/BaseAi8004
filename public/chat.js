(() => {
  const output = document.getElementById("output");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");

  const modeSel = document.getElementById("mode");
  const toolPanel = document.getElementById("toolPanel");
  const toolName = document.getElementById("toolName");
  const toolArgs = document.getElementById("toolArgs");

  function log(line = "") {
    output.value += line + "\n";
    output.scrollTop = output.scrollHeight;
  }

  function pretty(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch { return String(obj); }
  }

  function extractAssistantText(data) {
    // Be resilient to whatever your backend returns.
    const r = data?.result;
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      if (typeof r.message === "string") return r.message;
      if (typeof r.text === "string") return r.text;
      if (typeof r.output === "string") return r.output;
      if (r.data && typeof r.data.text === "string") return r.data.text;
      if (r.data && typeof r.data.message === "string") return r.data.message;
    }
    return null;
  }

  function extractToolOutput(data) {
    // We don't know your exact tool response shape, so try common patterns.
    const r = data?.result;
    if (!r) return null;

    if (r && typeof r === "object") {
      if (r.output !== undefined) return r.output;
      if (r.result !== undefined) return r.result;
      if (r.toolResult !== undefined) return r.toolResult;
    }
    return null;
  }

  function safeParseJson(text) {
    try {
      const val = JSON.parse(text);
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        // Your handler likely accepts any object; keep this strict-ish.
        // If you want arrays allowed, remove this check.
        return { ok: true, value: val };
      }
      return { ok: true, value: val };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
    modeSel.disabled = busy;
    if (toolName) toolName.disabled = busy;
    if (toolArgs) toolArgs.disabled = busy;
  }

  async function postRpc(paramsMessage) {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "message/send",
      params: { message: paramsMessage },
    };

    const res = await fetch("/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Read as text first so we can show useful errors if JSON parsing fails.
    const raw = await res.text();

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Non-JSON response (HTTP ${res.status}):\n${raw}`);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}:\n${pretty(data)}`);
    }
    if (data?.error) {
      throw new Error(`RPC error:\n${pretty(data.error)}`);
    }

    return data;
  }

  async function sendChat() {
    const text = (input.value || "").trim();
    if (!text) return;

    log("You: " + text);

    const data = await postRpc(text);

    const msg = extractAssistantText(data);
    if (msg) log("AI: " + msg);
    else log("AI (raw): " + pretty(data));

    log("");
    input.value = "";
  }

  async function sendToolCall() {
    const name = (toolName?.value || "").trim();
    const argsText = (toolArgs?.value || "").trim() || "{}";

    if (!name) {
      log("Error: Tool name is required.");
      log("");
      return;
    }

    const parsed = safeParseJson(argsText);
    if (!parsed.ok) {
      log("Error: Tool arguments JSON is invalid:");
      log(parsed.error);
      log("");
      return;
    }

    const toolCallMessage = {
      role: "user",
      content: [
        {
          type: "tool_call",
          name,
          arguments: parsed.value,
        },
      ],
    };

    log("Tool call:");
    log("name: " + name);
    log("arguments: " + pretty(parsed.value));

    const data = await postRpc(toolCallMessage);

    const toolOut = extractToolOutput(data);
    if (toolOut !== null) {
      log("Tool result:");
      log(pretty(toolOut));
    } else {
      log("Tool result (raw):");
      log(pretty(data));
    }

    log("");
  }

  async function sendMessage() {
    const mode = modeSel?.value || "chat";
    setBusy(true);
    try {
      if (mode === "tool") {
        await sendToolCall();
      } else {
        await sendChat();
      }
    } catch (err) {
      log("Error: " + (err?.message || String(err)));
      log("");
    } finally {
      setBusy(false);
      // Focus something sensible
      if ((modeSel?.value || "chat") === "tool") {
        toolName?.focus();
      } else {
        input.focus();
      }
    }
  }

  // UI wiring
  modeSel.addEventListener("change", () => {
    const mode = modeSel.value;
    if (mode === "tool") {
      toolPanel.classList.remove("hidden");
      input.placeholder = "Chat disabled in Tool mode (switch back to Chat)";
      input.disabled = true;
      toolName?.focus();
    } else {
      toolPanel.classList.add("hidden");
      input.placeholder = "Type a message… (Enter to send)";
      input.disabled = false;
      input.focus();
    }
  });

  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Enter to send in Chat mode
  input.addEventListener("keydown", (e) => {
    if (modeSel.value === "chat" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Ctrl+Enter to send in Tool mode (from args box)
  toolArgs?.addEventListener("keydown", (e) => {
    if (modeSel.value === "tool" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Optional: Enter on toolName sends if args are valid
  toolName?.addEventListener("keydown", (e) => {
    if (modeSel.value === "tool" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  log("Ready. Chat mode: Enter to send. Tool mode: Ctrl+Enter to send tool call.");
})();
