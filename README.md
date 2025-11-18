# Walrus-Vault
A TypeScript-based webapp that automates uploading, validating, and downloading files on the Sui blockchain via Walrus. The goal of Walrus-Vault is to maintain the benifits of a centralized file storage system (encryption, fast upload/download speeds, simplicity, user-friendly design) while also incorporating a decentralized aspect to prevent lost files in case of a system failure.

## Developers
Neil Roy, Kevin Lee, Edwin Medrano Villela, Awin Zhang, Suhrit Padakanti

---
## 🚀 Features
🔐 Secure file upload via AES-GCM encryption

📂 File validation before upload (size, type, extension)

⬇️ Download and restore files from cache or via BlobID

🔓 User login with username and password

💵 Conversion from SUI to USD with real-time conversion rates

🗂️ Ability to upload multiple files at once using the lazy upload queue

⚙️ Environment-based config via .env

🧩 Modular TypeScript structure for easy expansion

---
## Project Structure
```
walrus/
├── client/                           # Frontend React application
│   ├── src/
│   │   ├── App.tsx                  # Main application component
│   │   ├── WalrusApp.tsx            # Walrus storage interface component
│   │   ├── auth/                    # Authentication context and logic
│   │   ├── components/              # Reusable React components
│   │   │   ├── PrivateKeyGate.tsx  # Authentication gate component
│   │   │   ├── SessionSigner.tsx   # Session management component
│   │   │   ├── UploadSection.tsx   # File upload interface
│   │   │   ├── DownloadSection.tsx # File download interface
│   │   │   └── RecentUploads.tsx   # Display recent uploads
│   │   ├── config/                  # Configuration files
│   │   │   └── api.ts              # API endpoint configuration
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── scripts/                 # CLI utility scripts
│   │   │   ├── upload.ts           # Command-line upload script
│   │   │   ├── download.ts         # Command-line download script
│   │   │   └── utils/              # Shared utilities for scripts
│   │   ├── services/                # API service layer
│   │   ├── index.tsx                # React entry point
│   │   └── index.css                # Global styles
│   ├── legacy/                      # Legacy wallet-based implementations
│   │   ├── App.wallet.tsx          # Old wallet-connected app
│   │   └── WalrusApp.wallet.tsx    # Old wallet-based Walrus app
│   ├── public/                      # Static assets
│   │   ├── favicon.ico             # Site favicon
│   │   ├── manifest.json           # PWA manifest
│   │   ├── _headers                # Netlify headers configuration
│   │   └── _redirects              # Netlify redirect rules
│   ├── blob-metadata.json           # Local metadata for uploaded blobs
│   ├── package.json                 # Frontend dependencies
│   ├── tsconfig.json                # TypeScript configuration
│   ├── vite.config.ts               # Vite build configuration
│   └── README.md                    # Client documentation
│
├── server/                           # Backend Next.js API
│   ├── app/
│   │   └── api/                     # API route handlers
│   │       ├── upload/
│   │       │   └── route.ts        # Upload endpoint
│   │       ├── download/
│   │       │   └── route.ts        # Download endpoint
│   │       ├── verify/
│   │       │   └── route.ts        # Verify blob endpoint
│   │       ├── balance/
│   │       │   └── route.ts        # Get wallet balance endpoint
│   │       └── _utils/
│   │           └── cors.ts         # CORS helper utilities
│   ├── utils/                       # Shared utility functions
│   │   ├── walrusClient.ts         # Walrus SDK initialization
│   │   └── priceConverter.ts       # SUI/WAL to USD conversion
│   ├── scripts/                     # Development and testing scripts
│   │   ├── testSigner.ts           # Test wallet signer setup
│   │   └── testWalrus.ts           # Test Walrus connectivity
│   ├── package.json                 # Backend dependencies
│   ├── tsconfig.json                # TypeScript configuration
│   ├── next.config.mjs              # Next.js configuration (includes WASM setup)
│   ├── vercel.json                  # Vercel deployment configuration
│   └── README.md                    # Server documentation
│
├── docs/                             # Project documentation
│   └── Project Vision Document.pdf  # Project overview and goals
│
├── .env                              # Environment variables (not in git)
├── netlify.toml                      # Netlify deployment configuration
├── package.json                      # Root package.json (if applicable)
└── README.md                         # Main project documentation
```

