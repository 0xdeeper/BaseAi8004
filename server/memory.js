"use strict";
/* ======================================================
   SIMPLE IN-MEMORY CONVERSATION STORE
====================================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = getHistory;
exports.appendMessage = appendMessage;
exports.clearSession = clearSession;
var sessions = new Map();
function getHistory(sessionId) {
    return sessions.get(sessionId) || [];
}
function appendMessage(sessionId, message) {
    var history = sessions.get(sessionId) || [];
    history.push(message);
    sessions.set(sessionId, history);
}
function clearSession(sessionId) {
    sessions.delete(sessionId);
}
