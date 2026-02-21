// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentRegistry {
    string public agentName;
    string public memoryData;

    constructor(string memory _name, string memory _memoryData) {
        agentName = _name;
        memoryData = _memoryData;
    }
}
