# Walrus File Storage CLI Script

A simple command-line tool to upload, download, and validate files on Walrus decentralized storage.

## Prerequisites

- Node.js v20+ installed
- A Sui wallet with testnet tokens (SUI and WAL)

## Setup

1. Install dependencies:
```bash
   npm install
   npm install --save @mysten/walrus @mysten/sui
```

2. Create .env file
```bash
   cp .env.example .env
```

3. Find SUI private key

    3.1 Open your keystore file to view stored keys:
    ```bash
    cat ~/.sui/sui_config/sui.keystore
    ```

    3.2 Copy one of the keys from the array (a long string like "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").

    3.3 Paste that key into command line [key] and run the conversion script to decode it into hex format: 
    ```bash
    node --loader ts-node/esm src/scripts/kevin/convertKeys.ts <key>
    ```
    example
     ```bash
    node --loader ts-node/esm src/scripts/kevin/convertKeys.ts AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
    ```
4. Add your private key to .env
```bash
   SUI_PRIVATE_KEY=your_private_key_here
   NETWORK=testnet
```

5. Get testnet tokens:

- SUI facuet: https://faucet.testnet.sui.io/
- WAL get coins: 
```bash
walrus get-wal
```

## Usage

### Upload a File
Uploads and automatically validates your file before sending it to Walrus.

Validation checks for: 
- File exists and is not empty
- File size is between 1 byte and 100 MB
- File type and extension are supported
- Warnings for large or potentially unsupported file types
```bash
node --loader ts-node/esm src/scripts/kevin/index.ts upload <path>
```
#### Example:
```bash
node --loader ts-node/esm src/scripts/kevin/index.ts upload ./myfile.txt
```

### Download a File
Downloads a file by its Blob ID and restores the original filename if metadata exists.
```bash
node --loader ts-node/esm src/scripts/kevin/index.ts download <blobId> [outputDir] [filename]
```

#### Example:
```bash
# Download with original filename
node --loader ts-node/esm src/scripts/kevin/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY

# Download to a specific directory
node --loader ts-node/esm src/scripts/kevin/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY ./downloads

# Download with a custom filename
node --loader ts-node/esm src/scripts/kevin/index.ts download QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY ./downloads myfile.txt
```

## Project Structure
```bash
src/scripts/kevin/
├── index.ts             # CLI entry point
├── upload.ts            # Upload logic
├── download.ts          # Download logic
├── validate.ts          # Validation tests
└── utils/
    └── fileValidator.ts # File validation logic
    └── walrusClient.ts  # Walrus client setup
```
