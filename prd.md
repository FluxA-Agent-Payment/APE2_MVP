AEP2（Agent Embedded Payment v2）方案摘要

面向实现方（Codex/Claude）：本文件简要定义本项目要做什么、各模块职责与接口，并给出最小可跑 PoC 的实现要点与文件结构指引。

⸻

第一节｜项目目标与模块需求

0. 总体目标

为 AI 原生支付 提供“嵌入式一次性支付授权（mandate）”能力：
Agent 在发起调用时，将 mandate + 签名 放入请求头；SP（Settlement Processor） 校验并承诺在“清算窗口”内完成上链结算；Debit Wallet 在链上以延迟提现模型保护 SP 清算窗口。

1. 模块划分与职责

A. 智能合约：AEP2 Debit Wallet
	•	职责：
	•	承载用户资金（ERC20，如 USDC）。
	•	支持充值 deposit、带延迟的提现 requestWithdraw/executeWithdraw。
	•	验证并执行 一次性支付授权 settle（仅 SP 角色可调用）。
	•	关键需求：
	•	移除取消提现逻辑与平台费（feeBps/feeCollector）。
	•	角色：owner 管理员可设置/吊销 SP 角色。
	•	EIP-712 验签 Mandate（见下方类型定义）。
	•	可借记余额：debitableBalance(owner, token) = 可被 settle 动用的余额（不含锁定）。
	•	安全与约束：
	•	nonce 防重放；deadline 防过期；EIP-2 防签名可塑性。
	•	仅 sp[addr]=true 地址可调用 settle。
	•	提现前需 requestWithdraw 进入锁定区，待 withdrawDelay 到期后 executeWithdraw。

B. 结算服务：SP（Settlement Processor）
	•	职责：
	•	暴露 POST /enqueue 接口：接收来自 Payee 转交的 {mandate, payerSig}。
	•	校验：
	1.	mandate 结构与 payerSig（EIP-712）合法性；
	2.	3 小时内可清算性：debitableBalance + 3h 内可解锁的 locked >= mandate.amount；
	3.	deadline 等基础风控。
	•	承诺：生成 SP 承诺签名（spEnqueueSig），承诺在“清算窗口（3h）”内完成结算。
	•	异步清算：后台 worker 消费队列，调用合约 settle 上链。
	•	关键需求：
	•	幂等键：以 mandateDigest（EIP-712 hash）作为唯一键。
	•	独立 签名格式：spEnqueueSig = signMessage( keccak256(mandateDigest, spAddress, enqueueDeadline) )。
	•	错误分类与重试（PoC 可简化为内存队列 + 简单重试）。

C. Demo Payee（商户/服务端）
	•	职责：
	•	暴露 GET /predict：返回 mock 的 ETH-USD 价格（约 4000 ± 20）。
	•	付费协议：客户端必须带请求头 X-Payment-Mandate，内含 Base64({ mandate, payerSig })。
	•	交互：收到请求后转调 SP /enqueue，成功则返回价格与 SP 回执；若无支付头，则 HTTP 402 并提示“需支付 0.001 USD”。
	•	关键需求：
	•	只做“接入层”：不直接上链；清算由 SP 承诺与异步完成。
	•	透传 SP 失败原因（如余额不足、过期等）。

D. Client（调用方/Agent 或其网关）
	•	职责：
	•	构造 Mandate 并以 EIP-712 用 owner 私钥签名得到 payerSig。
	•	将 { mandate, payerSig } Base64 编码后放入 X-Payment-Mandate 请求头，调用 Payee API。
	•	注意：
	•	mandate.amount 应换算为对应稳定币的最小单位（USDC 6 位小数）。
	•	deadline 推荐短时有效（例如 10 分钟）。

2. 数据与签名规范

Mandate（EIP-712 TypedData）

type Mandate = {
  owner:    address   // 付款人
  token:    address   // 稳定币（如 USDC）
  payee:    address   // 收款方
  amount:   uint256   // 金额（token 最小单位）
  nonce:    uint256   // 防重放
  deadline: uint256   // 授权有效期(Unix)
  ref:      bytes32   // 业务引用（订单/调用ID哈希）
}

EIP-712 Domain:
  name: "AEP2DebitWallet"
  version: "1"
  chainId: <chain id>
  verifyingContract: <wallet address>

SP 承诺签名（链下回执）

digest = EIP712.hash(domain, Mandate, mandate)
enqueueDeadline = now + 3h
message = keccak256( digest, spAddress, enqueueDeadline )
spEnqueueSig = SP.signMessage(message)

