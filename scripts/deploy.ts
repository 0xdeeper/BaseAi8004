import { ethers } from "hardhat";

async function main() {
  const Factory = await ethers.getContractFactory("AgentRegistry");
  const contract = await Factory.deploy("BaseAI Agent");

  await contract.waitForDeployment();

  console.log("Deployed to:", await contract.getAddress());
}

main();
