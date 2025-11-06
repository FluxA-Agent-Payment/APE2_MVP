const fs = require('fs');
const bs58 = require('bs58');

const keypairFile = process.argv[2];
if (!keypairFile) {
  console.error('Usage: node get-base58-key.js <keypair.json>');
  process.exit(1);
}

const keypair = JSON.parse(fs.readFileSync(keypairFile, 'utf8'));
const secretKey = Uint8Array.from(keypair);
const base58Key = bs58.encode(secretKey);
console.log(base58Key);
