// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AEP2DebitWallet
 * @notice Debit Wallet with one-time payment mandate support for AI Agent payments
 * @dev Supports ERC20 deposits, delayed withdrawals, and settlement via EIP-712 mandates
 */
contract AEP2DebitWallet is EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // EIP-712 Type Hash for Mandate
    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "Mandate(address owner,address token,address payee,uint256 amount,uint256 nonce,uint256 deadline,bytes32 ref)"
    );

    // Mandate struct matching EIP-712 definition
    struct Mandate {
        address owner;      // Payer
        address token;      // Payment token (e.g., USDC)
        address payee;      // Recipient
        uint256 amount;     // Amount in token's smallest unit
        uint256 nonce;      // Replay protection
        uint256 deadline;   // Expiration timestamp
        bytes32 ref;        // Business reference (order/call ID hash)
    }

    // Withdraw lock for delayed withdrawal
    struct WithdrawLock {
        uint256 locked;     // Locked amount
        uint64 unlockAt;    // Unlock timestamp
    }

    // State variables
    address public owner;
    uint256 public withdrawDelay = 3 hours;

    // Balances: user => token => amount
    mapping(address => mapping(address => uint256)) public balances;

    // Withdraw locks: user => token => WithdrawLock
    mapping(address => mapping(address => WithdrawLock)) public withdrawLocks;

    // Nonce tracking: user => token => nonce => used
    mapping(address => mapping(address => mapping(uint256 => bool))) public usedNonces;

    // Settlement Processor addresses
    mapping(address => bool) public sp;

    // Events
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event WithdrawalRequested(address indexed user, address indexed token, uint256 amount, uint64 unlockAt);
    event WithdrawalExecuted(address indexed user, address indexed token, address to, uint256 amount);
    event Settled(
        address indexed owner,
        address indexed token,
        address indexed payee,
        uint256 amount,
        uint256 nonce,
        bytes32 ref
    );
    event SPSet(address indexed sp, bool enabled);
    event OwnerSet(address indexed newOwner);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlySP() {
        require(sp[msg.sender], "Not authorized SP");
        _;
    }

    constructor() EIP712("AEP2DebitWallet", "1") {
        owner = msg.sender;
    }

    /**
     * @notice Deposit tokens into the wallet
     * @param token Token address
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Request withdrawal (enters lock period)
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function requestWithdraw(address token, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender][token] >= amount, "Insufficient balance");

        WithdrawLock storage lock = withdrawLocks[msg.sender][token];
        require(lock.locked == 0, "Withdrawal already pending");

        balances[msg.sender][token] -= amount;
        lock.locked = amount;
        lock.unlockAt = uint64(block.timestamp + withdrawDelay);

        emit WithdrawalRequested(msg.sender, token, amount, lock.unlockAt);
    }

    /**
     * @notice Execute withdrawal after delay
     * @param token Token address
     * @param to Recipient address
     */
    function executeWithdraw(address token, address to) external {
        WithdrawLock storage lock = withdrawLocks[msg.sender][token];
        require(lock.locked > 0, "No pending withdrawal");
        require(block.timestamp >= lock.unlockAt, "Withdrawal not ready");

        uint256 amount = lock.locked;
        lock.locked = 0;
        lock.unlockAt = 0;

        IERC20(token).safeTransfer(to, amount);

        emit WithdrawalExecuted(msg.sender, token, to, amount);
    }

    /**
     * @notice Settle a payment using a signed mandate
     * @param m Mandate struct
     * @param payerSig Payer's EIP-712 signature
     */
    function settle(Mandate calldata m, bytes calldata payerSig) external onlySP {
        // Check deadline
        require(block.timestamp <= m.deadline, "Mandate expired");

        // Check nonce not used
        require(!usedNonces[m.owner][m.token][m.nonce], "Nonce already used");

        // Check sufficient balance
        require(balances[m.owner][m.token] >= m.amount, "Insufficient balance");

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                MANDATE_TYPEHASH,
                m.owner,
                m.token,
                m.payee,
                m.amount,
                m.nonce,
                m.deadline,
                m.ref
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(payerSig);
        require(signer == m.owner, "Invalid signature");

        // Mark nonce as used
        usedNonces[m.owner][m.token][m.nonce] = true;

        // Deduct balance and transfer
        balances[m.owner][m.token] -= m.amount;
        IERC20(m.token).safeTransfer(m.payee, m.amount);

        emit Settled(m.owner, m.token, m.payee, m.amount, m.nonce, m.ref);
    }

    /**
     * @notice Get debitable balance (excludes locked amounts)
     * @param user User address
     * @param token Token address
     * @return Available balance for settlement
     */
    function debitableBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }

    /**
     * @notice Get domain separator for EIP-712
     * @return Domain separator hash
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Set or revoke SP authorization
     * @param who SP address
     * @param enabled Authorization status
     */
    function setSP(address who, bool enabled) external onlyOwner {
        sp[who] = enabled;
        emit SPSet(who, enabled);
    }

    /**
     * @notice Transfer contract ownership
     * @param newOwner New owner address
     */
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
        emit OwnerSet(newOwner);
    }

    /**
     * @notice Set withdrawal delay
     * @param newDelay New delay in seconds
     */
    function setWithdrawDelay(uint256 newDelay) external onlyOwner {
        withdrawDelay = newDelay;
    }
}
