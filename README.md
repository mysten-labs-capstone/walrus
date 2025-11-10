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

## 🌱 **Future Features & Planned Enhancements**

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

This project is licensed under the **MIT License** — see the [`LICENSE`](./LICENSE) file for details. 
