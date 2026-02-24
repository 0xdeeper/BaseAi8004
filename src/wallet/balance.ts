import { createPublicClient, http, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";

function getChain(chainId: number) {
  if (chainId === 8453) return base;
  if (chainId === 84532) return baseSepolia;
  throw new Error(`Unsupported chainId: ${chainId}`);
}

function getRpcUrl(): string {
  const url = (process.env.RPC_URL || "https://mainnet.base.org").trim();
  return url;
}

export async function getNativeBalance(address: Address, chainId = 8453) {
  const chain = getChain(chainId);

  const client = createPublicClient({
    chain,
    transport: http(getRpcUrl()),
  });

  const balance = await client.getBalance({ address });

  return balance; // bigint (wei)
}

const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";

function encodeBalanceOf(address: Address): `0x${string}` {
  const addr = address.toLowerCase().replace(/^0x/, "");
  const padded = addr.padStart(64, "0");
  return (`${ERC20_BALANCE_OF_SELECTOR}${padded}`) as `0x${string}`;
}

export async function getErc20Balance(
  tokenAddress: Address,
  walletAddress: Address,
  chainId = 8453
) {
  const chain = getChain(chainId);

  const client = createPublicClient({
    chain,
    transport: http(getRpcUrl()),
  });

  const data = encodeBalanceOf(walletAddress);

  const result = await client.call({
    to: tokenAddress,
    data,
  });

  if (!result.data) throw new Error("balanceOf call failed");

  return BigInt(result.data);
}
