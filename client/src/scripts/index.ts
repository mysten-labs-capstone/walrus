import { uploadFile } from "./upload.js";
import { downloadBlob } from "./download.js";

const [, , command, ...args] = process.argv;

async function main(): Promise<void> {
  if (command === "upload") {
    if (!args[0]) {
      console.error("Error: Please provide a file path");
      process.exit(1);
    }
    await uploadFile(args[0]);
  } else if (command === "download") {
    if (!args[0]) {
      console.error("Error: Please provide a blob ID");
      process.exit(1);
    }
    await downloadBlob(args[0], args[1] ?? ".", args[2]);
  } else {
    console.log(`Usage:
  upload <path>                      Upload a file (with validation)
  download <blobId> [dir] [filename] Download a blob
`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:");
  
  if (error instanceof Error) {
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
  } else if (typeof error === 'object' && error !== null) {
    console.error("Error details:", error);
    console.error("Error keys:", Object.keys(error));
  } else {
    console.error("Raw error:", String(error));
  }
  
  process.exit(1);
});