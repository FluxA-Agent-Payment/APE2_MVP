import { expect } from "chai";
import { ethers } from "hardhat";
import { AEP2DebitWallet } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AEP2DebitWallet", function () {
  let wallet: AEP2DebitWallet;
  let owner: SignerWithAddress;
  let sp: SignerWithAddress;
  let user: SignerWithAddress;
  let payee: SignerWithAddress;
  let mockToken: any;

  beforeEach(async function () {
    [owner, sp, user, payee] = await ethers.getSigners();

    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock USDC", "USDC", 6);

    // Deploy AEP2DebitWallet
    const AEP2DebitWallet = await ethers.getContractFactory("AEP2DebitWallet");
    wallet = await AEP2DebitWallet.deploy();

    // Authorize SP
    await wallet.setSP(sp.address, true);

    // Mint and approve tokens for user
    await mockToken.mint(user.address, ethers.parseUnits("1000", 6));
    await mockToken.connect(user).approve(await wallet.getAddress(), ethers.parseUnits("1000", 6));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await wallet.owner()).to.equal(owner.address);
    });

    it("Should authorize SP correctly", async function () {
      expect(await wallet.sp(sp.address)).to.be.true;
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits", async function () {
      const amount = ethers.parseUnits("10", 6);
      await wallet.connect(user).deposit(mockToken.target, amount);

      expect(await wallet.balances(user.address, mockToken.target)).to.equal(amount);
    });

    it("Should reject zero deposits", async function () {
      await expect(
        wallet.connect(user).deposit(mockToken.target, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("10", 6);
      await wallet.connect(user).deposit(mockToken.target, amount);
    });

    it("Should request withdrawal correctly", async function () {
      const amount = ethers.parseUnits("5", 6);
      await wallet.connect(user).requestWithdraw(mockToken.target, amount);

      const lock = await wallet.withdrawLocks(user.address, mockToken.target);
      expect(lock.locked).to.equal(amount);
    });

    it("Should execute withdrawal after delay", async function () {
      const amount = ethers.parseUnits("5", 6);
      await wallet.connect(user).requestWithdraw(mockToken.target, amount);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [3 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      await wallet.connect(user).executeWithdraw(mockToken.target, user.address);

      const balance = await mockToken.balanceOf(user.address);
      expect(balance).to.equal(ethers.parseUnits("995", 6)); // 1000 - 10 + 5
    });
  });

  describe("Settlement", function () {
    let domain: any;
    let types: any;

    beforeEach(async function () {
      // Deposit funds
      const amount = ethers.parseUnits("10", 6);
      await wallet.connect(user).deposit(mockToken.target, amount);

      // Setup EIP-712 domain
      domain = {
        name: "AEP2DebitWallet",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await wallet.getAddress(),
      };

      types = {
        Mandate: [
          { name: "owner", type: "address" },
          { name: "token", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "ref", type: "bytes32" },
        ],
      };
    });

    it("Should settle with valid mandate", async function () {
      const mandate = {
        owner: user.address,
        token: mockToken.target,
        payee: payee.address,
        amount: ethers.parseUnits("1", 6).toString(),
        nonce: 1n,
        deadline: Math.floor(Date.now() / 1000) + 600,
        ref: ethers.id("test-ref"),
      };

      const signature = await user.signTypedData(domain, types, mandate);

      await wallet.connect(sp).settle(mandate, signature);

      const payeeBalance = await mockToken.balanceOf(payee.address);
      expect(payeeBalance).to.equal(ethers.parseUnits("1", 6));
    });

    it("Should reject expired mandate", async function () {
      const mandate = {
        owner: user.address,
        token: mockToken.target,
        payee: payee.address,
        amount: ethers.parseUnits("1", 6).toString(),
        nonce: 1n,
        deadline: Math.floor(Date.now() / 1000) - 1, // Expired
        ref: ethers.id("test-ref"),
      };

      const signature = await user.signTypedData(domain, types, mandate);

      await expect(
        wallet.connect(sp).settle(mandate, signature)
      ).to.be.revertedWith("Mandate expired");
    });

    it("Should reject reused nonce", async function () {
      const mandate = {
        owner: user.address,
        token: mockToken.target,
        payee: payee.address,
        amount: ethers.parseUnits("1", 6).toString(),
        nonce: 1n,
        deadline: Math.floor(Date.now() / 1000) + 600,
        ref: ethers.id("test-ref"),
      };

      const signature = await user.signTypedData(domain, types, mandate);

      await wallet.connect(sp).settle(mandate, signature);

      await expect(
        wallet.connect(sp).settle(mandate, signature)
      ).to.be.revertedWith("Nonce already used");
    });

    it("Should reject unauthorized SP", async function () {
      const mandate = {
        owner: user.address,
        token: mockToken.target,
        payee: payee.address,
        amount: ethers.parseUnits("1", 6).toString(),
        nonce: 1n,
        deadline: Math.floor(Date.now() / 1000) + 600,
        ref: ethers.id("test-ref"),
      };

      const signature = await user.signTypedData(domain, types, mandate);

      await expect(
        wallet.connect(user).settle(mandate, signature)
      ).to.be.revertedWith("Not authorized SP");
    });
  });
});
