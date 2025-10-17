# Walrus File Storage CLI Script + React App

A shared directory that enables a simple command-line tool to upload, download and validate files on Walrus decentralized storage, and the ability to deploy our client-side app built on React and Typescript.

### Prerequisites

- Node.js v20+ installed
- A Sui wallet with testnet tokens (SUI and WAL)

## Setting Up CLI Script

1. Install dependencies:
```bash
   npm install
   npm install --save @mysten/walrus @mysten/sui
```

2. Ensure you're in `client/` and have `npx` as a dev dependency 
```bash
   cd client/
   npm install -D tsx
```

3. Create .env file
```bash
   cp .env.example .env
```

4. Generate SUI private key

    4.1 Open your keystore file to view stored keys:
    ```bash
    cat ~/.sui/sui_config/sui.keystore
    ```

    4.2 Copy one of the keys (ie. a long string like "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") from the array.

    4.3 Replace <key> with your copied key and run the conversion script to decode it into hex format: 
    ```bash
    npx tsx src/scripts/convertKeys.ts <key>
    ```
    Example
     ```bash
    npx tsx src/scripts/kevin/convertKeys.ts AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
    ```

5. Add your private key to .env
```bash
   SUI_PRIVATE_KEY=<your_private_key_here>
   NETWORK=testnet
```

6. Get testnet tokens:

- SUI facuet: https://faucet.testnet.sui.io/
- WAL get coins: 
```bash
walrus get-wal
```

## Deploying React App

1. Ensure you're in `client/`
```bash
   cd client/
```

2. Install app dependencies (if not already installed)
```bash
   npm install
```

3. Start the development app
```bash
   npm start
```
   The app (by default) will open at http://localhost:3000/.

   > If you encounter that port 3000 is already occupied, feel free to update `vite.config.ts` at:
   > ```typescript
   > server: { 
   >    port: <PORT> 
   > }
   > ```

## Usage
All CLI commands should be run from the `client/` directory.

### Upload a File
Uploads and automatically validates your file before sending it to Walrus.

Validation checks for: 
- File exists and is not empty
- File size is between 1 byte and 100 MB
- File type and extension are supported
- Warnings for large or potentially unsupported file types
```bash
npx tsx src/scripts/index.ts upload <path>
```
#### Example:
```bash
npx tsx src/scripts/index.ts upload src/scripts/myfile.txt
```

### Download a File
Downloads a file by its Blob ID and restores the original filename if metadata exists.
```bash
npx tsx src/scripts/index.ts download <blobId> [outputDir] [filename]
```

#### Example:
```bash
# Download with original filename
npx tsx src/scripts/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY

# Download to a specific directory
npx tsx src/scripts/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY ./downloads

# Download with a custom filename
npx tsx src/scripts/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY ./downloads myfile.txt
```

## Project Structure
```bash
src/scripts/
├── index.ts             # CLI entry point
├── upload.ts            # Upload logic
├── download.ts          # Download logic
├── validate.ts          # Validation tests
└── utils/
    └── fileValidator.ts # File validation logic
    └── walrusClient.ts  # Walrus client setup
```
