(() => {
  const output = document.getElementById("output");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");

  function log(line) {
    output.value += line + "\n";
    output.scrollTop = output.scrollHeight;
  }

  async function sendMessage() {
    const text = (input.value || "").trim();
    if (!text) return;

    sendBtn.disabled = true;
    input.disabled = true;

    log("You: " + text);

    try {
      const payload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "message/send",
        params: { message: text },
      };

      const res = await fetch("/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        log("Error: HTTP " + res.status);
        if (data) log("Error body: " + JSON.stringify(data));
        return;
      }

      if (data && data.error) {
        log("Error: " + (data.error.message || JSON.stringify(data.error)));
        return;
      }

      const msg = data?.result?.message ?? "(no message)";
      log("AI: " + msg);
      log("");
    } catch (err) {
      log("Connection error: " + (err?.message || String(err)));
      log("");
    } finally {
      input.value = "";
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  log("Ready. Type a message and press Enter.");
})();