### Key Components

#### Frontend (Client)
- **React + Vite**: Modern React application with fast HMR
- **Authentication**: Private key-based authentication system
- **Upload/Download UI**: User-friendly interface for Walrus storage operations
- **CLI Scripts**: Command-line tools for direct Walrus interactions
- **Service Layer**: Abstracted API communication with backend

#### Backend (Server)
- **Next.js API Routes**: API endpoints for Walrus operations
- **Walrus SDK Integration**: Direct integration with `@mysten/walrus`
- **Price Conversion**: Real-time SUI/WAL to USD conversion
- **CORS Support**: Configured for cross-origin requests from frontend
- **Retry Logic**: Automatic retry for downloads with exponential backoff

#### Configuration Files
- **`.env`**: Stores `SUI_PRIVATE_KEY`, `NETWORK`, and `RPC_URL`
- **`netlify.toml`**: Frontend deployment configuration
- **`vercel.json`**: Backend deployment configuration
- **WASM Support**: Special webpack config in `next.config.mjs` for Walrus SDK

### Deployment Architecture
- **Frontend**: Deployed on Netlify
- **Backend**: Deployed on Vercel
- **Storage**: Decentralized storage on Walrus testnet/mainnet
  
---
## 📚 **Resources**

- 🧩 [Mysten Labs — Walrus Documentation](https://docs.wal.app)  
- 🪙 [Mysten Labs — Sui SDK & Network Docs](https://docs.sui.io/)  
- ⚙️ [Node.js Process & CLI Arguments](https://nodejs.org/api/process.html#processargv)  
- 💻 [TypeScript Language Reference](https://www.typescriptlang.org/docs/)  
- 🧰 [ts-node — TypeScript Execution Environment](https://typestrong.org/ts-node/docs/)  
- 🧠 [dotenv — Environment Variable Loader](https://github.com/motdotla/dotenv)  
- 🐳 [Docker — Containerization Platform](https://www.docker.com/resources/what-container/)  
- 🧪 [GitHub Actions — CI/CD Automation](https://docs.github.com/en/actions)  
- 💬 [Sui Discord Community](https://discord.gg/sui)

---

### 🌱 **Future Features & Planned Enhancements**

- Mobile App for Android
- Payment via cryptocurrency
- Payment via credit/debit card
- Logged upload/download performance metrics
- Admin user login (see all metrics and total balance)


### 🔐 **Security & Privacy**
- 🔒 End-to-end client-side encryption (AES-GCM)  
- 🧠 Local encryption before upload; auto decryption on retrieval  
- 🪶 Privacy-first architecture — only upload encrypted files


### ⚡ **Performance & Caching**
- 🚀 Centralized caching proxy for faster reads/writes
- 🧩 Lazy upload --> verify files, then upload in the background
- 🧮 Smart node selection for minimal latency


### 💳 **Payments & Token Integration**
- 💰 WAL/SUI payments via master Sui wallet  
- 🪙 Pay for each file upload (from user balance)  
- 🔁 Optional renewal of expiring files


### 📊 **Analytics & Monitoring**
- 📈 Track upload/download performance metrics  
- 🧮 Visualize WAL/SUI usage & node health  
- 🪞 Build dashboard for real-time insights  


### 🔄 **Reliability & Recovery**
- 🧭 Fallback mode for direct Walrus access  
- 🧩 Self-recovery even if centralized layer fails  
- 🪶 Guaranteed data sovereignty  


### 💻 **Web Interface**
- 🖱️ Drag-and-drop upload/download dashboard  
- 📊 Live upload status and loading bar
- 🎨 Minimal React/Vite frontend  


---
## 📜 **License**

This project is licensed under the **MIT License** — see the [`LICENSE`](./LICENSE.txt) file for details. 
