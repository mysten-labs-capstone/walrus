# Walrus Backend API

A Next.js backend API for automated blob upload and retrieval from Walrus decentralized storage using the Sui blockchain.


## Prerequisites

- Node.js 20+ installed 
- npm
- Sui wallet with testnet/mainnet SUI tokens
- Sui private key (in hex format)

## Installation

1. **Ensure you are in the backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   npm install next react react-dom
   npm install @mysten/sui @mysten/walrus
   npm install dotenv
   ```

3. **Install TypeScript and type definitions:**
   ```bash
   npm install --save-dev typescript
   npm install --save-dev @types/react @types/node
   ```

4. **Set up environment variables:**
   
   Create a `.env` file in the mysten-labs-walrus directory:
   ```bash
   # === Network Config ===
   NETWORK=testnet
   RPC_URL=https://fullnode.testnet.sui.io:443
   WALRUS_GATEWAY=https://walrus-gateway.testnet.sui.io

   # === Keys ===
   SUI_PRIVATE_KEY=0xyour_private_key_here
   ```

5. **Start the backend:**
   ```bash
   npm run dev
   ```

6. **If build issues persist:**
   ```bash
   rm -rf .next
   npm run dev
   ```

## Dependencies

### Core Dependencies
```json
{
  "@mysten/sui": "^1.40.0",
  "@mysten/walrus": "^0.7.3",
  "dotenv": "^16.3.1",
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0"
}
```

### Dev Dependencies
```json
{
  "@types/node": "^24.7.2",
  "@types/react": "^19.2.2",
  "typescript": "^5.4.0"
}
```

## Running the Backend

1. **Development mode:**
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:3000`

2. **Production build:**
   ```bash
   npm run build
   npm start
   ```

## API Endpoints

### Upload File
**POST** `/api/upload`

Upload a file to Walrus storage.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form data with `file` field

**Example:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@path/to/your/file.txt"
```

**Response:**
```json
{
  "message": "✅ File uploaded successfully!",
  "blobId": "FUyWtFRGf1fF2vm8UgCP4OwB2nofhFxSst9zh18dQM0",
  "status": "confirmed"
}
```

**Note: This response may look something like:**
```
(base) neilroy@Neils-MacBook-Air backend % curl -X POST http://localhost:3000/api/upload -F "file=@tiny.txt"
{"error":"Too many failures while writing blob 4o6ivS3mZXb_sQFGGE-wq0G5A0AiFjvnZ4GRlmiNzRY to nodes"}%                              
```
**This is expected, and the blob is still uploaded (test retrieval with CLI or client scripts)**

---

### Download File
**POST** `/api/download`

Retrieve a file from Walrus storage by its blob ID.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body: JSON with `blobId` and optional `filename`

**Example:**
```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"blobId": "FUyWtFRGf1fF2vm8UgCP4OwB2nofhFxSst9zh18dQM0", "filename": "myfile.txt"}' \
  --output downloaded-file.txt
```

**Response:**
- Returns the raw file content as a binary stream
- Content-Type: `application/octet-stream`
- Content-Disposition header includes the filename

**Note:** The download includes automatic retry logic (up to 5 attempts) to handle cases where the blob hasn't fully replicated across storage nodes yet.

---

### Verify Blob
**GET** `/api/verify?blobId=<BLOB_ID>`

Verify if a blob exists and is accessible on Walrus storage without downloading it.

**Request:**
- Method: `GET`
- Query Parameter: `blobId` (required)

**Example:**
```bash
curl "http://localhost:3000/api/verify?blobId=FUyWtFRGf1fF2vm8UgCP4OwB2nofhFxSst9zh18dQM0"
```

**Response:**
```json
{
  "exists": true,
  "blobId": "FUyWtFRGf1fF2vm8UgCP4OwB2nofhFxSst9zh18dQM0",
  "message": "Blob exists and is accessible"
}
```

**If blob doesn't exist:**
```json
{
  "exists": false,
  "blobId": "invalid_blob_id",
  "message": "Blob not found or not yet replicated"
}
```

---

### Get Balance
**GET** `/api/balance`

Get the SUI and WAL token balances (with USD values) for the wallet configured in the `.env` file.

**Request:**
- Method: `GET`
- No parameters required

**Example:**
```bash
curl http://localhost:3000/api/balance
```

**Response:**
```json
{
  "address": "0x32e0a4b05cfbb532f0fd9ba33ff3d05e310d3eba7795fd9ca591bf9a813c85bb",
  "network": "testnet",
  "balances": {
    "sui": {
      "raw": "7148561924",
      "amount": 7.148561924,
      "formatted": "7.1486",
      "usd": 28.59,
      "formattedUSD": "$28.59",
      "symbol": "SUI"
    },
    "wal": {
      "raw": "896225000",
      "amount": 0.896225,
      "formatted": "0.8962",
      "usd": 1.79,
      "formattedUSD": "$1.79",
      "symbol": "WAL",
      "coinType": "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL"
    },
    "total": {
      "usd": 30.38,
      "formatted": "$30.38"
    }
  },
  "allCoins": [
    {
      "coinType": "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL",
      "balance": "896225000",
      "amount": 0.896225,
      "formatted": "0.8962"
    },
    {
      "coinType": "0x2::sui::SUI",
      "balance": "7148561924",
      "amount": 7.148561924,
      "formatted": "7.1486"
    }
  ]
}
```

**Note:** USD prices are fetched from CoinGecko API and cached for 60 seconds to avoid rate limiting.

---

### Health Check
**GET** `/api/upload`

Simple endpoint to verify the API is running.

**Example:**
```bash
curl http://localhost:3000/api/upload
```

**Response:**
```json
{
  "message": "Upload route is alive!"
}
```

## Project Structure

```
backend/
├── app/
│   └── api/
│       ├── upload/
│       │   └── route.ts          # Upload endpoint
│       ├── download/
│       │   └── route.ts          # Download endpoint
│       ├── verify/
│       │   └── route.ts          # Verify endpoint
│       └── balance/
│           └── route.ts          # Balance endpoint
├── utils/
│   ├── walrusClient.ts           # Walrus client initialization
│   └── priceConverter.ts         # SUI/WAL to USD conversion utilities
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

