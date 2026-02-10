/**
 * Walrus Upload Queue System
 *
 * Manages concurrent Walrus uploads with the following limits:
 * - Max 6 uploads globally (across all users)
 * - Max 2 uploads per user
 * - Serializes operations per wallet to prevent coin state conflicts
 *
 * On Sui, coins are objects. If two transactions try to spend the same
 * coin object concurrently, one gets locked out, causing:
 * "Transaction is rejected as invalid by more than 1/3 of validators"
 */

type QueueItem = {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  userId?: string;
};

class WalrusQueue {
  private static readonly MAX_GLOBAL_CONCURRENT = 6; // Max uploads across all users
  private static readonly MAX_PER_USER_CONCURRENT = 2; // Max uploads per user

  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Set<string> = new Set();
  private activeUploads: Map<string, number> = new Map(); // userId -> count

  /**
   * Add a Walrus operation to the queue for a specific wallet
   * Ensures only one operation executes at a time per wallet
   * Also respects global and per-user concurrent upload limits
   */
  async enqueue<T>(
    walletAddress: string,
    operation: () => Promise<T>,
    userId?: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        execute: operation,
        resolve,
        reject,
        userId,
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
   * Respects global and per-user concurrency limits
   */
  private async processQueue(walletAddress: string): Promise<void> {
    this.processing.add(walletAddress);

    const queue = this.queues.get(walletAddress);
    if (!queue) {
      this.processing.delete(walletAddress);
      return;
    }

    while (queue.length > 0) {
      const item = queue[0]; // Peek at next item

      // Check concurrency limits before processing
      const canProcess = this.canProcessUpload(item.userId);
      if (!canProcess) {
        // Wait before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Remove from queue and process
      queue.shift();

      // Track active upload
      if (item.userId) {
        this.activeUploads.set(
          item.userId,
          (this.activeUploads.get(item.userId) || 0) + 1,
        );
      }

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        // Decrement active upload count
        if (item.userId) {
          const count = (this.activeUploads.get(item.userId) || 1) - 1;
          if (count <= 0) {
            this.activeUploads.delete(item.userId);
          } else {
            this.activeUploads.set(item.userId, count);
          }
        }
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
   * Check if we can process another upload based on concurrency limits
   */
  private canProcessUpload(userId?: string): boolean {
    // Check global limit
    const totalActive = Array.from(this.activeUploads.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (totalActive >= WalrusQueue.MAX_GLOBAL_CONCURRENT) {
      return false;
    }

    // Check per-user limit
    if (userId) {
      const userActive = this.activeUploads.get(userId) || 0;
      if (userActive >= WalrusQueue.MAX_PER_USER_CONCURRENT) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current queue stats (useful for debugging)
   */
  getStats() {
    const stats: Record<string, number> = {};
    for (const [address, queue] of this.queues.entries()) {
      stats[address] = queue.length;
    }

    const totalActive = Array.from(this.activeUploads.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      activeWallets: this.processing.size,
      queues: stats,
      totalActiveUploads: totalActive,
      activeUploadsByUser: Object.fromEntries(this.activeUploads),
      limits: {
        maxGlobal: WalrusQueue.MAX_GLOBAL_CONCURRENT,
        maxPerUser: WalrusQueue.MAX_PER_USER_CONCURRENT,
      },
    };
  }
}

// Singleton instance shared across all requests
export const walrusQueue = new WalrusQueue();
