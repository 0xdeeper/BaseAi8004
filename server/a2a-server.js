// a2a-server.js

/* ======================================================
   ENV & DEPENDENCIES
====================================================== */
require("dotenv/config");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { generateResponse, generateResponseWithMemory } = require("./agent.js"); // your AI functions

/* ======================================================
   SERVER SETUP
====================================================== */
const app = express();

// Enable CORS for frontend requests
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files (like chat.html) from the server folder
app.use(express.static(path.join(__dirname, ".."))); // serves files from project root

/* ======================================================
   ROUTES
====================================================== */

// Health check
app.get("/", (req, res) => {
    res.send("🤖 A2A Server is running!");
});

// AI endpoint (POST)
app.post("/a2a", async (req, res) => {
    console.log("Received body:", req.body);
    const { prompt, sessionId } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
    }

    try {
        let responseText;
        if (sessionId) {
            // Memory-aware AI
            responseText = await generateResponseWithMemory(sessionId, prompt);
        } else {
            // Simple AI response
            responseText = await generateResponse(prompt);
        }

        res.json({ response: responseText });
    } catch (err) {
        console.error("Error generating AI response:", err);
        res.status(500).json({ error: "Server error" });
    }
});


/* ======================================================
   SERVER START
====================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🤖 A2A Server running on port ${PORT}`);
});