3. 关键时序（简化）

Client --(X-Payment-Mandate: base64{mandate,payerSig})--> Payee
Payee --POST /enqueue {mandate,payerSig}--> SP
SP    --校验+承诺回执(spEnqueueSig)--> Payee
Payee --返回价格+SP回执--> Client
SP(worker) --settle(mandate,payerSig)--> AEP2DebitWallet


⸻

第二节｜PoC 实现方案（代码要点与文件组织）

说明：以下为最小可跑的骨架与关键片段；实现时可直接按文件名落地。

1. 智能合约（contracts/AEP2DebitWallet.sol）
	•	版本：pragma solidity ^0.8.24;
	•	依赖：极简 IERC20 + SafeERC20
	•	公开方法：
	•	deposit(address token, uint256 amount)
	•	requestWithdraw(address token, uint256 amount)
	•	executeWithdraw(address token, address to)
	•	settle(Mandate m, bytes payerSig) onlySP
	•	debitableBalance(address owner, address token) view returns (uint256)
	•	管理：setOwner(address), setSP(address who, bool enabled)
	•	事件：
	•	Deposited, WithdrawalRequested, WithdrawalExecuted, Settled, SPSet, OwnerSet
	•	结构体：
	•	Mandate（如“第一节/数据与签名规范”）
	•	WithdrawLock { locked, unlockAt }
	•	逻辑摘录（关键点）：
	•	settle：
	•	校验 deadline、nonce 未用、payerSig == owner。
	•	校验 balances[owner][token] >= amount。
	•	扣减并 transfer(payee, amount)。
	•	debitableBalance：直接返回 balances[owner][token]（不含锁定）。
	•	角色：
	•	owner 构造期设置为 msg.sender；可后续 setOwner。
	•	sp[address]：仅其可调用 settle。

⚠️ 生产化建议：加入 Pausable、ReentrancyGuard、白名单、限额、事件索引、可升级代理等。

2. 结算服务 SP（services/sp.ts）
	•	技术栈：Node.js + TypeScript + Express + Ethers
	•	环境变量：

RPC=<your_rpc_url>
SP_PK=<sp_private_key>
WALLET_ADDR=<deployed_wallet_address>
PORT=3001


	•	ABI 片段：

[
  "function debitableBalance(address,address) view returns (uint256)",
  "function withdrawLocks(address,address) view returns (uint256 locked, uint64 unlockAt)",
  "function domainSeparator() view returns (bytes32)",
  "function settle((address,address,address,uint256,uint256,uint256,bytes32),bytes) external"
]


	•	路由：POST /enqueue
	•	入参：{ mandate: Mandate, payerSig: string }
	•	步骤：
	1.	用 ethers.verifyTypedData 复核 payerSig 与 mandate.owner。
	2.	查询链上 debitableBalance(owner, token) 与 withdrawLocks(owner, token)。
	3.	计算“3 小时内可清算性”：
available = debitable + (unlockAt <= now+3h ? locked : 0)；若 < amount → 402 INSufficient.
	4.	生成 spEnqueueSig（见第一节），返回回执 { sp, enqueueDeadline, spEnqueueSig, mandateDigest }。
	5.	将 {mandate, payerSig, receipt} 入队（内存队列 PoC）。
	•	Worker（异步任务）：
	•	定时器 setInterval(worker, 1500)。
	•	取队首：尝试 settle(mandate, payerSig)；失败则简单重试（PoC）。
	•	生产可扩展：重试策略、死信队列、状态机、观测指标。

3. Demo Payee（services/payee.ts）
	•	技术栈：Node.js + TypeScript + Express (+ node-fetch)
	•	环境变量：

SP_URL=http://localhost:3001
PORT=3002


	•	路由：GET /predict
	•	从请求头读取 X-Payment-Mandate：
	•	若缺失：返回 HTTP 402 与 {"message":"Missing X-Payment-Mandate. Price: 0.001 USD required."}
	•	若存在：Base64 解码为 {mandate, payerSig} → POST /enqueue 给 SP
	•	若 enqueue 成功：返回 {"symbol":"ETH-USD","price": 3990~4010, "spReceipt": ...}
	•	若失败：透传 SP 的错误（如余额不足、过期等）
	•	价格逻辑：price = 4000 ± 20 的随机数（mock）

4. Client（示意）
	•	生成 EIP-712 Mandate（USDC 6 位小数）与 payerSig；
	•	组装 {mandate, payerSig} → Base64 → 置入 X-Payment-Mandate；
	•	发起 GET /predict。

其他：链的话使用base测试链
