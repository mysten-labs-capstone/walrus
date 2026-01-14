// client/src/scripts/utils/paymentService.ts
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export interface PaymentOptions {
  amount: bigint;
  currency: "SUI" | "WAL";
  recipient?: string; // Optional: for direct payments
}

export interface PaymentResult {
  success: boolean;
  transactionDigest?: string;
  error?: string;
  amountPaid: bigint;
  currency: string;
}

// WAL token package and type on testnet
const WAL_PACKAGE_ID = "0x0b7a2d3e0c2f8b5e8a9c1f3d6e8b2a4c7e9f1b3d5e7a9c2e4f6b8d0a2c4e6f8";
const WAL_COIN_TYPE = `${WAL_PACKAGE_ID}::wal::WAL`;

export class PaymentService {
  constructor(
    private suiClient: SuiClient,
    private signer: Ed25519Keypair
  ) {}

  /**
   * Calculate storage cost based on file size and epochs
   */
  calculateStorageCost(
    fileSizeBytes: number,
    epochs: number = 3
  ): { sui: bigint; wal: bigint } {
    // Approximate costs (adjust based on actual Walrus pricing)
    // 1 epoch ≈ 14 days on testnet
    const MIN_GAS = 1_000_000; // Minimum 0.001 SUI for gas
    const bytesPerMist = 1_000; // 1000 MIST per MB per epoch
    const sizeInMB = fileSizeBytes / (1024 * 1024);
    
    // Calculate in MIST (1 SUI = 1_000_000_000 MIST)
    const costInMist = Math.ceil(sizeInMB * bytesPerMist * epochs);
    
    // Ensure minimum gas budget
    const suiCost = BigInt(Math.max(costInMist, MIN_GAS));
    const walCost = BigInt(Math.max(Math.floor(costInMist * 0.5), MIN_GAS));

    return { sui: suiCost, wal: walCost };
  }

  /**
   * Check user's SUI balance
   */
  async getSuiBalance(address: string): Promise<bigint> {
    try {
      const balance = await this.suiClient.getBalance({
        owner: address,
        coinType: "0x2::sui::SUI",
      });
      return BigInt(balance.totalBalance);
    } catch (error) {
      console.warn("Warning: Could not fetch SUI balance");
      return BigInt(0);
    }
  }

  /**
   * Check user's WAL balance
   */
  async getWalBalance(address: string): Promise<bigint> {
    try {
      const balance = await this.suiClient.getBalance({
        owner: address,
        coinType: WAL_COIN_TYPE,
      });
      return BigInt(balance.totalBalance);
    } catch (error) {
      // WAL might not exist, this is okay
      return BigInt(0);
    }
  }

  /**
   * Get all user balances
   */
  async getAllBalances(address: string): Promise<{
    sui: bigint;
    wal: bigint;
  }> {
    const [sui, wal] = await Promise.all([
      this.getSuiBalance(address),
      this.getWalBalance(address),
    ]);
    return { sui, wal };
  }

  /**
   * Pay for storage using SUI
   */
  async payWithSui(options: PaymentOptions): Promise<PaymentResult> {
    try {
      const signerAddress = this.signer.toSuiAddress();
      const balance = await this.getSuiBalance(signerAddress);

      // Need to account for gas fees
      const MIN_GAS_BUDGET = BigInt(5_000_000); // 0.005 SUI for transaction gas
      const totalNeeded = options.amount + MIN_GAS_BUDGET;

      if (balance < totalNeeded) {
        return {
          success: false,
          error: `Insufficient SUI balance. Required: ${this.formatBalance(totalNeeded)} SUI (${this.formatBalance(options.amount)} + ${this.formatBalance(MIN_GAS_BUDGET)} gas), Available: ${this.formatBalance(balance)} SUI`,
          amountPaid: BigInt(0),
          currency: "SUI",
        };
      }

      const tx = new Transaction();
      tx.setGasBudget(Number(MIN_GAS_BUDGET));

      if (options.recipient) {
        // Pay to specific recipient (e.g., storage provider)
        const [coin] = tx.splitCoins(tx.gas, [options.amount]);
        tx.transferObjects([coin], options.recipient);
      }
      // If no recipient, the gas budget acts as the payment (burned)

      console.log("📝 Signing and executing payment transaction...");
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.signer,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      const success = result.effects?.status?.status === "success";
      
      if (!success) {
        const errorMsg = result.effects?.status?.error || "Transaction failed with unknown error";
        return {
          success: false,
          error: errorMsg,
          amountPaid: BigInt(0),
          currency: "SUI",
        };
      }

      return {
        success: true,
        transactionDigest: result.digest,
        amountPaid: options.amount,
        currency: "SUI",
      };
    } catch (error) {
      console.error("💥 Payment error details:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        amountPaid: BigInt(0),
        currency: "SUI",
      };
    }
  }

  /**
   * Pay for storage using WAL tokens
   */
  async payWithWal(options: PaymentOptions): Promise<PaymentResult> {
    try {
      const signerAddress = this.signer.toSuiAddress();
      const balance = await this.getWalBalance(signerAddress);

      if (balance < options.amount) {
        return {
          success: false,
          error: `Insufficient WAL balance. Required: ${options.amount}, Available: ${balance}`,
          amountPaid: BigInt(0),
          currency: "WAL",
        };
      }

      if (!options.recipient) {
        return {
          success: false,
          error: "Recipient address required for WAL payments",
          amountPaid: BigInt(0),
          currency: "WAL",
        };
      }

      const tx = new Transaction();

      // Get WAL coins owned by the signer
      const walCoins = await this.suiClient.getCoins({
        owner: signerAddress,
        coinType: WAL_COIN_TYPE,
      });

      if (walCoins.data.length === 0) {
        return {
          success: false,
          error: "No WAL coins found in wallet",
          amountPaid: BigInt(0),
          currency: "WAL",
        };
      }

      // Merge coins if multiple
      if (walCoins.data.length > 1) {
        const primaryCoin = walCoins.data[0].coinObjectId;
        const coinsToMerge = walCoins.data.slice(1).map((c) => c.coinObjectId);
        tx.mergeCoins(primaryCoin, coinsToMerge);
      }

      const primaryCoin = walCoins.data[0].coinObjectId;
      const [coin] = tx.splitCoins(tx.object(primaryCoin), [options.amount]);
      tx.transferObjects([coin], options.recipient);

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.signer,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      return {
        success: result.effects?.status?.status === "success",
        transactionDigest: result.digest,
        amountPaid: options.amount,
        currency: "WAL",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        amountPaid: BigInt(0),
        currency: "WAL",
      };
    }
  }

  /**
   * Format balance for display (converts MIST/smallest unit to full token)
   */
  formatBalance(balance: bigint, decimals: number = 9): string {
    const divisor = BigInt(10 ** decimals);
    const whole = balance / divisor;
    const fraction = balance % divisor;
    return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
  }
}