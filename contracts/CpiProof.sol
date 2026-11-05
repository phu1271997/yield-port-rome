// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ICrossProgramInvocation,
    CpiProgram,
    HelperProgram,
    SystemProgram
} from "@rome-protocol/rome-solidity/contracts/interface.sol";

/// @title CpiProof — Proof-of-concept: invoke SPL Memo from Solidity on Rome.
/// @notice Demonstrates a successful CPI from an EVM contract into a native
///         Solana program. This is the project's de-risking step: if this
///         settles on Solana, the CPI plumbing works end-to-end.
contract CpiProof {
    /// @notice The Solana Memo program ID (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr).
    /// @dev Stored as bytes32 for CPI precompile compatibility.
    bytes32 public immutable MEMO_PROGRAM;

    event MemoCpiSent(address indexed sender, string message, uint256 timestamp);

    constructor(bytes32 memoProgramId) {
        MEMO_PROGRAM = memoProgramId;
    }

    /// @notice Send a memo message to the Solana Memo program via CPI.
    /// @param message The message to log on Solana.
    function sendMemo(string calldata message) external {
        // Rome CPI precompile requires a non-empty accounts array.
        // We pass the contract's authority PDA as the signer.
        bytes32 callerPda = HelperProgram.pda(address(this));

        ICrossProgramInvocation.AccountMeta[] memory accounts =
            new ICrossProgramInvocation.AccountMeta[](1);
        accounts[0] = ICrossProgramInvocation.AccountMeta({
            pubkey: callerPda,
            is_signer: true,
            is_writable: false
        });

        // Instruction data is the raw UTF-8 message bytes
        bytes memory ixData = bytes(message);

        // Fire the CPI into Solana Memo program
        CpiProgram.invoke(MEMO_PROGRAM, accounts, ixData);

        emit MemoCpiSent(msg.sender, message, block.timestamp);
    }

    /// @notice Read the Rome EVM program ID from the system precompile.
    function romeEvmProgramId() external view returns (bytes32) {
        return SystemProgram.rome_evm_program_id();
    }
}
