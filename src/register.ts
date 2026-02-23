/**
 * ERC-8004 Agent Registration Script (HARDENED)
 *
 * SECURITY HARDENING:
 * - Strict env validation (private key, URLs, addresses)
 * - Enforce HTTPS endpoints
 * - Verify RPC chainId matches Base Mainnet (8453)
 * - No hardcoded agent wallet (requires AGENT_WALLET env var)
 * - Conservative trust/feature flags by default
 * - Safer error logging (no object dumps)
 *
 * Run with: npm run register
 */

import "dotenv/config";
import { SDK } from "agent0-sdk";

// ============================================================================
// Guards / Validation
// ============================================================================

function assertHexPrivateKey(pk: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("PRIVATE_KEY must be 0x + 64 hex chars");
  }
}

function assertHttpsUrl(u: string, name: string) {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${name} must be https`);
}

function assertEvmAddress(addr: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error("Invalid wallet address format");
  }
  // If you use ethers/viem elsewhere, do a checksum validation too.
}

function assertNonEmpty(name: string, v: string | undefined) {
  if (!v || v.trim().length === 0) throw new Error(`${name} not set in .env`);
  return v.trim();
}

async function fetchChainId(rpcUrl: string): Promise<number> {
  // Works on Node 18+ (fetch is global). If you’re on Node <18, upgrade or add undici.
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });

  if (!res.ok) throw new Error(`RPC chainId check failed (HTTP ${res.status})`);

  const j: any = await res.json();
  if (!j || typeof j.result !== "string") {
  throw new Error("Unable to read chainId from RPC");
  }
  const cid = Number.parseInt(j.result, 16);
  if (!Number.isFinite(cid)) throw new Error("RPC returned invalid chainId");
  return cid;
}

// ============================================================================
// Agent Configuration (edit these)
// ============================================================================

const AGENT_CONFIG = {
  name: "my agent",
  description: "test agent created with create-8004-agent",
  image: "https://pbs.twimg.com/media/HAwDsXTaMAAALS2?format=jpg&name=large",
  // Update these URLs when you deploy your agent
  a2aEndpoint: "https://my-agent.example.com/.well-known/agent-card.json",
  mcpEndpoint: "https://my-agent.example.com/mcp",
} as const;

// ============================================================================
// Main Registration Flow
// ============================================================================

async function main() {
  // ---- Required env vars ----
  const privateKey = assertNonEmpty("PRIVATE_KEY", process.env.PRIVATE_KEY);
  const pinataJwt = assertNonEmpty("PINATA_JWT", process.env.PINATA_JWT);
  const agentWallet = assertNonEmpty("AGENT_WALLET", process.env.AGENT_WALLET);

  // ---- Optional env vars ----
  const rpcUrl = (process.env.RPC_URL || "https://mainnet.base.org").trim();
  const debug = process.env.DEBUG === "true";

  // ---- Validate formats ----
  assertHexPrivateKey(privateKey);
  assertEvmAddress(agentWallet);

  assertHttpsUrl(AGENT_CONFIG.a2aEndpoint, "a2aEndpoint");
  assertHttpsUrl(AGENT_CONFIG.mcpEndpoint, "mcpEndpoint");

  // ---- Ensure RPC is actually Base Mainnet ----
  console.log("🔍 Verifying RPC chainId...");
  const chainId = await fetchChainId(rpcUrl);
  if (chainId !== 8453) {
    throw new Error(`RPC chainId mismatch: expected 8453 (Base Mainnet) but got ${chainId}`);
  }

  // ---- Initialize SDK ----
  console.log("🔧 Initializing Agent0 SDK...");
  const sdk = new SDK({
    chainId: 8453,
    rpcUrl,
    signer: privateKey,
    ipfs: "pinata",
    pinataJwt,
  });

  // ---- Create agent ----
  console.log("📝 Creating agent...");
  const agent = sdk.createAgent(AGENT_CONFIG.name, AGENT_CONFIG.description, AGENT_CONFIG.image);

  // ---- Configure endpoints ----
  console.log("🔗 Setting A2A endpoint...");
  await agent.setA2A(AGENT_CONFIG.a2aEndpoint);

  console.log("🔗 Setting MCP endpoint...");
  await agent.setMCP(AGENT_CONFIG.mcpEndpoint);

  // ---- Conservative trust model ----
  // Default: false/false/false unless explicitly enabled in env
  const TRUST_1 = process.env.TRUST_1 === "true";
  const TRUST_2 = process.env.TRUST_2 === "true";
  const TRUST_3 = process.env.TRUST_3 === "true";

  console.log("🔐 Setting trust models...");
  agent.setTrust(TRUST_1, TRUST_2, TRUST_3);

  // ---- Status flags ----
  // Best practice: Keep active=false until production-ready
  const AGENT_ACTIVE = process.env.AGENT_ACTIVE === "true";
  const X402_SUPPORT = process.env.X402_SUPPORT === "true";

  agent.setActive(AGENT_ACTIVE);
  agent.setX402Support(X402_SUPPORT);

  // ---- Register on-chain with IPFS ----
  console.log("⛓️  Registering agent on Base Mainnet...");
  console.log("   This will:");
  console.log("   1. Mint agent NFT on-chain");
  console.log("   2. Upload metadata to IPFS");
  console.log("   3. Set agent URI on-chain");
  console.log("");

  const txHandle = await agent.registerIPFS();
  const { result } = await txHandle.waitMined();

  // ---- Set agent wallet via setAgentWallet() ----
  console.log("");
  console.log("🔐 Setting agent wallet via setAgentWallet()...");
  const walletTx = await agent.setWallet(agentWallet);
  if (!walletTx) throw new Error("walletTx is undefined");
  await walletTx.waitMined();

  // ---- Output results ----
  console.log("");
  console.log("✅ Agent registered successfully!");
  console.log("");
  console.log("🆔 Agent ID:", result.agentId);
  console.log("📄 Agent URI:", result.agentURI);
  console.log("");

  console.log("🌐 View your agent on 8004scan:");
  const agentIdNum = result.agentId?.split(":")[1] || result.agentId;
  console.log(`   https://www.8004scan.io/agents/base/${agentIdNum}`);
  console.log("");

  console.log("📋 Next steps:");
  console.log("   1. Update AGENT_CONFIG endpoints with your production URLs");
  console.log("   2. Run `npm run start:a2a` to start your A2A server");
  console.log("   3. Deploy your agent to a public URL");

  if (debug) {
    console.log("");
    console.log("🐛 DEBUG:");
    console.log("RPC URL:", rpcUrl);
    console.log("Trust flags:", { TRUST_1, TRUST_2, TRUST_3 });
    console.log("Agent active:", AGENT_ACTIVE, "X402:", X402_SUPPORT);
  }
}

main().catch((error: any) => {
  const msg = typeof error?.message === "string" ? error.message : "Unknown error";
  console.error("❌ Registration failed:", msg);

  // Only print stack when DEBUG=true
  if (process.env.DEBUG === "true" && typeof error?.stack === "string") {
    console.error(error.stack);
  }

  process.exit(1);
});
