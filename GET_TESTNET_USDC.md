# 获取 Base Sepolia 测试网 USDC

## USDC 合约地址

**Base Sepolia USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

查看合约：https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e

---

## 方法 1: Circle 官方水龙头 ⭐ 推荐

这是最简单、最可靠的方式。

**网址**: https://faucet.circle.com/

**特点**:
- ✅ 官方 Circle 提供
- ✅ 每小时可领取 10 USDC
- ✅ 支持多个测试网（包括 Base Sepolia）
- ✅ 需要连接钱包

**步骤**:
1. 访问 https://faucet.circle.com/
2. 连接你的 MetaMask 钱包（确保切换到 Base Sepolia 网络）
3. 选择 "Base Sepolia" 网络
4. 点击 "Get USDC" 按钮
5. 等待交易确认（1-2 分钟）

---

## 方法 2: LearnWeb3 水龙头

**网址**: https://learnweb3.io/faucets/base_sepolia_usdc/

**特点**:
- ✅ 每天可领取 1 USDC
- ✅ 免费且简单
- ⚠️ 额度较小

**步骤**:
1. 访问 https://learnweb3.io/faucets/base_sepolia_usdc/
2. 输入你的钱包地址
3. 完成验证（如果需要）
4. 等待 USDC 到账

---

## 方法 3: 通过 Blockscout 直接 Mint (高级)

如果合约支持公开 mint，你可以直接通过区块链浏览器调用 mint 函数。

**网址**: https://base-sepolia.blockscout.com/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e

**步骤**:
1. 访问上述 Blockscout 链接
2. 切换到 "Write Contract" 或 "Write Proxy" 标签
3. 连接钱包
4. 查找 `mint` 或类似函数
5. 输入你的地址和金额
6. 执行交易

⚠️ **注意**: 不是所有 USDC 测试合约都开放 public mint，这取决于合约配置。

---

## 方法 4: 从 Ethereum Sepolia 桥接

如果你在 Ethereum Sepolia 上有 USDC，可以桥接到 Base Sepolia。

**Base 官方桥**: https://bridge.base.org/

**步骤**:
1. 在 Ethereum Sepolia 上获取 USDC (Circle 水龙头支持)
2. 访问 Base 桥接页面
3. 连接钱包并确保在 Ethereum Sepolia 网络
4. 选择 USDC 并输入金额
5. 确认桥接交易
6. 等待 10-20 分钟（跨链需要时间）

---

## 前置条件：获取 Base Sepolia ETH

在领取 USDC 之前，你需要一些 Base Sepolia ETH 用于支付 gas 费用。

### Base Sepolia ETH 水龙头:

1. **Coinbase Wallet Faucet** (推荐)
   - https://portal.cdp.coinbase.com/products/faucet
   - 需要 Coinbase 账户
   - 每天最多 0.2 ETH

2. **Alchemy Faucet**
   - https://www.alchemy.com/faucets/base-sepolia
   - 需要 Alchemy 账户
   - 每天 0.5 ETH

3. **LearnWeb3**
   - https://learnweb3.io/faucets/base_sepolia/
   - 简单快速

4. **QuickNode**
   - https://faucet.quicknode.com/base/sepolia
   - 多个测试网支持

---

## 添加 Base Sepolia 网络到 MetaMask

如果你的 MetaMask 还没有 Base Sepolia 网络：

**方式 1: 自动添加**
- 访问 https://chainlist.org/
- 搜索 "Base Sepolia"
- 点击 "Add to MetaMask"

**方式 2: 手动添加**
- 网络名称: `Base Sepolia`
- RPC URL: `https://sepolia.base.org`
- Chain ID: `84532`
- 货币符号: `ETH`
- 区块浏览器: `https://sepolia.basescan.org`

---

## 验证 USDC 余额

### 在 MetaMask 中添加 USDC:
1. 打开 MetaMask
2. 切换到 Base Sepolia 网络
3. 点击 "Import tokens"
4. 输入合约地址: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
5. Token Symbol 会自动填充为 "USDC"
6. 点击 "Add Custom Token"

### 使用命令行查询:
```bash
npx hardhat console --network baseSepolia
```

```javascript
const usdc = await ethers.getContractAt(
  "IERC20",
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
);
const balance = await usdc.balanceOf("YOUR_ADDRESS");
console.log(ethers.formatUnits(balance, 6), "USDC");
```

---

## 推荐流程

按照以下顺序操作最顺利：

1. ✅ **获取 Base Sepolia ETH** (用于 gas)
   - 使用 Coinbase 或 Alchemy 水龙头

2. ✅ **获取 Base Sepolia USDC**
   - 使用 Circle 官方水龙头（最推荐）
   - 每小时 10 USDC，足够测试

3. ✅ **验证余额**
   - 在 MetaMask 中添加 USDC token
   - 确认能看到余额

4. ✅ **存入 AEP2 钱包**
   ```bash
   npm run deposit
   ```

---

## 常见问题

### Q: 水龙头显示 "Rate limited" 或 "Already claimed"
**A**: 每个水龙头都有时间限制。Circle 是每小时，LearnWeb3 是每天。等待冷却时间后再试。

### Q: 交易一直 pending
**A**: Base Sepolia 有时会拥堵。可以：
- 等待更长时间（5-10 分钟）
- 提高 gas price
- 使用不同的 RPC 端点

### Q: 合约地址在 MetaMask 中无法导入
**A**: 确保：
- 已切换到 Base Sepolia 网络
- 地址正确: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- 网络连接正常

### Q: 需要多少 USDC 进行测试？
**A**:
- 每次 API 调用成本: 0.001 USDC
- 建议充值: 1-10 USDC（足够测试 1000-10000 次）
- Circle 水龙头每小时给 10 USDC，非常充足

---

## 有用的链接

- **Base Sepolia 浏览器**: https://sepolia.basescan.org
- **Base Sepolia Blockscout**: https://base-sepolia.blockscout.com
- **Circle USDC 文档**: https://developers.circle.com/stablecoins
- **Base 官方文档**: https://docs.base.org/

---

需要帮助？检查：
- 钱包是否在正确的网络（Base Sepolia）
- 是否有足够的 ETH 支付 gas
- RPC 连接是否正常
- 水龙头是否在冷却期
