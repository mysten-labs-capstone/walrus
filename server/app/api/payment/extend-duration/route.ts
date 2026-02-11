import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { getSuiPriceUSD, getWalPriceUSD } from "@/utils/priceConverter";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

// Same pricing constants
const BYTES_PER_MIB = 1024 * 1024;
const FROST_PER_WAL = 1_000_000_000;
const ENCODED_MULTIPLIER = 7;
const METADATA_WAL_PER_EPOCH = 0.0007;
const MARGINAL_FROST_PER_MIB_PER_EPOCH = 66_000;
const SUI_TX = 0.005;
const PROFIT_MARKUP = 0.25;
const MARKUP_MULTIPLIER = 1 + PROFIT_MARKUP;

async function resolveBlobObjectId(
  walrusClient: any,
  suiClient: any,
  owner: string,
  blobId: string,
): Promise<string | null> {
  const { blobIdToInt } = await import("@mysten/walrus");
  const targetBlobId = blobIdToInt(blobId).toString();
  const blobType = await walrusClient.getBlobType();

  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const result = await suiClient.getOwnedObjects({
      owner,
      filter: { StructType: blobType },
      options: { showContent: true },
      cursor,
      limit: 50,
    });

    for (const entry of result.data ?? []) {
      const content = (entry as any)?.data?.content;
      const fields = content && content.fields ? content.fields : null;
      const objectBlobId = fields?.blob_id?.toString?.() ?? null;

      if (objectBlobId && objectBlobId === targetBlobId) {
        return (entry as any)?.data?.objectId ?? null;
      }
    }

    if (!result.hasNextPage) {
      break;
    }
    cursor = result.nextCursor ?? null;
    if (!cursor) {
      break;
    }
  }

  return null;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, blobId, additionalEpochs } = body; // REMOVED fileSize from here

    if (!userId || !blobId || !additionalEpochs) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (additionalEpochs <= 0) {
      return NextResponse.json(
        { error: "Additional epochs must be positive" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Get user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true, username: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    // Sanity check: ensure Prisma client and models are available
    if (!prisma || !prisma.file) {
      console.error(
        "[EXTEND DURATION] Prisma client missing file model or not initialized",
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Get file record with size
    let fileRecord = await prisma.file.findFirst({
      where: { blobId, userId },
      select: {
        blobObjectId: true,
        epochs: true,
        originalSize: true,
        filename: true,
        status: true,
      },
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    const fileSize = fileRecord.originalSize; // GET fileSize from database

    if (
      blobId.startsWith("temp_") ||
      fileRecord.status === "pending" ||
      fileRecord.status === "processing"
    ) {
      return NextResponse.json(
        {
          error:
            "Delete not available. Please wait until the upload completes before extending.",
        },
        { status: 409, headers: withCORS(req) },
      );
    }

    if (fileRecord.status === "failed") {
      return NextResponse.json(
        {
          error:
            "File failed to upload to Walrus. Please retry the upload before extending.",
        },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Calculate cost
    const encodedSize = fileSize * ENCODED_MULTIPLIER;
    const sizeMiBExact = encodedSize / BYTES_PER_MIB;
    const sizeMiBUnits = Math.max(1, Math.ceil(sizeMiBExact));

    const metadataFrostPerEpoch = Math.round(
      METADATA_WAL_PER_EPOCH * FROST_PER_WAL,
    );
    const marginalFrostPerEpoch =
      sizeMiBUnits * MARGINAL_FROST_PER_MIB_PER_EPOCH;
    const totalFrostPerEpoch = metadataFrostPerEpoch + marginalFrostPerEpoch;

    const walPerEpoch = totalFrostPerEpoch / FROST_PER_WAL;
    const walTotal = walPerEpoch * additionalEpochs;

    // Get current prices
    const [sui, wal] = await Promise.all([getSuiPriceUSD(), getWalPriceUSD()]);

    const suiTxUSD = SUI_TX * sui;
    const walUSD = wal * walTotal;
    const totalUSD = walUSD + suiTxUSD;

    const finalCost = Math.max(0.01, MARKUP_MULTIPLIER * totalUSD);

    // Check if user has sufficient balance
    if (user.balance < finalCost) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          required: finalCost,
          current: user.balance,
        },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Check epoch limits
    const currentEpochs = fileRecord.epochs || 3;
    const newTotalEpochs = currentEpochs + additionalEpochs;

    if (newTotalEpochs > 53) {
      return NextResponse.json(
        {
          error: "Cannot extend beyond 53 epochs maximum",
          current: currentEpochs,
          requested: additionalEpochs,
          total: newTotalEpochs,
          maximum: 53,
        },
        { status: 400, headers: withCORS(req) },
      );
    }

    const { initWalrus } = await import("@/utils/walrusClient");
    const { walrusClient, signer, suiClient } = await initWalrus();
    const signerAddress = signer.toSuiAddress();

    // Extend on Walrus network (requires blobObjectId)
    if (!fileRecord.blobObjectId) {
      const resolvedBlobObjectId = await resolveBlobObjectId(
        walrusClient,
        suiClient,
        signerAddress,
        blobId,
      );

      if (!resolvedBlobObjectId) {
        return NextResponse.json(
          {
            error:
              "Missing blobObjectId - cannot extend on wallet. Please re-upload or contact support.",
          },
          { status: 400, headers: withCORS(req) },
        );
      }

      await prisma.file.updateMany({
        where: { blobId, userId },
        data: { blobObjectId: resolvedBlobObjectId },
      });

      fileRecord = {
        ...fileRecord,
        blobObjectId: resolvedBlobObjectId,
      };
    }

    let walrusExtended = false;
    try {
      // Get WAL coins for payment - extendBlobTransaction requires WAL coins
      // The SDK will try to consume WAL from signer by default, but we need to ensure coins exist
      // Get all balances to find WAL coin type
      const allBalances = await suiClient.getAllBalances({
        owner: signerAddress,
      });

      const walBalance = allBalances.find((coin) =>
        coin.coinType.toLowerCase().includes("wal"),
      );

      if (!walBalance || BigInt(walBalance.totalBalance) === BigInt(0)) {
        return NextResponse.json(
          {
            error:
              "Insufficient WAL balance on server wallet. The server needs WAL tokens to extend storage on Walrus network.",
            detail:
              "Please contact support to add WAL tokens to the server wallet.",
          },
          { status: 500, headers: withCORS(req) },
        );
      }

      // Get WAL coins - need to determine the coin type from the balance
      const walCoinType = walBalance.coinType;
      const walCoins = await suiClient.getCoins({
        owner: signerAddress,
        coinType: walCoinType,
      });

      if (walCoins.data.length === 0) {
        return NextResponse.json(
          {
            error: "No WAL coins found in server wallet",
            detail:
              "Please contact support to add WAL tokens to the server wallet.",
          },
          { status: 500, headers: withCORS(req) },
        );
      }

      // Use the first WAL coin (or merge if multiple)
      // The Walrus SDK will handle consuming the appropriate amount
      const walCoinId = walCoins.data[0].coinObjectId;

      // Create transaction with explicit WAL coin
      // Note: walCoin parameter accepts TransactionObjectArgument which can be:
      // - A string (object ID) - try this first
      // - A transaction object reference (tx.object(id)) - but tx doesn't exist yet
      // The SDK documentation says it will "consume WAL from signer by default" if not provided,
      // but we're explicitly providing it to avoid the destroy_zero error
      const tx = await walrusClient.extendBlobTransaction({
        blobObjectId: fileRecord.blobObjectId,
        epochs: additionalEpochs,
        walCoin: walCoinId as any, // Pass coin object ID - TypeScript may complain but runtime should accept string
      });

      tx.setSender(signerAddress);
      tx.setGasBudget(100_000_000);

      await signer.signAndExecuteTransaction({
        transaction: tx as any,
        client: suiClient as any,
      });

      walrusExtended = true;
    } catch (err: any) {
      console.error(`Failed to extend blob on Walrus network:`, err);

      // Provide more helpful error messages
      let errorMessage = err?.message || "Failed to extend on wallet";
      if (
        err?.message?.includes("destroy_zero") ||
        err?.message?.includes("balance")
      ) {
        errorMessage =
          "Insufficient WAL balance on server wallet. The server needs WAL tokens to extend storage. Please contact support.";
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Deduct cost, update file epochs, and record a transaction atomically
    let updatedUser: { id: string; username: string; balance: number } | null =
      null;
    try {
      await prisma.$transaction(
        async (tx) => {
          updatedUser = await tx.user.update({
            where: { id: userId },
            data: {
              balance: {
                decrement: finalCost,
              },
            },
            select: {
              id: true,
              username: true,
              balance: true,
            },
          });

          await tx.file.updateMany({
            where: { blobId, userId },
            data: {
              epochs: {
                increment: additionalEpochs,
              },
            },
          });

          const additionalDays = additionalEpochs * 14;
          const filenameForDesc =
            fileRecord.filename || blobId || "unknown file";
          await tx.transaction.create({
            data: {
              userId,
              amount: -Math.abs(finalCost),
              currency: "USD",
              type: "debit",
              description: `Extend: ${filenameForDesc} for ${additionalDays} days`,
              reference: blobId,
              balanceAfter: updatedUser!.balance,
            },
          });
        },
        {
          timeout: 30000, // 30s — avoid "Transaction already closed" under load (was 15s)
        },
      );
    } catch (txErr: any) {
      console.error("Failed to apply extend-duration transactionally:", txErr);
      return NextResponse.json(
        { error: txErr.message || "Failed to extend storage" },
        { status: 500, headers: withCORS(req) },
      );
    }

    return NextResponse.json(
      {
        success: true,
        costUSD: Number(finalCost.toFixed(4)),
        costSUI: parseFloat((finalCost / sui).toFixed(8)),
        additionalEpochs,
        totalEpochs: newTotalEpochs,
        additionalDays: additionalEpochs * 14,
        newBalance: updatedUser.balance,
        walrusExtended,
        message: `Storage extended by ${additionalEpochs} epochs (${additionalEpochs * 14} days) on Walrus network`,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Extend duration error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to extend storage duration" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
