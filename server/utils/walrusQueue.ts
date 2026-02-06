/**
 * Walrus Upload Queue System
 *
 * Serializes Walrus register/write operations per wallet to prevent
 * concurrent transactions from using the same gas coin object.
 *
 * On Sui, coins are objects. If two transactions try to spend the same
 * coin object concurrently, one gets locked out, causing:
 * "Transaction is rejected as invalid by more than 1/3 of validators"
 */

type QueueItem = {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

class WalrusQueue {
  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Set<string> = new Set();

  /**
   * Add a Walrus operation to the queue for a specific wallet
   * Ensures only one operation executes at a time per wallet
   */
  async enqueue<T>(
    walletAddress: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        execute: operation,
        resolve,
        reject,
      };

      // Get or create queue for this wallet
      if (!this.queues.has(walletAddress)) {
        this.queues.set(walletAddress, []);
      }

      const queue = this.queues.get(walletAddress)!;
      queue.push(item);

      // Start processing if not already running for this wallet
      if (!this.processing.has(walletAddress)) {
        this.processQueue(walletAddress);
      }
    });
  }

  /**
   * Process queued operations one at a time for a specific wallet
   */
  private async processQueue(walletAddress: string): Promise<void> {
    this.processing.add(walletAddress);

    const queue = this.queues.get(walletAddress);
    if (!queue) {
      this.processing.delete(walletAddress);
      return;
    }

    while (queue.length > 0) {
      const item = queue.shift()!;

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Small delay between operations to ensure blockchain state settles
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Cleanup empty queue
    this.queues.delete(walletAddress);
    this.processing.delete(walletAddress);
  }

  /**
   * Get current queue stats (useful for debugging)
   */
  getStats() {
    const stats: Record<string, number> = {};
    for (const [address, queue] of this.queues.entries()) {
      stats[address] = queue.length;
    }
    return {
      activeWallets: this.processing.size,
      queues: stats,
    };
  }
}

// Singleton instance shared across all requests
export const walrusQueue = new WalrusQueue();
