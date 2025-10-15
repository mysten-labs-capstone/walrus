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
   
   Create a `.env.local` file in the backend directory:
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
**This is expected, and the blob is still uploaded (test retrival with CLI or client scripts)**


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
│       ├── verify/
│       │   └── route.ts          # Verify endpoint
│       └── balance/
│           └── route.ts          # Balance endpoint
├── utils/
│   └── walrusClient.ts           # Walrus client initialization
├── .env.local                    # Environment variables (not in git)
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
- Verify blob exists using the CLI or download endpoint (download endpoint not yet implemented)

### "Missing SUI_PRIVATE_KEY" error
- Ensure `.env.local` exists in the backend directory
- Verify the private key is in hex format with `0x` prefix
- Check the file is named exactly `.env.local` (not `.env`)

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

# You should get a response with a blobId (possibly hidden in an error message)
```

**Test the health check:**
```bash
curl http://localhost:3000/api/upload
```

Test retrieval using the CLI or the scripts in ../client/src/scripts.


## Common Commands

```bash
# Install all dependencies
npm install

# Install specific packages
npm install @mysten/sui @mysten/walrus
npm install --save-dev @types/react @types/node

# Clean and restart
rm -rf .next
npm run dev

# Check for issues
npm list

# Update packages
npm update
```


## License

MIT License - see the [LICENSE](../LICENSE) file for details.

## Authors

Neil Roy, Kevin Lee, Edwin Medrano Villela, Awin Zhang, Suhrit Padakanti
