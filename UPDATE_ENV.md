# Update Your .env File

Your contract has been successfully deployed to:
**0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912**

Please update your `.env` file with the following:

```bash
# Add this to your .env file
WALLET_ADDR=0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912
```

## Next Steps

1. **Update .env file**:
   ```bash
   # Open your .env file and add:
   WALLET_ADDR=0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912
   ```

2. **Get SP address** (from your SP wallet):
   ```bash
   # If you don't have it yet, derive from SP_PK
   # Or you can run the setup script which will show you the address
   ```

3. **Run setup to authorize SP**:
   ```bash
   npm run setup
   ```

4. **Get USDC tokens**:
   - Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Bridge from Ethereum Sepolia or use a faucet

5. **Deposit USDC**:
   ```bash
   npm run deposit
   ```

6. **Start services and test**:
   ```bash
   # Terminal 1
   npm run sp

   # Terminal 2
   npm run payee

   # Terminal 3
   npm run client
   ```

## View on Block Explorer

Your contract on Base Sepolia:
https://sepolia.basescan.org/address/0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912
