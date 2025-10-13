# Walrus File Storage Automation
A TypeScript-based webapp that automates uploading, validating, and downloading files on Walrus decentralized storage using the Sui blockchain. This will also handle encryption on the client side while maintaining good performance when uploading and/or downloading.

## Developers
Neil Roy, Kevin Lee, Edwin Medrano Villela, Awin Zhang, Suhrit Padakanti

---
## 🚀 Features
🔐 Secure blob registration and upload via Walrus SDK

📂 File validation before upload (size, type, extension)

⬇️ Download and restore files from blob IDs

⚙️ Environment-based config via .env

🧩 Modular TypeScript structure for easy extension

---
## Project Structure
```bash
walrus/
├── README.md                      # Main project documentation
├── docs/                          # Store all documents related to the project 
│
└── client/
    ├── .gitignore                 # Ignore sensitive files, logs, and build artifacts
    ├── .env.example               # Template for environment variables
    ├── package.json               # Node.js project configuration
    ├── tsconfig.json              # TypeScript compiler settings
    ├── README.md                  # Client-specific documentation
    │
    └── src/
        └── scripts/
            ├── index.ts             # CLI entry point (upload/download dispatcher)
            ├── upload.ts            # Uploads validated files to Walrus
            ├── download.ts          # Downloads blobs by ID from Walrus
            ├── convertKeys.ts       # Converts Base64 Sui private key → Hex format
            │
            └── utils/
                ├── walrusClient.ts    # Initializes Sui + Walrus clients and loads .env
                └── fileValidator.ts   # File validation logic (size/type checks)
```
---
## 📚 **Resources**

- 🧩 [Mysten Labs — Walrus Documentation](https://docs.mystenlabs.com/walrus/)  
- 🪙 [Mysten Labs — Sui SDK & Network Docs](https://docs.sui.io/)  
- ⚙️ [Node.js Process & CLI Arguments](https://nodejs.org/api/process.html#processargv)  
- 💻 [TypeScript Language Reference](https://www.typescriptlang.org/docs/)  
- 🧰 [ts-node — TypeScript Execution Environment](https://typestrong.org/ts-node/docs/)  
- 🧠 [dotenv — Environment Variable Loader](https://github.com/motdotla/dotenv)  
- 🐳 [Docker — Containerization Platform](https://www.docker.com/resources/what-container/)  
- 🧪 [GitHub Actions — CI/CD Automation](https://docs.github.com/en/actions)  
- 🌐 [Walrus Testnet Faucet](https://walrus-faucet.testnet.sui.io/)  
- 💬 [Sui Discord Community](https://discord.gg/sui)

---

## 🌱 **Future Features & Planned Enhancements**

Planned upgrades aligned with the project vision for a **hybrid decentralized backup service**:


### 🔐 **Security & Privacy**
- 🔒 End-to-end client-side encryption (AES-GCM / ChaCha20-Poly1305)  
- 🧠 Local encryption before upload; auto decryption on retrieval  
- 🪶 Privacy-first architecture — encrypted blobs only  


### ⚡ **Performance & Caching**
- 🚀 Centralized caching proxy for faster reads/writes  
- 🧩 Lazy upload + sync to Walrus nodes  
- 🧮 Smart node selection for minimal latency  


### 💳 **Payments & Token Integration**
- 💰 WAL/SUI payments via Suiet Wallet Kit  
- 🪙 Subscription-based blob storage model  
- 🔁 Auto-renewal of expiring blobs  


### 🧰 **CLI & Config Improvements**
- 💬 New commands: `status`, `renew`, `encrypt`  
- ⚙️ Configurable network, encryption mode, cache prefs  
- 🧩 Enhanced help menus & validation  


### ☁️ **Hybrid Cloud Layer**
- 🧱 Metadata registry + caching backend  
- 🔐 Encrypted key management & redundancy  
- 🐳 Dockerized deployment for scaling  


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
- 🌐 Support for testnet/mainnet switching  
- 🎨 Minimal React/Vite frontend  


### 🧪 **Testing & CI/CD**
- 🧫 Unit + integration tests for all modules  
- ⚡ GitHub Actions / Docker pipelines  
- 🧰 Mock Walrus environments for local dev  


### 🌍 **Ecosystem & Interoperability**
- 🔗 Multi-network support (localnet, testnet, mainnet)  
- 🧬 IPFS / Arweave integration for hybrid backup  
- 🤝 Standardize hybrid backup APIs

---
## 📜 **License**

This project is licensed under the **MIT License** — see the [`LICENSE`](./LICENSE) file for details. 
