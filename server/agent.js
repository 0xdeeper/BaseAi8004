"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponse = generateResponse;
exports.generateResponseWithMemory = generateResponseWithMemory;
/* ======================================================
   ENV SETUP
====================================================== */
require("dotenv/config");
var openai_1 = require("openai");
// Import runtime functions
var memory_js_1 = require("./memory.js");
/* ======================================================
   OLLAMA CLIENT (LOCAL / FREE)
====================================================== */
async function ollamaResponse(message) {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

    const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "phi3:mini",
            prompt: message,
            stream: false,
            options: {
                num_ctx: 512,
                num_predict: 64,
                num_threads: 1
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ollama error: ${err}`);
    }

    const json = await res.json();
    return json.response ?? "";
}

/* ======================================================
   OPENAI CLIENT (FUTURE / PAID)
====================================================== */
function openAIResponse(message) {
    return __awaiter(this, void 0, void 0, function () {
        var client, completion;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!process.env.OPENAI_API_KEY) {
                        throw new Error("OPENAI_API_KEY missing");
                    }
                    client = new openai_1.default({
                        apiKey: process.env.OPENAI_API_KEY,
                    });
                    return [4 /*yield*/, client.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [{ role: "user", content: message }],
                        })];
                case 1:
                    completion = _d.sent();
                    return [2 /*return*/, (_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : ""];
            }
        });
    });
}
/* ======================================================
   CORE PUBLIC API (AUTO-FALLBACK)
====================================================== */
function generateResponse(message) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    provider = process.env.LLM_PROVIDER || "auto";
                    console.log("LLM_PROVIDER =", provider);
                    console.log("OLLAMA_BASE_URL =", process.env.OLLAMA_BASE_URL);
                    if (!(provider === "auto")) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, ollamaResponse(message)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    err_1 = _a.sent();
                    console.warn("Ollama failed. Falling back to OpenAI...");
                    return [4 /*yield*/, openAIResponse(message)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    if (!(provider === "ollama")) return [3 /*break*/, 7];
                    return [4 /*yield*/, ollamaResponse(message)];
                case 6: return [2 /*return*/, _a.sent()];
                case 7:
                    if (!(provider === "openai")) return [3 /*break*/, 9];
                    return [4 /*yield*/, openAIResponse(message)];
                case 8: return [2 /*return*/, _a.sent()];
                case 9: throw new Error("Unknown LLM_PROVIDER: ".concat(provider));
            }
        });
    });
}
/* ======================================================
   MEMORY-AWARE WRAPPER
====================================================== */
function generateResponseWithMemory(sessionId, userMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var history, fullPrompt, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // 1️⃣ Save user message
                    (0, memory_js_1.appendMessage)(sessionId, { role: "user", content: userMessage });
                    history = (0, memory_js_1.getHistory)(sessionId);
                    fullPrompt = history
                        .map(function (m) { return "".concat(m.role.toUpperCase(), ": ").concat(m.content); })
                        .join("\n");
                    return [4 /*yield*/, generateResponse(fullPrompt)];
                case 1:
                    response = _a.sent();
                    // 5️⃣ Save assistant reply
                    (0, memory_js_1.appendMessage)(sessionId, { role: "assistant", content: response });
                    return [2 /*return*/, response];
            }
        });
    });
}
