import prisma from "../app/api/_utils/prisma";

function isTransactionStartTimeout(error: any): boolean {
  const message = error?.message || String(error);
  return (
    error?.code === "P2028" || message.includes("Unable to start a transaction")
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deductPayment(
  userId: string,
  costUSD: number,
  description: string,
  maxRetries: number = 3,
): Promise<{ success: boolean; newBalance: number }> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { balance: true },
          });

          if (!user) {
            throw new Error("User not found");
          }

          if (user.balance < costUSD) {
            throw new Error("Insufficient balance");
          }

          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: costUSD } },
            select: { balance: true },
          });

          await tx.transaction.create({
            data: {
              userId,
              amount: -costUSD,
              currency: "USD",
              type: "debit",
              description,
              balanceAfter: updatedUser.balance,
            },
          });

          return { success: true, newBalance: updatedUser.balance };
        },
        {
          timeout: 15000,
        },
      );

      return result;
    } catch (error: any) {
      lastError = error;

      if (!isTransactionStartTimeout(error) || attempt === maxRetries) {
        break;
      }

      await delay(500 * attempt);
    }
  }

  throw lastError || new Error("Payment deduction failed");
}

export async function calculateUploadCostUSD(
  fileSizeBytes: number,
  epochs: number,
): Promise<number> {
  const sizeInGB = fileSizeBytes / (1024 * 1024 * 1024);
  const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001);
  const { getSuiPriceUSD } = await import("@/utils/priceConverter");
  const suiPrice = await getSuiPriceUSD();
  return Math.max(costSUI * suiPrice, 0.01);
}
