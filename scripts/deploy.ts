import hardhat from "hardhat";
const { ethers } = hardhat;

async function main() {
  console.log("Deploying AgentRegistry...");

  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const agent = await AgentRegistry.deploy("AgentX", "Initial memory data");

  // ethers v6: no .deployed() needed
  console.log("✅ AgentRegistry deployed at:", agent.target);

  console.log("Deploying Hello...");

  const Hello = await ethers.getContractFactory("Hello");
  const hello = await Hello.deploy();

  console.log("✅ Hello deployed at:", hello.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
