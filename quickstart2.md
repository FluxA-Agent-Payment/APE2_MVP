🔧 使用方式

  快速开始

  # 1. 安装依赖
  npm install

  # 2. 配置环境
  cp .env.example .env
  # 编辑 .env 填入私钥和地址

  # 3. 部署合约
  npm run compile
  npm run deploy

  # 4. 初始化（授权SP）
  npm run setup

  # 5. 充值 USDC
  npm run deposit

  # 6. 启动服务
  npm run sp      # Terminal 1
  npm run payee   # Terminal 2

  # 7. 测试
  npm run client  # Terminal 3