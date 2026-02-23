# BaseAi8004 – Security Architecture

## 1. Threat Model

### Assets to Protect
- Private keys
- Wallet funds
- API keys (OpenAI, Pinata)
- Trading logic integrity
- Agent decision autonomy
- VPS server integrity

### Attack Surfaces
- HTTP API endpoints
- LLM prompt injection
- Dependency supply chain
- Memory storage system
- VPS network exposure
- Web3 transaction signing
- Future social integrations

---

## 2. Application Security Controls

### Input Validation
- Strict JSON-RPC schema validation
- Message length caps
- Method allowlist
- Body size limits

### Rate Limiting
- Global rate limit
- Endpoint-specific rate limit
- Future: user-level rate limits

### Prompt Injection Mitigation
- Strong system policy
- History truncation
- No secret exposure
- No automatic shell execution

### Memory Safety
- Session size cap
- History length limit
- No file path traversal
- Controlled storage location

---

## 3. Key Management Strategy

### Development
- Keys stored in .env (gitignored)

### Production (Planned)
- Keys stored in systemd environment file
- Node runs as non-root user
- Future: hardware wallet or signer isolation
- Never expose private keys to LLM context

---

## 4. Infrastructure Security (Planned VPS)

- Ubuntu LTS
- UFW firewall
- Only ports 22, 80, 443 open
- Node bound to 127.0.0.1
- Nginx reverse proxy
- HTTPS mandatory
- Fail2Ban for SSH protection

---

## 5. Dependency Security

- agent0-sdk pinned
- npm overrides for vulnerable transitive deps
- npm audit clean
- Regular dependency audits

---

## 6. Logging & Monitoring

- Request ID logging
- IP + UA tracking
- No secret logging
- Future: anomaly detection

---

## 7. Autonomous Trading Safeguards (Future Critical Section)

Before enabling autonomous trading:

- Max trade size cap
- Daily loss limit
- Allowed contract whitelist
- Allowed chain whitelist
- Slippage protection
- Cooldown between trades
- Human override switch

---

## 8. Public Exposure Strategy

Phase 1: Local only
Phase 2: VPS with IP allowlist
Phase 3: Authenticated public API
Phase 4: Fully public with hardened controls

---

## 9. Security Review Cycle

- Review dependencies monthly
- Audit API routes before new feature release
- Re-check wallet isolation before enabling auto trading
