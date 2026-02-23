# BaseAi8004 – Project Context

## Project Overview
BaseAi8004 is an autonomous AI crypto agent designed to:
- Manage its own wallet
- Trade and bridge on DEXs
- Trade perps (e.g., Avantis)
- Mint NFTs
- Complete Web3 quests
- Interact with other agents
- Post to social platforms (future)

Priority: Maximum security and long-term architectural correctness before public deployment.

---

## Current Architecture (Local Development)

- Root: TypeScript + Express backend
- clean-chain/: Hardhat project (isolated smart contracts)
- src/: TypeScript source
- server/: compiled JS output (gitignored)
- public/chat.html: local demo interface

---

## API Endpoints

- GET `/` → Health check
- GET `/.well-known/agent-card.json`
- POST `/a2a` → JSON-RPC endpoint (message/send only)

---

## Security Controls Implemented

- Server bound to 127.0.0.1 (local-only)
- Helmet security headers
- Strict JSON-RPC validation via Zod
- Rate limiting (global + endpoint specific)
- Body size limits
- IP logging with request IDs
- Optional IP allowlist for VPS mode
- System policy prompt guard in agent.ts
- Memory size caps
- Fetch timeouts
- npm audit clean (overrides used)

---

## LLM Providers

- Ollama (localhost only)
- OpenAI (optional fallback)

---

## Deployment Plan (Future)

- Ubuntu VPS
- Nginx reverse proxy
- HTTPS via Let's Encrypt
- App bound to localhost behind proxy
- Firewall restricted ports
- x402 payments
- MCP server

---

## Security Philosophy

System must remain secure even if:
- Source code is public
- Architecture is known
- Attackers understand design

Security must never depend on secrecy alone.