## Configuration

### next.config.mjs
The backend includes special webpack configuration to handle WASM files from the Walrus SDK:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config, { isServer }) => {
    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Add rule for .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Ensure WASM files are treated properly on server
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@mysten/walrus': 'commonjs @mysten/walrus',
      });
    }

    return config;
  },
};

export default nextConfig;
```

### DNS Configuration
The backend sets `ipv4first` DNS resolution to ensure proper connectivity with Walrus storage nodes. This is handled automatically in `utils/walrusClient.ts`.

## Important Notes

### Upload Behavior
- The API may return success even if not all storage nodes confirm immediately
- If you see a "timeout" error but the blob is still accessible, this is expected behavior (for now)
- The blob is successfully stored even if full confirmations take longer than the timeout
- The API extracts the blobId from timeout errors and returns it as a successful response

### Download Behavior
- Downloads include automatic retry logic with exponential backoff
- If a blob was just uploaded, it may take a few seconds to fully replicate
- The API will retry up to 5 times with increasing delays between attempts
- Initial delay: 2 seconds, increasing up to 10 seconds between retries

### Storage Costs
- **Testnet:** Free (requires testnet SUI tokens from faucet)
- **Mainnet:** Requires WAL tokens for storage epochs
- Each upload costs SUI gas fees + WAL storage fees (mainnet only)

### File Size Limits
- Default: No hard limits enforced by the API
- Limited by: Network conditions, available SUI/WAL tokens, and Walrus protocol limits
- Recommended: Test with small files first

## Troubleshooting

### "WASM file not found" error
```bash
rm -rf .next
npm run dev
```
Make sure your `next.config.mjs` includes the webpack WASM configuration shown above.

### "NotEnoughBlobConfirmationsError" but blob exists
This is expected behavior: (for now)
- The blob is stored successfully
- The API extracts the blobId from the error and returns success
- Verify blob exists using the CLI or download endpoint

### "Can't find enough slivers to download" error
This means the blob hasn't fully replicated yet:
- Wait 30-60 seconds after upload
- The download endpoint automatically retries with delays
- If the error persists, the blob may not have been uploaded successfully

### "Missing SUI_PRIVATE_KEY" error
- Ensure `.env` exists in the parent walrus directory
- Verify the private key is in hex format with `0x` prefix
- Check the file is named exactly `.env` (not `.env.local`)

### Upload fails immediately
- Check your wallet has sufficient SUI tokens
- Verify you're using the correct network (testnet vs mainnet)
- Ensure the RPC URL is accessible

### TypeScript errors
If you get TypeScript errors, reinstall type definitions:
```bash
npm install --save-dev @types/react @types/node typescript
```

### Module not found errors
Reinstall dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Testing

**Test the upload endpoint:**
```bash
# Create a test file
echo "Hello Walrus!" > test.txt

# Upload it
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.txt"

# You should get a response with a blobId (possibly in an error message)
```

**Test the download endpoint:**
```bash
# Download with specified filename
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"blobId": "YOUR_BLOB_ID", "filename": "downloaded.txt"}' \
  --output downloaded.txt

# Download without specified filename (uses blobId as filename)
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"blobId": "YOUR_BLOB_ID"}' \
  --output downloaded-file
```

**Test the verify endpoint:**
```bash
curl "http://localhost:3000/api/verify?blobId=YOUR_BLOB_ID"
```

**Test the balance endpoint:**
```bash
curl http://localhost:3000/api/balance
```

**Test the health check:**
```bash
curl http://localhost:3000/api/upload
```

Test retrieval using the CLI or the scripts in ../client/src/scripts.


## License

MIT License - see the [LICENSE](../LICENSE) file for details.

## Authors

Neil Roy, Kevin Lee, Edwin Medrano Villela, Awin Zhang, Suhrit Padakanti
